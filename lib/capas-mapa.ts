// Creación de fuentes y capas de MapLibre. Funciones puras sobre la instancia
// del mapa: no tocan estado de React. El ORDEN de llamada define el apilado
// (z-order) y debe ser: perímetro (fondo) -> rutas -> núcleos (cima).
import type maplibregl from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";

import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import type { NucleoProps } from "@/lib/tipos";

// Capas de la lente de VULNERABILIDAD: perímetro quemado EMSR837 (capa de
// validación). Se carga del estático (recortado al piloto y simplificado) para
// no inflar el bundle. Velo translúcido: relleno muy tenue + contorno suave,
// para que no compita con los núcleos.
export function anadirCapasVulnerabilidad(map: maplibregl.Map): void {
  map.addSource("perimetro", { type: "geojson", data: "/perimetro_emsr837.geojson" });
  map.addLayer({
    id: "perimetro-fill",
    type: "fill",
    source: "perimetro",
    paint: { "fill-color": "#7a1f12", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "perimetro-line",
    type: "line",
    source: "perimetro",
    paint: { "line-color": "#7a1f12", "line-width": 0.8, "line-opacity": 0.4 },
  });
}

// Capas de la lente de EVACUACIÓN: rutas (capa independiente). Casing blanco
// debajo + línea de color encima, para que destaquen con fuerza sobre el
// basemap. Color por % de pista forestal: azul = fiable (asfalto), naranja =
// depende de pista, rojo = mucha pista. Azul en vez del verde original por
// accesibilidad (verde/naranja/rojo se confunden con deuteranopia) y por
// coherencia con la lente (azul = evacuación fácil). (El marcador de destinos
// seguros vive en anadirCapasNucleos por orden de apilado: bajo el halo.)
export function anadirCapasEvacuacion(map: maplibregl.Map): void {
  map.addSource("rutas", { type: "geojson", data: "/rutas_evacuacion.geojson" });
  // Resaltado dorado (glow) de la ruta del núcleo seleccionado al pulsar
  // "Ruta de escape en coche". Filtro vacío hasta que se active.
  map.addLayer({
    id: "rutas-resaltada",
    type: "line",
    source: "rutas",
    layout: { "line-cap": "round", "line-join": "round" },
    filter: ["==", ["get", "id"], "__ninguna__"],
    paint: { "line-width": 13, "line-color": "#c8a44a", "line-opacity": 0.85, "line-blur": 1 },
  });
  map.addLayer({
    id: "rutas-casing",
    type: "line",
    source: "rutas",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": 7, "line-color": "#ffffff", "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "rutas-evacuacion",
    type: "line",
    source: "rutas",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 4,
      "line-opacity": 1,
      "line-color": [
        "step", ["get", "pct_track"],
        "#0571b0", 15, "#e08214", 30, "#ca0020",
      ],
    },
  });
}

// Capas de los NÚCLEOS (compartidas por las dos lentes, salvo donde se indica).
export function anadirCapasNucleos(
  map: maplibregl.Map,
  datos: FeatureCollection<Point, NucleoProps>,
): void {
  map.addSource("nucleos", { type: "geojson", data: datos });

  // Destinos seguros (cabeceras comarcales), solo lente de evacuación.
  map.addLayer({
    id: "destinos-seguros",
    type: "circle",
    source: "nucleos",
    filter: ["==", ["get", "es_destino"], true],
    paint: {
      "circle-radius": 7,
      "circle-color": "#0b6e99",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Halo blanco para separar el marcador del basemap (legibilidad).
  map.addLayer({
    id: "nucleos-halo",
    type: "circle",
    source: "nucleos",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "iv"],
        0, 7.5, 100, 14,
      ],
      "circle-color": "#ffffff",
      "circle-opacity": 0.92,
    },
  });

  // Círculo coloreado por Índice de Vulnerabilidad, con borde oscuro definido
  // para destacar con fuerza sobre el basemap. Redundancia NO cromática
  // (accesibilidad para daltonismo): además del color, el tamaño escala con el
  // IV y el borde se engrosa en las categorías altas (>=60) y muy altas (>=80),
  // para que el riesgo se lea sin depender del tono.
  map.addLayer({
    id: "nucleos-punto",
    type: "circle",
    source: "nucleos",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "iv"],
        0, 5, 100, 11,
      ],
      "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
      "circle-stroke-width": [
        "step", ["get", "iv"],
        1.8, 60, 2.6, 80, 3.4,
      ] as unknown as maplibregl.ExpressionSpecification,
      "circle-stroke-color": "#1c1c1c",
    },
  });

  // Anillo distintivo para núcleos que YA usan dato de edad real (Fase 1).
  map.addLayer({
    id: "nucleos-dato-real",
    type: "circle",
    source: "nucleos",
    filter: ["==", ["get", "dato_edad_real"], true],
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["get", "iv"],
        0, 9.5, 100, 16.5,
      ],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#1a7d45",
    },
  });

  // Marcador de afectación física (EMSR837): punto central oscuro para los
  // núcleos dentro del perímetro quemado.
  map.addLayer({
    id: "nucleos-afectado",
    type: "circle",
    source: "nucleos",
    filter: ["==", ["get", "afect_fisica"], true],
    paint: {
      "circle-radius": 2.4,
      "circle-color": "#3a0d06",
      "circle-stroke-width": 0.8,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Etiqueta con el nombre del núcleo. Grande, en negrita y con halo blanco
  // fuerte para leerse sobre cualquier fondo (legibilidad de usuarios mayores).
  // Anclaje variable + padding de colisión para que no se pisen al norte.
  map.addLayer({
    id: "nucleos-etiqueta",
    type: "symbol",
    source: "nucleos",
    layout: {
      "text-field": ["get", "nombre"],
      "text-font": ["Noto Sans Bold"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        8, 12, 11, 14.5, 14, 16,
      ],
      "text-radial-offset": 1,
      "text-variable-anchor": ["top", "bottom", "left", "right"],
      "text-justify": "auto",
      "text-padding": 8,
      "text-allow-overlap": false,
      "symbol-sort-key": ["-", 100, ["coalesce", ["get", "iv"], 0]],
    },
    paint: {
      "text-color": "#161b18",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2.4,
      "text-halo-blur": 0.4,
    },
  });
}


// Capa del Índice de Peligro Meteorológico (FWI), vía WMS de EFFIS/Copernicus.
export function anadirCapaFWI(map: maplibregl.Map, tileUrl: string) {
  // Si ya existía (p.ej. cambió la fecha), se quita y se vuelve a crear —
  // es la forma más segura de forzar a MapLibre a pedir teselas nuevas,
  // sin depender de si tu versión soporta source.setTiles().
  if (map.getLayer("fwi-capa")) map.removeLayer("fwi-capa");
  if (map.getSource("fwi")) map.removeSource("fwi");

  map.addSource("fwi", {
    type: "raster",
    tiles: [tileUrl],
    tileSize: 256,
  });

  map.addLayer({
    id: "fwi-capa",
    type: "raster",
    source: "fwi",
    paint: {
      "raster-opacity": 0.65, // deja ver el mapa base por debajo
    },
  });
}