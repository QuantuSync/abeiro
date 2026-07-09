import type { FeatureCollection, Point } from "geojson";

export type Comarca = {
    id: string;
    nombre: string;
    centro: [number, number]; // [lon, lat], para el flyTo inicial
};

// Propiedades de un núcleo tras la fusión (las opcionales dependen de la fase
// de datos y de las capas presentes).
export interface NucleoProps {
    id: string;
    nombre: string;
    concello: string;
    iv: number;
    iv_fase0?: number; // IV antiguo anclado a Fase 0 (solo comparación)
    score_social?: number;
    confianza?: number; // 0-1, desde los flags de procedencia (metadata.confianza_nota)
    rango_iv?: [number, number]; // [min, max] del IV al variar los pesos (sensibilidad)
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

// interface ==> ponerle nombre a un tipo de objeto
// asi el useNucleos sabe el tipo del objeto que devuelve
export interface UseNucleosResult {
    nucleos: FeatureCollection<Point, NucleoProps>;
    //nucleosBase: FeatureCollection<Point, NucleoProps>;
    //afectacion: Record<string, Partial<NucleoProps>>;
    //no estoy seguro
    loading:boolean;
    error: Error|null
}