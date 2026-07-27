# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON
# 
# # -*- coding: utf-8 -*-
"""
ABEIRO · Extracto viario de Ourense (OSM) para la capacidad de respuesta.

Descarga UNA vez, vía Overpass, las carreteras transitables del bbox de Ourense
y las cachea en data/osm_ourense_vias.json (gitignored, pesado). Alimenta
scripts/fetch-accesos-ourense.py (vías de salida por núcleo, en local). Evita
650 llamadas punto-a-punto a Overpass.

Fuente: OpenStreetMap (ODbL). Uso:
  .venv/Scripts/python scripts/fetch-vias-ourense.py
"""
import json, os, sys, time, urllib.parse, urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "osm_ourense_vias.json")
UA = "abeiro/1.0 (github.com/QuantuSync/abeiro)"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
CLASES = "primary|secondary|tertiary|unclassified|residential|track"
QUERY = f'[out:json][timeout:900];way["highway"~"^({CLASES})$"](41.80,-8.37,42.58,-6.73);out geom;'

def main():
    if os.path.exists(SALIDA):
        print("Extracto viario ya existe:", os.path.getsize(SALIDA), "bytes")
        return
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    ultimo = None
    for url in MIRRORS:
        for intento in range(2):
            try:
                print(f"Overpass {url} (intento {intento+1})...")
                req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=900) as r:
                    data = json.loads(r.read().decode("utf-8"))
                json.dump(data, open(SALIDA, "w", encoding="utf-8"))
                print(f"  OK: {len(data.get('elements', []))} vías -> {os.path.getsize(SALIDA)} bytes")
                return
            except Exception as e:
                ultimo = e; print(f"  fallo: {e}"); time.sleep(10 * (intento + 1))
    raise SystemExit(f"ERROR: Overpass no respondió ({ultimo}).")

if __name__ == "__main__":
    main()
