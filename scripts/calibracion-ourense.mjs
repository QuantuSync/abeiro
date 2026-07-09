// =============================================================================
// ABEIRO · Calibración del IV parametrizada por variable de resultado (Ourense)
// =============================================================================
// Misma maquinaria (AUC Mann-Whitney, IC bootstrap, Spearman, validación cruzada
// de pesos) corriendo contra CUALQUIER variable de resultado:
//   - "globfire"   (por defecto): afectación por área quemada GlobFire (mide
//                  EXPOSICIÓN del paisaje). data/afectacion_globfire_ourense.json.
//   - "evacuacion": impacto humano (evacuaciones/confinamientos, p. ej. AXEGA),
//                  que valida la VULNERABILIDAD SOCIAL. Requiere haber ejecutado
//                  antes scripts/ingesta-evacuaciones.mjs
//                  (produce data/evacuacion_resultado_ourense.json).
//
// Uso:  node scripts/calibracion-ourense.mjs [globfire|evacuacion]
// =============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { auc, aucBootstrap, spearman, rng } from "../lib/calibracion.mjs";
import { calcularIV, PESO_CAP, PESO_PELIGRO, PESO_SOCIAL } from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const N_BOOT = 2000, K_FOLD = 5, PASO = 0.05, MIN_PESO = 0.15, MAX_PESO = 0.60;

// --- fuentes de variable de resultado (parametrizable) ------------------------
const FUENTES = {
  globfire: {
    fichero: "afectacion_globfire_ourense.json",
    salida: "calibracion_globfire_ourense.json",
    etiqueta: "afectación GlobFire (2001-2021, exposición del paisaje)",
    binarias: [
      { clave: "afectado_hist", etiqueta: "Afectado (buffer 250 m)", campo: "afectado_hist" },
      { clave: "afectado_borde_500m", etiqueta: "Borde <=500 m", campo: "afectado_borde_500m" },
    ],
    continua: "n_afectaciones",
    valida: "EXPOSICIÓN/localización, no vulnerabilidad social (ver confound_ourense.json).",
    // Metadata conceptual rica volcada al JSON versionado (no perder la interpretación).
    extra: {
      advertencia_concepto: "El IV mide VULNERABILIDAD, no ignición. El incendio valida sobre "
        + "todo la EXPOSICIÓN/localización del paisaje (aislamiento), NO la vulnerabilidad social "
        + "(ver confound_ourense.json). Con n grande el IC es estrecho: ese es el salto de valor "
        + "frente al piloto (n=12).",
      confound: "El mejor predictor es la capacidad de respuesta invertida (~0.73), no el peligro "
        + "(~0.61). No es causal: es confound espacial de AISLAMIENTO (los núcleos aislados, con "
        + "pocas salidas, caen en zona de grandes incendios). La fracción de monte sola no predice "
        + "(AUC 0.42) y estratificar por monte no elimina el poder de los componentes; el eje es la "
        + "distancia a lo urbano. Ver data/confound_ourense.json.",
      fuente_resultado: "GlobFire MODIS ~500 m: proxy de grandes incendios, no registro oficial "
        + "de la Xunta. Se descartaron 43 perímetros con geometría degenerada (ver afectacion_*).",
    },
  },
  evacuacion: {
    fichero: "evacuacion_resultado_ourense.json",
    salida: "calibracion_evacuacion_ourense.json",
    etiqueta: "evacuaciones/confinamientos (impacto humano, p. ej. AXEGA)",
    binarias: [{ clave: "evacuado_hist", etiqueta: "Evacuado/confinado alguna vez", campo: "evacuado_hist" }],
    continua: "n_evacuaciones",
    valida: "IMPACTO HUMANO: es la variable que SÍ permite validar la vulnerabilidad social.",
    extra: {
      fuente_resultado: "Evacuaciones/confinamientos (decisión humana de emergencia). A diferencia "
        + "de GlobFire (exposición del paisaje), es la variable de resultado que permite validar la "
        + "componente SOCIAL del índice.",
    },
  },
};

const which = process.argv[2] || "globfire";
const cfg = FUENTES[which];
if (!cfg) { console.error(`Resultado desconocido: ${which}. Usa 'globfire' o 'evacuacion'.`); process.exit(1); }
const rutaRes = join(DATA, cfg.fichero);
if (!existsSync(rutaRes)) {
  console.error(`No existe data/${cfg.fichero}.`);
  if (which === "evacuacion") {
    console.error("Cuando lleguen los datos de AXEGA, ponlos en data/evacuaciones.json y ejecuta:");
    console.error("  node scripts/ingesta-evacuaciones.mjs   (genera el fichero de resultado)");
    console.error("  node scripts/calibracion-ourense.mjs evacuacion");
  }
  process.exit(1);
}

const fc = JSON.parse(readFileSync(join(DATA, "nucleos_ourense.json"), "utf8"));
const res = JSON.parse(readFileSync(rutaRes, "utf8")).nucleos;

const nucleos = fc.features
  .filter((f) => f.properties.activo && f.properties.iv != null && res[f.properties.id])
  .map((f) => {
    const p = f.properties, r = res[p.id];
    const o = { iv: p.iv, peligro: p.peligro_biofisico, social: p.score_social, cap: p.capacidad_respuesta };
    for (const b of cfg.binarias) o[b.clave] = !!r[b.campo];
    o.cont = r[cfg.continua] ?? 0;
    return o;
  });
console.log(`Variable de resultado: ${cfg.etiqueta}`);
console.log(`Núcleos con IV y resultado: ${nucleos.length}`);

const PREDICTORES = [
  { clave: "iv", etiqueta: "IV (índice completo)", get: (n) => n.iv },
  { clave: "peligro_biofisico", etiqueta: "Peligro biofísico", get: (n) => n.peligro },
  { clave: "score_social", etiqueta: "Sensibilidad social", get: (n) => n.social },
  { clave: "capacidad_respuesta_inv", etiqueta: "Capacidad de respuesta (100−cap)", get: (n) => 100 - n.cap },
];

// --- AUC + bootstrap por predictor y resultado binario ------------------------
const tabla = {};
for (const b of cfg.binarias) {
  const labels = nucleos.map((n) => n[b.clave]), nPos = labels.filter(Boolean).length;
  tabla[b.clave] = { etiqueta: b.etiqueta, n_positivos: nPos, n_negativos: labels.length - nPos, predictores: {} };
  for (const pr of PREDICTORES) {
    const scores = nucleos.map(pr.get);
    const a = auc(scores, labels), boot = aucBootstrap(scores, labels, N_BOOT);
    tabla[b.clave].predictores[pr.clave] = {
      etiqueta: pr.etiqueta, auc: a == null ? null : Number(a.toFixed(3)),
      ic95: boot.ic95[0] == null ? null : [Number(boot.ic95[0].toFixed(3)), Number(boot.ic95[1].toFixed(3))],
    };
  }
}

// --- Spearman vs variable continua -------------------------------------------
const spear = {};
const cont = nucleos.map((n) => n.cont);
for (const pr of PREDICTORES) {
  const rho = spearman(nucleos.map(pr.get), cont);
  spear[pr.clave] = { etiqueta: pr.etiqueta, spearman: rho == null ? null : Number(rho.toFixed(3)) };
}

// --- Recalibración de pesos con validación cruzada k-fold --------------------
function rejilla() {
  const c = [];
  for (let p = Math.round(MIN_PESO * 100); p <= MAX_PESO * 100; p += PASO * 100)
    for (let s = Math.round(MIN_PESO * 100); s <= MAX_PESO * 100; s += PASO * 100) {
      const cc = 100 - p - s;
      if (cc >= MIN_PESO * 100 && cc <= MAX_PESO * 100) c.push({ peligro: p / 100, social: s / 100, cap: cc / 100 });
    }
  return c;
}
function folds(n, k) {
  const idx = [...Array(n).keys()], azar = rng(20260708);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.reduce((acc, v, i) => { (acc[i % k] ||= []).push(v); return acc; }, []);
}
const aucPesos = (sub, w, campo) => auc(sub.map((n) => calcularIV(n.peligro, n.social, n.cap, w)), sub.map((n) => n[campo]));
const combos = rejilla();
const pesosBase = { peligro: PESO_PELIGRO, social: PESO_SOCIAL, cap: PESO_CAP };
const cv = {};
for (const b of cfg.binarias) {
  const part = folds(nucleos.length, K_FOLD);
  let mejor = null;
  for (const w of combos) {
    let suma = 0, nv = 0;
    for (let f = 0; f < K_FOLD; f++) {
      const val = part[f].map((i) => nucleos[i]);
      const a = aucPesos(val, w, b.clave);
      if (a != null) { suma += a; nv++; }
    }
    if (!nv) continue;
    const va = suma / nv;
    if (!mejor || va > mejor.va) mejor = { w, va };
  }
  const base = aucPesos(nucleos, pesosBase, b.clave);
  const opt = mejor ? aucPesos(nucleos, mejor.w, b.clave) : null;
  cv[b.clave] = {
    etiqueta: b.etiqueta,
    auc_pesos_base: base == null ? null : Number(base.toFixed(3)),
    pesos_optimos_cv: mejor ? mejor.w : null,
    auc_val_optimos: mejor ? Number(mejor.va.toFixed(3)) : null,
    auc_train_optimos: opt == null ? null : Number(opt.toFixed(3)),
    gap_sobreajuste: (mejor && opt != null) ? Number((opt - mejor.va).toFixed(3)) : null,
  };
}

const salida = {
  metadata: {
    descripcion: `Calibración exploratoria del IV contra ${cfg.etiqueta}. AUC (Mann-Whitney) `
      + `con IC bootstrap; Spearman vs ${cfg.continua}; recalibración por validación cruzada ${K_FOLD}-fold.`,
    variable_resultado: which, valida: cfg.valida,
    n_nucleos: nucleos.length, n_bootstrap: N_BOOT, k_fold: K_FOLD, pesos_base: pesosBase,
    pesos_no_adoptados: "La recalibración por CV es una RECOMENDACIÓN fundamentada, NO se adopta: "
      + "los pesos del índice siguen siendo los provisionales declarados. Decisión para revisión "
      + "humana (ver gap_sobreajuste: train − validación).",
    ...(cfg.extra || {}),
  },
  auc_binario: tabla, spearman_continua: spear, recalibracion_cv: cv,
};
writeFileSync(join(DATA, cfg.salida), JSON.stringify(salida, null, 2) + "\n", "utf8");

console.log(`\nCALIBRACIÓN [${which}] (n=${nucleos.length})  valida: ${cfg.valida}\n`);
for (const b of cfg.binarias) {
  const t = tabla[b.clave];
  console.log(`== ${t.etiqueta}  (${t.n_positivos} pos / ${t.n_negativos} neg) ==`);
  for (const p of Object.values(t.predictores).sort((a, z) => (z.auc ?? 0) - (a.auc ?? 0))) {
    const ic = p.ic95 ? `[${p.ic95[0].toFixed(2)}, ${p.ic95[1].toFixed(2)}]` : "—";
    console.log(`  ${p.etiqueta.padEnd(34)} AUC=${String(p.auc ?? "—").padStart(5)}  ${ic}`);
  }
  const c = cv[b.clave];
  console.log(`  [CV] base=${c.auc_pesos_base} óptimo val=${c.auc_val_optimos} train=${c.auc_train_optimos} gap=${c.gap_sobreajuste}\n`);
}
console.log(`Escrito data/${cfg.salida}`);
