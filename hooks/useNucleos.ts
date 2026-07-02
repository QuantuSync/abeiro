'use client' //nuevo. tengo mis dudas

// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";
import type { NucleoProps } from "@/components/PanelInfo";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";

import { construirNucleos } from "@/lib/nucleos";

//import {useState, useEffect} from 'react'
import useSWR from 'swr'

// interface ==> ponerle nombre a un tipo de objeto
// asi el useNucleos sabe el tipo del objeto que devuelve
export interface UseNucleosResult {
    nucleos: FeatureCollection<Point, NucleoProps>;
    nucleosBase: FeatureCollection<Point, NucleoProps>;
    afectacion: Record<string, Partial<NucleoProps>>;
    //no estoy seguro
    loading:boolean;
    error: Error|null
}

// - Partial ==> coge los PanelInfo.NucleoProps y hace que todas sus propiedades sean opcionales 
// (porque no todos los núcleos tienen afectación ni rutas de evacuación).
// - Record<key=string, value=NucleoProps> ==> Le dice a Typescript el tipo de las claves y los valores.
const vacio: FeatureCollection<Point, NucleoProps> = {
    type: "FeatureCollection",
    features: [],
};

// FUTURO ==> Pasar a fetch en vez de json estatico ---
async function fetchNucleosRaw() {
    // HOY: datos estáticos, "envueltos" en una promesa para que la interfaz
    // (async, devuelve algo) no cambie el día de mañana.
    const nucleosBase = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;
    const afectacion = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
    const evacuacion = (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;

    return { nucleosBase, afectacion, evacuacion };

    // FUTURO.... (borras lo de arriba y descomentas esto):
    // const [resNucleos, resAfect, resEvac] = await Promise.all([
    //     fetch("/api/nucleos"),
    //     fetch("/api/afectacion"),
    //     fetch("/api/evacuacion"),
    // ]);
    // const nucleosBase = await resNucleos.json();
    // const afectacion = (await resAfect.json()).nucleos;
    // const evacuacion = (await resEvac.json()).nucleos;
    // return { nucleosBase, afectacion, evacuacion };
}

export function useNucleos() : UseNucleosResult {
    //FUTURO ==> Si varían los datos del fetch, habría que controlar con un estado 
    // y variar el key y los params de fetchNuecleosRaw.

    //useSWR recibe una key único (string) + una funcion fetcher (que devuelve la data)
    //Mejor que useState + useEffect porque hace caching, revalidación, etc.
    const { data, error, isLoading } = useSWR("nucleos", fetchNucleosRaw);

    const nucleosBase = data?.nucleosBase ?? vacio;
    const afectacion = data?.afectacion ?? {};
    const evacuacion = data?.evacuacion ?? {};

    const nucleos = data
        ? construirNucleos(nucleosBase, afectacion, evacuacion)
        : vacio;

    return { //devolvemos un interface UseNucleosResult
        nucleos,
        nucleosBase,
        afectacion,
        loading: isLoading,
        error: error ?? null,
    };    
}
