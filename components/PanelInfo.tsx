"use client";

import { categoriaPorIV } from "@/lib/vulnerabilidad";

export interface NucleoProps {
  id: string;
  nombre: string;
  concello: string;
  iv: number;
  poblacion: number;
  pct_mayores_65: number; // fracción 0-1
  pct_hogares_uniper_mayores: number;
  dispersion: string;
  distancia_servicios_km: number;
  peligro_biofisico: number;
  capacidad_respuesta: number;
  num_accesos: number;
  cobertura_movil: string;
  notas: string;
  // Procedencia del dato (Fase 1).
  dato_poblacion_real?: boolean;
  dato_edad_real?: boolean;
  edad_proxy_concello?: boolean;
  fuente_poblacion?: string;
  fuente_edad?: string;
  ige_nome?: string;
  // Capacidad de respuesta (vías de salida, OpenStreetMap).
  vias_salida?: number;
  vias_salida_ponderadas?: number;
  vias_salida_por_tipo?: Record<string, number>;
  dato_capacidad_real?: boolean;
  fuente_capacidad?: string;
  // Peligro biofísico (pendiente real + combustible aproximado).
  pendiente_grados?: number;
  cota_m?: number;
  combustibilidad?: number;
  combustible_dominante?: string;
  dato_pendiente_real?: boolean;
  dato_combustible_aprox?: boolean;
  combustible_sin_dato?: boolean;
}

// Traduce la etiqueta OSM de cubierta dominante a algo legible.
function cubiertaLegible(clase?: string): string {
  if (!clase) return "—";
  const t = clase.replace(/^(landuse|natural)=/, "");
  const map: Record<string, string> = {
    forest: "bosque", wood: "bosque", scrub: "matorral", heath: "matorral (toxo/xesta)",
    grassland: "pastos", meadow: "prado", grass: "herbáceo", farmland: "cultivo",
    orchard: "frutal", vineyard: "viñedo", residential: "urbano", bare_rock: "roca",
    water: "agua", wetland: "humedal",
  };
  return map[t] || t;
}

function Barra({ valor, color }: { valor: number; color: string }) {
  return (
    <div className="barra">
      <div className="barra-fill" style={{ width: `${valor}%`, backgroundColor: color }} />
    </div>
  );
}

// Etiqueta de procedencia del dato: real (verde), aproximación (ámbar) o
// estimación (gris). `real` admite boolean (compat) o el literal "aprox".
function Origen({ real, texto }: { real: boolean | "aprox"; texto: string }) {
  const clase = real === "aprox" ? "aprox" : real ? "real" : "estim";
  return <span className={`origen ${clase}`} title={texto}>{texto}</span>;
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
          <dt>
            Población{" "}
            <Origen
              real={!!nucleo.dato_poblacion_real}
              texto={nucleo.dato_poblacion_real ? "real · Nomenclátor 2025" : "estimación"}
            />
          </dt>
          <dd>{nucleo.poblacion.toLocaleString("es-ES")} hab.</dd>
        </div>
        <div>
          <dt>
            Mayores de 65{" "}
            <Origen
              real={!!nucleo.dato_edad_real}
              texto={nucleo.dato_edad_real ? "real · Padrón 2022 (proxy concello)" : "estimación"}
            />
          </dt>
          <dd>{Math.round(nucleo.pct_mayores_65 * 100)}%</dd>
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
          <dt>
            Vías de salida (OSM){" "}
            <Origen
              real={!!nucleo.dato_capacidad_real}
              texto={nucleo.dato_capacidad_real ? "real · OpenStreetMap" : "estimación"}
            />
          </dt>
          <dd>
            {nucleo.vias_salida ?? nucleo.num_accesos}
            {nucleo.vias_salida_ponderadas != null && (
              <span className="ponderado" title="Salidas ponderadas por clase de vía (pistas forestales cuentan menos)">
                {" "}({nucleo.vias_salida_ponderadas} pond.)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Cobertura móvil</dt>
          <dd className="cap">{nucleo.cobertura_movil}</dd>
        </div>
      </dl>

      <div className="factores">
        <div className="factor">
          <span>
            Peligro biofísico{" "}
            {nucleo.dato_pendiente_real ? (
              <Origen
                real="aprox"
                texto={nucleo.combustible_sin_dato
                  ? "pendiente real · combustible sin dato"
                  : "pendiente real · combustible aprox."}
              />
            ) : (
              <Origen real={false} texto="estimación" />
            )}
          </span>
          <Barra valor={nucleo.peligro_biofisico} color="#d9534f" />
          <strong>{nucleo.peligro_biofisico}</strong>
        </div>
        {nucleo.dato_pendiente_real && (
          <div className="subfactor">
            Pendiente <strong>{nucleo.pendiente_grados}°</strong>
            {nucleo.cota_m != null && <span> · {nucleo.cota_m} m</span>}
            {" · "}combustible{" "}
            {nucleo.combustible_sin_dato ? (
              <strong>sin dato OSM</strong>
            ) : (
              <>
                <strong>{cubiertaLegible(nucleo.combustible_dominante)}</strong>
                {nucleo.combustibilidad != null && <span> ({nucleo.combustibilidad})</span>}
              </>
            )}
          </div>
        )}
        <div className="factor">
          <span>
            Capacidad de respuesta{" "}
            <Origen real={!!nucleo.dato_capacidad_real} texto={nucleo.dato_capacidad_real ? "real · OSM" : "estimación"} />
          </span>
          <Barra valor={nucleo.capacidad_respuesta} color="#2e8b57" />
          <strong>{nucleo.capacidad_respuesta}</strong>
        </div>
      </div>

      {nucleo.notas && <p className="notas">{nucleo.notas}</p>}

      <p className="disclaimer">
        Abeiro informa, no sustituye a los servicios oficiales de emergencia. Salidas
        probabilísticas.{" "}
        {nucleo.dato_poblacion_real ? (
          <>
            Dato real: población (Nomenclátor IGE 2025
            {nucleo.ige_nome ? `, "${nucleo.ige_nome}"` : ""})
            {nucleo.dato_edad_real ? ", % de mayores (Padrón IGE 2022, proxy concello)" : ""}
            {nucleo.dato_capacidad_real ? ", vías de salida (OpenStreetMap)" : ""}. El
            peligro biofísico sigue siendo estimación provisional.
          </>
        ) : (
          <strong>Datos de prueba.</strong>
        )}
      </p>
    </aside>
  );
}
