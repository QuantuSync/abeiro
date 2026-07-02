'use client' //nuevo. tengo mis dudas

// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";
import useSWR from 'swr'
import { useMemo } from "react";
import type { NucleoProps } from "@/components/PanelInfo";
import { construirNucleos } from "@/lib/nucleos";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";


// interface ==> ponerle nombre a un tipo de objeto
// asi el useNucleos sabe el tipo del objeto que devuelve
export interface UseNucleosResult {
    nucleos: FeatureCollection<Point, NucleoProps>;
    //nucleosBase: FeatureCollection<Point, NucleoProps>;
    //afectacion: Record<string, Partial<NucleoProps>>;
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
async function fetchNucleosBase() {
    return nucleosData as unknown as FeatureCollection<Point, NucleoProps>;
    // FUTURO: return (await fetch("/api/nucleos-base")).json();
}
async function fetchAfectacion() {
    return (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
    // FUTURO: fetch con refreshInterval de minutos
}
async function fetchEvacuacion() {
    return (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
    // FUTURO: fetch con refreshInterval corto — la fuente que más cambia
}

export function useNucleos() : UseNucleosResult {
    //FUTURO ==> Si varían los datos del fetch, habría que controlar con un estado
    // y variar el key y los params de fetchFunction????

    //useSWR recibe una key único (string) + una funcion fetcher (que devuelve la data)
    //Mejor que useState + useEffect porque hace caching, revalidación, etc.
    const base  = useSWR("nucleos-base", fetchNucleosBase);
    const afect = useSWR("afectacion", fetchAfectacion);
    const evac  = useSWR("evacuacion", fetchEvacuacion);


     // PROBLEMA: cada vez que se llama a useNucleos, crea un objeto nuevo en memoria, aunque data no haya cambiado.
    // - nucleos no cambia de valor, pero su referencia en memoria si.
    // - Esto provoca que los componentes que usan useNucleos se rendericen de nuevo aunque no haya cambios.
    // SOLUCION: usar useMemo para memorizar el resultado de construirNucleos, y solo recalcularlo si cambian los datos de base, afectacion o evacuacion.
    const nucleos = useMemo(() => {
    if (!base.data) return vacio;
        return construirNucleos(base.data, afect.data ?? {}, evac.data ?? {});
    }, [base.data, afect.data, evac.data]);

    return { //devolvemos un interface UseNucleosResult
        nucleos,
        loading: base.isLoading,
        error: base.error ?? afect.error ?? evac.error ?? null,
    };
}
