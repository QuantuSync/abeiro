"use client";

import useSWR from "swr";

async function marcaDeHora(): Promise<number> {
  // Cambia una vez por hora — con eso basta para que MapaFWI vuelva a
  // pedir la imagen. El servidor decide si la recalcula de verdad o sirve
  // su propia caché de la última hora.
  return Math.floor(Date.now() / (60 * 60 * 1000));
}

export interface UseFWIResult {
  tileUrl: string;
}

export function useFWI(): UseFWIResult {
  const { data: marca } = useSWR("fwi-marca-hora", marcaDeHora, {
    refreshInterval: 60 * 60 * 1000,
  });

  return { tileUrl: `/api/fwi-ourense?t=${marca ?? 0}` };
}