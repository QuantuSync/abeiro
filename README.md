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
  - **Caso Petín (verificado):** tiene el NDVI/NDMI más bajos (0.357 / −0.031), por debajo
    de los urbanos. Se comprobó la composición de cubierta OSM de su buffer: **61% forest,
    35% residencial** (el propio Petín), 4% viñedo; **0% agua/río Sil, 0% roca**, y A Rúa
    (a 1,75 km) queda fuera. El polígono `forest` de OSM etiqueta laderas de **solana con
    monte ralo y seco** en verano; el satélite (NDVI bajo + NDMI negativo = vegetación seca)
    lo mide mejor que la etiqueta OSM. Dato **correcto**: es justo el caso donde el satélite
    corrige a la cubierta OSM (`metadata.nota_petin`).
  - **No es** el mapa de combustible calibrado (fotoguía + LiDAR), que es una fase aparte;
    pero ahora se basa en **medición directa de satélite** (cantidad y humedad de vegetación),
    no en etiquetas de cubierta.
- `peligro_biofisico = 0.40·score_pendiente + 0.60·combustibilidad` (pesos provisionales).
  Con satélite, los 12 núcleos tienen combustible real (incluido Vilamartín, que no tenía
  cubierta OSM).

> **Limitación para el escalado** (`metadata.nota_escalado`): el límite inferior del rango
> fijo NDMI (**−0.05**) queda cerca del mínimo observado (Petín −0.031). Al ampliar la
> muestra a más comarca —con zonas más secas o quemados antiguos— podría quedarse corto y
> saturar por recorte; se documenta como limitación conocida, **no se reajusta ahora**
> (reajustarlo a la muestra rompería la comparabilidad de la escala, ver Tarea 2 abajo).

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

### Calibración (exploratoria) contra EMSR837

`scripts/calibracion-emsr837.mjs` contrasta el poder discriminante del IV y de sus
componentes frente a la afectación real, con el **AUC** (Mann-Whitney) de cada predictor y
su **intervalo de confianza por bootstrap** (2000 remuestreos), contra dos variables de
resultado: `afect_fisica` (dentro del perímetro) y `afect_fisica || borde_500m` (dentro o
a ≤ 500 m). Salida: `data/calibracion_emsr837.json`.

> ⚠️ **Resultado EXPLORATORIO, no validación concluyente.** Con **n = 12** los AUC son
> muy inestables y los IC anchísimos (cruzan 0.5 de lado a lado). Con `afect_fisica` solo
> hay **1 núcleo dentro del perímetro** (Freixido), así que ese AUC es casi un caso
> degenerado. Nada de leer un AUC puntual como robusto.

**Distinción conceptual crítica:** el IV mide **vulnerabilidad ante un incendio** (quién
sufriría si ocurre), **no probabilidad de ignición** ni dónde empieza el fuego. Que un
núcleo caiga dentro del perímetro de **un** incendio valida sobre todo la **exposición /
peligro biofísico**, no la **vulnerabilidad social** (un urbano afectado y una aldea
envejecida afectada cuentan igual como "afectado"). Los resultados lo confirman:

| Variable de resultado | Mejor predictor | AUC (IC95 bootstrap) | Lectura |
|---|---|---|---|
| `afect_fisica` (1 dentro) | Peligro biofísico | 0.86 [0.65, 1.00] | Peligro > IV ≈ social > capacidad; **coherente con la hipótesis** (la exposición manda), pero con 1 positivo no es concluyente. |
| `afect ∨ borde ≤500 m` (6/6) | todos ≈ azar | 0.38–0.53, IC ~[0.05, 0.9] | **Ningún predictor discrimina.** El borde del frente fue cuestión de **geografía del incendio** (por dónde entró el 16-08), no del combustible del núcleo: Pradorramisquedo tiene el mayor peligro (65) y quedó a 5,5 km sin arder. |

- **Lo que queda (débilmente) respaldado:** el **peligro biofísico** discrimina la
  afectación *física* mejor que el resto — lo esperable, porque es la componente de
  exposición.
- **Lo que NO valida este incendio:** la **vulnerabilidad social**. Un solo incendio no es
  la prueba adecuada para la parte social; necesita otra clase de evidencia
  (evacuaciones/confinamientos reales, varios eventos).
- **Diagnóstico de pesos (no adoptado):** si se optimizaran los pesos para maximizar el AUC
  de *este* incendio, el óptimo se pega a `social = 0.60` (el máximo de la rejilla), lo que
  **no tiene sentido** para predecir afectación física — señal clara de **sobreajuste** a
  n = 12. Los pesos del índice **siguen siendo los provisionales declarados**; la
  calibración informa, no decide.

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
| `calibracion_emsr837.json` | `node scripts/calibracion-emsr837.mjs` | No |

Tras regenerar cualquier caché, vuelve a ejecutar `node scripts/procesar-ige.mjs` para
recomponer `nucleos.json`, y `npm test` para validar la integridad. Los scripts Python
requieren `networkx` (evacuación) y `shapely` + `pyproj` (afectación); la re-medición de
satélite usa un **venv** con `earthengine-api` (`python -m venv .venv &&
.venv/Scripts/pip install earthengine-api`) — es una dependencia de re-medición que se
ejecuta a mano, no forma parte del build.

## Escalado a Ourense (calibración a escala)

El demostrador se validó con 12 núcleos de Valdeorras. Para convertir el índice de
"demostrador honesto" en "índice contrastado contra el historial real de incendios" se está
escalando a la **provincia de Ourense** (piloto de Galicia). Este hito trabaja **solo la
lente de vulnerabilidad** (la evacuación, cara de rutear a escala, queda para un hito
posterior). La arquitectura generaliza el pipeline de 12 núcleos fijos a una lista dinámica.

### Fase 1 — Lista maestra de núcleos (hecho)

`data/nucleos_ourense.json` es la lista maestra de **entidades singulares de población de
Ourense**, construida cruzando tres fuentes abiertas (cada dato con su procedencia):

- **Coordenadas + nombre + tipo:** Nomenclátor Geográfico Básico de España (**NGBE/IGN**),
  vía WFS INSPIRE `gn:NamedPlace` (licencia CC-BY 4.0 IGN). El NGBE da 3.705 "Entidad
  singular" en Ourense (coincide con el dato oficial del INE, ~3.700).
  Caché: `data/ngbe_ourense_raw.json` (`scripts/fetch-nomenclator-ourense.py`).
- **Población + parroquia:** **Nomenclátor IGE 2025** (`data/Fichero1.txt`, toda la
  provincia 32), por entidad singular.
- **Concello:** el NGBE no trae municipio, así que se asigna por *point-in-polygon* con los
  **límites municipales de OpenStreetMap** (`admin_level=8`, `ref:ine`=codmun; ODbL).
  Caché: `data/limites_concellos_ourense.geojson` (`scripts/fetch-limites-concellos.py`).

`scripts/construir-nucleos-ourense.py` hace el cruce por `(concello, nombre normalizado)`:
**3.376 entidades casadas** de 3.705 (91 %; 327 sin casar por grafías divergentes
gallego/castellano, reportadas), cubriendo **los 92 concellos**. Marca `activo` a las de
**≥ 50 habitantes → 650 núcleos**, que es el subconjunto de trabajo del primer barrido de
calibración. Reparto de población (entidades casadas): 141 despobladas, 2.585 de 1–49 hab,
353 de 50–99, 168 de 100–199, 96 de 200–499, 20 de 500–999, 13 de ≥1000.

> **Rescate de núcleos ≥50 hab por grafía divergente:** el cruce exacto por
> `(concello, nombre normalizado)` dejaba sin casar 39 entidades de ≥50 hab por divergencias
> gallego/castellano, artículos y acentos. `construir-nucleos-ourense.py` añade
> **emparejamiento aproximado dentro del concello** (Levenshtein normalizado ≥0,80 +
> contención de tokens para capitales con nombre truncado, p. ej. *Vilariño* ⊂ *Vilariño de
> Conso*). Resultado: **36 de 39 rescatados automáticamente** (incluidas las capitales
> Vilariño de Conso, Ríos y Quintela de Leirado, y urbanizaciones como Monterrei). Quedan
> **4 sin resolver** —Fonsillón (331 hab), Ponte Barxas (118), Lavandeira (82), Cimadevila
> (56)— que el NGBE no recoge como entidad singular; se **listan explícitamente** para
> revisión manual (no se fuerzan). El total activo sube de **650 a 683 núcleos**.
>
> **El umbral de ≥50 hab es de conveniencia computacional, no un criterio de vulnerabilidad.**
> La propia tesis social del índice sostiene que las aldeas <50 hab, envejecidas y aisladas,
> están entre las **más** vulnerables; se excluyen del primer barrido por coste (81 % de las
> entidades), no porque importen menos. Es deuda a saldar al escalar a producto.

### Fase 2 — Componentes del IV en lote (650 núcleos, hecho)

- **Peligro biofísico** (`scripts/fetch-peligro-ourense.py`): una sola pasada de Earth
  Engine mide NDVI/NDMI (Sentinel-2 pre-incendio, buffer 1 km) y **pendiente** (SRTM 30 m,
  `ee.Terrain.slope`). El MDT del CNIG es teselado por hojas MTN desde un portal SPA (no
  automatizable sin fricción) y opentopodata no escala a 650×buffer; SRTM en EE es el
  respaldo escalable de elevación (misma pasada), documentado como tal. 650/650 medidos.
- **Sensibilidad social**: población del IGE (lista maestra) + **% de mayores de 65 de los
  92 concellos** desde el Padrón del **INE** (tabla 33866 de Ourense;
  `scripts/fetch-padron-ourense.py`). A escala no hay hogares unipersonales ni dispersión por
  núcleo (en el piloto eran estimaciones de Fase 0): `scoreSocial` renormaliza sus subpesos a
  las variables presentes (mayores_65 y población, ambas reales).
- **Capacidad de respuesta** (`scripts/fetch-vias-ourense.py` + `fetch-accesos-ourense.py`):
  vías de salida y distancia a servicios desde el **extracto viario OSM de Ourense** en local
  (indexado espacial por rejilla), sin llamadas Overpass punto-a-punto.
- `scripts/procesar-ourense.mjs` recompone el IV con `lib/indice.mjs` y los **pesos
  provisionales vigentes** (no se tocan): IV 18–81 (mediana 61), confianza 0,90 uniforme.
  (LiDAR PNOA para mejor combustible queda como mejora futura, no bloqueante.)

### Fase 3 — Afectación histórica (GlobFire, hecho)

`scripts/fetch-globfire-ourense.py` cruza los 650 núcleos con los perímetros finales de
**GlobFire** (`JRC/GWIS/GlobFire/v2/FinalPerimeters`, MODIS, 2001–2021) en Earth Engine.
De los 1.641 perímetros del ámbito se descartaron **43 con geometría degenerada** (área
infinita) que contenían cualquier punto y daban 650/650 afectados espurios; con los 1.598
válidos y buffers por núcleo (250 m afectado, 500 m borde): **100/650 afectados**, 162 en
borde, `n_afectaciones` 0–4. Salida: `data/afectacion_globfire_ourense.json`.

> **Limitación (declarada en metadata):** GlobFire deriva de MODIS (~500 m): capta bien los
> incendios **grandes** (los relevantes para la vulnerabilidad de núcleos), pero suaviza
> bordes y omite los pequeños. Es un **proxy** del historial de grandes incendios, no el
> registro oficial de la Xunta.

### Fase 4 — Calibración con muestra real (n=650, hecho)

`scripts/calibracion-globfire-ourense.mjs` contrasta el IV y sus componentes contra la
afectación histórica. Con **n=650 los IC bootstrap son estrechos** (±0,05): ese es el salto
de valor frente al piloto (n=12). AUC (Mann-Whitney) contra *afectado* (buffer 250 m):

| Predictor | AUC (IC95) |
|---|---|
| **Capacidad de respuesta** (100−cap) | **0,73 [0,68–0,78]** |
| IV (índice completo) | 0,68 [0,63–0,73] |
| Sensibilidad social | 0,64 [0,58–0,69] |
| Peligro biofísico | 0,62 [0,56–0,68] |

**Interpretación honesta (y contraintuitiva):**
- Ningún componente es un predictor *fuerte* (todos 0,6–0,73); el IV combinado queda en 0,68.
- El **mejor predictor es la capacidad de respuesta invertida** (pocas vías de salida), no el
  peligro biofísico —que resulta el **más débil**—. No es que la capacidad *cause* el
  incendio: es un **confound espacial** (los núcleos aislados, con pocas salidas, están en el
  monte, que es donde arde). El peligro biofísico discrimina peor de lo esperado, en parte
  porque el NDVI de 2025 tiene poca varianza entre núcleos (casi todo Ourense es forestal) y
  el buffer de 1 km mezcla la aldea con su entorno.
- **La hipótesis peligro > social no se cumplió**: con GlobFire (grandes incendios MODIS) la
  señal del peligro no se reforzó. La distinción conceptual sigue en pie: el incendio valida
  **exposición/localización**, no la **vulnerabilidad social** (que un solo tipo de evento no
  puede validar).
- **Recalibración (recomendación, NO adoptada):** la validación cruzada 5-fold es estable
  (gap train−validación ≈ 0, sin sobreajuste con n=650) y sugiere pesos
  `{peligro 0,25 · social 0,15 · capacidad 0,60}`, que suben el AUC de 0,68 a 0,72. **No se
  adoptan**: optimizarían la predicción de *dónde arde* (ignición/exposición y su confound
  espacial), no de *quién es vulnerable si arde*, que es el propósito del IV. Los pesos siguen
  siendo los **provisionales declarados**; la decisión queda para revisión humana.

Salida: `data/calibracion_globfire_ourense.json`.

### Fase 5 — Mapa a escala (mínimo viable, hecho)

La ruta **`/ourense`** pinta los 650 núcleos con **clustering de MapLibre**
(`components/MapaOurense.tsx`): a zoom provincial se agrupan (no se bloquea el navegador) y
se despliegan al acercarse, coloreados por IV (paleta accesible YlOrRd) con borde reforzado
en los que tienen historial de incendios. Datos en `public/nucleos_ourense.geojson`
(`scripts/exportar-geojson-ourense.mjs`). La demo original de Valdeorras (`/`) queda intacta.

> Queda pendiente (siguiente hito): **evacuación a escala** (rutas para miles de núcleos),
> **LiDAR PNOA** para el combustible, **perímetros oficiales de la Xunta** (frente a la
> aproximación GlobFire) y el **pulido del mapa** (drill-down por concello, panel completo).

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

Fuentes del escalado a Ourense:

- **NGBE** — Nomenclátor Geográfico Básico de España, **IGN** (CC-BY 4.0), vía WFS INSPIRE.
- **Padrón** por edad y municipio: **INE** (Estadística del Padrón Continuo), reutilización
  libre citando la fuente.
- **SRTM 30 m**: NASA/USGS, dominio público, vía Earth Engine (pendiente a escala).
- **GlobFire**: JRC/GWIS, Comisión Europea (perímetros de incendio MODIS 2001–2021), vía
  Earth Engine.

Ámbito del proyecto: Galicia.
