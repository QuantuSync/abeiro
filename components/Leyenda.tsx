"use client";

import { CATEGORIAS_IV } from "@/lib/vulnerabilidad";
import { CATEGORIAS_EVAC } from "@/lib/evacuacion";

export type Lente = "vulnerabilidad" | "evacuacion";

export default function Leyenda({ lente }: { lente: Lente }) {
  const evac = lente === "evacuacion";
  const cats = evac ? CATEGORIAS_EVAC : CATEGORIAS_IV;

  return (
    <section className="leyenda" aria-label={evac ? "Leyenda de dificultad de evacuación" : "Leyenda del Índice de Vulnerabilidad"}>
      <h3>{evac ? "Dificultad de evacuación" : "Índice de Vulnerabilidad"}</h3>
      <ul>
        {cats.map((c) => (
          <li key={c.id}>
            <span className="swatch" style={{ backgroundColor: c.color }} />
            <span className="etiqueta">{c.etiqueta}</span>
            <span className="rango">
              {c.min}{c.max === 100 ? "–100" : `–${c.max}`}
            </span>
          </li>
        ))}
      </ul>

      {evac ? (
        <>
          <p className="dato-real-nota">
            <span className="ruta-ln" /> Ruta de evacuación · <span className="destino-pt" /> destino seguro
          </p>
          <p className="aviso">
            Dificultad = tiempo + redundancia (1 ruta = crítico) + % de pista. Deriva solo de
            la capa de evacuación; es una lente distinta del Índice de Vulnerabilidad. Capa
            estática: no considera aún el fuego.
          </p>
        </>
      ) : (
        <>
          <p className="dato-real-nota">
            <span className="anillo" /> Núcleo con dato de edad real (IGE)
          </p>
          <p className="dato-real-nota">
            <span className="quemado" /> Perímetro quemado 2025 (Copernicus EMS)
          </p>
          <p className="aviso">
            Datos oficiales: población (Nomenclátor IGE 2025) y estructura de edad (Padrón
            IGE por concello). Demostrador de apoyo a la decisión, no de despacho operativo
            de emergencias.
          </p>
        </>
      )}
    </section>
  );
}
