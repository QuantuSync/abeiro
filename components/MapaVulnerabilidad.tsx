"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// import type { FeatureCollection, Point } from "geojson";
// import nucleosData from "@/data/nucleos.json";
// import afectacionData from "@/data/nucleos_afectacion_fisica.json";
// import evacuacionData from "@/data/evacuacion.json";
import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC, dificultadEvac } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo, { type NucleoProps } from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";

//ANTES: const nucleos = ...
//AHORA: CustomHook para el fetching de datos de nucleos, afectacion y evacuacion.
import {useNucleos} from "@/hooks/useNucleos";

// Capas que solo se muestran en cada lente.
const CAPAS_VULN = ["nucleos-dato-real", "nucleos-afectado", "perimetro-fill", "perimetro-line"];
const CAPAS_EVAC = ["rutas-resaltada", "rutas-casing", "rutas-evacuacion", "destinos-seguros"];

// Basemap neutro pero LEGIBLE sin clave de API: CARTO Voyager. Tiene más
// contraste y color que Positron (carreteras y topónimos más marcados, se leen
// con claridad) manteniéndose limpio. Pensado para legibilidad de usuarios
// mayores: que pueblos, carreteras y colores de riesgo se distingan sin esfuerzo.
const ESTILO_BASE: maplibregl.StyleSpecification = {
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

// Centro aproximado de la comarca piloto (Valdeorras / Larouco).
const CENTRO: [number, number] = [-7.05, 42.48];
const ZOOM_INICIAL = 9.4;

export default function MapaVulnerabilidad() {
  // de momento lo llama aqui va a ser siempre que se renderiza?
  const { nucleos } = useNucleos();

  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const [lente, setLente] = useState<Lente>("vulnerabilidad");
  const [rutaResaltada, setRutaResaltada] = useState<string | null>(null);

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

      // Rutas de evacuación (capa independiente). Casing blanco debajo + línea
      // de color encima, para que destaquen con fuerza sobre el basemap. Color
      // por % de pista forestal: verde = fiable (asfalto), naranja = depende de pista.
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
            "#127c43", 15, "#d68a00", 30, "#b83a16",
          ],
        },
      });

      //ANTES: map.addSource("nucleos", { type: "geojson", data: nucleos });
      // AHORA: data vacío. aun no tenemos nucleos con datos cargados en usEffect([]) 
      map.addSource("nucleos", { type: "geojson", data:{
        type:"FeatureCollection", 
        features:[] //vacio porque hacemos fetching de datos de nucleos
      } }); 


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
      // para destacar con fuerza sobre el basemap.
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
          "circle-stroke-width": 1.8,
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
  }, []); //solo se ejecuta 1 vez, en el montaje del componente.


  // cuando cambie nucleos por el fetching de datos, actualizamos el mapRef
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const actualizarDatos = () => {
      const source = map.getSource("nucleos") as GeoJSONSource | undefined;
      source?.setData(nucleos);
    };

    if (map.getSource("nucleos")) actualizarDatos();
    else map.once("load", actualizarDatos);
  }, [nucleos]); // se relanza cuando useNucleos entregue los datos reales





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
    // Gate por existencia de capa (no por isStyleLoaded, que es false durante
    // animaciones/carga de teselas aunque las capas ya existan).
    if (map.getLayer("nucleos-punto")) aplicar();
    else map.once("load", aplicar);
  }, [lente]);

  // Resalta la ruta del núcleo seleccionado (glow dorado) según el estado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () =>
      map.setFilter("rutas-resaltada", ["==", ["get", "id"], rutaResaltada ?? "__ninguna__"]);
    if (map.getLayer("rutas-resaltada")) aplicar();
    else map.once("load", aplicar);
  }, [rutaResaltada]);

  // Al cambiar de núcleo seleccionado (o cerrar el panel) se limpia el resaltado.
  useEffect(() => {
    setRutaResaltada(null);
  }, [seleccionado?.id]);

  // "Ruta de escape en coche": pasa a la lente de evacuación, resalta la ruta y
  // encuadra el trayecto núcleo -> destino seguro DENTRO de Valdeorras.
  const resaltarRutaCoche = (id: string) => {
    setLente("evacuacion");
    setRutaResaltada(id);
    const map = mapRef.current;
    if (!map) return;
    const nuc = nucleos.features.find((f) => f.properties.id === id);
    const dest = nucleos.features.find((f) => f.properties.id === nuc?.properties.destino);
    if (!nuc || !dest) return;
    const pts = [nuc.geometry.coordinates, dest.geometry.coordinates] as [number, number][];
    // Salvaguarda: solo encuadra si ambos puntos están en el bbox de Galicia
    // (evita cualquier salto fuera por datos o cálculo inesperado).
    const dentroGalicia = pts.every(([lon, lat]) => lon > -9 && lon < -6.3 && lat > 41.6 && lat < 44);
    if (!dentroGalicia) return;
    // LngLatBounds explícito (sin ambigüedad de estructura de arrays).
    const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => bounds.extend(p));
    // Padding seguro: nunca supera el espacio disponible (en ventanas estrechas
    // un padding grande producía un viewport inválido y la cámara saltaba fuera).
    const w = map.getContainer().clientWidth || 1000;
    const h = map.getContainer().clientHeight || 700;
    const padX = Math.min(70, Math.floor(w * 0.12));
    const padY = Math.min(70, Math.floor(h * 0.12));
    map.fitBounds(bounds, {
      padding: { top: padY, bottom: padY, left: padX, right: padX },
      maxZoom: 12.5,
      duration: 800,
    });
  };

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
        <PanelInfo
          nucleo={seleccionado}
          onClose={() => setSeleccionado(null)}
          onRutaCoche={resaltarRutaCoche}
        />
      )}
      {mostrarValidacion && <PanelValidacion onClose={() => setMostrarValidacion(false)} />}
    </div>
  );
}
