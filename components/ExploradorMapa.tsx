// components/ExploradorMapa.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Comarca } from "@/lib/tipos";
import BuscadorComarcas from "@/components/BuscadorComarcas";
//import MapaBase from "@/components/MapaBase";
import MapaOurense from "@/components/MapaOurense";
import MapaVulnerabilidad from "@/components/MapaVulnerabilidad";
import MapaFWI from "@/components/MapaFWI";
import { CENTRO_OURENSE, ZOOM_OURENSE, ZOOM_INICIAL } from "@/lib/mapa-config";

import dynamic from "next/dynamic";

// MapLibre usa APIs del navegador: se carga solo en cliente (sin SSR).
// Esto es equivalente a englobar en <Suspense fallback={...}>, pero con dynamic podemos definir que no se carga en servidor (ssr=false).
const MapaBase = dynamic(
    () => import("@/components/MapaBase"),
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


const COMARCA_DEFECTO_ID = "valdeorras";
type Vista = "general" | "detalle";

export default function ExploradorMapa({
    comarcas,
    comarcaInicial,
    vistaInicial,
    }: {
    comarcas: Comarca[];
    comarcaInicial: Comarca;
    // Decidido en el servidor (page.tsx) según si la URL ya traía ?comarca=
    // al cargar: un enlace compartido a una comarca debe abrir directamente
    // en detalle, no obligar a pasar por la vista general primero.
    vistaInicial: Vista;
    }) {
    const [comarcaActual, setComarcaActual] = useState<Comarca>(comarcaInicial);
    const [vista, setVista] = useState<Vista>(vistaInicial);
    const mapRef = useRef<MapLibreMap | null>(null);

    const router = useRouter();
    const pathname = usePathname();

    const MUNICIPIO = "Larouco";
    const PROVINCIA = "Ourense";

    function cambiarComarca(c: Comarca) {
        setComarcaActual(c);
        router.replace(`${pathname}?comarca=${c.id}`, { scroll: false });

        if (vista === "general") {
        // Aún en Ourense: solo movemos la cámara. Si el vuelo cruza el umbral
        // de zoom, MapaOurense lo detecta por su cuenta (zoomend) y llama a
        // onEntrarDetalle — mismo camino que el zoom manual, sin atajos.
        mapRef.current?.flyTo({ center: c.centro, zoom: ZOOM_INICIAL, speed: 1.2 });
        }
        // Si ya estamos en detalle, MapaVulnerabilidad reacciona solo al cambio
        // de la prop `comarca` (su propio efecto ya hace flyTo + maxBounds).
    }

    function entrarEnDetalle(comarcaId: string) {
        const c = comarcas.find((x) => x.id === comarcaId);
        if (!c) return;
        setComarcaActual(c);
        router.replace(`${pathname}?comarca=${c.id}`, { scroll: false });
        setVista("detalle");
    }

    function volverAGeneral() {
        setVista("general");
        router.replace(pathname, { scroll: false }); // sin ?comarca=: no aplica en vista general
    }

    const centroInicial = vistaInicial === "detalle" ? comarcaInicial.centro : CENTRO_OURENSE;
    const zoomInicial = vistaInicial === "detalle" ? ZOOM_INICIAL : ZOOM_OURENSE;

    return (
        <main className="app">
        <header className="cabecera">
            <div className="marca">
            <span className="logo">BELENOS</span>
            <span className="claim">Protección ante incendios forestales · Galicia</span>
            </div>

            <BuscadorComarcas comarcas={comarcas} valor={comarcaActual} onChange={cambiarComarca} />

            <div className="contexto">
            {vista === "detalle" ? (
                <span className="comarca">
                Comarca: <strong>{comarcaActual.nombre}</strong>
                {comarcaActual.id === COMARCA_DEFECTO_ID && (
                    <> / Municipio: <strong>{MUNICIPIO}</strong></>
                )}{" "}
                ({PROVINCIA})
                </span>
            ) : (
                <span className="comarca">Vista provincial · {PROVINCIA}</span>
            )}
            <span className="distintivo">
                Demostrador · Datos reales <em>(IGE · OSM · Sentinel-2)</em>
            </span>
            </div>
        </header>

        {vista === "detalle" && comarcaActual.id !== COMARCA_DEFECTO_ID && (
            <p className="aviso-comarca" role="status">
            Aún no hay datos de vulnerabilidad para <strong>{comarcaActual.nombre}</strong>; solo Valdeorras
            (comarca piloto) tiene núcleos con el detalle completo.
            </p>
        )}

        <MapaBase centroInicial={centroInicial} zoomInicial={zoomInicial} onMapReady={(m) => { mapRef.current = m; }}>
            {(map) =>
            vista === "general" ? (
                <MapaOurense map={map} comarcas={comarcas} onEntrarDetalle={entrarEnDetalle} />
            ) : (
                <MapaVulnerabilidad map={map} comarca={comarcaActual} onVolver={volverAGeneral} />
            )
            }
        </MapaBase>
        </main>
    );
}