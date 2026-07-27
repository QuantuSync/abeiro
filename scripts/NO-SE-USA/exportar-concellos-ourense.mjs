//CREAR GEOJSONS QUE YA NO SE USAN

// Agrega los núcleos activos por concello para la vista provincial (coropleta +
// drill-down) del mapa de Ourense. Produce public/concellos_ourense.geojson con
// el IV medio, nº de núcleos y afectados por concello, con la geometría
// simplificada (Douglas-Peucker) para que el render sea ligero.
// Uso:  node scripts/exportar-concellos-ourense.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const PUBLIC = join(DIR, "..", "public");
const cargar = (f, base = DATA) => JSON.parse(readFileSync(join(base, f), "utf8"));

const lim = cargar("limites_concellos_ourense.geojson");
const fc = cargar("nucleos_ourense.json");
const afe = cargar("afectacion_globfire_ourense.json").nucleos;

// Agregados por codmun (5 dígitos).
const agg = {};
for (const f of fc.features) {
  const p = f.properties;
  if (!p.activo || p.iv == null) continue;
  const a = (agg[p.codmun] ||= { ivs: [], pob: 0, afect: 0, n: 0 });
  a.ivs.push(p.iv); a.pob += p.poblacion; a.n++;
  if (afe[p.id]?.afectado_hist) a.afect++;
}

// Douglas-Peucker sobre un anillo [ [lon,lat], ... ].
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const d2 = (p, a, b) => {
    const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0;
    const px = x1 + t * dx, py = y1 + t * dy;
    return (x - px) ** 2 + (y - py) ** 2;
  };
  const simplifica = (ini, fin) => {
    let idx = -1, max = 0;
    for (let i = ini + 1; i < fin; i++) {
      const d = d2(pts[i], pts[ini], pts[fin]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol * tol && idx !== -1) {
      return [...simplifica(ini, idx).slice(0, -1), ...simplifica(idx, fin)];
    }
    return [pts[ini], pts[fin]];
  };
  return simplifica(0, pts.length - 1);
}

const TOL = 0.0015; // ~150 m, suficiente para la vista provincial
const features = [];
for (const f of lim.features) {
  const codmun = f.properties.codmun.replace(/\D/g, "").slice(0, 5);
  const a = agg[codmun];
  if (!a) continue; // concello sin núcleos activos (raro)
  const ivMedio = Math.round(a.ivs.reduce((s, x) => s + x, 0) / a.ivs.length);
  const anillos = f.geometry.coordinates.map((an) => dp(an, TOL)).filter((an) => an.length >= 4);
  features.push({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: anillos },
    properties: {
      codmun, concello: f.properties.nombre,
      iv_medio: ivMedio, n_nucleos: a.n, n_afectados: a.afect, poblacion: a.pob,
    },
  });
}

writeFileSync(join(PUBLIC, "concellos_ourense.geojson"),
  JSON.stringify({ type: "FeatureCollection", features }) + "\n", "utf8");
console.log(`Escrito public/concellos_ourense.geojson (${features.length} concellos)`);
