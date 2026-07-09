"use client";

import { categoriaPorIV } from "@/lib/vulnerabilidad";
import { categoriaEvac } from "@/lib/evacuacion";
import type { NucleoProps } from "@/lib/tipos";

//ANTES import {NucleoProps} from "@/lib/tipos"
// El tipo de las propiedades fusionadas vive en lib/datos.ts; se re-exporta
// aquí por compatibilidad con los importadores existentes.
export type { NucleoProps };


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

// Nivel legible de la confianza (mismos umbrales que nivelConfianza en
// lib/indice.mjs; la fórmula está en metadata.confianza_nota).
function nivelConfianza(c: number): { etiqueta: string; explica: string } {
  if (c >= 0.75) return { etiqueta: "alta", explica: "la mayoría de las variables son medidas reales" };
  if (c >= 0.5) return { etiqueta: "media", explica: "mezcla datos reales con aproximaciones y estimaciones" };
  return { etiqueta: "baja", explica: "predominan estimaciones provisionales" };
}

// rango_iv puede llegar como array real (import directo del JSON) o como string
// JSON "[47,52]" (MapLibre serializa las propiedades array/objeto de las
// features al pasarlas por el evento de clic). Se normaliza a [min, max] o null.
function parseRangoIV(r: unknown): [number, number] | null {
  let v = r;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return [v[0], v[1]];
  }
  return null;
}

// Valor legible o marcador neutro "sin dato" (no inventa datos: si el valor no
// existe o viene vacío, lo señala explícitamente).
function oSinDato(valor: unknown, sufijo = ""): string {
  if (valor === null || valor === undefined || valor === "") return "sin dato";
  return `${valor}${sufijo}`;
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

      {nucleo.confianza != null && (() => {
        const nc = nivelConfianza(nucleo.confianza);
        const rango = parseRangoIV(nucleo.rango_iv);
        return (
          <p className={`confianza conf-${nc.etiqueta}`}>
            Confianza del dato: <strong>{nc.etiqueta}</strong> — {nc.explica}.
            {rango && (
              <span
                className="conf-rango"
                title="Rango del IV al variar los pesos provisionales del índice (análisis de sensibilidad)"
              >
                {" "}Según los pesos, el IV varía entre {rango[0]} y {rango[1]}.
              </span>
            )}
          </p>
        );
      })()}

      {nucleo.poblacion < 50 && (
        <p className="aviso-proxy">
          Aldea muy pequeña ({nucleo.poblacion} hab.): el % de mayores es un proxy del
          concello y puede no representar bien a sus vecinos.
        </p>
      )}

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
          <dd>{nucleo.pct_hogares_uniper_mayores != null ? `${nucleo.pct_hogares_uniper_mayores}%` : "sin dato"}</dd>
        </div>
        <div>
          <dt>Dispersión</dt>
          <dd className="cap">{oSinDato(nucleo.dispersion)}</dd>
        </div>
        <div>
          <dt>Distancia a servicios</dt>
          <dd>{nucleo.distancia_servicios_km != null ? `${nucleo.distancia_servicios_km} km` : "sin dato"}</dd>
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
          <dd className="cap">{oSinDato(nucleo.cobertura_movil)}</dd>
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
          <Barra valor={nucleo.peligro_biofisico} color="#b5402f" />
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
          <Barra valor={nucleo.capacidad_respuesta} color="#2f6b46" />
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
            {nucleo.fiabilidad != null && (
              <div>
                <dt>Fiabilidad de la vía</dt>
                <dd>{Math.round(nucleo.fiabilidad * 100)}%</dd>
              </div>
            )}
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
            Perímetro oficial EMSR837/AOI01 (delineación Copernicus EMS, ago-2025), empleado
            como capa de validación del índice frente al incendio real.
          </p>
        </div>
      )}

      {nucleo.notas && <p className="notas">{nucleo.notas}</p>}

      <p className="disclaimer">
        Abeiro es una herramienta de apoyo a la decisión; no sustituye al despacho oficial de
        los servicios de emergencia.{" "}
        {nucleo.dato_poblacion_real ? (
          <>
            Datos reales: población (Nomenclátor IGE 2025
            {nucleo.ige_nome ? `, "${nucleo.ige_nome}"` : ""})
            {nucleo.dato_edad_real ? ", % de mayores (Padrón IGE 2022, proxy concello)" : ""}
            {nucleo.dato_capacidad_real ? ", vías de salida (OpenStreetMap)" : ""}. El
            peligro biofísico se mide por satélite (Sentinel-2) como aproximación.
          </>
        ) : (
          <strong>Datos de demostración.</strong>
        )}
      </p>
    </aside>
  );
}
