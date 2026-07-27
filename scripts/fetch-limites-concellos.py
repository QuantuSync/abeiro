# alimenta la mascara de recorte de fwi

# -*- coding: utf-8 -*-
"""
ABEIRO · Límites municipales de Ourense (para asignar concello a cada núcleo).

Descarga de OpenStreetMap (Overpass) las relaciones administrativas de nivel
municipio (admin_level=8) de la provincia de Ourense. Cada municipio español en
OSM lleva el tag `ref:ine` = código INE del municipio, que coincide con el
`codmun` del Nomenclátor IGE (formato 32xxx). Se cachea el resultado como
GeoJSON para no depender de Overpass en cada ejecución.

Se usa para: (a) asignar el concello a cada entidad del NGBE (que no lo trae),
y (b) aplicar el proxy de % de mayores del Padrón, que es por concello.

Fuente: OpenStreetMap (ODbL). Uso:
  .venv/Scripts/python scripts/fetch-limites-concellos.py
"""
import json, os, sys, time, urllib.parse, urllib.request

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "limites_concellos_ourense.geojson")
UA = "abeiro/1.0 (proteccion incendios; github.com/QuantuSync/abeiro)"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# admin_level=8 = municipio; ref:ine ^32 = provincia de Ourense.
QUERY = """
[out:json][timeout:600];
rel["boundary"="administrative"]["admin_level"="8"]["ref:ine"~"^32"];
out geom;
"""

def overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    ultimo = None
    for url in MIRRORS:
        for intento in range(2):
            try:
                print(f"  Overpass {url} (intento {intento+1})...")
                req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=600) as r:
                    return json.loads(r.read().decode("utf-8"))
            except Exception as e:
                ultimo = e
                print(f"    fallo: {e}")
                time.sleep(8 * (intento + 1))
    raise SystemExit(f"ERROR: Overpass no respondió ({ultimo}). Reintentar más tarde.")

def anillos_de_relacion(rel):
    """Ensambla los ways (role outer) de una relación en anillos [lon,lat]."""
    segmentos = []
    for m in rel.get("members", []):
        if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry"):
            segmentos.append([(p["lon"], p["lat"]) for p in m["geometry"]])
    # Encadena segmentos por extremos coincidentes en anillos cerrados.
    anillos, pend = [], list(segmentos)
    while pend:
        actual = list(pend.pop(0))
        cambiado = True
        while cambiado and actual[0] != actual[-1]:
            cambiado = False
            for i, s in enumerate(pend):
                if s[0] == actual[-1]:
                    actual += s[1:]; pend.pop(i); cambiado = True; break
                if s[-1] == actual[-1]:
                    actual += list(reversed(s))[1:]; pend.pop(i); cambiado = True; break
                if s[-1] == actual[0]:
                    actual = s[:-1] + actual; pend.pop(i); cambiado = True; break
                if s[0] == actual[0]:
                    actual = list(reversed(s))[:-1] + actual; pend.pop(i); cambiado = True; break
        anillos.append([[x, y] for x, y in actual])
    return anillos

def main():
    print("Descargando límites municipales de Ourense (OSM admin_level=8)...")
    data = overpass(QUERY)
    feats = []
    for el in data.get("elements", []):
        if el.get("type") != "relation":
            continue
        tags = el.get("tags", {})
        codmun = tags.get("ref:ine")
        if not codmun or not codmun.startswith("32"):
            continue
        anillos = anillos_de_relacion(el)
        if not anillos:
            continue
        feats.append({
            "type": "Feature",
            "properties": {"codmun": codmun, "nombre": tags.get("name", "")},
            "geometry": {"type": "Polygon", "coordinates": anillos},
        })
    feats.sort(key=lambda f: f["properties"]["codmun"])
    out = {
        "type": "FeatureCollection",
        "metadata": {
            "fuente": "OpenStreetMap vía Overpass (ODbL). Relaciones admin_level=8 con "
                      "ref:ine ^32 (municipios de la provincia de Ourense).",
            "n_concellos": len(feats),
        },
        "features": feats,
    }
    json.dump(out, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\nConcellos obtenidos: {len(feats)} (esperado ~92)")
    faltan = 92 - len(feats)
    if faltan:
        print(f"  AVISO: faltan {faltan}; puede que algún municipio no tenga ref:ine en OSM.")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
