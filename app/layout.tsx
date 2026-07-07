import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes LOCALES (app/fonts/*.woff2, subset latin de Google Fonts) para que el
// build sea reproducible sin salida a Google Fonts. Son ficheros VARIABLES: un
// woff2 cubre todos los pesos usados.
// Títulos: serif clásica con autoridad (institucional/heráldica).
const playfair = localFont({
  src: "./fonts/playfair-display-latin-var.woff2",
  weight: "400 900",
  variable: "--fuente-titulo",
  display: "swap",
});
// Cuerpo: sans sobria, buen contraste sobre fondo oscuro.
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
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
    <html lang="es" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
