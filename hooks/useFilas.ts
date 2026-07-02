import { categoriaPorIV, type CategoriaIV } from "@/lib/vulnerabilidad";

// utilizamos el hook que hace fetching de datos de nucleos, afectacion y evacuacion
// y construye el objeto final de nucleos con todas las propiedades
import{useNucleos} from "@/hooks/useNucleos";

interface Fila {
    nombre: string;
    iv: number;
    cat: CategoriaIV;
    estado: "dentro" | "borde" | "fuera";
    fecha: string | null;
}

export function useFilas(){
    const { nucleos } = useNucleos();

    // Tabla ordenada por IV descendente, cruzando IV (predicción) con afectación real.
    const FILAS: Fila[] = nucleos.features
        .map((f) => {
        const p = f.properties;
        const estado = p.afect_fisica ? "dentro" : p.borde_500m ? "borde" : "fuera";
        return {
            nombre: p.nombre,
            iv: p.iv,
            cat: categoriaPorIV(p.iv),
            estado: estado as Fila["estado"],
            fecha: p.fecha_frente ?? null,
        };
        })
    .sort((x, y) => y.iv - x.iv);

    return FILAS;
}