'use client' //nuevo. tengo mis dudas

// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";
import useSWR from 'swr'
import { useMemo } from "react";
import type {NucleoProps, UseNucleosResult} from "@/lib/tipos"
import { construirNucleos } from "@/lib/nucleos";

//CUIDADO... JSON
import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";

// - Partial ==> coge los PanelInfo.NucleoProps y hace que todas sus propiedades sean opcionales 
// (porque no todos los núcleos tienen afectación ni rutas de evacuación).
// - Record<key=string, value=NucleoProps> ==> Le dice a Typescript el tipo de las claves y los valores.
const vacio: FeatureCollection<Point, NucleoProps> = {
    type: "FeatureCollection",
    features: [],
};

// FUTURO ==> Pasar a fetch en vez de json estatico ---
// Dado que habra fetch continuo de afec y evac segun evolucione el fuego, esto debe de ser CLIENTE (lo dejamos en MapaVulenerabilidad)
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

export function useNucleos(/*FUTURO... Recibir comarcaId string para cuando quieras cambiar de comarca. Modificar params useSWR*/) : UseNucleosResult {
    //FUTURO ==> Si varían los datos del fetch, habría que controlar con un estado
    // y variar el key y los params de fetchFunction????

    //useSWR recibe una key único (string) + una funcion fetcher (que devuelve la data)
    //Mejor que useState + useEffect porque hace caching, revalidación, etc.
    const base  = useSWR("nucleos-base" , fetchNucleosBase);
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


/* logica

    1. FETCH: afect.data o evac.data cambia de referencia (nuevo objeto tras el fetch)
    2. useMemo en useNucleos detecta que cambió una de sus dependencias
    3. recalcula construirNucleos(...) → nucleos es un OBJETO NUEVO
    4. useNucleos devuelve un nucleos con referencia distinta
    5. MapaVulnerabilidad recibe ese nuevo nucleos
    6. el useEffect con [nucleos] como dependencia se dispara
    7. source.setData(nucleos) → MapLibre repinta solo esa capa
*/