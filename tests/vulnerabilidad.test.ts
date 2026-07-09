// Tests de lib/vulnerabilidad.ts: bordes de categoría y coherencia entre la
// expresión de color MapLibre y la tabla de categorías.
import { describe, expect, it } from "vitest";
import { CATEGORIAS_IV, categoriaPorIV, colorPorIV, EXPRESION_COLOR_IV } from "@/lib/vulnerabilidad";

describe("categoriaPorIV", () => {
  it("asigna los bordes de categoría (min inclusivo, max exclusivo salvo 100)", () => {
    expect(categoriaPorIV(0).id).toBe("muy-baja");
    expect(categoriaPorIV(19.9).id).toBe("muy-baja");
    expect(categoriaPorIV(20).id).toBe("baja");
    expect(categoriaPorIV(39.9).id).toBe("baja");
    expect(categoriaPorIV(40).id).toBe("media");
    expect(categoriaPorIV(60).id).toBe("alta");
    expect(categoriaPorIV(80).id).toBe("muy-alta");
    expect(categoriaPorIV(100).id).toBe("muy-alta"); // 100 cae en la última
  });

  it("las categorías cubren 0-100 sin huecos ni solapes", () => {
    expect(CATEGORIAS_IV[0].min).toBe(0);
    expect(CATEGORIAS_IV[CATEGORIAS_IV.length - 1].max).toBe(100);
    for (let i = 1; i < CATEGORIAS_IV.length; i++) {
      expect(CATEGORIAS_IV[i].min).toBe(CATEGORIAS_IV[i - 1].max);
    }
  });

  it("colorPorIV delega en la categoría", () => {
    for (const c of CATEGORIAS_IV) {
      expect(colorPorIV(c.min)).toBe(c.color);
    }
  });
});

describe("EXPRESION_COLOR_IV (coherencia con CATEGORIAS_IV)", () => {
  it("es una expresión step sobre la propiedad iv", () => {
    expect(EXPRESION_COLOR_IV[0]).toBe("step");
    expect(EXPRESION_COLOR_IV[1]).toEqual(["get", "iv"]);
  });

  it("usa los mismos umbrales y colores que las categorías, en orden", () => {
    // Estructura: ["step", input, color0, umbral1, color1, umbral2, color2, ...]
    const colores = [EXPRESION_COLOR_IV[2]];
    const umbrales: unknown[] = [];
    for (let i = 3; i < EXPRESION_COLOR_IV.length; i += 2) {
      umbrales.push(EXPRESION_COLOR_IV[i]);
      colores.push(EXPRESION_COLOR_IV[i + 1]);
    }
    expect(colores).toEqual(CATEGORIAS_IV.map((c) => c.color));
    expect(umbrales).toEqual(CATEGORIAS_IV.slice(1).map((c) => c.min));
  });
});
