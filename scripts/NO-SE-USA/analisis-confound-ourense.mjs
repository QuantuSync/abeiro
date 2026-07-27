// =============================================================================
// ABEIRO · Análisis del CONFOUND ESPACIAL de la calibración (Ourense)
// =============================================================================
// La calibración (Fase 4) mostró que la CAPACIDAD de respuesta predice la
// afectación por incendios (AUC ~0.73) mejor que el PELIGRO biofísico (~0.61).
// Este script comprueba si es un CONFOUND ESPACIAL: los componentes del IV
// correlacionan con "estar en el monte / paisaje rural expuesto", que es donde
// arde, no con la vulnerabilidad humana. Mide, no solo afirma:
//
//   1. AUC de la covariable de EXPOSICIÓN (frac_monte de WorldCover, y distancia
//      al núcleo urbano) SOLA frente a afectado_hist. Si iguala/supera a los
//      componentes del IV, la afectación la manda la geografía del paisaje.
//   2. Correlación (Spearman) de cada componente del IV con la exposición.
//   3. AUC de los componentes ESTRATIFICADO por tercil de exposición: si el
//      poder predictivo se desvanece al controlar por exposición, confirma el
//      confound.
//
// Salida: data/confound_ourense.json + resumen. Uso:
//   node scripts/analisis-confound-ourense.mjs
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auc, spearman } from "../lib/calibracion.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const cargar = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const fc = cargar("nucleos_ourense.json");
const afe = cargar("afectacion_globfire_ourense.json").nucleos;
const expo = cargar("exposicion_ourense.json").nucleos;

const nucleos = fc.features
  .filter((f) => f.properties.activo && f.properties.iv != null && afe[f.properties.id] && expo[f.properties.id])
  .map((f) => {
    const p = f.properties, a = afe[p.id];
    return {
      iv: p.iv, peligro: p.peligro_biofisico, social: p.score_social, capInv: 100 - p.capacidad_respuesta,
      afect: !!a.afectado_hist,
      frac_monte: expo[p.id].frac_monte,
      dist_urbano: p.distancia_servicios_km,
    };
  });
console.log(`Núcleos con IV, afectación y exposición: ${nucleos.length}`);

const labels = nucleos.map((n) => n.afect);
const COMPONENTES = [
  { clave: "peligro_biofisico", etiqueta: "Peligro biofísico", get: (n) => n.peligro },
  { clave: "score_social", etiqueta: "Sensibilidad social", get: (n) => n.social },
  { clave: "capacidad_respuesta_inv", etiqueta: "Capacidad (100−cap)", get: (n) => n.capInv },
  { clave: "iv", etiqueta: "IV (índice)", get: (n) => n.iv },
];
const EXPOSICION = [
  { clave: "frac_monte", etiqueta: "Fracción de monte (WorldCover)", get: (n) => n.frac_monte },
  { clave: "dist_urbano", etiqueta: "Distancia a núcleo urbano (km)", get: (n) => n.dist_urbano },
];

// --- 1) AUC de la exposición sola vs afectado --------------------------------
const aucExpo = {};
for (const e of EXPOSICION) aucExpo[e.clave] = { etiqueta: e.etiqueta, auc: Number(auc(nucleos.map(e.get), labels).toFixed(3)) };
const aucComp = {};
for (const c of COMPONENTES) aucComp[c.clave] = { etiqueta: c.etiqueta, auc: Number(auc(nucleos.map(c.get), labels).toFixed(3)) };

// --- 2) Correlación componente ↔ exposición ----------------------------------
const corr = {};
for (const c of COMPONENTES) {
  corr[c.clave] = { etiqueta: c.etiqueta };
  for (const e of EXPOSICION) {
    corr[c.clave][e.clave] = Number(spearman(nucleos.map(c.get), nucleos.map(e.get)).toFixed(3));
  }
}

// --- 3) AUC estratificado por tercil de exposición (frac_monte) --------------
// Si al controlar por exposición (dentro de cada tercil) el AUC de los
// componentes cae hacia 0.5, su poder venía del confound, no de la variable.
const orden = [...nucleos].sort((a, b) => a.frac_monte - b.frac_monte);
const t = Math.floor(orden.length / 3);
const terciles = [orden.slice(0, t), orden.slice(t, 2 * t), orden.slice(2 * t)];
const estratificado = {};
for (const c of COMPONENTES) {
  const porTercil = terciles.map((g) => {
    const a = auc(g.map(c.get), g.map((n) => n.afect));
    return a == null ? null : Number(a.toFixed(3));
  });
  const validos = porTercil.filter((x) => x != null);
  estratificado[c.clave] = {
    etiqueta: c.etiqueta,
    auc_global: aucComp[c.clave].auc,
    auc_por_tercil_monte: porTercil,
    auc_medio_intra_tercil: validos.length ? Number((validos.reduce((s, x) => s + x, 0) / validos.length).toFixed(3)) : null,
  };
}

const salida = {
  metadata: {
    descripcion: "Análisis del confound espacial: ¿la afectación por incendios la explica la "
      + "exposición del paisaje (monte) más que la vulnerabilidad? AUC de exposición sola, "
      + "correlación componentes↔exposición, y AUC estratificado por tercil de monte.",
    n_nucleos: nucleos.length, n_afectados: labels.filter(Boolean).length,
    lectura: "Si la exposición sola iguala/supera a los componentes y su correlación con "
      + "capacidad/peligro es alta, y el AUC intra-tercil cae hacia 0.5, la afectación la "
      + "manda la geografía del paisaje (ignición/exposición), no la vulnerabilidad social. "
      + "Por eso NO se recalibran los pesos con GlobFire y la validación social requiere otra "
      + "variable de resultado (impacto humano: evacuaciones/confinamientos, p. ej. AXEGA).",
  },
  auc_exposicion_sola: aucExpo,
  auc_componentes: aucComp,
  correlacion_componente_exposicion: corr,
  auc_estratificado_por_monte: estratificado,
};
writeFileSync(join(DATA, "confound_ourense.json"), JSON.stringify(salida, null, 2) + "\n", "utf8");

// --- resumen ------------------------------------------------------------------
console.log(`\nCONFOUND ESPACIAL (n=${nucleos.length}, ${labels.filter(Boolean).length} afectados)\n`);
console.log("AUC vs afectado_hist:");
for (const e of Object.values(aucExpo)) console.log(`  [exposición] ${e.etiqueta.padEnd(34)} AUC=${e.auc}`);
for (const c of Object.values(aucComp)) console.log(`  [componente] ${c.etiqueta.padEnd(34)} AUC=${c.auc}`);
console.log("\nCorrelación (Spearman) componente ↔ exposición:");
for (const c of Object.values(corr))
  console.log(`  ${c.etiqueta.padEnd(22)} frac_monte=${c.frac_monte}  dist_urbano=${c.dist_urbano}`);
console.log("\nAUC estratificado por tercil de monte (global -> [bajo, medio, alto] -> medio intra):");
for (const s of Object.values(estratificado))
  console.log(`  ${s.etiqueta.padEnd(22)} global=${s.auc_global} -> ${JSON.stringify(s.auc_por_tercil_monte)} -> ${s.auc_medio_intra_tercil}`);
console.log("\nEscrito data/confound_ourense.json");
