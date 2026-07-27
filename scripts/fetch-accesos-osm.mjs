//DONDE??? pipeline de Valdeorras, alimenta nucleos.json

// =============================================================================
// ABEIRO · Fase 1 — Red viaria OSM para la capacidad de respuesta
// =============================================================================
// Para cada uno de los 12 núcleos del mapa consulta la Overpass API y cuenta el
// número de VÍAS DE SALIDA: carreteras transitables que conectan el núcleo con el
// exterior, medidas como el nº de veces que una vía cruza el círculo de radio R
// alrededor del centro del núcleo (cada cruce = una salida).
//
// Clases highway consideradas: primary, secondary, tertiary, unclassified,
// residential, track.
//
// El resultado se cachea en data/accesos_osm.json para no depender de la API en
// cada build y mantener la reproducibilidad. Datos © OpenStreetMap (ODbL).
//
// Uso:  node scripts/fetch-accesos-osm.mjs            (usa caché si existe)
//       node scripts/fetch-accesos-osm.mjs --force    (re-consulta Overpass)
//       node scripts/fetch-accesos-osm.mjs --extracto (SIN red: cuenta las
//         salidas desde el extracto local data/osm_valdeorras.json, el mismo
//         que usa scripts/evacuacion_osm.py; útil cuando Overpass no responde)
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const SALIDA = join(DATA, "accesos_osm.json");

const RADIO_M = 1000; // radio del círculo cuyas intersecciones contamos como salidas
const CLASES = ["primary", "secondary", "tertiary", "unclassified", "residential", "track"];
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "abeiro/1.0 (proteccion incendios; github.com/QuantuSync/abeiro)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Distancia haversine en metros.
function distM(aLat, aLon, bLat, bLon) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function consulta(lat, lon) {
  const clases = CLASES.join("|");
  return `[out:json][timeout:60];`
    + `way["highway"~"^(${clases})$"](around:${RADIO_M},${lat},${lon});`
    + `out geom;`;
}

async function overpass(query) {
  let ultimoError;
  for (const url of ENDPOINTS) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.timeout(90_000), // un mirror colgado no debe bloquear el script
        });
        if (res.status === 429 || res.status === 504) { // límite/timeout: espera y reintenta
          await sleep(4000 * intento);
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        ultimoError = e;
        await sleep(1500 * intento);
      }
    }
  }
  throw ultimoError;
}

// Cuenta cruces del círculo de radio R por las vías (segmentos que pasan de
// dentro a fuera). Devuelve total y desglose por tipo de vía.
function contarSalidas(elements, lat, lon) {
  let total = 0;
  let viasQueCruzan = 0;
  const porTipo = {};
  for (const w of elements) {
    if (w.type !== "way" || !w.geometry) continue;
    const tipo = w.tags?.highway || "otro";
    const pts = w.geometry.map((g) => distM(lat, lon, g.lat, g.lon) <= RADIO_M);
    let cruces = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i] !== pts[i - 1]) cruces++;
    if (cruces > 0) {
      total += cruces;
      viasQueCruzan++;
      porTipo[tipo] = (porTipo[tipo] || 0) + cruces;
    }
  }
  return { vias_salida: total, vias_que_cruzan: viasQueCruzan, por_tipo: porTipo };
}

// --- ejecución ---------------------------------------------------------------

const usarExtracto = process.argv.includes("--extracto");
const usarCache = !process.argv.includes("--force") && !usarExtracto;
const fc = JSON.parse(readFileSync(join(DATA, "nucleos.json"), "utf8"));
const nucleos = fc.features.map((f) => ({
  id: f.properties.id,
  nombre: f.properties.nombre,
  lon: f.geometry.coordinates[0],
  lat: f.geometry.coordinates[1],
}));

// Modo SIN RED: extracto local (mismo fichero que usa evacuacion_osm.py). Se
// filtran las clases de vía consideradas y los ways a <= RADIO_M + margen.
let extracto = null;
if (usarExtracto) {
  const EXTRACTO = join(DATA, "osm_valdeorras.json");
  if (!existsSync(EXTRACTO)) {
    console.error("ERROR: no existe data/osm_valdeorras.json. Ejecuta antes "
      + "scripts/evacuacion_osm.py (descarga el extracto) o usa Overpass sin --extracto.");
    process.exit(1);
  }
  extracto = JSON.parse(readFileSync(EXTRACTO, "utf8")).elements
    .filter((w) => w.type === "way" && w.geometry && CLASES.includes(w.tags?.highway));
  console.log(`Modo extracto local: ${extracto.length} vías candidatas.`);
}

// Vías del extracto con algún vértice cerca del núcleo (preselección barata).
function viasCerca(lat, lon) {
  return extracto.filter((w) =>
    w.geometry.some((g) => distM(lat, lon, g.lat, g.lon) <= RADIO_M * 2));
}

let cachePrevio = {};
if (usarCache && existsSync(SALIDA)) {
  cachePrevio = JSON.parse(readFileSync(SALIDA, "utf8")).nucleos || {};
}

const resultados = {};
const errores = [];

for (const n of nucleos) {
  if (usarCache && cachePrevio[n.id]) {
    resultados[n.id] = cachePrevio[n.id];
    console.log(`${n.nombre.padEnd(26)} (caché)  vias_salida=${cachePrevio[n.id].vias_salida}`);
    continue;
  }
  try {
    const elements = usarExtracto
      ? viasCerca(n.lat, n.lon)
      : (await overpass(consulta(n.lat, n.lon))).elements || [];
    const r = contarSalidas(elements, n.lat, n.lon);
    resultados[n.id] = { nombre: n.nombre, lat: n.lat, lon: n.lon, radio_m: RADIO_M, ...r };
    console.log(`${n.nombre.padEnd(26)} vias_salida=${r.vias_salida}  (vias=${r.vias_que_cruzan})  ${JSON.stringify(r.por_tipo)}`);
    if (!usarExtracto) await sleep(1500); // cortesía con la API pública
  } catch (e) {
    errores.push({ id: n.id, nombre: n.nombre, error: String(e.message || e) });
    console.error(`${n.nombre.padEnd(26)} ERROR: ${e.message || e}`);
  }
}

if (errores.length) {
  console.error(`\n${errores.length} núcleo(s) fallaron en Overpass.`);
  // No sobrescribe la caché si hubo fallos y no se obtuvieron todos.
  if (Object.keys(resultados).length < nucleos.length) {
    console.error("No se actualiza la caché completa. Considera reintentar o usar extracto local de OSM.");
    process.exit(1);
  }
}

const salida = {
  metadata: {
    fuente: usarExtracto
      ? "OpenStreetMap, extracto local data/osm_valdeorras.json (bbox Valdeorras, ODbL)."
      : "OpenStreetMap vía Overpass API (ODbL).",
    indicador: "vias_salida = nº de cruces de vías transitables con el círculo de radio R "
      + "alrededor del centro del núcleo (cada cruce = una salida).",
    radio_m: RADIO_M,
    clases_highway: CLASES,
  },
  nucleos: resultados,
};
writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n", "utf8");
console.log(`\nEscrito ${SALIDA} (${Object.keys(resultados).length}/${nucleos.length} núcleos).`);
