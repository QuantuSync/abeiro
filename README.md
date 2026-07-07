# ABEIRO — Protección ante incendios forestales · Galicia

**ABEIRO** es una herramienta de protección ante incendios forestales en Galicia.
*Abeiro* significa *refugio/amparo* en gallego. Sistema abierto y gratuito. Su aportación
no es detectar el fuego (eso ya lo cubren satélites y organismos públicos), sino cerrar el
último eslabón: traducir el avance del fuego en una **decisión accionable por aldea y por
persona**.

La interfaz adopta una **identidad visual sobria** (verde bosque muy oscuro + acento
dorado, tipografía serif institucional). Es un **demostrador con datos reales**
(IGE · OpenStreetMap · Sentinel-2), no datos de prueba.

Este repositorio es el **frontend** (desplegable en Vercel). El motor científico pesado
(emulador de propagación, asimilación de datos) vive en un servidor dedicado aparte y se
construye en fases posteriores.

## Qué muestra

Mapa web ([MapLibre GL](https://maplibre.org/)) de la comarca piloto de
**Valdeorras / Larouco** (Ourense) que pinta el **Índice de Vulnerabilidad** por núcleo
de población con **datos reales** (IGE · OpenStreetMap · Sentinel-2 · EU-DEM · Copernicus
EMS). Los 12 núcleos del piloto tienen ya dato real en sus cinco componentes (población,
envejecimiento, capacidad de respuesta y pendiente reales; combustible aproximado por
satélite). Incluye:

- Mapa interactivo con basemap **CARTO Voyager** (neutro pero con buen contraste y
  legibilidad de carreteras y topónimos, sin claves de API), pensado para que personas
  mayores distingan sin esfuerzo pueblos, carreteras y colores de riesgo.
- Núcleos coloreados según su Índice de Vulnerabilidad (escala verde → rojo).
- **Dos lentes** intercambiables —**Vulnerabilidad** y **Evacuación** (rutas reales de
  salida por carretera)— que no se funden en un único número.
- **Leyenda** que cambia según la lente activa.
- **Panel de información** al pinchar un núcleo: población, envejecimiento, aislamiento,
  dispersión, accesos, peligro biofísico, capacidad de respuesta, ruta de evacuación y
  afectación del incendio de 2025, indicando la **procedencia de cada dato** (real /
  aproximación / estimación).

> ⚠️ **Demostrador, no herramienta operativa.** Los **datos son reales** (no inventados),
> pero los **pesos del índice son provisionales** y aún **no están calibrados** contra el
> resultado observado del incendio de 2025 (ROC/AUC, fase posterior). El **combustible** es
> una *aproximación* por satélite, no el mapa de combustible calibrado (fotoguía + LiDAR).
> No debe usarse como única base para decisiones operativas reales.

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
│  └─ globals.css         # estilos e identidad visual
├─ components/
│  ├─ MapaVulnerabilidad.tsx  # mapa MapLibre + capas + interacción + selector de lente
│  ├─ Leyenda.tsx             # leyenda (cambia según la lente activa)
│  ├─ PanelInfo.tsx           # panel de detalle de un núcleo (vulnerabilidad + evacuación)
│  └─ PanelValidacion.tsx     # panel de validación (afectación física 2025)
├─ lib/
│  ├─ vulnerabilidad.ts   # categorías, paleta y expresión de color del IV
│  └─ evacuacion.ts       # dificultad de evacuación, paleta y expresión de color
├─ data/                  # núcleos + cachés de fuentes (IGE / OSM / Sentinel-2 / DEM / EMS)
│  ├─ nucleos.json            # GeoJSON de núcleos con el IV y la procedencia de cada dato
│  ├─ nucleos.base.json       # línea base reproducible (antes de cruzar fuentes)
│  ├─ evacuacion.json         # rutas de evacuación por núcleo
│  └─ ...                     # accesos_osm, ndvi/ndmi_sentinel2, pendiente_dem, afectación…
├─ public/
│  ├─ rutas_evacuacion.geojson   # líneas de evacuación para el mapa
│  └─ perimetro_emsr837.geojson  # perímetro quemado 2025 (Copernicus EMS)
└─ scripts/
   ├─ procesar-ige.mjs         # regenera nucleos.json desde base + IGE + OSM + DEM
   ├─ fetch-accesos-osm.mjs    # red viaria OSM -> accesos_osm.json
   ├─ fetch-peligro.mjs        # pendiente EU-DEM + combustible (Sentinel-2)
   ├─ afectacion_emsr837.py    # cruce con el perímetro Copernicus EMS 2025
   ├─ evacuacion_osm.py        # grafo viario + rutas de evacuación
   └─ verificar-mapa.mjs       # verificación headless (Playwright)
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
combustible) o **estimación** (gris).

### Composición del índice

El **Índice de Vulnerabilidad** se **compone directamente desde las tres componentes**
normalizadas 0–100 (ya no se calcula como delta sobre el valor inventado de Fase 0):

```
iv = 0.40 · peligro_biofisico + 0.35 · score_social + 0.25 · (100 − capacidad_respuesta)
```

Dirección de cada subíndice: más peligro biofísico y más sensibilidad social **suben** el
IV; más capacidad de respuesta lo **baja** (entra invertida como `100 − capacidad`). El
`score_social` (0–100) se deriva de forma explícita de las variables sociales, con
subpesos documentados en `metadata.subpesos_social`:

```
score_social = 0.45 · mayores_65 + 0.20 · hogares_unipersonales
             + 0.20 · dispersion + 0.15 · poblacion
```

- `mayores_65`: fracción de mayores de 65, normalizada al rango fijo [0.15, 0.55]
  (**real**, proxy concello, Padrón IGE 2022).
- `hogares_unipersonales`: % de hogares unipersonales de mayores, normalizado a [0, 50]
  (**estimación** de Fase 0, aún sin fuente censal).
- `dispersion`: categórica muy baja/baja/media/alta/muy alta → 0/25/50/75/100
  (**estimación** de Fase 0).
- `poblacion`: escala logarítmica invertida `100 − 25·log10(hab)` — menos vecinos, más
  sensibilidad (**real**, Nomenclátor IGE 2025).

Los pesos (`peligro 0.40 · social 0.35 · capacidad 0.25`, `metadata.pesos_iv`) son
**provisionales**; su **calibración supervisada** (ROC/AUC contra el incendio de 2025) es
una fase posterior. El valor antiguo anclado a Fase 0 se conserva en cada núcleo como
`iv_fase0`, solo como columna de comparación (no se pinta en el mapa).

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

## Capa de evacuación estática (corazón de la misión, NO es parte del IV)

No "dónde arde" sino "por dónde se sale vivo". Para cada núcleo se calcula la **ruta real de
evacuación por carretera** hasta el **destino seguro más cercano** (cabeceras comarcales con
servicios: **A Rúa** y **O Barco de Valdeorras**). Es una capa nueva e independiente; el IV
no se toca.

- **Método** (`scripts/evacuacion_osm.py`): se descarga **una vez** un extracto OSM de las
  carreteras del bbox de Valdeorras (vía Overpass; cache `data/osm_valdeorras.json`,
  gitignored) y se construye el **grafo viario en local con `networkx`** (≈258k nodos). El
  build de la web **no** depende de llamadas en vivo: lee los resultados estáticos.
- **Ponderación por tipo de vía:** velocidad y *fiabilidad* por clase (asfalto fiable, pista
  forestal lenta y poco fiable: una ruta que solo va por pista **no** es salida segura). La
  ruta elegida es la más rápida; se reporta el % por pista y una fiabilidad media 0–1.
- **Por núcleo:** destino seguro asignado, **distancia** (km) y **tiempo** por carretera, y
  **nº de rutas alternativas independientes** (conectividad de aristas al conjunto de
  destinos = redundancia; 1 = sin redundancia, más vulnerable). Resultado en
  `data/evacuacion.json`; líneas para el mapa en `public/rutas_evacuacion.geojson`.
- **Limitación:** evacuación **estática** — todavía no considera el fuego (qué vías quedan
  cortadas), ni el tráfico ni la hora. Es el primer paso verificable, sin motor de fuego.

En el mapa, las rutas se dibujan en verde (fiable) → naranja (depende de pista), con los
destinos seguros marcados en azul; el panel muestra destino, distancia, tiempo, redundancia
y % de pista.

## Dos lentes del mapa (vulnerabilidad y evacuación NO se funden)

La interfaz tiene un **selector** que alterna entre dos visualizaciones independientes del
mismo mapa. Son cosas distintas y **no se combinan en un único número**:

- **Vulnerabilidad:** colorea por el Índice de Vulnerabilidad (verde→rojo). Muestra el
  anillo de edad real y el perímetro quemado 2025.
- **Evacuación:** colorea por la **dificultad de evacuación** (azul=fácil → rojo=difícil,
  paleta distinta a propósito) y dibuja las rutas. La dificultad (`lib/evacuacion.ts`) deriva
  **solo** de la capa de evacuación:
  `dificultad = 0.35·tiempo + 0.45·redundancia + 0.20·pista` (0–100, pesos provisionales),
  con `tiempo = min(100, tiempo_min/45·100)`, `redundancia` = 1 ruta → 100 (crítico), 2 → 40,
  3 → 15, ≥4 → 0, y `pista = min(100, %pista·2.5)`. La redundancia pesa más: una sola salida
  es el mayor riesgo. **No recalcula ni toca el IV.**

El **panel** de cada núcleo muestra **siempre las dos lecturas separadas**, en bloques
«Vulnerabilidad» y «Evacuación», para que se vea que un núcleo puede ser medio en una y
crítico en la otra (p. ej. **Vilamartín**: IV 56 *media*, evacuación 64 *difícil*; o
**Pradorramisquedo**: alto en ambas). La **leyenda** cambia según la lente activa.

## Privacidad (RGPD)

La identidad nominal de personas vulnerables queda **fuera** del sistema. Solo se usan
indicadores agregados y no identificativos (proporción de mayores, hogares unipersonales
de edad avanzada, dispersión, distancia a servicios).

## Licencia

Proyecto open source bajo licencia libre. Ámbito: Galicia.
