# -*- coding: utf-8 -*-
"""
ABEIRO · Capacidad de respuesta de los núcleos de Ourense (OSM local).

Desde el extracto viario local (data/osm_ourense_vias.json, descargado por
scripts/fetch-vias-ourense.py) calcula, por núcleo activo:
  - vias_salida            : nº de cruces de vías transitables con el círculo de
                             1 km (cada cruce = una salida), como en el piloto.
  - vias_salida_ponderadas : ponderadas por clase (pista forestal cuenta menos).
  - distancia_servicios_km : distancia (haversine) al núcleo-servicio más cercano
                             (entidad con población >= UMBRAL_SERVICIO, p. ej.
                             cabeceras comarcales), en línea recta.

Sin llamadas Overpass punto-a-punto: todo en local con indexado espacial por
rejilla. Salida: data/capacidad_ourense.json.

Fuente: OpenStreetMap (ODbL). Uso:
  .venv/Scripts/python scripts/fetch-accesos-ourense.py
"""
import json, math, os, sys
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "capacidad_ourense.json")
RADIO_M = 1000
CELDA = 0.02          # rejilla de indexado (~1,5 km)
UMBRAL_SERVICIO = 2000  # población mínima para considerar un núcleo "cabecera con servicios"

# Peso por clase de vía (idéntico a lib/indice.mjs PESOS_VIA).
PESOS_VIA = {"primary": 1.0, "secondary": 1.0, "tertiary": 1.0,
             "unclassified": 0.5, "residential": 0.5, "track": 0.2}
PESO_DEFECTO = 0.5

def hav(la1, lo1, la2, lo2):
    R = 6371000.0; p = math.pi / 180
    a = (math.sin((la2 - la1) * p / 2) ** 2
         + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))

def celda(lon, lat):
    return (int(math.floor(lon / CELDA)), int(math.floor(lat / CELDA)))

def main():
    print("Cargando extracto viario...")
    vias = json.load(open(os.path.join(DATA, "osm_ourense_vias.json"), encoding="utf-8"))["elements"]
    # Índice espacial: celda -> lista de (tipo, geometry) de vías que la tocan.
    indice = defaultdict(list)
    n_ways = 0
    for w in vias:
        if w.get("type") != "way" or not w.get("geometry"):
            continue
        tipo = (w.get("tags") or {}).get("highway", "otro")
        geom = [(g["lon"], g["lat"]) for g in w["geometry"]]
        n_ways += 1
        celdas = set(celda(lon, lat) for lon, lat in geom)
        for c in celdas:
            indice[c].append((tipo, geom))
    print(f"  {n_ways} vías indexadas en {len(indice)} celdas")

    fc = json.load(open(os.path.join(DATA, "nucleos_ourense.json"), encoding="utf-8"))
    activos = [f for f in fc["features"] if f["properties"]["activo"]]
    # Núcleos-servicio: entidades con población alta (cabeceras).
    servicios = [(f["geometry"]["coordinates"], f["properties"]["poblacion"])
                 for f in fc["features"] if f["properties"]["poblacion"] >= UMBRAL_SERVICIO]
    print(f"Núcleos activos: {len(activos)} | núcleos-servicio (>= {UMBRAL_SERVICIO} hab): {len(servicios)}")

    def contar_salidas(lon, lat):
        cx, cy = celda(lon, lat)
        vistos = set(); por_tipo = defaultdict(int); total = 0
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for tipo, geom in indice.get((cx + dx, cy + dy), []):
                    key = id(geom)
                    if key in vistos:
                        continue
                    vistos.add(key)
                    dentro = [hav(lat, lon, g[1], g[0]) <= RADIO_M for g in geom]
                    cruces = sum(1 for i in range(1, len(dentro)) if dentro[i] != dentro[i - 1])
                    if cruces:
                        total += cruces; por_tipo[tipo] += cruces
        return total, dict(por_tipo)

    def dist_servicio(lon, lat):
        best = None
        for (slon, slat), _ in servicios:
            d = hav(lat, lon, slat, slon)
            if best is None or d < best:
                best = d
        return round(best / 1000, 1) if best is not None else None

    salida = {}
    for i, f in enumerate(activos):
        lon, lat = f["geometry"]["coordinates"]
        total, por_tipo = contar_salidas(lon, lat)
        ponderadas = sum(n * PESOS_VIA.get(t, PESO_DEFECTO) for t, n in por_tipo.items())
        salida[f["properties"]["id"]] = {
            "vias_salida": total,
            "vias_salida_ponderadas": round(ponderadas, 1),
            "vias_salida_por_tipo": por_tipo,
            "distancia_servicios_km": dist_servicio(lon, lat),
        }
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(activos)}")

    out = {"metadata": {
        "fuente": "OpenStreetMap (ODbL), extracto viario local data/osm_ourense_vias.json. "
                  "vias_salida = nº de cruces de vías transitables con el círculo de "
                  f"{RADIO_M} m; ponderadas por clase (pista=0.2). distancia_servicios_km = "
                  f"distancia en línea recta al núcleo-servicio (>= {UMBRAL_SERVICIO} hab) más cercano.",
        "radio_m": RADIO_M, "umbral_servicio_hab": UMBRAL_SERVICIO,
    }, "nucleos": salida}
    json.dump(out, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
    vs = [v["vias_salida"] for v in salida.values()]
    ds = [v["distancia_servicios_km"] for v in salida.values() if v["distancia_servicios_km"] is not None]
    print(f"\nvias_salida min/med/max: {min(vs)}/{sorted(vs)[len(vs)//2]}/{max(vs)}")
    print(f"dist_servicios km min/med/max: {min(ds)}/{sorted(ds)[len(ds)//2]}/{max(ds)}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
