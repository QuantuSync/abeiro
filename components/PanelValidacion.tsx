"use client";

//ANTES ==> Accedia a los json igual que MapaVulnerabilidad
// import nucleosData from "@/data/nucleos.json";
// import afectacionData from "@/data/nucleos_afectacion_fisica.json";
// AHORA:
import {useFilas} from "@/hooks/useFilas";

// No se usa, pero lo dejo por si acaso.
//type Afect = { afect_fisica?: boolean; borde_500m?: boolean; fecha_frente?: string | null };


const ETIQUETA = { dentro: "Ardió", borde: "Borde ≤500 m", fuera: "No alcanzado" };

export default function PanelValidacion({ onClose }: { onClose: () => void }) {
  const FILAS = useFilas()

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
        <strong>Lectura ilustrativa, no estadística.</strong> Con sólo 2 núcleos afectados de
        12 <strong>no hay muestra para ROC/AUC fiable</strong>. Además: (a) la muestra es muy
        pequeña; (b) <strong>la afectación física no equivale a vulnerabilidad humana</strong>
        — un núcleo puede arder sin víctimas o evacuarse sin arder; (c) la verdad-terreno
        administrativa (evacuaciones/confinamientos de AXEGA) está <strong>pendiente</strong> y
        permitirá la calibración real más adelante.
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
        Los 2 núcleos que <strong>ardieron</strong> (Vilardesilva, Portomourisco) caen en la
        mitad alta del índice (categoría «Alta»). Pero los 3 de mayor IV (cluster de Larouco)
        <strong> no fueron alcanzados</strong> y dos núcleos de borde (Petín, A Rúa) están entre
        los de IV más bajo. La relación es <strong>débil y no concluyente</strong> con esta
        muestra: sirve para ilustrar el circuito de validación, no para afirmar el rendimiento
        del índice. Fuente de afectación: Copernicus EMS · EMSR837.
      </p>
    </aside>
  );
}
