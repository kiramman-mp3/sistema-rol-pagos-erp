/**
 * Genera el valor de `ADMIN_CLAVE_HASH` y un `SESION_SECRETO` nuevo.
 *
 *   npm --prefix backend run clave -- "mi contraseña"
 *   echo "mi contraseña" | npm --prefix backend run clave        (así no queda en el historial del terminal)
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { hashClave } from "./auth.ts";

const MINIMO = 12;

async function leerDeEntrada(): Promise<string> {
  const lineas = createInterface({ input: process.stdin });
  for await (const linea of lineas) return linea;
  return "";
}

const clave = process.argv[2] ?? (process.stdin.isTTY ? "" : await leerDeEntrada());
if (clave.length < MINIMO) {
  console.error(`Indica una contraseña de al menos ${MINIMO} caracteres: npm --prefix backend run clave -- "contraseña"`);
  process.exit(1);
}

console.log(`ADMIN_CLAVE_HASH=${await hashClave(clave)}`);
console.log(`SESION_SECRETO=${randomBytes(32).toString("base64url")}`);
