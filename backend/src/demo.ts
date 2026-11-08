/** Datos de ejemplo: empleados del orgánico funcional y, para el seed, sus roles de pago. */
import { Decimal } from "decimal.js";
import { EMPLEADOS_DEMO } from "./config.ts";
import { darPaso } from "./ciclo.ts";
import { ejecutar } from "./db.ts";
import type { Base } from "./db.ts";
import { empleadosDelPeriodo, guardarRol } from "./rutas/roles.ts";
import type { Novedad } from "./rutas/roles.ts";

/** Inserta los empleados de ejemplo que falten (por cédula) con su puesto y su grado, y deja a cada puesto su responsable. Devuelve cuántos agregó. */
export async function cargarEmpleadosDemo(db: Base, cuentaId: number): Promise<number> {
  let nuevos = 0;
  for (const e of EMPLEADOS_DEMO) {
    const r = await ejecutar(
      db,
      `INSERT INTO empleados (cuenta_id, cedula, nombres, cargo, sueldo_base, fecha_ingreso,
       tipo_contrato, regimen, categoria_loep, escala_id, puesto_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
               (SELECT id FROM escala_salarial WHERE cuenta_id = ? AND regimen = ? AND grado = ?),
               (SELECT id FROM puestos WHERE cuenta_id = ? AND nombre = ?))
       ON CONFLICT (cuenta_id, cedula) DO NOTHING`,
      cuentaId, e.cedula, e.nombres, e.cargo, e.sueldoBase, e.fechaIngreso, e.tipoContrato, e.regimen, e.categoriaLoep,
      cuentaId, e.escalaRegimen, e.escalaGrado, cuentaId, e.puesto,
    );
    nuevos += r.changes;
    if (e.puesto && e.responsable) {
      await ejecutar(
        db,
        `UPDATE puestos SET responsable_id = (SELECT id FROM empleados WHERE cuenta_id = ? AND cedula = ?)
         WHERE cuenta_id = ? AND nombre = ? AND responsable_id IS NULL`,
        cuentaId, e.cedula, cuentaId, e.puesto,
      );
    }
  }
  return nuevos;
}

/** Año y meses de los roles de ejemplo: todo el año 2026 hasta septiembre (octubre queda para generarlo a mano). */
export const ANIO_DEMO = 2026;
export const MESES_DEMO = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Número fijo derivado de empleado y mes: las novedades de ejemplo son siempre las mismas. */
const variacion = (empleadoId: number, mes: number) => (empleadoId * 7 + mes * 13) % 17;

/** Horas suplementarias y extraordinarias de un mes según el puesto; null si el puesto no tiene novedades. */
function horasDelPuesto(puesto: string, v: number): [number, number] | null {
  if (puesto === "Operaciones de instalaciones") return [4 + (v % 9), v % 4 === 0 ? 4 : 0];
  if (puesto === "Supervisor de instalaciones") return [2 + (v % 5), 0];
  if (puesto === "Auxiliar de guardalmacén") return [v % 7, 0];
  return null;
}

/**
 * Novedades de ejemplo de un mes: el personal de campo hace algunas horas extras y de vez en cuando
 * tiene un anticipo descontado. Gerencia, administración y el personal público no tienen novedades.
 */
async function novedadesDemo(db: Base, cuentaId: number, anio: number, mes: number): Promise<Map<number, Novedad>> {
  const cero = new Decimal(0);
  const novedades = new Map<number, Novedad>();
  for (const e of await empleadosDelPeriodo(db, cuentaId, anio, mes)) {
    const id = Number(e.id);
    const v = variacion(id, mes);
    if (e.regimen !== "CODIGO_TRABAJO") continue;
    const horas = horasDelPuesto(String(e.cargo), v);
    if (!horas) continue;
    const [suplementarias, extraordinarias] = horas;
    novedades.set(id, {
      horasSuplementarias: new Decimal(suplementarias),
      horasExtraordinarias: new Decimal(extraordinarias),
      horasDescanso: cero,
      horasNocturnas: cero,
      comisiones: cero,
      otrosDescuentos: new Decimal(mes % 3 === 0 && v % 2 === 0 ? 25 : 0),
    });
  }
  return novedades;
}

/** Último mes de ejemplo ya pagado; el siguiente (septiembre) queda publicado y falta marcar su pago. */
export const ULTIMO_MES_PAGADO_DEMO = 8;

const PASOS_DEL_CICLO = ["validar", "aprobar", "publicar", "pagar"] as const;

/**
 * Genera los roles de ejemplo de enero a septiembre y los lleva por el ciclo como «sistema»:
 * enero a agosto quedan pagados y septiembre publicado, para que la demostración muestre cada estado.
 * Devuelve cuántos generó.
 */
export async function generarRolesDemo(db: Base, cuentaId: number): Promise<number> {
  let generados = 0;
  for (const mes of MESES_DEMO) {
    const empleados = await empleadosDelPeriodo(db, cuentaId, ANIO_DEMO, mes);
    if (!empleados.length) continue;
    const { rolId } = await guardarRol(
      db, cuentaId, ANIO_DEMO, mes, empleados, await novedadesDemo(db, cuentaId, ANIO_DEMO, mes),
    );
    const pasos = mes <= ULTIMO_MES_PAGADO_DEMO ? PASOS_DEL_CICLO : PASOS_DEL_CICLO.slice(0, 3);
    for (const paso of pasos) await darPaso(db, cuentaId, null, rolId, paso);
    generados += 1;
  }
  return generados;
}
