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

const PESO_SOCIAL = 0.35; // peso provisional de la sensibilidad social en el IV
const PESO_CAP = 0.25;    // peso provisional de la capacidad de respuesta en el IV

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

// Caché de accesos OSM (capacidad de respuesta). Opcional: si no existe, la
// componente de capacidad se deja como en la base.
const ACCESOS_PATH = join(DATA, "accesos_osm.json");
const accesos = existsSync(ACCESOS_PATH)
  ? JSON.parse(readFileSync(ACCESOS_PATH, "utf8")).nucleos || {}
  : {};

const informe = [];

for (const feat of base.features) {
  const p = feat.properties;
  const iv0 = p.iv;
  const pct0 = (p.pct_mayores_65 > 1 ? p.pct_mayores_65 / 100 : p.pct_mayores_65); // fracción
  const cap0 = p.capacidad_respuesta; // capacidad invent. de la base (0-100)

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

  p.iv = Math.round(Math.max(0, Math.min(100, iv0 + deltaSocial + deltaCap)));

  // IV "antes de ponderar" (capacidad con recuento bruto), solo para el informe.
  const ivSinPonderar = ac
    ? Math.round(Math.max(0, Math.min(100, iv0 + deltaSocial - PESO_CAP * (capSinPonderar - cap0))))
    : p.iv;

  informe.push({
    nucleo: p.nombre,
    vias: ac ? ac.vias_salida : "—",
    viasPond: ac ? Number(salidasPonderadas(ac.por_tipo).toFixed(1)) : "—",
    capBruta: capSinPonderar ?? "—",
    cap: p.capacidad_respuesta,
    ivBruto: ivSinPonderar,
    iv: p.iv,
    porTipo: ac ? ac.por_tipo : {},
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
    + "por clase (primary/secondary/tertiary=1.0; unclassified/residential=0.5; track=0.2). "
    + "Peligro biofísico sigue estimado.",
  pesos_via: PESOS_VIA,
  fuente_edad_concellos: "data/padron_edad_concellos.csv",
  fuente_accesos: "data/accesos_osm.json (OpenStreetMap, ODbL).",
};

writeFileSync(join(DATA, "nucleos.json"), JSON.stringify(base, null, 2) + "\n", "utf8");

// Informe
console.log("Concellos con edad (CSV):",
  Object.entries(edad).map(([k, v]) => `${k}=${(v.pct * 100).toFixed(1)}%`).join("  "));
console.log("Pesos por clase de vía:", JSON.stringify(PESOS_VIA));
console.log("\n--- Capacidad: bruta (sin ponderar) -> ponderada, y efecto en el IV ---");
console.log(`${"núcleo".padEnd(26)} ${"vías(brutas->pond)".padEnd(20)} cap(bruta->pond)  iv(bruto->pond)`);
for (const r of informe) {
  console.log(
    `${r.nucleo.padEnd(26)} ${`${r.vias} -> ${r.viasPond}`.padEnd(20)} `
    + `${String(r.capBruta).padStart(3)} -> ${String(r.cap).padStart(3)}        `
    + `${String(r.ivBruto).padStart(3)} -> ${String(r.iv).padStart(3)}   ${JSON.stringify(r.porTipo)}`
  );
}
const realCap = informe.filter((r) => r.vias !== "—").length;
console.log(`\nCAPACIDAD (vías OSM ponderadas) real: ${realCap}/12`);
