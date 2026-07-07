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

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

// Ficheros del Nomenclátor por concello (población real por aldea).
const FICHEROS_CONCELLO = [5, 9, 10, 11, 12, 13, 14, 15, 16];

const PESO_SOCIAL = 0.35;  // peso provisional de la sensibilidad social en el IV
const PESO_CAP = 0.25;     // peso provisional de la capacidad de respuesta en el IV
const PESO_PELIGRO = 0.40; // peso provisional del peligro biofísico en el IV

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp100 = (v) => Math.max(0, Math.min(100, v));

// -----------------------------------------------------------------------------
// SCORE SOCIAL (0-100): sensibilidad social del núcleo, compuesta de forma
// explícita desde las variables disponibles. Subpesos PROVISIONALES (suman 1),
// documentados en metadata.subpesos_social. Procedencia de cada variable:
//   - mayores_65: REAL por proxy de concello (Padrón IGE 2022).
//   - hogares_unipersonales: ESTIMACIÓN de Fase 0 (aún sin fuente censal).
//   - dispersion: ESTIMACIÓN de Fase 0 (categórica).
//   - poblacion: REAL por aldea (Nomenclátor IGE 2025).
// -----------------------------------------------------------------------------
const SUBPESOS_SOCIAL = {
  mayores_65: 0.45,            // envejecimiento: la variable social principal
  hogares_unipersonales: 0.20, // personas mayores que viven solas
  dispersion: 0.20,            // hábitat disperso = aviso y rescate más difíciles
  poblacion: 0.15,             // tamaño demográfico (menos vecinos = menos autoayuda)
};

// % de mayores de 65 (fracción 0-1) -> 0-100 con rango FIJO [0.15, 0.55]:
// 0.15 ≈ mínimo urbano español; 0.55 = envejecimiento extremo de aldea gallega.
const RANGO_MAYORES_65 = [0.15, 0.55];
// % de hogares unipersonales de mayores (0-100) -> 0-100 con rango FIJO [0, 50].
const RANGO_UNIPER = [0, 50];
// Dispersión categórica -> 0-100 (más dispersión = más sensibilidad).
const SCORE_DISPERSION = { "muy baja": 0, "baja": 25, "media": 50, "alta": 75, "muy alta": 100 };
// Tamaño demográfico -> 0-100 en escala logarítmica INVERTIDA: menos población,
// más sensibilidad (menos vecinos para avisar/ayudar). 1 hab -> 100; 10 -> 75;
// 100 -> 50; 1.000 -> 25; ≥10.000 -> 0.
const scorePoblacion = (pob) =>
  clamp100(100 - 25 * Math.log10(Math.max(1, pob)));

// pctMayores en fracción 0-1; pctUniper en % 0-100; dispersion categórica; pob en hab.
function scoreSocial({ pctMayores, pctUniper, dispersion, poblacion }) {
  const sMayores = clamp01((pctMayores - RANGO_MAYORES_65[0]) / (RANGO_MAYORES_65[1] - RANGO_MAYORES_65[0])) * 100;
  const sUniper = clamp01((pctUniper - RANGO_UNIPER[0]) / (RANGO_UNIPER[1] - RANGO_UNIPER[0])) * 100;
  const sDisp = SCORE_DISPERSION[dispersion] ?? 50; // categoría desconocida: neutra
  const sPob = scorePoblacion(poblacion);
  return Math.round(
    SUBPESOS_SOCIAL.mayores_65 * sMayores
    + SUBPESOS_SOCIAL.hogares_unipersonales * sUniper
    + SUBPESOS_SOCIAL.dispersion * sDisp
    + SUBPESOS_SOCIAL.poblacion * sPob
  );
}

// IV (0-100) compuesto directamente desde las tres componentes. La capacidad de
// respuesta entra INVERTIDA (100 − cap): más capacidad debe BAJAR el IV.
function calcularIV(peligro, social, capacidad) {
  return Math.round(clamp100(
    PESO_PELIGRO * peligro + PESO_SOCIAL * social + PESO_CAP * (100 - capacidad)
  ));
}

// Peligro biofísico (0-100) = combinación de PENDIENTE (real) y COMBUSTIBLE
// (aproximación). Pesos provisionales documentados.
const PESO_PENDIENTE = 0.40; // contribución de la pendiente al peligro
const PESO_COMBUST = 0.60;   // contribución de la combustibilidad al peligro

// Pendiente (grados) -> subíndice 0-100. ~35° o más = máximo (propagación muy
// acelerada). Lineal saturado, provisional.
const scorePendiente = (grados) =>
  Math.max(0, Math.min(100, Math.round((grados / 35) * 100)));

// Peligro biofísico a partir de pendiente (grados) y combustibilidad (0-100).
function peligroBiofisico(grados, combustibilidad) {
  const sp = scorePendiente(grados);
  return Math.round(PESO_PENDIENTE * sp + PESO_COMBUST * combustibilidad);
}

// AMP = amplitud máxima de la modulación por humedad (NDMI), ±30%, provisional.
const NDMI_AMP = 0.30;

// Factor de inflamabilidad por humedad (NDMI invertido, normalizado al rango
// observado): NDMI bajo (seco) -> >1; alto (húmedo) -> <1.
function factorNDMI(ndmi, ndmiMin, ndmiMax) {
  const norm = ndmiMax > ndmiMin
    ? Math.max(0, Math.min(1, (ndmi - ndmiMin) / (ndmiMax - ndmiMin)))
    : 0.5;
  return 1 + NDMI_AMP * (1 - 2 * norm); // 0(seco)->1+AMP ; 1(húmedo)->1-AMP
}

// COMBUSTIBLE BASADO EN SATÉLITE (Sentinel-2). El NDVI mide CUÁNTA biomasa hay
// (cantidad de material) y el NDMI modula la INFLAMABILIDAD (cómo de seco está):
//   biomasa      = NDVI normalizado al rango observado * 100      (0-100)
//   combustible  = biomasa * factorNDMI                            (0-100)
// => Mucha biomasa + seca = máximo; mucha biomasa + húmeda = media; poca biomasa
//    = baja esté seca o no (multiplicativo: 0 de biomasa -> 0). Esto mantiene a
//    los núcleos urbanos (NDVI bajo) con combustible bajo pese a NDMI seco.
function combustibleSatelite(ndvi, ndmi, ndviMin, ndviMax, ndmiMin, ndmiMax) {
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

// RESPALDO: combustible por cubierta OSM modulada por NDMI (solo para núcleos
// sin dato de satélite).
function combustibleOSM(combOSM, ndmi, ndmiMin, ndmiMax) {
  const factor = factorNDMI(ndmi, ndmiMin, ndmiMax);
  return { factor, combustibilidad: Math.max(0, Math.min(100, Math.round(combOSM * factor))) };
}

// Peso por CLASE de vía al contar salidas. Una pista forestal no es una vía de
// evacuación fiable ante un incendio (puede estar cortada, sin asfaltar,
// intransitable con humo), así que cuenta mucho menos que una carretera.
//   - primary/secondary/tertiary  -> 1.0  (carretera asfaltada: salida plena)
//   - unclassified/residential    -> 0.5  (vía menor: peso intermedio)
//   - track                       -> 0.2  (pista forestal: peso bajo)
const PESOS_VIA = {
  primary: 1.0, secondary: 1.0, tertiary: 1.0,
  unclassified: 0.5, residential: 0.5,
  track: 0.2,
};
const PESO_VIA_DEFECTO = 0.5; // clases no listadas: peso intermedio prudente

// Recuento PONDERADO de salidas a partir del desglose por tipo (OSM).
const salidasPonderadas = (porTipo = {}) =>
  Object.entries(porTipo).reduce(
    (acc, [tipo, n]) => acc + n * (PESOS_VIA[tipo] ?? PESO_VIA_DEFECTO), 0);

// Capacidad de respuesta (0-100) a partir del recuento (ponderado) de salidas.
// Mapeo PROVISIONAL lineal saturado (~40 salidas plenas -> 100). Mayor capacidad
// = menor vulnerabilidad (entra en el IV con signo negativo).
const capDeSalidas = (vias) =>
  Math.max(0, Math.min(100, Math.round(vias * 2.5)));

// --- utilidades CSV / normalización ------------------------------------------

function campos(linea) {
  const m = linea.match(/("(?:[^"]|"")*"|[^,]+)/g);
  return m ? m.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"')) : [];
}

function norm(nombre) {
  let s = nombre.trim().toLowerCase();
  const art = s.match(/^(.*),\s*(o|a|os|as)$/); // "rúa, a" -> "a rúa"
  if (art) s = `${art[2]} ${art[1]}`;
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // sin tildes
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
const sinEspacios = (s) => norm(s).replace(/ /g, "");

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
const pendiente = cargaCache("pendiente_dem.json"); // peligro: pendiente (real)
const combustible = cargaCache("combustible_osm.json"); // peligro: cubierta (OSM, respaldo)
const ndmi = cargaCache("ndmi_sentinel2.json");     // peligro: humedad vegetación (Sentinel-2)
const ndvi = cargaCache("ndvi_sentinel2.json");     // peligro: biomasa vegetación (Sentinel-2)

// Rangos observados (para normalizar al conjunto de núcleos).
const rango = (obj, k) => {
  const v = Object.values(obj).map((x) => x[k]).filter((n) => n != null);
  return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
};
const [NDMI_MIN, NDMI_MAX] = rango(ndmi, "ndmi");
const [NDVI_MIN, NDVI_MAX] = rango(ndvi, "ndvi");

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
  const pe = pendiente[p.id], co = combustible[p.id], nm = ndmi[p.id], nv = ndvi[p.id];
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
    + "biomasa = NDVI normalizado al rango observado [" + NDVI_MIN + "," + NDVI_MAX + "] *100; "
    + "combustibilidad = biomasa * (1±" + NDMI_AMP + ") segun NDMI invertido normalizado a ["
    + NDMI_MIN + "," + NDMI_MAX + "]. El NDVI sustituye a la cubierta OSM como medida de cantidad "
    + "de vegetación (OSM queda solo de respaldo). APROXIMACIÓN; aún no es el mapa calibrado "
    + "(fotoguía + LiDAR), pero se basa en medición directa de satélite, no en etiquetas.",
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
  ndmi_amplitud: NDMI_AMP,
  ndmi_rango_observado: [NDMI_MIN, NDMI_MAX],
  ndvi_rango_observado: [NDVI_MIN, NDVI_MAX],
  fuente_edad_concellos: "data/padron_edad_concellos.csv",
  fuente_accesos: "data/accesos_osm.json (OpenStreetMap, ODbL).",
  fuente_peligro: "data/pendiente_dem.json (EU-DEM 25 m) + data/ndvi_sentinel2.json + "
    + "data/ndmi_sentinel2.json (Sentinel-2 S2_SR_HARMONIZED, Earth Engine); "
    + "data/combustible_osm.json (OSM, ODbL) solo como respaldo.",
};

writeFileSync(join(DATA, "nucleos.json"), JSON.stringify(base, null, 2) + "\n", "utf8");

// Informe: combustible basado en satélite (NDVI=biomasa, NDMI=humedad).
console.log(`NDVI rango [${NDVI_MIN}, ${NDVI_MAX}] | NDMI rango [${NDMI_MIN}, ${NDMI_MAX}] | amplitud ±${NDMI_AMP}`);
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
