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
          <span className="logo">ABEIRO</span>
          <span className="claim">
            FASOR · Evaluación de Riesgo de Incendios · Casa Alaniz
          </span>
        </div>
        <div className="contexto">
          <span className="comarca">
            Comarca piloto: <strong>Valdeorras / Larouco</strong> (Ourense)
          </span>
          <span className="distintivo">
            Demostrador · Datos reales <em>(IGE · OSM · Sentinel-2)</em>
          </span>
        </div>
      </header>
      <MapaVulnerabilidad />
    </main>
  );
}
