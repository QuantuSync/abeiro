# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON
# 
# # -*- coding: utf-8 -*-
"""
ABEIRO · Afectación histórica por incendios (GlobFire) para Ourense.

Cruza los núcleos activos de Ourense con los perímetros finales de incendio de
GlobFire (JRC/GWIS/GlobFire/v2/FinalPerimeters, derivados de MODIS), 2001-2021,
en Earth Engine. Por núcleo calcula:
  - afectado_hist       : ¿alguna vez dentro de un perímetro?
  - n_afectaciones      : nº de perímetros que lo cubren (incendios distintos)
  - afectado_borde_500m : ¿a <=500 m de algún perímetro?

Método: se rasteriza el nº de perímetros solapados por píxel (reduceToImage sum,
100 m). Se muestrea en el punto (n_afectaciones / afectado) y el máximo en un
buffer de 500 m (borde). Salida: data/afectacion_globfire_ourense.json.

LIMITACIÓN (declarada en README y metadata): GlobFire deriva de MODIS (~500 m):
capta bien los incendios GRANDES (los relevantes para la vulnerabilidad de
núcleos), pero suaviza bordes y omite los pequeños. Es un PROXY del historial de
grandes incendios, no el registro oficial de la Xunta.

Uso:  .venv/Scripts/python scripts/fetch-globfire-ourense.py
"""
import json, os, sys, time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import ee

PROYECTO = "abeiro-498316"
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "afectacion_globfire_ourense.json")
NUCLEO_M = 250   # radio que representa la extensión de la aldea (afectado directo)
BORDE_M = 500    # radio para "borde" (el frente pasó cerca)
MAX_AREA_KM2 = 1000  # perímetros mayores se descartan como geometrías degeneradas
LOTE = 100
ANIO_INI, ANIO_FIN = "2001-01-01", "2021-12-31"

def main():
    ee.Initialize(project=PROYECTO)
    bbox = ee.Geometry.Rectangle([-8.37, 41.80, -6.73, 42.58])
    ini = ee.Date(ANIO_INI).millis(); fin = ee.Date(ANIO_FIN).millis()
    perim0 = (ee.FeatureCollection("JRC/GWIS/GlobFire/v2/FinalPerimeters")
              .filterBounds(bbox)
              .filter(ee.Filter.gte("IDate", ini)).filter(ee.Filter.lte("IDate", fin)))
    # GlobFire trae ~43 perímetros con geometría DEGENERADA (área infinita) que
    # "contienen" cualquier punto de la provincia y contaminaban el cruce (650/650
    # afectados). Se descartan por área. Para no recalcular el área de los ~1600
    # perímetros en cada uno de los 650 núcleos, se resuelve la lista de índices
    # VÁLIDOS UNA sola vez (getInfo) y luego se filtra por esa lista (barato).
    n_bruto = perim0.size().getInfo()
    con_area = perim0.map(lambda f: f.set("km2", ee.Number(f.geometry().area(1000)).divide(1e6)))
    idx_val = con_area.filter(ee.Filter.And(ee.Filter.gt("km2", 0),
                                            ee.Filter.lt("km2", MAX_AREA_KM2))) \
                      .aggregate_array("system:index").getInfo()
    perim = perim0.filter(ee.Filter.inList("system:index", idx_val))
    n_perim = len(idx_val)
    print(f"Perímetros GlobFire 2001-2021 en Ourense: {n_bruto} brutos, {n_perim} válidos "
          f"(descartados {n_bruto - n_perim} degenerados)")

    fc = json.load(open(os.path.join(DATA, "nucleos_ourense.json"), encoding="utf-8"))
    activos = [f for f in fc["features"] if f["properties"]["activo"]]
    print(f"Núcleos activos a cruzar: {len(activos)}")

    hecho = {}
    if os.path.exists(SALIDA):
        hecho = json.load(open(SALIDA, encoding="utf-8")).get("nucleos", {})
        print(f"  caché previa: {len(hecho)}")
    pend = [f for f in activos if f["properties"]["id"] not in hecho]

    # Conteo espacial por núcleo. Un núcleo de población tiene extensión, así que
    # se representa con un buffer de NUCLEO_M (afectado directo) y otro de BORDE_M
    # (el frente pasó cerca). filterBounds(geom) filtra por intersección real.
    def marca(feat):
        g = feat.geometry()
        dentro = perim.filterBounds(g.buffer(NUCLEO_M)).size()
        cerca = perim.filterBounds(g.buffer(BORDE_M)).size()
        return feat.set("n", dentro).set("nb", cerca)

    for i in range(0, len(pend), LOTE):
        lote = pend[i:i + LOTE]
        feats = [ee.Feature(ee.Geometry.Point(f["geometry"]["coordinates"]), {"id": f["properties"]["id"]})
                 for f in lote]
        col = ee.FeatureCollection(feats).map(marca)
        for intento in range(4):
            try:
                res = col.getInfo()
                break
            except Exception as e:
                print(f"    lote {i//LOTE}: reintento {intento+1} ({str(e)[:70]})")
                time.sleep(10 * (intento + 1))
        else:
            print("    FALLA; guardo lo hecho y salgo"); break
        for ft in res["features"]:
            p = ft["properties"]; nid = p["id"]
            n = int(p.get("n") or 0); nb = int(p.get("nb") or 0)
            hecho[nid] = {
                "afectado_hist": n > 0,
                "n_afectaciones": n,
                "afectado_borde_500m": nb > 0,
            }
        json.dump({"metadata": {
            "fuente": "GlobFire JRC/GWIS/GlobFire/v2/FinalPerimeters (Earth Engine), "
                      "perímetros finales de incendio derivados de MODIS, 2001-2021.",
            "n_perimetros_validos": n_perim, "n_perimetros_brutos": n_bruto,
            "nucleo_m": NUCLEO_M, "borde_m": BORDE_M, "max_area_km2": MAX_AREA_KM2,
            "nota_degenerados": f"Descartados {n_bruto - n_perim} perímetros con geometría "
                                "degenerada (área infinita) que contenían cualquier punto.",
            "limitacion": "MODIS ~500 m: capta grandes incendios, suaviza bordes y omite "
                          "pequeños. PROXY del historial de grandes incendios, no el registro "
                          "oficial de la Xunta.",
        }, "nucleos": hecho}, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  lote {i//LOTE+1}/{-(-len(pend)//LOTE)}: {len(hecho)}/{len(activos)}")

    af = sum(1 for v in hecho.values() if v["afectado_hist"])
    bo = sum(1 for v in hecho.values() if v["afectado_borde_500m"])
    print(f"\nAfectados hist: {af}/{len(hecho)} | borde 500m: {bo}/{len(hecho)}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
