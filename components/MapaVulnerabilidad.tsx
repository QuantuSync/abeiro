"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";
import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC, dificultadEvac } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo, { type NucleoProps } from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";

// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
const afectacion = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const evacuacion = (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const nucleosBase = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;
const nucleos: FeatureCollection<Point, NucleoProps> = {
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

// Capas que solo se muestran en cada lente.
const CAPAS_VULN = ["nucleos-dato-real", "nucleos-afectado", "perimetro-fill", "perimetro-line"];
const CAPAS_EVAC = ["rutas-evacuacion", "destinos-seguros"];

// Basemap neutro/apagado sin clave de API: CARTO Positron (gris claro,
// monocromo). Evita los símbolos llamativos de OSM (triángulos naranjas,
// etiquetas) para que no compitan con la paleta de datos ni con la identidad.
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  // Glyphs (fuentes para etiquetas symbol). Debe servir PBF válido: el endpoint
  // de openmaptiles devolvía HTML y provocaba el error "Unimplemented type: 4".
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · '
        + '© <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#ececed" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.92 } },
  ],
};

// Centro aproximado de la comarca piloto (Valdeorras / Larouco).
const CENTRO: [number, number] = [-7.05, 42.48];
const ZOOM_INICIAL = 9.4;

export default function MapaVulnerabilidad() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const [lente, setLente] = useState<Lente>("vulnerabilidad");

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
      // Velo translúcido: relleno muy tenue + contorno suave, para que no compita
      // con los núcleos.
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

      // Rutas de evacuación (capa independiente). Color por % de pista forestal:
      // verde = ruta fiable (asfalto), naranja = depende de pista (poco fiable).
      map.addSource("rutas", { type: "geojson", data: "/rutas_evacuacion.geojson" });
      map.addLayer({
        id: "rutas-evacuacion",
        type: "line",
        source: "rutas",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 3,
          "line-opacity": 0.85,
          "line-color": [
            "step", ["get", "pct_track"],
            "#1f6f4a", 15, "#d8a200", 30, "#c2521e",
          ],
        },
      });

      map.addSource("nucleos", { type: "geojson", data: nucleos });

      // Destinos seguros (cabeceras comarcales): marcador de estrella/diamante.
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

      // Halo claro para destacar el punto sobre el basemap. Marcadores más
      // pequeños para que no se solapen al norte (Larouco/Seadur/Freixido...).
      map.addLayer({
        id: "nucleos-halo",
        type: "circle",
        source: "nucleos",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "iv"],
            0, 6, 100, 12,
          ],
          "circle-color": "#ffffff",
          "circle-opacity": 0.85,
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
            0, 4, 100, 9,
          ],
          "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#2a2a2a",
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
            0, 7.5, 100, 13,
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

      // Etiqueta con el nombre del núcleo. Tamaño menor + anclaje variable y
      // padding de colisión para que no se pisen al norte (clúster de Larouco).
      map.addLayer({
        id: "nucleos-etiqueta",
        type: "symbol",
        source: "nucleos",
        layout: {
          "text-field": ["get", "nombre"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10.5,
          "text-radial-offset": 0.9,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-justify": "auto",
          "text-padding": 6,
          "text-allow-overlap": false,
          "symbol-sort-key": ["-", 100, ["coalesce", ["get", "iv"], 0]],
        },
        paint: {
          "text-color": "#33403a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
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

  // Aplica la lente activa: recolorea los núcleos y muestra/oculta capas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () => {
      if (!map.getLayer("nucleos-punto")) return;
      const evac = lente === "evacuacion";
      map.setPaintProperty("nucleos-punto", "circle-color",
        (evac ? EXPRESION_COLOR_EVAC : EXPRESION_COLOR_IV) as maplibregl.ExpressionSpecification);
      for (const id of CAPAS_VULN) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "none" : "visible");
      }
      for (const id of CAPAS_EVAC) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "visible" : "none");
      }
    };
    if (map.isStyleLoaded()) aplicar();
    else map.once("load", aplicar);
  }, [lente]);

  return (
    <div className="mapa-wrap">
      <div ref={contenedor} className="mapa" />

      {/* Selector de lente: dos visualizaciones independientes del mismo mapa. */}
      <div className="selector-lente" role="group" aria-label="Capa del mapa">
        <button
          className={lente === "vulnerabilidad" ? "activo" : ""}
          onClick={() => setLente("vulnerabilidad")}
          aria-pressed={lente === "vulnerabilidad"}
        >
          Vulnerabilidad
        </button>
        <button
          className={lente === "evacuacion" ? "activo" : ""}
          onClick={() => setLente("evacuacion")}
          aria-pressed={lente === "evacuacion"}
        >
          Evacuación
        </button>
      </div>

      <Leyenda lente={lente} />
      <button
        className="btn-validacion"
        onClick={() => setMostrarValidacion((v) => !v)}
        aria-pressed={mostrarValidacion}
      >
        Validación 2025 ▸
      </button>
      {seleccionado && (
        <PanelInfo nucleo={seleccionado} onClose={() => setSeleccionado(null)} />
      )}
      {mostrarValidacion && <PanelValidacion onClose={() => setMostrarValidacion(false)} />}
    </div>
  );
}
