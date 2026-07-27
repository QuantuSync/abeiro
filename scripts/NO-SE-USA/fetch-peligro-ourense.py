# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON
# 
# # -*- coding: utf-8 -*-
"""
ABEIRO · Peligro biofísico en lote para Ourense (Earth Engine).

Una sola pasada de Earth Engine mide, para los núcleos activos (>=50 hab) de
data/nucleos_ourense.json, en un buffer de 1 km:
  - NDVI y NDMI medios (Sentinel-2 SR harmonizado, verano/pre-incendio 2025,
    nubes <20% + máscara SCL, mediana temporal) — igual criterio que el piloto.
  - Pendiente media (grados) de SRTM 30 m (USGS/SRTMGL1_003) vía ee.Terrain.slope.

Sobre la fuente de PENDIENTE: el MDT del CNIG (MDT05/MDT25) se descarga teselado
por hojas MTN desde un portal SPA, no automatizable sin fricción; y opentopodata
(EU-DEM, usado en el piloto punto-a-punto) no escala a 650×buffer sin rate-limit.
Se usa SRTM 30 m en Earth Engine como respaldo escalable (misma pasada que el
satélite), documentado como tal. Resolución comparable al EU-DEM 25 m del piloto.

Cachea el progreso de forma incremental para no rehacer lotes ya medidos.

Uso:  .venv/Scripts/python scripts/fetch-peligro-ourense.py
"""
import json, os, sys, time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import ee

PROYECTO = "abeiro-498316"
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "componentes_ee_ourense.json")
BUFFER_M = 1000
FECHA_INI, FECHA_FIN = "2025-06-01", "2025-07-31"
MAX_NUBES = 20
SCL_DESCARTADAS = [3, 8, 9, 10, 11]
LOTE = 50
BBOX = ee.Geometry.Rectangle([-8.37, 41.80, -6.73, 42.58]) if False else None  # se crea tras Initialize

def mascara_scl(img):
    scl = img.select("SCL")
    m = scl.neq(SCL_DESCARTADAS[0])
    for c in SCL_DESCARTADAS[1:]:
        m = m.And(scl.neq(c))
    return img.updateMask(m)

def main():
    ee.Initialize(project=PROYECTO)
    bbox = ee.Geometry.Rectangle([-8.37, 41.80, -6.73, 42.58])

    fc = json.load(open(os.path.join(DATA, "nucleos_ourense.json"), encoding="utf-8"))
    activos = [f for f in fc["features"] if f["properties"]["activo"]]
    print(f"Núcleos activos a medir: {len(activos)}")

    # Imagen con NDVI, NDMI (Sentinel-2 mediana enmascarada) y pendiente (SRTM).
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterBounds(bbox).filterDate(FECHA_INI, FECHA_FIN)
          .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_NUBES)).map(mascara_scl).median())
    ndvi = s2.normalizedDifference(["B8", "B4"]).rename("ndvi")
    ndmi = s2.normalizedDifference(["B8", "B11"]).rename("ndmi")
    slope = ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).rename("slope")
    img = ndvi.addBands(ndmi).addBands(slope)

    # Caché incremental.
    hecho = {}
    if os.path.exists(SALIDA):
        hecho = json.load(open(SALIDA, encoding="utf-8")).get("nucleos", {})
        print(f"  caché previa: {len(hecho)} núcleos ya medidos")

    pendientes = [f for f in activos if f["properties"]["id"] not in hecho]
    print(f"  por medir: {len(pendientes)}")

    for i in range(0, len(pendientes), LOTE):
        lote = pendientes[i:i + LOTE]
        feats = [ee.Feature(ee.Geometry.Point(f["geometry"]["coordinates"]).buffer(BUFFER_M),
                            {"id": f["properties"]["id"]}) for f in lote]
        col = ee.FeatureCollection(feats)
        for intento in range(4):
            try:
                res = img.reduceRegions(col, ee.Reducer.mean(), scale=10, tileScale=4).getInfo()
                break
            except Exception as e:
                print(f"    lote {i//LOTE}: reintento {intento+1} ({str(e)[:80]})")
                time.sleep(10 * (intento + 1))
        else:
            print(f"    lote {i//LOTE}: FALLA tras reintentos; se guarda lo hecho y se sale")
            break
        for ft in res["features"]:
            p = ft["properties"]
            hecho[p["id"]] = {
                "ndvi": round(p["ndvi"], 3) if p.get("ndvi") is not None else None,
                "ndmi": round(p["ndmi"], 3) if p.get("ndmi") is not None else None,
                "pendiente_grados": round(p["slope"], 1) if p.get("slope") is not None else None,
            }
        json.dump({"metadata": {
            "fuente_satelite": "Sentinel-2 SR COPERNICUS/S2_SR_HARMONIZED (EE), "
                               f"{FECHA_INI}..{FECHA_FIN}, nubes<{MAX_NUBES}% + SCL, mediana; buffer {BUFFER_M} m.",
            "fuente_pendiente": "SRTM 30 m (USGS/SRTMGL1_003) vía ee.Terrain.slope, media en el buffer. "
                                "Respaldo escalable: el MDT-CNIG teselado no era automatizable sin fricción.",
            "buffer_m": BUFFER_M, "n": len(hecho),
        }, "nucleos": hecho}, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  lote {i//LOTE+1}/{-(-len(pendientes)//LOTE)}: {len(hecho)}/{len(activos)} medidos")

    con = sum(1 for v in hecho.values() if v["ndvi"] is not None)
    print(f"\nMedidos: {len(hecho)}/{len(activos)} | con NDVI válido: {con}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
