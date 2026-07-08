// =============================================================================
// ABEIRO · Recomposición del IV para los núcleos de Ourense (escalado)
// =============================================================================
// Compone el Índice de Vulnerabilidad de los 650 núcleos activos (>=50 hab) de
// data/nucleos_ourense.json, juntando los insumos ya cacheados:
//   - data/componentes_ee_ourense.json  NDVI/NDMI (Sentinel-2) + pendiente (SRTM)
//   - data/capacidad_ourense.json        vías de salida + distancia a servicios (OSM)
//   - data/padron_edad_ourense.csv       % mayores 65 por concello (INE, proxy)
//   - (población y concello ya en nucleos_ourense.json, del IGE/NGBE)
//
// Usa lib/indice.mjs con los pesos PROVISIONALES vigentes (no se tocan). El
// score social solo dispone de mayores_65 (real) y población (real): hogares
// unipersonales y dispersión NO existen por núcleo a escala provincial (en el
// piloto eran estimaciones de Fase 0), así que scoreSocial renormaliza sus
// subpesos a las variables presentes. Marca procedencia y confianza por núcleo.
//
// Reescribe data/nucleos_ourense.json añadiendo IV y componentes a los activos.
// Uso:  node scripts/procesar-ourense.mjs
// =============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  NDVI_RANGO_FIJO, NDMI_RANGO_FIJO,
  combustibleSatelite, peligroBiofisico, scoreSocial, calcularIV,
  salidasPonderadas, capDeSalidas, confianzaNucleo,
} from "../lib/indice.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = join(DIR, "..", "data");
const cargar = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

const fc = cargar("nucleos_ourense.json");
const ee = cargar("componentes_ee_ourense.json").nucleos;
const cap = cargar("capacidad_ourense.json").nucleos;

// Padrón: % mayores 65 por codmun (INE).
const padron = {};
for (const linea of readFileSync(join(DATA, "padron_edad_ourense.csv"), "utf8").split(/\r?\n/).slice(1)) {
  const m = linea.match(/^(\d+),(?:"[^"]*"|[^,]*),([\d.]+)/);
  if (m) padron[m[1]] = Number(m[2]);
}

const [NDVI_MIN, NDVI_MAX] = NDVI_RANGO_FIJO;
const [NDMI_MIN, NDMI_MAX] = NDMI_RANGO_FIJO;

let n = 0, sinPeligro = 0, sinCap = 0, sinEdad = 0;
for (const feat of fc.features) {
  const p = feat.properties;
  if (!p.activo) continue;
  const e = ee[p.id], c = cap[p.id];
  const pctMayores = padron[p.codmun];
  if (!e || e.ndvi == null || e.pendiente_grados == null) { sinPeligro++; continue; }
  if (!c) { sinCap++; continue; }
  if (pctMayores == null) { sinEdad++; continue; }

  // --- Peligro biofísico (pendiente SRTM + combustible Sentinel-2) ---
  const sat = combustibleSatelite(e.ndvi, e.ndmi, NDVI_MIN, NDVI_MAX, NDMI_MIN, NDMI_MAX);
  p.ndvi = e.ndvi;
  p.ndmi = e.ndmi;
  p.biomasa_ndvi = sat.biomasa;
  p.combustibilidad = sat.combustibilidad;
  p.pendiente_grados = e.pendiente_grados;
  p.peligro_biofisico = peligroBiofisico(e.pendiente_grados, sat.combustibilidad);
  p.combustible_fuente = "Sentinel-2 NDVI+NDMI";
  p.dato_pendiente_real = true;      // SRTM 30 m (respaldo escalable de elevación)
  p.dato_combustible_aprox = true;
  p.fuente_peligro = "Pendiente: SRTM 30 m (Earth Engine). Combustible: Sentinel-2 NDVI+NDMI "
    + "(verano 2025). APROXIMACIÓN; no es el mapa de combustible calibrado.";

  // --- Sensibilidad social (mayores 65 real + población real) ---
  p.pct_mayores_65 = Number(pctMayores.toFixed(3));
  p.dato_edad_real = true;
  p.edad_proxy_concello = true;
  p.fuente_edad = "Padrón INE 2022 (proxy concello)";
  p.score_social = scoreSocial({ pctMayores, poblacion: p.poblacion, pctUniper: null, dispersion: null });
  p.dato_social_parcial = true; // mayores_65 y población reales; sin uniper/dispersión a escala

  // --- Capacidad de respuesta (vías de salida OSM) ---
  const ponderadas = salidasPonderadas(c.vias_salida_por_tipo);
  p.vias_salida = c.vias_salida;
  p.vias_salida_ponderadas = Number(ponderadas.toFixed(1));
  p.vias_salida_por_tipo = c.vias_salida_por_tipo;
  p.distancia_servicios_km = c.distancia_servicios_km;
  p.capacidad_respuesta = capDeSalidas(ponderadas);
  p.dato_capacidad_real = true;
  p.fuente_capacidad = "OpenStreetMap (vías de salida ponderadas por clase, 1 km; ODbL)";

  // --- IV compuesto (pesos provisionales vigentes) ---
  p.iv = calcularIV(p.peligro_biofisico, p.score_social, p.capacidad_respuesta);
  p.confianza = confianzaNucleo({
    edadReal: true, poblacionReal: true, capacidadReal: true,
    pendienteReal: true, combustible: "satelite", socialCompleto: false,
  });
  n++;
}

fc.metadata.fase_iv = "IV compuesto para los núcleos activos de Ourense (>=50 hab) con los "
  + "pesos provisionales vigentes (peligro 0.40 · social 0.35 · capacidad 0.25). Peligro: "
  + "Sentinel-2 NDVI+NDMI + pendiente SRTM (EE). Social: mayores_65 (Padrón INE, proxy "
  + "concello) + población (IGE), sin hogares unipersonales ni dispersión a escala "
  + "(subpesos renormalizados). Capacidad: vías de salida OSM. Pesos NO calibrados; la "
  + "recalibración contra GlobFire (data/calibracion_globfire_ourense.json) es exploratoria.";

writeFileSync(join(DATA, "nucleos_ourense.json"), JSON.stringify(fc, null, 1) + "\n", "utf8");

const ivs = fc.features.filter((f) => f.properties.activo && f.properties.iv != null).map((f) => f.properties.iv);
ivs.sort((a, b) => a - b);
console.log(`IV compuesto para ${n} núcleos activos`);
if (sinPeligro || sinCap || sinEdad) console.log(`  sin peligro: ${sinPeligro} · sin capacidad: ${sinCap} · sin edad: ${sinEdad}`);
console.log(`IV min/mediana/max: ${ivs[0]} / ${ivs[Math.floor(ivs.length / 2)]} / ${ivs[ivs.length - 1]}`);
console.log("Escrito data/nucleos_ourense.json");
