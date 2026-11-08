/** Cuentas de empresa y sus usuarios: el registro, la búsqueda por correo y los datos de la empresa. */
import { hashClave } from "./auth.ts";
import { consultar, ejecutar, esDuplicado, insertar, transaccion, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import type { RolUsuario } from "./permisos.ts";
import { emailValido, ErrorApi, rucValido } from "./validaciones.ts";

/** La cuenta que no es de ninguna empresa: guarda las reglas de ley de partida (migración 013). */
export const CUENTA_PLANTILLA = 1;

export const CLAVE_MINIMA = 10;
export const CLAVE_MAXIMA = 200;

export interface Cuenta {
  id: number;
  nombre: string;
  ruc: string;
  /** Quien generó un rol no puede aprobarlo ni publicarlo. */
  separarFunciones: boolean;
}

export interface DatosEmpresa {
  nombre: string;
  ruc: string;
}

const texto = (cuerpo: Record<string, unknown>, campo: string) =>
  typeof cuerpo[campo] === "string" ? (cuerpo[campo] as string).trim() : "";

/** Nombre y RUC de la empresa; reporta los problemas que haya en `errores`. */
function leerEmpresa(cuerpo: Record<string, unknown>, errores: string[]): DatosEmpresa {
  const nombre = texto(cuerpo, "empresa");
  const ruc = texto(cuerpo, "ruc");
  if (nombre.length < 2 || nombre.length > 120) errores.push("El nombre de la empresa debe tener entre 2 y 120 caracteres.");
  if (!rucValido(ruc)) errores.push("El RUC no es válido (13 dígitos, con su dígito verificador).");
  return { nombre, ruc };
}

/**
 * Crea la cuenta de una empresa con su primer usuario y le copia las reglas de ley y el orgánico de la
 * plantilla, todo en una transacción. Devuelve los ids; el correo repetido es un 409.
 */
export async function registrarCuenta(
  db: Base, cuerpo: Record<string, unknown>,
): Promise<{ cuentaId: number; usuarioId: number }> {
  const errores: string[] = [];
  const empresa = leerEmpresa(cuerpo, errores);
  const email = texto(cuerpo, "email").toLowerCase();
  const clave = typeof cuerpo.clave === "string" ? cuerpo.clave : "";
  if (!emailValido(email)) errores.push("El correo no es válido.");
  if (clave.length < CLAVE_MINIMA) errores.push(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
  else if (clave.length > CLAVE_MAXIMA) errores.push(`La contraseña no puede pasar de ${CLAVE_MAXIMA} caracteres.`);
  if (errores.length) throw new ErrorApi(400, errores);

  const claveHash = await hashClave(clave);
  try {
    return await transaccion(db, async (tx) => {
      const cuentaId = await insertar(tx, "INSERT INTO cuentas (nombre, ruc) VALUES (?, ?)", empresa.nombre, empresa.ruc);
      const usuarioId = await insertar(
        tx, "INSERT INTO usuarios (cuenta_id, email, clave_hash) VALUES (?, ?, ?)", cuentaId, email, claveHash,
      );
      await consultar(tx, "SELECT copiar_plantilla(?)", cuentaId);
      return { cuentaId, usuarioId };
    });
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorApi(409, ["Ya existe una cuenta con ese correo."]);
    throw error;
  }
}

export interface Usuario {
  id: number;
  cuentaId: number;
  email: string;
  claveHash: string;
  rol: RolUsuario;
}

const aUsuario = (f: Fila): Usuario => ({
  id: Number(f.id), cuentaId: Number(f.cuenta_id), email: String(f.email), claveHash: String(f.clave_hash),
  rol: f.rol as RolUsuario,
});

/** El usuario con ese correo (sin distinguir mayúsculas), o undefined. */
export async function buscarUsuarioPorEmail(db: Base, email: string): Promise<Usuario | undefined> {
  const f = await uno(db, "SELECT id, cuenta_id, email, clave_hash, rol FROM usuarios WHERE lower(email) = lower(?)", email);
  return f && aUsuario(f);
}

export async function buscarUsuario(db: Base, id: number): Promise<Usuario | undefined> {
  const f = await uno(db, "SELECT id, cuenta_id, email, clave_hash, rol FROM usuarios WHERE id = ?", id);
  return f && aUsuario(f);
}

export async function buscarCuenta(db: Base, id: number): Promise<Cuenta | undefined> {
  const f = await uno(db, "SELECT id, nombre, ruc, separar_funciones FROM cuentas WHERE id = ?", id);
  return f && {
    id: Number(f.id), nombre: String(f.nombre), ruc: String(f.ruc), separarFunciones: Boolean(f.separar_funciones),
  };
}

/** Cambia el nombre y el RUC de la empresa; los de la plantilla no se editan. */
export async function actualizarEmpresa(db: Base, id: number, cuerpo: Record<string, unknown>): Promise<Cuenta> {
  if (id === CUENTA_PLANTILLA) throw new ErrorApi(403, ["La plantilla del sistema no se edita."]);
  const errores: string[] = [];
  const empresa = leerEmpresa(cuerpo, errores);
  if (cuerpo.separarFunciones !== undefined && typeof cuerpo.separarFunciones !== "boolean") {
    errores.push("separarFunciones debe ser verdadero o falso.");
  }
  if (errores.length) throw new ErrorApi(400, errores);
  await ejecutar(db, "UPDATE cuentas SET nombre = ?, ruc = ? WHERE id = ?", empresa.nombre, empresa.ruc, id);
  if (typeof cuerpo.separarFunciones === "boolean") {
    await ejecutar(
      db, `UPDATE cuentas SET separar_funciones = ${cuerpo.separarFunciones ? "TRUE" : "FALSE"} WHERE id = ?`, id,
    );
  }
  const cuenta = await buscarCuenta(db, id);
  if (!cuenta) throw new ErrorApi(404, ["La cuenta no existe."]);
  return cuenta;
}
