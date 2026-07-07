// Fusión de datos de los núcleos para el mapa: nucleos.json (IV y procedencia)
// + afectación física 2025 (EMSR837) + capa de evacuación. La fusión es SOLO
// para visualización; ni la afectación ni la evacuación forman parte del
// Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";
import { dificultadEvac } from "@/lib/evacuacion";

// Propiedades de un núcleo tras la fusión (las opcionales dependen de la fase
// de datos y de las capas presentes).
export interface NucleoProps {
  id: string;
  nombre: string;
  concello: string;
  iv: number;
  iv_fase0?: number; // IV antiguo anclado a Fase 0 (solo comparación)
  score_social?: number;
  poblacion: number;
  pct_mayores_65: number; // fracción 0-1
  pct_hogares_uniper_mayores: number;
  dispersion: string;
  distancia_servicios_km: number;
  peligro_biofisico: number;
  capacidad_respuesta: number;
  num_accesos: number;
  cobertura_movil: string;
  notas: string;
  // Procedencia del dato (Fase 1).
  dato_poblacion_real?: boolean;
  dato_edad_real?: boolean;
  edad_proxy_concello?: boolean;
  fuente_poblacion?: string;
  fuente_edad?: string;
  ige_nome?: string;
  // Capacidad de respuesta (vías de salida, OpenStreetMap).
  vias_salida?: number;
  vias_salida_ponderadas?: number;
  vias_salida_por_tipo?: Record<string, number>;
  dato_capacidad_real?: boolean;
  fuente_capacidad?: string;
  // Peligro biofísico (pendiente real + combustible Sentinel-2 NDVI+NDMI u OSM).
  pendiente_grados?: number;
  cota_m?: number;
  combustibilidad?: number;
  cobertura_osm?: number;
  biomasa_ndvi?: number;
  combustible_dominante?: string;
  combustible_fuente?: string;
  ndvi?: number;
  ndmi?: number;
  dato_pendiente_real?: boolean;
  dato_combustible_aprox?: boolean;
  combustible_sin_dato?: boolean;
  // Afectación física 2025 (validación EMSR837; NO es parte del IV).
  afect_fisica?: boolean;
  borde_500m?: boolean;
  fecha_frente?: string | null;
  dist_area_m?: number;
  // Evacuación estática (capa independiente; NO es parte del IV).
  es_destino?: boolean;
  destino?: string;
  destino_nombre?: string;
  dist_km?: number;
  dist_recta_km?: number;
  ratio_rodeo?: number;
  tiempo_min?: number;
  rutas_alternativas?: number | null;
  fiabilidad?: number;
  pct_track?: number;
  dificultad_evac?: number;
}

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
