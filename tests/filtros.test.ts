// Tests de lib/filtros.ts: buckets y combinación aditiva de filtros.
import { describe, expect, it } from "vitest";
import {
  FILTROS_DEFECTO, filtrando, pasaFiltros, categoriaBucket, poblacionTramo, viasBucket,
  CATS, POBS, VIAS, type Filtros,
} from "@/lib/filtros";

const OPTS = { campoAfectacion: "afect_fisica" as const, soporteVias: true };
const clon = (): Filtros => ({
  categorias: [...CATS], poblacion: [...POBS], afectacion: "todos", vias: [...VIAS],
});

describe("buckets", () => {
  it("categoría por IV", () => {
    expect(categoriaBucket(85)).toBe("alta");
    expect(categoriaBucket(60)).toBe("alta");
    expect(categoriaBucket(59)).toBe("media");
    expect(categoriaBucket(40)).toBe("media");
    expect(categoriaBucket(39)).toBe("baja");
    expect(categoriaBucket(0)).toBe("baja");
  });
  it("tramo de población", () => {
    expect(poblacionTramo(30)).toBe("<50");
    expect(poblacionTramo(50)).toBe("50-199");
    expect(poblacionTramo(199)).toBe("50-199");
    expect(poblacionTramo(200)).toBe("200-999");
    expect(poblacionTramo(1000)).toBe(">=1000");
  });
  it("vías de salida (1 = crítico)", () => {
    expect(viasBucket(1)).toBe("1");
    expect(viasBucket(0)).toBe("1");
    expect(viasBucket(2)).toBe("2");
    expect(viasBucket(3)).toBe("3+");
    expect(viasBucket(9)).toBe("3+");
  });
});

describe("filtrando (¿hay filtro activo?)", () => {
  it("el estado por defecto no filtra", () => {
    expect(filtrando(FILTROS_DEFECTO)).toBe(false);
  });
  it("quitar una categoría activa el filtro", () => {
    expect(filtrando({ ...clon(), categorias: ["alta", "media"] })).toBe(true);
  });
});

describe("pasaFiltros", () => {
  const n = { iv: 65, poblacion: 350, afect_fisica: true, rutas_alternativas: 2 };

  it("sin filtros, todo pasa", () => {
    expect(pasaFiltros(n, clon(), OPTS)).toBe(true);
  });
  it("los destinos seguros nunca se filtran", () => {
    const f = { ...clon(), categorias: ["baja"] as Filtros["categorias"] };
    expect(pasaFiltros({ es_destino: true, iv: 20, poblacion: 5000 }, f, OPTS)).toBe(true);
  });
  it("filtra por categoría", () => {
    expect(pasaFiltros(n, { ...clon(), categorias: ["baja"] }, OPTS)).toBe(false);
    expect(pasaFiltros(n, { ...clon(), categorias: ["alta"] }, OPTS)).toBe(true);
  });
  it("filtra por población", () => {
    expect(pasaFiltros(n, { ...clon(), poblacion: ["<50"] }, OPTS)).toBe(false);
    expect(pasaFiltros(n, { ...clon(), poblacion: ["200-999"] }, OPTS)).toBe(true);
  });
  it("filtra por afectación sí/no", () => {
    expect(pasaFiltros(n, { ...clon(), afectacion: "no" }, OPTS)).toBe(false);
    expect(pasaFiltros(n, { ...clon(), afectacion: "si" }, OPTS)).toBe(true);
    expect(pasaFiltros({ ...n, afect_fisica: false }, { ...clon(), afectacion: "si" }, OPTS)).toBe(false);
  });
  it("filtra por vías solo si hay soporte; aísla la vía única", () => {
    const unaVia = { ...n, rutas_alternativas: 1 };
    expect(pasaFiltros(unaVia, { ...clon(), vias: ["1"] }, OPTS)).toBe(true);
    expect(pasaFiltros(n, { ...clon(), vias: ["1"] }, OPTS)).toBe(false); // tiene 2
    // sin soporte de vías (Ourense), el filtro de vías se ignora
    expect(pasaFiltros(n, { ...clon(), vias: ["1"] }, { campoAfectacion: "afectado_hist", soporteVias: false })).toBe(true);
  });
  it("los filtros se combinan (aditivos)", () => {
    const f = { ...clon(), categorias: ["alta"] as Filtros["categorias"], afectacion: "si" as const };
    expect(pasaFiltros(n, f, OPTS)).toBe(true);
    expect(pasaFiltros({ ...n, afect_fisica: false }, f, OPTS)).toBe(false);
  });
});
