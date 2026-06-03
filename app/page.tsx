import dynamic from "next/dynamic";

// MapLibre usa APIs del navegador: se carga solo en cliente (sin SSR).
const MapaVulnerabilidad = dynamic(
  () => import("@/components/MapaVulnerabilidad"),
  { ssr: false, loading: () => <div className="cargando">Cargando mapa…</div> }
);

export default function Home() {
  return (
    <main className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="logo">abeiro</span>
          <span className="claim">protección ante incendios forestales · Galicia</span>
        </div>
        <div className="contexto">
          Comarca piloto: <strong>Valdeorras / Larouco</strong> (Ourense)
          <span className="fase">Fase 0 · datos de prueba</span>
        </div>
      </header>
      <MapaVulnerabilidad />
    </main>
  );
}
