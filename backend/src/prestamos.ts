/**
 * Préstamos del IESS que el empleador descuenta en el rol (migración 022).
 *
 * El IESS fija la cuota y el número de cuotas de cada préstamo: aquí se registran tal cual y el rol
 * descuenta una cuota por mes, desde el mes indicado hasta completarlas. No se calcula interés.
 */
import { Decimal } from "decimal.js";

import { consultar } from "./db.ts";
import type { Base, Fila } from "./db.ts";

export const TIPOS_PRESTAMO = ["quirografario", "hipotecario", "prendario"] as const;
export type TipoPrestamo = (typeof TIPOS_PRESTAMO)[number];

export interface Prestamo {
  id: number;
  empleadoId: number;
  tipo: TipoPrestamo;
  cuota: number;
  cuotas: number;
  primerAnio: number;
  primerMes: number;
  activo: boolean;
}

/** Número de cuota que toca en ese mes (1 = la primera), o `null` si el préstamo no se descuenta ese mes. */
export function numeroDeCuota(p: Pick<Prestamo, "cuotas" | "primerAnio" | "primerMes" | "activo">, anio: number, mes: number): number | null {
  if (!p.activo) return null;
  const numero = (anio - p.primerAnio) * 12 + (mes - p.primerMes) + 1;
  return numero >= 1 && numero <= p.cuotas ? numero : null;
}

/** Lo que se descuenta en el mes por todos los préstamos activos de un empleado. */
export function cuotaDelMes(prestamos: Prestamo[], anio: number, mes: number): Decimal {
  return prestamos.reduce(
    (suma, p) => (numeroDeCuota(p, anio, mes) === null ? suma : suma.plus(p.cuota)), new Decimal(0),
  );
}

export const aPrestamo = (f: Fila): Prestamo => ({
  id: Number(f.id), empleadoId: Number(f.empleado_id), tipo: f.tipo as TipoPrestamo, cuota: Number(f.cuota),
  cuotas: Number(f.cuotas), primerAnio: Number(f.primer_anio), primerMes: Number(f.primer_mes), activo: Number(f.activo) === 1,
});

/** Cuántas cuotas del mes descuenta cada empleado: el `Map` solo trae a quien tiene algo que descontar. */
export async function cuotasDelMes(db: Base, cuentaId: number, anio: number, mes: number): Promise<Map<number, Decimal>> {
  const filas = await consultar(db, "SELECT * FROM prestamos_iess WHERE cuenta_id = ? AND activo = 1", cuentaId);
  const porEmpleado = new Map<number, Prestamo[]>();
  for (const f of filas) {
    const p = aPrestamo(f);
    porEmpleado.set(p.empleadoId, [...(porEmpleado.get(p.empleadoId) ?? []), p]);
  }
  const cuotas = new Map<number, Decimal>();
  for (const [empleadoId, prestamos] of porEmpleado) {
    const cuota = cuotaDelMes(prestamos, anio, mes);
    if (cuota.gt(0)) cuotas.set(empleadoId, cuota);
  }
  return cuotas;
}
