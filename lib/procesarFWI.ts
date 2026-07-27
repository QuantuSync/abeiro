// lib/procesarFWI.ts
// SOLO se llama desde una Route Handler (servidor). Nunca desde un
// componente o hook "use client" — sharp no existe en el navegador.

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { BBOX_OURENSE_FWI as BBOX } from "@/lib/mapa-config";

//GeoJSON de data/
const GEOJSON_CONCELLOS = "limites_concellos_ourense.geojson"

const EFFIS_WMS = "https://maps.effis.emergency.copernicus.eu/effis";
const CAPA_FWI = "mf010.fwi"; //MeteoFrance. ecmwf007.fwi daba problemas al principio
//const BBOX: [number, number, number, number] = [-8.3, 41.8, -6.5, 42.7]; // oeste, sur, este, norte
const ANCHO = 2048;
const ALTO = 2048;

function fechaValida(): string {
  const ayer = new Date();
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return ayer.toISOString().slice(0, 10);
}

async function descargarRaster(): Promise<Buffer> {
  const params = new URLSearchParams({
    SERVICE: "wms", VERSION: "1.1.1", REQUEST: "GetMap",
    LAYERS: CAPA_FWI, STYLES: "",
    SRS: "EPSG:4326", BBOX: BBOX.join(","),
    WIDTH: String(ANCHO), HEIGHT: String(ALTO),
    FORMAT: "image/png", TRANSPARENT: "true", SINGLETILE: "false",
    TIME: fechaValida(),
  });
  const res = await fetch(`${EFFIS_WMS}?${params}`);
  const contentType = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());

  if (!contentType.startsWith("image/")) {
    // Cualquier respuesta que NO sea una imagen es un error — da igual
    // si viene como XML, HTML o texto plano. Mostramos el cuerpo crudo
    // para ver qué dice de verdad, en vez de adivinar el formato.
    throw new Error(
      `EFFIS no devolvió una imagen (Content-Type: "${contentType}"): ${bytes.toString("utf-8").slice(0, 500)}`
    );
  }
  return bytes;
}

// Convierte [lon, lat] a coordenadas de píxel dentro de ANCHO×ALTO, usando
// el mismo BBOX (EPSG:4326, sin proyección de por medio) que le pedimos a
// EFFIS — así el punto cae exactamente donde debe, píxel a píxel.
function lonLatAPixel([lon, lat]: [number, number]): [number, number] {
  const [oeste, sur, este, norte] = BBOX;
  const x = ((lon - oeste) / (este - oeste)) * ANCHO;
  const y = ((norte - lat) / (norte - sur)) * ALTO; // Y invertido: norte = arriba
  return [x, y];
}

function anilloAPath(anillo: [number, number][]): string {
  const puntos = anillo.map((p) => lonLatAPixel(p).join(",")).join(" L ");
  return `M ${puntos} Z`;
}

async function construirMascaraSVG(): Promise<Buffer> {
  const ruta = path.join(process.cwd(), "data", GEOJSON_CONCELLOS);
  const fc = JSON.parse(await readFile(ruta, "utf-8"));

  // Un <path> por concello (fill-rule evenodd resuelve bien sus propios
  // huecos, si los tuviera). Varios concellos blancos superpuestos no dan
  // problema: es el mismo color, no importa que se toquen en el borde.
  const paths = fc.features.map((f: any) => {
    const anillos: [number, number][][] =
      f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    const d = anillos.map(anilloAPath).join(" ");
    return `<path d="${d}" fill="white" fill-rule="evenodd" />`;
  });

  const svg = `<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">${paths.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function obtenerFWIRecortado(): Promise<Buffer> {
  const [raster, mascara] = await Promise.all([descargarRaster(), construirMascaraSVG()]);

  return sharp(raster)
    .composite([{ input: mascara, blend: "dest-in" }]) // conserva solo donde la máscara es blanca
    .png()
    .toBuffer();
}