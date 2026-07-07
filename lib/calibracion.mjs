// =============================================================================
// ABEIRO · Lógica PURA de calibración (AUC y bootstrap), sin E/S
// =============================================================================
// Compartida entre scripts/calibracion-emsr837.mjs y los tests. AUC = área bajo
// la curva ROC, calculada por el estadístico de Mann-Whitney U (probabilidad de
// que un positivo elegido al azar tenga MAYOR score que un negativo al azar).
// Empates cuentan 0.5. No hay dependencias externas.
// =============================================================================

// AUC por rangos (Mann-Whitney). `scores` numéricos, `labels` booleanos (o 0/1).
// Devuelve null si no hay al menos un positivo y un negativo (AUC indefinido).
export function auc(scores, labels) {
  const pos = [], neg = [];
  for (let i = 0; i < scores.length; i++) (labels[i] ? pos : neg).push(scores[i]);
  if (!pos.length || !neg.length) return null;
  let suma = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) suma += 1;
      else if (p === n) suma += 0.5;
    }
  }
  return suma / (pos.length * neg.length);
}

// Generador congruente lineal (determinista, reproducible sin Math.random).
// Semilla entera; devuelve una función que da flotantes en [0,1).
export function rng(semilla) {
  let s = semilla >>> 0;
  return () => {
    // LCG de Numerical Recipes.
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// IC del AUC por bootstrap: `n` remuestreos con reemplazo sobre los índices de
// los núcleos. Los remuestreos que quedan sin positivo o sin negativo (AUC
// indefinido) se descartan y se cuentan aparte. Devuelve mediana, IC95
// (percentiles 2.5 / 97.5) y nº de remuestreos válidos.
export function aucBootstrap(scores, labels, n = 2000, semilla = 12345) {
  const N = scores.length;
  const azar = rng(semilla);
  const aucs = [];
  let descartados = 0;
  for (let b = 0; b < n; b++) {
    const s = new Array(N), l = new Array(N);
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(azar() * N);
      s[i] = scores[idx];
      l[i] = labels[idx];
    }
    const a = auc(s, l);
    if (a == null) descartados++;
    else aucs.push(a);
  }
  aucs.sort((x, y) => x - y);
  const pct = (p) => (aucs.length ? aucs[Math.min(aucs.length - 1, Math.floor(p * aucs.length))] : null);
  return {
    mediana: pct(0.5),
    ic95: [pct(0.025), pct(0.975)],
    n_validos: aucs.length,
    n_descartados: descartados,
  };
}
