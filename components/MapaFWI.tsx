// components/MapaFWI.tsx
"use client";

import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { useFWI } from "@/hooks/useFWI";
import { anadirCapaFWI } from "@/lib/capas-mapa";
import { CENTRO_OURENSE, ZOOM_OURENSE } from "@/lib/mapa-config";
import type { Comarca } from "@/lib/tipos";

const ANADIR_CAPA_FWI = false

// A partir de este zoom, se considera que el usuario ha "entrado" en una
// comarca concreta. Mismo umbral y misma lógica que tenía MapaOurense —
// portado tal cual: quien haga de vista general es quien decide cuándo se
// pasa al detalle, da igual qué esté pintando por encima.
const ZOOM_UMBRAL_DETALLE = 11;

// Clasificación de 6 niveles de EFFIS/Copernicus (Canadian FWI System).
// Fuente: EEA Climate-ADAPT, ficha "Fire Weather Index". EFFIS ha ido
// revisando esta escala con el tiempo (p.ej. añadieron un nivel "muy
// extremo" >70 en 2021 para el Mediterráneo en verano) — antes de dar esto
// por definitivo, comprobar la leyenda vigente en el visor de EFFIS.
const CATEGORIAS_FWI = [
    { id: "muy-bajo", etiqueta: "Muy bajo", min: 0, max: 5.2, color: "#1a7d45" },
    { id: "bajo", etiqueta: "Bajo", min: 5.2, max: 11.2, color: "#8bc34a" },
    { id: "moderado", etiqueta: "Moderado", min: 11.2, max: 21.3, color: "#f6d743" },
    { id: "alto", etiqueta: "Alto", min: 21.3, max: 38.0, color: "#f0952b" },
    { id: "muy-alto", etiqueta: "Muy alto", min: 38.0, max: 50.0, color: "#d9541f" },
    { id: "extremo", etiqueta: "Extremo", min: 50.0, max: null, color: "#a3122a" },
] as const;

type Props = {
    map: MapLibreMap;
    comarcas: Comarca[];
    onEntrarDetalle: (comarcaId: string) => void;
};

export default function MapaFWI({ map, comarcas, onEntrarDetalle }: Props) {
    const { tileUrl, fecha } = useFWI();

    // ACTIVACIÓN: vista general, sin restricción de paneo, encuadre
    // provincial (igual que hacía MapaOurense al activarse — necesario tanto
    // al entrar por primera vez como al volver desde el detalle de una
    // comarca). Registra el umbral de zoom → detalle. La limpieza quita el
    // listener Y la capa de FWI: es el único efecto que corre de verdad solo
    // al desmontar (los otros dos reaccionan a cambios, no a desmontaje).
    useEffect(() => {
        map.setMaxBounds(undefined);
        map.jumpTo({ center: CENTRO_OURENSE, zoom: ZOOM_OURENSE });

        const alCambiarZoom = () => {
        if (map.getZoom() <= ZOOM_UMBRAL_DETALLE || comarcas.length === 0) return;
        const centro = map.getCenter();
        let masCercana = comarcas[0];
        let distMin = Infinity;
        for (const c of comarcas) {
            const d = Math.hypot(c.centro[0] - centro.lng, c.centro[1] - centro.lat);
            if (d < distMin) { distMin = d; masCercana = c; }
        }
        onEntrarDetalle(masCercana.id);
        };
        map.on("zoomend", alCambiarZoom);

        return () => {
        map.off("zoomend", alCambiarZoom);
        if (map.getLayer("fwi-capa")) map.removeLayer("fwi-capa");
        if (map.getSource("fwi")) map.removeSource("fwi");
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    // Añade/renueva la capa cada vez que cambia la URL (cambio de día).
    // anadirCapaFWI ya quita la capa/fuente anteriores antes de crear las
    // nuevas, así que no hace falta lógica de limpieza aparte para ese caso.
    useEffect(() => {
        if (ANADIR_CAPA_FWI)
            anadirCapaFWI(map, tileUrl);
    }, [map, tileUrl]);

    return (
        <>
        <section className="leyenda" aria-label="Leyenda del Índice de Peligro Meteorológico">
            <h3>Peligro meteorológico (FWI)</h3>
            <ul>
            {CATEGORIAS_FWI.map((c) => (
                <li key={c.id}>
                <span className="swatch" style={{ backgroundColor: c.color }} />
                <span className="etiqueta">{c.etiqueta}</span>
                <span className="rango">
                    {c.max == null ? `>${c.min}` : `${c.min}–${c.max}`}
                </span>
                </li>
            ))}
            </ul>
            <p className="aviso">
            Dato del día {fecha} · modelo ECMWF (~8 km) · fuente: EFFIS/Copernicus.
            Acércate para pasar al detalle de una comarca.
            </p>
        </section>
        </>
    );
}