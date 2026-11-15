/**
 * Ciclo de vida del rol: calculado -> validado -> aprobado -> publicado -> pagado.
 * Un rol publicado o pagado es inmutable. Cada paso se registra en la auditoría.
 */
import { Decimal } from "decimal.js";

import { registrarAuditoria } from "./auditoria.ts";
import { transaccion, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { ErrorApi } from "./validaciones.ts";

export type EstadoRol = "calculado" | "validado" | "aprobado" | "publicado" | "pagado";

/** Desde qué estados se puede dar cada paso, a cuál lleva y en qué columna queda su fecha. */
const TRANSICIONES = {
  validar: { desde: ["calculado", "validado"], hasta: "validado", columna: "validado_en", verbo: "validar" },
  aprobar: { desde: ["validado"], hasta: "aprobado", columna: "aprobado_en", verbo: "aprobar" },
  publicar: { desde: ["aprobado"], hasta: "publicado", columna: "publicado_en", verbo: "publicar" },
  pagar: { desde: ["publicado"], hasta: "pagado", columna: "pagado_en", verbo: "marcar como pagado" },
} as const;
export type AccionCiclo = keyof typeof TRANSICIONES;

/** Un rol publicado o pagado ya no se recalcula, se edita ni se elimina. */
export const esInmutable = (estado: unknown) => estado === "publicado" || estado === "pagado";

const ahora = () => new Date().toISOString().slice(0, 19);
const periodo = (rol: Fila) => `${rol.anio}-${String(rol.mes).padStart(2, "0")}`;

function errorDeEstado(rol: Fila, accion: AccionCiclo) {
  return new ErrorApi(409, [
    `El rol de ${periodo(rol)} está «${rol.estado}»: no se puede ${TRANSICIONES[accion].verbo}.`,
  ]);
}

/** Falla con 409 si el rol no está en un estado desde el que se pueda dar el paso. */
export function exigirPaso(rol: Fila, accion: AccionCiclo): void {
  if (!(TRANSICIONES[accion].desde as readonly string[]).includes(String(rol.estado))) throw errorDeEstado(rol, accion);
}

/**
 * Da el paso y lo audita en la misma transacción. El UPDATE condicionado al estado anterior es la
 * garantía: si dos personas publican a la vez, solo una lo logra y la otra recibe 409.
 */
export async function darPaso(
  db: Base, cuentaId: number, usuarioId: number | null, rolId: number, accion: AccionCiclo, detalle?: unknown,
): Promise<void> {
  const t = TRANSICIONES[accion];
  await transaccion(db, async (tx) => {
    const { afectadas } = await tx.consultar(
      `UPDATE roles_cabecera SET estado = ?, ${t.columna} = ?
       WHERE cuenta_id = ? AND id = ? AND estado IN (${t.desde.map(() => "?").join(", ")})`,
      [t.hasta, ahora(), cuentaId, rolId, ...t.desde],
    );
    if (!afectadas) {
      const rol = await uno(tx, "SELECT anio, mes, estado FROM roles_cabecera WHERE cuenta_id = ? AND id = ?", cuentaId, rolId);
      throw rol ? errorDeEstado(rol, accion) : new ErrorApi(404, ["El rol no existe."]);
    }
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: `rol.${t.hasta}`, entidad: "rol", entidadId: rolId, detalle,
    });
  });
}

/** La validación falló: un rol «validado» vuelve a «calculado» y queda constancia de por qué. */
export async function rechazarValidacion(
  db: Base, cuentaId: number, usuarioId: number, rolId: number, errores: string[],
): Promise<void> {
  await transaccion(db, async (tx) => {
    await tx.consultar(
      `UPDATE roles_cabecera SET estado = 'calculado', validado_en = NULL
       WHERE cuenta_id = ? AND id = ? AND estado = 'validado'`,
      [cuentaId, rolId],
    );
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: "rol.validacion_rechazada", entidad: "rol", entidadId: rolId, detalle: { errores },
    });
  });
}

export interface RevisionRol {
  /** Bloquean: el rol no puede pasar a «validado» ni publicarse mientras haya alguno. */
  errores: string[];
  /** Valores raros que merecen una mirada, pero no bloquean. */
  avisos: string[];
}

const redondeo = (n: Decimal.Value) => new Decimal(n).toDecimalPlaces(2).toNumber();

/**
 * Revisa un rol ya calculado. `empleadosDelPeriodo` son quienes deberían estar en él hoy;
 * `anioParametros` es el año de los parámetros de ley que se aplican a ese período.
 * Un ajuste (`ajuste`) guarda diferencias: puede dar neto negativo o cero y sus valores no se comparan
 * con el sueldo, así que esas revisiones no aplican.
 */
export function revisarRol(
  cabecera: Fila, detalle: Fila[], empleadosDelPeriodo: Fila[], anioParametros: number, ajuste = false,
): RevisionRol {
  const errores: string[] = [];
  const avisos: string[] = [];

  if (!detalle.length) errores.push("El rol no tiene ningún empleado.");
  if (anioParametros !== Number(cabecera.anio)) {
    errores.push(
      `No hay parámetros de ley de ${cabecera.anio}; el rol se calculó con los de ${anioParametros}. ` +
        "Cárgalos en Parámetros y recalcula el rol.",
    );
  }

  const enRol = new Set(detalle.map((d) => Number(d.empleado_id)));
  for (const e of empleadosDelPeriodo) {
    if (!enRol.has(Number(e.id))) errores.push(`${e.nombres} debería estar en este período y no está en el rol: recalcúlalo.`);
  }

  for (const d of ajuste ? [] : detalle) {
    if (Number(d.neto_pagar) < 0) errores.push(`${d.nombres}: el neto a pagar es negativo (${d.neto_pagar}).`);
    else if (Number(d.neto_pagar) === 0) avisos.push(`${d.nombres}: el neto a pagar es $0.`);
    if (Number(d.total_ingresos) > 2 * Number(d.sueldo_base)) {
      avisos.push(`${d.nombres}: los ingresos (${d.total_ingresos}) superan el doble de su sueldo base (${d.sueldo_base}).`);
    }
  }

  const suma = (campo: string) => detalle.reduce((s, d) => s.plus(Number(d[campo])), new Decimal(0));
  if (detalle.length !== Number(cabecera.num_empleados)) {
    errores.push(`La cabecera dice ${cabecera.num_empleados} empleados y el detalle tiene ${detalle.length}.`);
  }
  for (const [campo, nombre] of [
    ["total_ingresos", "ingresos"], ["total_descuentos", "descuentos"], ["neto_pagar", "neto"],
    ["total_provisiones", "provisiones"], ["costo_empleador", "costo empleador"],
  ] as const) {
    const cabeceraCampo = campo === "neto_pagar" ? "total_neto" : campo === "costo_empleador" ? "total_costo" : campo;
    if (redondeo(suma(campo)) !== redondeo(Number(cabecera[cabeceraCampo]))) {
      errores.push(`El total de ${nombre} de la cabecera no cuadra con la suma del detalle.`);
    }
  }
  return { errores, avisos };
}
