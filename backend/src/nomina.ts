/** Cálculo de los empleados de un mes con las reglas de ese mes: lo comparten los roles y los ajustes. */
import { Decimal } from "decimal.js";

import { avisoHorasIgnoradas, avisosDeTopes, calcularRol } from "./calculos.ts";
import type { ResultadoRol } from "./calculos.ts";
import { aSnake, ejecutar } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { avisoDeAnioSinParametros, parametrosDelAnio } from "./parametros.ts";
import {
  fechaDeCierre, indexarRegimenes, listarRegimenes, opcionesDe, regimenAplicado, reglasDe,
} from "./regimenes.ts";
import type { Regimen } from "./regimenes.ts";

export const CAMPOS_NOVEDAD = [
  "horasSuplementarias", "horasExtraordinarias", "horasDescanso", "horasNocturnas",
  "comisiones", "otrosDescuentos",
] as const;
export type Novedad = Record<(typeof CAMPOS_NOVEDAD)[number], Decimal>;
export const COLUMNAS_NOVEDAD = CAMPOS_NOVEDAD.map(aSnake);

/** Un empleado a calcular. `aplicadoCodigo` fija el régimen que se aplica, en vez de deducirlo del empleado. */
export interface EntradaMes {
  e: Fila;
  aplicadoCodigo?: string;
}

export interface CalculoEmpleado {
  e: Fila;
  resultado: ResultadoRol;
  n: Novedad | undefined;
  aplicado: Regimen;
}

/**
 * Calcula a cada empleado con las reglas que regían al cierre del mes (no las de hoy) y reúne los avisos
 * (topes de horas, horas ignoradas y parámetros de otro año).
 */
export async function calcularMes(
  db: Base, cuentaId: number, anio: number, mes: number,
  entradas: EntradaMes[], novedades: Map<number, Novedad>,
): Promise<{ calculos: CalculoEmpleado[]; avisos: string[] }> {
  const cero = new Decimal(0);
  const { parametros } = await parametrosDelAnio(db, cuentaId, anio);
  const regimenes = indexarRegimenes(await listarRegimenes(db, cuentaId, fechaDeCierre(anio, mes)));
  const reglasYOpciones = entradas.map(({ e, aplicadoCodigo }) => {
    const n = novedades.get(Number(e.id));
    const aplicado = aplicadoCodigo
      ? regimenAplicado(regimenes, aplicadoCodigo, null)
      : regimenAplicado(regimenes, String(e.regimen), e.categoria_loep as string | null);
    const reglas = reglasDe(parametros, aplicado);
    const opciones = opcionesDe(aplicado, e);
    const resultado = calcularRol({
      sueldoBase: String(e.sueldo_base),
      fechaIngreso: String(e.fecha_ingreso),
      fechaSalida: e.fecha_salida === null || e.fecha_salida === undefined ? null : String(e.fecha_salida),
      anio, mes,
      horasSuplementarias: n?.horasSuplementarias ?? cero,
      horasExtraordinarias: n?.horasExtraordinarias ?? cero,
      horasDescanso: n?.horasDescanso ?? cero,
      horasNocturnas: n?.horasNocturnas ?? cero,
      comisiones: n?.comisiones ?? cero,
      otrosDescuentos: n?.otrosDescuentos ?? cero,
    }, reglas, opciones);
    return { e, resultado, n, aplicado, reglas, opciones };
  });

  const avisos = reglasYOpciones.flatMap(({ e, n, reglas, opciones }) => {
    if (!n) return [];
    const nombre = String(e.nombres);
    return opciones.recibeHorasExtras ? avisosDeTopes(nombre, n, reglas) : avisoHorasIgnoradas(nombre, n);
  });
  const sinParametros = avisoDeAnioSinParametros(anio, parametros);
  if (sinParametros) avisos.unshift(sinParametros);

  return { calculos: reglasYOpciones.map(({ e, resultado, n, aplicado }) => ({ e, resultado, n, aplicado })), avisos };
}

/** Suma un campo del resultado de todos los empleados, con decimales exactos. */
export const totalDe = (calculos: { resultado: ResultadoRol }[], campo: keyof ResultadoRol): number =>
  calculos.reduce((suma, c) => suma.plus(c.resultado[campo]), new Decimal(0)).toNumber();

/** Guarda la fila de detalle de un empleado en un rol. */
export async function insertarDetalle(
  tx: Base, rolId: number, c: { e: Fila; resultado: ResultadoRol; aplicado: Regimen },
  empleadoId: number | null = Number(c.e.id),
): Promise<void> {
  const { e, resultado, aplicado } = c;
  const fila: Fila = {
    rol_id: rolId, empleado_id: empleadoId, cedula: e.cedula, nombres: e.nombres,
    cargo: e.cargo, sueldo_base: e.sueldo_base, fecha_ingreso: e.fecha_ingreso,
    regimen: e.regimen, regimen_aplicado: aplicado.codigo,
    tasa_iess_personal: aplicado.iessPersonal, tasa_iess_patronal: aplicado.iessPatronal,
    ...Object.fromEntries(Object.entries(resultado).map(([k, v]) => [aSnake(k), v])),
  };
  const columnas = Object.keys(fila);
  await ejecutar(
    tx,
    `INSERT INTO roles_detalle (${columnas.join(", ")})
     VALUES (${columnas.map(() => "?").join(", ")})`,
    ...Object.values(fila),
  );
}
