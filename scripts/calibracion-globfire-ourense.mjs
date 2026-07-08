// =============================================================================
// ABEIRO · Recalibración del IV contra el historial de incendios (GlobFire)
// =============================================================================
// Con la muestra grande de Ourense (650 núcleos) contrasta el poder discriminante
// del IV y de sus componentes frente a la afectación histórica por incendios
// (GlobFire 2001-2021), y explora una recalibración de pesos con VALIDACIÓN
// CRUZADA para detectar sobreajuste. Los pesos NO se adoptan automáticamente.
//
// Variables de resultado:
//   - afectado_hist        (aldea intersecta un perímetro; buffer 250 m)
//   - afectado_borde_500m  (a <=500 m de un perímetro)
//   - n_afectaciones       (continua; se usa con Spearman)
//
// Predictores: IV, peligro_biofisico, score_social, capacidad_respuesta (inv).
//
// Distinción conceptual (se mantiene): el incendio valida sobre todo la
// EXPOSICIÓN / peligro biofísico, no la vulnerabilidad social. Con muchos
// incendios la señal del peligro debería reforzarse frente al piloto (n=12).
//
// Salida: data/calibracion_globfire_ourense.json + resumen. Uso:
//   node scripts/calibracion-globfire-ourense.mjs
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auc, aucBootstrap, spearman, rng } from "../lib/calibracion.mjs";
import { calcularIV, PESO_CAP, PESO_PELIGRO, PESO_SOCIAL } from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const N_BOOT = 2000, K_FOLD = 5;
const PASO = 0.05, MIN_PESO = 0.15, MAX_PESO = 0.60;

const fc = JSON.parse(readFileSync(join(DATA, "nucleos_ourense.json"), "utf8"));
const afe = JSON.parse(readFileSync(join(DATA, "afectacion_globfire_ourense.json"), "utf8")).nucleos;

const nucleos = fc.features
  .filter((f) => f.properties.activo && f.properties.iv != null && afe[f.properties.id])
  .map((f) => {
    const p = f.properties, a = afe[p.id];
    return {
      iv: p.iv, peligro: p.peligro_biofisico, social: p.score_social, cap: p.capacidad_respuesta,
      afect: !!a.afectado_hist, borde: !!a.afectado_borde_500m, n: a.n_afectaciones,
    };
  });
console.log(`Núcleos con IV y afectación: ${nucleos.length}`);

const PREDICTORES = [
  { clave: "iv", etiqueta: "IV (índice completo)", get: (n) => n.iv },
  { clave: "peligro_biofisico", etiqueta: "Peligro biofísico", get: (n) => n.peligro },
  { clave: "score_social", etiqueta: "Sensibilidad social", get: (n) => n.social },
  { clave: "capacidad_respuesta_inv", etiqueta: "Capacidad de respuesta (100−cap)", get: (n) => 100 - n.cap },
];
const RESULTADOS = [
  { clave: "afectado_hist", etiqueta: "Afectado (buffer 250 m)", get: (n) => n.afect },
  { clave: "afectado_borde_500m", etiqueta: "Borde <=500 m", get: (n) => n.borde },
];

// --- AUC + bootstrap por predictor y resultado binario ------------------------
const tabla = {};
for (const r of RESULTADOS) {
  const labels = nucleos.map(r.get), nPos = labels.filter(Boolean).length;
  tabla[r.clave] = { etiqueta: r.etiqueta, n_positivos: nPos, n_negativos: labels.length - nPos, predictores: {} };
  for (const pr of PREDICTORES) {
    const scores = nucleos.map(pr.get);
    const a = auc(scores, labels), boot = aucBootstrap(scores, labels, N_BOOT);
    tabla[r.clave].predictores[pr.clave] = {
      etiqueta: pr.etiqueta,
      auc: a == null ? null : Number(a.toFixed(3)),
      ic95: boot.ic95[0] == null ? null : [Number(boot.ic95[0].toFixed(3)), Number(boot.ic95[1].toFixed(3))],
    };
  }
}

// --- Spearman vs n_afectaciones (continua) -----------------------------------
const spear = {};
const nAf = nucleos.map((n) => n.n);
for (const pr of PREDICTORES) {
  const rho = spearman(nucleos.map(pr.get), nAf);
  spear[pr.clave] = { etiqueta: pr.etiqueta, spearman: rho == null ? null : Number(rho.toFixed(3)) };
}

// --- Recalibración de pesos con validación cruzada (k-fold) -------------------
function rejilla() {
  const combos = [];
  for (let p = Math.round(MIN_PESO * 100); p <= MAX_PESO * 100; p += PASO * 100)
    for (let s = Math.round(MIN_PESO * 100); s <= MAX_PESO * 100; s += PASO * 100) {
      const c = 100 - p - s;
      if (c >= MIN_PESO * 100 && c <= MAX_PESO * 100)
        combos.push({ peligro: p / 100, social: s / 100, cap: c / 100 });
    }
  return combos;
}
// Particiones k-fold deterministas (barajado reproducible).
function folds(n, k) {
  const idx = [...Array(n).keys()], azar = rng(20260708);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.reduce((acc, v, i) => { (acc[i % k] ||= []).push(v); return acc; }, []);
}
function aucPesos(sub, w, getLabel) {
  return auc(sub.map((n) => calcularIV(n.peligro, n.social, n.cap, w)), sub.map(getLabel));
}

const combos = rejilla();
const pesosBase = { peligro: PESO_PELIGRO, social: PESO_SOCIAL, cap: PESO_CAP };
const cv = {};
for (const r of RESULTADOS) {
  const part = folds(nucleos.length, K_FOLD);
  // AUC de validación media por combo (entrena en k-1 folds, evalúa en el otro).
  let mejor = null;
  for (const w of combos) {
    let sumaVal = 0, nVal = 0;
    for (let f = 0; f < K_FOLD; f++) {
      const val = part[f].map((i) => nucleos[i]);
      const a = aucPesos(val, w, r.get);
      if (a != null) { sumaVal += a; nVal++; }
    }
    if (!nVal) continue;
    const valAuc = sumaVal / nVal;
    if (!mejor || valAuc > mejor.valAuc) mejor = { w, valAuc };
  }
  const aucBaseFull = aucPesos(nucleos, pesosBase, r.get);
  const aucOptFull = mejor ? aucPesos(nucleos, mejor.w, r.get) : null;
  cv[r.clave] = {
    etiqueta: r.etiqueta,
    auc_pesos_base: aucBaseFull == null ? null : Number(aucBaseFull.toFixed(3)),
    pesos_optimos_cv: mejor ? mejor.w : null,
    auc_val_optimos: mejor ? Number(mejor.valAuc.toFixed(3)) : null,
    auc_train_optimos: aucOptFull == null ? null : Number(aucOptFull.toFixed(3)),
    gap_sobreajuste: (mejor && aucOptFull != null) ? Number((aucOptFull - mejor.valAuc).toFixed(3)) : null,
  };
}

const salida = {
  metadata: {
    descripcion: "Recalibración exploratoria del IV contra la afectación histórica GlobFire "
      + "(2001-2021) en Ourense. AUC (Mann-Whitney) con IC bootstrap; Spearman vs "
      + "n_afectaciones; recalibración de pesos con validación cruzada " + K_FOLD + "-fold.",
    n_nucleos: nucleos.length, n_bootstrap: N_BOOT, k_fold: K_FOLD,
    advertencia_concepto: "El IV mide VULNERABILIDAD, no ignición. El incendio valida sobre "
      + "todo el PELIGRO biofísico (exposición); la vulnerabilidad social necesita otra "
      + "evidencia. Con n grande el IC es estrecho: ese es el salto de valor frente al piloto.",
    fuente_resultado: "GlobFire MODIS ~500 m: proxy de grandes incendios, no registro oficial "
      + "de la Xunta. Se descartaron perímetros con geometría degenerada (ver afectacion_*).",
    pesos_no_adoptados: "La recalibración por CV es una RECOMENDACIÓN fundamentada, NO se "
      + "adopta: los pesos del índice siguen siendo los provisionales declarados. La decisión "
      + "queda para revisión humana (ver gap_sobreajuste: train − validación).",
    pesos_base: pesosBase,
  },
  auc_binario: tabla,
  spearman_n_afectaciones: spear,
  recalibracion_cv: cv,
};
writeFileSync(join(DATA, "calibracion_globfire_ourense.json"), JSON.stringify(salida, null, 2) + "\n", "utf8");

// --- resumen ------------------------------------------------------------------
console.log("\nRECALIBRACIÓN vs GlobFire (n=" + nucleos.length + ")\n");
for (const r of RESULTADOS) {
  const t = tabla[r.clave];
  console.log(`== ${t.etiqueta}  (${t.n_positivos} afectados / ${t.n_negativos} no) ==`);
  console.log(`${"predictor".padEnd(34)} AUC    IC95`);
  for (const p of Object.values(t.predictores).sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0))) {
    const ic = p.ic95 ? `[${p.ic95[0].toFixed(2)}, ${p.ic95[1].toFixed(2)}]` : "—";
    console.log(`${p.etiqueta.padEnd(34)} ${String(p.auc ?? "—").padStart(5)}  ${ic}`);
  }
  const c = cv[r.clave];
  console.log(`  [CV ${K_FOLD}-fold] base=${c.auc_pesos_base} · óptimo val=${c.auc_val_optimos} train=${c.auc_train_optimos} `
    + `gap=${c.gap_sobreajuste} · pesos óptimos=${JSON.stringify(c.pesos_optimos_cv)}\n`);
}
console.log("Spearman vs n_afectaciones:");
for (const p of Object.values(spear).sort((a, b) => Math.abs(b.spearman ?? 0) - Math.abs(a.spearman ?? 0)))
  console.log(`  ${p.etiqueta.padEnd(34)} rho=${p.spearman}`);
console.log("\nEscrito data/calibracion_globfire_ourense.json");
