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
EMS). Los 12 núcleos del piloto tienen dato real o aproximado en sus componentes
(población, envejecimiento, capacidad de respuesta y pendiente reales; combustible
aproximado por cubierta OSM, con medición Sentinel-2 pendiente de repetir tras la
corrección de coordenadas — ver más abajo). Incluye:

- Mapa interactivo con basemap **CARTO Voyager** (neutro pero con buen contraste y
  legibilidad de carreteras y topónimos, sin claves de API), pensado para que personas
  mayores distingan sin esfuerzo pueblos, carreteras y colores de riesgo.
- Núcleos coloreados según su Índice de Vulnerabilidad (escala amarillo → granate,
  segura para daltonismo, con redundancia por tamaño y grosor de borde).
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
npm test        # tests unitarios (Vitest)
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
│  ├─ layout.tsx          # layout raíz y metadatos (fuentes locales next/font/local)
│  ├─ fonts/              # woff2 variables de Inter y Playfair Display (build sin red)
│  ├─ page.tsx            # página principal (carga el mapa en cliente)
│  └─ globals.css         # estilos e identidad visual
├─ components/
│  ├─ MapaVulnerabilidad.tsx  # estado e interacción del mapa + selector de lente
│  ├─ Leyenda.tsx             # leyenda (cambia según la lente activa)
│  ├─ PanelInfo.tsx           # panel de detalle de un núcleo (vulnerabilidad + evacuación)
│  └─ PanelValidacion.tsx     # panel de validación (afectación física 2025)
├─ lib/
│  ├─ vulnerabilidad.ts   # categorías, paleta y expresión de color del IV
│  ├─ evacuacion.ts       # dificultad de evacuación, paleta y expresión de color
│  ├─ indice.mjs          # lógica PURA del índice (pesos, score social, IV, confianza)
│  ├─ datos.ts            # fusión núcleos + afectación + evacuación (tipos incluidos)
│  ├─ mapa-config.ts      # estilo base, centro/zoom y capas por lente
│  └─ capas-mapa.ts       # creación de fuentes y capas MapLibre (funciones puras)
├─ data/                  # núcleos + cachés de fuentes (IGE / OSM / Sentinel-2 / DEM / EMS)
│  ├─ nucleos.json            # GeoJSON de núcleos con el IV y la procedencia de cada dato
│  ├─ nucleos.base.json       # línea base reproducible (antes de cruzar fuentes)
│  ├─ evacuacion.json         # rutas de evacuación por núcleo (con ratio_rodeo)
│  ├─ sensibilidad_pesos.json # análisis de sensibilidad de los pesos del IV
│  └─ ...                     # accesos_osm, ndvi/ndmi_sentinel2, pendiente_dem, afectación…
├─ public/
│  ├─ rutas_evacuacion.geojson   # líneas de evacuación para el mapa
│  └─ perimetro_emsr837.geojson  # perímetro quemado 2025 (Copernicus EMS)
├─ tests/                 # tests unitarios (Vitest): índice, paletas, evacuación, datos
└─ scripts/
   ├─ procesar-ige.mjs         # regenera nucleos.json desde base + IGE + OSM + DEM
   ├─ fetch-accesos-osm.mjs    # red viaria OSM -> accesos_osm.json (Overpass o --extracto)
   ├─ fetch-peligro.mjs        # pendiente EU-DEM + cubierta OSM
   ├─ afectacion_emsr837.py    # cruce con el perímetro Copernicus EMS 2025
   ├─ evacuacion_osm.py        # grafo viario + rutas de evacuación + sanity check de rodeo
   ├─ sensibilidad-pesos.mjs   # barrido de pesos del IV -> sensibilidad_pesos.json
   └─ verificar-mapa.mjs       # verificación headless (Playwright)
```

## El Índice de Vulnerabilidad

Puntúa cada núcleo (0–100) según el riesgo humano real, combinando peligro biofísico,
sensibilidad social (envejecimiento, hogares unipersonales de edad avanzada, dispersión)
y capacidad de respuesta (accesos, cobertura). En fases posteriores se calibrará como
modelo supervisado contra el resultado humano observado en el incendio de 2025
(qué aldeas se evacuaron/confinaron), no con pesos elegidos a mano, y se medirá con ROC/AUC.

### Coordenadas reales de los núcleos

Las coordenadas de Fase 0 de 8 de los 12 núcleos estaban **desplazadas entre 8 y 57 km**
de su posición real (Larouco aparecía 26 km al norte; Pradorramisquedo, que pertenece a
Viana do Bolo, a 57 km). Se corrigieron con los **nodos `place` de OpenStreetMap**
(consulta Overpass; `fuente_coordenadas` por núcleo en `data/nucleos.base.json`) y se
regeneraron todas las cachés que dependen de la posición: accesos, pendiente, cubierta
OSM, afectación EMSR837 y evacuación. Consecuencia importante: los **NDVI/NDMI de
Sentinel-2 cacheados se midieron sobre las coordenadas antiguas**, así que quedan
invalidados para 10 núcleos (`metadata.satelite_pendiente_remedicion`), que usan el
respaldo por cubierta OSM hasta re-medir con Earth Engine; solo A Rúa y O Barco (que
apenas se movieron) conservan el dato de satélite.

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
  (`COPERNICUS/S2_SR_HARMONIZED`, vía Google Earth Engine con
  `scripts/fetch-satelite.py`), en el período **pre-incendio 1 jun – 31 jul 2025** (el
  incendio grande fue en agosto; medir después contaminaría el NDVI de las zonas quemadas
  justo donde más combustible había), con buffer de **1 km**, filtro
  `CLOUDY_PIXEL_PERCENTAGE < 20`, **máscara de nubes/sombras por banda SCL** (clases 3, 8,
  9, 10, 11) y **mediana temporal**. Combina *cuánto* material hay y *cómo de seco* está:
  - **Biomasa (NDVI):** el NDVI medio (1 km) mide directamente la **cantidad** de vegetación.
    `biomasa = NDVI_normalizado([0.15, 0.80]) × 100`, con recorte fuera de rango. El rango
    es **físico fijo** (0.15 ≈ suelo desnudo/urbano; 0.80 ≈ vegetación densa), no el rango
    observado de la muestra: así la escala no depende de los 12 núcleos y añadir uno nuevo
    no cambia los demás (`metadata.ndvi_rango_fijo`). Cache: `data/ndvi_sentinel2.json`.
  - **Inflamabilidad (NDMI):** el NDMI medio (1 km) modula por **humedad**:
    `combustibilidad = biomasa × (1 ± 0.30)`, con el factor según el NDMI invertido y
    normalizado al rango **físico fijo** `[−0.05, 0.35]` con recorte (−0.05 ≈ muy seco;
    0.35 ≈ dosel bien hidratado; `metadata.ndmi_rango_fijo`). Seco → ×1.30; húmedo → ×0.70.
    Cache: `data/ndmi_sentinel2.json`.
  - Al ser multiplicativo: mucha biomasa + seca = máximo; mucha + húmeda = media; **poca
    biomasa = baja** esté seca o no → los núcleos urbanos (A Rúa, O Barco) quedan con
    combustible bajo pese a su NDMI seco.
  - **El NDVI sustituye a la cubierta OSM** como medida de cantidad de vegetación (el satélite
    la mide; OSM solo la etiquetaba, y mezclarlos sería doble conteo). La **cubierta OSM
    (`data/combustible_osm.json`) queda como respaldo** para núcleos sin satélite.
  - **Estado actual:** los NDVI/NDMI están **re-medidos sobre las coordenadas corregidas**
    con `scripts/fetch-satelite.py` (Earth Engine). Si algún núcleo quedara sin píxeles
    válidos (nubes), cae automáticamente al respaldo por cubierta OSM y se lista en
    `metadata.satelite_pendiente_remedicion`.
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

La escala es **secuencial y segura para daltonismo** (ColorBrewer **YlOrRd**): varía sobre
todo en luminosidad, de modo que se lee con deuteranopia/protanopia (la antigua rampa
verde→rojo no). Además del color, el mapa añade **redundancia no cromática**: el tamaño
del círculo escala con el IV y el borde se engrosa en las categorías Alta y Muy alta.

| Categoría   | Rango IV | Color |
|-------------|----------|-------|
| Muy baja    | 0–20     | 🟡 amarillo pálido `#ffffb2` |
| Baja        | 20–40    | 🟡 ámbar `#fecc5c` |
| Media       | 40–60    | 🟠 naranja `#fd8d3c` |
| Alta        | 60–80    | 🔴 rojo `#f03b20` |
| Muy alta    | 80–100   | 🟥 granate `#bd0026` |

### Sensibilidad de los pesos y confianza del dato

Como los pesos del IV son provisionales, `scripts/sensibilidad-pesos.mjs` mide cuánto
dependen los resultados de esa elección: barre una **rejilla de pesos** (paso 0.05, cada
peso en [0.15, 0.60], suma 1; 69 combinaciones) y recalcula el IV de los 12 núcleos con
cada una. Resultados (`data/sensibilidad_pesos.json`):

- **El ranking es estable**: correlación de Spearman media de **0.97** contra el ranking
  con los pesos base — el orden de los núcleos apenas depende de los pesos elegidos.
- Cada núcleo lleva su **`rango_iv` [min, max]** (visible en el panel): los extremos del
  índice al variar los pesos. Núcleos cerca de un borde de categoría (Seadur, A Medua,
  A Rúa) cambian de categoría en >50 % de las combinaciones y deben leerse con cautela;
  los extremos (Pradorramisquedo, O Barco) casi nunca cambian.

Además cada núcleo lleva un campo **`confianza`** (0–1) derivado de los flags de
procedencia: real = 1, aproximación = 0.6, estimación = 0.3, promediado por componente
(con los subpesos del score social y los pesos pendiente/combustible del peligro) y
ponderado por los pesos del IV (`metadata.confianza_nota`). El panel lo muestra como
«Confianza del dato: alta / media / baja», y en aldeas de **menos de 50 habitantes**
añade el aviso de que el % de mayores es un proxy del concello y puede no representar
bien la aldea.

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
  carreteras del bbox de Valdeorras ampliado al sur hasta Viana do Bolo (vía Overpass;
  cache `data/osm_valdeorras.json`, gitignored) y se construye el **grafo viario en local
  con `networkx`** (≈320k nodos). El build de la web **no** depende de llamadas en vivo:
  lee los resultados estáticos.
- **Ponderación por tipo de vía:** velocidad y *fiabilidad* por clase (asfalto fiable, pista
  forestal lenta y poco fiable: una ruta que solo va por pista **no** es salida segura). La
  ruta elegida es la más rápida; se reporta el % por pista y una fiabilidad media 0–1.
- **Por núcleo:** destino seguro asignado, **distancia** (km) y **tiempo** por carretera, y
  **nº de rutas alternativas independientes** (conectividad de aristas al conjunto de
  destinos = redundancia; 1 = sin redundancia, más vulnerable). Resultado en
  `data/evacuacion.json`; líneas para el mapa en `public/rutas_evacuacion.geojson`.
- **Sanity check de rodeo:** por núcleo se reporta `ratio_rodeo = dist_carretera /
  dist_recta` (haversine al destino) y el script lista como WARNING las rutas con ratio
  \> 3 (delatan aristas OSM ausentes, grafo mal conectado o coordenadas erróneas — así se
  destapó el desplazamiento de coordenadas de Fase 0: Larouco→A Rúa daba 43,7 km y con la
  coordenada real da 7,8 km, rodeo 1,16). Actualmente todas las rutas tienen rodeo ≤ 2.
- **Limitación:** evacuación **estática** — todavía no considera el fuego (qué vías quedan
  cortadas), ni el tráfico ni la hora. Es el primer paso verificable, sin motor de fuego.

En el mapa, las rutas se dibujan en azul (fiable) → naranja → rojo (depende de pista), con
los destinos seguros marcados en azul oscuro; el panel muestra destino, distancia, tiempo,
redundancia y % de pista.

## Dos lentes del mapa (vulnerabilidad y evacuación NO se funden)

La interfaz tiene un **selector** que alterna entre dos visualizaciones independientes del
mismo mapa. Son cosas distintas y **no se combinan en un único número**:

- **Vulnerabilidad:** colorea por el Índice de Vulnerabilidad (amarillo→granate, YlOrRd).
  Muestra el anillo de edad real y el perímetro quemado 2025.
- **Evacuación:** colorea por la **dificultad de evacuación** (azul=fácil → gris →
  rojo=difícil, ColorBrewer RdBu, paleta distinta a propósito de la del IV) y dibuja las
  rutas. La dificultad (`lib/evacuacion.ts`) deriva
  **solo** de la capa de evacuación:
  `dificultad = 0.35·tiempo + 0.45·redundancia + 0.20·pista` (0–100, pesos provisionales),
  con `tiempo = min(100, tiempo_min/45·100)`, `redundancia` = 1 ruta → 100 (crítico), 2 → 40,
  3 → 15, ≥4 → 0, y `pista = min(100, %pista·2.5)`. La redundancia pesa más: una sola salida
  es el mayor riesgo. **No recalcula ni toca el IV.**

El **panel** de cada núcleo muestra **siempre las dos lecturas separadas**, en bloques
«Vulnerabilidad» y «Evacuación», para que se vea que un núcleo puede ser alto en una y
bajo en la otra (p. ej. **Vilardesilva**: IV 70 *alta* pero evacuación 29 *fácil*; en
cambio **Pradorramisquedo** es el peor en ambas: IV 73 y evacuación 53, con 54 minutos
hasta el destino seguro). La **leyenda** cambia según la lente activa.

## Desarrollo

```bash
npm run dev     # servidor de desarrollo (http://localhost:3000)
npm test        # tests unitarios (Vitest)
npm run lint    # linting
npm run build   # build de producción (sin red: fuentes locales y datos cacheados)
```

Regeneración de cada dataset (el build **no** llama a ninguna API; estos scripts se
ejecutan a mano y cachean en `data/`):

| Dataset | Comando | ¿Red? |
|---|---|---|
| `nucleos.json` (IV, confianza) | `node scripts/procesar-ige.mjs` | No (lee cachés) |
| `accesos_osm.json` | `node scripts/fetch-accesos-osm.mjs --extracto` | No (usa el extracto local) |
| — variante Overpass | `node scripts/fetch-accesos-osm.mjs --force` | Sí (Overpass) |
| `pendiente_dem.json` + `combustible_osm.json` | `node scripts/fetch-peligro.mjs --force` | Sí (opentopodata + Overpass) |
| `ndvi/ndmi_sentinel2.json` | `.venv/Scripts/python scripts/fetch-satelite.py` | Sí (Earth Engine; requiere `earthengine authenticate` una vez y proyecto Cloud con la API habilitada) |
| `evacuacion.json` + `rutas_evacuacion.geojson` | `python scripts/evacuacion_osm.py` | Solo la 1ª vez (descarga el extracto; luego usa `data/osm_valdeorras.json`) |
| `nucleos_afectacion_fisica.json` | `python scripts/afectacion_emsr837.py` | No (delineaciones EMS locales en `data/emsr837/`) |
| `sensibilidad_pesos.json` | `node scripts/sensibilidad-pesos.mjs` | No |

Tras regenerar cualquier caché, vuelve a ejecutar `node scripts/procesar-ige.mjs` para
recomponer `nucleos.json`, y `npm test` para validar la integridad. Los scripts Python
requieren `networkx` (evacuación) y `shapely` + `pyproj` (afectación); la re-medición de
satélite usa un **venv** con `earthengine-api` (`python -m venv .venv &&
.venv/Scripts/pip install earthengine-api`) — es una dependencia de re-medición que se
ejecuta a mano, no forma parte del build.

## Privacidad (RGPD)

La identidad nominal de personas vulnerables queda **fuera** del sistema. Solo se usan
indicadores agregados y no identificativos (proporción de mayores, hogares unipersonales
de edad avanzada, dispersión, distancia a servicios).

## Licencia y datos

- **Código:** licencia [MIT](LICENSE).
- **Datos derivados de OpenStreetMap** (accesos, red viaria de evacuación, cubierta de
  respaldo, coordenadas de núcleos): © colaboradores de OpenStreetMap, bajo
  [ODbL 1.0](https://www.openstreetmap.org/copyright).
- **Datos del IGE** (Nomenclátor 2025, Padrón 2022): reutilización según las
  [condiciones del Instituto Galego de Estatística](https://www.ige.gal/web/mostrar_paxina.jsp?paxina=001001004&idioma=es)
  (datos abiertos con cita de la fuente).
- **Copernicus** — imágenes **Sentinel-2** y delineaciones **EMS EMSR837**: uso libre con
  atribución según la [política de datos de Copernicus](https://www.copernicus.eu/en/access-data)
  y las [condiciones de Copernicus EMS](https://emergency.copernicus.eu/mapping/ems/cite-and-reuse-modified-copernicus-service-information).
- **EU-DEM 25 m**: producto de la Agencia Europea de Medio Ambiente (Copernicus Land),
  [reutilización libre con atribución](https://land.copernicus.eu/en/data-policy).

Ámbito del proyecto: Galicia.
