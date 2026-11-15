/** Exportar y eliminar una cuenta completa: todo lo que una empresa guardó en el sistema. */
import { consultar, ejecutar, transaccion, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { CUENTA_PLANTILLA } from "./cuentas.ts";
import { ErrorApi } from "./validaciones.ts";

/** Tablas con `cuenta_id` propio, en el orden en que salen en la exportación. */
const TABLAS_DE_LA_CUENTA = [
  "regimenes", "parametros_anuales", "escala_salarial", "puestos", "empleados", "prestamos_iess", "vacaciones_gozadas", "roles_cabecera", "audit_logs",
] as const;

/** Un campo de texto que guarda JSON sale ya como objeto, para que el archivo se lea. */
const comoJson = (valor: string | number | null) => {
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor) as unknown;
  } catch {
    return valor;
  }
};

const conJson = (campo: string) => (f: Fila) => ({ ...f, [campo]: comoJson(f[campo]) });

/**
 * Todo lo de la cuenta en un solo objeto: la empresa, sus usuarios (sin contraseñas), empleados, novedades,
 * reglas de ley, escala, orgánico, roles con su detalle y desglose, y el registro de auditoría.
 */
export async function exportarCuenta(db: Base, cuentaId: number) {
  const cuenta = await uno(db, "SELECT id, nombre, ruc, separar_funciones, creada_en FROM cuentas WHERE id = ?", cuentaId);
  if (!cuenta || cuentaId === CUENTA_PLANTILLA) throw new ErrorApi(404, ["La cuenta no existe."]);

  const datos: Record<string, Fila[]> = {};
  for (const tabla of TABLAS_DE_LA_CUENTA) {
    datos[tabla] = await consultar(db, `SELECT * FROM ${tabla} WHERE cuenta_id = ? ORDER BY 1`, cuentaId);
  }
  const usuarios = await consultar(
    db, "SELECT id, email, rol, email_verificado_en, creado_en FROM usuarios WHERE cuenta_id = ? ORDER BY id", cuentaId,
  );
  const novedades = await consultar(
    db,
    `SELECT n.* FROM novedades n JOIN empleados e ON e.id = n.empleado_id
     WHERE e.cuenta_id = ? ORDER BY n.empleado_id, n.anio, n.mes`,
    cuentaId,
  );
  const detalle = (
    await consultar(
      db,
      `SELECT d.* FROM roles_detalle d JOIN roles_cabecera r ON r.id = d.rol_id
       WHERE r.cuenta_id = ? ORDER BY d.rol_id, d.id`,
      cuentaId,
    )
  ).map(conJson("traza"));

  return {
    formato: "rol-pagos-ecuador/cuenta@1",
    exportadoEn: new Date().toISOString(),
    cuenta: { nombre: cuenta.nombre, ruc: cuenta.ruc, separarFunciones: Boolean(cuenta.separar_funciones), creadaEn: cuenta.creada_en },
    usuarios,
    ...datos,
    novedades,
    rolesDetalle: detalle,
    nota: "Las contraseñas no se exportan. Las cifras de dinero están tal como se guardaron.",
  };
}

/**
 * Borra la cuenta y todo lo suyo, sin dejar nada: usuarios, empleados, roles publicados y la auditoría.
 * Es irreversible. La auditoría solo se deja borrar dentro de esta transacción (migración 020).
 */
export async function eliminarCuenta(db: Base, cuentaId: number): Promise<void> {
  if (cuentaId === CUENTA_PLANTILLA) throw new ErrorApi(403, ["La plantilla del sistema no se elimina."]);
  await transaccion(db, async (tx) => {
    await consultar(tx, "SELECT set_config('rolpagos.eliminando_cuenta', ?, true)", String(cuentaId));
    await ejecutar(tx, "DELETE FROM audit_logs WHERE cuenta_id = ?", cuentaId);
    const { changes } = await ejecutar(tx, "DELETE FROM cuentas WHERE id = ?", cuentaId);
    if (!changes) throw new ErrorApi(404, ["La cuenta no existe."]);
  });
}
