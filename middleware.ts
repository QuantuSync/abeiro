//archivo para redireccionar a /login si aun no esta la cookie de iniciar sesion ok
import { NextResponse, type NextRequest } from "next/server";
import { NOMBRE_COOKIE_SESION, VALOR_COOKIE_SESION } from "@/lib/auth";

export function middleware(request: NextRequest) {
    const cookie = request.cookies.get(NOMBRE_COOKIE_SESION);
    const autenticado = cookie?.value === VALOR_COOKIE_SESION;

    if (!autenticado) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};