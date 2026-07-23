"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ESTILO_BASE } from "@/lib/mapa-config";
import { bboxDeTesela } from "@/lib/tileMath";

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
            transformRequest: (url, resourceType) => {
                if (resourceType === "Tile" && url.includes("__z=")) {
                const u = new URL(url);
                const z = Number(u.searchParams.get("__z"));
                const x = Number(u.searchParams.get("__x"));
                const y = Number(u.searchParams.get("__y"));
                const [minx, miny, maxx, maxy] = bboxDeTesela(x, y, z);
                u.searchParams.delete("__z");
                u.searchParams.delete("__x");
                u.searchParams.delete("__y");
                u.searchParams.set("BBOX", `${minx},${miny},${maxx},${maxy}`);
                return { url: u.toString() };
                }
                return { url };  },
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
    
    }, []);

    return (
        <div className="mapa-wrap">
        <div ref={contenedor} className="mapa" />
        {mapListo && children(mapListo)}
        </div>
    );
}