"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Comarca } from "@/lib/tipos";
import BuscadorComarcas from "@/components/BuscadorComarcas";

// MapLibre usa APIs del navegador: se carga solo en cliente (sin SSR).
// Esto es equivalente a englobar en <Suspense fallback={...}>, pero con dynamic podemos definir que no se carga en servidor (ssr=false).
const MapaVulnerabilidad = dynamic(
    () => import("@/components/MapaVulnerabilidad"),
    { /*
    - POR DEFECTO ==> Next.js renderiza los componentes en el servidor antes de mandarlos al navegador. 
    - PROBLEMA ==> MapLibre necesita window, document, el DOM real del navegador. 
        Si Next intentara renderizar MapaVulnerabilidad en el servidor, reventaría. 
    - SOLUCION ==> ssr: false le dice "este componente, cárgalo solo en el navegador, nunca en el servidor".
    swr:false solo s puede utilizar en un sitio "use client"*/
        ssr: false, //(SSR = server-side rendering), no renderices este componente en el servidor

        // Defines una funcion con lo que quieres mostrar mientras se carga.
        loading: () => <div className="cargando">Cargando mapa…</div> 
    }
);

const COMARCA_ESTATICA = "valdeorras"; //FUTURO... variable global residual. quitar

export default function ExploradorMapa({
    comarcas, //comarcas disponibles
    comarcaInicial, //la inicial
    }: {
    comarcas: Comarca[];
    comarcaInicial: Comarca;
}) {
    // Estado compartido entre BuscadorComarcas y el MapaVulnerabilidad. Indica la comarca actual.
    const [comarcaActual, setComarcaActual] = useState<Comarca>(comarcaInicial);

    const router = useRouter();
    const pathname = usePathname();

    const MUNICIPIO = 'Larouco'
    const PROVINCIA = 'Ourense'

    function cambiarComarca(c: Comarca) {
        setComarcaActual(c);
        // replace, no push: cambiar de comarca no debe llenar el historial de
        // "atrás" con una entrada por cada búsqueda.
        router.replace(`${pathname}?comarca=${c.id}`, { scroll: false });
    }

    return (
        <>
        <header className="cabecera">
            <div className="marca">
                <span className="logo">ABEIRO</span>
                <span className="claim">Protección ante incendios forestales · Galicia</span>
            </div>
            
            {/* Buscador con las comarcas de Orense. Recibe el setComarca para actualizar con el input del usuario. */}
            <BuscadorComarcas comarcas={comarcas} valor={comarcaActual} onChange={cambiarComarca} />

            <div className="contexto">
                <span className="comarca">
                    Comarca: <strong>{comarcaActual.nombre}</strong> 
                    {/*solo muestra el municipio si es Valdeorras. FUTURO... Preguntar a Lucas por el Municipio.*/}
                    {comarcaActual.id === COMARCA_ESTATICA && 
                    (<>/ Municipio: <strong>{MUNICIPIO}</strong></>) } ({PROVINCIA})
                </span>
                <span className="distintivo">
                    Demostrador · Datos reales <em>(IGE · OSM · Sentinel-2)</em>
                </span>
            </div>
        </header>

        {/*FUTURO... QUITAR AVISO */}
        {comarcaActual.id !== COMARCA_ESTATICA && (
            <p className="aviso-comarca" role="status">
            Aún no hay datos de vulnerabilidad para <strong>{comarcaActual.nombre}</strong>; solo Valdeorras
            (comarca piloto) tiene núcleos cargados. El buscador de momento solo desplaza el mapa.
            </p>
        )}

        <MapaVulnerabilidad comarca={comarcaActual} />
        </>
    );
}
