"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
    USUARIO_TEMPORAL,
    CLAVE_TEMPORAL,
    NOMBRE_COOKIE_SESION,
    VALOR_COOKIE_SESION,
} from "@/lib/auth";

export async function iniciarSesion(formData: FormData) {
    const usuario = formData.get("usuario");
    const clave = formData.get("clave");

    if (usuario !== USUARIO_TEMPORAL || clave !== CLAVE_TEMPORAL) {
        redirect("/login?error=1");
    }

    const store = await cookies(); // en Next 15+, cookies() también es async
    store.set(NOMBRE_COOKIE_SESION, VALOR_COOKIE_SESION, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // la sesión dura 7 días
    });

    redirect("/");
}