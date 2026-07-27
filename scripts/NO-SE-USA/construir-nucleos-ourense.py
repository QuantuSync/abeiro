#CREAR GEOJSONS QUE YA NO SE USAN

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
# IGE indexado por concello: lista de entidades singulares (con flag de uso).
ige_conc = {}  # codmun5 -> [ {norm, pob, parroquia_ec, nome, usada} ]
igerows = [r for r in csv.reader(open(os.path.join(DATA, "Fichero1.txt"), encoding="latin1")) if len(r) >= 8][1:]
n_ige = 0
for r in igerows:
    codprov, codmun3, ec, es, nuc, nome, pob = r[1], r[2], r[3], r[4], r[5], r[6], int(r[7])
    if nuc != "00" or es == "00":  # solo entidades singulares
        continue
    ige_conc.setdefault(codprov + codmun3, []).append(
        {"norm": norm(nome), "pob": pob, "parroquia_ec": ec, "nome": nome, "usada": False})
    n_ige += 1
print(f"IGE: {n_ige} entidades singulares de Ourense")

# --- emparejamiento aproximado (rescate de grafías divergentes) ---------------
# Similitud de Levenshtein normalizada + contención de tokens (para capitales con
# nombre truncado: "Vilariño" ⊂ "Vilariño de Conso"). Umbral alto para no meter
# falsos positivos; los dudosos quedan sin resolver (revisión manual).
SIM_MIN = 0.80
def levenshtein(a, b):
    if a == b: return 0
    if not a: return len(b)
    if not b: return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]
def similitud(a, b):
    m = max(len(a), len(b))
    return 1 - levenshtein(a, b) / m if m else 1.0
def tokens_contenidos(a, b):
    ta, tb = set(t for t in a.split() if len(t) >= 3), set(t for t in b.split() if len(t) >= 3)
    return bool(ta) and bool(tb) and (ta <= tb or tb <= ta)

# Tabla manual de correspondencias (codmun, norm_ige) -> norm_ngbe, para casos
# claros que ni el exacto ni el fuzzy resuelven. Vacía por ahora: el fuzzy +
# contención de tokens cubre las capitales; se rellena si aparece algún caso.
TABLA_MANUAL = {}

def casar(codmun5, nombre_ngbe):
    """Devuelve la entidad IGE del concello que casa (exacto/fuzzy/tabla), o None."""
    ents = ige_conc.get(codmun5, [])
    nn = norm(nombre_ngbe)
    # a) exacto
    for e in ents:
        if not e["usada"] and e["norm"] == nn:
            return e, "exacto"
    # b) tabla manual
    obj = TABLA_MANUAL.get((codmun5, nn))
    if obj:
        for e in ents:
            if not e["usada"] and e["norm"] == obj:
                return e, "tabla"
    # c) fuzzy: mejor por contención de tokens o similitud alta
    mejor, mejor_sc = None, 0.0
    for e in ents:
        if e["usada"]:
            continue
        sc = similitud(nn, e["norm"])
        if tokens_contenidos(nn, e["norm"]):
            sc = max(sc, 0.90)  # contención estricta: match fuerte
        if sc > mejor_sc:
            mejor, mejor_sc = e, sc
    if mejor and mejor_sc >= SIM_MIN:
        return mejor, "fuzzy"
    return None, None

# --- cruce --------------------------------------------------------------------
features, sin_codmun, sin_ige = [], 0, 0
rescatados = {"fuzzy": [], "tabla": []}
for s in singulares:
    codmun5, concello = codmun_de(s["lon"], s["lat"])
    if not codmun5:
        sin_codmun += 1
        continue
    m, via = casar(codmun5, s["nombre"])
    if not m:
        sin_ige += 1
        continue
    m["usada"] = True
    if via in ("fuzzy", "tabla") and m["pob"] >= UMBRAL_POBLACION:
        rescatados[via].append((s["nombre"], m["nome"], m["pob"]))
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
            "cruce_via": via,
            "dato_coordenadas_real": True,
            "fuente_coordenadas": f"NGBE/IGN (Nomenclátor Geográfico Básico), NamedPlace {s['id']}",
            "dato_poblacion_real": True,
            "fuente_poblacion": "Nomenclátor IGE 2025 (entidade singular)",
            "ige_nome": m["nome"],
        },
    })

# Entidades IGE >=50 hab que NINGÚN punto NGBE casó: se pierden (revisión manual).
sin_resolver = [(e["nome"], e["pob"], cod) for cod, ents in ige_conc.items()
                for e in ents if not e["usada"] and e["pob"] >= UMBRAL_POBLACION]
sin_resolver.sort(key=lambda x: -x[1])
print(f"\nRescatados por fuzzy: {len(rescatados['fuzzy'])} · por tabla: {len(rescatados['tabla'])} "
      f"(entidades >=50 hab que el exacto no casaba)")
print(f"Entidades >=50 hab SIN resolver (sin punto NGBE; revisión manual): {len(sin_resolver)}")
for nome, pob, cod in sin_resolver:
    print(f"  [{cod}] {nome} ({pob} hab)")

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
