// Lógica PURA de filtrado de núcleos para el mapa (interacción, no cálculo).
// Compartida por las dos vistas (Valdeorras / Ourense) y testeable sin DOM.
// Los filtros son ADITIVOS (se combinan) y por defecto no filtran nada.

export type CatKey = "alta" | "media" | "baja";
export type PobKey = "<50" | "50-199" | "200-999" | ">=1000";
export type ViaKey = "1" | "2" | "3+";
export type Afect = "todos" | "si" | "no";

export interface Filtros {
  categorias: CatKey[]; // categoría de vulnerabilidad (por IV)
  poblacion: PobKey[];  // tramos de habitantes
  afectacion: Afect;    // afectado por incendio histórico
  vias: ViaKey[];       // nº de vías de salida (rutas alternativas)
}

export const CATS: CatKey[] = ["alta", "media", "baja"];
export const POBS: PobKey[] = ["<50", "50-199", "200-999", ">=1000"];
export const VIAS: ViaKey[] = ["1", "2", "3+"];

export const ETIQUETA_CAT: Record<CatKey, string> = { alta: "Alta", media: "Media", baja: "Baja" };
export const ETIQUETA_POB: Record<PobKey, string> = {
  "<50": "< 50", "50-199": "50–199", "200-999": "200–999", ">=1000": "≥ 1000",
};
export const ETIQUETA_VIA: Record<ViaKey, string> = { "1": "1 (crítico)", "2": "2", "3+": "3 o más" };

export const FILTROS_DEFECTO: Filtros = {
  categorias: [...CATS], poblacion: [...POBS], afectacion: "todos", vias: [...VIAS],
};

// ¿Hay algún filtro activo (distinto del estado por defecto)?
export function filtrando(f: Filtros): boolean {
  return f.categorias.length < CATS.length
    || f.poblacion.length < POBS.length
    || f.afectacion !== "todos"
    || f.vias.length < VIAS.length;
}

// Buckets deterministas.
export function categoriaBucket(iv: number): CatKey {
  return iv >= 60 ? "alta" : iv >= 40 ? "media" : "baja";
}
export function poblacionTramo(pob: number): PobKey {
  return pob < 50 ? "<50" : pob < 200 ? "50-199" : pob < 1000 ? "200-999" : ">=1000";
}
export function viasBucket(rutas: number): ViaKey {
  return rutas <= 1 ? "1" : rutas === 2 ? "2" : "3+";
}

export interface NucleoFiltrable {
  iv?: number;
  poblacion?: number;
  es_destino?: boolean;
  rutas_alternativas?: number | null;
  afect_fisica?: boolean;
  afectado_hist?: boolean;
}

export interface OpcionesFiltro {
  campoAfectacion: "afect_fisica" | "afectado_hist";
  soporteVias: boolean; // el filtro de vías solo aplica donde hay capa de evacuación
}

// ¿El núcleo cumple TODOS los filtros activos? Los destinos seguros (es_destino)
// son puntos de referencia y no se filtran (siempre visibles como contexto).
export function pasaFiltros(p: NucleoFiltrable, f: Filtros, opts: OpcionesFiltro): boolean {
  if (p.es_destino) return true;
  if (p.iv != null && !f.categorias.includes(categoriaBucket(p.iv))) return false;
  if (p.poblacion != null && !f.poblacion.includes(poblacionTramo(p.poblacion))) return false;
  const afectado = !!p[opts.campoAfectacion];
  if (f.afectacion === "si" && !afectado) return false;
  if (f.afectacion === "no" && afectado) return false;
  if (opts.soporteVias && p.rutas_alternativas != null
      && !f.vias.includes(viasBucket(p.rutas_alternativas))) return false;
  return true;
}
