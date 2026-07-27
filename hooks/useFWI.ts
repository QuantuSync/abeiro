"use client";

//se usa en MapaFWI. Es el punto de entrada del cliente.

import useSWR from "swr";

async function marcaDeHora(): Promise<number> {
  // Cambia una vez por hora — con eso basta para que MapaFWI vuelva a
  // pedir la imagen. El servidor decide si la recalcula de verdad o sirve
  // su propia caché de la última hora.
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

export interface UseFWIResult {
  tileUrl: string;
  fecha: string;
}

export function useFWI(): UseFWIResult {
  const { data: marca } = useSWR("fwi-marca-hora", marcaDeHora, {
    refreshInterval: 60 * 60 * 1000,
  });

  //devuelve el intervalo al backend del server (url)
  return { 
    tileUrl: `/api/fwi-ourense?t=${marca ?? 0}` , 
      fecha: new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    };
}