// components/MapaOurense.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
//import type maplibregl from "maplibre-gl";
import maplibregl from "maplibre-gl"; //no type
import type { FeatureCollection, Point } from "geojson";

import { EXPRESION_COLOR_IV, CATEGORIAS_IV, categoriaPorIV } from "@/lib/vulnerabilidad";
import { FILTROS_DEFECTO, filtrando, pasaFiltros, type Filtros } from "@/lib/filtros";
import PanelFiltros from "@/components/PanelFiltros";
import type { Comarca } from "@/lib/tipos";

import { CENTRO_OURENSE, ZOOM_OURENSE } from "@/lib/mapa-config";

// Vista provincial de Ourense (683 núcleos activos, >=50 hab), lente de
// VULNERABILIDAD. Dos niveles: coropleta por concello (lejos) y clustering
// de núcleos (cerca).
// const CENTRO: [number, number] = [-7.55, 42.20];
// const ZOOM = 8;

// A partir de este zoom, se considera que el usuario ha "entrado" en una
// comarca concreta: se calcula la más cercana al centro de cámara y se avisa
// al padre para que cambie a modo detalle.
const ZOOM_UMBRAL_DETALLE = 11;

interface NucleoOU {
  id: string; nombre: string; concello: string; iv: number; poblacion: number;
  peligro_biofisico: number; score_social: number; capacidad_respuesta: number;
  confianza: number; afectado_hist: boolean; n_afectaciones: number;
}

function nivelConfianza(c: number): { etiqueta: string; explica: string } {
  if (c >= 0.75) return { etiqueta: "alta", explica: "la mayoría de las variables son medidas reales" };
  if (c >= 0.5) return { etiqueta: "media", explica: "mezcla datos reales con aproximaciones" };
  return { etiqueta: "baja", explica: "predominan estimaciones" };
}

function Barra({ valor, color }: { valor: number; color: string }) {
  return <div className="barra"><div className="barra-fill" style={{ width: `${valor}%`, backgroundColor: color }} /></div>;
}

type FCNuc = FeatureCollection<Point, NucleoOU>;
const VACIO: FCNuc = { type: "FeatureCollection", features: [] };

type Props = {
  map: MapLibreMap;
  comarcas: Comarca[];
  onEntrarDetalle: (comarcaId: string) => void;
};

export default function MapaOurense({ map, comarcas, onEntrarDetalle }: Props) {
  const [sel, setSel] = useState<NucleoOU | null>(null);
  const [datos, setDatos] = useState<FCNuc | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_DEFECTO);

  const { fcVisible, visibles, total } = useMemo(() => {
    if (!datos) return { fcVisible: null as FCNuc | null, visibles: 0, total: 0 };
    const opts = { campoAfectacion: "afectado_hist" as const, soporteVias: false };
    const feats = filtrando(filtros)
      ? datos.features.filter((f) => pasaFiltros(f.properties, filtros, opts))
      : datos.features;
    return {
      fcVisible: { type: "FeatureCollection", features: feats } as FCNuc,
      visibles: feats.length,
      total: datos.features.length,
    };
  }, [datos, filtros]);

  // ACTIVACIÓN: añade capas de concello + núcleos (la fuente "nuc" se crea
  // VACÍA de entrada, igual que "nucleos" en MapaVulnerabilidad; el fetch la
  // rellena vía el efecto [fcVisible] de más abajo, no aquí). Registra
  // listeners nombrados y el umbral de zoom→detalle. La LIMPIEZA revierte
  // todo: capas, fuentes, listeners, y evita tocar `datos` si el componente
  // ya se desactivó antes de que el fetch resolviera.
  useEffect(() => {
    let cancelado = false;

    map.setMaxBounds(undefined); // vista general: sin restricción de movimiento
    map.jumpTo({ center: CENTRO_OURENSE, zoom: ZOOM_OURENSE });

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
      type: "geojson", data: VACIO,
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
        "circle-opacity": 1,
        "circle-stroke-color": ["case", ["get", "afectado_hist"], "#3a0d06", "#1c1c1c"],
        "circle-stroke-width": ["case", ["get", "afectado_hist"], 2.6, 1.2],
      },
    });

    // --- Listeners nombrados (para poder quitarlos exactamente al limpiar) ---
    const alClicConcello = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const coords = (f.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];
      const b = coords.reduce((acc, c) => acc.extend(c), new (map.constructor as typeof maplibregl.Map extends never ? never : any)());
      // extraaaa
      map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 700 });
    };

    map.on("click", "concellos-fill", alClicConcello);

    const alClicCluster = (e: maplibregl.MapLayerMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!f) return;
      (map.getSource("nuc") as maplibregl.GeoJSONSource)
        .getClusterExpansionZoom(f.properties!.cluster_id as number)
        .then((z) => map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
    };
    map.on("click", "clusters", alClicCluster);

    const alClicNucleo = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as unknown as NucleoOU;
      if (p) setSel(p);
    };
    map.on("click", "nucleo", alClicNucleo);

    const alClicVacio = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["nucleo", "clusters"] });
      if (hits.length === 0) setSel(null);
    };
    map.on("click", alClicVacio);

    const alEntrar = () => { map.getCanvas().style.cursor = "pointer"; };
    const alSalir = () => { map.getCanvas().style.cursor = ""; };
    const CAPAS_HOVER = ["concellos-fill", "clusters", "nucleo"];
    for (const capa of CAPAS_HOVER) {
      map.on("mouseenter", capa, alEntrar);
      map.on("mouseleave", capa, alSalir);
    }

    // --- Umbral de zoom → entrar en detalle --------------------------------
    const alCambiarZoom = () => {
      if (map.getZoom() <= ZOOM_UMBRAL_DETALLE || comarcas.length === 0) return;
      const centro = map.getCenter();
      let masCercana = comarcas[0];
      let distMin = Infinity;
      for (const c of comarcas) {
        const d = Math.hypot(c.centro[0] - centro.lng, c.centro[1] - centro.lat);
        if (d < distMin) { distMin = d; masCercana = c; }
      }
      onEntrarDetalle(masCercana.id);
    };
    map.on("zoomend", alCambiarZoom);

    // --- Datos: fetch de los 683 núcleos, con guarda contra "cancelado" ---
    fetch("/nucleos_ourense.geojson")
      .then((r) => r.json())
      .then((gj: FCNuc) => { if (!cancelado) setDatos(gj); });

    return () => {
      cancelado = true;

      map.off("click", "concellos-fill", alClicConcello);
      map.off("click", "clusters", alClicCluster);
      map.off("click", "nucleo", alClicNucleo);
      map.off("click", alClicVacio);
      for (const capa of CAPAS_HOVER) {
        map.off("mouseenter", capa, alEntrar);
        map.off("mouseleave", capa, alSalir);
      }
      map.off("zoomend", alCambiarZoom);

      for (const id of ["concellos-fill", "concellos-line", "concellos-label", "clusters", "cluster-count", "nucleo"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ["concellos", "nuc"]) {
        if (map.getSource(id)) map.removeSource(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!fcVisible) return;
    const src = map.getSource("nuc") as maplibregl.GeoJSONSource | undefined;
    src?.setData(fcVisible);
  }, [fcVisible, map]);

  useEffect(() => {
    const sel2 = sel?.id ?? null;
    map.setPaintProperty("nucleo", "circle-opacity",
      (sel2 ? ["case", ["==", ["get", "id"], sel2], 1, 0.5] : 1) as unknown as maplibregl.ExpressionSpecification);
  }, [sel, map]);

  const cat = sel ? categoriaPorIV(sel.iv) : null;
  const nc = sel ? nivelConfianza(sel.confianza) : null;

  return (
    <>
      <PanelFiltros
        filtros={filtros}
        onChange={setFiltros}
        total={total}
        visibles={visibles}
        soporteVias={false}
        campoAfectacionLabel="incendio (2001–2021)"
      />

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
          Aleja para ver el IV medio por <strong>concello</strong>; pincha uno para entrar, o
          acércate más para pasar al detalle de la comarca. Solo núcleos <strong>≥50 hab</strong>{" "}
          (los &lt;50, de los más vulnerables, quedan fuera del primer barrido por coste).
          Afectación = proxy <strong>GlobFire</strong> (MODIS ~500 m), no registro oficial.
          Pesos <strong>provisionales</strong>.
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
    </>
  );
}