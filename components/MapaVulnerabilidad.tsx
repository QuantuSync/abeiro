"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import Leyenda from "@/components/Leyenda";
import PanelInfo, { type NucleoProps } from "@/components/PanelInfo";

// Capa de afectación física (validación EMSR837): se une por id a cada núcleo
// SOLO para visualización; no forma parte del Índice de Vulnerabilidad.
const afectacion = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const nucleosBase = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;
const nucleos: FeatureCollection<Point, NucleoProps> = {
  ...nucleosBase,
  features: nucleosBase.features.map((f) => ({
    ...f,
    properties: { ...f.properties, ...(afectacion[f.properties.id] || {}) },
  })),
};

// Estilo de basemap sin clave de API: teselas raster de OpenStreetMap.
// En fases posteriores se sustituirá por PMTiles propio (vector, estático).
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  // Glyphs (fuentes para etiquetas symbol). Debe servir PBF válido: el endpoint
  // de openmaptiles devolvía HTML y provocaba el error "Unimplemented type: 4".
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#e9e6df" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-opacity": 0.85 } },
  ],
};

// Centro aproximado de la comarca piloto (Valdeorras / Larouco).
const CENTRO: [number, number] = [-7.05, 42.48];
const ZOOM_INICIAL = 9.4;

export default function MapaVulnerabilidad() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: CENTRO,
      zoom: ZOOM_INICIAL,
      minZoom: 7,
      maxZoom: 15,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Aid de depuración/verificación: acceso a la instancia desde la consola.
    (window as unknown as { __abeiroMap?: MapLibreMap }).__abeiroMap = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // Perímetro quemado EMSR837 (capa de validación). Se carga del estático
      // (recortado al piloto y simplificado) para no inflar el bundle.
      map.addSource("perimetro", { type: "geojson", data: "/perimetro_emsr837.geojson" });
      map.addLayer({
        id: "perimetro-fill",
        type: "fill",
        source: "perimetro",
        paint: { "fill-color": "#7a1f12", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "perimetro-line",
        type: "line",
        source: "perimetro",
        paint: { "line-color": "#7a1f12", "line-width": 1, "line-opacity": 0.55 },
      });

      map.addSource("nucleos", { type: "geojson", data: nucleos });

      // Halo blanco para destacar el punto sobre el basemap.
      map.addLayer({
        id: "nucleos-halo",
        type: "circle",
        source: "nucleos",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "iv"],
            0, 9, 100, 20,
          ],
          "circle-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });

      // Círculo coloreado por Índice de Vulnerabilidad.
      map.addLayer({
        id: "nucleos-punto",
        type: "circle",
        source: "nucleos",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "iv"],
            0, 6, 100, 16,
          ],
          "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#3a3a3a",
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
            0, 11, 100, 22,
          ],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2.5,
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
          "circle-radius": 3.5,
          "circle-color": "#3a0d06",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Etiqueta con el nombre del núcleo.
      map.addLayer({
        id: "nucleos-etiqueta",
        type: "symbol",
        source: "nucleos",
        layout: {
          "text-field": ["get", "nombre"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#1f2933",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        },
      });

      const capaInteractiva = "nucleos-punto";

      map.on("click", capaInteractiva, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        setSeleccionado(f.properties as unknown as NucleoProps);
      });

      // Clic en zona vacía cierra el panel.
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: [capaInteractiva] });
        if (hits.length === 0) setSeleccionado(null);
      });

      map.on("mouseenter", capaInteractiva, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", capaInteractiva, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Vuela hacia el núcleo seleccionado para centrarlo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !seleccionado) return;
    const f = nucleos.features.find((x) => x.properties.id === seleccionado.id);
    if (f) {
      map.flyTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 11), speed: 0.8 });
    }
  }, [seleccionado]);

  return (
    <div className="mapa-wrap">
      <div ref={contenedor} className="mapa" />
      <Leyenda />
      {seleccionado && (
        <PanelInfo nucleo={seleccionado} onClose={() => setSeleccionado(null)} />
      )}
    </div>
  );
}
