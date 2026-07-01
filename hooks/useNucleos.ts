// Capas de afectación física (EMSR837) y de evacuación: se unen por id a cada
// núcleo SOLO para visualización; no forman parte del Índice de Vulnerabilidad.
import type { FeatureCollection, Point } from "geojson";
import type { NucleoProps } from "@/components/PanelInfo";

import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import evacuacionData from "@/data/evacuacion.json";

import { construirNucleos } from "@/lib/nucleos";

// interface ==> ponerle nombre a un tipo de objeto
// asi el useNucleos sabe el tipo del objeto que devuelve
export interface UseNucleosResult {
    nucleos: FeatureCollection<Point, NucleoProps>;
}

// - Partial ==> coge los PanelInfo.NucleoProps y hace que todas sus propiedades sean opcionales 
// (porque no todos los núcleos tienen afectación ni rutas de evacuación).
// - Record<key=string, value=NucleoProps> ==> Le dice a Typescript el tipo de las claves y los valores.
const afectacion = (afectacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;
const evacuacion = (evacuacionData as { nucleos: Record<string, Partial<NucleoProps>> }).nucleos;

//Le dice a TypeScript que la geometría es tipo Point y que las propiedades son NucleoProps (con id, nombre, iv, etc.).
const nucleosBase = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;

const nucleosEstaticos = construirNucleos(nucleosBase, afectacion, evacuacion);

// ^ lo ejecutamos solo una vez al cargar el modulo, no dentro del usenucleos
// con un usestate o algo?

export function useNucleos() : UseNucleosResult {
    return { nucleos: nucleosEstaticos };
}