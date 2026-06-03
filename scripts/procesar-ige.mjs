// =============================================================================
// ABEIRO · Fase 1 — Integración del primer dato real del IGE
// =============================================================================
// Sustituye la componente de SENSIBILIDAD SOCIAL (% de mayores de 65) y la
// POBLACIÓN inventadas del Índice de Vulnerabilidad por datos reales del IGE.
//
// Fuentes (en data/, codificación ISO-8859-1 / latin1):
//   - Fichero1.txt  Nomenclátor IGE 2025: población por entidade singular (aldea).
//   - Fichero2.txt  Padrón IGE 2022: población por grupos de edad a nivel CONCELLO.
//
// Decisiones documentadas:
//   * La POBLACIÓN de cada aldea es REAL y por aldea (Nomenclátor 2025).
//   * El % de mayores de 65 se calcula a nivel CONCELLO (Padrón 2022) y se aplica
//     como PROXY a cada aldea de ese concello (no hay edad por aldea en abierto).
//     => dato de edad: año 2022, granularidad concello (proxy).
//   * El 65+ suma SOLO los grupos "65-69","70-74","75-79","80-84","85 e máis".
//     NO se suman "85-89","90-94","95-99","100 e máis" (subgrupos de "85 e máis":
//     sumarlos sería doble conteo).
//   * Se excluyen las aldeas con 0 habitantes.
//   * Los nombres se leen en latin1 y se normalizan a UTF-8 correcto al escribir.
//
// Salida: reescribe data/nucleos.json (UTF-8) y emite un informe por consola.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");

// --- utilidades ---------------------------------------------------------------

// Parser CSV mínimo: campos entre comillas (que pueden contener comas) o sueltos.
function campos(linea) {
  const m = linea.match(/("(?:[^"]|"")*"|[^,]+)/g);
  if (!m) return [];
  return m.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

// Normaliza un nombre para cruzarlo: minúsculas, sin tildes, artículo reordenado
// ("RÚA DE VALDEORRAS, A" -> "a rua de valdeorras"), separadores colapsados.
function norm(nombre) {
  let s = nombre.trim().toLowerCase();
  // Reordena el artículo final: "rúa, a" -> "a rúa", "barco, o" -> "o barco".
  const art = s.match(/^(.*),\s*(o|a|os|as)$/);
  if (art) s = `${art[2]} ${art[1]}`;
  // Quita tildes/diacríticos.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Deja solo alfanumérico y espacios.
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return s;
}
const sinEspacios = (s) => norm(s).replace(/ /g, "");

// --- 1) Padrón por edad (Fichero2): % 65+ por concello ------------------------

const GRUPOS_65_MAS = new Set(["65-69", "70-74", "75-79", "80-84", "85 e máis"]);

function leerEdadPorConcello() {
  const lineas = readFileSync(join(DATA, "Fichero2.txt"), "latin1")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  // CodTempo,Tempo,Sexo,"Grupos de idade",CodEspazo,Espazo,DatoN,DatoT
  const acc = {}; // codEspazo -> { espazo, total, suma65 }
  for (let i = 1; i < lineas.length; i++) {
    const f = campos(lineas[i]);
    const [, , sexo, grupo, codEspazo, espazo, datoN] = f;
    if (sexo !== "Total") continue; // SOLO Sexo == "Total"
    const val = Number(datoN);
    acc[codEspazo] ??= { espazo, total: 0, suma65: 0 };
    if (grupo === "Total") acc[codEspazo].total = val;
    if (GRUPOS_65_MAS.has(grupo)) acc[codEspazo].suma65 += val;
  }
  // pct como FRACCIÓN 0-1.
  for (const k of Object.keys(acc)) {
    const c = acc[k];
    c.pct65 = c.total > 0 ? c.suma65 / c.total : null;
  }
  return acc;
}

// --- 2) Nomenclátor (Fichero1): población por aldea ---------------------------

function leerNomenclator() {
  const lineas = readFileSync(join(DATA, "Fichero1.txt"), "latin1")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  // ano,codprov,codmun,ec,es,nuc,nome,pobtotal,pobhomes,pobmulleres
  const aldeas = [];
  for (let i = 1; i < lineas.length; i++) {
    const f = campos(lineas[i]);
    const [, codprov, codmun, , , , nome, pobtotal] = f;
    const pob = Number(pobtotal);
    if (!Number.isFinite(pob) || pob <= 0) continue; // excluye 0 habitantes
    aldeas.push({
      nome,
      pob,
      codEspazo: `${codprov}${codmun}`, // p.ej. "32" + "088" -> "32088"
      norm: norm(nome),
      sinEsp: sinEspacios(nome),
    });
  }
  return aldeas;
}

// --- 3) Cruce núcleo del mapa -> aldea del Nomenclátor ------------------------

// Alias para casos donde el nombre del mapa colisiona o difiere del oficial.
// "A Rúa" (vila, ~4119 hab, codmun 072) colisiona con "RÚA, A" (aldea de 8 hab,
// codmun 035): forzamos el nombre oficial del Nomenclátor para desambiguar.
const ALIAS = {
  "a-rua": "Rúa de Valdeorras, A",
};

function cruzar(nucleoId, nombre, aldeas) {
  const objetivo = ALIAS[nucleoId] ? norm(ALIAS[nucleoId]) : norm(nombre);
  const objetivoSE = ALIAS[nucleoId] ? sinEspacios(ALIAS[nucleoId]) : sinEspacios(nombre);

  // a) Coincidencia exacta normalizada (si hay varias, la de mayor población).
  let cands = aldeas.filter((a) => a.norm === objetivo);
  // b) Prefijo de token en cualquier dirección ("o barco" ~ "o barco de valdeorras").
  if (!cands.length) {
    cands = aldeas.filter(
      (a) => a.norm.startsWith(objetivo + " ") || objetivo.startsWith(a.norm + " ")
    );
  }
  // c) Última red: igualdad ignorando espacios ("vilar de silva" ~ "vilardesilva").
  if (!cands.length) cands = aldeas.filter((a) => a.sinEsp === objetivoSE);

  if (!cands.length) return null;
  cands.sort((x, y) => y.pob - x.pob); // mayor población gana la desambiguación
  return cands[0];
}

// --- 4) Recalcular SOLO la componente social del IV --------------------------

// Peso PROVISIONAL de la sensibilidad social dentro del IV. NO es un peso
// calibrado: en una fase posterior el IV se ajusta como modelo supervisado
// (ROC/AUC) contra el resultado humano de 2025, no con pesos elegidos a mano.
// Aquí solo se usa para trasladar el cambio del % de mayores (invento -> real)
// al IV existente, sin tocar peligro biofísico ni capacidad de respuesta.
const PESO_SOCIAL = 0.35;

// --- ejecución ----------------------------------------------------------------

const edad = leerEdadPorConcello();
const aldeas = leerNomenclator();

const ruta = join(DATA, "nucleos.json");
const fc = JSON.parse(readFileSync(ruta, "utf8"));

const informe = [];

for (const feat of fc.features) {
  const p = feat.properties;
  const pctInventadoFrac = p.pct_mayores_65 > 1 ? p.pct_mayores_65 / 100 : p.pct_mayores_65;

  const aldea = cruzar(p.id, p.nombre, aldeas);

  if (!aldea) {
    // Sin correspondencia: conserva todo, solo normaliza el % a fracción 0-1.
    p.pct_mayores_65 = Number(pctInventadoFrac.toFixed(4));
    p.dato_poblacion_real = false;
    p.dato_edad_real = false;
    informe.push({ id: p.id, nombre: p.nombre, estado: "SIN CORRESPONDENCIA" });
    continue;
  }

  // Población REAL por aldea (Nomenclátor 2025).
  p.poblacion = aldea.pob;
  p.dato_poblacion_real = true;
  p.fuente_poblacion = "Nomenclátor IGE 2025 (entidade singular)";
  p.ige_nome = aldea.nome; // nombre oficial cruzado (UTF-8)
  p.ige_codmun = aldea.codEspazo;

  // Edad: proxy de concello (Padrón 2022), solo si el concello está en Fichero2.
  const ec = edad[aldea.codEspazo];
  if (ec && ec.pct65 != null) {
    const ivPrevio = p.iv;
    p.pct_mayores_65 = Number(ec.pct65.toFixed(4)); // fracción 0-1, REAL
    p.dato_edad_real = true;
    p.edad_proxy_concello = true;
    p.fuente_edad = `Padrón IGE 2022 (proxy concello: ${ec.espazo})`;
    // Recalcula SOLO la componente social del IV (delta por el peso provisional).
    const delta = PESO_SOCIAL * (p.pct_mayores_65 - pctInventadoFrac) * 100;
    p.iv = Math.round(Math.max(0, Math.min(100, ivPrevio + delta)));
    informe.push({
      id: p.id, nombre: p.nombre, estado: "DATO REAL (pob + edad)",
      ige: aldea.nome, pob: aldea.pob, pct65: p.pct_mayores_65,
      ivPrevio, ivNuevo: p.iv,
    });
  } else {
    // Hay población real pero el concello no está en el Padrón de edad.
    p.pct_mayores_65 = Number(pctInventadoFrac.toFixed(4)); // sigue inventado
    p.dato_edad_real = false;
    p.edad_proxy_concello = true;
    p.fuente_edad = "estimación provisional (concello sin Padrón de edad en datos)";
    informe.push({
      id: p.id, nombre: p.nombre, estado: "POBLACIÓN REAL · edad aún inventada",
      ige: aldea.nome, pob: aldea.pob,
    });
  }
}

// Metadatos del FeatureCollection.
fc.metadata = {
  ...fc.metadata,
  fase: "Fase 1 (parcial): población real (Nomenclátor IGE 2025) integrada; % de "
    + "mayores de 65 real (Padrón IGE 2022) donde el concello está disponible.",
  edad_nota: "El % de mayores de 65 es proxy a nivel concello (2022); la población "
    + "es real por aldea (2025). pct_mayores_65 es una fracción 0-1.",
};

writeFileSync(ruta, JSON.stringify(fc, null, 2) + "\n", "utf8");

// Informe.
console.log("Concellos con edad en Fichero2:",
  Object.entries(edad).map(([k, v]) => `${k} (${v.espazo}) pct65=${v.pct65.toFixed(4)}`).join("; "));
console.log("Aldeas Nomenclátor con población > 0:", aldeas.length);
console.log("\n--- Cruce de núcleos del mapa ---");
for (const r of informe) console.log(JSON.stringify(r));
const real = informe.filter((r) => r.estado.startsWith("DATO REAL")).map((r) => r.nombre);
const pobReal = informe.filter((r) => r.estado.startsWith("POBLACIÓN REAL")).map((r) => r.nombre);
const sin = informe.filter((r) => r.estado === "SIN CORRESPONDENCIA").map((r) => r.nombre);
console.log("\nEdad REAL:", real.length ? real.join(", ") : "(ninguno)");
console.log("Población real, edad inventada:", pobReal.length ? pobReal.join(", ") : "(ninguno)");
console.log("Sin correspondencia:", sin.length ? sin.join(", ") : "(ninguno)");
