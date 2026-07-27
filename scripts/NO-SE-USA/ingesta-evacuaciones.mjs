// =============================================================================
// ABEIRO · Ingesta de datos de evacuación/confinamiento (andamiaje para AXEGA)
// =============================================================================
// Lee registros de evacuaciones/confinamientos (esquema documentado en
// data/evacuaciones_ejemplo.json) y produce, POR NÚCLEO, la variable de
// resultado de IMPACTO HUMANO, análoga a `afectado_hist` de GlobFire:
//   - evacuado_hist    : ¿el núcleo fue evacuado o confinado alguna vez?
//   - n_evacuaciones   : nº de eventos distintos (por fecha+evento) que lo afectaron
//
// Esta variable es la que permite VALIDAR LA VULNERABILIDAD SOCIAL del índice
// (a diferencia de GlobFire, que mide exposición del paisaje). Cuando lleguen los
// datos reales de AXEGA en data/evacuaciones.json, este script los convierte en
// la variable de resultado sin más desarrollo.
//
// Cruce por (codmun, nombre normalizado) contra la lista maestra; si el registro
// no trae núcleo, se imputa a TODOS los núcleos activos del concello.
//
// Uso:  node scripts/ingesta-evacuaciones.mjs [ruta_entrada]
//       (por defecto data/evacuaciones.json; si no existe, usa el ejemplo)
// =============================================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { norm } from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const SALIDA = join(DATA, "evacuacion_resultado_ourense.json");

const arg = process.argv[2];
const rutaReal = join(DATA, "evacuaciones.json");
const rutaEjemplo = join(DATA, "evacuaciones_ejemplo.json");
const entrada = arg ? join(process.cwd(), arg) : (existsSync(rutaReal) ? rutaReal : rutaEjemplo);
const esEjemplo = entrada === rutaEjemplo;

const src = JSON.parse(readFileSync(entrada, "utf8"));
const registros = src.registros || [];
console.log(`Entrada: ${entrada}${esEjemplo ? "  (PLANTILLA ficticia — no son datos reales)" : ""}`);
console.log(`Registros: ${registros.length}`);

const fc = JSON.parse(readFileSync(join(DATA, "nucleos_ourense.json"), "utf8"));
const activos = fc.features.filter((f) => f.properties.activo);
// Índices: por (codmun, norm) y por codmun -> lista de ids.
const porClave = new Map(), porConcello = new Map();
for (const f of activos) {
  const p = f.properties;
  porClave.set(`${p.codmun}|${norm(p.nombre)}`, p.id);
  porClave.set(`${p.codmun}|${norm(p.ige_nome || p.nombre)}`, p.id);
  (porConcello.get(p.codmun) || porConcello.set(p.codmun, []).get(p.codmun)).push(p.id);
}

// Acumula eventos por núcleo (dedup por fecha+evento).
const eventos = new Map(); // id -> Set("fecha|evento")
const anota = (id, ev) => (eventos.get(id) || eventos.set(id, new Set()).get(id)).add(ev);
let sinCruce = 0;
for (const r of registros) {
  const ev = `${r.fecha || "?"}|${r.evento || "?"}`;
  if (r.nucleo_nombre) {
    const id = porClave.get(`${r.codmun}|${norm(r.nucleo_nombre)}`);
    if (id) { anota(id, ev); continue; }
    sinCruce++;
  }
  // Sin núcleo (o núcleo no casado): imputar a todo el concello.
  for (const id of porConcello.get(r.codmun) || []) anota(id, ev);
}

const nucleos = {};
for (const f of activos) {
  const s = eventos.get(f.properties.id);
  nucleos[f.properties.id] = {
    evacuado_hist: !!s && s.size > 0,
    n_evacuaciones: s ? s.size : 0,
  };
}

const out = {
  metadata: {
    descripcion: "Variable de resultado de IMPACTO HUMANO por núcleo (evacuado_hist, "
      + "n_evacuaciones), derivada de registros de evacuación/confinamiento. Análoga a "
      + "afectado_hist de GlobFire, pero mide DECISIÓN HUMANA de emergencia: es la que valida "
      + "la vulnerabilidad SOCIAL del índice.",
    fuente_entrada: entrada.replace(DATA, "data"),
    es_plantilla: esEjemplo,
    registros_leidos: registros.length,
    registros_sin_cruce_de_nucleo: sinCruce,
    n_nucleos: Object.keys(nucleos).length,
  },
  nucleos,
};
writeFileSync(SALIDA, JSON.stringify(out, null, 2) + "\n", "utf8");

const ev = Object.values(nucleos).filter((v) => v.evacuado_hist).length;
console.log(`Núcleos con evacuación/confinamiento: ${ev}/${activos.length}`);
if (esEjemplo) console.log("AVISO: resultado derivado de la PLANTILLA ficticia; no es real.");
console.log(`Escrito ${SALIDA.replace(DATA, "data")}`);
console.log("Siguiente: node scripts/calibracion-ourense.mjs evacuacion");
