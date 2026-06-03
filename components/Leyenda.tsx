"use client";

import { CATEGORIAS_IV } from "@/lib/vulnerabilidad";

export default function Leyenda() {
  return (
    <div className="leyenda" aria-label="Leyenda del Índice de Vulnerabilidad">
      <h3>Índice de Vulnerabilidad</h3>
      <ul>
        {CATEGORIAS_IV.map((c) => (
          <li key={c.id}>
            <span className="swatch" style={{ backgroundColor: c.color }} />
            <span className="etiqueta">{c.etiqueta}</span>
            <span className="rango">
              {c.min}{c.id === "muy-alta" ? "–100" : `–${c.max}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="aviso">Datos de prueba (Fase 0). No usar para decisiones reales.</p>
    </div>
  );
}
