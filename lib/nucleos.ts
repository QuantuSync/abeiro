import type { 
  /* Estructura de datos estándar en formato GeoJSON diseñada para agrupar múltiples objetos geográficos 
  (puntos, líneas o polígonos) y sus atributos asociados en un único conjunto de datos 
  - Features ==> geometry: {...}, properties: {...}*/
  FeatureCollection, 
  Point 
} from "geojson";


// FUTURO... esto hay que refactorizarlo. no tiene sentido depender de components
import type { NucleoProps } from "@/components/PanelInfo";
import { dificultadEvac } from "@/lib/evacuacion";




export function construirNucleos(
  nucleosBase: FeatureCollection<Point, NucleoProps>,
  afectacion: Record<string, Partial<NucleoProps>>,
  evacuacion: Record<string, Partial<NucleoProps>>
): FeatureCollection<Point, NucleoProps> {
  return {
    ...nucleosBase,
    features: nucleosBase.features.map((f) => {
        const props: NucleoProps = {
        ...f.properties,
        ...(afectacion[f.properties.id] || {}),
        ...(evacuacion[f.properties.id] || {}),
        };
        // Dificultad de evacuación (métrica derivada, independiente del IV).
        const d = dificultadEvac(props);
        //esta linea mejor? const props: NucleoProps = d != null ? { ...propsBase, dificultad_evac: d } : propsBase;
        if (d != null) props.dificultad_evac = d;
        return { ...f, properties: props };
    }),
  }
}