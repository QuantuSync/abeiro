# ALIMENTA ARCHIVOS QUE GENERAN GEOJSON
# 
# 
# # -*- coding: utf-8 -*-
"""
ABEIRO · Descarga del Nomenclátor Geográfico Básico (NGBE/IGN) para Ourense.

Descarga vía WFS INSPIRE del IGN todas las entidades (NamedPlace) del ámbito de
Ourense y las cachea en data/ngbe_ourense_raw.json (id, nombre, tipo, lon, lat).
El recorte a la provincia se hace con los límites municipales OSM
(data/limites_concellos_ourense.geojson); si no existen, recorta por el bbox
provincial. El resultado alimenta scripts/construir-nucleos-ourense.py.

Fuente: NGBE — Nomenclátor Geográfico Básico de España, IGN (CC-BY 4.0).
        WFS INSPIRE gn:NamedPlace. Se pagina de 1000 en 1000 con reintentos.

Uso:  .venv/Scripts/python scripts/fetch-nomenclator-ourense.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "ngbe_ourense_raw.json")
LIMITES = os.path.join(DATA, "limites_concellos_ourense.geojson")
WFS = "https://www.ign.es/wfs-inspire/ngbe"
UA = "abeiro/1.0 (github.com/QuantuSync/abeiro)"
BBOX = (-8.366, 41.801, -6.734, 42.579)  # lon/lat de Ourense (GAUL)
RE_FEAT = re.compile(r"<gn:NamedPlace\b.*?</gn:NamedPlace>", re.S)

def pedir(start, count=1000):
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": "gn:NamedPlace", "count": str(count), "startIndex": str(start),
        "srsName": "urn:ogc:def:crs:EPSG::4258",
        "bbox": f"{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]},urn:ogc:def:crs:EPSG::4258",
    }
    url = WFS + "?" + urllib.parse.urlencode(params)
    for intento in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            espera = 5 * (intento + 1)
            print(f"    reintento {intento+1} tras error ({e}); espero {espera}s")
            time.sleep(espera)
    raise RuntimeError(f"WFS falló repetidamente en start={start}")

def parse(xml):
    out = []
    for f in RE_FEAT.findall(xml):
        pos = re.search(r"<gml:pos>([-\d.]+)\s+([-\d.]+)</gml:pos>", f)
        if not pos:
            continue
        lat, lon = float(pos.group(1)), float(pos.group(2))
        tipo = re.search(r'locale="es-ES">([^<]+)<', f)
        nombre = re.search(r"<gn:text>([^<]+)</gn:text>", f)
        lid = re.search(r"<base:localId>([^<]+)<", f)
        out.append({"id": lid.group(1) if lid else "?", "nombre": nombre.group(1) if nombre else "?",
                    "tipo": tipo.group(1) if tipo else "?", "lon": lon, "lat": lat})
    return out

def recorte():
    """Devuelve función dentro(lon,lat) según límites municipales OSM o bbox."""
    if not os.path.exists(LIMITES):
        print("  (sin límites municipales: recorte por bbox provincial)")
        return lambda lon, lat: BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]
    g = json.load(open(LIMITES, encoding="utf-8"))
    polys = [f["geometry"]["coordinates"] for f in g["features"]]
    def dentro(lon, lat):
        for anillos in polys:
            inside = False
            for anillo in anillos:
                n = len(anillo); j = n - 1; c = False
                for i in range(n):
                    xi, yi = anillo[i]; xj, yj = anillo[j]
                    if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
                        c = not c
                    j = i
                inside ^= c
            if inside:
                return True
        return False
    return dentro

def main():
    dentro = recorte()
    todas, start = [], 0
    while True:
        feats = parse(pedir(start))
        todas.extend(feats)
        print(f"  start={start}: acumuladas {len(todas)}")
        if len(feats) < 1000:
            break
        start += 1000
        if start > 80000:
            print("  corte de seguridad a 80000"); break
    dentro_ou = [f for f in todas if dentro(f["lon"], f["lat"])]
    json.dump(dentro_ou, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
    from collections import Counter
    tipos = Counter(f["tipo"] for f in dentro_ou)
    print(f"\nNGBE en bbox: {len(todas)} | dentro de Ourense: {len(dentro_ou)}")
    print(f"  'Entidad singular': {tipos.get('Entidad singular', 0)}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
