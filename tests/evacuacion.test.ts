// Tests de lib/evacuacion.ts: dificultad de evacuación (métrica independiente
// del IV) y coherencia de su paleta.
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_EVAC,
  categoriaEvac,
  dificultadEvac,
  PESOS_DIFICULTAD,
} from "@/lib/evacuacion";

describe("dificultadEvac", () => {
  it("un destino seguro no tiene dificultad (null)", () => {
    expect(dificultadEvac({ es_destino: true, tiempo_min: 0, rutas_alternativas: null })).toBeNull();
  });

  it("sin datos de ruta devuelve null", () => {
    expect(dificultadEvac({})).toBeNull();
    expect(dificultadEvac({ tiempo_min: undefined, rutas_alternativas: 2 })).toBeNull();
    expect(dificultadEvac({ tiempo_min: 10, rutas_alternativas: undefined })).toBeNull();
  });

  it("la redundancia puntúa 1 ruta=100, 2=40, 3=15, >=4=0", () => {
    const base = { tiempo_min: 0, pct_track: 0 };
    // Con tiempo y pista a 0, la dificultad es solo el término de redundancia.
    expect(dificultadEvac({ ...base, rutas_alternativas: 1 }))
      .toBe(Math.round(PESOS_DIFICULTAD.redundancia * 100));
    expect(dificultadEvac({ ...base, rutas_alternativas: 2 }))
      .toBe(Math.round(PESOS_DIFICULTAD.redundancia * 40));
    expect(dificultadEvac({ ...base, rutas_alternativas: 3 }))
      .toBe(Math.round(PESOS_DIFICULTAD.redundancia * 15));
    expect(dificultadEvac({ ...base, rutas_alternativas: 4 })).toBe(0);
    expect(dificultadEvac({ ...base, rutas_alternativas: 7 })).toBe(0);
  });

  it("el tiempo satura en 45 min", () => {
    const a45 = dificultadEvac({ tiempo_min: 45, rutas_alternativas: 4, pct_track: 0 });
    const a90 = dificultadEvac({ tiempo_min: 90, rutas_alternativas: 4, pct_track: 0 });
    expect(a45).toBe(Math.round(PESOS_DIFICULTAD.tiempo * 100));
    expect(a90).toBe(a45); // saturado: más tiempo ya no sube
  });

  it("el % de pista satura en 40%", () => {
    const a40 = dificultadEvac({ tiempo_min: 0, rutas_alternativas: 4, pct_track: 40 });
    const a80 = dificultadEvac({ tiempo_min: 0, rutas_alternativas: 4, pct_track: 80 });
    expect(a40).toBe(Math.round(PESOS_DIFICULTAD.pista * 100));
    expect(a80).toBe(a40);
  });

  it("el caso peor (1 ruta, >=45 min, >=40% pista) da 100", () => {
    expect(dificultadEvac({ tiempo_min: 60, rutas_alternativas: 1, pct_track: 50 })).toBe(100);
  });
});

describe("categoriaEvac", () => {
  it("asigna bordes igual que el IV (min inclusivo; 100 en la última)", () => {
    expect(categoriaEvac(0).id).toBe("muy-facil");
    expect(categoriaEvac(20).id).toBe("facil");
    expect(categoriaEvac(40).id).toBe("moderada");
    expect(categoriaEvac(60).id).toBe("dificil");
    expect(categoriaEvac(80).id).toBe("muy-dificil");
    expect(categoriaEvac(100).id).toBe("muy-dificil");
  });

  it("las categorías cubren 0-100 sin huecos", () => {
    expect(CATEGORIAS_EVAC[0].min).toBe(0);
    expect(CATEGORIAS_EVAC[CATEGORIAS_EVAC.length - 1].max).toBe(100);
    for (let i = 1; i < CATEGORIAS_EVAC.length; i++) {
      expect(CATEGORIAS_EVAC[i].min).toBe(CATEGORIAS_EVAC[i - 1].max);
    }
  });
});
