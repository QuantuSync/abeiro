"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// import type { FeatureCollection, Point } from "geojson";
// import nucleosData from "@/data/nucleos.json";
// import afectacionData from "@/data/nucleos_afectacion_fisica.json";
// import evacuacionData from "@/data/evacuacion.json";
import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo, { type NucleoProps } from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";
import type { Comarca } from "@/lib/tipos";

//ANTES: const nucleos = ...
//AHORA: CustomHook para el fetching de datos de nucleos, afectacion y evacuacion.
import {useNucleos} from "@/hooks/useNucleos";
import { configurarCapas, configurarInteraccionNucleos } from "@/lib/mapaCapas";
import { resaltarRutaCoche } from "@/lib/resaltarRutaCoche";

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
      //CARTO no recibe ningún mensaje tipo "enséñame Valdeorras". 
      // CARTO tiene, para todo el planeta, un tile PNG de 256×256 px por cada combinación de:
      // - zoom (z) 
      // - coordenadas de cuadrícula (x, y)
      // de ahí el {z}/{x}/{y}.png en la URL:
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

// - X = longitud (este-oeste)
// - Y = latitud (norte-sur). 
// 1º de latitud = 111 km aprox, 1º de longitud varía segun la distancia al ecuador (85 km aprox en Valdeorras.
// Las coordenadas estan en grados
// Variables de control de cámara: POSICION (x,y) + ZOOM INICIAL
// POR DEFECTO: centro aproximado de Valdeorras (para el zoom inicial).
const CENTRO: [number, number] = [-7.05, 42.48];
//const CENTRO: [number, number] = [-3.70, 40.41];
const ZOOM_INICIAL = 9.4;
// Zoom al saltar a otra comarca desde el buscador (fijo: es un salto de
// "vista regional", no un acercamiento progresivo desde donde estuvieras).
const ZOOM_COMARCA = 10.5;
//Controlamos la App el zoom minimo y maximo que puede hacer el user.
const MIN_ZOOM = 7;
const MAX_ZOOM = 13;
// Límite de movimiento del mapa: cubre las 12 comarcas de Ourense (con
// margen), no solo Valdeorras. ANTES el cuadro estaba centrado y ajustado
// solo a Valdeorras (CENTRO ± MAP_SIZE/2): el flyTo del buscador a comarcas
// más al sur/oeste (Verín, A Baixa Limia, O Ribeiro...) quedaba bloqueado
// por el propio maxBounds, porque quedaban fuera de ese cuadro.
const LIMITES_PROVINCIA: [[number, number], [number, number]] = [
  [-8.5, 41.75], // esquina suroeste
  [-6.65, 42.65], // esquina noreste
];

export default function MapaVulnerabilidad({ comarca }: { comarca?: Comarca }) {
  // de momento lo llama aqui va a ser siempre que se renderiza?
  const { nucleos } = useNucleos();

  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const [lente, setLente] = useState<Lente>("vulnerabilidad");
  const [rutaResaltada, setRutaResaltada] = useState<string | null>(null);
  // Guarda la última comarca a la que ya volamos, para no repetir el flyTo en
  // cada render y para no saltar en el propio montaje (ver efecto más abajo).
  const comarcaAnterior = useRef(comarca?.id);

  useEffect(() => {
    if (!contenedor.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: CENTRO,
      zoom: ZOOM_INICIAL,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: LIMITES_PROVINCIA, // limita el movimiento del mapa a la provincia de Ourense
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Aid de depuración/verificación: acceso a la instancia desde la consola.
    (window as unknown as { __abeiroMap?: MapLibreMap }).__abeiroMap = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      //Encapsulamos el codigo qque modifica map en dos funciones para que sea mas legible
      //... addlayer y addsource
      configurarCapas(map);

      //map.on
      configurarInteraccionNucleos(map, "nucleos-punto", setSeleccionado);
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

    //PROBLEMA A FUTURO: 
    // En el efecto que hace setData cuando cambian los datos, 
    // si nucleos cambiara dos veces antes de que el mapa termine de cargar sus teselas (evento load), 
    // se registrarían dos map.once("load", actualizarDatos) 
    // porque el efecto no tiene función de limpieza que desregistre el anterior. 
    // Actualmente no pasa nada, pero cuidado cuando hagas fetchs largos
    if (map.getSource("nucleos")) actualizarDatos();
    else map.once("load", actualizarDatos);
  }, [nucleos]); // se relanza cuando useNucleos entregue los datos reales


  // Vuela hacia la comarca elegida en el buscador del header. Se salta la
  // primera ejecución (montaje, comarca por defecto = misma vista inicial)
  // comparando con la comarca anterior; si no, el mapa "saltaría" nada más
  // cargar aunque el usuario no haya tocado el buscador.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !comarca) return;
    if (comarcaAnterior.current === comarca.id) return;
    comarcaAnterior.current = comarca.id;
    setSeleccionado(null); // cierra el panel de un núcleo de otra comarca
    map.flyTo({ center: comarca.centro, zoom: ZOOM_COMARCA, speed: 0.8 });
  }, [comarca]);

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
  const resaltarRutaCocheAux = (id: string) => {
    setLente("evacuacion");
    setRutaResaltada(id);
    // Funcion en lib 
    resaltarRutaCoche(mapRef.current, nucleos, id);    
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
          onRutaCoche={resaltarRutaCocheAux}
        />
      )}
      {mostrarValidacion && <PanelValidacion onClose={() => setMostrarValidacion(false)} />}
    </div>
  );
}
