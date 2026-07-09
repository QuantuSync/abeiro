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

// Estado NEUTRO: nada seleccionado + afectación "todos". Modelo "seleccionar
// para incluir": sin nada elegido no se filtra (se ven todos los núcleos); al
// elegir uno o más buckets, se restringe SOLO a los elegidos. Un multiselección
// vacío es neutro (no descarta a nadie), no "no pasa nada".
export const FILTROS_DEFECTO: Filtros = {
  categorias: [], poblacion: [], afectacion: "todos", vias: [],
};

// ¿Hay algún filtro activo (que restrinja)? Un conjunto vacío es neutro.
export function filtrando(f: Filtros): boolean {
  return f.categorias.length > 0
    || f.poblacion.length > 0
    || f.afectacion !== "todos"
    || f.vias.length > 0;
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
  rutas_alternativas?: number | null;
  afect_fisica?: boolean;
  afectado_hist?: boolean;
}

export interface OpcionesFiltro {
  campoAfectacion: "afect_fisica" | "afectado_hist";
  soporteVias: boolean; // el filtro de vías solo aplica donde hay capa de evacuación
}

// ¿El núcleo cumple TODOS los filtros ACTIVOS (AND)? Cada filtro se evalúa solo
// si tiene selección (conjunto no vacío) o valor distinto de "todos"; si está
// neutro, no descarta a nadie. TODOS los núcleos se filtran por igual: en
// Valdeorras algunos (O Barco, A Rúa) sirven además de destino de evacuación,
// pero son núcleos reales con su propio IV y responden a los filtros como el
// resto. Si a un núcleo le falta un campo (p. ej. rutas_alternativas nulo), esa
// dimensión se trata de forma neutra para él (no lo descarta).
export function pasaFiltros(p: NucleoFiltrable, f: Filtros, opts: OpcionesFiltro): boolean {
  if (f.categorias.length > 0 && p.iv != null
      && !f.categorias.includes(categoriaBucket(p.iv))) return false;
  if (f.poblacion.length > 0 && p.poblacion != null
      && !f.poblacion.includes(poblacionTramo(p.poblacion))) return false;
  if (f.afectacion !== "todos") {
    const afectado = !!p[opts.campoAfectacion];
    if (f.afectacion === "si" && !afectado) return false;
    if (f.afectacion === "no" && afectado) return false;
  }
  if (opts.soporteVias && f.vias.length > 0 && p.rutas_alternativas != null
      && !f.vias.includes(viasBucket(p.rutas_alternativas))) return false;
  return true;
}
