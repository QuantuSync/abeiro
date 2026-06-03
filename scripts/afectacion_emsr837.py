# -*- coding: utf-8 -*-
"""
ABEIRO · Fase 1 — Capa de afectación física (validación, NO componente del IV).

Cruza el perímetro quemado del incendio de Ourense/Valdeorras de agosto de 2025
con los 12 núcleos del mapa. Fuente: Copernicus EMS Rapid Mapping, activación
EMSR837, AOI01 "Ourense Province" (delineaciones DEL por fecha). EFFIS WFS estaba
caído (backend Oracle), así que se cambió a esta fuente, más completa.

LIMITACIÓN: el perímetro EMSR837/AOI01 cubre el área delineada por Copernicus EMS
para esta AOI; puede no coincidir exactamente con las 30.000+ ha totales del
complejo de incendios (que abarcó varias AOIs y zonas). Se documenta el total
capturado para juzgar su completitud.

Salida: data/nucleos_afectacion_fisica.json (+ perímetro dissuelto en GeoJSON).
"""
import glob, json, os, re
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Geod, Transformer

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
EMSR = os.path.join(DATA, "emsr837")
BUFFER_M = 500
GEOD = Geod(ellps="WGS84")
# WGS84 (lon/lat) -> ETRS89 / UTM 29N (metros) para distancias y buffers.
TO_M = Transformer.from_crs("EPSG:4326", "EPSG:25829", always_xy=True).transform


def fechas_por_monitoreo():
    """monitoringNumber -> fecha de adquisición (ISO) desde la API EMSR837."""
    api = json.load(open(os.path.join(DATA, "emsr837.json"), encoding="utf-8"))
    act = (api.get("results") or [api])[0]
    aoi = next(a for a in act["aois"] if "Ourense" in (a.get("name") or ""))
    out = {}
    for p in aoi.get("products", []):
        if (p.get("type") or p.get("productType")) != "DEL":
            continue
        n = p.get("monitoringNumber", 0)
        adq = [im.get("acquisitionTime") for im in (p.get("images") or []) if im.get("acquisitionTime")]
        fecha = max(adq) if adq else (p.get("expectedDelivery") or "")
        out[n] = (fecha or "")[:10]
    return out


def cargar_monitoreos():
    """Lista [(monitoringNumber, fecha, union_poligono_wgs84)] ordenada por fecha."""
    fechas = fechas_por_monitoreo()
    rows = []
    for d in sorted(glob.glob(os.path.join(EMSR, "*_DEL_*"))):
        m = re.search(r"DEL_(MONIT(\d+)|PRODUCT)", d)
        if not m:
            continue
        num = int(m.group(2)) if m.group(2) else 0
        js = glob.glob(os.path.join(d, "*observedEventA*.json"))
        if not js:
            continue
        fc = json.load(open(js[0], encoding="utf-8"))
        polys = [shape(f["geometry"]) for f in fc["features"] if f.get("geometry")]
        if not polys:
            continue
        rows.append((num, fechas.get(num, ""), unary_union(polys)))
    rows.sort(key=lambda r: (r[1] or "9999", r[0]))
    return rows


def ha(poly):
    area_m2, _ = GEOD.geometry_area_perimeter(poly)
    return abs(area_m2) / 10000.0


def main():
    monitoreos = cargar_monitoreos()
    print("Delineaciones cargadas:", [(n, f) for n, f, _ in monitoreos])

    # Perímetro acumulado = dissolve de todas las delineaciones.
    acumulado = unary_union([g for _, _, g in monitoreos])
    total_ha = ha(acumulado)
    print(f"Perímetro acumulado (dissolve): {total_ha:,.0f} ha".replace(",", "."))

    # Versiones en metros (UTM 29N) para distancias/buffers.
    acumulado_m = shp_transform(TO_M, acumulado)
    monit_m = [(n, f, shp_transform(TO_M, g)) for n, f, g in monitoreos]

    nucleos = json.load(open(os.path.join(DATA, "nucleos.json"), encoding="utf-8"))
    salida = {}
    for feat in nucleos["features"]:
        p = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"]
        pt_m = shp_transform(TO_M, Point(lon, lat))

        dist = acumulado_m.distance(pt_m)            # m al área quemada
        afect = acumulado_m.contains(pt_m)           # dentro del perímetro
        borde = dist <= BUFFER_M                       # buffer 500 m toca el área

        # Fecha del frente: 1ª delineación (por fecha) que alcanza el núcleo
        # (lo contiene o queda a <=500 m).
        fecha_frente = None
        for n, f, g in monit_m:
            if g.contains(pt_m) or g.distance(pt_m) <= BUFFER_M:
                fecha_frente = f
                break

        salida[p["id"]] = {
            "nombre": p["nombre"],
            "afect_fisica": bool(afect),
            "borde_500m": bool(borde),
            "dist_area_m": round(dist, 1),
            "fecha_frente": fecha_frente,
        }
        print(f"  {p['nombre']:<26} afect={'sí' if afect else 'no':<3} "
              f"borde={'sí' if borde else 'no':<3} dist={dist:7.0f}m  frente={fecha_frente}")

    out = {
        "metadata": {
            "fuente": "Copernicus EMS Rapid Mapping, EMSR837 (Wildfires in West Spain), "
                      "AOI01 Ourense Province, delineaciones DEL (observedEvent). Licencia "
                      "Copernicus EMS (uso libre con atribución).",
            "evento": "Incendio de Ourense/Valdeorras, agosto 2025",
            "metodo": "Dissolve (unary_union) de las delineaciones por fecha; cruce con los "
                      "12 núcleos: afect_fisica (dentro del perímetro), borde_500m (a <=500 m), "
                      "fecha_frente (1ª delineación que alcanza el núcleo).",
            "total_ha_capturadas": round(total_ha),
            "limitacion": "Perímetro EMSR837/AOI01: cubre el área delineada por Copernicus EMS "
                          "para esta AOI; puede estar incompleto respecto a las 30.000+ ha del "
                          "complejo total (que abarcó varias AOIs/zonas). NO es componente del "
                          "Índice de Vulnerabilidad: es una capa de validación independiente.",
            "buffer_borde_m": BUFFER_M,
            "fechas_monitoreo": [{"monit": n, "fecha": f} for n, f, _ in monitoreos],
        },
        "nucleos": salida,
    }
    with open(os.path.join(DATA, "nucleos_afectacion_fisica.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # Perímetro dissuelto en GeoJSON (para pintarlo en el mapa).
    with open(os.path.join(DATA, "perimetro_emsr837.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": [{
            "type": "Feature",
            "properties": {"fuente": "Copernicus EMS EMSR837 AOI01", "total_ha": round(total_ha)},
            "geometry": mapping(acumulado),
        }]}, f, ensure_ascii=False)

    n_af = sum(1 for v in salida.values() if v["afect_fisica"])
    n_bo = sum(1 for v in salida.values() if v["borde_500m"])
    print(f"\nAfectados: {n_af}/12 | en borde 500 m: {n_bo}/12 | total capturado: {total_ha:,.0f} ha".replace(",", "."))


if __name__ == "__main__":
    main()
