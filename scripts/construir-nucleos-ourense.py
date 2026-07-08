# -*- coding: utf-8 -*-
"""
ABEIRO · Lista maestra de núcleos de Ourense (Fase 1 del escalado).

Cruza tres fuentes para producir la lista maestra de entidades singulares de
población de la provincia de Ourense, con coordenadas y población REALES:

  1. NGBE (IGN, WFS)  -> coordenadas + nombre + tipo de cada entidad.
     Caché: data/ngbe_ourense_raw.json (todas las entidades; se filtra a
     "Entidad singular"). Se regenera con scripts/fetch-nomenclator-ourense.py.
  2. Límites municipales OSM -> asigna el concello (codmun = ref:ine) a cada
     punto NGBE por point-in-polygon (el NGBE no trae municipio).
     Caché: data/limites_concellos_ourense.geojson.
  3. Nomenclátor IGE (data/Fichero1.txt, latin1) -> población por entidad
     singular y parroquia (entidad colectiva). Cruce por (codmun, nombre
     normalizado).

Salida: data/nucleos_ourense.json (FeatureCollection). Incluye TODAS las
entidades singulares que cruzan, con un flag `activo` para las de población
>= UMBRAL_POBLACION (el subconjunto de trabajo de este hito). Procedencia REAL
por variable (coordenadas NGBE/IGN; población IGE).

Uso:  .venv/Scripts/python scripts/construir-nucleos-ourense.py
"""
import csv, json, os, re, sys, unicodedata
from collections import defaultdict

# La consola de Windows (cp1252) no imprime algunos signos; forzamos UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
UMBRAL_POBLACION = 50  # alcance del primer barrido (confirmado)

# --- normalización de nombres (misma lógica que lib/indice.mjs norm) ----------
def norm(nombre):
    s = nombre.strip().lower()
    m = re.match(r"^(.*),\s*(o|a|os|as)$", s)  # "barco, o" -> "o barco"
    if m:
        s = m.group(2) + " " + m.group(1)
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")  # sin tildes
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return re.sub(r"\s+", " ", s)

# --- point-in-polygon (ray casting sobre anillos) -----------------------------
def dentro(lon, lat, anillos):
    inside = False
    for anillo in anillos:
        n = len(anillo); j = n - 1; c = False
        for i in range(n):
            xi, yi = anillo[i]; xj, yj = anillo[j]
            if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
                c = not c
            j = i
        inside ^= c  # XOR: los anillos-hueco restan
    return inside

# --- 1) NGBE: entidades singulares con coordenadas ----------------------------
raw = json.load(open(os.path.join(DATA, "ngbe_ourense_raw.json"), encoding="utf-8"))
singulares = [f for f in raw if f["tipo"] == "Entidad singular"]
print(f"NGBE: {len(raw)} entidades totales, {len(singulares)} 'Entidad singular'")

# --- 2) límites municipales: bbox por concello + asignación de codmun ----------
limites = json.load(open(os.path.join(DATA, "limites_concellos_ourense.geojson"), encoding="utf-8"))
concellos = []
for f in limites["features"]:
    anillos = f["geometry"]["coordinates"]
    xs = [p[0] for a in anillos for p in a]; ys = [p[1] for a in anillos for p in a]
    # ref:ine de OSM llega con relleno ("32001000000"); el codmun son los 5
    # primeros dígitos (codprov+codmun = 32xxx), igual que en el IGE.
    codmun5 = re.sub(r"\D", "", f["properties"]["codmun"])[:5]
    concellos.append({
        "codmun": codmun5, "nombre": f["properties"]["nombre"],
        "anillos": anillos, "bbox": (min(xs), min(ys), max(xs), max(ys)),
    })

def codmun_de(lon, lat):
    for c in concellos:
        x0, y0, x1, y1 = c["bbox"]
        if x0 <= lon <= x1 and y0 <= lat <= y1 and dentro(lon, lat, c["anillos"]):
            return c["codmun"], c["nombre"]
    return None, None

# --- 3) IGE: población + parroquia por (codmun, nombre) -----------------------
ige = {}  # (codmun5, norm(nombre)) -> {pob, parroquia, nome}
igerows = [r for r in csv.reader(open(os.path.join(DATA, "Fichero1.txt"), encoding="latin1")) if len(r) >= 8][1:]
# ec (entidad colectiva) -> nombre de parroquia: la fila es=01 de cada ec suele
# ser la cabecera; guardamos el nombre de la ec para etiquetar la parroquia.
for r in igerows:
    codprov, codmun3, ec, es, nuc, nome, pob = r[1], r[2], r[3], r[4], r[5], r[6], int(r[7])
    if nuc != "00" or es == "00":  # solo entidades singulares
        continue
    codmun5 = codprov + codmun3
    ige[(codmun5, norm(nome))] = {"pob": pob, "parroquia_ec": ec, "nome_ige": nome}
print(f"IGE: {len(ige)} entidades singulares de Ourense")

# --- cruce --------------------------------------------------------------------
features, sin_codmun, sin_ige = [], 0, 0
for s in singulares:
    codmun5, concello = codmun_de(s["lon"], s["lat"])
    if not codmun5:
        sin_codmun += 1
        continue
    m = ige.get((codmun5, norm(s["nombre"])))
    if not m:
        sin_ige += 1
        continue
    features.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(s["lon"], 6), round(s["lat"], 6)]},
        "properties": {
            "id": f"ou-{s['id']}",
            "ngbe_id": s["id"],
            "nombre": s["nombre"],
            "concello": concello,
            "codmun": codmun5,
            "parroquia_ec": m["parroquia_ec"],
            "poblacion": m["pob"],
            "activo": m["pob"] >= UMBRAL_POBLACION,
            "dato_coordenadas_real": True,
            "fuente_coordenadas": f"NGBE/IGN (Nomenclátor Geográfico Básico), NamedPlace {s['id']}",
            "dato_poblacion_real": True,
            "fuente_poblacion": "Nomenclátor IGE 2025 (entidade singular)",
            "ige_nome": m["nome_ige"],
        },
    })

activos = [f for f in features if f["properties"]["activo"]]
print(f"\nCruce NGBE↔IGE: {len(features)} entidades casadas "
      f"({sin_codmun} sin concello, {sin_ige} sin población IGE)")
print(f"Activos (población >= {UMBRAL_POBLACION}): {len(activos)}")

# --- histograma de población (sobre las entidades casadas) --------------------
tramos = [(0, 0), (1, 49), (50, 99), (100, 199), (200, 499), (500, 999), (1000, 10**9)]
etiqueta = {(0, 0): "0 (despoblado)", (1, 49): "1–49", (50, 99): "50–99",
            (100, 199): "100–199", (200, 499): "200–499", (500, 999): "500–999", (1000, 10**9): "≥1000"}
print("\n== Histograma de población (entidades casadas NGBE↔IGE) ==")
for lo, hi in tramos:
    n = sum(1 for f in features if lo <= f["properties"]["poblacion"] <= hi)
    print(f"  {etiqueta[(lo, hi)]:<16} {n:>5}")

salida = {
    "type": "FeatureCollection",
    "metadata": {
        "descripcion": "Lista maestra de entidades singulares de población de la provincia "
                       "de Ourense (piloto de escalado a Galicia). Coordenadas NGBE/IGN, "
                       "población Nomenclátor IGE 2025; concello por point-in-polygon con "
                       "límites municipales OSM. `activo`=población >= " + str(UMBRAL_POBLACION) + ".",
        "provincia": "Ourense (32)",
        "umbral_poblacion_activos": UMBRAL_POBLACION,
        "n_total_casadas": len(features),
        "n_activos": len(activos),
        "fuentes": {
            "coordenadas": "NGBE/IGN — Nomenclátor Geográfico Básico de España (WFS INSPIRE). "
                           "Licencia CC-BY 4.0 IGN.",
            "poblacion": "Nomenclátor IGE 2025 (data/Fichero1.txt), entidade singular.",
            "concello": "OpenStreetMap admin_level=8 ref:ine (ODbL).",
        },
        "limitacion": "El cruce NGBE↔IGE por (concello, nombre normalizado) puede dejar sin "
                      "casar entidades con grafías divergentes; se reporta el número. Esta lista "
                      "sustituye la geolocalización manual de los 12 núcleos del piloto original.",
    },
    "features": features,
}
json.dump(salida, open(os.path.join(DATA, "nucleos_ourense.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\nEscrito data/nucleos_ourense.json ({len(features)} entidades, {len(activos)} activas)")
