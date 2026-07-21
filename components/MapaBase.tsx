"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_BASE } from "@/lib/mapa-config";

// Unión de los rangos de zoom que ya usaban por separado MapaVulnerabilidad
// (7–20) y MapaOurense (7–15): ningún modo debe quedar más restringido de lo
// que ya estaba.
const MIN_ZOOM = 7;
const MAX_ZOOM = 20;

type Props = {
    // Encuadre inicial: lo decide quien monta MapaBase (ExploradorMapa), según
    // si la vista de entrada es la general de Ourense o ya un detalle directo
    // (por ejemplo, si la URL trae ?comarca=xyz al cargar la página).
    centroInicial: [number, number];
    zoomInicial: number;
    onMapReady?: (map: MapLibreMap) => void; // 👈 nuevo
    // Render-prop: solo se invoca cuando el mapa YA está cargado (evento
    // "load"), para que MapaOurense/MapaVulnerabilidad nunca tengan que lidiar
    // con "el mapa aún no existe" en su propio código.
    children: (map: MapLibreMap) => ReactNode;
};

export default function MapaBase({ centroInicial, zoomInicial, onMapReady, children }: Props) {
    const contenedor = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [mapListo, setMapListo] = useState<MapLibreMap | null>(null);

    useEffect(() => {
        if (!contenedor.current || mapRef.current) return;

        const map = new maplibregl.Map({
        container: contenedor.current,
        style: ESTILO_BASE,
        center: centroInicial,
        zoom: zoomInicial,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        attributionControl: { compact: true },
        });
        mapRef.current = map;
        // Aid de depuración/verificación: acceso a la instancia desde la consola.
        (window as unknown as { __abeiroMap?: MapLibreMap }).__abeiroMap = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

        map.on("load", () => {
            setMapListo(map);
            onMapReady?.(map); // 👈 nuevo, justo aquí
        });

        return () => {
        map.remove();
        mapRef.current = null;
        };
        // Solo se ejecuta al montar: centroInicial/zoomInicial son el encuadre de
        // ARRANQUE, no algo que deba reaccionar a cambios posteriores (eso lo
        // gestiona cada modo con su propio flyTo).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="mapa-wrap">
        <div ref={contenedor} className="mapa" />
        {mapListo && children(mapListo)}
        </div>
    );
}