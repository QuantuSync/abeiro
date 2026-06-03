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

### Datos reales integrados (Fase 1, en curso)

La componente de **sensibilidad social** y la **población** dejan de ser inventadas y
pasan a datos abiertos del **IGE**:

- **Población por aldea:** Nomenclátor IGE 2025, real por entidade singular. Repartido por
  concello en `data/Fichero5,9,10..16.txt` (los 9 concellos del piloto) más el Nomenclátor
  general `data/Fichero1.txt` como respaldo.
- **% de mayores de 65:** Padrón IGE 2022 por grupos de edad a nivel **concello**,
  consolidado en `data/padron_edad_concellos.csv` (columnas `codmun, concello,
  pct_mayores_65` como fracción 0–1). Se aplica como **proxy** a cada aldea de su concello.
  El 65+ suma sólo los grupos `65-69`, `70-74`, `75-79`, `80-84` y `85 e máis` (no los
  subgrupos de `85 e máis`, para evitar doble conteo). `pct_mayores_65` se guarda como
  fracción 0–1.

La componente de **capacidad de respuesta** usa la **red viaria de OpenStreetMap**:

- **Vías de salida:** por cada núcleo se cuenta, vía **Overpass API**, el nº de carreteras
  transitables (`highway`: primary, secondary, tertiary, unclassified, residential, track)
  que **cruzan** un círculo de 1 km alrededor del centro (cada cruce = una salida). El
  resultado se **cachea** en `data/accesos_osm.json` (ODbL) para no depender de la API en
  cada build.
- **Ponderación por clase de vía:** una pista forestal no es una vía de evacuación fiable
  ante un incendio, así que las salidas se ponderan antes de derivar la capacidad:
  `primary/secondary/tertiary = 1.0`, `unclassified/residential = 0.5`, `track = 0.2`. Así
  las aldeas conectadas sólo por pistas reflejan su aislamiento real (menor capacidad, mayor
  vulnerabilidad). Los pesos quedan documentados en `nucleos.json` (`metadata.pesos_via`).

La componente de **peligro biofísico** combina pendiente real y combustible aproximado
(`scripts/fetch-peligro.mjs`):

- **Pendiente (dato REAL):** del **DEM europeo EU-DEM 25 m** (vía opentopodata). Se muestrea
  la cota en el centro y en 4 vecinos a 90 m y se calcula la pendiente por diferencias
  centradas. Más pendiente → propagación más rápida. Cache: `data/pendiente_dem.json`.
- **Combustible (APROXIMACIÓN, basado en SATÉLITE):** se mide con **Sentinel-2**
  (`COPERNICUS/S2_SR_HARMONIZED`, vía Google Earth Engine, verano 2025), combinando *cuánto*
  material hay y *cómo de seco* está:
  - **Biomasa (NDVI):** el NDVI medio (1 km) mide directamente la **cantidad** de vegetación.
    `biomasa = NDVI_normalizado([0.348, 0.750]) × 100`. Cache: `data/ndvi_sentinel2.json`.
  - **Inflamabilidad (NDMI):** el NDMI medio (1 km) modula por **humedad**:
    `combustibilidad = biomasa × (1 ± 0.30)`, con el factor según el NDMI invertido y
    normalizado al rango observado `[0.013, 0.269]` (seco → ×1.30; húmedo → ×0.70). Cache:
    `data/ndmi_sentinel2.json`.
  - Al ser multiplicativo: mucha biomasa + seca = máximo; mucha + húmeda = media; **poca
    biomasa = baja** esté seca o no → los núcleos urbanos (A Rúa, O Barco) quedan con
    combustible bajo pese a su NDMI seco.
  - **El NDVI sustituye a la cubierta OSM** como medida de cantidad de vegetación (el satélite
    la mide; OSM solo la etiquetaba, y mezclarlos sería doble conteo). La **cubierta OSM
    (`data/combustible_osm.json`) queda solo como respaldo** para núcleos sin satélite.
  - **No es** el mapa de combustible calibrado (fotoguía + LiDAR), que es una fase aparte;
    pero ahora se basa en **medición directa de satélite** (cantidad y humedad de vegetación),
    no en etiquetas de cubierta.
- `peligro_biofisico = 0.40·score_pendiente + 0.60·combustibilidad` (pesos provisionales).
  Con satélite, los 12 núcleos tienen combustible real (incluido Vilamartín, que no tenía
  cubierta OSM).

Los ficheros del IGE vienen en **ISO-8859-1**. El procesador parte de `data/nucleos.base.json`
(línea base reproducible, con las componentes aún estimadas), los lee como `latin1`,
normaliza nombres a UTF-8, cruza las aldeas del Nomenclátor con los núcleos del mapa
(normalizando mayúsculas/tildes y reordenando el artículo), incorpora la capacidad desde
`data/accesos_osm.json` y reescribe `data/nucleos.json` marcando con `dato_poblacion_real`
/ `dato_edad_real` / `dato_capacidad_real` qué componentes ya usan dato real.

```bash
node scripts/fetch-accesos-osm.mjs --force   # (opcional) red viaria OSM -> accesos_osm.json
node scripts/fetch-peligro.mjs --force        # (opcional) pendiente EU-DEM + combustible OSM
node scripts/procesar-ige.mjs                 # regenera data/nucleos.json desde base + IGE + OSM + DEM
```

En el mapa, los núcleos con **edad real** se marcan con un anillo verde; el panel de cada
núcleo muestra la procedencia de cada dato: **real** (verde), **aproximación** (ámbar,
combustible) o **estimación** (gris). El **Índice de Vulnerabilidad** combina las tres
componentes con pesos provisionales `peligro 0.40 · social 0.35 · capacidad 0.25`
(`metadata.pesos_iv`); su **calibración supervisada** (ROC/AUC contra el incendio de 2025)
es una fase posterior.

### Categorías

| Categoría   | Rango IV | Color      |
|-------------|----------|------------|
| Muy baja    | 0–20     | 🟢 verde   |
| Baja        | 20–40    | 🟡 verde claro |
| Media       | 40–60    | 🟡 amarillo |
| Alta        | 60–80    | 🟠 naranja |
| Muy alta    | 80–100   | 🔴 rojo oscuro |

## Capa de afectación física 2025 (validación, NO es parte del índice)

Para **validar** el Índice de Vulnerabilidad contra el incendio real de 2025 se cruza el
perímetro quemado con los 12 núcleos. **No** es una componente del IV: es una columna de
validación independiente.

- **Fuente:** Copernicus EMS Rapid Mapping, activación **EMSR837** (*Wildfires in West
  Spain*), AOI01 *Ourense Province*, delineaciones `DEL` (`observedEvent`, GeoJSON WGS84).
  Se eligió EMS porque el **WFS de EFFIS estaba caído** (error de backend Oracle) y los
  respaldos MITECO/SITGA no servían vectores por WFS.
- **Método** (`scripts/afectacion_emsr837.py`): *dissolve* (`unary_union`) de las 10
  delineaciones por fecha (2025-08-16 → 2025-08-30); por núcleo se calcula `afect_fisica`
  (dentro del perímetro), `borde_500m` (a ≤ 500 m) y `fecha_frente` (1ª delineación que lo
  alcanza). Resultado en `data/nucleos_afectacion_fisica.json`; perímetro para el mapa en
  `public/perimetro_emsr837.geojson` (recortado al piloto y simplificado).
- **Limitación documentada:** EFFIS no da un perímetro único sino polígonos de incremento
  diario que hay que unir, y un perímetro puede estar **incompleto**. Aquí, con EMS, el
  perímetro AOI01 **capturó ~129.823 ha** y agrega **varios complejos de incendios** del
  área de Ourense (el mayor parche ≈ 32.843 ha corresponde al incendio de Larouco): es
  amplio para la región, no solo el incendio piloto.

En el mapa, el perímetro se pinta en granate y los núcleos dentro del área llevan un punto
oscuro; el panel muestra el estado de afectación marcado como dato Copernicus EMS con su
limitación.

## Privacidad (RGPD)

La identidad nominal de personas vulnerables queda **fuera** del sistema. Solo se usan
indicadores agregados y no identificativos (proporción de mayores, hogares unipersonales
de edad avanzada, dispersión, distancia a servicios).

## Licencia

Proyecto open source bajo licencia libre. Ámbito: Galicia.
