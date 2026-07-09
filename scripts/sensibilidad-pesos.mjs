// =============================================================================
// ABEIRO · Análisis de sensibilidad de los pesos del IV
// =============================================================================
// Los pesos del IV son PROVISIONALES (no calibrados). Este script mide cuánto
// dependen los resultados de esa elección: barre una rejilla de pesos
// (paso 0.05, cada peso en [0.15, 0.60], suma = 1) y para cada combinación
// recalcula el IV de los 12 núcleos desde sus componentes.
//
// Emite por núcleo:
//   (a) frecuencia con la que cambia de categoría respecto a los pesos actuales
//   (b) rango [min, max] de IV a través de todas las combinaciones
// y para el conjunto:
//   (c) estabilidad del ranking (correlación de Spearman media contra el base).
//
// Salida: data/sensibilidad_pesos.json + resumen por consola. El resultado se
// incorpora a nucleos.json (rango_iv por núcleo) al re-ejecutar procesar-ige.mjs.
//
// Uso:  node scripts/sensibilidad-pesos.mjs
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { calcularIV, PESO_CAP, PESO_PELIGRO, PESO_SOCIAL } from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

const PASO = 0.05;
const MIN_PESO = 0.15;
const MAX_PESO = 0.60;

// Categoría del IV (bordes idénticos a lib/vulnerabilidad.ts).
const categoria = (iv) => (iv >= 80 ? "muy-alta" : iv >= 60 ? "alta" : iv >= 40 ? "media" : iv >= 20 ? "baja" : "muy-baja");

// --- rejilla de pesos (suman 1, cada uno en [MIN_PESO, MAX_PESO]) -------------
function rejilla() {
  const combos = [];
  // Se itera en centésimas para evitar errores de coma flotante.
  for (let p = Math.round(MIN_PESO * 100); p <= MAX_PESO * 100; p += PASO * 100) {
    for (let s = Math.round(MIN_PESO * 100); s <= MAX_PESO * 100; s += PASO * 100) {
      const c = 100 - p - s;
      if (c >= MIN_PESO * 100 && c <= MAX_PESO * 100) {
        combos.push({ peligro: p / 100, social: s / 100, cap: c / 100 });
      }
    }
  }
  return combos;
}

// Correlación de Spearman entre dos rankings dados como arrays de IV (mismo orden
// de núcleos). Con empates usa el rango promedio.
function spearman(a, b) {
  const rangos = (v) => {
    const orden = v.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]);
    const r = new Array(v.length);
    let i = 0;
    while (i < orden.length) {
      let j = i;
      while (j + 1 < orden.length && orden[j + 1][0] === orden[i][0]) j++;
      const rango = (i + j) / 2 + 1; // rango promedio para empates
      for (let k = i; k <= j; k++) r[orden[k][1]] = rango;
      i = j + 1;
    }
    return r;
  };
  const ra = rangos(a), rb = rangos(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 1;
}

// --- ejecución ----------------------------------------------------------------
const fc = JSON.parse(readFileSync(join(DATA, "nucleos.json"), "utf8"));
const nucleos = fc.features.map((f) => ({
  id: f.properties.id,
  nombre: f.properties.nombre,
  peligro: f.properties.peligro_biofisico,
  social: f.properties.score_social,
  cap: f.properties.capacidad_respuesta,
}));

const pesosBase = { peligro: PESO_PELIGRO, social: PESO_SOCIAL, cap: PESO_CAP };
const ivBase = nucleos.map((n) => calcularIV(n.peligro, n.social, n.cap, pesosBase));
const catBase = ivBase.map(categoria);

const combos = rejilla();
const stats = nucleos.map(() => ({ min: 101, max: -1, cambios: 0 }));
let sumaSpearman = 0;

for (const pesos of combos) {
  const ivs = nucleos.map((n) => calcularIV(n.peligro, n.social, n.cap, pesos));
  ivs.forEach((iv, i) => {
    const s = stats[i];
    if (iv < s.min) s.min = iv;
    if (iv > s.max) s.max = iv;
    if (categoria(iv) !== catBase[i]) s.cambios++;
  });
  sumaSpearman += spearman(ivBase, ivs);
}

const spearmanMedio = sumaSpearman / combos.length;

const porNucleo = {};
nucleos.forEach((n, i) => {
  porNucleo[n.id] = {
    nombre: n.nombre,
    iv_base: ivBase[i],
    categoria_base: catBase[i],
    rango_iv: [stats[i].min, stats[i].max],
    frecuencia_cambio_categoria: Number((stats[i].cambios / combos.length).toFixed(3)),
  };
});

const salida = {
  metadata: {
    descripcion: "Análisis de sensibilidad de los pesos del IV: rejilla de pesos "
      + "(paso " + PASO + ", cada peso en [" + MIN_PESO + ", " + MAX_PESO + "], suma 1) y "
      + "recálculo del IV desde las componentes de cada núcleo.",
    pesos_base: pesosBase,
    n_combinaciones: combos.length,
    spearman_medio: Number(spearmanMedio.toFixed(4)),
    lectura: "spearman_medio cercano a 1 = el RANKING apenas depende de los pesos "
      + "elegidos; frecuencia_cambio_categoria alta en un núcleo = su categoría es "
      + "sensible a los pesos y debe leerse con cautela.",
  },
  nucleos: porNucleo,
};

writeFileSync(join(DATA, "sensibilidad_pesos.json"), JSON.stringify(salida, null, 2) + "\n", "utf8");

console.log(`Combinaciones de pesos evaluadas: ${combos.length} (paso ${PASO}, rango [${MIN_PESO}, ${MAX_PESO}])`);
console.log(`Spearman medio del ranking vs. pesos base: ${spearmanMedio.toFixed(4)}`);
console.log(`\n${"núcleo".padEnd(26)} IV_base  rango IV     cambia de categoría`);
for (const n of Object.values(porNucleo).sort((a, b) => b.iv_base - a.iv_base)) {
  console.log(
    `${n.nombre.padEnd(26)} ${String(n.iv_base).padStart(5)}   [${String(n.rango_iv[0]).padStart(3)}, ${String(n.rango_iv[1]).padStart(3)}]   `
    + `${(n.frecuencia_cambio_categoria * 100).toFixed(0)}% de las combinaciones`
  );
}
console.log("\nEscrito data/sensibilidad_pesos.json");
