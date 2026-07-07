import { iniciarSesion } from "./actions";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const sp = await searchParams;

    return (
        <main className="login-wrap">
            <form action={iniciarSesion} className="login-form">
                <h1>ABEIRO</h1>
                <label>
                    Usuario
                    <input name="usuario" type="text" required autoFocus />
                </label>
                <label>
                    Contraseña
                    <input name="clave" type="password" required />
                </label>
                {sp.error && <p className="login-error">Usuario o contraseña incorrectos.</p>}
                <button type="submit">Entrar</button>
            </form>
        </main>
    );
}