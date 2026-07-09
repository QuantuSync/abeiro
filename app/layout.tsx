import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes LOCALES (app/fonts/*.woff2, subset latin de Google Fonts) para que el
// build sea reproducible sin salida a Google Fonts. Superfamilia IBM Plex:
// institucional, con carácter y gran legibilidad (público mayor + técnico).
// Títulos y cifras: IBM Plex Serif (presencia, gravedad institucional).
const titulo = localFont({
  src: [
    { path: "./fonts/plex-serif-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plex-serif-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fuente-titulo",
  display: "swap",
});
// Cuerpo: IBM Plex Sans (humanista, sobria, alta legibilidad).
const cuerpo = localFont({
  src: [
    { path: "./fonts/plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fuente-cuerpo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ABEIRO — Protección ante incendios forestales · Galicia",
  description:
    "ABEIRO, herramienta de protección ante incendios forestales en Galicia. "
    + "Comarca piloto de Valdeorras / Larouco (Ourense). "
    + "Demostrador con datos reales (IGE · OSM · Sentinel-2).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${titulo.variable} ${cuerpo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
