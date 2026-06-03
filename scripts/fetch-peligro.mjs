// =============================================================================
// ABEIRO · Fase 1 — Peligro biofísico (pendiente real + combustible aproximado)
// =============================================================================
// Para los 12 núcleos del mapa obtiene y cachea dos insumos del peligro biofísico:
//
//   1) PENDIENTE (dato REAL) — del DEM europeo EU-DEM 25 m vía opentopodata.
//      Se muestrea la cota en el centro y en 4 vecinos (N/S/E/O) a 90 m y se
//      calcula la pendiente por diferencias centradas. Más pendiente => el fuego
//      se propaga más rápido. Cache: data/pendiente_dem.json.
//
//   2) COMBUSTIBLE (APROXIMACIÓN documentada) — cubierta dominante del entorno
//      (800 m) a partir de OSM landuse/natural, ponderada por área, traducida a
//      un nivel de combustibilidad. NO es el mapa de combustible calibrado
//      (Sentinel-2 + LiDAR + fotoguía), que es una fase aparte. Cache:
//      data/combustible_osm.json. Datos © OpenStreetMap (ODbL).
//
// Uso:  node scripts/fetch-peligro.mjs [--force]
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

const OFFSET_M = 90;     // distancia de los vecinos para la pendiente
const RADIO_FUEL_M = 800; // entorno para la cubierta dominante
const UA = "abeiro/1.0 (proteccion incendios; github.com/QuantuSync/abeiro)";
const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Nivel de combustibilidad (0-100) por tipo de cubierta OSM. APROXIMACIÓN.
// Matorral (scrub/heath: toxo, xesta) es lo más inflamable en Galicia; el
// arbolado, alto; pastos, medio; agrícola, bajo; artificial/agua/roca, nulo.
const COMBUSTIBILIDAD = {
  "natural=scrub": 90, "natural=heath": 90,
  "landuse=forest": 80, "natural=wood": 80,
  "natural=grassland": 45, "landuse=meadow": 45, "landuse=grass": 45,
  "landuse=farmland": 25, "landuse=orchard": 25, "landuse=vineyard": 25,
  "landuse=residential": 5, "landuse=industrial": 5, "landuse=quarry": 5,
  "natural=bare_rock": 5, "natural=water": 0, "natural=wetland": 20,
};
const LANDUSE = "forest|meadow|farmland|orchard|vineyard|grass|residential|industrial|quarry";
const NATURAL = "wood|scrub|heath|grassland|bare_rock|water|wetland";

// --- geometría ---------------------------------------------------------------
const rad = Math.PI / 180;
function metrosPorGrado(lat) {
  return { mLat: 111320, mLon: 111320 * Math.cos(lat * rad) };
}
// Área planar aproximada (m²) de un anillo de puntos {lat,lon} alrededor de un centro.
function areaM2(geom, lat0, lon0) {
  const { mLat, mLon } = metrosPorGrado(lat0);
  const pts = geom.map((g) => [(g.lon - lon0) * mLon, (g.lat - lat0) * mLat]);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// --- Overpass con reintentos / fallback --------------------------------------
async function overpass(query) {
  let err;
  for (const url of OVERPASS) {
    for (let i = 1; i <= 2; i++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
          body: new URLSearchParams({ data: query }).toString(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) { err = e; await sleep(2500 * i); }
    }
  }
  throw err;
}

// --- 1) PENDIENTE ------------------------------------------------------------
async function pendientes(nucleos) {
  // Construye centro + 4 vecinos por núcleo (orden: c, n, s, e, o).
  const locs = [];
  for (const n of nucleos) {
    const { mLat, mLon } = metrosPorGrado(n.lat);
    const dLat = OFFSET_M / mLat, dLon = OFFSET_M / mLon;
    locs.push([n.lat, n.lon], [n.lat + dLat, n.lon], [n.lat - dLat, n.lon],
      [n.lat, n.lon + dLon], [n.lat, n.lon - dLon]);
  }
  const url = "https://api.opentopodata.org/v1/eudem25m?locations="
    + locs.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join("|");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`opentopodata HTTP ${res.status}`);
  const j = await res.json();
  if (j.status !== "OK") throw new Error(`opentopodata: ${j.status} ${j.error || ""}`);
  const el = j.results.map((r) => r.elevation);

  const out = {};
  nucleos.forEach((n, i) => {
    const [c, nN, s, e, o] = el.slice(i * 5, i * 5 + 5);
    if ([c, nN, s, e, o].some((v) => v == null)) { out[n.id] = { error: "sin cota" }; return; }
    const dNS = (nN - s) / (2 * OFFSET_M), dEW = (e - o) / (2 * OFFSET_M);
    const grad = Math.sqrt(dNS * dNS + dEW * dEW);
    out[n.id] = {
      nombre: n.nombre,
      cota_m: Math.round(c),
      pendiente_grados: Number((Math.atan(grad) * 180 / Math.PI).toFixed(1)),
      pendiente_pct: Number((grad * 100).toFixed(1)),
    };
  });
  return out;
}

// --- 2) COMBUSTIBLE ----------------------------------------------------------
function consultaCubierta(lat, lon) {
  return `[out:json][timeout:90];(`
    + `way["landuse"~"^(${LANDUSE})$"](around:${RADIO_FUEL_M},${lat},${lon});`
    + `way["natural"~"^(${NATURAL})$"](around:${RADIO_FUEL_M},${lat},${lon});`
    + `);out geom;`;
}
function evaluarCubierta(elements, lat, lon) {
  const areaPorClase = {};
  for (const w of elements) {
    if (!w.geometry || w.geometry.length < 3) continue;
    const clase = w.tags?.landuse ? `landuse=${w.tags.landuse}`
      : w.tags?.natural ? `natural=${w.tags.natural}` : null;
    if (!clase || !(clase in COMBUSTIBILIDAD)) continue;
    areaPorClase[clase] = (areaPorClase[clase] || 0) + areaM2(w.geometry, lat, lon);
  }
  const total = Object.values(areaPorClase).reduce((a, b) => a + b, 0);
  if (total === 0) return { combustibilidad: null, dominante: null, cobertura_clasificada_m2: 0, areas: {} };
  let combustibilidad = 0, dominante = null, maxA = -1;
  for (const [clase, area] of Object.entries(areaPorClase)) {
    combustibilidad += (area / total) * COMBUSTIBILIDAD[clase];
    if (area > maxA) { maxA = area; dominante = clase; }
  }
  const areas = Object.fromEntries(Object.entries(areaPorClase)
    .map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]));
  return {
    combustibilidad: Math.round(combustibilidad),
    dominante,
    cobertura_clasificada_m2: Math.round(total),
    areas,
  };
}

// --- ejecución ---------------------------------------------------------------
const force = process.argv.includes("--force");
const fc = JSON.parse(readFileSync(join(DATA, "nucleos.json"), "utf8"));
const nucleos = fc.features.map((f) => ({
  id: f.properties.id, nombre: f.properties.nombre,
  lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
}));

// --- pendiente ---
const PEND_PATH = join(DATA, "pendiente_dem.json");
let pend;
if (!force && existsSync(PEND_PATH)) {
  pend = JSON.parse(readFileSync(PEND_PATH, "utf8")).nucleos;
  console.log("Pendiente: usando caché.");
} else {
  console.log("Pendiente: consultando opentopodata (EU-DEM 25 m)...");
  pend = await pendientes(nucleos);
  writeFileSync(PEND_PATH, JSON.stringify({
    metadata: { fuente: "EU-DEM 25 m vía opentopodata.org", offset_m: OFFSET_M,
      metodo: "diferencias centradas centro/N-S/E-O" }, nucleos: pend }, null, 2) + "\n", "utf8");
}
for (const n of nucleos) {
  const p = pend[n.id];
  console.log(`  ${n.nombre.padEnd(26)} cota=${p.cota_m ?? "?"}m  pendiente=${p.pendiente_grados ?? "?"}°`);
}

// --- combustible ---
const FUEL_PATH = join(DATA, "combustible_osm.json");
let fuel = {};
if (!force && existsSync(FUEL_PATH)) {
  fuel = JSON.parse(readFileSync(FUEL_PATH, "utf8")).nucleos;
  console.log("\nCombustible: usando caché.");
} else {
  console.log("\nCombustible: consultando Overpass (OSM landuse/natural)...");
  for (const n of nucleos) {
    try {
      const data = await overpass(consultaCubierta(n.lat, n.lon));
      fuel[n.id] = { nombre: n.nombre, radio_m: RADIO_FUEL_M, ...evaluarCubierta(data.elements || [], n.lat, n.lon) };
      const f = fuel[n.id];
      console.log(`  ${n.nombre.padEnd(26)} comb=${f.combustibilidad ?? "?"}  dominante=${f.dominante ?? "—"}`);
      await sleep(1500);
    } catch (e) {
      console.error(`  ${n.nombre.padEnd(26)} ERROR Overpass: ${e.message || e}`);
      fuel[n.id] = { nombre: n.nombre, combustibilidad: null, dominante: null, error: String(e.message || e) };
    }
  }
  writeFileSync(FUEL_PATH, JSON.stringify({
    metadata: {
      fuente: "OpenStreetMap landuse/natural vía Overpass (ODbL). APROXIMACIÓN provisional, "
        + "NO el mapa de combustible calibrado (Sentinel-2 + LiDAR + fotoguía).",
      radio_m: RADIO_FUEL_M, niveles_combustibilidad: COMBUSTIBILIDAD,
    }, nucleos: fuel }, null, 2) + "\n", "utf8");
}

const okP = Object.values(pend).filter((p) => p.cota_m != null).length;
const okF = Object.values(fuel).filter((f) => f.combustibilidad != null).length;
console.log(`\nPendiente OK: ${okP}/12 | Combustible OK: ${okF}/12`);
