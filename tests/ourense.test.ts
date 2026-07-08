// Tests de integridad de los datos de escalado a Ourense: lista maestra
// dinámica, GeoJSON del mapa y afectación histórica GlobFire.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const leer = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

describe("data/nucleos_ourense.json (lista maestra)", () => {
  const fc = leer("../data/nucleos_ourense.json");
  const activos = fc.features.filter((f: any) => f.properties.activo);

  it("tiene features y metadata de fuentes", () => {
    expect(fc.features.length).toBeGreaterThan(3000);
    expect(fc.metadata.fuentes).toBeTruthy();
  });

  it("los activos son >=50 hab y tienen IV compuesto en [0,100]", () => {
    expect(activos.length).toBeGreaterThan(600);
    for (const f of activos) {
      const p = f.properties;
      expect(p.poblacion).toBeGreaterThanOrEqual(50);
      expect(Number.isInteger(p.iv)).toBe(true);
      expect(p.iv).toBeGreaterThanOrEqual(0);
      expect(p.iv).toBeLessThanOrEqual(100);
    }
  });

  it("cada activo lleva componentes y procedencia real por variable", () => {
    for (const f of activos) {
      const p = f.properties;
      expect(typeof p.peligro_biofisico).toBe("number");
      expect(typeof p.score_social).toBe("number");
      expect(typeof p.capacidad_respuesta).toBe("number");
      expect(p.dato_coordenadas_real).toBe(true);
      expect(p.dato_poblacion_real).toBe(true);
    }
  });

  it("las coordenadas caen en el ámbito de Ourense", () => {
    for (const f of activos) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThan(-8.4);
      expect(lon).toBeLessThan(-6.7);
      expect(lat).toBeGreaterThan(41.7);
      expect(lat).toBeLessThan(42.7);
    }
  });
});

describe("data/afectacion_globfire_ourense.json (historial de incendios)", () => {
  const af = leer("../data/afectacion_globfire_ourense.json");

  it("descarta perímetros degenerados y no marca todo afectado", () => {
    const n = Object.values(af.nucleos) as any[];
    const afectados = n.filter((v) => v.afectado_hist).length;
    expect(afectados).toBeGreaterThan(0);
    expect(afectados).toBeLessThan(n.length); // hay negativos: variable calibrable
  });

  it("n_afectaciones coherente con afectado_hist", () => {
    for (const v of Object.values(af.nucleos) as any[]) {
      expect(v.n_afectaciones).toBeGreaterThanOrEqual(0);
      expect(v.afectado_hist).toBe(v.n_afectaciones > 0);
      if (v.afectado_hist) expect(v.afectado_borde_500m).toBe(true);
    }
  });
});

describe("public/nucleos_ourense.geojson (mapa a escala)", () => {
  const gj = leer("../public/nucleos_ourense.geojson");

  it("es un FeatureCollection de núcleos activos con IV y afectación", () => {
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features.length).toBeGreaterThanOrEqual(680); // 683 activos (tras rescate por grafía)
    for (const f of gj.features) {
      const p = f.properties;
      expect(f.geometry.type).toBe("Point");
      expect(p.iv).toBeGreaterThanOrEqual(0);
      expect(p.iv).toBeLessThanOrEqual(100);
      expect(typeof p.afectado_hist).toBe("boolean");
    }
  });
});
