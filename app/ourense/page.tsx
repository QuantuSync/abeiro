import dynamic from "next/dynamic";

//QUITAR.......

// Mapa provincial de Ourense (piloto de escalado): se carga solo en cliente.
const MapaOurense = dynamic(() => import("@/components/MapaOurense"), {
  ssr: false, loading: () => <div className="cargando">Cargando mapa de Ourense…</div>,
});

export const metadata = {
  title: "ABEIRO — Ourense (piloto de escalado) · Vulnerabilidad ante incendios",
  description: "Índice de Vulnerabilidad de los núcleos de Ourense (≥50 hab), piloto de "
    + "escalado a Galicia. Datos reales (NGBE · IGE · INE · Sentinel-2 · SRTM · OSM · GlobFire).",
};

export default function OurensePage() {
  return (
    <main className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="logo">ABEIRO</span>
          <span className="claim">Ourense · piloto de escalado a Galicia</span>
        </div>
        <div className="contexto">
          <span className="comarca">
            <strong>683 núcleos</strong> (≥50 hab) · lente de vulnerabilidad
          </span>
          <span className="distintivo">
            Demostrador · pesos <em>provisionales</em>
          </span>
        </div>
      </header>
      {/*<MapaOurense />*/}
    </main>
  );
}
