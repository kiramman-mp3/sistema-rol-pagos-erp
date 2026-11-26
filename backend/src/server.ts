import { fileURLToPath } from "node:url";

import { crearApp } from "./app.ts";
import { secretoAleatorio, secretoDeEntorno } from "./auth.ts";
import { correoDeEntorno } from "./correo.ts";
import { abrirBase, esBaseRemota } from "./db.ts";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));

const puerto = Number(process.env.PORT ?? 3000);
// DATABASE_URL: postgres://… (un servidor PostgreSQL). Sin ella, una base PGlite en backend/data para trabajar en local.
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

// Con un servidor de correo real, los enlaces necesitan la dirección pública: la de la petición no es de fiar.
const correo = correoDeEntorno(process.env);
const urlPublica = process.env.APP_URL?.trim() || undefined;
if (correo.real && !urlPublica) {
  console.error("Con CORREO_SMTP_URL hace falta APP_URL (por ejemplo https://rol.tu-dominio.com) para los enlaces de los correos.");
  process.exit(1);
}
if (!correo.real) console.warn("Sin CORREO_SMTP_URL: los correos (recuperar contraseña, verificar) se escriben en esta consola.");

const db = await abrirBase(destino);
const app = crearApp(db, {
  carpetaFrontend: process.env.FRONTEND_DIR ?? aqui("../../frontend/dist/frontend/browser"),
  secreto,
  correo,
  urlPublica,
});

app.listen(puerto, () => {
  console.log(`Rol de pagos: http://localhost:${puerto}`);
});
