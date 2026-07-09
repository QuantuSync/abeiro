"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";
import PanelFiltros from "@/components/PanelFiltros";
import type { Comarca, NucleoProps } from "@/lib/tipos";

// Custom hook para el fetching de datos de nucleos, afectacion y evacuacion.
import { useNucleos } from "@/hooks/useNucleos";
import { resaltarRutaCoche } from "@/lib/resaltarRutaCoche";

import { CAPAS_EVAC, CAPAS_VULN, CENTRO, ESTILO_BASE, ZOOM_INICIAL } from "@/lib/mapa-config";
import { anadirCapasEvacuacion, anadirCapasNucleos, anadirCapasVulnerabilidad } from "@/lib/capas-mapa";
import { FILTROS_DEFECTO, filtrando, pasaFiltros, type Filtros } from "@/lib/filtros";

// Color base de las rutas por % de pista (igual que en lib/capas-mapa).
const COLOR_RUTA_BASE = [
  "step", ["get", "pct_track"], "#0571b0", 15, "#e08214", 30, "#ca0020",
] as unknown as maplibregl.ExpressionSpecification;
const GRIS_ATENUADO = "#9a958a";

// Controlamos en la App el zoom mínimo y máximo que puede hacer el user.
const MIN_ZOOM = 7;
const MAX_ZOOM = 13;

// Controlamos que no puedas moverte con el ratón fuera de la comarca activa.
// Mismo mecanismo que tenías (caja fija en grados), pero recalculado cada vez
// que cambias de comarca, en vez de fijo a un único centro.
const MAP_SIZE = {
  WIDTH: 2.0,
  HEIGHT: 0.5,
};

function calcularLimites(centro: [number, number]): [[number, number], [number, number]] {
  return [
    [centro[0] - MAP_SIZE.WIDTH / 2, centro[1] - MAP_SIZE.HEIGHT / 2], // esquina suroeste
    [centro[0] + MAP_SIZE.WIDTH / 2, centro[1] + MAP_SIZE.HEIGHT / 2], // esquina noreste
  ];
}

export default function MapaVulnerabilidad({ comarca }: { comarca?: Comarca }) {
  // de momento se llama aquí siempre que se renderiza.
  // FUTURO: por defecto solo carga núcleos de Valdeorras.
  // Dado que habrá fetch continuo de afec y evac según evolucione el fuego,
  // esto debe de ser CLIENTE (lo dejamos en MapaVulnerabilidad).
  const { nucleos } = useNucleos(/*FUTURO... pasar "comarca.id" para que useSWR actualice el fetching cuando cambie comarcaActual*/);

  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const [lente, setLente] = useState<Lente>("vulnerabilidad");
  const [rutaResaltada, setRutaResaltada] = useState<string | null>(null);
  // Guarda la última comarca a la que ya volamos, para no repetir el flyTo en
  // cada render y para no saltar en el propio montaje (ver efecto más abajo).
  const comarcaAnterior = useRef(comarca?.id);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_DEFECTO);

  // Núcleos que cumplen el filtro y los que quedan fuera (para atenuarlos en el
  // mapa). El conjunto base son TODOS los núcleos (incluidos O Barco y A Rúa, que
  // además son destinos de evacuación pero núcleos reales con IV propio). El
  // filtro de vías aplica aquí (hay capa de evacuación).
  const { visibles, total, idsFuera } = useMemo(() => {
    const opts = { campoAfectacion: "afect_fisica" as const, soporteVias: true };
    const activo = filtrando(filtros);
    const fuera = activo
      ? nucleos.features.filter((f) => !pasaFiltros(f.properties, filtros, opts)).map((f) => f.properties.id)
      : [];
    return {
      total: nucleos.features.length,
      visibles: nucleos.features.filter((f) => pasaFiltros(f.properties, filtros, opts)).length,
      idsFuera: fuera,
    };
  }, [filtros, nucleos]);

  useEffect(() => {
    if (!contenedor.current || mapRef.current) return;

    const centroInicial = comarca?.centro ?? CENTRO;

    const map = new maplibregl.Map({
      container: contenedor.current,
      style: ESTILO_BASE,
      center: centroInicial,
      zoom: ZOOM_INICIAL,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: calcularLimites(centroInicial), // limita el movimiento a la comarca inicial
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Aid de depuración/verificación: acceso a la instancia desde la consola.
    (window as unknown as { __abeiroMap?: MapLibreMap }).__abeiroMap = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // El orden de llamada define el apilado: perímetro (fondo) -> rutas ->
      // núcleos (cima). Misma estructura de capas e ids que siempre.
      anadirCapasVulnerabilidad(map);
      anadirCapasEvacuacion(map);
      anadirCapasNucleos(map, nucleos);

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
  }, []); // solo se ejecuta 1 vez, en el montaje del componente.

  // Cuando cambien los núcleos por el fetching de datos, actualizamos la source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const actualizarDatos = () => {
      const source = map.getSource("nucleos") as GeoJSONSource | undefined;
      source?.setData(nucleos);
    };

    // PROBLEMA A FUTURO:
    // En el efecto que hace setData cuando cambian los datos,
    // si nucleos cambiara dos veces antes de que el mapa termine de cargar sus teselas (evento load),
    // se registrarían dos map.once("load", actualizarDatos)
    // porque el efecto no tiene función de limpieza que desregistre el anterior.
    // Actualmente no pasa nada, pero cuidado cuando hagas fetchs largos.
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
    setSeleccionado(null);

    // Quitamos el límite ANTES de volar: si no, el flyTo podría intentar salir
    // de la caja de la comarca ANTERIOR (que aún está activa en ese instante) y
    // quedarse cortado a mitad de camino.
    map.setMaxBounds(undefined);
    map.flyTo({ center: comarca.centro, zoom: ZOOM_INICIAL, speed: 0.8 });

    // Cuando el vuelo termina, volvemos a limitar el movimiento, ahora a la
    // caja de la NUEVA comarca.
    map.once("moveend", () => {
      map.setMaxBounds(calcularLimites(comarca.centro));
    });
  }, [comarca]);

  // Vuela hacia el núcleo seleccionado para centrarlo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !seleccionado) return;
    const f = nucleos.features.find((x) => x.properties.id === seleccionado.id);
    if (f) {
      map.flyTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 11), speed: 0.8 });
    }
  }, [seleccionado, nucleos]);

  // Aplica la lente activa: muestra/oculta las capas propias de cada lente.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () => {
      if (!map.getLayer("nucleos-punto")) return;
      const evac = lente === "evacuacion";
      for (const id of CAPAS_VULN) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "none" : "visible");
      }
      for (const id of CAPAS_EVAC) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "visible" : "none");
      }
    };
    if (map.getLayer("nucleos-punto")) aplicar();
    else map.once("load", aplicar);
  }, [lente]);

  // FOCO + FILTRO (Tareas 1 y 2): un único protagonista claro y contexto tenue.
  // - Núcleo seleccionado: destaca; el resto se atenúa ligeramente (no invisible).
  // - Filtrado fuera: gris y muy tenue (contexto), sin ocultarse.
  // - En evacuación, la ruta del seleccionado destaca y las demás pasan a gris.
  // Sin animaciones ni movimientos de cámara añadidos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () => {
      if (!map.getLayer("nucleos-punto")) return;
      const base = (lente === "evacuacion" ? EXPRESION_COLOR_EVAC : EXPRESION_COLOR_IV) as maplibregl.ExpressionSpecification;
      const sel = seleccionado?.id ?? null;
      const fuera: maplibregl.ExpressionSpecification | boolean =
        idsFuera.length ? (["in", ["get", "id"], ["literal", idsFuera]] as unknown as maplibregl.ExpressionSpecification) : false;
      const noSel: maplibregl.ExpressionSpecification | boolean =
        sel ? (["!=", ["get", "id"], sel] as unknown as maplibregl.ExpressionSpecification) : false;

      // --- Núcleos: color (gris si filtrado fuera) y opacidad por foco ---
      map.setPaintProperty("nucleos-punto", "circle-color",
        (idsFuera.length ? ["case", fuera, GRIS_ATENUADO, base] : base) as maplibregl.ExpressionSpecification);
      map.setPaintProperty("nucleos-punto", "circle-opacity",
        ["case", fuera, 0.28, noSel, 0.55, 1] as unknown as maplibregl.ExpressionSpecification);
      if (map.getLayer("nucleos-halo")) {
        map.setPaintProperty("nucleos-halo", "circle-opacity",
          ["case", fuera, 0.3, 0.92] as unknown as maplibregl.ExpressionSpecification);
      }

      // --- Rutas: foco de la seleccionada + atenuación del resto/filtradas ---
      if (map.getLayer("rutas-evacuacion")) {
        const atenuada: maplibregl.ExpressionSpecification =
          ["any", fuera, noSel] as unknown as maplibregl.ExpressionSpecification;
        map.setPaintProperty("rutas-evacuacion", "line-color",
          ["case", atenuada, GRIS_ATENUADO, COLOR_RUTA_BASE] as unknown as maplibregl.ExpressionSpecification);
        map.setPaintProperty("rutas-evacuacion", "line-opacity",
          ["case", fuera, 0.18, noSel, 0.28, 1] as unknown as maplibregl.ExpressionSpecification);
        map.setPaintProperty("rutas-casing", "line-opacity",
          ["case", atenuada, 0.25, 0.9] as unknown as maplibregl.ExpressionSpecification);
      }
    };
    if (map.getLayer("nucleos-punto")) aplicar();
    else map.once("load", aplicar);
  }, [seleccionado, lente, idsFuera]);

  // Resalta la ruta del núcleo seleccionado (glow dorado) según el estado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () =>
      map.setFilter("rutas-resaltada", ["==", ["get", "id"], rutaResaltada ?? "__ninguna__"]);
    if (map.getLayer("rutas-resaltada")) aplicar();
    else map.once("load", aplicar);
  }, [rutaResaltada]);

  // En la lente de evacuación, la ruta del núcleo seleccionado se resalta (glow);
  // al deseleccionar o en la otra lente, se limpia. Así el foco (glow + atenuación
  // del resto) sigue siempre a la selección, sin acciones adicionales.
  useEffect(() => {
    setRutaResaltada(lente === "evacuacion" && seleccionado ? seleccionado.id : null);
  }, [seleccionado, lente]);

  // "Ruta de escape en coche": pasa a la lente de evacuación, resalta la ruta y
  // encuadra el trayecto núcleo -> destino seguro. Lógica de bounds/padding
  // extraída a lib/resaltarRutaCoche.
  const resaltarRutaCocheAux = (id: string) => {
    setLente("evacuacion");
    setRutaResaltada(id);
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
      <PanelFiltros
        filtros={filtros}
        onChange={setFiltros}
        total={total}
        visibles={visibles}
        soporteVias={true}
        campoAfectacionLabel="incendio 2025"
      />
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
