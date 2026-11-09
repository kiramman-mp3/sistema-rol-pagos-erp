/** Entrada para Vercel: la API de Express contra la base de Supabase (DATABASE_URL), con cuentas por empresa. */
import { crearApp } from "./app.ts";
import { secretoDeEntorno } from "./auth.ts";
import { correoDeEntorno } from "./correo.ts";
import { abrirBase } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta la variable de entorno DATABASE_URL (la cadena de conexión de Supabase).");

const secreto = secretoDeEntorno(process.env);
if (!secreto) throw new Error("Falta SESION_SECRETO (al menos 32 caracteres): firma las sesiones de las empresas.");

// En Vercel no hay consola que lea: sin correo configurado, recuperar la contraseña no puede funcionar.
const correo = correoDeEntorno(process.env);
const urlPublica = process.env.APP_URL?.trim() || undefined;
if (correo.real && !urlPublica) throw new Error("Con CORREO_SMTP_URL hace falta APP_URL (la dirección pública) para los enlaces de los correos.");

export default crearApp(await abrirBase(url), { secreto, confiarEnProxy: true, correo, urlPublica });
