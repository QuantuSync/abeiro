# -*- coding: utf-8 -*-
"""
ABEIRO · Capa de evacuación estática (primer paso, sin motor de fuego).

Para cada uno de los 12 núcleos calcula la RUTA REAL DE EVACUACIÓN por carretera
hasta el destino seguro más cercano (cabeceras comarcales con servicios: A Rúa y
O Barco de Valdeorras).

Método (sin depender de Overpass en vivo en cada build): descarga UNA VEZ un
extracto de carreteras del bbox de Valdeorras (cache data/osm_valdeorras.json),
construye el grafo viario en LOCAL con networkx y enruta. Los resultados se
guardan en data/evacuacion.json y las líneas de ruta en
public/rutas_evacuacion.geojson para el mapa.

NO toca el Índice de Vulnerabilidad: es una capa nueva e independiente.
"""
import json, math, os, sys, urllib.request, urllib.parse
import networkx as nx

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
PUBLIC = os.path.join(os.path.dirname(__file__), "..", "public")
EXTRACTO = os.path.join(DATA, "osm_valdeorras.json")
BBOX = "42.35,-7.35,42.68,-6.75"  # lat,lon: cubre los 12 núcleos + A Rúa + O Barco
UA = "abeiro/1.0 (github.com/QuantuSync/abeiro)"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HW = ("motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|"
      "service|track|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link")

# Velocidad (km/h) y fiabilidad por tipo de vía. Una pista forestal (track) es
# lenta y NO es una salida fiable ante incendio (puede estar cortada, con humo).
SPEED = {
    "motorway": 100, "trunk": 90, "primary": 80, "secondary": 70, "tertiary": 60,
    "unclassified": 45, "residential": 30, "living_street": 20, "service": 25,
    "track": 18, "road": 45,
}
RELIAB = {
    "motorway": 1.0, "trunk": 1.0, "primary": 1.0, "secondary": 1.0, "tertiary": 1.0,
    "unclassified": 0.7, "residential": 0.7, "living_street": 0.6, "service": 0.6,
    "track": 0.3, "road": 0.6,
}
def norm_hw(h):
    if not h:
        return "road"
    h = h.replace("_link", "")
    return h if h in SPEED else "road"

# Destinos seguros (cabeceras comarcales).
DESTINOS = {
    "a-rua": {"nombre": "A Rúa", "lon": -7.1117, "lat": 42.3922},
    "o-barco": {"nombre": "O Barco de Valdeorras", "lon": -6.9831, "lat": 42.4164},
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def descargar_extracto():
    if os.path.exists(EXTRACTO):
        print("Extracto OSM: usando cache", os.path.getsize(EXTRACTO), "bytes")
        return json.load(open(EXTRACTO, encoding="utf-8"))
    q = f'[out:json][timeout:180];way["highway"~"^({HW})$"]({BBOX});out geom;'
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in MIRRORS:
        try:
            print("Descargando extracto OSM de", url, "...")
            req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=200) as r:
                data = json.loads(r.read().decode("utf-8"))
            json.dump(data, open(EXTRACTO, "w", encoding="utf-8"))
            print("  OK:", len(data.get("elements", [])), "ways ->", os.path.getsize(EXTRACTO), "bytes")
            return data
        except Exception as e:
            print("  fallo:", e)
            last = e
    raise SystemExit(f"ERROR: no se pudo descargar el extracto OSM ({last}). Avisar y parar.")


def construir_grafo(data):
    G = nx.Graph()
    coords = {}  # node_id -> (lon, lat)
    for w in data.get("elements", []):
        if w.get("type") != "way" or "geometry" not in w:
            continue
        hw = norm_hw((w.get("tags") or {}).get("highway"))
        spd, rel = SPEED[hw], RELIAB[hw]
        geom, nodes = w["geometry"], w.get("nodes")
        for i in range(len(geom) - 1):
            a, b = geom[i], geom[i + 1]
            na = nodes[i] if nodes and i < len(nodes) else f"{a['lat']},{a['lon']}"
            nb = nodes[i + 1] if nodes and i + 1 < len(nodes) else f"{b['lat']},{b['lon']}"
            coords[na] = (a["lon"], a["lat"]); coords[nb] = (b["lon"], b["lat"])
            d = haversine(a["lat"], a["lon"], b["lat"], b["lon"])
            t = (d / 1000.0) / spd * 60.0  # minutos
            if G.has_edge(na, nb):
                if t < G[na][nb]["t"]:
                    G[na][nb].update(t=t, d=d, hw=hw, rel=rel)
            else:
                G.add_edge(na, nb, t=t, d=d, hw=hw, rel=rel)
    for n, (lon, lat) in coords.items():
        if n in G:
            G.nodes[n]["lon"] = lon; G.nodes[n]["lat"] = lat
    return G


def nodo_mas_cercano(G, lon, lat):
    best, bd = None, 1e18
    for n, dd in G.nodes(data=True):
        if "lat" not in dd:
            continue
        d = (dd["lon"] - lon) ** 2 + (dd["lat"] - lat) ** 2
        if d < bd:
            bd, best = d, n
    return best


def resumen_ruta(G, path):
    d_total, t_total, rel_w = 0.0, 0.0, 0.0
    por_tipo = {}
    for u, v in zip(path[:-1], path[1:]):
        e = G[u][v]
        d_total += e["d"]; t_total += e["t"]; rel_w += e["d"] * e["rel"]
        por_tipo[e["hw"]] = por_tipo.get(e["hw"], 0) + e["d"]
    fiab = rel_w / d_total if d_total else 0
    pct_track = (por_tipo.get("track", 0) / d_total * 100) if d_total else 0
    return d_total, t_total, fiab, pct_track, por_tipo


def main():
    data = descargar_extracto()
    print("Construyendo grafo...")
    G = construir_grafo(data)
    print(f"  grafo: {G.number_of_nodes()} nodos, {G.number_of_edges()} aristas")
    comp = max(nx.connected_components(G), key=len)
    print(f"  mayor componente conexa: {len(comp)} nodos ({len(comp)/G.number_of_nodes()*100:.0f}%)")

    # Nodos de destinos seguros.
    dest_node = {k: nodo_mas_cercano(G, d["lon"], d["lat"]) for k, d in DESTINOS.items()}

    nucleos = json.load(open(os.path.join(DATA, "nucleos.json"), encoding="utf-8"))
    resultados, lineas, srcs = {}, [], {}
    # PASO 1: rutas en el grafo LIMPIO (sin sumidero, para no contaminar el coste).
    for feat in nucleos["features"]:
        p = feat["properties"]; lon, lat = feat["geometry"]["coordinates"]
        if p["id"] in DESTINOS:  # un destino se evacúa a sí mismo
            resultados[p["id"]] = {"nombre": p["nombre"], "es_destino": True,
                                   "destino": p["id"], "destino_nombre": p["nombre"],
                                   "dist_km": 0, "tiempo_min": 0, "rutas_alternativas": None,
                                   "fiabilidad": 1.0, "pct_track": 0}
            continue
        src = nodo_mas_cercano(G, lon, lat)
        # Ruta más rápida a cada destino; elige el de menor tiempo.
        mejor = None
        for k, dn in dest_node.items():
            try:
                t = nx.shortest_path_length(G, src, dn, weight="t")
                path = nx.shortest_path(G, src, dn, weight="t")
            except nx.NetworkXNoPath:
                continue
            if mejor is None or t < mejor[0]:
                mejor = (t, k, path)
        if mejor is None:
            resultados[p["id"]] = {"nombre": p["nombre"], "error": "sin ruta a destino seguro"}
            print(f"  {p['nombre']:<26} SIN RUTA")
            continue
        t_min, dk, path = mejor
        d_total, t_total, fiab, pct_track, por_tipo = resumen_ruta(G, path)
        srcs[p["id"]] = src
        resultados[p["id"]] = {
            "nombre": p["nombre"], "es_destino": False,
            "destino": dk, "destino_nombre": DESTINOS[dk]["nombre"],
            "dist_km": round(d_total / 1000, 1),
            "tiempo_min": round(t_total, 1),
            "rutas_alternativas": None,  # se calcula en el PASO 2
            "fiabilidad": round(fiab, 2),
            "pct_track": round(pct_track),
            "por_tipo_km": {k: round(v / 1000, 2) for k, v in sorted(por_tipo.items(), key=lambda x: -x[1])},
        }
        # Geometría de la ruta (lon,lat) simplificada para el mapa.
        pts = [[round(G.nodes[n]["lon"], 5), round(G.nodes[n]["lat"], 5)] for n in path if "lon" in G.nodes[n]]
        lineas.append({"type": "Feature",
                       "properties": {"id": p["id"], "nombre": p["nombre"],
                                      "destino": DESTINOS[dk]["nombre"], "pct_track": round(pct_track)},
                       "geometry": {"type": "LineString", "coordinates": pts}})

    # PASO 2: redundancia. Sumidero virtual conectado a AMBOS destinos; el nº de
    # rutas independientes (edge-disjoint) de cada núcleo al sumidero = redundancia.
    # Se añade AHORA, tras enrutar, para no contaminar los costes de ruta.
    SINK = "__SINK__"
    G.add_node(SINK)
    for dn in dest_node.values():
        G.add_edge(SINK, dn, t=0, d=0, hw="road", rel=1.0)
    for nid, src in srcs.items():
        try:
            resultados[nid]["rutas_alternativas"] = nx.edge_connectivity(G, src, SINK)
        except Exception:
            resultados[nid]["rutas_alternativas"] = None
        r = resultados[nid]
        print(f"  {r['nombre']:<26} -> {r['destino_nombre']:<22} {r['dist_km']:5.1f} km  {r['tiempo_min']:4.1f} min  "
              f"rutas={r['rutas_alternativas']}  fiab={r['fiabilidad']:.2f}  track={r['pct_track']}%")

    out = {
        "metadata": {
            "descripcion": "Capa de evacuación estática: ruta por carretera de cada núcleo al "
                           "destino seguro más cercano. Capa independiente; NO es parte del IV.",
            "destinos_seguros": [d["nombre"] for d in DESTINOS.values()],
            "fuente": "OpenStreetMap (extracto bbox Valdeorras, descargado una vez vía Overpass; "
                      "ODbL). Routing local con networkx.",
            "metodo": "Grafo viario ponderado por tipo (velocidad y fiabilidad). Ruta más rápida; "
                      "rutas_alternativas = nº de rutas independientes (edge-disjoint) a un destino. "
                      "fiabilidad = media de fiabilidad por longitud (1=asfalto, 0.3=pista); "
                      "pct_track = % del recorrido por pista forestal.",
            "velocidades_kmh": SPEED, "fiabilidad_por_tipo": RELIAB,
            "limitacion": "Evacuación ESTÁTICA: no considera el fuego (qué rutas quedan cortadas) "
                          "ni el tráfico ni la hora. Primer paso verificable.",
        },
        "nucleos": resultados,
    }
    json.dump(out, open(os.path.join(DATA, "evacuacion.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    os.makedirs(PUBLIC, exist_ok=True)
    json.dump({"type": "FeatureCollection", "features": lineas},
              open(os.path.join(PUBLIC, "rutas_evacuacion.geojson"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print("\nEscrito data/evacuacion.json y public/rutas_evacuacion.geojson")


if __name__ == "__main__":
    main()
