import ExploradorMapa from "@/components/ExploradorMapa";
import comarcasData from "@/data/comarcas_ourense.json";
import type { Comarca } from "@/lib/tipos";

export default function Home({ searchParams }: { searchParams: { comarca?: string } }) {
  //FUTURO... Fetch de datos?
  const getComarcas=()=>{ 
    return comarcasData as unknown as Comarca[];
  }

  const comarcas = getComarcas()
  const inicial =
    comarcas.find((c) => c.id === searchParams.comarca) ??
    comarcas.find((c) => c.id === "valdeorras") ??
    comarcas[0];

  return (
    <main className="app">
      {/*Encapsulamos lo que es use client y necesita estados, efectos, etc. Dejamos page como Server Component*/}
      <ExploradorMapa comarcas={comarcas} comarcaInicial={inicial} />
    </main>
  );
}
