# -*- coding: utf-8 -*-
"""
ABEIRO · % de mayores de 65 por concello de Ourense (Padrón, INE).

Descarga la tabla del INE "Población por sexo, municipios y edad (grupos
quinquenales)" de la provincia de Ourense (tabla 33866; el INE trocea esta
estadística por provincia, en orden alfabético) y deriva, por concello y para
el año más reciente, el porcentaje de población de 65 o más años:

  pct_mayores_65 = suma(grupos de edad >= 65) / poblacion_total

Salida: data/padron_edad_ourense.csv (codmun, concello, pct_mayores_65), en el
mismo formato que data/padron_edad_concellos.csv del piloto. Fracción 0-1.

Fuente: INE, Estadística del Padrón Continuo (datos oficiales, reutilización
libre citando la fuente). Uso:
  .venv/Scripts/python scripts/fetch-padron-ourense.py
"""
import csv, io, os, re, sys, urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SALIDA = os.path.join(DATA, "padron_edad_ourense.csv")
TABLA_INE = 33866  # Ourense (provincia 32)
URL = f"https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{TABLA_INE}.csv"
UA = "abeiro/1.0"

def num(s):
    return int(s.replace(".", "").replace(" ", "") or 0)

def es_65_mas(edad):
    """True si el grupo quinquenal ('De 65 a 69 años', '100 y más años') es >=65."""
    if "100 y más" in edad:
        return True
    m = re.search(r"De (\d+) a", edad)
    return bool(m) and int(m.group(1)) >= 65

def main():
    print(f"Descargando tabla INE {TABLA_INE} (Padrón por edad, Ourense)...")
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        texto = r.read().decode("iso-8859-15", "replace")
    filas = list(csv.reader(io.StringIO(texto), delimiter=";"))
    cab = filas[0]
    print("  columnas:", cab)

    # Año más reciente presente.
    periodos = set(f[4] for f in filas[1:] if len(f) >= 6 and f[2].strip().startswith("32"))
    def anio(p):
        m = re.search(r"(\d{4})", p); return int(m.group(1)) if m else 0
    periodo = max(periodos, key=anio)
    print("  periodo usado:", periodo)

    # Acumula total y 65+ por concello (solo Sexo=Total, municipio de Ourense).
    total = {}   # codmun -> {concello, tot, may65}
    for f in filas[1:]:
        if len(f) < 6 or f[0] != "Total" or f[4] != periodo:
            continue
        mun = f[2].strip()
        if not mun.startswith("32") or len(mun) < 6:
            continue
        codmun = mun[:5]; nombre = mun[6:].strip()
        edad = f[3].strip(); val = num(f[5])
        d = total.setdefault(codmun, {"concello": nombre, "tot": 0, "may65": 0})
        if edad == "Todas las edades":
            d["tot"] = val
        elif es_65_mas(edad):
            d["may65"] += val

    filas_out = []
    for codmun, d in sorted(total.items()):
        if d["tot"] <= 0:
            continue
        pct = round(d["may65"] / d["tot"], 3)
        filas_out.append((codmun, d["concello"], pct))

    with open(SALIDA, "w", encoding="utf-8", newline="") as fo:
        w = csv.writer(fo)
        w.writerow(["codmun", "concello", "pct_mayores_65"])
        w.writerows(filas_out)

    pcts = [p for _, _, p in filas_out]
    print(f"\nConcellos con % de mayores: {len(filas_out)}/92")
    print(f"  pct_mayores_65 min/media/max: {min(pcts):.3f} / {sum(pcts)/len(pcts):.3f} / {max(pcts):.3f}")
    print(f"Escrito {SALIDA}")

if __name__ == "__main__":
    main()
