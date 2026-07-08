"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ESTILO_BASE } from "@/lib/mapa-config";
import { EXPRESION_COLOR_IV, categoriaPorIV } from "@/lib/vulnerabilidad";

// Vista provincial de Ourense (650 núcleos activos, >=50 hab). A esta escala se
// usa CLUSTERING de MapLibre para no bloquear el navegador: los puntos se
// agrupan por zoom y solo se pintan individualmente al acercarse. Es la lente
// de VULNERABILIDAD (la evacuación queda fuera de este hito).
const CENTRO: [number, number] = [-7.55, 42.20];
const ZOOM = 8;

interface Props {
  id: string; nombre: string; concello: string; iv: number; poblacion: number;
  afectado_hist: boolean; n_afectaciones: number; confianza: number;
  peligro_biofisico?: number; score_social?: number; capacidad_respuesta?: number;
}

export default function MapaOurense() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [sel, setSel] = useState<Props | null>(null);

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
      map.addSource("nuc", {
        type: "geojson", data: "/nucleos_ourense.geojson",
        cluster: true, clusterRadius: 55, clusterMaxZoom: 12,
      });

      // Clusters: círculo dorado escalado por nº de núcleos agrupados.
      map.addLayer({
        id: "clusters", type: "circle", source: "nuc", filter: ["has", "point_count"],
        paint: {
          "circle-color": "#c8a44a",
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
          "circle-stroke-width": 1.5, "circle-stroke-color": "#15110a",
        },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "nuc", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13 },
        paint: { "text-color": "#15110a" },
      });

      // Núcleos individuales: color por IV (paleta accesible YlOrRd), borde más
      // grueso y punto oscuro si tiene historial de incendios.
      map.addLayer({
        id: "nucleo", type: "circle", source: "nuc", filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "iv"], 0, 5, 100, 10],
          "circle-color": EXPRESION_COLOR_IV as maplibregl.ExpressionSpecification,
          "circle-stroke-color": ["case", ["get", "afectado_hist"], "#3a0d06", "#1c1c1c"],
          "circle-stroke-width": ["case", ["get", "afectado_hist"], 2.6, 1.2],
        },
      });

      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const src = map.getSource("nuc") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(f.properties!.cluster_id as number).then((z) => {
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z });
        });
      });
      map.on("click", "nucleo", (e) => {
        const p = e.features?.[0]?.properties as unknown as Props;
        if (p) setSel(p);
      });
      for (const capa of ["clusters", "nucleo"]) {
        map.on("mouseenter", capa, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", capa, () => { map.getCanvas().style.cursor = ""; });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const cat = sel ? categoriaPorIV(sel.iv) : null;
  return (
    <div className="mapa-wrap">
      <div ref={contenedor} className="mapa" />
      {sel && cat && (
        <aside className="panel" aria-label={`Información de ${sel.nombre}`}>
          <button className="cerrar" onClick={() => setSel(null)} aria-label="Cerrar">×</button>
          <header className="panel-head">
            <h2>{sel.nombre}</h2>
            <p className="concello">Concello de {sel.concello}</p>
          </header>
          <div className="iv-bloque" style={{ borderColor: cat.color }}>
            <div className="iv-num" style={{ color: cat.color }}>{sel.iv}</div>
            <div className="iv-meta">
              <span className="iv-label">Índice de Vulnerabilidad</span>
              <span className="iv-cat" style={{ color: cat.color }}>Vulnerabilidad {cat.etiqueta.toLowerCase()}</span>
            </div>
          </div>
          <dl className="datos">
            <div><dt>Población</dt><dd>{sel.poblacion.toLocaleString("es-ES")} hab.</dd></div>
            <div><dt>Peligro biofísico</dt><dd>{sel.peligro_biofisico ?? "—"}</dd></div>
            <div><dt>Sensibilidad social</dt><dd>{sel.score_social ?? "—"}</dd></div>
            <div><dt>Capacidad de respuesta</dt><dd>{sel.capacidad_respuesta ?? "—"}</dd></div>
            <div>
              <dt>Incendios 2001–2021 (GlobFire)</dt>
              <dd className={sel.afectado_hist ? "alerta" : ""}>
                {sel.afectado_hist ? `${sel.n_afectaciones} vez(ces)` : "sin registro"}
              </dd>
            </div>
          </dl>
          <p className="disclaimer">
            Piloto de escalado a Galicia. Vulnerabilidad con pesos <strong>provisionales</strong>,
            no calibrados. La afectación GlobFire (MODIS ~500 m) es un proxy de grandes incendios,
            no el registro oficial. No es herramienta operativa.
          </p>
        </aside>
      )}
    </div>
  );
}
