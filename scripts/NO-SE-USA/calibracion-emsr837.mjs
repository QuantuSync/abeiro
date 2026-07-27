// =============================================================================
// ABEIRO · Calibración EXPLORATORIA del IV contra el incendio EMSR837
// =============================================================================
// Contrasta el poder discriminante del IV y de sus componentes frente a la
// afectación real del incendio de agosto 2025 (data/nucleos_afectacion_fisica),
// usando dos variables de resultado binarias:
//   - afect_fisica            (dentro del perímetro quemado)
//   - afect_fisica || borde_500m  (dentro o a <=500 m)
//
// ADVERTENCIAS METODOLÓGICAS (imprescindibles, no accesorias):
//   1) n = 12. Cualquier AUC es INESTABLE: se reporta con IC bootstrap y se
//      trata como resultado EXPLORATORIO/ilustrativo, no como validación
//      estadística concluyente. Con afect_fisica solo hay 1 positivo (Freixido),
//      así que su AUC y su bootstrap son casi degenerados; la variante laxa
//      (6 positivos / 6 negativos) es la informativa.
//   2) El IV mide VULNERABILIDAD ante un incendio (quién sufriría si ocurre),
//      NO probabilidad de ignición ni dónde empieza el fuego. Estar dentro del
//      perímetro de UN incendio valida sobre todo la EXPOSICIÓN / peligro
//      biofísico; NO valida la vulnerabilidad SOCIAL (un urbano afectado y una
//      aldea envejecida afectada cuentan igual como "afectado"). Por tanto se
//      espera peligro > IV > social en poder discriminante, y el AUC del IV
//      NO debe leerse como "el índice completo está validado".
//
// Los pesos del IV NO se tocan: la optimización de pesos por AUC es solo
// DIAGNÓSTICA (con LOO para evidenciar el sobreajuste), nunca se adopta.
//
// Uso:  node scripts/calibracion-emsr837.mjs
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auc, aucBootstrap } from "../lib/calibracion.mjs";
import { calcularIV, PESO_CAP, PESO_PELIGRO, PESO_SOCIAL } from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

const N_BOOTSTRAP = 2000;
const PASO = 0.05, MIN_PESO = 0.15, MAX_PESO = 0.60;

// --- carga -------------------------------------------------------------------
const fc = JSON.parse(readFileSync(join(DATA, "nucleos.json"), "utf8"));
const afe = JSON.parse(readFileSync(join(DATA, "nucleos_afectacion_fisica.json"), "utf8")).nucleos;

const nucleos = fc.features.map((f) => {
  const p = f.properties;
  const a = afe[p.id] || {};
  return {
    id: p.id, nombre: p.nombre,
    iv: p.iv, peligro: p.peligro_biofisico, social: p.score_social, cap: p.capacidad_respuesta,
    afect: !!a.afect_fisica,
    afectOBorde: !!(a.afect_fisica || a.borde_500m),
  };
});

// Predictores. capacidad_respuesta se orienta INVERTIDA (más capacidad = menos
// vulnerable): para un AUC comparable "más score = más afectación esperada" se
// evalúa 100 - cap, y se anota la inversión.
const PREDICTORES = [
  { clave: "iv", etiqueta: "IV (índice completo)", get: (n) => n.iv },
  { clave: "peligro_biofisico", etiqueta: "Peligro biofísico", get: (n) => n.peligro },
  { clave: "score_social", etiqueta: "Sensibilidad social", get: (n) => n.social },
  { clave: "capacidad_respuesta_inv", etiqueta: "Capacidad de respuesta (invertida, 100−cap)", get: (n) => 100 - n.cap },
];

const RESULTADOS = [
  { clave: "afect_fisica", etiqueta: "Dentro del perímetro (afect_fisica)", get: (n) => n.afect },
  { clave: "afect_o_borde", etiqueta: "Dentro o a ≤500 m (afect_fisica || borde_500m)", get: (n) => n.afectOBorde },
];

// --- AUC + bootstrap por predictor y resultado -------------------------------
const tabla = {};
for (const r of RESULTADOS) {
  const labels = nucleos.map(r.get);
  const nPos = labels.filter(Boolean).length;
  tabla[r.clave] = { etiqueta: r.etiqueta, n_positivos: nPos, n_negativos: labels.length - nPos, predictores: {} };
  for (const pr of PREDICTORES) {
    const scores = nucleos.map(pr.get);
    const a = auc(scores, labels);
    const boot = aucBootstrap(scores, labels, N_BOOTSTRAP);
    tabla[r.clave].predictores[pr.clave] = {
      etiqueta: pr.etiqueta, auc: a == null ? null : Number(a.toFixed(3)),
      bootstrap_mediana: boot.mediana == null ? null : Number(boot.mediana.toFixed(3)),
      ic95: boot.ic95[0] == null ? null : [Number(boot.ic95[0].toFixed(3)), Number(boot.ic95[1].toFixed(3))],
      bootstrap_validos: boot.n_validos, bootstrap_descartados: boot.n_descartados,
    };
  }
}

// --- optimización DIAGNÓSTICA de pesos (NO se adopta) + LOO -------------------
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
const combos = rejilla();

// Mejor combo por AUC del IV recompuesto, sobre un subconjunto de núcleos.
function mejorPesos(sub, getLabel) {
  const labels = sub.map(getLabel);
  let best = null;
  for (const w of combos) {
    const scores = sub.map((n) => calcularIV(n.peligro, n.social, n.cap, w));
    const a = auc(scores, labels);
    if (a == null) continue;
    if (!best || a > best.auc) best = { auc: a, pesos: w };
  }
  return best;
}

const pesosBase = { peligro: PESO_PELIGRO, social: PESO_SOCIAL, cap: PESO_CAP };
const diagnostico = {};
for (const r of RESULTADOS) {
  const opt = mejorPesos(nucleos, r.get);
  const aucBase = auc(nucleos.map((n) => calcularIV(n.peligro, n.social, n.cap, pesosBase)), nucleos.map(r.get));
  // LOO: re-optimizar dejando cada núcleo fuera; medir cuánto saltan los pesos
  // óptimos y el AUC. Si un solo núcleo mueve mucho el óptimo -> sobreajuste.
  const loo = nucleos.map((_, i) => {
    const sub = nucleos.filter((_, j) => j !== i);
    const m = mejorPesos(sub, r.get);
    return m ? m.pesos : null;
  }).filter(Boolean);
  const prom = (k) => loo.reduce((s, w) => s + w[k], 0) / loo.length;
  const desv = (k) => {
    const m = prom(k);
    return Math.sqrt(loo.reduce((s, w) => s + (w[k] - m) ** 2, 0) / loo.length);
  };
  diagnostico[r.clave] = {
    etiqueta: r.etiqueta,
    auc_pesos_base: aucBase == null ? null : Number(aucBase.toFixed(3)),
    auc_pesos_optimos: opt ? Number(opt.auc.toFixed(3)) : null,
    pesos_optimos_in_sample: opt ? opt.pesos : null,
    loo_pesos_optimos_media: { peligro: Number(prom("peligro").toFixed(2)), social: Number(prom("social").toFixed(2)), cap: Number(prom("cap").toFixed(2)) },
    loo_pesos_optimos_desv: { peligro: Number(desv("peligro").toFixed(2)), social: Number(desv("social").toFixed(2)), cap: Number(desv("cap").toFixed(2)) },
  };
}

// --- salida ------------------------------------------------------------------
const salida = {
  metadata: {
    descripcion: "Calibración EXPLORATORIA del IV y sus componentes contra la afectación "
      + "física del incendio EMSR837 (agosto 2025). AUC (Mann-Whitney) con IC bootstrap.",
    n_nucleos: nucleos.length, n_bootstrap: N_BOOTSTRAP,
    advertencia_n: "n=12: los AUC son INESTABLES y los IC anchos. Resultado exploratorio, "
      + "no validación concluyente. Con afect_fisica solo hay 1 positivo (Freixido).",
    advertencia_concepto: "El IV mide VULNERABILIDAD ante un incendio, no probabilidad de "
      + "ignición. Estar en el perímetro valida sobre todo la EXPOSICIÓN / peligro biofísico; "
      + "NO valida la vulnerabilidad social (necesita otra clase de evidencia). Se espera "
      + "peligro > IV > social en poder discriminante.",
    pesos_no_adoptados: "La optimización de pesos por AUC es solo DIAGNÓSTICA: con n=12 es "
      + "sobreajuste (ver loo_pesos_optimos_desv). Los pesos del índice siguen siendo los "
      + "provisionales declarados; NO se han cambiado.",
    capacidad_invertida: "El predictor 'capacidad_respuesta_inv' es 100−capacidad, para que "
      + "'más score = más afectación esperada' sea comparable con los demás.",
  },
  auc_por_resultado: tabla,
  diagnostico_pesos: diagnostico,
};
writeFileSync(join(DATA, "calibracion_emsr837.json"), JSON.stringify(salida, null, 2) + "\n", "utf8");

// --- resumen por consola -----------------------------------------------------
console.log("CALIBRACIÓN EXPLORATORIA vs EMSR837  (n=12; resultado ilustrativo, IC anchos)\n");
for (const r of RESULTADOS) {
  const t = tabla[r.clave];
  console.log(`== ${t.etiqueta}  (${t.n_positivos} afectados / ${t.n_negativos} no) ==`);
  console.log(`${"predictor".padEnd(44)} AUC    boot.med  IC95`);
  const ordenados = Object.values(t.predictores).sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0));
  for (const p of ordenados) {
    const ic = p.ic95 ? `[${p.ic95[0].toFixed(2)}, ${p.ic95[1].toFixed(2)}]` : "—";
    console.log(`${p.etiqueta.padEnd(44)} ${String(p.auc ?? "—").padStart(5)}  ${String(p.bootstrap_mediana ?? "—").padStart(7)}  ${ic}`);
  }
  const d = diagnostico[r.clave];
  console.log(`  [diagnóstico] AUC pesos base=${d.auc_pesos_base} · AUC pesos óptimos in-sample=${d.auc_pesos_optimos} `
    + `(óptimo ${JSON.stringify(d.pesos_optimos_in_sample)})`);
  console.log(`  [LOO] pesos óptimos media=${JSON.stringify(d.loo_pesos_optimos_media)} desv=${JSON.stringify(d.loo_pesos_optimos_desv)}`);
  console.log(`  -> sobreajuste: el óptimo se pega a social=0.60 (el máximo de la rejilla), lo que`);
  console.log(`     NO tiene sentido para predecir afectación FÍSICA; no se adopta.\n`);
}
console.log("Escrito data/calibracion_emsr837.json");
