// Dificultad de evacuación (0-100): métrica NUEVA e independiente del Índice de
// Vulnerabilidad. Deriva SOLO de la capa de evacuación (data/evacuacion.json).
// No se funde con el IV: son lentes distintas.
//
// dificultad = 0.35·tiempo + 0.45·redundancia + 0.20·pista   (pesos provisionales)
//   - tiempo:       min(100, tiempo_min / 45 · 100)   (≥45 min al destino = máx.)
//   - redundancia:  1 ruta = 100 (crítico, sin alternativa); 2 = 40; 3 = 15; ≥4 = 0
//   - pista:        min(100, %_pista · 2.5)            (≥40% por pista = máx.)
// La redundancia pesa más: un núcleo con una sola salida es el riesgo mayor.

export interface NucleoEvac {
  es_destino?: boolean;
  tiempo_min?: number;
  rutas_alternativas?: number | null;
  pct_track?: number;
}

export const PESOS_DIFICULTAD = { tiempo: 0.35, redundancia: 0.45, pista: 0.2 };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

function scoreRedundancia(rutas?: number | null): number {
  if (rutas == null) return 50;
  if (rutas <= 1) return 100;
  if (rutas === 2) return 40;
  if (rutas === 3) return 15;
  return 0;
}

// Devuelve la dificultad 0-100, o null para destinos seguros / sin ruta.
export function dificultadEvac(e: NucleoEvac): number | null {
  if (e.es_destino || e.tiempo_min == null || e.rutas_alternativas === undefined) return null;
  const tiempo = clamp((e.tiempo_min / 45) * 100);
  const redund = scoreRedundancia(e.rutas_alternativas);
  const pista = clamp((e.pct_track ?? 0) * 2.5);
  return Math.round(
    PESOS_DIFICULTAD.tiempo * tiempo
    + PESOS_DIFICULTAD.redundancia * redund
    + PESOS_DIFICULTAD.pista * pista
  );
}

export interface CategoriaEvac {
  id: string;
  etiqueta: string;
  min: number;
  max: number;
  color: string;
}

// Escala fácil → difícil. Paleta azul(frío=fácil) → gris → rojo(cálido=difícil)
// (ColorBrewer RdBu invertida, segura para daltonismo), distinta a propósito de
// la amarillo→granate (YlOrRd) del IV para no confundir las lentes: su extremo
// bajo es AZUL (el IV nunca usa azul) y su punto medio es gris neutro (no se
// parece al amarillo pálido del IV "muy baja").
export const CATEGORIAS_EVAC: CategoriaEvac[] = [
  { id: "muy-facil", etiqueta: "Muy fácil", min: 0, max: 20, color: "#0571b0" },
  { id: "facil", etiqueta: "Fácil", min: 20, max: 40, color: "#92c5de" },
  { id: "moderada", etiqueta: "Moderada", min: 40, max: 60, color: "#f0f0f0" },
  { id: "dificil", etiqueta: "Difícil", min: 60, max: 80, color: "#f4a582" },
  { id: "muy-dificil", etiqueta: "Muy difícil", min: 80, max: 100, color: "#ca0020" },
];

export function categoriaEvac(d: number): CategoriaEvac {
  for (const c of CATEGORIAS_EVAC) if (d >= c.min && d < c.max) return c;
  return CATEGORIAS_EVAC[CATEGORIAS_EVAC.length - 1];
}

export const COLOR_DESTINO_SEGURO = "#0b6e99";

// Expresión de color MapLibre sobre la propiedad "dificultad_evac". Los destinos
// seguros se pintan aparte (azul) y los sin dato en gris.
export const EXPRESION_COLOR_EVAC: unknown[] = [
  "case",
  ["==", ["get", "es_destino"], true], COLOR_DESTINO_SEGURO,
  ["!", ["has", "dificultad_evac"]], "#c9c9c9",
  [
    "step", ["to-number", ["get", "dificultad_evac"]],
    CATEGORIAS_EVAC[0].color,
    20, CATEGORIAS_EVAC[1].color,
    40, CATEGORIAS_EVAC[2].color,
    60, CATEGORIAS_EVAC[3].color,
    80, CATEGORIAS_EVAC[4].color,
  ],
];
