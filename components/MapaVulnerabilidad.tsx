// components/MapaVulnerabilidad.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type maplibregl from "maplibre-gl";

import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";
import PanelFiltros from "@/components/PanelFiltros";
import type { Comarca, NucleoProps } from "@/lib/tipos";

import { useNucleos } from "@/hooks/useNucleos";
import { resaltarRutaCoche } from "@/lib/resaltarRutaCoche";

import { CAPAS_EVAC, CAPAS_VULN, ZOOM_INICIAL } from "@/lib/mapa-config";
import { anadirCapasEvacuacion, anadirCapasNucleos, anadirCapasVulnerabilidad } from "@/lib/capas-mapa";
import { FILTROS_DEFECTO, filtrando, pasaFiltros, type Filtros } from "@/lib/filtros";

const COLOR_RUTA_BASE = [
  "step", ["get", "pct_track"], "#0571b0", 15, "#e08214", 30, "#ca0020",
] as unknown as maplibregl.ExpressionSpecification;
const GRIS_ATENUADO = "#9a958a";

// Todas las capas/fuentes que este modo añade al mapa compartido, para poder
// limpiarlas con precisión al desactivarse (ver lib/capas-mapa.ts).
const CAPAS_PROPIAS = [
  "perimetro-fill", "perimetro-line",
  "rutas-resaltada", "rutas-casing", "rutas-evacuacion",
  "destinos-seguros", "nucleos-halo", "nucleos-punto",
  "nucleos-dato-real", "nucleos-afectado", "nucleos-etiqueta",
];
const FUENTES_PROPIAS = ["perimetro", "rutas", "nucleos"];

// Controlamos que no puedas moverte con el ratón fuera de la comarca activa.
const MAP_SIZE = { WIDTH: 3.0, HEIGHT: 1.5 };

function calcularLimites(centro: [number, number]): [[number, number], [number, number]] {
  return [
    [centro[0] - MAP_SIZE.WIDTH / 2, centro[1] - MAP_SIZE.HEIGHT / 2],
    [centro[0] + MAP_SIZE.WIDTH / 2, centro[1] + MAP_SIZE.HEIGHT / 2],
  ];
}

type Props = {
  map: MapLibreMap;
  comarca: Comarca;
  // Vuelve a la vista general de Ourense (se conecta en el paso 4, en
  // ExploradorMapa). Opcional por ahora para no bloquear este paso.
  onVolver?: () => void;
};

export default function MapaVulnerabilidad({ map, comarca, onVolver }: Props) {
  const { nucleos } = useNucleos(/*FUTURO: pasar comarca.id */);

  const [seleccionado, setSeleccionado] = useState<NucleoProps | null>(null);
  const [mostrarValidacion, setMostrarValidacion] = useState(false);
  const [lente, setLente] = useState<Lente>("vulnerabilidad");
  const [rutaResaltada, setRutaResaltada] = useState<string | null>(null);
  // Guarda la comarca a la que ya está posicionada la cámara: distingue
  // "activación" (salto instantáneo) de "cambio de comarca en caliente"
  // (vuelo animado). Se fija dentro del efecto de activación, más abajo.
  const comarcaAnterior = useRef<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_DEFECTO);

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

  // ACTIVACIÓN: añade las capas propias al mapa compartido, registra los
  // listeners (con función nombrada, para poder quitarlos exactamente al
  // desactivarse) y posiciona la cámara de inmediato en la comarca. La
  // LIMPIEZA revierte todo esto — capas, fuentes, listeners y maxBounds —
  // para dejar el mapa "limpio" para el siguiente modo que se active.
  useEffect(() => {
    anadirCapasVulnerabilidad(map);
    anadirCapasEvacuacion(map);
    anadirCapasNucleos(map, nucleos);

    const alClicNucleo = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      setSeleccionado(f.properties as unknown as NucleoProps);
    };
    const alClicVacio = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["nucleos-punto"] });
      if (hits.length === 0) setSeleccionado(null);
    };
    const alEntrar = () => { map.getCanvas().style.cursor = "pointer"; };
    const alSalir = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", "nucleos-punto", alClicNucleo);
    map.on("click", alClicVacio);
    map.on("mouseenter", "nucleos-punto", alEntrar);
    map.on("mouseleave", "nucleos-punto", alSalir);

    // Salto instantáneo (no flyTo): venimos de otro modo, la cámara puede
    // estar en cualquier punto de la provincia.
    //el jump to da probelmas. cuidado
    //map.jumpTo({ center: comarca.centro, zoom: ZOOM_INICIAL });
    map.setMaxBounds(calcularLimites(comarca.centro));
    comarcaAnterior.current = comarca.id;

    return () => {
      map.off("click", "nucleos-punto", alClicNucleo);
      map.off("click", alClicVacio);
      map.off("mouseenter", "nucleos-punto", alEntrar);
      map.off("mouseleave", "nucleos-punto", alSalir);

      for (const id of CAPAS_PROPIAS) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of FUENTES_PROPIAS) if (map.getSource(id)) map.removeSource(id);

      map.setMaxBounds(undefined); // deja el mapa libre para el siguiente modo
    };
    // Deliberadamente solo depende de `map`: esto es "activar/desactivar
    // ESTE modo", una vez por montaje — no debe repetirse si cambian
    // nucleos/comarca mientras ya está activo (para eso están los efectos
    // de más abajo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Actualiza los datos de núcleos cuando useNucleos entregue datos nuevos.
  // Ya no hace falta el fallback "map.once('load', ...)": MapaBase garantiza
  // que el mapa está cargado antes de que este componente exista, y la
  // fuente "nucleos" ya se creó (síncrono) en el efecto de activación de
  // arriba, que siempre se ejecuta antes que este en el mismo montaje.
  useEffect(() => {
    const source = map.getSource("nucleos") as GeoJSONSource | undefined;
    source?.setData(nucleos);
  }, [map, nucleos]);

  // Cambio de comarca EN CALIENTE (buscador, con el componente ya activo):
  // vuelo animado, a diferencia del salto instantáneo de la activación.
  useEffect(() => {
    if (comarcaAnterior.current === comarca.id) return;
    comarcaAnterior.current = comarca.id;
    setSeleccionado(null);

    map.setMaxBounds(undefined);
    map.flyTo({ center: comarca.centro, zoom: ZOOM_INICIAL, speed: 0.8 });
    map.once("moveend", () => {
      map.setMaxBounds(calcularLimites(comarca.centro));
    });
  }, [comarca, map]);

  useEffect(() => {
    if (!seleccionado) return;
    const f = nucleos.features.find((x) => x.properties.id === seleccionado.id);
    if (f) {
      map.flyTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 11), speed: 0.8 });
    }
  }, [seleccionado, nucleos, map]);

  useEffect(() => {
    const evac = lente === "evacuacion";
    for (const id of CAPAS_VULN) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "none" : "visible");
    }
    for (const id of CAPAS_EVAC) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", evac ? "visible" : "none");
    }
  }, [lente, map]);

  useEffect(() => {
    const base = (lente === "evacuacion" ? EXPRESION_COLOR_EVAC : EXPRESION_COLOR_IV) as maplibregl.ExpressionSpecification;
    const sel = seleccionado?.id ?? null;
    const fuera: maplibregl.ExpressionSpecification | boolean =
      idsFuera.length ? (["in", ["get", "id"], ["literal", idsFuera]] as unknown as maplibregl.ExpressionSpecification) : false;
    const noSel: maplibregl.ExpressionSpecification | boolean =
      sel ? (["!=", ["get", "id"], sel] as unknown as maplibregl.ExpressionSpecification) : false;

    map.setPaintProperty("nucleos-punto", "circle-color",
      (idsFuera.length ? ["case", fuera, GRIS_ATENUADO, base] : base) as maplibregl.ExpressionSpecification);
    map.setPaintProperty("nucleos-punto", "circle-opacity",
      ["case", fuera, 0.28, noSel, 0.55, 1] as unknown as maplibregl.ExpressionSpecification);
    map.setPaintProperty("nucleos-halo", "circle-opacity",
      ["case", fuera, 0.3, 0.92] as unknown as maplibregl.ExpressionSpecification);

    const atenuada: maplibregl.ExpressionSpecification =
      ["any", fuera, noSel] as unknown as maplibregl.ExpressionSpecification;
    map.setPaintProperty("rutas-evacuacion", "line-color",
      ["case", atenuada, GRIS_ATENUADO, COLOR_RUTA_BASE] as unknown as maplibregl.ExpressionSpecification);
    map.setPaintProperty("rutas-evacuacion", "line-opacity",
      ["case", fuera, 0.18, noSel, 0.28, 1] as unknown as maplibregl.ExpressionSpecification);
    map.setPaintProperty("rutas-casing", "line-opacity",
      ["case", atenuada, 0.25, 0.9] as unknown as maplibregl.ExpressionSpecification);
  }, [seleccionado, lente, idsFuera, map]);

  useEffect(() => {
    map.setFilter("rutas-resaltada", ["==", ["get", "id"], rutaResaltada ?? "__ninguna__"]);
  }, [rutaResaltada, map]);

  useEffect(() => {
    setRutaResaltada(lente === "evacuacion" && seleccionado ? seleccionado.id : null);
  }, [seleccionado, lente]);

  const resaltarRutaCocheAux = (id: string) => {
    setLente("evacuacion");
    setRutaResaltada(id);
    resaltarRutaCoche(map, nucleos, id);
  };

  // Ya NO devuelve <div className="mapa-wrap"><div ref={contenedor} .../></div>:
  // ese contenedor ahora vive en MapaBase. Aquí solo los paneles flotantes,
  // posicionados por CSS sobre el mapa que ya está en pantalla.
  return (
    <>
      {onVolver && (
        <button className="btn-volver" onClick={onVolver}>
          ◂ Volver a Ourense
        </button>
      )}

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
    </>
  );
}