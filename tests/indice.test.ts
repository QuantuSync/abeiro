// Tests de lib/indice.mjs: la lógica pura extraída de scripts/procesar-ige.mjs
// (pendiente, NDMI, combustible por satélite, normalización de nombres y la
// composición del IV desde componentes).
import { describe, expect, it } from "vitest";
import {
  calcularIV,
  capDeSalidas,
  combustibleSatelite,
  factorNDMI,
  NDMI_AMP,
  NDMI_RANGO_FIJO,
  NDVI_RANGO_FIJO,
  norm,
  PESO_CAP,
  PESO_PELIGRO,
  PESO_SOCIAL,
  peligroBiofisico,
  salidasPonderadas,
  scorePendiente,
  scorePoblacion,
  scoreSocial,
  sinEspacios,
  SUBPESOS_SOCIAL,
} from "@/lib/indice.mjs";

describe("scorePendiente", () => {
  it("es lineal saturado a 35 grados", () => {
    expect(scorePendiente(0)).toBe(0);
    expect(scorePendiente(17.5)).toBe(50);
    expect(scorePendiente(35)).toBe(100);
    expect(scorePendiente(70)).toBe(100); // saturado
    expect(scorePendiente(-5)).toBe(0);   // recortado
  });
});

describe("factorNDMI", () => {
  const [MIN, MAX] = NDMI_RANGO_FIJO;
  it("seco (mínimo del rango) da el máximo factor 1+AMP", () => {
    expect(factorNDMI(MIN, MIN, MAX)).toBeCloseTo(1 + NDMI_AMP, 10);
  });
  it("húmedo (máximo del rango) da el mínimo factor 1-AMP", () => {
    expect(factorNDMI(MAX, MIN, MAX)).toBeCloseTo(1 - NDMI_AMP, 10);
  });
  it("el punto medio es neutro (factor 1)", () => {
    expect(factorNDMI((MIN + MAX) / 2, MIN, MAX)).toBeCloseTo(1, 10);
  });
  it("recorta fuera de rango", () => {
    expect(factorNDMI(MIN - 1, MIN, MAX)).toBeCloseTo(1 + NDMI_AMP, 10);
    expect(factorNDMI(MAX + 1, MIN, MAX)).toBeCloseTo(1 - NDMI_AMP, 10);
  });
});

describe("combustibleSatelite", () => {
  const [NVMIN, NVMAX] = NDVI_RANGO_FIJO;
  const [NMMIN, NMMAX] = NDMI_RANGO_FIJO;
  it("sin biomasa el combustible es 0 aunque esté seco (multiplicativo)", () => {
    const r = combustibleSatelite(NVMIN, NMMIN, NVMIN, NVMAX, NMMIN, NMMAX);
    expect(r.biomasa).toBe(0);
    expect(r.combustibilidad).toBe(0);
  });
  it("biomasa máxima y seca satura en 100", () => {
    const r = combustibleSatelite(NVMAX, NMMIN, NVMIN, NVMAX, NMMIN, NMMAX);
    expect(r.biomasa).toBe(100);
    expect(r.combustibilidad).toBe(100); // 100 * 1.3 recortado a 100
  });
  it("biomasa máxima pero húmeda queda por debajo de la biomasa", () => {
    const r = combustibleSatelite(NVMAX, NMMAX, NVMIN, NVMAX, NMMIN, NMMAX);
    expect(r.combustibilidad).toBe(Math.round(100 * (1 - NDMI_AMP)));
  });
});

describe("norm / sinEspacios (nombres del Nomenclátor IGE)", () => {
  it("reordena el artículo gallego y quita tildes", () => {
    expect(norm("Rúa de Valdeorras, A")).toBe("a rua de valdeorras");
    expect(norm("Medua, A")).toBe("a medua");
    expect(norm("Barco, O")).toBe("o barco");
  });
  it("iguala mayúsculas y tildes (cruce mapa <-> IGE)", () => {
    expect(norm("VILAMARTÍN")).toBe(norm("Vilamartín"));
    expect(norm("PETÍN")).toBe("petin");
  });
  it("sinEspacios permite el cruce compacto", () => {
    expect(sinEspacios("Rúa de Valdeorras, A")).toBe("aruadevaldeorras");
  });
});

describe("calcularIV (composición desde componentes)", () => {
  it("los pesos declarados suman 1", () => {
    expect(PESO_PELIGRO + PESO_SOCIAL + PESO_CAP).toBeCloseTo(1, 10);
  });
  it("caso peor: mucho peligro, mucha sensibilidad, capacidad nula -> 100", () => {
    expect(calcularIV(100, 100, 0)).toBe(100);
  });
  it("caso mejor: sin peligro, sin sensibilidad, capacidad plena -> 0", () => {
    expect(calcularIV(0, 0, 100)).toBe(0);
  });
  it("componentes medias dan IV medio", () => {
    expect(calcularIV(50, 50, 50)).toBe(50);
  });
  it("más capacidad de respuesta BAJA el IV (dirección invertida)", () => {
    expect(calcularIV(50, 50, 80)).toBeLessThan(calcularIV(50, 50, 20));
  });
  it("admite pesos alternativos (análisis de sensibilidad)", () => {
    expect(calcularIV(100, 0, 100, { peligro: 1, social: 0, cap: 0 })).toBe(100);
    expect(calcularIV(100, 0, 100, { peligro: 0, social: 0, cap: 1 })).toBe(0);
  });
});

describe("scoreSocial", () => {
  it("los subpesos suman 1", () => {
    const suma = Object.values(SUBPESOS_SOCIAL).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 10);
  });
  it("caso extremo alto: aldea mínima, muy envejecida y dispersa -> 100", () => {
    expect(scoreSocial({ pctMayores: 0.55, pctUniper: 50, dispersion: "muy alta", poblacion: 1 })).toBe(100);
  });
  it("caso extremo bajo: ciudad joven y compacta -> 0", () => {
    expect(scoreSocial({ pctMayores: 0.15, pctUniper: 0, dispersion: "muy baja", poblacion: 10000 })).toBe(0);
  });
  it("la población puntúa en escala log invertida", () => {
    expect(scorePoblacion(1)).toBe(100);
    expect(scorePoblacion(10)).toBe(75);
    expect(scorePoblacion(100)).toBe(50);
    expect(scorePoblacion(1000)).toBe(25);
    expect(scorePoblacion(10000)).toBe(0);
  });
});

describe("capacidad desde vías de salida", () => {
  it("pondera por clase de vía (pistas cuentan 0.2)", () => {
    expect(salidasPonderadas({ primary: 2, track: 5 })).toBeCloseTo(2 * 1 + 5 * 0.2, 10);
  });
  it("capDeSalidas satura en 100", () => {
    expect(capDeSalidas(0)).toBe(0);
    expect(capDeSalidas(10)).toBe(25);
    expect(capDeSalidas(40)).toBe(100);
    expect(capDeSalidas(80)).toBe(100);
  });
});

describe("peligroBiofisico", () => {
  it("combina pendiente y combustible con los pesos declarados", () => {
    expect(peligroBiofisico(35, 100)).toBe(100);
    expect(peligroBiofisico(0, 0)).toBe(0);
  });
});
