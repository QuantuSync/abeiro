import dynamic from "next/dynamic";

// MapLibre usa APIs del navegador: se carga solo en cliente (sin SSR).
// Esto es equivalente a englobar en <Suspense fallback={...}>, pero con dynamic podemos definir que no se carga en servidor (ssr=false).
const MapaVulnerabilidad = dynamic(
  () => import("@/components/MapaVulnerabilidad"),
  { /*
  - POR DEFECTO ==> Next.js renderiza los componentes en el servidor antes de mandarlos al navegador. 
  - PROBLEMA ==> MapLibre necesita window, document, el DOM real del navegador. 
    Si Next intentara renderizar MapaVulnerabilidad en el servidor, reventaría. 
  - SOLUCION ==> ssr: false le dice "este componente, cárgalo solo en el navegador, nunca en el servidor".*/
    ssr: false, //(SSR = server-side rendering), no renderices este componente en el servidor

    // Defines una funcion con lo que quieres mostrar mientras se carga.
    loading: () => <div className="cargando">Cargando mapa…</div> 
  }
);

export default function Home() {
  const comarca = 'Valdeorras'
  const municipio = 'Larouco'
  const provincia = 'Ourenseeee'

  return (
    <main className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="logo">ABEIRO</span>
          <span className="claim">
            Protección ante incendios forestales · Galicia
          </span>
        </div>
        <div className="contexto">
          <span className="comarca">
            Comarca piloto: <strong>{comarca}</strong> / Municipio: <strong>{municipio}</strong> ({provincia})
          </span>
          <span className="distintivo">
            Demostrador · Datos reales <em>(IGE · OSM · Sentinel-2)</em>
          </span>
        </div>
      </header>
      {/* Mapa donde se muestran cosas */}
      <MapaVulnerabilidad />
    </main>
  );
}
