// Tests de lib/filtros.ts: buckets y combinación aditiva (AND) de filtros.
// Modelo "seleccionar para incluir": nada seleccionado = neutro (no descarta a
// nadie); seleccionar buckets restringe SOLO a los elegidos.
import { describe, expect, it } from "vitest";
import {
  FILTROS_DEFECTO, filtrando, pasaFiltros, categoriaBucket, poblacionTramo, viasBucket,
  type Filtros, type OpcionesFiltro,
} from "@/lib/filtros";
import { nucleos } from "@/lib/datos";

const OPTS: OpcionesFiltro = { campoAfectacion: "afect_fisica", soporteVias: true };
const OPTS_OU: OpcionesFiltro = { campoAfectacion: "afectado_hist", soporteVias: false };

// Muestra representativa (una por combinación relevante).
const MUESTRA = [
  { id: "a", iv: 75, poblacion: 350, afect_fisica: true, rutas_alternativas: 1 },  // alta, 200-999, afectado, 1 vía
  { id: "b", iv: 55, poblacion: 120, afect_fisica: false, rutas_alternativas: 2 }, // media, 50-199, no, 2 vías
  { id: "c", iv: 30, poblacion: 40, afect_fisica: false, rutas_alternativas: 3 },  // baja, <50, no, 3+ vías
  { id: "d", iv: 65, poblacion: 5000, afect_fisica: true, rutas_alternativas: 4 }, // alta, >=1000, afectado, 3+ vías
];
const cuenta = (f: Filtros, opts: OpcionesFiltro = OPTS) => MUESTRA.filter((p) => pasaFiltros(p, f, opts)).length;
const con = (parcial: Partial<Filtros>): Filtros => ({ ...FILTROS_DEFECTO, ...parcial });

describe("buckets", () => {
  it("categoría por IV", () => {
    expect(categoriaBucket(85)).toBe("alta");
    expect(categoriaBucket(60)).toBe("alta");
    expect(categoriaBucket(59)).toBe("media");
    expect(categoriaBucket(40)).toBe("media");
    expect(categoriaBucket(39)).toBe("baja");
  });
  it("tramo de población cubre todo el rango sin huecos", () => {
    expect(poblacionTramo(0)).toBe("<50");
    expect(poblacionTramo(49)).toBe("<50");
    expect(poblacionTramo(50)).toBe("50-199");
    expect(poblacionTramo(199)).toBe("50-199");
    expect(poblacionTramo(200)).toBe("200-999");
    expect(poblacionTramo(999)).toBe("200-999");
    expect(poblacionTramo(1000)).toBe(">=1000");
  });
  it("vías de salida (1 = crítico)", () => {
    expect(viasBucket(1)).toBe("1");
    expect(viasBucket(0)).toBe("1");
    expect(viasBucket(2)).toBe("2");
    expect(viasBucket(3)).toBe("3+");
  });
});

describe("estado neutro", () => {
  it("por defecto no filtra (filtrando=false) y pasan todos", () => {
    expect(filtrando(FILTROS_DEFECTO)).toBe(false);
    expect(cuenta(FILTROS_DEFECTO)).toBe(MUESTRA.length);
  });
  it("un conjunto vacío es neutro, no 'no pasa nada' (regresión del bug)", () => {
    // categorías vacías NO deben descartar a nadie.
    expect(cuenta(con({ categorias: [] }))).toBe(MUESTRA.length);
    expect(cuenta(con({ poblacion: [] }))).toBe(MUESTRA.length);
  });
});

describe("cada filtro en solitario devuelve un subconjunto no vacío", () => {
  it("solo población (el caso reportado)", () => {
    expect(filtrando(con({ poblacion: ["50-199"] }))).toBe(true);
    expect(cuenta(con({ poblacion: ["50-199"] }))).toBe(1); // solo 'b'
    expect(cuenta(con({ poblacion: ["<50", "200-999"] }))).toBe(2); // 'a' y 'c'
  });
  it("solo vulnerabilidad", () => {
    expect(cuenta(con({ categorias: ["alta"] }))).toBe(2); // 'a' y 'd'
    expect(cuenta(con({ categorias: ["baja"] }))).toBe(1); // 'c'
  });
  it("solo afectación", () => {
    expect(cuenta(con({ afectacion: "si" }))).toBe(2); // 'a','d'
    expect(cuenta(con({ afectacion: "no" }))).toBe(2); // 'b','c'
  });
  it("solo vías de salida (donde aplica); aísla la vía única", () => {
    expect(cuenta(con({ vias: ["1"] }))).toBe(1); // solo 'a'
    expect(cuenta(con({ vias: ["3+"] }))).toBe(2); // 'c','d'
    // en Ourense (sin soporte de vías) el filtro de vías no interviene
    expect(cuenta(con({ vias: ["1"] }), OPTS_OU)).toBe(MUESTRA.length);
  });
});

describe("combinación aditiva (intersección)", () => {
  it("dos filtros restringen correctamente", () => {
    // alta ∩ afectado = 'a','d'
    expect(cuenta(con({ categorias: ["alta"], afectacion: "si" }))).toBe(2);
    // alta ∩ población 200-999 = 'a'
    expect(cuenta(con({ categorias: ["alta"], poblacion: ["200-999"] }))).toBe(1);
    // alta ∩ 1 vía = 'a'
    expect(cuenta(con({ categorias: ["alta"], vias: ["1"] }))).toBe(1);
  });
  it("un filtro inactivo no anula el resultado de otro activo", () => {
    // población 50-199 con vulnerabilidad vacía (neutra) = 'b'
    expect(cuenta(con({ poblacion: ["50-199"], categorias: [] }))).toBe(1);
  });
});

// Conjunto base real de Valdeorras (12 núcleos). O Barco y A Rúa son destinos de
// evacuación (es_destino) pero núcleos reales con IV bajo: deben contarse y
// filtrarse como el resto (regresión: antes quedaban fuera del conjunto y eran
// inmunes a los filtros).
describe("conjunto base de Valdeorras (datos reales)", () => {
  const OPTS_VAL: OpcionesFiltro = { campoAfectacion: "afect_fisica", soporteVias: true };
  const pasa = (f: Filtros) =>
    nucleos.features.filter((x) => pasaFiltros(x.properties, f, OPTS_VAL)).map((x) => x.properties.id);

  it("el conjunto base tiene los 12 núcleos", () => {
    expect(nucleos.features.length).toBe(12);
  });
  it("estado neutro: pasan los 12", () => {
    expect(pasa(FILTROS_DEFECTO).length).toBe(12);
  });
  it("con 'Alta', O Barco y A Rúa (IV bajo) NO cumplen y no son inmunes", () => {
    const ids = pasa(con({ categorias: ["alta"] }));
    expect(ids).not.toContain("o-barco");
    expect(ids).not.toContain("a-rua");
    expect(ids.length).toBe(7); // los 7 de vulnerabilidad alta (IV>=60)
  });
  it("O Barco y A Rúa sí responden a un filtro que cumplen (población >=1000)", () => {
    const ids = pasa(con({ poblacion: [">=1000"] }));
    expect(ids).toContain("o-barco"); // 11101 hab
    expect(ids).toContain("a-rua");   // 4119 hab
  });
});
