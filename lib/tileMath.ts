// lib/tileMath.ts
// Conversión de índice de tesela (x, y, z de la rejilla Web Mercator que usa
// MapLibre) a su rectángulo en grados (EPSG:4326). Hace falta porque el WMS
// de EFFIS solo publica mf010.fwi en EPSG:4326, nunca en Web Mercator.
function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function bboxDeTesela(x: number, y: number, z: number): [number, number, number, number] {
  const oeste = tile2lon(x, z);
  const este = tile2lon(x + 1, z);
  const norte = tile2lat(y, z);
  const sur = tile2lat(y + 1, z);
  return [oeste, sur, este, norte]; // [minx, miny, maxx, maxy], el orden que WMS 1.1.1 espera con SRS=EPSG:4326
}