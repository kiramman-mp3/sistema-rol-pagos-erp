import { fileURLToPath } from "node:url";

import { crearApp } from "./app.ts";
import { secretoAleatorio, secretoDeEntorno } from "./auth.ts";
import { abrirBase, esBaseRemota } from "./db.ts";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));

const puerto = Number(process.env.PORT ?? 3000);
// DATABASE_URL: postgres://… (Supabase). Sin ella, una base PGlite en backend/data para trabajar en local.
const destino = process.env.DATABASE_URL ?? process.env.DATABASE ?? aqui("../data/pglite");

// SESION_SECRETO firma las sesiones. Con una base remota es obligatorio; en local, sin él, se inventa
// uno y las sesiones se cierran al reiniciar el servidor.
let secreto = secretoDeEntorno(process.env);
if (!secreto) {
  if (esBaseRemota(destino)) {
    console.error("Con una base remota hace falta SESION_SECRETO (al menos 32 caracteres) para firmar las sesiones.");
    process.exit(1);
  }
  secreto = secretoAleatorio();
  console.warn("Sin SESION_SECRETO: se usa uno temporal y las sesiones se cierran al reiniciar. Solo para trabajar en local.");
}

const db = await abrirBase(destino);
const app = crearApp(db, {
  carpetaFrontend: process.env.FRONTEND_DIR ?? aqui("../../frontend/dist/frontend/browser"),
  secreto,
});

app.listen(puerto, () => {
  console.log(`Rol de pagos: http://localhost:${puerto}`);
});
