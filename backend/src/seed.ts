/**
 * Llena una cuenta con los datos de ejemplo: los empleados del orgánico y los roles de pago de enero
 * a septiembre de 2026. El orgánico y las reglas de ley ya vienen en cada cuenta nueva.
 *
 *   npm --prefix backend run seed -- demo@empresa.com --clave "una contraseña larga"
 *       crea la cuenta «Empresa Demo S.A.» con ese correo (si no existe) y la llena
 *   npm --prefix backend run seed -- demo@empresa.com
 *       llena la cuenta de un correo que ya existe, si todavía no tiene empleados ni roles
 *   npm --prefix backend run seed -- demo@empresa.com --reiniciar
 *       antes borra los empleados, roles y novedades de esa cuenta y empieza de cero
 *       (contra Supabase pide además --confirmo-produccion). Las demás cuentas no se tocan.
 *
 * Con DATABASE_URL en el entorno carga la base de Supabase; sin ella, la de PGlite en backend/data.
 */
import { fileURLToPath } from "node:url";

import { EMPRESA_DEMO } from "./config.ts";
import { buscarUsuarioPorEmail, registrarCuenta } from "./cuentas.ts";
import { abrirBase, descripcionDeDestino, ejecutar, esBaseRemota, uno } from "./db.ts";
import { ANIO_DEMO, cargarEmpleadosDemo, generarRolesDemo, MESES_DEMO } from "./demo.ts";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));
const destino = process.env.DATABASE_URL ?? process.env.DATABASE ?? aqui("../data/pglite");
const argumentos = process.argv.slice(2);
const reiniciar = argumentos.includes("--reiniciar");
const posicion = argumentos.indexOf("--clave");
const clave = posicion === -1 ? undefined : argumentos[posicion + 1];
const email = argumentos.find((a, i) => !a.startsWith("--") && argumentos[i - 1] !== "--clave");

const salir = (mensaje: string): never => {
  console.error(mensaje);
  process.exit(1);
};

if (!email) salir("Indica el correo de la cuenta: seed -- <correo> [--clave <contraseña>] [--reiniciar]");

// Contra un servidor Postgres (Supabase) --reiniciar borra datos reales: exige una confirmación explícita.
if (reiniciar && esBaseRemota(destino) && !argumentos.includes("--confirmo-produccion")) {
  salir(
    `--reiniciar borraría los empleados, roles y novedades de la cuenta de ${email} en ${descripcionDeDestino(destino)}.\n` +
      "Si es lo que quieres, repite el comando con --confirmo-produccion.",
  );
}

const db = await abrirBase(destino);
try {
  let cuentaId: number;
  const existente = await buscarUsuarioPorEmail(db, email!);
  if (existente) {
    cuentaId = existente.cuentaId;
  } else {
    if (!clave) salir(`No hay una cuenta para ${email}. Para crearla agrega --clave "<contraseña de al menos 10 caracteres>".`);
    ({ cuentaId } = await registrarCuenta(db, { empresa: EMPRESA_DEMO.nombre, ruc: EMPRESA_DEMO.ruc, email, clave }));
    console.log(`Cuenta creada para ${email}.`);
  }

  if (reiniciar) {
    // Los roles arrastran su detalle; los empleados sueltan puesto y responsable por las claves foráneas.
    await ejecutar(db, "DELETE FROM roles_cabecera WHERE cuenta_id = ?", cuentaId);
    await ejecutar(db, "UPDATE puestos SET responsable_id = NULL WHERE cuenta_id = ?", cuentaId);
    await ejecutar(db, "DELETE FROM empleados WHERE cuenta_id = ?", cuentaId); // y sus novedades, en cascada
  }

  const hay = async (tabla: string) =>
    Number((await uno(db, `SELECT COUNT(*) AS n FROM ${tabla} WHERE cuenta_id = ?`, cuentaId))?.n ?? 0) > 0;
  if ((await hay("empleados")) || (await hay("roles_cabecera"))) {
    salir("La cuenta ya tiene empleados o roles. Usa --reiniciar para empezar de cero (borra esos datos).");
  }

  const empleados = await cargarEmpleadosDemo(db, cuentaId);
  const roles = await generarRolesDemo(db, cuentaId);
  console.log(
    `Listo: ${empleados} empleados y ${roles} roles de pago (${MESES_DEMO[0]} a ${MESES_DEMO.at(-1)} de ${ANIO_DEMO}).`,
  );
} finally {
  await db.cerrar();
}
