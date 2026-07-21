// app/page.tsx
import ExploradorMapa from "@/components/ExploradorMapa";
import comarcasData from "@/data/comarcas_ourense.json";
import type { Comarca } from "@/lib/tipos";

const COMARCA_DEFECTO_ID = "valdeorras"; //FUTURO... HABRÍA QUE VER QUE COMARCA POR DEFECTO

// FUTURO... SI FUESE nEXT VERSION >= 15, haria falta que searchparams fuese una promise. Home seria async.
export default function Home({ searchParams }: { searchParams: { comarca?: string } }) {
    //FUTURO... Fetch de datos?
    const getComarcas = () => {
      return comarcasData as unknown as Comarca[];
    };

    const comarcas = getComarcas();
    const inicial = //la comarca inicial es la de la URL, si no valdeorras, si no, la primera de las disponibles
      comarcas.find((c) => c.id === searchParams.comarca) ??
      comarcas.find((c) => c.id === COMARCA_DEFECTO_ID) ??
      comarcas[0];

    // 👇 NUEVO: si la URL ya traía ?comarca=, la app debe abrir directo en modo
    // detalle (un enlace compartido no debe obligar a pasar por Ourense antes).
    const vistaInicial: "general" | "detalle" = searchParams.comarca ? "detalle" : "general";

    // 👇 OJO: ya NO envolvemos en <main className="app">. ExploradorMapa ahora
    // devuelve su propio <main className="app">; si lo dejamos aquí también,
    // quedan dos <main> anidados en el DOM.
    return (
      <ExploradorMapa comarcas={comarcas} comarcaInicial={inicial} vistaInicial={vistaInicial} />
    );
}