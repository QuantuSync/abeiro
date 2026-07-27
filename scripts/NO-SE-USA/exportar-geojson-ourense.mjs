//CREAR GEOJSONS QUE YA NO SE USAN

// Exporta public/nucleos_ourense.geojson: los núcleos activos de Ourense con
// las propiedades mínimas para el mapa a escala (clustering MapLibre). Fuente:
// data/nucleos_ourense.json (IV) + data/afectacion_globfire_ourense.json.
// Uso:  node scripts/exportar-geojson-ourense.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const PUBLIC = join(DIR, "..", "public");

const fc = JSON.parse(readFileSync(join(DATA, "nucleos_ourense.json"), "utf8"));
const afe = JSON.parse(readFileSync(join(DATA, "afectacion_globfire_ourense.json"), "utf8")).nucleos;

const features = fc.features
  .filter((f) => f.properties.activo && f.properties.iv != null)
  .map((f) => {
    const p = f.properties, a = afe[p.id] || {};
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id: p.id, nombre: p.nombre, concello: p.concello,
        iv: p.iv, poblacion: p.poblacion,
        peligro_biofisico: p.peligro_biofisico, score_social: p.score_social,
        capacidad_respuesta: p.capacidad_respuesta, confianza: p.confianza,
        afectado_hist: !!a.afectado_hist, n_afectaciones: a.n_afectaciones ?? 0,
      },
    };
  });

const salida = {
  type: "FeatureCollection",
  metadata: {
    descripcion: "Núcleos activos (>=50 hab) de Ourense con IV y afectación histórica, "
      + "para el mapa a escala (clustering). Vulnerabilidad; sin evacuación.",
    n: features.length,
  },
  features,
};
writeFileSync(join(PUBLIC, "nucleos_ourense.geojson"), JSON.stringify(salida) + "\n", "utf8");
console.log(`Escrito public/nucleos_ourense.geojson (${features.length} núcleos)`);
