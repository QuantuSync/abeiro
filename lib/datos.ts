// Fusión de datos de los núcleos para el mapa: nucleos.json (IV y procedencia)
// + afectación física 2025 (EMSR837) + capa de evacuación. La fusión es SOLO
// para visualización; ni la afectación ni la evacuación forman parte del
// Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";
import { dificultadEvac } from "@/lib/evacuacion";

import {NucleoProps} from "@/lib/tipos";

const afectacion = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const evacuacion = (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const nucleosBase = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;

// Colección fusionada que consume el mapa. Se calcula una vez al cargar el módulo.
export const nucleos: FeatureCollection<Point, NucleoProps> = {
  ...nucleosBase,
  features: nucleosBase.features.map((f) => {
    const props: NucleoProps = {
      ...f.properties,
      ...(afectacion[f.properties.id] || {}),
      ...(evacuacion[f.properties.id] || {}),
    };
    // Dificultad de evacuación (métrica derivada, independiente del IV).
    const d = dificultadEvac(props);
    if (d != null) props.dificultad_evac = d;
    return { ...f, properties: props };
  }),
};


