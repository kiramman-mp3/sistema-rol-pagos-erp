/**
 * Liquidación de un empleado que sale (migración 024): lo que se le paga además del último rol.
 *
 * Es una función pura: no toca la base de datos. El sueldo del mes de salida no entra aquí porque ya lo paga
 * el rol de ese mes (la fecha de salida prorratea el último mes). Entra lo que ningún rol paga:
 * los décimos acumulados, las vacaciones no gozadas y las indemnizaciones según la causa de la salida.
 *
 * Los arts. 185 y 188 del Código del Trabajo y las regiones del décimo cuarto (art. 113) están confirmados en el texto
 * oficial. Siguen «por confirmar» en el README la renuncia sin aviso de desahucio y la fracción de año del art. 185.
 */
import { Decimal } from "decimal.js";

import { q } from "./calculos.ts";
import type { Modalidad } from "./calculos.ts";
import { diasDeServicio } from "./vacaciones.ts";

type Monto = Decimal.Value;
const D = (valor: Monto) => new Decimal(valor);

export const CAUSAS = [
  "renuncia", "acuerdo", "desahucio", "despido_intempestivo", "visto_bueno_empleador", "visto_bueno_trabajador", "fin_contrato",
] as const;
export type CausaSalida = (typeof CAUSAS)[number];

export const ETIQUETA_CAUSA: Record<CausaSalida, string> = {
  renuncia: "Renuncia voluntaria",
  acuerdo: "Terminación por acuerdo de las partes",
  desahucio: "Desahucio",
  despido_intempestivo: "Despido intempestivo",
  visto_bueno_empleador: "Visto bueno a favor del empleador",
  visto_bueno_trabajador: "Visto bueno a favor del trabajador",
  fin_contrato: "Fin del plazo del contrato",
};

/** Causas con bonificación del 25 % por cada año de servicio (Código del Trabajo, art. 185). */
export const CAUSAS_CON_BONIFICACION: readonly CausaSalida[] = ["acuerdo", "desahucio", "despido_intempestivo", "visto_bueno_trabajador"];
/** Causas con la indemnización del art. 188. */
export const CAUSAS_CON_INDEMNIZACION: readonly CausaSalida[] = ["despido_intempestivo", "visto_bueno_trabajador"];

/** Región que fija el periodo del décimo cuarto: Sierra y Amazonía de agosto a julio, Costa y Galápagos de marzo a febrero. */
export const REGIONES = ["sierra", "costa"] as const;
export type Region = (typeof REGIONES)[number];

/** Tope de meses de la indemnización por despido intempestivo. */
const TOPE_MESES_INDEMNIZACION = 25;

export interface EntradaLiquidacion {
  sueldoBase: Monto;
  fechaIngreso: string;
  fechaSalida: string;
  causa: CausaSalida;
  region: Region;
  /** SBU del año de la salida: base del décimo cuarto */
  sbu: Monto;
  /** Cómo cobra el décimo cuarto: solo el «acumulado» se paga aquí */
  decimoCuarto: Modalidad;
  /** Décimo tercero que los roles dejaron provisionado desde el 1 de diciembre y aún no se ha pagado */
  decimoTerceroProvisionado: Monto;
  /** Días de vacaciones devengados menos los gozados; si es negativo no se cobra al trabajador */
  saldoVacaciones: Monto;
}

export interface RubroLiquidacion {
  clave: "decimoTercero" | "decimoCuarto" | "vacaciones" | "bonificacionDesahucio" | "indemnizacion";
  concepto: string;
  formula: string;
  detalle: string;
  valor: number;
  fuente?: string;
}

export interface ResultadoLiquidacion {
  /** Años de servicio, con fracción (días de servicio ÷ 360) */
  anios: number;
  diasServicio: number;
  rubros: RubroLiquidacion[];
  total: number;
}

const m = (valor: Decimal) => valor.toFixed(2);

/** Primer día del periodo del décimo cuarto que termina con la salida. */
export function inicioDecimoCuarto(fechaSalida: string, region: Region): string {
  const [anio, mes] = fechaSalida.split("-").map(Number);
  const mesInicio = region === "sierra" ? 8 : 3;
  const anioInicio = mes >= mesInicio ? anio : anio - 1;
  return `${anioInicio}-${String(mesInicio).padStart(2, "0")}-01`;
}

/** Primer día del periodo del décimo tercero que termina con la salida: el 1 de diciembre anterior. */
export function inicioDecimoTercero(fechaSalida: string): string {
  const [anio, mes] = fechaSalida.split("-").map(Number);
  return `${mes === 12 ? anio : anio - 1}-12-01`;
}

/** Calcula cada rubro de la liquidación, con su fórmula y los números del empleado. */
export function calcularLiquidacion(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  const sueldo = D(entrada.sueldoBase);
  const diasServicio = diasDeServicio(entrada.fechaIngreso, entrada.fechaSalida);
  const anios = D(diasServicio).div(360);
  const rubros: RubroLiquidacion[] = [];

  // Décimo tercero: lo que los roles provisionaron (el que se paga cada mes ya no se debe).
  const tercero = q(entrada.decimoTerceroProvisionado);
  rubros.push({
    clave: "decimoTercero", concepto: "Décimo tercero proporcional",
    formula: "suma de lo provisionado en los roles desde el 1 de diciembre anterior",
    detalle: tercero.gt(0)
      ? `${m(tercero)} provisionados desde el ${inicioDecimoTercero(entrada.fechaSalida)}`
      : "no hay nada provisionado: se paga cada mes en el rol, no lo recibe o falta generar los roles",
    valor: tercero.toNumber(),
    fuente: "Código del Trabajo art. 111: la doceava parte de lo percibido desde el 1 de diciembre",
  });

  // Décimo cuarto: SBU × días del periodo ÷ 360, solo si lo acumula.
  const inicioCuarto = inicioDecimoCuarto(entrada.fechaSalida, entrada.region);
  const desdeCuarto = entrada.fechaIngreso > inicioCuarto ? entrada.fechaIngreso : inicioCuarto;
  const diasCuarto = Math.min(360, diasDeServicio(desdeCuarto, entrada.fechaSalida));
  const cuarto = entrada.decimoCuarto === "acumulado" ? q(D(entrada.sbu).times(diasCuarto).div(360)) : D("0.00");
  rubros.push({
    clave: "decimoCuarto", concepto: "Décimo cuarto proporcional",
    formula: "SBU × días del periodo ÷ 360 (periodo según la región), solo si lo acumula",
    detalle: entrada.decimoCuarto === "acumulado"
      ? `${m(D(entrada.sbu))} × ${diasCuarto} ÷ 360 = ${m(cuarto)} (periodo desde el ${desdeCuarto})`
      : entrada.decimoCuarto === "mensual" ? "ya se pagó cada mes en el rol: 0.00" : "no lo recibe: 0.00",
    valor: cuarto.toNumber(),
    fuente: "Código del Trabajo art. 113",
  });

  // Vacaciones no gozadas: los días del saldo a la remuneración de un día (sueldo ÷ 30).
  const saldo = Decimal.max(D(entrada.saldoVacaciones), 0);
  const valorDia = sueldo.div(30);
  const vacaciones = q(valorDia.times(saldo));
  rubros.push({
    clave: "vacaciones", concepto: "Vacaciones no gozadas",
    formula: "días de saldo × sueldo base ÷ 30",
    detalle: saldo.gt(0)
      ? `${saldo.toDecimalPlaces(2).toString()} días × ${m(sueldo)} ÷ 30 = ${m(vacaciones)}`
      : "no tiene días pendientes: 0.00",
    valor: vacaciones.toNumber(),
  });

  if (CAUSAS_CON_BONIFICACION.includes(entrada.causa)) {
    const bonificacion = q(sueldo.times("0.25").times(anios));
    rubros.push({
      clave: "bonificacionDesahucio", concepto: "Bonificación por desahucio",
      formula: "25 % del sueldo base × años de servicio (la fracción cuenta en proporción)",
      detalle: `25 % × ${m(sueldo)} × ${anios.toDecimalPlaces(4).toString()} años = ${m(bonificacion)}`,
      valor: bonificacion.toNumber(),
      fuente: "Código del Trabajo art. 185: el 25 % de la última remuneración mensual por cada año de servicio",
    });
  }

  if (CAUSAS_CON_INDEMNIZACION.includes(entrada.causa)) {
    const anioCompletos = anios.ceil().toNumber(); // la fracción de año cuenta como año completo
    const meses = anios.lte(3) ? 3 : Math.min(anioCompletos, TOPE_MESES_INDEMNIZACION);
    const indemnizacion = q(sueldo.times(meses));
    rubros.push({
      clave: "indemnizacion", concepto: "Indemnización por despido",
      formula: "3 sueldos hasta 3 años de servicio; desde ahí, 1 sueldo por año (la fracción cuenta como año) con tope de 25",
      detalle: `${meses} × ${m(sueldo)} = ${m(indemnizacion)}`,
      valor: indemnizacion.toNumber(),
      fuente: "Código del Trabajo art. 188",
    });
  }

  const total = rubros.reduce((suma, r) => suma.plus(r.valor), D(0));
  return { anios: anios.toDecimalPlaces(4).toNumber(), diasServicio, rubros, total: q(total).toNumber() };
}
