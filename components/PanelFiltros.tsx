"use client";

import { useState } from "react";
import {
  CATS, POBS, VIAS, ETIQUETA_CAT, ETIQUETA_POB, ETIQUETA_VIA,
  filtrando,
  type Filtros, type CatKey, type PobKey, type ViaKey, type Afect,
} from "@/lib/filtros";

// Panel de filtros: control fijo y sobrio (no modal). El botón de apertura está
// siempre accesible; nada se filtra solo (todo ocurre al tocar). Los filtros son
// aditivos. `soporteVias` desactiva el filtro de vías donde no hay evacuación.
export default function PanelFiltros({
  filtros, onChange, total, visibles, soporteVias, campoAfectacionLabel,
}: {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  total: number;
  visibles: number;
  soporteVias: boolean;
  campoAfectacionLabel: string; // p.ej. "incendio 2025" o "incendios 2001–2021"
}) {
  const [abierto, setAbierto] = useState(false);
  const activo = filtrando(filtros);

  const toggle = <K extends CatKey | PobKey | ViaKey>(lista: K[], v: K): K[] =>
    lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];

  return (
    <div className="filtros">
      <button
        className={`filtros-toggle${activo ? " con-filtro" : ""}`}
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls="panel-filtros"
      >
        Filtros
        <span className="filtros-conteo" aria-hidden="true">{visibles}/{total}</span>
      </button>

      {abierto && (
        <div id="panel-filtros" className="filtros-panel" role="group" aria-label="Filtros de núcleos">
          <p className="filtros-resumen" aria-live="polite">
            <strong>{visibles}</strong> de {total} núcleos cumplen el filtro
          </p>

          <fieldset className="filtros-grupo">
            <legend>Vulnerabilidad</legend>
            <div className="filtros-chips">
              {CATS.map((c: CatKey) => (
                <label key={c} className={`chip${filtros.categorias.includes(c) ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={filtros.categorias.includes(c)}
                    onChange={() => onChange({ ...filtros, categorias: toggle(filtros.categorias, c) })}
                  />
                  {ETIQUETA_CAT[c]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filtros-grupo">
            <legend>Población (hab.)</legend>
            <div className="filtros-chips">
              {POBS.map((p: PobKey) => (
                <label key={p} className={`chip${filtros.poblacion.includes(p) ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={filtros.poblacion.includes(p)}
                    onChange={() => onChange({ ...filtros, poblacion: toggle(filtros.poblacion, p) })}
                  />
                  {ETIQUETA_POB[p]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filtros-grupo">
            <legend>Afectado por {campoAfectacionLabel}</legend>
            <div className="filtros-chips">
              {(["todos", "si", "no"] as Afect[]).map((a) => (
                <label key={a} className={`chip${filtros.afectacion === a ? " on" : ""}`}>
                  <input
                    type="radio"
                    name="filtro-afectacion"
                    checked={filtros.afectacion === a}
                    onChange={() => onChange({ ...filtros, afectacion: a })}
                  />
                  {a === "todos" ? "Todos" : a === "si" ? "Sí" : "No"}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="filtros-grupo" disabled={!soporteVias}>
            <legend>Vías de salida</legend>
            {soporteVias ? (
              <div className="filtros-chips">
                {VIAS.map((v: ViaKey) => (
                  <label key={v} className={`chip${filtros.vias.includes(v) ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={filtros.vias.includes(v)}
                      onChange={() => onChange({ ...filtros, vias: toggle(filtros.vias, v) })}
                    />
                    {ETIQUETA_VIA[v]}
                  </label>
                ))}
              </div>
            ) : (
              <p className="filtros-nota">No disponible en esta vista (sin capa de evacuación).</p>
            )}
          </fieldset>

          <button
            className="filtros-limpiar"
            onClick={() => onChange({ categorias: [], poblacion: [], afectacion: "todos", vias: [] })}
            disabled={!activo}
          >
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}
