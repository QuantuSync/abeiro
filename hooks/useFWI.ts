"use client";

import useSWR from "swr";

const EFFIS_WMS_BASE = "https://maps.effis.emergency.copernicus.eu/effis";
//const CAPA_FWI = "ecmwf007.fwi";
// Confirmado por GetCapabilities: la capa de ECMWF ya no está publicada en
// este WMS; mf010.fwi (Meteo France, 10 km, hasta 3 días) es la única
// capa de FWI real disponible ahora mismo.
const CAPA_FWI = "mf010.fwi";

function fechaHoyISO(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function fechaAyerISO(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

async function obtenerFechaFWI(): Promise<string> {

    // "Hoy" falla a menudo: EFFIS tarda unas horas por la mañana en publicar
    // el dato del día (confirmado probando en la práctica — el equipo tuvo
    // que fijar una fecha pasada a mano para que la petición funcionase).
    // Por ahora usamos "ayer", que ya está publicado con certeza casi
    // siempre. FUTURO: comprobar en vivo si el de hoy ya existe y usarlo
    // si es así, en vez de retroceder siempre un día de forma fija.
    //return fechaAyerISO(); 
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

    const tileUrlBase =
  `${EFFIS_WMS_BASE}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
  `&LAYERS=${CAPA_FWI}&STYLES=&FORMAT=image/png&TRANSPARENT=true` +
  `&SRS=EPSG:4326&WIDTH=256&HEIGHT=256&SINGLETILE=false` +
  `&TIME=${fechaActual}`;
    // Sin BBOX real todavía: transformRequest (en MapaBase) lo calcula e
    // inyecta en el momento justo antes de que la petición salga, usando
    // estos marcadores — MapLibre los sustituye por los índices reales.
    const tileUrl = tileUrlBase + `&__z={z}&__x={x}&__y={y}`;

    return { tileUrl, fecha: fechaActual };
}