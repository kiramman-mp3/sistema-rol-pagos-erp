/** Entrada para Vercel: la API de Express contra la base de Supabase (DATABASE_URL), con cuentas por empresa. */
import { crearApp } from "./app.ts";
import { secretoDeEntorno } from "./auth.ts";
import { abrirBase } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta la variable de entorno DATABASE_URL (la cadena de conexión de Supabase).");

const secreto = secretoDeEntorno(process.env);
if (!secreto) throw new Error("Falta SESION_SECRETO (al menos 32 caracteres): firma las sesiones de las empresas.");

export default crearApp(await abrirBase(url), { secreto, confiarEnProxy: true });
