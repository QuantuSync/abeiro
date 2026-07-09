// Clasificación y paleta del Índice de Vulnerabilidad (IV, 0-100).
// Escala secuencial SEGURA PARA DALTONISMO (ColorBrewer YlOrRd, 5 clases):
// amarillo pálido -> naranja -> rojo oscuro -> granate. A mayor IV, mayor
// riesgo humano. La antigua rampa verde->rojo era indistinguible para
// deuteranopia/protanopia; esta varía sobre todo en LUMINOSIDAD, que se
// percibe con cualquier tipo de visión del color.

export interface CategoriaIV {
  id: string;
  etiqueta: string;
  min: number; // inclusivo
  max: number; // inclusivo en la última, exclusivo en el resto
  color: string;
}

export const CATEGORIAS_IV: CategoriaIV[] = [
  { id: "muy-baja", etiqueta: "Muy baja", min: 0, max: 20, color: "#ffffb2" },
  { id: "baja", etiqueta: "Baja", min: 20, max: 40, color: "#fecc5c" },
  { id: "media", etiqueta: "Media", min: 40, max: 60, color: "#fd8d3c" },
  { id: "alta", etiqueta: "Alta", min: 60, max: 80, color: "#f03b20" },
  { id: "muy-alta", etiqueta: "Muy alta", min: 80, max: 100, color: "#bd0026" },
];

export function categoriaPorIV(iv: number): CategoriaIV {
  for (const c of CATEGORIAS_IV) {
    if (iv >= c.min && iv < c.max) return c;
  }
  // 100 cae en la última categoría
  return CATEGORIAS_IV[CATEGORIAS_IV.length - 1];
}

export function colorPorIV(iv: number): string {
  return categoriaPorIV(iv).color;
}

// Expresión de color para MapLibre (data-driven styling sobre la propiedad "iv").
export const EXPRESION_COLOR_IV: unknown[] = [
  "step",
  ["get", "iv"],
  CATEGORIAS_IV[0].color,
  20,
  CATEGORIAS_IV[1].color,
  40,
  CATEGORIAS_IV[2].color,
  60,
  CATEGORIAS_IV[3].color,
  80,
  CATEGORIAS_IV[4].color,
];
