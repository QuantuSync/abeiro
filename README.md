# ABEIRO — Frontend (Fase 0)

Sistema abierto de protección ante incendios forestales en Galicia. **Abeiro** significa
*refugio/amparo* en gallego. El sistema es open source y gratuito. Su aportación no es
detectar el fuego (eso ya lo cubren satélites y organismos públicos), sino cerrar el
último eslabón: traducir el avance del fuego en una **decisión accionable por aldea y por
persona**.

Este repositorio es el **frontend** (desplegable en Vercel). El motor científico pesado
(emulador de propagación, asimilación de datos) vive en un servidor dedicado aparte y se
construye en fases posteriores.

## Qué hace la Fase 0

Mapa web ([MapLibre GL](https://maplibre.org/)) de la comarca piloto de
**Valdeorras / Larouco** (Ourense) que pinta el **Índice de Vulnerabilidad** por núcleo
de población con **datos de prueba** (inventados pero coherentes). Incluye:

- Mapa interactivo con basemap de OpenStreetMap (sin claves de API en el navegador).
- Núcleos coloreados según su Índice de Vulnerabilidad (escala verde → rojo).
- **Leyenda** con las cinco categorías de vulnerabilidad.
- **Panel de información** al pinchar un núcleo: población, envejecimiento, aislamiento,
  dispersión, accesos, peligro biofísico y capacidad de respuesta.

> ⚠️ **Datos de prueba.** Las cifras de este repositorio son inventadas para validar el
> circuito completo *datos → mapa → despliegue*. No deben usarse para ninguna decisión
> real. En la Fase 1 se sustituyen por fuentes abiertas (PNOA-LiDAR, MeteoGalicia, IGE/INE,
> Sentinel-2, OpenStreetMap, EFFIS…).

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) — desplegable en Vercel.
- [MapLibre GL JS](https://maplibre.org/) — mapas open source, sin claves de API.
- TypeScript.
- Datos geoespaciales en GeoJSON (`data/nucleos.json`).

## Requisitos

- [Node.js](https://nodejs.org/) 18.18 o superior (probado con Node 22).
- npm (incluido con Node).

## Cómo arrancarlo en local

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar el servidor de desarrollo
npm run dev
```

Abre **http://localhost:3000** en el navegador.

### Otros comandos

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción (tras npm run build)
npm run lint    # linting
```

## Despliegue en Vercel

1. Sube el repositorio a GitHub.
2. En [Vercel](https://vercel.com/), *New Project* → importa el repo.
3. Vercel detecta Next.js automáticamente: *framework preset* Next.js, sin configuración
   extra. No hay variables de entorno ni secretos en esta fase.
4. *Deploy*.

## Estructura del proyecto

```
abeiro/
├─ app/
│  ├─ layout.tsx          # layout raíz y metadatos
│  ├─ page.tsx            # página principal (carga el mapa en cliente)
│  └─ globals.css         # estilos
├─ components/
│  ├─ MapaVulnerabilidad.tsx  # mapa MapLibre + capas + interacción
│  ├─ Leyenda.tsx             # leyenda del Índice de Vulnerabilidad
│  └─ PanelInfo.tsx           # panel de detalle de un núcleo
├─ lib/
│  └─ vulnerabilidad.ts   # categorías, paleta y expresión de color
├─ data/
│  └─ nucleos.json        # GeoJSON de núcleos (DATOS DE PRUEBA)
└─ scripts/
   └─ verificar-mapa.mjs  # verificación headless (Playwright)
```

## El Índice de Vulnerabilidad

Puntúa cada núcleo (0–100) según el riesgo humano real, combinando peligro biofísico,
sensibilidad social (envejecimiento, hogares unipersonales de edad avanzada, dispersión)
y capacidad de respuesta (accesos, cobertura). En fases posteriores se calibrará como
modelo supervisado contra el resultado humano observado en el incendio de 2025
(qué aldeas se evacuaron/confinaron), no con pesos elegidos a mano, y se medirá con ROC/AUC.

### Categorías

| Categoría   | Rango IV | Color      |
|-------------|----------|------------|
| Muy baja    | 0–20     | 🟢 verde   |
| Baja        | 20–40    | 🟡 verde claro |
| Media       | 40–60    | 🟡 amarillo |
| Alta        | 60–80    | 🟠 naranja |
| Muy alta    | 80–100   | 🔴 rojo oscuro |

## Privacidad (RGPD)

La identidad nominal de personas vulnerables queda **fuera** del sistema. Solo se usan
indicadores agregados y no identificativos (proporción de mayores, hogares unipersonales
de edad avanzada, dispersión, distancia a servicios).

## Licencia

Proyecto open source bajo licencia libre. Ámbito: Galicia.
