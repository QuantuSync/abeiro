import ExploradorMapa from "@/components/ExploradorMapa";
import comarcasData from "@/data/comarcas_ourense.json";
import type { Comarca } from "@/lib/tipos";

const COMARCA_DEFECTO_ID = "valdeorras"; //FUTURO... HABRÍA QUE VER QUE COMARCA POR DEFECTO

// FUTURO... SI FUESE nEXT VERSION >= 15, haria falta que searchparams fuese una promise. Home seria async.
export default function Home({ searchParams }: { searchParams: { comarca?: string } }) {
  //FUTURO... Fetch de datos?
  const getComarcas=()=>{ 
    return comarcasData as unknown as Comarca[];
  }

  const comarcas = getComarcas()
  const inicial = //la comarca inicial es la de la URL, si no valdeorras, si no, la primera de las disponibles
    comarcas.find((c) => c.id === searchParams.comarca) ??
    comarcas.find((c) => c.id === COMARCA_DEFECTO_ID) ??
    comarcas[0];

  return (
    <main className="app">
      {/*Encapsulamos lo que es use client y necesita estados, efectos, etc. Dejamos page como Server Component*/}
      <ExploradorMapa comarcas={comarcas} comarcaInicial={inicial} />
    </main>
  );
}


/* process.env es un objeto global de Node.js — Next.js, al arrancar, lee .env.local y mete cada línea ahí como si fuera una variable más de ese objeto. 
No necesitas instalar nada ni importar nada especial para leerlo en código de servidor. */