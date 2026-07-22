"use client";

import useSWR from "swr";

const EFFIS_WMS_BASE = "https://maps.effis.emergency.copernicus.eu/effis";
// TODO: confirmar el nombre exacto de la capa contra la documentación de
// EFFIS (esto es un nombre de ejemplo visto en su guía de descargas, no
// verificado contra su catálogo completo de capas WMS).
const CAPA_FWI = "ecmwf007.fwi";

function fechaHoyISO(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function obtenerFechaFWI(): Promise<string> {
    // De momento, "hoy" sin más. EFFIS puede tardar unas horas por la mañana
    // en publicar el dato del día — si eso da problemas en la práctica, aquí
    // es donde se añadiría la comprobación (o usar el día anterior como
    // respaldo si el de hoy aún no existe).
    return fechaHoyISO();
}

export interface UseFWIResult {
    tileUrl: string;
    fecha: string;
}

export function useFWI(): UseFWIResult {
    const { data: fecha } = useSWR("fwi-fecha", obtenerFechaFWI, {
        refreshInterval: 60 * 60 * 1000, // 1h — el dato solo cambia ~1 vez al día
    });

    const fechaActual = fecha ?? fechaHoyISO();

    // {bbox-epsg-3857} es una plantilla que entiende MapLibre: la sustituye
    // por el recuadro de cada tesela que pide, para que un servidor WMS
    // (que no habla el esquema XYZ habitual) pueda usarse como si fuera un
    // servidor de teselas normal.
    const tileUrl =
        `${EFFIS_WMS_BASE}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
        `&LAYERS=${CAPA_FWI}&FORMAT=image/png&TRANSPARENT=true` +
        `&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256` +
        `&TIME=${fechaActual}`;

    return { tileUrl, fecha: fechaActual };
}