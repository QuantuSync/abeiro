import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

// Títulos: serif clásica con autoridad (institucional/heráldica, identidad FASOR).
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--fuente-titulo",
  display: "swap",
});
// Cuerpo: sans sobria, buen contraste sobre fondo oscuro.
const inter = Inter({
  subsets: ["latin"],
  variable: "--fuente-cuerpo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ABEIRO — FASOR · Evaluación de Riesgo de Incendios",
  description:
    "ABEIRO, herramienta de evaluación de riesgo de incendios forestales de FASOR "
    + "(Fuerza de Auxilio, Soporte y Rescate · Casa Alaniz). Comarca piloto de "
    + "Valdeorras / Larouco (Ourense). Demostrador con datos reales (IGE · OSM · Sentinel-2).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
