"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ESTILO_BASE } from "@/lib/mapa-config";
import { EXPRESION_COLOR_IV, CATEGORIAS_IV, categoriaPorIV } from "@/lib/vulnerabilidad";

// Vista provincial de Ourense (683 núcleos activos, >=50 hab), lente de
// VULNERABILIDAD (la evacuación queda fuera de este hito). Dos niveles:
//   - Lejos: COROPLETA por concello (IV medio) para no saturar; clic = drill-down.
//   - Cerca: los núcleos con CLUSTERING de MapLibre, coloreados por IV.
const CENTRO: [number, number] = [-7.55, 42.20];
const ZOOM = 8;

interface NucleoOU {
  id: string; nombre: string; concello: string; iv: number; poblacion: number;
  peligro_biofisico: number; score_social: number; capacidad_respuesta: number;
  confianza: number; afectado_hist: boolean; n_afectaciones: number;
}

// Nivel legible de confianza (mismos umbrales que lib/indice.mjs).
function nivelConfianza(c: number): { etiqueta: string; explica: string } {
  if (c >= 0.75) return { etiqueta: "alta", explica: "la mayoría de las variables son medidas reales" };
  if (c >= 0.5) return { etiqueta: "media", explica: "mezcla datos reales con aproximaciones" };
  return { etiqueta: "baja", explica: "predominan estimaciones" };
}

function Barra({ valor, color }: { valor: number; color: string }) {
  return <div className="barra"><div className="barra-fill" style={{ width: `${valor}%`, backgroundColor: color }} /></div>;
}

export default function MapaOurense() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [sel, setSel] = useState<NucleoOU | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: contenedor.current, style: ESTILO_BASE,
      center: CENTRO, zoom: ZOOM, minZoom: 7, maxZoom: 15,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    (window as unknown as { __mapaOurense?: MapLibreMap }).__mapaOurense = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // --- Coropleta por concello (IV medio), visible de lejos --------------
      map.addSource("concellos", { type: "geojson", data: "/concellos_ourense.geojson" });
      map.addLayer({
        id: "concellos-fill", type: "fill", source: "concellos", maxzoom: 10.5,
        paint: {
          "fill-color": ["step", ["get", "iv_medio"], CATEGORIAS_IV[0].color,
            20, CATEGORIAS_IV[1].color, 40, CATEGORIAS_IV[2].color,
            60, CATEGORIAS_IV[3].color, 80, CATEGORIAS_IV[4].color],
          "fill-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "concellos-line", type: "line", source: "concellos", maxzoom: 10.5,
        paint: { "line-color": "#15110a", "line-width": 0.6, "line-opacity": 0.5 },
      });
      map.addLayer({
        id: "concellos-label", type: "symbol", source: "concellos", maxzoom: 10.5,
        layout: {
          "text-field": ["get", "concello"], "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 10, 13], "text-padding": 6,
        },
        paint: { "text-color": "#161b18", "text-halo-color": "#ffffff", "text-halo-width": 1.8 },
      });

      // --- Núcleos con clustering, visibles al acercar ----------------------
      map.addSource("nuc", {
        type: "geojson", data: "/nucleos_ourense.geojson",
        cluster: true, clusterRadius: 50, clusterMaxZoom: 12,
      });
      map.addLayer({
        id: "clusters", type: "circle", source: "nuc", filter: ["has", "point_count"], minzoom: 9,
        paint: {
          "circle-color": "#1f3b57", "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 40, 27],
          "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "nuc", filter: ["has", "point_count"], minzoom: 9,
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "nucleo", type: "circle", source: "nuc", filter: ["!", ["has", "point_count"]], minzoom: 9,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "iv"], 0, 5, 100, 10],
          "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
          "circle-stroke-color": ["case", ["get", "afectado_hist"], "#3a0d06", "#1c1c1c"],
          "circle-stroke-width": ["case", ["get", "afectado_hist"], 2.6, 1.2],
        },
      });

      // Drill-down: clic en un concello encuadra su geometría.
      map.on("click", "concellos-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];
        const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 700 });
      });
      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        (map.getSource("nuc") as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(f.properties!.cluster_id as number)
          .then((z) => map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
      });
      map.on("click", "nucleo", (e) => {
        const p = e.features?.[0]?.properties as unknown as NucleoOU;
        if (p) setSel(p);
      });
      for (const capa of ["concellos-fill", "clusters", "nucleo"]) {
        map.on("mouseenter", capa, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", capa, () => { map.getCanvas().style.cursor = ""; });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const cat = sel ? categoriaPorIV(sel.iv) : null;
  const nc = sel ? nivelConfianza(sel.confianza) : null;

  return (
    <div className="mapa-wrap">
      <div ref={contenedor} className="mapa" />

      {/* Leyenda: categorías del IV (paleta accesible) + avisos de alcance. */}
      <section className="leyenda" aria-label="Leyenda del Índice de Vulnerabilidad de Ourense">
        <h3>Índice de Vulnerabilidad</h3>
        <ul>
          {CATEGORIAS_IV.map((c) => (
            <li key={c.id}>
              <span className="swatch" style={{ backgroundColor: c.color }} />
              <span className="etiqueta">{c.etiqueta}</span>
              <span className="rango">{c.min}{c.max === 100 ? "–100" : `–${c.max}`}</span>
            </li>
          ))}
        </ul>
        <p className="dato-real-nota"><span className="anillo" style={{ borderColor: "#3a0d06" }} /> Borde oscuro: con incendios 2001–2021</p>
        <p className="aviso">
          Aleja para ver el IV medio por <strong>concello</strong>; pincha uno para entrar.
          Solo núcleos <strong>≥50 hab</strong> (los &lt;50, de los más vulnerables, quedan fuera
          del primer barrido por coste). Afectación = proxy <strong>GlobFire</strong> (MODIS
          ~500 m), no registro oficial. Pesos <strong>provisionales</strong>.
        </p>
      </section>

      {sel && cat && nc && (
        <aside className="panel" aria-label={`Información de ${sel.nombre}`}>
          <button className="cerrar" onClick={() => setSel(null)} aria-label="Cerrar">×</button>
          <header className="panel-head">
            <h2>{sel.nombre}</h2>
            <p className="concello">Concello de {sel.concello}</p>
          </header>

          <div className="bloque-titulo bt-vuln">Vulnerabilidad</div>
          <div className="iv-bloque" style={{ borderColor: cat.color }}>
            <div className="iv-num" style={{ color: cat.color }}>{sel.iv}</div>
            <div className="iv-meta">
              <span className="iv-label">Índice de Vulnerabilidad</span>
              <span className="iv-cat" style={{ color: cat.color }}>Vulnerabilidad {cat.etiqueta.toLowerCase()}</span>
            </div>
          </div>

          <p className={`confianza conf-${nc.etiqueta}`}>
            Confianza del dato: <strong>{nc.etiqueta}</strong> — {nc.explica}.
          </p>

          <dl className="datos">
            <div>
              <dt>Población <span className="origen real" title="Nomenclátor IGE 2025">real · IGE</span></dt>
              <dd>{sel.poblacion.toLocaleString("es-ES")} hab.</dd>
            </div>
          </dl>

          <div className="factores">
            <div className="factor">
              <span>Peligro biofísico <span className="origen aprox" title="Combustible Sentinel-2 NDVI+NDMI (aproximación) · pendiente SRTM 30 m (respaldo del MDT-CNIG)">aprox · satélite/SRTM</span></span>
              <Barra valor={sel.peligro_biofisico} color="#b5402f" /><strong>{sel.peligro_biofisico}</strong>
            </div>
            <div className="factor">
              <span>Sensibilidad social <span className="origen real" title="Población real (IGE) + % mayores 65 real del Padrón INE aplicado como proxy por concello">real · IGE/INE (proxy edad)</span></span>
              <Barra valor={sel.score_social} color="#a75f1b" /><strong>{sel.score_social}</strong>
            </div>
            <div className="factor">
              <span>Capacidad de respuesta <span className="origen real" title="Vías de salida OpenStreetMap">real · OSM</span></span>
              <Barra valor={sel.capacidad_respuesta} color="#2f6b46" /><strong>{sel.capacidad_respuesta}</strong>
            </div>
          </div>

          <div className="afectacion">
            <div className="afect-head">Incendios 2001–2021 <span className="origen aprox" title="GlobFire, MODIS ~500 m">proxy · GlobFire</span></div>
            <div className={`afect-estado ${sel.afectado_hist ? "dentro" : "fuera"}`}>
              {sel.afectado_hist ? `Afectado ${sel.n_afectaciones} vez(ces)` : "Sin registro de gran incendio"}
            </div>
            <p className="afect-nota">
              GlobFire (Comisión Europea, satélite MODIS) aporta el historial de grandes
              incendios 2001–2021. La validación con datos de <strong>impacto humano</strong>
              {" "}(evacuaciones y confinamientos) está integrada en el sistema y se activará al
              incorporarlos.
            </p>
          </div>

          <p className="disclaimer">
            Piloto de escalado a Galicia (Ourense). Índice de apoyo a la decisión con pesos
            provisionales; no sustituye al despacho operativo de los servicios de emergencia.
          </p>
        </aside>
      )}
    </div>
  );
}
