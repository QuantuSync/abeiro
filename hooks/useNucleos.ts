// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";
import type { NucleoProps } from "@/components/PanelInfo";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";

import { construirNucleos } from "@/lib/nucleos";

import {useState, useEffect} from 'react'

// interface ==> ponerle nombre a un tipo de objeto
// asi el useNucleos sabe el tipo del objeto que devuelve
export interface UseNucleosResult {
    nucleos: FeatureCollection<Point, NucleoProps>;
    nucleosBase: FeatureCollection<Point, NucleoProps>;
    afectacion: Record<string, Partial<NucleoProps>>;
}

// - Partial ==> coge los PanelInfo.NucleoProps y hace que todas sus propiedades sean opcionales 
// (porque no todos los núcleos tienen afectación ni rutas de evacuación).
// - Record<key=string, value=NucleoProps> ==> Le dice a Typescript el tipo de las claves y los valores.
const vacio: FeatureCollection<Point, NucleoProps> = {
    type: "FeatureCollection",
    features: [],
};

// ^ lo ejecutamos solo una vez al cargar el modulo, no dentro del usenucleos
// con un usestate o algo?

export function useNucleos() : UseNucleosResult {
    const [nucleosBase, setnucleosBase] = useState<FeatureCollection<Point, NucleoProps>>(vacio);
    const [nucleos, setNucleos] = useState<FeatureCollection<Point, NucleoProps>>(vacio);
    const [afectacion, setAfectacion] = useState<Record<string, Partial<NucleoProps>>>({});

   
    //FUTURO... Si hay fetch, igual hace falta un bool cancelado y meter el fetch en una async function cargar() dentro del useffect
    // INTENATR SUSTITUIR LOS STATES Y USEFFECT POR SERVER COMPONENTS??
    useEffect(() => {
        // si en el futuro se hace fetching de nucleos, aqui se haria y luego setNucleos(nucleosFetcheados)
        const afectacionAux = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
        const evacuacionAux = (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;

        //Le dice a TypeScript que la geometría es tipo Point y que las propiedades son NucleoProps (con id, nombre, iv, etc.).
        const nucleosBaseAux = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;


        //(afectacionData as { nucleos: Record<string, Afect> }).nucleos;

        const nucleosAux = construirNucleos(nucleosBaseAux, afectacionAux, evacuacionAux);

        setNucleos(nucleosAux)
        setnucleosBase(nucleosBaseAux)
        setAfectacion(afectacionAux)

    },
    []) //se ejecuta solo al montar el componente, quizas en futuro sea cuando cambie nucleos?

return { nucleos, nucleosBase, afectacion  };
}
