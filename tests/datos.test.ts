// Test de integridad de datos: valida data/nucleos.json (salida del pipeline)
// tras cada regeneración — 12 núcleos, IV en rango, flags de procedencia y
// propiedades obligatorias presentes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Props = Record<string, unknown>;
const fc = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/nucleos.json", import.meta.url)), "utf8"),
) as { metadata: Record<string, unknown>; features: { geometry: { coordinates: [number, number] }; properties: Props }[] };

const OBLIGATORIAS = [
  "id", "nombre", "concello", "iv", "iv_fase0", "score_social", "poblacion",
  "pct_mayores_65", "pct_hogares_uniper_mayores", "dispersion",
  "peligro_biofisico", "capacidad_respuesta",
];
const FLAGS = [
  "dato_poblacion_real", "dato_edad_real", "dato_capacidad_real",
  "dato_pendiente_real", "dato_combustible_aprox",
];

describe("data/nucleos.json (integridad)", () => {
  it("tiene exactamente 12 núcleos", () => {
    expect(fc.features).toHaveLength(12);
  });

  it("cada núcleo tiene iv entero en [0,100]", () => {
    for (const f of fc.features) {
      const iv = f.properties.iv as number;
      expect(Number.isInteger(iv), `${f.properties.id}: iv=${iv}`).toBe(true);
      expect(iv).toBeGreaterThanOrEqual(0);
      expect(iv).toBeLessThanOrEqual(100);
    }
  });

  it("cada núcleo tiene las propiedades obligatorias", () => {
    for (const f of fc.features) {
      for (const k of OBLIGATORIAS) {
        expect(f.properties[k], `${f.properties.id}: falta ${k}`).toBeDefined();
      }
    }
  });

  it("los flags de procedencia son booleanos", () => {
    for (const f of fc.features) {
      for (const k of FLAGS) {
        expect(typeof f.properties[k], `${f.properties.id}: ${k}`).toBe("boolean");
      }
    }
  });

  it("pct_mayores_65 se guarda como fracción 0-1", () => {
    for (const f of fc.features) {
      const pct = f.properties.pct_mayores_65 as number;
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });

  it("las coordenadas caen en Galicia (bbox amplio)", () => {
    for (const f of fc.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon, `${f.properties.id}: lon`).toBeGreaterThan(-9.5);
      expect(lon).toBeLessThan(-6.3);
      expect(lat, `${f.properties.id}: lat`).toBeGreaterThan(41.6);
      expect(lat).toBeLessThan(43.9);
    }
  });

  it("la metadata declara los pesos del IV y los rangos fijos de satélite", () => {
    expect(fc.metadata.pesos_iv).toBeDefined();
    expect(fc.metadata.subpesos_social).toBeDefined();
    expect(fc.metadata.ndvi_rango_fijo).toEqual([0.15, 0.8]);
    expect(fc.metadata.ndmi_rango_fijo).toEqual([-0.05, 0.35]);
  });
});
