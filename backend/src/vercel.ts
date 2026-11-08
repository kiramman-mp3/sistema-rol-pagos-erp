/** Entrada para Vercel: la API de Express contra la base de Supabase (DATABASE_URL), siempre con inicio de sesión. */
import { crearApp } from "./app.ts";
import { authDeEntorno } from "./auth.ts";
import { abrirBase } from "./db.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta la variable de entorno DATABASE_URL (la cadena de conexión de Supabase).");

const auth = authDeEntorno(process.env);
if (!auth) throw new Error("Faltan ADMIN_USUARIO, ADMIN_CLAVE_HASH y SESION_SECRETO: la API no se publica sin inicio de sesión.");

export default crearApp(await abrirBase(url), { auth, confiarEnProxy: true });
