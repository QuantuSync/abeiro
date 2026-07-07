//FUTURO... si metes mas funciones, quizas renombra a mapaCamara.ts
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { NucleoProps } from "@/lib/tipos";

// "Ruta de escape en coche": pasa a la lente de evacuación, resalta la ruta y
// encuadra el trayecto núcleo -> destino seguro DENTRO de Valdeorras.
//
// No lee nada de React directamente (ni mapRef, ni estado): recibe map,
// nucleos y los setters como parámetros, igual que configurarInteraccionNucleos.
export function resaltarRutaCoche(
  map: MapLibreMap | null,
  nucleos: FeatureCollection<Point, NucleoProps>,
  id: string
) {

  if (!map) return;

  const nuc = nucleos.features.find((f) => f.properties.id === id);
  const dest = nucleos.features.find((f) => f.properties.id === nuc?.properties.destino);
  if (!nuc || !dest) return;

  const pts = [nuc.geometry.coordinates, dest.geometry.coordinates] as [number, number][];

  // Salvaguarda: solo encuadra si ambos puntos están en el bbox de Galicia
  // (evita cualquier salto fuera por datos o cálculo inesperado).
  const dentroGalicia = pts.every(([lon, lat]) => lon > -9 && lon < -6.3 && lat > 41.6 && lat < 44);
  if (!dentroGalicia) return;

  // LngLatBounds explícito (sin ambigüedad de estructura de arrays).
  const bounds = new maplibregl.LngLatBounds(pts[0], pts[0]);
  pts.forEach((p) => bounds.extend(p));

  // Padding seguro: nunca supera el espacio disponible (en ventanas estrechas
  // un padding grande producía un viewport inválido y la cámara saltaba fuera).
  const w = map.getContainer().clientWidth || 1000;
  const h = map.getContainer().clientHeight || 700;
  const padX = Math.min(70, Math.floor(w * 0.12));
  const padY = Math.min(70, Math.floor(h * 0.12));

  map.fitBounds(bounds, {
    padding: { top: padY, bottom: padY, left: padX, right: padX },
    maxZoom: 12.5,
    duration: 800,
  });
}