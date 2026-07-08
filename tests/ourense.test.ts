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

describe("data/exposicion_ourense.json + confound", () => {
  const ex = leer("../data/exposicion_ourense.json");
  const cf = leer("../data/confound_ourense.json");

  it("frac_monte es una fracción 0-1 por núcleo", () => {
    const vals = Object.values(ex.nucleos) as any[];
    expect(vals.length).toBeGreaterThan(600);
    for (const v of vals) {
      expect(v.frac_monte).toBeGreaterThanOrEqual(0);
      expect(v.frac_monte).toBeLessThanOrEqual(1);
    }
  });

  it("el análisis del confound reporta AUC de exposición y correlaciones", () => {
    expect(cf.auc_exposicion_sola.frac_monte.auc).toBeGreaterThan(0);
    expect(cf.auc_exposicion_sola.dist_urbano.auc).toBeGreaterThan(0);
    // la distancia a urbano discrimina más que la fracción de monte (confound = aislamiento)
    expect(cf.auc_exposicion_sola.dist_urbano.auc).toBeGreaterThan(cf.auc_exposicion_sola.frac_monte.auc);
    expect(cf.correlacion_componente_exposicion.iv.dist_urbano).toBeGreaterThan(0.4);
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
