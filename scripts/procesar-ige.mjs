// =============================================================================
// ABEIRO · Fase 1 — Edad real de los 9 concellos del piloto en el IV
// =============================================================================
// Regenera data/nucleos.json a partir de:
//   - data/nucleos.base.json   línea base (componentes aún estimadas: peligro
//                              biofísico, capacidad de respuesta, dispersión...,
//                              más iv0/pct0 inventados de Fase 0). REPRODUCIBLE.
//   - data/padron_edad_concellos.csv   % de mayores de 65 por concello (Padrón
//                              IGE 2022, fracción 0-1), Sexo "Total", suma de
//                              65-69/70-74/75-79/80-84/"85 e máis" SIN doble conteo.
//   - data/Fichero5,9,10..16   Nomenclátor IGE 2025 por concello: población REAL
//                              por aldea (entidade singular). Encoding latin1.
//   - data/Fichero1.txt        Nomenclátor general (respaldo de población para
//                              aldeas fuera de los 9 concellos, p.ej. Pradorramisquedo
//                              que pertenece a Viana do Bolo 32086).
//
// Modelo de datos:
//   * POBLACIÓN: real por aldea (Nomenclátor 2025).
//   * % MAYORES 65: proxy a nivel CONCELLO (Padrón 2022) aplicado a sus aldeas.
//     pct_mayores_65 se guarda como fracción 0-1.
//   * Se excluyen aldeas con 0 habitantes. Nombres leídos en latin1 -> UTF-8.
//   * IV: se COMPONE directamente desde las tres componentes normalizadas 0-100
//     (ya sin anclar al iv inventado de Fase 0):
//       iv = PESO_PELIGRO·peligro_biofisico + PESO_SOCIAL·score_social
//            + PESO_CAP·(100 − capacidad_respuesta)
//     Dirección de cada subíndice (documentada también en metadata):
//       - peligro_biofisico   0-100: MÁS peligro    -> MÁS IV (positivo)
//       - score_social        0-100: MÁS sensibilidad -> MÁS IV (positivo)
//       - capacidad_respuesta 0-100: MÁS capacidad  -> MENOS IV (entra invertida
//         como 100 − capacidad).
//     Los pesos son PROVISIONALES (no calibrados); la calibración supervisada
//     (ROC/AUC contra el incendio de 2025) es fase posterior. El IV antiguo de
//     Fase 0 (delta sobre iv0 inventado) se conserva como `iv_fase0` SOLO como
//     columna de comparación: no se pinta en el mapa.
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Toda la lógica PURA del índice (pesos, score social, IV, combustible,
// normalización de nombres) vive en lib/indice.mjs, compartida con los tests
// y con scripts/sensibilidad-pesos.mjs.
import {
  PESO_SOCIAL, PESO_CAP, PESO_PELIGRO, PESO_PENDIENTE, PESO_COMBUST,
  NDMI_AMP, NDVI_RANGO_FIJO, NDMI_RANGO_FIJO,
  SUBPESOS_SOCIAL, RANGO_MAYORES_65, RANGO_UNIPER,
  scorePendiente, peligroBiofisico, factorNDMI, combustibleSatelite,
  scoreSocial, calcularIV, confianzaNucleo,
  PESOS_VIA, salidasPonderadas, capDeSalidas,
  norm, sinEspacios,
} from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

// Ficheros del Nomenclátor por concello (población real por aldea).
const FICHEROS_CONCELLO = [5, 9, 10, 11, 12, 13, 14, 15, 16];

// --- utilidades CSV -----------------------------------------------------------

function campos(linea) {
  const m = linea.match(/("(?:[^"]|"")*"|[^,]+)/g);
  return m ? m.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"')) : [];
}

// --- 1) % mayores por concello (CSV) -----------------------------------------

function leerEdadCSV() {
  const lineas = readFileSync(join(DATA, "padron_edad_concellos.csv"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const m = {}; // codmun -> { concello, pct (0-1) }
  for (let i = 1; i < lineas.length; i++) {
    const [codmun, concello, pct] = campos(lineas[i]);
    m[codmun] = { concello, pct: Number(pct) };
  }
  return m;
}

// --- 2) aldeas (población real) ----------------------------------------------

function leerAldeasDeFichero(nombreFichero) {
  const lineas = readFileSync(join(DATA, nombreFichero), "latin1")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const out = [];
  for (let i = 1; i < lineas.length; i++) {
    const f = campos(lineas[i]);
    const [, codprov, codmun, , , , nome, pobtotal] = f;
    const pob = Number(pobtotal);
    if (!Number.isFinite(pob) || pob <= 0) continue; // excluye 0 habitantes
    out.push({ nome, pob, codmun: `${codprov}${codmun}`, norm: norm(nome), sinEsp: sinEspacios(nome) });
  }
  return out;
}

function leerAldeas() {
  // Primario: los 9 concellos del piloto.
  const piloto = FICHEROS_CONCELLO.flatMap((n) => leerAldeasDeFichero(`Fichero${n}.txt`));
  // Respaldo: Nomenclátor general (para aldeas fuera de los 9 concellos).
  const general = leerAldeasDeFichero("Fichero1.txt");
  return { piloto, general };
}

// --- 3) cruce núcleo del mapa -> aldea ---------------------------------------

const ALIAS = { "a-rua": "Rúa de Valdeorras, A" };

function cruzar(id, nombre, aldeas) {
  const obj = ALIAS[id] ? norm(ALIAS[id]) : norm(nombre);
  const objSE = ALIAS[id] ? sinEspacios(ALIAS[id]) : sinEspacios(nombre);
  let c = aldeas.filter((a) => a.norm === obj); // a) exacto
  if (!c.length) c = aldeas.filter((a) => a.norm.startsWith(obj + " ") || obj.startsWith(a.norm + " ")); // b) prefijo
  if (!c.length) c = aldeas.filter((a) => a.sinEsp === objSE); // c) sin espacios
  if (!c.length) return null;
  c.sort((x, y) => y.pob - x.pob); // desempata por mayor población
  return c[0];
}

// --- ejecución ---------------------------------------------------------------

const edad = leerEdadCSV();
const { piloto, general } = leerAldeas();
const base = JSON.parse(readFileSync(join(DATA, "nucleos.base.json"), "utf8"));

// Cachés opcionales. Si no existen, la componente correspondiente queda como base.
const cargaCache = (f) => existsSync(join(DATA, f))
  ? JSON.parse(readFileSync(join(DATA, f), "utf8")).nucleos || {} : {};
const accesos = cargaCache("accesos_osm.json");     // capacidad de respuesta
// Análisis de sensibilidad de pesos (scripts/sensibilidad-pesos.mjs): si existe,
// aporta rango_iv = [min, max] del IV de cada núcleo al variar los pesos.
const sensibilidad = cargaCache("sensibilidad_pesos.json");
const pendiente = cargaCache("pendiente_dem.json"); // peligro: pendiente (real)
const combustible = cargaCache("combustible_osm.json"); // peligro: cubierta (OSM, respaldo)
const ndmi = cargaCache("ndmi_sentinel2.json");     // peligro: humedad vegetación (Sentinel-2)
const ndvi = cargaCache("ndvi_sentinel2.json");     // peligro: biomasa vegetación (Sentinel-2)

// -----------------------------------------------------------------------------
// Cachés de SATÉLITE pendientes de re-medición. Tras corregir las coordenadas
// de Fase 0 (desplazadas hasta 57 km), los NDVI/NDMI se RE-MIDIERON con
// scripts/fetch-satelite.py (Earth Engine) sobre las coordenadas reales,
// período pre-incendio 2025-06-01 a 2025-07-31, buffer 1 km: el conjunto queda
// VACÍO. Si una futura edición de coordenadas vuelve a invalidar la medición
// de algún núcleo, añádelo aquí (cae al respaldo por cubierta OSM) hasta
// re-ejecutar fetch-satelite.py.
// -----------------------------------------------------------------------------
const SATELITE_PENDIENTE_REMEDICION = new Set([]);

// Normalización con RANGOS FIJOS documentados (con recorte fuera de rango).
// Los rangos observados de la muestra se calculan solo como referencia histórica.
const [NDMI_MIN, NDMI_MAX] = NDMI_RANGO_FIJO;
const [NDVI_MIN, NDVI_MAX] = NDVI_RANGO_FIJO;
const rangoObservado = (obj, k) => {
  const v = Object.values(obj).map((x) => x[k]).filter((n) => n != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};
const NDMI_OBSERVADO = rangoObservado(ndmi, "ndmi");
const NDVI_OBSERVADO = rangoObservado(ndvi, "ndvi");

const informe = [];

for (const feat of base.features) {
  const p = feat.properties;
  const iv0 = p.iv;
  const pct0 = (p.pct_mayores_65 > 1 ? p.pct_mayores_65 / 100 : p.pct_mayores_65); // fracción
  const cap0 = p.capacidad_respuesta; // capacidad invent. de la base (0-100)
  const pel0 = p.peligro_biofisico;   // peligro invent. de la base (0-100)

  // Cruce: primero en los 9 concellos; si no, en el Nomenclátor general.
  let aldea = cruzar(p.id, p.nombre, piloto);
  let origenPob = "piloto";
  if (!aldea) { aldea = cruzar(p.id, p.nombre, general); origenPob = "general"; }

  if (aldea) {
    p.poblacion = aldea.pob;
    p.dato_poblacion_real = true;
    p.fuente_poblacion = "Nomenclátor IGE 2025 (entidade singular)";
    p.ige_nome = aldea.nome;
    p.ige_codmun = aldea.codmun;
  } else {
    p.dato_poblacion_real = false;
  }

  // --- componente SOCIAL (% mayores de 65, real por proxy de concello) ---
  const ec = aldea ? edad[aldea.codmun] : null;
  let deltaSocial = 0;
  if (ec) {
    p.pct_mayores_65 = Number(ec.pct.toFixed(4)); // REAL (fracción 0-1)
    p.dato_edad_real = true;
    p.edad_proxy_concello = true;
    p.fuente_edad = `Padrón IGE 2022 (proxy concello: ${aldea.codmun} ${ec.concello})`;
    deltaSocial = PESO_SOCIAL * (p.pct_mayores_65 - pct0) * 100;
  } else {
    p.pct_mayores_65 = Number(pct0.toFixed(4)); // estimación
    p.dato_edad_real = false;
    p.edad_proxy_concello = true;
    p.fuente_edad = "estimación provisional (concello sin Padrón de edad disponible)";
  }

  // --- componente CAPACIDAD DE RESPUESTA (vías de salida ponderadas, OSM) ---
  const ac = accesos[p.id];
  let deltaCap = 0;
  let capSinPonderar = null;
  if (ac) {
    const ponderadas = salidasPonderadas(ac.por_tipo);
    p.vias_salida = ac.vias_salida;            // recuento bruto (referencia)
    p.vias_salida_ponderadas = Number(ponderadas.toFixed(1));
    p.vias_salida_por_tipo = ac.por_tipo;
    p.num_accesos = ac.vias_salida;
    const capReal = capDeSalidas(ponderadas);  // capacidad PONDERADA
    capSinPonderar = capDeSalidas(ac.vias_salida);
    p.capacidad_respuesta = capReal;
    p.dato_capacidad_real = true;
    p.fuente_capacidad = `OpenStreetMap/Overpass (vías de salida ponderadas por clase, ${ac.radio_m} m; ODbL)`;
    deltaCap = -PESO_CAP * (capReal - cap0); // más capacidad -> menos vulnerabilidad
  } else {
    p.dato_capacidad_real = false;
  }

  // --- componente PELIGRO BIOFÍSICO (pendiente real + combustible SATÉLITE) ---
  // Los NDVI/NDMI medidos en la coordenada antigua (desplazada) se descartan:
  // el núcleo cae al respaldo por cubierta OSM hasta re-medir con Earth Engine.
  const sateliteValido = !SATELITE_PENDIENTE_REMEDICION.has(p.id);
  const pe = pendiente[p.id], co = combustible[p.id];
  const nm = sateliteValido ? ndmi[p.id] : null;
  const nv = sateliteValido ? ndvi[p.id] : null;
  let deltaPeligro = 0;
  const cobOSM = co?.combustibilidad ?? null; // cubierta OSM (solo respaldo/referencia)
  if (pe && pe.pendiente_grados != null) {
    p.pendiente_grados = pe.pendiente_grados;
    p.cota_m = pe.cota_m;
    p.dato_pendiente_real = true; // pendiente: DATO REAL (DEM)
    let pelReal;
    if (nv && nv.ndvi != null && nm && nm.ndmi != null) {
      // PRINCIPAL: combustible medido por satélite (NDVI = biomasa, NDMI = humedad).
      const sat = combustibleSatelite(nv.ndvi, nm.ndmi, NDVI_MIN, NDVI_MAX, NDMI_MIN, NDMI_MAX);
      p.combustibilidad = sat.combustibilidad;
      p.ndvi = nv.ndvi;
      p.ndmi = nm.ndmi;
      p.biomasa_ndvi = sat.biomasa;
      p.ndmi_factor = Number(sat.factor.toFixed(3));
      p.combustible_dominante = cobOSM != null ? co.dominante : null; // referencia OSM
      if (cobOSM != null) p.cobertura_osm = cobOSM;
      p.dato_combustible_aprox = true;
      p.combustible_sin_dato = false;
      p.combustible_fuente = "Sentinel-2 NDVI+NDMI";
      p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: Sentinel-2 — NDVI (biomasa) "
        + "modulado por NDMI (humedad), verano 2025. Medición directa de satélite; aún no es el "
        + "mapa de combustible calibrado (fotoguía + LiDAR).";
      pelReal = peligroBiofisico(pe.pendiente_grados, sat.combustibilidad);
    } else if (cobOSM != null) {
      // RESPALDO: sin satélite, cubierta OSM (modulada por NDMI si lo hubiera).
      const factor = nm?.ndmi != null ? factorNDMI(nm.ndmi, NDMI_MIN, NDMI_MAX) : 1;
      p.combustibilidad = Math.max(0, Math.min(100, Math.round(cobOSM * factor)));
      p.combustible_dominante = co.dominante;
      p.cobertura_osm = cobOSM;
      if (nm?.ndmi != null) p.ndmi = nm.ndmi;
      p.dato_combustible_aprox = true;
      p.combustible_sin_dato = false;
      p.combustible_fuente = nm?.ndmi != null ? "OSM + NDMI (respaldo)" : "OSM (respaldo)";
      p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: cubierta OSM (respaldo, "
        + "sin NDVI de satélite en este núcleo).";
      pelReal = peligroBiofisico(pe.pendiente_grados, p.combustibilidad);
    } else {
      // Ni satélite ni cubierta OSM: peligro solo a partir de la pendiente.
      p.combustible_dominante = null;
      p.dato_combustible_aprox = false;
      p.combustible_sin_dato = true;
      p.combustible_fuente = null;
      pelReal = scorePendiente(pe.pendiente_grados);
      p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: sin dato; solo pendiente.";
    }
    p.peligro_biofisico = pelReal;
    deltaPeligro = PESO_PELIGRO * (pelReal - pel0); // más peligro -> más vulnerabilidad
  } else {
    p.dato_pendiente_real = false;
    p.dato_combustible_aprox = false;
  }

  // --- IV: composición directa desde las tres componentes (sin ancla Fase 0) ---
  // El valor antiguo (delta sobre el iv0 inventado de Fase 0) se conserva como
  // iv_fase0, SOLO para comparación; no se pinta en el mapa.
  p.iv_fase0 = Math.round(Math.max(0, Math.min(100, iv0 + deltaSocial + deltaCap + deltaPeligro)));

  // score_social explícito (0-100). Las variables uniper y dispersión siguen
  // siendo estimaciones de Fase 0: queda registrado en los flags de procedencia.
  p.score_social = scoreSocial({
    pctMayores: p.pct_mayores_65,
    pctUniper: p.pct_hogares_uniper_mayores,
    dispersion: p.dispersion,
    poblacion: p.poblacion,
  });
  p.dato_social_parcial = true; // mayores_65 y población reales; uniper y dispersión, estimación Fase 0

  p.iv = calcularIV(p.peligro_biofisico, p.score_social, p.capacidad_respuesta);

  // Confianza del dato (0-1) desde los flags de procedencia (fórmula en
  // lib/indice.mjs y metadata.confianza_nota).
  p.confianza = confianzaNucleo({
    edadReal: !!p.dato_edad_real,
    poblacionReal: !!p.dato_poblacion_real,
    capacidadReal: !!p.dato_capacidad_real,
    pendienteReal: !!p.dato_pendiente_real,
    // Fuente efectiva del combustible: la medición Sentinel-2 pesa más que la
    // etiqueta de cubierta OSM de respaldo (ver CONFIANZA_NIVEL en lib/indice.mjs).
    combustible: p.combustible_fuente === "Sentinel-2 NDVI+NDMI" ? "satelite"
      : p.combustible_sin_dato ? "sin_dato" : "osm",
  });

  // Rango del IV bajo variación de pesos (análisis de sensibilidad), si existe.
  const sens = sensibilidad[p.id];
  if (sens?.rango_iv) p.rango_iv = sens.rango_iv;

  informe.push({
    nucleo: p.nombre,
    ndvi: nv?.ndvi ?? "—",
    ndmi: nm?.ndmi ?? "—",
    biomasa: p.biomasa_ndvi ?? "—",
    comb: p.combustibilidad ?? "—",
    fuente: p.combustible_fuente ?? "—",
    pel: p.peligro_biofisico,
    social: p.score_social,
    cap: p.capacidad_respuesta,
    iv_fase0: p.iv_fase0,
    iv: p.iv,
  });
}

base.metadata = {
  ...base.metadata,
  indice: "Índice de Vulnerabilidad (0-100). Se COMPONE directamente desde las tres "
    + "componentes normalizadas 0-100: iv = " + PESO_PELIGRO + "·peligro_biofisico + "
    + PESO_SOCIAL + "·score_social + " + PESO_CAP + "·(100 − capacidad_respuesta). "
    + "Más capacidad de respuesta BAJA el IV. Ya no se ancla al iv inventado de Fase 0 "
    + "(conservado como iv_fase0 solo para comparación). Pesos provisionales, no calibrados.",
  fase: "Fase 1: población real (Nomenclátor IGE 2025), % de mayores de 65 real "
    + "(Padrón IGE 2022, proxy concello) y capacidad de respuesta por vías de salida "
    + "real (OpenStreetMap/Overpass) para los núcleos del piloto. IV compuesto desde "
    + "componentes (sin ancla de Fase 0).",
  edad_nota: "pct_mayores_65 es fracción 0-1, proxy a nivel concello (2022); la "
    + "población es real por aldea (2025).",
  capacidad_nota: "capacidad_respuesta se deriva de las vías de salida OSM PONDERADAS "
    + "por clase (primary/secondary/tertiary=1.0; unclassified/residential=0.5; track=0.2).",
  peligro_nota: "peligro_biofisico = " + PESO_PENDIENTE + "*score_pendiente + " + PESO_COMBUST
    + "*combustibilidad. Pendiente: EU-DEM 25 m (REAL). Combustible: SATÉLITE Sentinel-2 — "
    + "biomasa = NDVI normalizado al rango FÍSICO FIJO [" + NDVI_MIN + "," + NDVI_MAX + "] *100 "
    + "(con recorte fuera de rango); combustibilidad = biomasa * (1±" + NDMI_AMP + ") segun NDMI "
    + "invertido normalizado al rango FIJO [" + NDMI_MIN + "," + NDMI_MAX + "]. Rangos fijos para "
    + "que la escala no dependa de la muestra de núcleos (antes se usaba el rango observado). "
    + "El NDVI sustituye a la cubierta OSM como medida de cantidad de vegetación (OSM queda solo "
    + "de respaldo). APROXIMACIÓN; aún no es el mapa calibrado (fotoguía + LiDAR), pero se basa "
    + "en medición directa de satélite, no en etiquetas.",
  pesos_iv: { peligro_biofisico: PESO_PELIGRO, sensibilidad_social: PESO_SOCIAL, capacidad_respuesta: PESO_CAP },
  pesos_iv_nota: "iv = peligro_biofisico·" + PESO_PELIGRO + " + score_social·" + PESO_SOCIAL
    + " + (100 − capacidad_respuesta)·" + PESO_CAP + ". Dirección: más peligro y más "
    + "sensibilidad social SUBEN el IV; más capacidad de respuesta lo BAJA (entra invertida). "
    + "Pesos PROVISIONALES; calibración ROC/AUC contra el incendio de 2025 en fase posterior.",
  subpesos_social: SUBPESOS_SOCIAL,
  social_nota: "score_social (0-100) = " + SUBPESOS_SOCIAL.mayores_65 + "·mayores_65 + "
    + SUBPESOS_SOCIAL.hogares_unipersonales + "·hogares_unipersonales + "
    + SUBPESOS_SOCIAL.dispersion + "·dispersion + " + SUBPESOS_SOCIAL.poblacion + "·poblacion. "
    + "mayores_65: fracción normalizada al rango fijo [" + RANGO_MAYORES_65 + "] (REAL, proxy "
    + "concello Padrón 2022). hogares_unipersonales: % normalizado a [" + RANGO_UNIPER + "] "
    + "(ESTIMACIÓN Fase 0). dispersion: categórica muy baja/baja/media/alta/muy alta -> "
    + "0/25/50/75/100 (ESTIMACIÓN Fase 0). poblacion: escala log invertida "
    + "100 − 25·log10(hab), 1 hab->100, 10.000 hab->0 (REAL, Nomenclátor 2025).",
  pesos_via: PESOS_VIA,
  confianza_nota: "confianza (0-1) por núcleo = ponderación de los flags de procedencia "
    + "(real=1, aproximación=0.6, aproximación débil=0.45, estimación=0.3) por componente y "
    + "por los pesos del IV: social con subpesos_social (uniper y dispersión siguen en "
    + "estimación Fase 0), peligro con 0.4·pendiente + 0.6·combustible, capacidad directa. "
    + "El combustible distingue fuente: Sentinel-2=aproximación (0.6; no es el mapa "
    + "calibrado), cubierta OSM de respaldo=aproximación débil (0.45), sin dato=estimación. "
    + "Etiquetas: >=0.75 alta, >=0.5 media, <0.5 baja.",
  sensibilidad_nota: "rango_iv = [min, max] del IV del núcleo al barrer los pesos del IV "
    + "(rejilla paso 0.05, cada peso en [0.15, 0.60], suma 1); ver "
    + "data/sensibilidad_pesos.json y scripts/sensibilidad-pesos.mjs.",
  satelite_pendiente_remedicion: [...SATELITE_PENDIENTE_REMEDICION],
  satelite_nota: "NDVI/NDMI RE-MEDIDOS con scripts/fetch-satelite.py (Earth Engine) sobre las "
    + "coordenadas corregidas: período PRE-incendio 2025-06-01 a 2025-07-31, buffer 1 km, "
    + "CLOUDY_PIXEL_PERCENTAGE<20 + máscara SCL, mediana temporal. Los núcleos listados en "
    + "satelite_pendiente_remedicion (si hay alguno) usan el respaldo por cubierta OSM.",
  ndmi_amplitud: NDMI_AMP,
  ndmi_rango_fijo: NDMI_RANGO_FIJO,
  ndvi_rango_fijo: NDVI_RANGO_FIJO,
  // Rangos observados en la muestra actual: SOLO referencia histórica, no se
  // usan para normalizar.
  ndmi_rango_observado_referencia: NDMI_OBSERVADO,
  ndvi_rango_observado_referencia: NDVI_OBSERVADO,
  nota_petin: "Petín tiene el NDVI/NDMI más bajos (0.357 / −0.031), por debajo de los "
    + "urbanos. Verificado (composición de cubierta OSM del buffer): 61% forest, 35% "
    + "residencial (el propio Petín), 4% viñedo; 0% agua/río Sil y 0% roca; A Rúa (a 1,75 km) "
    + "no entra en el buffer. El polígono 'forest' de OSM etiqueta laderas de solana con "
    + "monte ralo/seco: el satélite (NDVI bajo + NDMI negativo = vegetación seca) lo mide "
    + "mejor que la etiqueta OSM. Dato correcto; la coordenada ya es el nodo place de OSM.",
  nota_escalado: "Limitaciones conocidas para cuando se amplíe la muestra a más comarca: "
    + "(a) el límite inferior del rango fijo NDMI [−0.05] queda cerca del mínimo observado "
    + "(Petín −0.031) y podría quedarse corto con zonas más secas o quemados antiguos; "
    + "documentado, no se cambia ahora. (b) La calibración contra EMSR837 "
    + "(data/calibracion_emsr837.json) es EXPLORATORIA con n=12: gana valor con más muestra.",
  fuente_edad_concellos: "data/padron_edad_concellos.csv",
  fuente_accesos: "data/accesos_osm.json (OpenStreetMap, ODbL).",
  fuente_peligro: "data/pendiente_dem.json (EU-DEM 25 m) + data/ndvi_sentinel2.json + "
    + "data/ndmi_sentinel2.json (Sentinel-2 S2_SR_HARMONIZED, Earth Engine); "
    + "data/combustible_osm.json (OSM, ODbL) solo como respaldo.",
};

writeFileSync(join(DATA, "nucleos.json"), JSON.stringify(base, null, 2) + "\n", "utf8");

// Informe: combustible basado en satélite (NDVI=biomasa, NDMI=humedad).
console.log(`NDVI rango fijo [${NDVI_MIN}, ${NDVI_MAX}] (observado: ${JSON.stringify(NDVI_OBSERVADO)}) | `
  + `NDMI rango fijo [${NDMI_MIN}, ${NDMI_MAX}] (observado: ${JSON.stringify(NDMI_OBSERVADO)}) | amplitud ±${NDMI_AMP}`);
console.log("--- Combustible SATÉLITE por núcleo ---");
console.log(`${"núcleo".padEnd(26)} NDVI   NDMI   biomasa  comb  fuente`);
for (const r of informe) {
  console.log(
    `${r.nucleo.padEnd(26)} ${String(r.ndvi).padStart(5)}  ${String(r.ndmi).padStart(5)}  `
    + `${String(r.biomasa).padStart(5)}  ${String(r.comb).padStart(4)}  ${r.fuente}`
  );
}
const conSat = informe.filter((r) => r.fuente === "Sentinel-2 NDVI+NDMI").length;
console.log(`\nCombustible por satélite (NDVI+NDMI): ${conSat}/12`);

// Informe: composición del IV y comparación con el valor anclado de Fase 0.
console.log("\n--- IV compuesto desde componentes (vs. iv_fase0 anclado) ---");
console.log(`${"núcleo".padEnd(26)} peligro  social  cap   IV_fase0  IV   Δ`);
for (const r of [...informe].sort((a, b) => b.iv - a.iv)) {
  const delta = r.iv - r.iv_fase0;
  console.log(
    `${r.nucleo.padEnd(26)} ${String(r.pel).padStart(5)}  ${String(r.social).padStart(6)}  `
    + `${String(r.cap).padStart(4)}  ${String(r.iv_fase0).padStart(7)}  ${String(r.iv).padStart(3)}  `
    + `${delta >= 0 ? "+" : ""}${delta}`
  );
}
