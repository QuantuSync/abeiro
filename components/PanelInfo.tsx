"use client";

import { categoriaPorIV } from "@/lib/vulnerabilidad";
import { categoriaEvac } from "@/lib/evacuacion";

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
  // Peligro biofísico (pendiente real + combustible Sentinel-2 NDVI+NDMI).
  pendiente_grados?: number;
  cota_m?: number;
  combustibilidad?: number;
  cobertura_osm?: number;
  biomasa_ndvi?: number;
  combustible_dominante?: string;
  combustible_fuente?: string;
  ndvi?: number;
  ndmi?: number;
  dato_pendiente_real?: boolean;
  dato_combustible_aprox?: boolean;
  combustible_sin_dato?: boolean;
  // Afectación física 2025 (validación EMSR837; NO es parte del IV).
  afect_fisica?: boolean;
  borde_500m?: boolean;
  fecha_frente?: string | null;
  dist_area_m?: number;
  // Evacuación estática (capa independiente; NO es parte del IV).
  es_destino?: boolean;
  destino?: string;
  destino_nombre?: string;
  dist_km?: number;
  tiempo_min?: number;
  rutas_alternativas?: number | null;
  fiabilidad?: number;
  pct_track?: number;
  dificultad_evac?: number;
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

// Modos de ruta de escape. Estructura preparada para el futuro: activar un modo
// "proximamente" será cambiar su `estado` a "activo" y conectar su `onActivar`,
// sin rehacer la interfaz.
type ModoEscape = {
  id: string;
  titulo: string;
  estado: "activo" | "proximamente";
  etiqueta?: string; // texto del estado deshabilitado
};
const MODOS_ESCAPE: ModoEscape[] = [
  { id: "coche", titulo: "Ruta de escape en coche", estado: "activo" },
  { id: "pie", titulo: "Ruta de escape a pie", estado: "proximamente", etiqueta: "Próximamente" },
  {
    id: "dinamica",
    titulo: "Ruta dinámica según el fuego",
    estado: "proximamente",
    etiqueta: "Requiere motor de propagación (próximamente)",
  },
];

export default function PanelInfo({
  nucleo,
  onClose,
  onRutaCoche,
}: {
  nucleo: NucleoProps;
  onClose: () => void;
  onRutaCoche?: (id: string) => void;
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

      <div className="bloque-titulo bt-vuln">Vulnerabilidad</div>

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
                  : nucleo.combustible_fuente === "Sentinel-2 NDVI+NDMI"
                  ? "pendiente real · combustible Sentinel-2 NDVI+NDMI"
                  : `pendiente real · combustible ${nucleo.combustible_fuente || "aprox."}`}
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
              <strong>sin dato</strong>
            ) : (
              <>
                <strong>{nucleo.combustibilidad}</strong>
                {nucleo.ndvi != null && (
                  <span className="ponderado" title="NDVI Sentinel-2 (biomasa/densidad de vegetación, verano 2025): más alto = más material">
                    {" · "}NDVI {nucleo.ndvi}
                  </span>
                )}
                {nucleo.ndmi != null && (
                  <span className="ponderado" title="NDMI Sentinel-2 (humedad de vegetación): más bajo = más seco = más inflamable">
                    {" · "}NDMI {nucleo.ndmi}
                  </span>
                )}
                {nucleo.combustible_dominante && (
                  <span className="ponderado" title="Cubierta dominante OSM (referencia; el combustible se mide ya por satélite)">
                    {" · "}cubierta {cubiertaLegible(nucleo.combustible_dominante)}
                  </span>
                )}
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

      {(nucleo.es_destino || nucleo.destino_nombre) && (
        <div className="bloque-titulo bt-evac">Evacuación</div>
      )}

      {nucleo.es_destino ? (
        <div className="evacuacion destino">
          <div className="evac-destino">★ Destino seguro (cabecera comarcal con servicios)</div>
        </div>
      ) : nucleo.destino_nombre ? (
        <div className="evacuacion">
          {nucleo.dificultad_evac != null && (() => {
            const ce = categoriaEvac(nucleo.dificultad_evac);
            return (
              <div className="dif-bloque" style={{ borderColor: ce.color }}>
                <div className="dif-num" style={{ color: ce.color }}>{nucleo.dificultad_evac}</div>
                <div className="dif-meta">
                  <span className="dif-label">Dificultad de evacuación</span>
                  <span className="dif-cat" style={{ color: ce.color }}>Evacuación {ce.etiqueta.toLowerCase()}</span>
                </div>
                <Origen real="aprox" texto="OSM · routing local" />
              </div>
            );
          })()}
          <div className="evac-destino">
            Destino seguro más cercano: <strong>{nucleo.destino_nombre}</strong>
          </div>
          <dl className="datos evac-datos">
            <div>
              <dt>Distancia por carretera</dt>
              <dd>{nucleo.dist_km} km</dd>
            </div>
            <div>
              <dt>Tiempo estimado</dt>
              <dd>{nucleo.tiempo_min} min</dd>
            </div>
            <div>
              <dt>Rutas alternativas independientes</dt>
              <dd className={nucleo.rutas_alternativas != null && nucleo.rutas_alternativas <= 1 ? "alerta" : ""}>
                {nucleo.rutas_alternativas ?? "—"}
                {nucleo.rutas_alternativas != null && nucleo.rutas_alternativas <= 1 && " (sin redundancia)"}
              </dd>
            </div>
            <div>
              <dt>Recorrido por pista forestal</dt>
              <dd className={nucleo.pct_track != null && nucleo.pct_track >= 25 ? "alerta" : ""}>
                {nucleo.pct_track}% {nucleo.pct_track != null && nucleo.pct_track >= 25 && "⚠"}
              </dd>
            </div>
          </dl>
          <p className="evac-nota">
            Ruta más rápida por carretera (OSM, routing local; pistas penalizadas).
            Evacuación <strong>estática</strong>: no considera aún el fuego (qué vías quedan
            cortadas) ni el tráfico. Capa independiente, no parte del índice.
          </p>

          <div className="escape">
            <div className="escape-titulo">Rutas de escape</div>
            <div className="escape-botones">
              {MODOS_ESCAPE.map((m) =>
                m.estado === "activo" ? (
                  <button
                    key={m.id}
                    type="button"
                    className="escape-btn activo"
                    onClick={() => onRutaCoche?.(nucleo.id)}
                  >
                    <span className="eb-titulo">{m.titulo}</span>
                    <span className="eb-sub">
                      {nucleo.destino_nombre} · {nucleo.dist_km} km · {nucleo.tiempo_min} min
                    </span>
                  </button>
                ) : (
                  <button
                    key={m.id}
                    type="button"
                    className="escape-btn deshabilitado"
                    disabled
                    aria-disabled="true"
                    title={m.etiqueta}
                  >
                    <span className="eb-titulo">{m.titulo}</span>
                    <span className="eb-badge">{m.etiqueta}</span>
                  </button>
                )
              )}
            </div>
            <p className="escape-aviso">
              La ruta en coche es una <strong>ruta de referencia en condiciones normales</strong>
              {" "}(planificación), no una indicación de emergencia en tiempo real.
            </p>
          </div>
        </div>
      ) : null}

      {nucleo.afect_fisica !== undefined && (
        <div className="afectacion">
          <div className="afect-head">
            Afectación física · incendio 2025{" "}
            <Origen real="aprox" texto="Copernicus EMS · EMSR837" />
          </div>
          <div className={`afect-estado ${nucleo.afect_fisica ? "dentro" : nucleo.borde_500m ? "borde" : "fuera"}`}>
            {nucleo.afect_fisica
              ? "Dentro del perímetro quemado"
              : nucleo.borde_500m
              ? "En el borde (a ≤ 500 m del área quemada)"
              : "Fuera del perímetro"}
            {!nucleo.afect_fisica && nucleo.dist_area_m != null && (
              <span className="afect-dist"> · {Math.round(nucleo.dist_area_m)} m</span>
            )}
          </div>
          {nucleo.fecha_frente && (
            <div className="afect-fecha">Frente más próximo: <strong>{nucleo.fecha_frente}</strong></div>
          )}
          <p className="afect-nota">
            Perímetro EMSR837/AOI01 (delineación Copernicus EMS, ago-2025). Capa de
            validación, no componente del índice. El perímetro puede no ser completo
            respecto al total del complejo de incendios.
          </p>
        </div>
      )}

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
