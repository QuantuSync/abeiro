// =============================================================================
// ABEIRO · Lógica PURA del Índice de Vulnerabilidad (sin E/S)
// =============================================================================
// Módulo compartido entre los scripts de datos (scripts/procesar-ige.mjs,
// scripts/sensibilidad-pesos.mjs) y los tests (tests/*.test.ts). Es .mjs y no
// .ts para que Node lo importe directamente sin transpilación; Vitest lo
// importa igual de bien.
//
// Composición del IV (0-100), SIN ancla de Fase 0:
//   iv = PESO_PELIGRO·peligro_biofisico + PESO_SOCIAL·score_social
//        + PESO_CAP·(100 − capacidad_respuesta)
// Dirección de cada subíndice:
//   - peligro_biofisico   0-100: MÁS peligro      -> MÁS IV (positivo)
//   - score_social        0-100: MÁS sensibilidad -> MÁS IV (positivo)
//   - capacidad_respuesta 0-100: MÁS capacidad    -> MENOS IV (entra invertida)
// Todos los pesos son PROVISIONALES (no calibrados); la calibración supervisada
// (ROC/AUC contra el incendio de 2025) es fase posterior.
// =============================================================================

export const PESO_SOCIAL = 0.35;  // peso provisional de la sensibilidad social en el IV
export const PESO_CAP = 0.25;     // peso provisional de la capacidad de respuesta en el IV
export const PESO_PELIGRO = 0.40; // peso provisional del peligro biofísico en el IV

// Peligro biofísico (0-100) = combinación de PENDIENTE (real) y COMBUSTIBLE
// (aproximación). Pesos provisionales documentados.
export const PESO_PENDIENTE = 0.40; // contribución de la pendiente al peligro
export const PESO_COMBUST = 0.60;   // contribución de la combustibilidad al peligro

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const clamp100 = (v) => Math.max(0, Math.min(100, v));

// Pendiente (grados) -> subíndice 0-100. ~35° o más = máximo (propagación muy
// acelerada). Lineal saturado, provisional.
export const scorePendiente = (grados) =>
  Math.max(0, Math.min(100, Math.round((grados / 35) * 100)));

// Peligro biofísico a partir de pendiente (grados) y combustibilidad (0-100).
export function peligroBiofisico(grados, combustibilidad) {
  return Math.round(PESO_PENDIENTE * scorePendiente(grados) + PESO_COMBUST * combustibilidad);
}

// AMP = amplitud máxima de la modulación por humedad (NDMI), ±30%, provisional.
export const NDMI_AMP = 0.30;

// -----------------------------------------------------------------------------
// Rangos FÍSICOS FIJOS de normalización de los índices de satélite (con recorte
// fuera de rango). Con rango fijo la escala es estable y comparable: no depende
// de la muestra de núcleos (añadir uno no cambia los demás).
//   NDVI [0.15, 0.80]: 0.15 ≈ suelo desnudo/urbano; 0.80 ≈ vegetación densa.
//   NDMI [-0.05, 0.35]: -0.05 ≈ muy seco/suelo desnudo; 0.35 ≈ dosel hidratado.
// -----------------------------------------------------------------------------
export const NDVI_RANGO_FIJO = [0.15, 0.80];
export const NDMI_RANGO_FIJO = [-0.05, 0.35];

// Factor de inflamabilidad por humedad (NDMI invertido, normalizado al rango
// dado con recorte): NDMI bajo (seco) -> >1; alto (húmedo) -> <1.
export function factorNDMI(ndmi, ndmiMin, ndmiMax) {
  const norm = ndmiMax > ndmiMin
    ? Math.max(0, Math.min(1, (ndmi - ndmiMin) / (ndmiMax - ndmiMin)))
    : 0.5;
  return 1 + NDMI_AMP * (1 - 2 * norm); // 0(seco)->1+AMP ; 1(húmedo)->1-AMP
}

// COMBUSTIBLE BASADO EN SATÉLITE (Sentinel-2). El NDVI mide CUÁNTA biomasa hay
// (cantidad de material) y el NDMI modula la INFLAMABILIDAD (cómo de seco está):
//   biomasa      = NDVI normalizado al rango dado * 100                 (0-100)
//   combustible  = biomasa * factorNDMI                                 (0-100)
// => Multiplicativo: poca biomasa = combustible bajo esté seca o no. Esto
//    mantiene a los núcleos urbanos (NDVI bajo) con combustible bajo.
export function combustibleSatelite(ndvi, ndmi, ndviMin, ndviMax, ndmiMin, ndmiMax) {
  const biomasaNorm = ndviMax > ndviMin
    ? Math.max(0, Math.min(1, (ndvi - ndviMin) / (ndviMax - ndviMin)))
    : 0.5;
  const biomasa = biomasaNorm * 100;
  const factor = factorNDMI(ndmi, ndmiMin, ndmiMax);
  return {
    biomasa: Math.round(biomasa),
    factor,
    combustibilidad: Math.max(0, Math.min(100, Math.round(biomasa * factor))),
  };
}

// -----------------------------------------------------------------------------
// SCORE SOCIAL (0-100): sensibilidad social del núcleo. Subpesos PROVISIONALES
// (suman 1). Procedencia de cada variable (flags en nucleos.json):
//   - mayores_65: REAL por proxy de concello (Padrón IGE 2022).
//   - hogares_unipersonales: ESTIMACIÓN de Fase 0.
//   - dispersion: ESTIMACIÓN de Fase 0 (categórica).
//   - poblacion: REAL por aldea (Nomenclátor IGE 2025).
// -----------------------------------------------------------------------------
export const SUBPESOS_SOCIAL = {
  mayores_65: 0.45,            // envejecimiento: la variable social principal
  hogares_unipersonales: 0.20, // personas mayores que viven solas
  dispersion: 0.20,            // hábitat disperso = aviso y rescate más difíciles
  poblacion: 0.15,             // tamaño demográfico (menos vecinos = menos autoayuda)
};

// % de mayores de 65 (fracción 0-1) -> 0-100 con rango FIJO [0.15, 0.55]:
// 0.15 ≈ mínimo urbano español; 0.55 = envejecimiento extremo de aldea gallega.
export const RANGO_MAYORES_65 = [0.15, 0.55];
// % de hogares unipersonales de mayores (0-100) -> 0-100 con rango FIJO [0, 50].
export const RANGO_UNIPER = [0, 50];
// Dispersión categórica -> 0-100 (más dispersión = más sensibilidad).
export const SCORE_DISPERSION = { "muy baja": 0, "baja": 25, "media": 50, "alta": 75, "muy alta": 100 };
// Tamaño demográfico -> 0-100 en escala logarítmica INVERTIDA: menos población,
// más sensibilidad (menos vecinos para avisar/ayudar). 1 hab -> 100; 10 -> 75;
// 100 -> 50; 1.000 -> 25; ≥10.000 -> 0.
export const scorePoblacion = (pob) =>
  clamp100(100 - 25 * Math.log10(Math.max(1, pob)));

// pctMayores en fracción 0-1; pctUniper en % 0-100; dispersion categórica; pob en hab.
// Las variables NO disponibles (pctUniper/dispersion = null o undefined) se
// EXCLUYEN y los subpesos restantes se RENORMALIZAN. Esto permite el escalado a
// Ourense, donde solo hay mayores_65 (INE) y población (IGE) por núcleo, sin
// hogares unipersonales ni dispersión (que en el piloto eran estimaciones de
// Fase 0). Con las cuatro variables presentes, el resultado es idéntico al
// anterior (los subpesos suman 1).
export function scoreSocial({ pctMayores, pctUniper, dispersion, poblacion }) {
  const terminos = [
    [SUBPESOS_SOCIAL.mayores_65,
     clamp01((pctMayores - RANGO_MAYORES_65[0]) / (RANGO_MAYORES_65[1] - RANGO_MAYORES_65[0])) * 100],
    [SUBPESOS_SOCIAL.poblacion, scorePoblacion(poblacion)],
  ];
  if (pctUniper != null) {
    terminos.push([SUBPESOS_SOCIAL.hogares_unipersonales,
      clamp01((pctUniper - RANGO_UNIPER[0]) / (RANGO_UNIPER[1] - RANGO_UNIPER[0])) * 100]);
  }
  if (dispersion != null) {
    terminos.push([SUBPESOS_SOCIAL.dispersion, SCORE_DISPERSION[dispersion] ?? 50]);
  }
  const wsum = terminos.reduce((s, [w]) => s + w, 0);
  return Math.round(terminos.reduce((s, [w, v]) => s + w * v, 0) / wsum);
}

// IV (0-100) compuesto directamente desde las tres componentes. La capacidad de
// respuesta entra INVERTIDA (100 − cap): más capacidad debe BAJAR el IV.
// `pesos` permite recalcular con otros pesos (análisis de sensibilidad).
export function calcularIV(peligro, social, capacidad, pesos = {
  peligro: PESO_PELIGRO, social: PESO_SOCIAL, cap: PESO_CAP,
}) {
  return Math.round(clamp100(
    pesos.peligro * peligro + pesos.social * social + pesos.cap * (100 - capacidad)
  ));
}

// -----------------------------------------------------------------------------
// Capacidad de respuesta desde las vías de salida OSM.
// -----------------------------------------------------------------------------
// Peso por CLASE de vía al contar salidas. Una pista forestal no es una vía de
// evacuación fiable ante un incendio, así que cuenta mucho menos que una carretera.
export const PESOS_VIA = {
  primary: 1.0, secondary: 1.0, tertiary: 1.0,
  unclassified: 0.5, residential: 0.5,
  track: 0.2,
};
export const PESO_VIA_DEFECTO = 0.5; // clases no listadas: peso intermedio prudente

// Recuento PONDERADO de salidas a partir del desglose por tipo (OSM).
export const salidasPonderadas = (porTipo = {}) =>
  Object.entries(porTipo).reduce(
    (acc, [tipo, n]) => acc + n * (PESOS_VIA[tipo] ?? PESO_VIA_DEFECTO), 0);

// Capacidad de respuesta (0-100) a partir del recuento (ponderado) de salidas.
// Mapeo PROVISIONAL lineal saturado (~40 salidas plenas -> 100). Mayor capacidad
// = menor vulnerabilidad (entra en el IV invertida).
export const capDeSalidas = (vias) =>
  Math.max(0, Math.min(100, Math.round(vias * 2.5)));

// -----------------------------------------------------------------------------
// CONFIANZA del dato por núcleo (0-1): derivada de los flags de procedencia.
// Nivel por variable: real = 1, aproximación = 0.6, aproximación débil = 0.45,
// estimación = 0.3. Se promedia por componente (con los subpesos de cada
// componente) y se pondera por los pesos del IV:
//   confianza = PESO_PELIGRO·conf_peligro + PESO_SOCIAL·conf_social
//               + PESO_CAP·conf_capacidad
//   conf_social  = subpesos_social aplicados a [edad, uniper, dispersión, población]
//   conf_peligro = PESO_PENDIENTE·pendiente + PESO_COMBUST·combustible
//   conf_capacidad = capacidad
// El COMBUSTIBLE distingue su fuente: medición Sentinel-2 = aproximación (0.6;
// sigue sin ser el mapa de combustible calibrado, así que NO es "real"),
// respaldo por cubierta OSM = aproximación débil (0.45; etiqueta de uso del
// suelo, no medición), sin dato = estimación (0.3).
// -----------------------------------------------------------------------------
export const CONFIANZA_NIVEL = { real: 1, aproximacion: 0.6, aproximacion_debil: 0.45, estimacion: 0.3 };

// `combustible`: "satelite" | "osm" | "sin_dato" (fuente efectiva del combustible).
// `socialCompleto`: true (piloto: uniper y dispersión presentes como estimación
// Fase 0) o false (escalado: solo mayores_65 y población, ambos reales — los
// subpesos sociales se renormalizan a las variables presentes).
export function confianzaNucleo({ edadReal, poblacionReal, capacidadReal, pendienteReal, combustible, socialCompleto = true }) {
  const nivel = (real) => (real ? CONFIANZA_NIVEL.real : CONFIANZA_NIVEL.estimacion);
  const nivelCombustible =
    combustible === "satelite" ? CONFIANZA_NIVEL.aproximacion
    : combustible === "osm" ? CONFIANZA_NIVEL.aproximacion_debil
    : CONFIANZA_NIVEL.estimacion;
  const social = [
    [SUBPESOS_SOCIAL.mayores_65, nivel(edadReal)],
    [SUBPESOS_SOCIAL.poblacion, nivel(poblacionReal)],
  ];
  if (socialCompleto) {
    social.push([SUBPESOS_SOCIAL.hogares_unipersonales, CONFIANZA_NIVEL.estimacion]); // Fase 0
    social.push([SUBPESOS_SOCIAL.dispersion, CONFIANZA_NIVEL.estimacion]);            // Fase 0
  }
  const wsum = social.reduce((s, [w]) => s + w, 0);
  const confSocial = social.reduce((s, [w, v]) => s + w * v, 0) / wsum;
  const confPeligro =
    PESO_PENDIENTE * nivel(pendienteReal)
    + PESO_COMBUST * nivelCombustible;
  const confCap = nivel(capacidadReal);
  return Number((PESO_PELIGRO * confPeligro + PESO_SOCIAL * confSocial + PESO_CAP * confCap).toFixed(2));
}

// Etiqueta legible de la confianza (para la interfaz).
export function nivelConfianza(c) {
  return c >= 0.75 ? "alta" : c >= 0.5 ? "media" : "baja";
}

// -----------------------------------------------------------------------------
// Normalización de nombres (Nomenclátor IGE, leído en latin1 -> UTF-8).
// "Rúa, A" -> "a rua": reordena el artículo, quita tildes y no-alfanuméricos.
// -----------------------------------------------------------------------------
export function norm(nombre) {
  let s = nombre.trim().toLowerCase();
  const art = s.match(/^(.*),\s*(o|a|os|as)$/); // "rúa, a" -> "a rúa"
  if (art) s = `${art[2]} ${art[1]}`;
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // sin tildes
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export const sinEspacios = (s) => norm(s).replace(/ /g, "");
