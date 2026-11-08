import { fileURLToPath } from "node:url";

import { crearApp } from "./app.ts";
import { authDeEntorno } from "./auth.ts";
import { abrirBase, esBaseRemota } from "./db.ts";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));

const puerto = Number(process.env.PORT ?? 3000);
// DATABASE_URL: postgres://… (Supabase). Sin ella, una base PGlite en backend/data para trabajar en local.
const destino = process.env.DATABASE_URL ?? process.env.DATABASE ?? aqui("../data/pglite");

// ADMIN_USUARIO, ADMIN_CLAVE_HASH y SESION_SECRETO activan el inicio de sesión (ver `npm run clave`).
const auth = authDeEntorno(process.env);
if (!auth && esBaseRemota(destino)) {
  console.error("Con una base remota hace falta el inicio de sesión: define ADMIN_USUARIO, ADMIN_CLAVE_HASH y SESION_SECRETO.");
  process.exit(1);
}
if (!auth) console.warn("Sin inicio de sesión: la API está abierta. Solo para trabajar en local.");

const db = await abrirBase(destino);
const app = crearApp(db, {
  carpetaFrontend: process.env.FRONTEND_DIR ?? aqui("../../frontend/dist/frontend/browser"),
  auth,
});

app.listen(puerto, () => {
  console.log(`Rol de pagos: http://localhost:${puerto}`);
});
