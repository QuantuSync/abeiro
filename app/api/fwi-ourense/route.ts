// app/api/fwi-ourense/route.ts
import { NextResponse } from "next/server";
import { obtenerFWIRecortado } from "@/lib/procesarFWI";

export async function GET() {
  try {
    const png = await obtenerFWIRecortado();
    return new NextResponse(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}