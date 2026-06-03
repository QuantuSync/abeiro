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
//   * IV: se recalcula SOLO la componente social, como delta desde la base:
//       iv = iv0 + PESO_SOCIAL * (pct_real - pct0) * 100
//     dejando intactas peligro biofísico y capacidad de respuesta. El peso es
//     PROVISIONAL (no calibrado); la calibración supervisada (ROC/AUC) es fase
//     posterior. Si un concello no tiene edad disponible, el núcleo conserva iv0.
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

// Refinamiento del combustible con NDMI (Sentinel-2): MODULACIÓN MULTIPLICATIVA
// de la combustibilidad de cubierta (OSM) por un factor derivado del NDMI
// invertido y normalizado al rango observado entre los núcleos.
//   - NDMI bajo  (vegetación seca) -> factor > 1 (sube el peligro)
//   - NDMI alto  (vegetación húmeda) -> factor < 1 (baja el peligro)
// Al ser multiplicativo, "poca vegetación = bajo peligro" se conserva (un valor
// bajo de cubierta sigue siendo bajo); "densa y seca = máximo; densa y húmeda =
// menos". AMP = amplitud máxima del ajuste (±30%), provisional.
const NDMI_AMP = 0.30;
function combustibleRefinado(combOSM, ndmi, ndmiMin, ndmiMax) {
  const norm = ndmiMax > ndmiMin
    ? Math.max(0, Math.min(1, (ndmi - ndmiMin) / (ndmiMax - ndmiMin)))
    : 0.5;
  const factor = 1 + NDMI_AMP * (1 - 2 * norm); // norm 0(seco)->1+AMP ; 1(húmedo)->1-AMP
  return { factor, refinado: Math.max(0, Math.min(100, Math.round(combOSM * factor))) };
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
const combustible = cargaCache("combustible_osm.json"); // peligro: combustible cubierta (OSM)
const ndmi = cargaCache("ndmi_sentinel2.json");     // peligro: humedad vegetación (Sentinel-2)

// Rango observado de NDMI entre los núcleos (para normalizar el refinamiento).
const ndmiVals = Object.values(ndmi).map((x) => x.ndmi).filter((v) => v != null);
const NDMI_MIN = ndmiVals.length ? Math.min(...ndmiVals) : 0;
const NDMI_MAX = ndmiVals.length ? Math.max(...ndmiVals) : 1;

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

  // --- componente PELIGRO BIOFÍSICO (pendiente real + combustible OSM+NDMI) ---
  const pe = pendiente[p.id], co = combustible[p.id], nm = ndmi[p.id];
  let deltaPeligro = 0;
  let combOSM = co?.combustibilidad ?? null; // combustibilidad de cubierta (OSM)
  let pelOSM = null; // peligro solo con cubierta OSM (sin NDMI), para el informe
  if (pe && pe.pendiente_grados != null) {
    p.pendiente_grados = pe.pendiente_grados;
    p.cota_m = pe.cota_m;
    p.dato_pendiente_real = true; // pendiente: DATO REAL (DEM)
    let pelReal;
    if (combOSM != null) {
      p.combustible_dominante = co.dominante;
      p.dato_combustible_aprox = true;
      pelOSM = peligroBiofisico(pe.pendiente_grados, combOSM);
      if (nm && nm.ndmi != null) {
        // Refina la cubierta OSM con la humedad de la vegetación (NDMI Sentinel-2).
        const { factor, refinado } = combustibleRefinado(combOSM, nm.ndmi, NDMI_MIN, NDMI_MAX);
        p.combustibilidad_osm = combOSM;     // cubierta sin modular (referencia)
        p.combustibilidad = refinado;        // combustibilidad refinada (la que cuenta)
        p.ndmi = nm.ndmi;
        p.ndmi_factor = Number(factor.toFixed(3));
        p.combustible_fuente = "OSM + NDMI Sentinel-2";
        p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: cubierta OSM modulada "
          + "por humedad de vegetación NDMI Sentinel-2 (verano 2025). Aproximación; aún no es "
          + "el mapa de combustible calibrado (fotoguía + LiDAR).";
        pelReal = peligroBiofisico(pe.pendiente_grados, refinado);
      } else {
        p.combustibilidad = combOSM;
        p.combustible_fuente = "OSM";
        p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: OSM landuse/natural "
          + "(aproximación provisional, no mapa de combustible calibrado).";
        pelReal = pelOSM;
      }
    } else {
      // Hueco de cartografía OSM: sin landuse/natural en el entorno. Peligro a
      // partir de la PENDIENTE sola (real); el combustible queda sin dato.
      p.combustible_dominante = null;
      p.dato_combustible_aprox = false;
      p.combustible_sin_dato = true;
      p.combustible_fuente = null;
      pelReal = scorePendiente(pe.pendiente_grados);
      pelOSM = pelReal;
      p.fuente_peligro = "Pendiente: EU-DEM 25 m (real). Combustible: sin dato OSM "
        + "(hueco de cartografía); peligro derivado solo de la pendiente.";
    }
    p.peligro_biofisico = pelReal;
    deltaPeligro = PESO_PELIGRO * (pelReal - pel0); // más peligro -> más vulnerabilidad
  } else {
    p.dato_pendiente_real = false;
    p.dato_combustible_aprox = false;
  }

  p.iv = Math.round(Math.max(0, Math.min(100, iv0 + deltaSocial + deltaCap + deltaPeligro)));

  // IV "antes del NDMI" (combustible solo cubierta OSM), para el informe.
  const ivOSM = pelOSM != null
    ? Math.round(Math.max(0, Math.min(100, iv0 + deltaSocial + deltaCap + PESO_PELIGRO * (pelOSM - pel0))))
    : p.iv;

  informe.push({
    nucleo: p.nombre,
    ndmi: nm?.ndmi ?? "—",
    combOSM: combOSM ?? "—",
    combRef: combOSM != null ? p.combustibilidad : "—",
    pelOSM: pelOSM ?? "—",
    pel: p.peligro_biofisico,
    ivOSM,
    iv: p.iv,
  });
}

base.metadata = {
  ...base.metadata,
  fase: "Fase 1: población real (Nomenclátor IGE 2025), % de mayores de 65 real "
    + "(Padrón IGE 2022, proxy concello) y capacidad de respuesta por vías de salida "
    + "real (OpenStreetMap/Overpass) para los núcleos del piloto.",
  edad_nota: "pct_mayores_65 es fracción 0-1, proxy a nivel concello (2022); la "
    + "población es real por aldea (2025).",
  capacidad_nota: "capacidad_respuesta se deriva de las vías de salida OSM PONDERADAS "
    + "por clase (primary/secondary/tertiary=1.0; unclassified/residential=0.5; track=0.2).",
  peligro_nota: "peligro_biofisico = " + PESO_PENDIENTE + "*score_pendiente + " + PESO_COMBUST
    + "*combustibilidad. Pendiente: EU-DEM 25 m (REAL). Combustible: cubierta OSM landuse/natural "
    + "MODULADA por humedad de vegetación NDMI Sentinel-2 (verano 2025), factor multiplicativo "
    + "1±" + NDMI_AMP + " segun NDMI invertido y normalizado al rango observado [" + NDMI_MIN + ","
    + NDMI_MAX + "]. APROXIMACIÓN; aún no es el mapa de combustible calibrado (fotoguía + LiDAR).",
  pesos_iv: { peligro_biofisico: PESO_PELIGRO, sensibilidad_social: PESO_SOCIAL, capacidad_respuesta: PESO_CAP },
  pesos_via: PESOS_VIA,
  ndmi_amplitud: NDMI_AMP,
  ndmi_rango_observado: [NDMI_MIN, NDMI_MAX],
  fuente_edad_concellos: "data/padron_edad_concellos.csv",
  fuente_accesos: "data/accesos_osm.json (OpenStreetMap, ODbL).",
  fuente_peligro: "data/pendiente_dem.json (EU-DEM 25 m) + data/combustible_osm.json (OSM, ODbL) "
    + "+ data/ndmi_sentinel2.json (Sentinel-2 S2_SR_HARMONIZED, Earth Engine).",
};

writeFileSync(join(DATA, "nucleos.json"), JSON.stringify(base, null, 2) + "\n", "utf8");

// Informe: efecto del NDMI sobre combustible, peligro e IV.
console.log(`NDMI rango observado: [${NDMI_MIN}, ${NDMI_MAX}] | amplitud ±${NDMI_AMP}`);
console.log("--- Combustible OSM -> refinado(NDMI), peligro e IV (antes->después del NDMI) ---");
console.log(`${"núcleo".padEnd(26)} NDMI   combOSM->ref  peligro(osm->ref)  IV(osm->ref)`);
for (const r of informe) {
  console.log(
    `${r.nucleo.padEnd(26)} ${String(r.ndmi).padStart(5)}  ${String(r.combOSM).padStart(3)} -> ${String(r.combRef).padStart(3)}      `
    + `${String(r.pelOSM).padStart(3)} -> ${String(r.pel).padStart(3)}        `
    + `${String(r.ivOSM).padStart(3)} -> ${String(r.iv).padStart(3)}`
  );
}
const conNdmi = informe.filter((r) => r.ndmi !== "—" && r.combOSM !== "—").length;
console.log(`\nCombustible refinado con NDMI: ${conNdmi}/12`);
const sinRef = informe.filter((r) => r.combOSM === "—").map((r) => r.nucleo);
if (sinRef.length) console.log("Sin cubierta OSM (peligro solo-pendiente, NDMI no aplicable):", sinRef.join(", "));
