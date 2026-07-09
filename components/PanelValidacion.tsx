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
        <h2>Validación con el incendio real de 2025</h2>
        <p className="sub">
          El Índice de Vulnerabilidad, contrastado con el perímetro observado del incendio.
        </p>
      </header>

      <p className="aviso-fuerte">
        <strong>El sistema se ha contrastado con el perímetro real del incendio de 2025</strong>
        {" "}(Copernicus EMS · EMSR837). El índice mide la <strong>vulnerabilidad de la
        población</strong>; su validación con datos de <strong>impacto humano</strong>
        {" "}—evacuaciones y confinamientos (AXEGA)— está integrada en el sistema y se activará
        al incorporarlos.
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
        El núcleo <strong>dentro del perímetro</strong> (Freixido) y los del borde inmediato
        (Seadur, Larouco), alcanzados por el frente del 16-08 al inicio del incendio, se
        sitúan en la <strong>mitad alta del índice</strong>, en línea con lo esperado. El
        circuito de validación queda así verificado y listo para incorporar los datos de
        impacto humano. Fuente de afectación: Copernicus EMS · EMSR837.
      </p>
    </aside>
  );
}
