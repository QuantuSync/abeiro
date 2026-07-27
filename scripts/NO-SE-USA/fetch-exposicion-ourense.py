# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON

# -*- coding: utf-8 -*-
"""
ABEIRO · Covariable de EXPOSICIÓN / ruralidad del paisaje por núcleo (Ourense).

Para medir el confound espacial de la calibración (la capacidad de respuesta
predice la afectación por incendios mejor que el peligro, se sospecha que por
correlación con "estar en el monte", no con vulnerabilidad), se define una
covariable de exposición del paisaje, INDEPENDIENTE de los componentes del IV:

  frac_monte = fracción de árbol + matorral (clases 10 y 20 de ESA WorldCover
               2021, 10 m) en el buffer de 1 km del núcleo.

Es "monte real" (combustible del paisaje), no derivada de las vías ni del IV.
Se mide en una pasada de Earth Engine. Salida: data/exposicion_ourense.json.

Nota: WorldCover 2021 es el estado reciente del paisaje; el monte gallego es
estable en décadas, así que sirve como proxy de la exposición estructural frente
al historial de incendios 2001-2021. Uso:
  .venv/Scripts/python scripts/fetch-exposicion-ourense.py
"""
import json, os, sys, time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import ee

PROYECTO = "abeiro-498316"
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "exposicion_ourense.json")
BUFFER_M = 1000
LOTE = 100

def main():
    ee.Initialize(project=PROYECTO)
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    monte = wc.eq(10).Or(wc.eq(20)).rename("monte")  # árbol o matorral

    fc = json.load(open(os.path.join(DATA, "nucleos_ourense.json"), encoding="utf-8"))
    activos = [f for f in fc["features"] if f["properties"]["activo"]]
    print(f"Núcleos activos: {len(activos)}")

    hecho = {}
    if os.path.exists(SALIDA):
        hecho = json.load(open(SALIDA, encoding="utf-8")).get("nucleos", {})
    pend = [f for f in activos if f["properties"]["id"] not in hecho]
    print(f"  por medir: {len(pend)}")

    for i in range(0, len(pend), LOTE):
        lote = pend[i:i + LOTE]
        feats = [ee.Feature(ee.Geometry.Point(f["geometry"]["coordinates"]).buffer(BUFFER_M),
                            {"id": f["properties"]["id"]}) for f in lote]
        col = ee.FeatureCollection(feats)
        for intento in range(4):
            try:
                res = monte.reduceRegions(col, ee.Reducer.mean(), scale=10, tileScale=4).getInfo()
                break
            except Exception as e:
                print(f"    lote {i//LOTE}: reintento {intento+1} ({str(e)[:70]})")
                time.sleep(10 * (intento + 1))
        else:
            print("    FALLA; guardo lo hecho"); break
        for ft in res["features"]:
            p = ft["properties"]
            hecho[p["id"]] = {"frac_monte": round(p.get("mean") or 0, 3)}
        json.dump({"metadata": {
            "fuente": "ESA WorldCover v200 (2021), 10 m, vía Earth Engine. frac_monte = "
                      "fracción de árbol (clase 10) + matorral (clase 20) en el buffer de "
                      f"{BUFFER_M} m. Covariable de exposición del paisaje, independiente del IV.",
            "buffer_m": BUFFER_M,
        }, "nucleos": hecho}, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  lote {i//LOTE+1}/{-(-len(pend)//LOTE)}: {len(hecho)}/{len(activos)}")

    vals = [v["frac_monte"] for v in hecho.values()]
    vals.sort()
    print(f"\nfrac_monte min/mediana/max: {vals[0]:.2f} / {vals[len(vals)//2]:.2f} / {vals[-1]:.2f}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
