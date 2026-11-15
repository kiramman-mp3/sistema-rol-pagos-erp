/** Cálculo de los empleados de un mes con las reglas de ese mes: lo comparten los roles y los ajustes. */
import { Decimal } from "decimal.js";

import { avisoHorasIgnoradas, avisosDeTopes, calcularRolConTraza } from "./calculos.ts";
import type { PasoCalculo, ResultadoRol } from "./calculos.ts";
import { aSnake, ejecutar } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { cuotasDelMes } from "./prestamos.ts";
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
  /** Cuota de préstamos del IESS de este mes. Si falta, se busca en los préstamos registrados del empleado. */
  prestamos?: Decimal;
}

/** Con qué reglas se calculó a un empleado, para poder explicarlo después. */
export interface ContextoCalculo {
  /** Régimen que se aplicó y desde qué fecha regía esa versión de sus reglas. */
  regimen: string;
  vigenteDesde: string;
  /** Año de los parámetros de ley que se usaron (el SBU y la tabla del impuesto). */
  anioParametros: number;
  sbu: number;
  /** Un ajuste guarda la diferencia, pero esta traza explica el cálculo completo del mes. */
  ajuste?: boolean;
}

export interface TrazaGuardada {
  contexto: ContextoCalculo;
  pasos: PasoCalculo[];
}

export interface CalculoEmpleado {
  e: Fila;
  resultado: ResultadoRol;
  n: Novedad | undefined;
  aplicado: Regimen;
  traza: TrazaGuardada;
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
  const cuotas = await cuotasDelMes(db, cuentaId, anio, mes);
  const reglasYOpciones = entradas.map(({ e, aplicadoCodigo, prestamos }) => {
    const n = novedades.get(Number(e.id));
    const aplicado = aplicadoCodigo
      ? regimenAplicado(regimenes, aplicadoCodigo, null)
      : regimenAplicado(regimenes, String(e.regimen), e.categoria_loep as string | null);
    const reglas = reglasDe(parametros, aplicado);
    const opciones = opcionesDe(aplicado, e);
    const { resultado, traza } = calcularRolConTraza({
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
      prestamosIess: prestamos ?? cuotas.get(Number(e.id)) ?? cero,
      gastosPersonales: Number(e.gastos_personales ?? 0),
      cargasFamiliares: Number(e.cargas_familiares ?? 0),
      enfermedadCatastrofica: Number(e.enfermedad_catastrofica ?? 0) === 1,
    }, reglas, opciones);
    const contexto: ContextoCalculo = {
      regimen: aplicado.codigo, vigenteDesde: aplicado.vigenteDesde, anioParametros: parametros.anio, sbu: parametros.sbu,
    };
    return { e, resultado, n, aplicado, reglas, opciones, traza: { contexto, pasos: traza.pasos } };
  });

  const avisos = reglasYOpciones.flatMap(({ e, n, reglas, opciones }) => {
    if (!n) return [];
    const nombre = String(e.nombres);
    return opciones.recibeHorasExtras ? avisosDeTopes(nombre, n, reglas) : avisoHorasIgnoradas(nombre, n);
  });
  // Un préstamo no debe dejar el neto en negativo: el descuento se hace igual, pero se avisa.
  for (const { e, resultado } of reglasYOpciones) {
    if (resultado.descuentoPrestamos > 0 && resultado.netoPagar < 0) {
      avisos.push(`${String(e.nombres)}: los descuentos (con $${resultado.descuentoPrestamos} de préstamos del IESS) superan sus ingresos; el neto queda en negativo.`);
    }
  }
  const sinParametros = avisoDeAnioSinParametros(anio, parametros);
  if (sinParametros) avisos.unshift(sinParametros);
  // Quien declaró gastos personales no recibe la rebaja si el año no tiene canasta básica definida.
  if (parametros.canastaBasica <= 0 && entradas.some(({ e }) => Number(e.gastos_personales ?? 0) > 0)) {
    avisos.unshift(`Hay empleados con gastos personales, pero los parámetros de ${parametros.anio} no tienen canasta básica: no se aplicó la rebaja del impuesto a la renta.`);
  }

  return { calculos: reglasYOpciones.map(({ e, resultado, n, aplicado, traza }) => ({ e, resultado, n, aplicado, traza })), avisos };
}

/** Suma un campo del resultado de todos los empleados, con decimales exactos. */
export const totalDe = (calculos: { resultado: ResultadoRol }[], campo: keyof ResultadoRol): number =>
  calculos.reduce((suma, c) => suma.plus(c.resultado[campo]), new Decimal(0)).toNumber();

/** Guarda la fila de detalle de un empleado en un rol. */
export async function insertarDetalle(
  tx: Base, rolId: number, c: { e: Fila; resultado: ResultadoRol; aplicado: Regimen; traza?: TrazaGuardada },
  empleadoId: number | null = Number(c.e.id),
): Promise<void> {
  const { e, resultado, aplicado } = c;
  const fila: Fila = {
    rol_id: rolId, empleado_id: empleadoId, cedula: e.cedula, nombres: e.nombres,
    cargo: e.cargo, sueldo_base: e.sueldo_base, fecha_ingreso: e.fecha_ingreso,
    regimen: e.regimen, regimen_aplicado: aplicado.codigo,
    tasa_iess_personal: aplicado.iessPersonal, tasa_iess_patronal: aplicado.iessPatronal,
    traza: c.traza ? JSON.stringify(c.traza) : null,
    // Lo que el empleado declaró, como se usó en este rol.
    gastos_personales: e.gastos_personales ?? 0, cargas_familiares: e.cargas_familiares ?? 0,
    enfermedad_catastrofica: e.enfermedad_catastrofica ?? 0,
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
