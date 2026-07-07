// Tests de lib/calibracion.mjs: AUC (Mann-Whitney) y bootstrap.
import { describe, expect, it } from "vitest";
import { auc, aucBootstrap, rng } from "@/lib/calibracion.mjs";

describe("auc", () => {
  it("separación perfecta -> AUC = 1", () => {
    // Todos los positivos por encima de todos los negativos.
    const scores = [10, 9, 8, 3, 2, 1];
    const labels = [true, true, true, false, false, false];
    expect(auc(scores, labels)).toBe(1);
  });

  it("separación perfecta invertida -> AUC = 0", () => {
    const scores = [1, 2, 3, 8, 9, 10];
    const labels = [true, true, true, false, false, false];
    expect(auc(scores, labels)).toBe(0);
  });

  it("mezcla moderada da un AUC intermedio", () => {
    // Positivos {6,4,2} vs negativos {5,3,1}: pares favorables = 6 de 9.
    const scores = [6, 5, 4, 3, 2, 1];
    const labels = [true, false, true, false, true, false];
    expect(auc(scores, labels)).toBeCloseTo(6 / 9, 6);
  });

  it("intercalado estricto ronda el azar (0.5)", () => {
    // Positivos {4,2} vs negativos {3,1}: 4>3,4>1,2<3,2>1 = 3/4.
    const scoresA = [4, 3, 2, 1];
    const labelsA = [true, false, true, false];
    expect(auc(scoresA, labelsA)).toBeCloseTo(0.75, 6);
    // Alternancia perfecta simétrica: AUC = 0.5.
    const scoresB = [4, 3, 2, 1];
    const labelsB = [false, true, false, true];
    expect(auc(scoresB, labelsB)).toBeCloseTo(0.25, 6);
  });

  it("empates cuentan 0.5", () => {
    const scores = [5, 5];
    const labels = [true, false];
    expect(auc(scores, labels)).toBe(0.5);
  });

  it("sin positivos o sin negativos -> null (AUC indefinido)", () => {
    expect(auc([1, 2, 3], [false, false, false])).toBeNull();
    expect(auc([1, 2, 3], [true, true, true])).toBeNull();
  });
});

describe("rng", () => {
  it("es determinista para la misma semilla", () => {
    const a = rng(42), b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("produce valores en [0,1)", () => {
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("aucBootstrap", () => {
  it("separación perfecta -> mediana e IC pegados a 1", () => {
    const scores = [10, 9, 8, 7, 3, 2, 1, 0];
    const labels = [true, true, true, true, false, false, false, false];
    const b = aucBootstrap(scores, labels, 500);
    expect(b.mediana).toBe(1);
    expect(b.ic95[0]).toBeGreaterThan(0.9);
    expect(b.n_validos).toBeGreaterThan(0);
  });

  it("es reproducible (misma semilla, mismo resultado)", () => {
    const scores = [5, 4, 3, 2, 1, 0];
    const labels = [true, true, false, true, false, false];
    const a = aucBootstrap(scores, labels, 300, 999);
    const b = aucBootstrap(scores, labels, 300, 999);
    expect(a.mediana).toBe(b.mediana);
    expect(a.ic95).toEqual(b.ic95);
  });
});
