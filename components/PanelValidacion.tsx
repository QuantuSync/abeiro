"use client";

import type { FeatureCollection, Point } from "geojson";
import nucleosData from "@/data/nucleos.json";
import afectacionData from "@/data/nucleos_afectacion_fisica.json";
import { categoriaPorIV, type CategoriaIV } from "@/lib/vulnerabilidad";
import type { NucleoProps } from "@/components/PanelInfo";

type Afect = { afect_fisica?: boolean; borde_500m?: boolean; fecha_frente?: string | null };
const afect = (afectacionData as { nucleos: Record<string, Afect> }).nucleos;
const fc = nucleosData as unknown as FeatureCollection<Point, NucleoProps>;

interface Fila {
  nombre: string;
  iv: number;
  cat: CategoriaIV;
  estado: "dentro" | "borde" | "fuera";
  fecha: string | null;
}

// Tabla ordenada por IV descendente, cruzando IV (predicción) con afectación real.
const FILAS: Fila[] = fc.features
  .map((f) => {
    const a = afect[f.properties.id] || {};
    const estado = a.afect_fisica ? "dentro" : a.borde_500m ? "borde" : "fuera";
    return {
      nombre: f.properties.nombre,
      iv: f.properties.iv,
      cat: categoriaPorIV(f.properties.iv),
      estado: estado as Fila["estado"],
      fecha: a.fecha_frente ?? null,
    };
  })
  .sort((x, y) => y.iv - x.iv);

const ETIQUETA = { dentro: "Ardió", borde: "Borde ≤500 m", fuera: "No alcanzado" };

export default function PanelValidacion({ onClose }: { onClose: () => void }) {
  return (
    <aside className="validacion" aria-label="Validación cualitativa contra el incendio de 2025">
      <button className="cerrar" onClick={onClose} aria-label="Cerrar">×</button>
      <header>
        <h2>Validación cualitativa · incendio 2025</h2>
        <p className="sub">
          ¿Coincide el Índice de Vulnerabilidad (predicción) con lo que ardió de verdad?
        </p>
      </header>

      <p className="aviso-fuerte">
        <strong>Lectura ilustrativa, no estadística.</strong> Con sólo 12 núcleos (1 dentro
        del perímetro y 6 en su borde) <strong>no hay muestra para ROC/AUC fiable</strong>.
        Además: (a) la muestra es muy pequeña; (b) <strong>la afectación física no equivale a
        vulnerabilidad humana</strong> — un núcleo puede arder sin víctimas o evacuarse sin
        arder; (c) la verdad-terreno administrativa (evacuaciones/confinamientos de AXEGA)
        está <strong>pendiente</strong> y permitirá la calibración real más adelante.
      </p>

      <table className="tabla-val">
        <thead>
          <tr><th>#</th><th>Núcleo</th><th>IV</th><th>Categoría</th><th>2025</th><th>Frente</th></tr>
        </thead>
        <tbody>
          {FILAS.map((r, i) => (
            <tr key={r.nombre} className={r.estado !== "fuera" ? `afectado ${r.estado}` : ""}>
              <td className="num">{i + 1}</td>
              <td>{r.nombre}</td>
              <td className="iv">
                <span className="punto" style={{ background: r.cat.color }} />
                {r.iv}
              </td>
              <td className="cat">{r.cat.etiqueta}</td>
              <td>
                {r.estado !== "fuera" ? (
                  <span className={`badge-af ${r.estado}`}>{ETIQUETA[r.estado]}</span>
                ) : (
                  <span className="badge-no">{ETIQUETA.fuera}</span>
                )}
              </td>
              <td className="fecha">{r.fecha ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="lectura">
        El único núcleo <strong>dentro del perímetro</strong> (Freixido) y los del borde
        inmediato (Seadur, Larouco, el frente del 16-08 al inicio del incendio) están en la
        mitad alta del índice; pero también hay núcleos de borde con IV bajo (Petín,
        Vilamartín) y núcleos de IV alto no alcanzados (Pradorramisquedo, A Medua). La
        relación es <strong>orientativa y no concluyente</strong> con esta muestra: sirve
        para ilustrar el circuito de validación, no para afirmar el rendimiento del índice.
        Fuente de afectación: Copernicus EMS · EMSR837.
      </p>
    </aside>
  );
}
