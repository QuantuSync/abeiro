//los archivos route.ts son Route Handlers de React.
// Solo corren en el servidor.

import { NextResponse } from "next/server";
// LIB PARA ACCEDER A EFFIS Y RECORTAR LA IMAGEN
import { obtenerFWIRecortado } from "@/lib/procesarFWI";

//Next reconoce quien hace "GET" pero no recibe parametros. 
// Le da igual en ?t=${marca ?? 0} que hacemos en useFWI.

//useFWI se encarga de actualizar el URL (t) cada hora porque a nivel cliente/navegador, cada hora accede a una nueva ruta.
//Esto garantiza que, pasada una hora, el navegador sí vaya a preguntarle al servidor en vez de servir algo viejo de su propia caché.
export async function GET() {
  try {
    const png = await obtenerFWIRecortado(); // se encarga de acceder a EFFIS

    return new NextResponse(new Uint8Array(png), {
      headers: { 
        // MapLibre necesita saber el formato
        "Content-Type": "image/png", 
        // "puedes quedarte con esta respuesta en caché hasta 1 hora sin volver a preguntarme"
        "Cache-Control": "public, max-age=3600" 
      },
    });
  } catch (e) {
    //502 ==> "yo actúo de intermediario hacia otro servicio, y ese otro servicio falló"
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}