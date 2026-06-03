"use client";

import { categoriaPorIV } from "@/lib/vulnerabilidad";

export interface NucleoProps {
  id: string;
  nombre: string;
  concello: string;
  iv: number;
  poblacion: number;
  pct_mayores_65: number;
  pct_hogares_uniper_mayores: number;
  dispersion: string;
  distancia_servicios_km: number;
  peligro_biofisico: number;
  capacidad_respuesta: number;
  num_accesos: number;
  cobertura_movil: string;
  notas: string;
}

function Barra({ valor, color }: { valor: number; color: string }) {
  return (
    <div className="barra">
      <div className="barra-fill" style={{ width: `${valor}%`, backgroundColor: color }} />
    </div>
  );
}

export default function PanelInfo({
  nucleo,
  onClose,
}: {
  nucleo: NucleoProps;
  onClose: () => void;
}) {
  const cat = categoriaPorIV(nucleo.iv);

  return (
    <aside className="panel" aria-label={`Información de ${nucleo.nombre}`}>
      <button className="cerrar" onClick={onClose} aria-label="Cerrar">
        ×
      </button>

      <header className="panel-head">
        <h2>{nucleo.nombre}</h2>
        <p className="concello">Concello de {nucleo.concello}</p>
      </header>

      <div className="iv-bloque" style={{ borderColor: cat.color }}>
        <div className="iv-num" style={{ color: cat.color }}>
          {nucleo.iv}
        </div>
        <div className="iv-meta">
          <span className="iv-label">Índice de Vulnerabilidad</span>
          <span className="iv-cat" style={{ color: cat.color }}>
            Vulnerabilidad {cat.etiqueta.toLowerCase()}
          </span>
        </div>
      </div>

      <dl className="datos">
        <div>
          <dt>Población</dt>
          <dd>{nucleo.poblacion.toLocaleString("es-ES")} hab.</dd>
        </div>
        <div>
          <dt>Mayores de 65</dt>
          <dd>{nucleo.pct_mayores_65}%</dd>
        </div>
        <div>
          <dt>Hogares unipersonales (mayores)</dt>
          <dd>{nucleo.pct_hogares_uniper_mayores}%</dd>
        </div>
        <div>
          <dt>Dispersión</dt>
          <dd className="cap">{nucleo.dispersion}</dd>
        </div>
        <div>
          <dt>Distancia a servicios</dt>
          <dd>{nucleo.distancia_servicios_km} km</dd>
        </div>
        <div>
          <dt>Accesos viarios</dt>
          <dd>{nucleo.num_accesos}</dd>
        </div>
        <div>
          <dt>Cobertura móvil</dt>
          <dd className="cap">{nucleo.cobertura_movil}</dd>
        </div>
      </dl>

      <div className="factores">
        <div className="factor">
          <span>Peligro biofísico</span>
          <Barra valor={nucleo.peligro_biofisico} color="#d9534f" />
          <strong>{nucleo.peligro_biofisico}</strong>
        </div>
        <div className="factor">
          <span>Capacidad de respuesta</span>
          <Barra valor={nucleo.capacidad_respuesta} color="#2e8b57" />
          <strong>{nucleo.capacidad_respuesta}</strong>
        </div>
      </div>

      {nucleo.notas && <p className="notas">{nucleo.notas}</p>}

      <p className="disclaimer">
        Abeiro informa, no sustituye a los servicios oficiales de emergencia. Salidas
        probabilísticas. <strong>Datos de prueba (Fase 0).</strong>
      </p>
    </aside>
  );
}
