/**
 * Administra las cuentas desde la consola, con acceso directo a la base:
 *
 *   npm --prefix backend run usuario -- --listar
 *       muestra cada cuenta con su empresa, sus usuarios y cuántos empleados tiene
 *   npm --prefix backend run usuario -- <correo> <contraseña> --cuenta <id> [--rol administrador|aprobador|lector]
 *       agrega un usuario a una cuenta que ya existe (por ejemplo «Empresa anterior», la que
 *       recibió los datos de antes de que hubiera cuentas y no tiene a nadie que entre)
 *
 * Con DATABASE_URL en el entorno usa la base de Supabase; sin ella, la de PGlite en backend/data.
 * Una empresa nueva se registra desde la página, no con este script.
 */
import { fileURLToPath } from "node:url";

import { hashClave } from "./auth.ts";
import { CLAVE_MINIMA, CUENTA_PLANTILLA } from "./cuentas.ts";
import { abrirBase, consultar, descripcionDeDestino, esDuplicado, insertar } from "./db.ts";
import { esRolUsuario, ROLES_USUARIO } from "./permisos.ts";
import { emailValido } from "./validaciones.ts";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));
const destino = process.env.DATABASE_URL ?? process.env.DATABASE ?? aqui("../data/pglite");

const argumentos = process.argv.slice(2);
const opcion = (nombre: string) => {
  const i = argumentos.indexOf(nombre);
  return i === -1 ? undefined : argumentos[i + 1];
};
const posicionales = argumentos.filter((a, i) => !a.startsWith("--") && !argumentos[i - 1]?.startsWith("--"));

const salir = (mensaje: string): never => {
  console.error(mensaje);
  process.exit(1);
};

if (!argumentos.includes("--listar") && !(posicionales.length === 2 && opcion("--cuenta"))) {
  salir("Uso:\n  usuario -- --listar\n  usuario -- <correo> <contraseña> --cuenta <id> [--rol administrador|aprobador|lector]");
}

const db = await abrirBase(destino);
try {
  if (argumentos.includes("--listar")) {
    console.log(`Cuentas en ${descripcionDeDestino(destino)}:`);
    for (const c of await consultar(
      db,
      `SELECT c.id, c.nombre, c.plantilla,
              (SELECT COUNT(*) FROM usuarios u WHERE u.cuenta_id = c.id) AS usuarios,
              (SELECT COUNT(*) FROM empleados e WHERE e.cuenta_id = c.id) AS empleados
       FROM cuentas c ORDER BY c.id`,
    )) {
      console.log(
        `  ${c.id}  ${c.nombre}${c.plantilla ? " (plantilla de ley)" : ""} — ${c.usuarios} usuarios, ${c.empleados} empleados`,
      );
    }
  } else {
    const [email, clave] = posicionales;
    const cuentaId = Number(opcion("--cuenta"));
    const rol = opcion("--rol") ?? "administrador";
    if (!esRolUsuario(rol)) salir(`--rol debe ser uno de: ${ROLES_USUARIO.join(", ")}.`);
    if (!emailValido(email)) salir("El correo no es válido.");
    if (clave.length < CLAVE_MINIMA) salir(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
    if (!Number.isInteger(cuentaId) || cuentaId === CUENTA_PLANTILLA) salir("--cuenta debe ser el id de una cuenta de empresa.");
    if (!(await consultar(db, "SELECT 1 FROM cuentas WHERE id = ?", cuentaId)).length) salir(`No existe la cuenta ${cuentaId}.`);
    try {
      await insertar(
        db, "INSERT INTO usuarios (cuenta_id, email, clave_hash, rol) VALUES (?, ?, ?, ?)",
        cuentaId, email.toLowerCase(), await hashClave(clave), rol,
      );
      console.log(`Listo: ${email.toLowerCase()} ya puede entrar a la cuenta ${cuentaId}.`);
    } catch (error) {
      if (esDuplicado(error)) salir("Ya existe un usuario con ese correo.");
      throw error;
    }
  }
} finally {
  await db.cerrar();
}
