import ExploradorMapa from "@/components/ExploradorMapa";
import comarcasData from "@/data/comarcas_Orurense.json";
import type { Comarca } from "@/lib/tipos";

export default function Home() {
  //FUTURO... Fetch de datos?
  const getComarcas=()=>{ 
    return comarcasData as unknown as Comarca[];
  }

  const comarcas = getComarcas()

  return (
    <main className="app">
      {/*Encapsulamos lo que es use client y necesita estados, efectos, etc. Dejamos page como Server Component*/}
      <ExploradorMapa comarcas={comarcas} />
    </main>
  );
}
