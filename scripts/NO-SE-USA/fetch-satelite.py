# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON
# 
# # -*- coding: utf-8 -*-
"""
ABEIRO · Re-medición Sentinel-2 (NDVI + NDMI) vía Google Earth Engine.

Mide, para cada uno de los 12 núcleos (coordenadas REALES de
data/nucleos.base.json), el NDVI y el NDMI medios en un buffer de 1 km, y
sobrescribe las cachés data/ndvi_sentinel2.json y data/ndmi_sentinel2.json en
el MISMO formato que consume scripts/procesar-ige.mjs.

Decisiones metodológicas (no cambiar sin documentar):
  - Período PRE-INCENDIO: 2025-06-01 a 2025-07-31. El incendio grande fue en
    agosto de 2025; medir después contaminaría el NDVI de las zonas quemadas
    con valores artificialmente bajos justo donde más combustible había.
  - Buffer de 1000 m alrededor del centro del núcleo (igual que la caché
    anterior).
  - Colección COPERNICUS/S2_SR_HARMONIZED, CLOUDY_PIXEL_PERCENTAGE < 20,
    máscara por banda SCL (3 sombra de nube, 8 nube prob. media, 9 nube prob.
    alta, 10 cirros, 11 nieve) y composición por MEDIANA temporal.

Requisitos (fuera del build; se ejecuta a mano):
  - venv con earthengine-api:  python -m venv .venv
                               .venv/Scripts/pip install earthengine-api
  - Autenticación de Earth Engine (una vez):  .venv/Scripts/earthengine authenticate
  - Proyecto Cloud con la API habilitada y registrado en Earth Engine.

Uso:  .venv/Scripts/python scripts/fetch-satelite.py
"""
import datetime
import json
import os
import sys

PROYECTO = "abeiro-498316"
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
BUFFER_M = 1000
FECHA_INI = "2025-06-01"
FECHA_FIN = "2025-07-31"
MAX_NUBES_PCT = 20
# Clases SCL descartadas: 3 sombra de nube, 8 nube prob. media, 9 nube prob.
# alta, 10 cirros, 11 nieve/hielo.
SCL_DESCARTADAS = [3, 8, 9, 10, 11]
DECIMALES = 3  # mismo redondeo que la caché vigente

try:
    import ee
except ImportError:
    sys.exit("ERROR: falta earthengine-api. Instala con:\n"
             "  python -m venv .venv && .venv/Scripts/pip install earthengine-api")


def inicializar():
    """Inicializa Earth Engine; si falta autenticación, explica el paso manual."""
    try:
        ee.Initialize(project=PROYECTO)
    except Exception as e:
        print("ERROR al inicializar Earth Engine:", e)
        print()
        print("Pasos manuales necesarios (una sola vez):")
        print("  1. Autentícate:   .venv/Scripts/earthengine authenticate")
        print(f"  2. Comprueba que el proyecto Cloud '{PROYECTO}' tiene la API de")
        print("     Earth Engine habilitada y está registrado en Earth Engine")
        print("     (https://code.earthengine.google.com/register).")
        print("Después vuelve a ejecutar este script.")
        sys.exit(1)


def mascara_scl(img):
    """Enmascara nubes/sombras/cirros/nieve pixel a pixel con la banda SCL."""
    scl = img.select("SCL")
    mask = scl.neq(SCL_DESCARTADAS[0])
    for clase in SCL_DESCARTADAS[1:]:
        mask = mask.And(scl.neq(clase))
    return img.updateMask(mask)


def medir_nucleo(lon, lat):
    """Devuelve (n_imagenes, ndvi, ndmi) para el buffer del núcleo; None si no hay dato."""
    zona = ee.Geometry.Point([lon, lat]).buffer(BUFFER_M)
    coleccion = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(zona)
        .filterDate(FECHA_INI, FECHA_FIN)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_NUBES_PCT))
        .map(mascara_scl)
    )
    n = coleccion.size().getInfo()
    if n == 0:
        return 0, None, None
    mediana = coleccion.median()
    ndvi_img = mediana.normalizedDifference(["B8", "B4"]).rename("ndvi")
    ndmi_img = mediana.normalizedDifference(["B8", "B11"]).rename("ndmi")
    stats = (
        ndvi_img.addBands(ndmi_img)
        .reduceRegion(reducer=ee.Reducer.mean(), geometry=zona, scale=10, bestEffort=True)
        .getInfo()
    )
    ndvi = stats.get("ndvi")
    ndmi = stats.get("ndmi")
    return (
        n,
        round(ndvi, DECIMALES) if ndvi is not None else None,
        round(ndmi, DECIMALES) if ndmi is not None else None,
    )


def main():
    inicializar()

    base = json.load(open(os.path.join(DATA, "nucleos.base.json"), encoding="utf-8"))
    hoy = datetime.date.today().isoformat()
    filtro_txt = (f"CLOUDY_PIXEL_PERCENTAGE < {MAX_NUBES_PCT} + máscara SCL por píxel "
                  f"(clases descartadas: {SCL_DESCARTADAS}); composición por mediana temporal.")

    ndvi_out, ndmi_out = {}, {}
    sin_satelite = []
    print(f"Período {FECHA_INI} a {FECHA_FIN} (pre-incendio) | buffer {BUFFER_M} m | "
          f"nubes < {MAX_NUBES_PCT}% + SCL\n")
    print(f"{'núcleo':<26} imgs   NDVI    NDMI")
    for feat in base["features"]:
        p = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"]
        try:
            n, ndvi, ndmi = medir_nucleo(lon, lat)
        except Exception as e:
            print(f"{p['nombre']:<26} ERROR: {e}")
            sin_satelite.append((p["nombre"], f"error Earth Engine: {e}"))
            n, ndvi, ndmi = 0, None, None
        ndvi_out[p["id"]] = {"nombre": p["nombre"], "ndvi": ndvi}
        ndmi_out[p["id"]] = {"nombre": p["nombre"], "ndmi": ndmi}
        if ndvi is None or ndmi is None:
            if not sin_satelite or sin_satelite[-1][0] != p["nombre"]:
                motivo = "sin imágenes en el período" if n == 0 else "todos los píxeles enmascarados"
                sin_satelite.append((p["nombre"], motivo))
        print(f"{p['nombre']:<26} {n:>4}  {str(ndvi):>6}  {str(ndmi):>6}")

    nota_coords = ("Re-medido sobre las coordenadas CORREGIDAS de los núcleos (nodos place "
                   "de OSM; ver metadata.coordenadas_nota de nucleos.json), buffer de "
                   f"{BUFFER_M} m. Período PRE-incendio para no contaminar la medición con "
                   "las zonas quemadas en agosto de 2025.")

    json.dump({
        "metadata": {
            "indicador": "NDVI medio (Normalized Difference Vegetation Index, (B8-B4)/(B8+B4)) "
                         "en un buffer de 1 km alrededor del centro de cada núcleo. NDVI alto = "
                         "vegetación densa/vigorosa = más biomasa = más material combustible.",
            "fuente": "Sentinel-2 SR, COPERNICUS/S2_SR_HARMONIZED, vía Google Earth Engine.",
            "periodo": f"pre-incendio: {FECHA_INI} a {FECHA_FIN}",
            "fecha_integracion": hoy,
            "filtro_nubes": filtro_txt,
            "nota": "El NDVI mide directamente la CANTIDAD de vegetación (biomasa). Sustituye a "
                    "la etiqueta de cubierta OSM como medida de 'cuánta vegetación hay' (usarlos "
                    "juntos sería doble conteo). La cubierta OSM queda solo como respaldo donde "
                    "falte satélite. " + nota_coords,
        },
        "nucleos": ndvi_out,
    }, open(os.path.join(DATA, "ndvi_sentinel2.json"), "w", encoding="utf-8"),
        ensure_ascii=False, indent=2)

    json.dump({
        "metadata": {
            "indicador": "NDMI medio (Normalized Difference Moisture Index, (B8-B11)/(B8+B11)) "
                         "en un buffer de 1 km alrededor del centro de cada núcleo. NDMI bajo = "
                         "vegetación más seca = más inflamable.",
            "fuente": "Sentinel-2 SR, COPERNICUS/S2_SR_HARMONIZED, vía Google Earth Engine.",
            "periodo": f"pre-incendio: {FECHA_INI} a {FECHA_FIN}",
            "fecha_integracion": hoy,
            "filtro_nubes": filtro_txt,
            "nota_honestidad": "El NDMI mezcla CANTIDAD y HUMEDAD de vegetación: un NDMI bajo en "
                               "zona urbana (p. ej. A Rúa) indica poca vegetación, no monte "
                               "reseco; igualmente reduce el combustible vegetal. No es el mapa "
                               "de combustible plenamente calibrado (fotoguía + LiDAR), pero "
                               "mejora sustancialmente la cubierta OSM sola. " + nota_coords,
        },
        "nucleos": ndmi_out,
    }, open(os.path.join(DATA, "ndmi_sentinel2.json"), "w", encoding="utf-8"),
        ensure_ascii=False, indent=2)

    con_dato = sum(1 for v in ndvi_out.values() if v["ndvi"] is not None)
    print(f"\nCon satélite: {con_dato}/12 | sin satélite: {12 - con_dato}/12")
    for nombre, motivo in sin_satelite:
        print(f"  SIN SATÉLITE: {nombre} ({motivo})")
    print("\nEscrito data/ndvi_sentinel2.json y data/ndmi_sentinel2.json")
    print("Siguiente paso: node scripts/procesar-ige.mjs (recompone nucleos.json)")


if __name__ == "__main__":
    main()
