// Configuración estática del mapa: estilo base, encuadre inicial y qué capas
// pertenecen a cada lente (vulnerabilidad / evacuación).
import type maplibregl from "maplibre-gl";

// Capas que solo se muestran en cada lente.
export const CAPAS_VULN = ["nucleos-dato-real", "nucleos-afectado", "perimetro-fill", "perimetro-line"];
export const CAPAS_EVAC = ["rutas-resaltada", "rutas-casing", "rutas-evacuacion", "destinos-seguros"];

// Basemap neutro pero LEGIBLE sin clave de API: CARTO Voyager. Tiene más
// contraste y color que Positron (carreteras y topónimos más marcados, se leen
// con claridad) manteniéndose limpio. Pensado para legibilidad de usuarios
// mayores: que pueblos, carreteras y colores de riesgo se distingan sin esfuerzo.
export const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  // Glyphs (fuentes para etiquetas symbol). Debe servir PBF válido: el endpoint
  // de openmaptiles devolvía HTML y provocaba el error "Unimplemented type: 4".
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · '
        + '© <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#e7e2d8" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 1 } },
  ],
};

// Centro aproximado de la comarca piloto (Valdeorras / Larouco), ajustado a
// las coordenadas reales de los núcleos (bbox 42.15-42.46).
export const CENTRO: [number, number] = [-7.05, 42.35];
export const ZOOM_INICIAL = 9.4;
