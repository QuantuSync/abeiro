"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { nucleos, type NucleoProps } from "@/lib/datos";
import { CAPAS_EVAC, CAPAS_VULN, CENTRO, ESTILO_BASE, ZOOM_INICIAL } from "@/lib/mapa-config";
import { anadirCapasEvacuacion, anadirCapasNucleos, anadirCapasVulnerabilidad } from "@/lib/capas-mapa";
import { EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";
import { EXPRESION_COLOR_EVAC } from "@/lib/evacuacion";
import Leyenda, { type Lente } from "@/components/Leyenda";
import PanelInfo from "@/components/PanelInfo";
import PanelValidacion from "@/components/PanelValidacion";

export default function MapaVulnerabilidad() {
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
