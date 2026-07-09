// Tests del andamiaje de evacuación (AXEGA): esquema de la plantilla y lógica de
// ingesta (cruce de registros -> variable de resultado por núcleo).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { norm } from "@/lib/indice.mjs";

const ejemplo = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/evacuaciones_ejemplo.json", import.meta.url)), "utf8"),
);

describe("plantilla de evacuaciones (esquema)", () => {
  it("está marcada como plantilla ficticia (no real)", () => {
    expect(ejemplo._PLANTILLA).toMatch(/FICTICIOS|plantilla/i);
    expect(ejemplo.metadata.es_plantilla ?? true).toBeTruthy();
  });

  it("cada registro tiene codmun de Ourense y tipo válido", () => {
    expect(ejemplo.registros.length).toBeGreaterThan(0);
    for (const r of ejemplo.registros) {
      expect(r.codmun).toMatch(/^32\d{3}$/);
      expect(["evacuacion", "confinamiento"]).toContain(r.tipo);
      expect(r.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// Réplica mínima de la lógica de ingesta (dedup por fecha+evento), para testearla
// sin ejecutar el script: valida el cruce por (codmun, nombre normalizado).
function ingesta(registros: any[], nucleos: { id: string; codmun: string; nombre: string }[]) {
  const porClave = new Map<string, string>(), porConcello = new Map<string, string[]>();
  for (const n of nucleos) {
    porClave.set(`${n.codmun}|${norm(n.nombre)}`, n.id);
    (porConcello.get(n.codmun) || porConcello.set(n.codmun, []).get(n.codmun)!).push(n.id);
  }
  const eventos = new Map<string, Set<string>>();
  const anota = (id: string, ev: string) => (eventos.get(id) || eventos.set(id, new Set()).get(id)!).add(ev);
  for (const r of registros) {
    const ev = `${r.fecha}|${r.evento}`;
    const id = r.nucleo_nombre ? porClave.get(`${r.codmun}|${norm(r.nucleo_nombre)}`) : null;
    if (id) anota(id, ev);
    else for (const x of porConcello.get(r.codmun) || []) anota(x, ev);
  }
  return nucleos.map((n) => ({ id: n.id, evacuado: (eventos.get(n.id)?.size ?? 0) > 0, n: eventos.get(n.id)?.size ?? 0 }));
}

describe("lógica de ingesta", () => {
  const nucleos = [
    { id: "a", codmun: "32038", nombre: "Seadur" },
    { id: "b", codmun: "32038", nombre: "Larouco" },
    { id: "c", codmun: "32999", nombre: "Otro" },
  ];

  it("cruza por núcleo y deduplica eventos por fecha+evento", () => {
    const regs = [
      { codmun: "32038", nucleo_nombre: "Seadur", fecha: "2022-07-17", evento: "X" },
      { codmun: "32038", nucleo_nombre: "Seadur", fecha: "2022-07-17", evento: "X" }, // duplicado
      { codmun: "32038", nucleo_nombre: "Seadur", fecha: "2017-10-15", evento: "Y" },
    ];
    const r = ingesta(regs, nucleos);
    const seadur = r.find((x) => x.id === "a")!;
    expect(seadur.evacuado).toBe(true);
    expect(seadur.n).toBe(2); // dos eventos distintos, no tres registros
    expect(r.find((x) => x.id === "b")!.evacuado).toBe(false);
  });

  it("un registro sin núcleo se imputa a todo el concello", () => {
    const r = ingesta([{ codmun: "32038", fecha: "2020-01-01", evento: "Z" }], nucleos);
    expect(r.find((x) => x.id === "a")!.evacuado).toBe(true);
    expect(r.find((x) => x.id === "b")!.evacuado).toBe(true);
    expect(r.find((x) => x.id === "c")!.evacuado).toBe(false); // otro concello
  });
});
