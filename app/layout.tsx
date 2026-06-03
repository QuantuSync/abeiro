import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABEIRO — Índice de Vulnerabilidad (Valdeorras/Larouco)",
  description:
    "Fase 0 de ABEIRO: mapa del Índice de Vulnerabilidad ante incendios forestales de la comarca piloto de Valdeorras / Larouco (Ourense). Datos de prueba.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
