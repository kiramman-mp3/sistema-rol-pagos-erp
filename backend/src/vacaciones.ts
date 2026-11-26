/**
 * Vacaciones gozadas y saldo de cada empleado (migración 023).
 *
 * Los días se devengan de forma proporcional al tiempo de servicio, con la misma base de 30 días por mes
 * que usa el rol: días por año del régimen × días de servicio ÷ 360. El saldo es lo devengado menos lo
 * gozado. Los días de un periodo son días calendario (el Código del Trabajo, art. 69, cuenta también los
 * no laborables). No se suman los días adicionales por antigüedad.
 */
import { Decimal } from "decimal.js";

import { consultar } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { indexarRegimenes, listarRegimenes, regimenAplicado } from "./regimenes.ts";

const aUtc = (fecha: string) => {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
};

/** Días calendario de un periodo, con el primero y el último incluidos. */
export const diasEntre = (desde: string, hasta: string): number => Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000) + 1;

/** Días de servicio con la base de 30 días por mes; el día de ingreso cuenta. */
export function diasDeServicio(ingreso: string, corte: string): number {
  if (corte < ingreso) return 0;
  const [a1, m1, d1] = ingreso.split("-").map(Number);
  const [a2, m2, d2] = corte.split("-").map(Number);
  return (a2 - a1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30)) + 1;
}

/** Días de vacaciones devengados hasta la fecha de corte, a dos decimales. */
export function diasDevengados(ingreso: string, corte: string, diasPorAnio: number): number {
  return new Decimal(diasPorAnio).times(diasDeServicio(ingreso, corte)).div(360).toDecimalPlaces(2).toNumber();
}

export interface SaldoVacaciones {
  /** Días de vacaciones al año del régimen que se le aplica */
  diasPorAnio: number;
  devengados: number;
  gozados: number;
  /** Puede ser negativo: tomó más de lo devengado */
  saldo: number;
}

/** Saldo a la fecha de corte; `gozados` son los días ya tomados. */
export function saldoDeVacaciones(ingreso: string, corte: string, diasPorAnio: number, gozados: number): SaldoVacaciones {
  const devengados = diasDevengados(ingreso, corte, diasPorAnio);
  return { diasPorAnio, devengados, gozados, saldo: new Decimal(devengados).minus(gozados).toDecimalPlaces(2).toNumber() };
}

/** Los días por año que da el régimen aplicado a un empleado; 0 si ese régimen no los define. */
export async function diasPorAnioDe(db: Base, cuentaId: number, empleados: Fila[], fecha: string): Promise<Map<number, number>> {
  const regimenes = indexarRegimenes(await listarRegimenes(db, cuentaId, fecha));
  return new Map(empleados.map((e) => {
    let dias = 0;
    try {
      dias = regimenAplicado(regimenes, String(e.regimen), e.categoria_loep as string | null).diasVacaciones ?? 0;
    } catch {
      /* un régimen que ya no existe: sin días definidos */
    }
    return [Number(e.id), dias];
  }));
}

/** Días ya gozados por cada empleado de la cuenta. */
export async function diasGozados(db: Base, cuentaId: number): Promise<Map<number, number>> {
  const filas = await consultar(
    db, "SELECT empleado_id, SUM(dias) AS dias FROM vacaciones_gozadas WHERE cuenta_id = ? GROUP BY empleado_id", cuentaId,
  );
  return new Map(filas.map((f) => [Number(f.empleado_id), Number(f.dias)]));
}
