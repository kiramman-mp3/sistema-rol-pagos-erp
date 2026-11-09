/**
 * Motor de cálculo del rol de pagos (Ecuador).
 *
 * Funciones puras: no tocan la base de datos ni Express. Todo el dinero se maneja
 * con Decimal y se redondea a centavos (ROUND_HALF_UP) en cada rubro, para que
 * las columnas del rol sumen exactamente el total que se muestra.
 *
 * Las reglas de ley (SBU, aportes, recargos, tabla del IR) llegan como parámetro
 * (`ReglasRol`): salen de la base de datos según el año y el régimen del empleado.
 */
import { Decimal } from "decimal.js";

// Precisión alta para que ninguna división intermedia mueva un empate de centavos.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type Monto = Decimal.Value;

const D = (valor: Monto) => new Decimal(valor);

const DIAS_MES = D(30); // mes comercial laboral

export interface TramoIR {
  /** límite inferior de la fracción básica */
  desde: number;
  /** límite superior; null en el último tramo */
  hasta: number | null;
  /** impuesto sobre la fracción básica */
  cuota: number;
  /** % sobre el excedente, como fracción (0.05 = 5%) */
  porcentaje: number;
}

/**
 * Todo lo que la ley fija y puede cambiar: lo define el año (SBU, tabla del IR)
 * y el régimen laboral del empleado (aportes, recargos, vacaciones).
 */
export interface ReglasRol {
  /** Salario Básico Unificado */
  sbu: Monto;
  /** Canasta familiar básica de enero (INEC): tope de la rebaja por gastos personales. 0 = sin definir, no hay rebaja. */
  canastaBasica?: Monto;
  /** aporte del trabajador, como fracción (0.0945 = 9.45%) */
  iessPersonal: Monto;
  /** aporte del empleador */
  iessPatronal: Monto;
  /** fondos de reserva, como fracción del ingreso aportable */
  fondosReserva: Monto;
  /** meses de servicio cumplidos antes de generar fondos de reserva */
  mesesParaFondos: number;
  /** base del valor hora: 30 días x 8 horas */
  horasMes: number;
  /** días de vacaciones al año: la provisión es días / 360 de lo percibido en el año */
  diasVacaciones: number;
  /** recargo de las horas suplementarias sobre la hora normal (0.5 = +50%) */
  recargoSuplementarias: Monto;
  /** recargo de las horas extraordinarias: de 24h00 a 06h00 en días hábiles */
  recargoExtraordinarias: Monto;
  /** recargo de las horas en días de descanso: sábados, domingos y feriados */
  recargoDescanso: Monto;
  /** recargo del trabajo nocturno: solo el recargo, la hora base ya está en el sueldo */
  recargoNocturno: Monto;
  /** tope mensual de horas suplementarias; null = sin tope mensual */
  topeSuplementariasMes?: number | null;
  /** tope mensual de horas extraordinarias; null = sin tope mensual */
  topeExtraordinariasMes?: number | null;
  tablaIr: readonly TramoIR[];
}

/** Tabla SRI 2026, personas naturales (Res. NAC-DGERCGC25-00000043). */
export const TABLA_IR_2026: readonly TramoIR[] = [
  { desde: 0, hasta: 12208, cuota: 0, porcentaje: 0 },
  { desde: 12208, hasta: 15549, cuota: 0, porcentaje: 0.05 },
  { desde: 15549, hasta: 20188, cuota: 167, porcentaje: 0.1 },
  { desde: 20188, hasta: 26700, cuota: 631, porcentaje: 0.12 },
  { desde: 26700, hasta: 35136, cuota: 1412, porcentaje: 0.15 },
  { desde: 35136, hasta: 46575, cuota: 2678, porcentaje: 0.2 },
  { desde: 46575, hasta: 62005, cuota: 4965, porcentaje: 0.25 },
  { desde: 62005, hasta: 82679, cuota: 8823, porcentaje: 0.3 },
  { desde: 82679, hasta: 109956, cuota: 15025, porcentaje: 0.35 },
  { desde: 109956, hasta: null, cuota: 24572, porcentaje: 0.37 },
];

/**
 * Código del Trabajo con los valores de 2026 (arts. 49 y 55). Es el valor por
 * defecto del motor y lo que usan las pruebas; el sistema real lo arma con
 * `reglasDe` a partir de la base de datos.
 */
export const REGLAS_CT_2026: ReglasRol = {
  sbu: 482,
  iessPersonal: "0.0945",
  iessPatronal: "0.1115",
  fondosReserva: "0.0833",
  mesesParaFondos: 12,
  horasMes: 240,
  diasVacaciones: 15,
  recargoSuplementarias: "0.5",
  recargoExtraordinarias: 1,
  recargoDescanso: 1,
  recargoNocturno: "0.25",
  // El Código limita por día (4) y por semana (12); 12 x 4 semanas es la referencia mensual.
  topeSuplementariasMes: 48,
  topeExtraordinariasMes: null,
  tablaIr: TABLA_IR_2026,
};

/** Redondea a centavos. */
export function q(valor: Monto): Decimal {
  return D(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Aplica la tabla progresiva: cuota fija del tramo + % sobre el excedente. */
export function impuestoRentaAnual(baseAnual: Monto, tabla: readonly TramoIR[] = TABLA_IR_2026): Decimal {
  const base = D(baseAnual);
  if (base.lte(0)) return D("0.00");
  for (const t of tabla) {
    if (t.hasta === null || base.lte(t.hasta)) {
      return q(D(t.cuota).plus(base.minus(t.desde).times(t.porcentaje)));
    }
  }
  throw new Error("la tabla debe cubrir todos los valores");
}

/** Porcentaje de los gastos personales que se rebaja del impuesto a la renta. */
export const TASA_REBAJA_GASTOS = D("0.18");

/**
 * Cuántas canastas básicas topan los gastos según las cargas familiares (0 a 5 o más). Con una enfermedad
 * catastrófica, rara o huérfana, del contribuyente o de una carga, el tope es de 100 canastas.
 */
export const CANASTAS_POR_CARGAS: readonly number[] = [7, 9, 11, 14, 17, 20];
export const CANASTAS_ENFERMEDAD_CATASTROFICA = 100;

export interface RebajaGastos {
  /** Canastas que topan los gastos de esta persona */
  canastas: number;
  /** canasta básica × canastas */
  tope: Decimal;
  /** Lo declarado, sin pasar del tope */
  gastosAdmitidos: Decimal;
  /** 18 % de los gastos admitidos, antes de compararla con el impuesto */
  rebaja: Decimal;
}

/** Rebaja del impuesto a la renta por gastos personales: 18 % del menor entre lo gastado y el tope. */
export function rebajaPorGastosPersonales(
  gastos: Monto, cargas: number, catastrofica: boolean, canastaBasica: Monto,
): RebajaGastos {
  const canastas = catastrofica
    ? CANASTAS_ENFERMEDAD_CATASTROFICA
    : CANASTAS_POR_CARGAS[Math.min(Math.max(Math.trunc(cargas), 0), CANASTAS_POR_CARGAS.length - 1)];
  const tope = q(D(canastaBasica).times(canastas));
  const gastosAdmitidos = Decimal.min(Decimal.max(D(gastos), 0), tope);
  return { canastas, tope, gastosAdmitidos, rebaja: q(gastosAdmitidos.times(TASA_REBAJA_GASTOS)) };
}

export interface RetencionIR {
  baseAnual: Decimal;
  /** Impuesto de la tabla, antes de la rebaja */
  irAnual: Decimal;
  /** La rebaja que de verdad se resta: nunca pasa del impuesto */
  rebajaAnual: Decimal;
  irMensual: Decimal;
}

/**
 * Proyecta el año (x12), resta el IESS (deducible), le resta al impuesto la rebaja por gastos personales
 * (sin dejarlo bajo cero) y reparte lo que queda en 12 cuotas.
 */
export function retencionIrMensual(
  ingresosGravados: Monto, aporteIess: Monto, tabla: readonly TramoIR[] = TABLA_IR_2026, rebajaGastos: Monto = 0,
): RetencionIR {
  const baseAnual = Decimal.max(0, D(ingresosGravados).minus(aporteIess).times(12));
  const irAnual = impuestoRentaAnual(baseAnual, tabla);
  const rebajaAnual = Decimal.min(Decimal.max(D(rebajaGastos), 0), irAnual);
  return { baseAnual: q(baseAnual), irAnual, rebajaAnual: q(rebajaAnual), irMensual: q(irAnual.minus(rebajaAnual).div(12)) };
}

/** Fecha de ingreso como la guarda la base: AAAA-MM-DD. */
function partesFecha(fechaIngreso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIngreso.split("-").map(Number);
  return { anio, mes, dia };
}

/** Meses calendario transcurridos entre el mes de ingreso y el período. */
export function mesesDeServicio(fechaIngreso: string, anio: number, mes: number): number {
  const f = partesFecha(fechaIngreso);
  return (anio - f.anio) * 12 + (mes - f.mes);
}

/**
 * 30 días, salvo en el mes de ingreso (cuenta desde el día de ingreso) y en el de salida (hasta el día
 * de salida; el 31 cuenta como 30 porque el mes comercial tiene 30 días). Nunca menos de un día.
 */
export function diasTrabajados(
  fechaIngreso: string, anio: number, mes: number, fechaSalida: string | null = null,
): number {
  const ingreso = partesFecha(fechaIngreso);
  const salida = fechaSalida ? partesFecha(fechaSalida) : null;
  const desde = ingreso.anio === anio && ingreso.mes === mes ? ingreso.dia : 1;
  const hasta = salida && salida.anio === anio && salida.mes === mes ? Math.min(30, salida.dia) : 30;
  return Math.max(1, Math.min(30, hasta - desde + 1));
}

/**
 * Cómo recibe un empleado un beneficio:
 *  - no:        no lo recibe.
 *  - mensual:   se paga cada mes dentro del rol (lo que la ley manda por defecto).
 *  - acumulado: el trabajador pidió acumularlo; el empleador lo provisiona.
 */
export type Modalidad = "no" | "mensual" | "acumulado";

export const MODALIDADES: readonly Modalidad[] = ["no", "mensual", "acumulado"];

export interface OpcionesRol {
  decimoTercero: Modalidad;
  decimoCuarto: Modalidad;
  fondosReserva: Modalidad;
  /** Si es falso, las horas suplementarias, extraordinarias y de descanso no se pagan. */
  recibeHorasExtras: boolean;
}

/** Todo provisionado y con horas extras: el comportamiento del motor antes de las opciones. */
export const OPCIONES_ACUMULADAS: OpcionesRol = {
  decimoTercero: "acumulado",
  decimoCuarto: "acumulado",
  fondosReserva: "acumulado",
  recibeHorasExtras: true,
};

export interface EntradaRol {
  sueldoBase: Monto;
  /** AAAA-MM-DD */
  fechaIngreso: string;
  /** AAAA-MM-DD; si cae en el mes del rol, se pagan solo los días hasta ella */
  fechaSalida?: string | null;
  anio: number;
  mes: number;
  horasSuplementarias?: Monto;
  horasExtraordinarias?: Monto;
  horasDescanso?: Monto;
  horasNocturnas?: Monto;
  comisiones?: Monto;
  otrosDescuentos?: Monto;
  /** Gastos personales del año que el empleado declaró en su proyección */
  gastosPersonales?: Monto;
  /** Cargas familiares (0 a 5) */
  cargasFamiliares?: number;
  /** Enfermedad catastrófica, rara o huérfana del empleado o de una carga */
  enfermedadCatastrofica?: boolean;
}

/** Resultado en números de dos decimales, listo para JSON y para la base. */
export interface ResultadoRol {
  // contexto
  diasTrabajados: number;
  mesesServicio: number;
  valorHora: number;
  // ingresos
  sueldo: number;
  horasSuplementarias: number;
  horasExtraordinarias: number;
  horasDescanso: number;
  horasNocturnas: number;
  valorHorasSuplementarias: number;
  valorHorasExtraordinarias: number;
  valorHorasDescanso: number;
  valorRecargoNocturno: number;
  comisiones: number;
  /** Lo que sirve de base para el IESS, el IR, el décimo tercero y las vacaciones. */
  ingresosAportables: number;
  /** Décimos y fondos de reserva que se pagan dentro del rol; no son aportables ni gravados. */
  beneficiosMensuales: number;
  totalIngresos: number;
  // descuentos
  aporteIess: number;
  baseIrAnual: number;
  irAnual: number;
  /** Lo que se le restó al impuesto anual por gastos personales */
  rebajaIrAnual: number;
  impuestoRenta: number;
  otrosDescuentos: number;
  totalDescuentos: number;
  // neto
  netoPagar: number;
  // beneficios: su valor del mes y cómo se pagan
  decimoTercero: number;
  decimoTerceroModalidad: Modalidad;
  decimoCuarto: number;
  decimoCuartoModalidad: Modalidad;
  fondosReserva: number;
  fondosReservaModalidad: Modalidad;
  // provisiones y costo empleador (no afectan el neto)
  vacaciones: number;
  aportePatronal: number;
  totalProvisiones: number;
  costoEmpleador: number;
}

/** Un paso del cálculo: qué se calculó, con qué fórmula, con qué números y cuánto dio. */
export interface PasoCalculo {
  /** Campo del resultado al que corresponde (`aporteIess`, `netoPagar`...). */
  clave: keyof ResultadoRol;
  concepto: string;
  /** La regla en palabras. */
  formula: string;
  /** La misma regla con los números de este empleado. */
  detalle: string;
  resultado: number;
  /** De dónde sale la regla, cuando el código la cita. */
  fuente?: string;
}

/** Cómo se llegó a cada valor del rol de un empleado, en el orden en que se calcularon. */
export interface TrazaCalculo {
  pasos: PasoCalculo[];
}

export function calcularRol(
  entrada: EntradaRol,
  reglas: ReglasRol = REGLAS_CT_2026,
  opciones: OpcionesRol = OPCIONES_ACUMULADAS,
): ResultadoRol {
  return calcularRolConTraza(entrada, reglas, opciones).resultado;
}

/** Igual que `calcularRol`, y además cuenta paso a paso cómo salió cada valor. */
export function calcularRolConTraza(
  entrada: EntradaRol,
  reglas: ReglasRol = REGLAS_CT_2026,
  opciones: OpcionesRol = OPCIONES_ACUMULADAS,
): { resultado: ResultadoRol; traza: TrazaCalculo } {
  const sbu = D(reglas.sbu);
  const horasMes = D(reglas.horasMes);
  const sueldoBase = D(entrada.sueldoBase);
  // Quien no recibe horas extras no cobra suplementarias, extraordinarias ni de descanso.
  const extra = (horas?: Monto) => (opciones.recibeHorasExtras ? D(horas ?? 0) : D(0));
  const horasSuplementarias = extra(entrada.horasSuplementarias);
  const horasExtraordinarias = extra(entrada.horasExtraordinarias);
  const horasDescanso = extra(entrada.horasDescanso);
  const horasNocturnas = D(entrada.horasNocturnas ?? 0);
  const comisiones = q(entrada.comisiones ?? 0);
  const otrosDescuentos = q(entrada.otrosDescuentos ?? 0);

  const dias = diasTrabajados(entrada.fechaIngreso, entrada.anio, entrada.mes, entrada.fechaSalida ?? null);
  const meses = mesesDeServicio(entrada.fechaIngreso, entrada.anio, entrada.mes);

  // Ingresos. El valor hora sale del sueldo completo, aunque el mes se prorratee.
  // Se multiplica antes de dividir: así 16273.2 / 240 da exactamente 67.805.
  const valorHora = sueldoBase.div(horasMes);
  const sueldo = q(sueldoBase.times(dias).div(DIAS_MES));
  const porHora = (horas: Decimal, multiplicador: Decimal) =>
    q(horas.times(sueldoBase).times(multiplicador).div(horasMes));
  const vSuplementarias = porHora(horasSuplementarias, D(1).plus(reglas.recargoSuplementarias));
  const vExtraordinarias = porHora(horasExtraordinarias, D(1).plus(reglas.recargoExtraordinarias));
  const vDescanso = porHora(horasDescanso, D(1).plus(reglas.recargoDescanso));
  const vNoc = porHora(horasNocturnas, D(reglas.recargoNocturno));
  const aportables = sueldo
    .plus(vSuplementarias).plus(vExtraordinarias).plus(vDescanso).plus(vNoc)
    .plus(comisiones);

  // Beneficios. Su valor sale siempre de los ingresos aportables del mes; lo que cambia es
  // si se pagan en el rol (mensual), se provisionan (acumulado) o no existen (no).
  // Los décimos y los fondos pagados en el rol no pagan IESS ni impuesto a la renta
  // (Código del Trabajo arts. 112 y 114).
  const cero = D("0.00");
  const valorDe = (modalidad: Modalidad, valor: Decimal) => (modalidad === "no" ? cero : valor);
  const decimoTercero = valorDe(opciones.decimoTercero, q(aportables.div(12)));
  const decimoCuarto = valorDe(opciones.decimoCuarto, q(sbu.times(dias).div(12 * 30))); // sobre el SBU
  const fondos = valorDe(
    opciones.fondosReserva,
    meses >= reglas.mesesParaFondos ? q(aportables.times(reglas.fondosReserva)) : cero,
  );
  const beneficios: [Modalidad, Decimal][] = [
    [opciones.decimoTercero, decimoTercero],
    [opciones.decimoCuarto, decimoCuarto],
    [opciones.fondosReserva, fondos],
  ];
  const sumarSi = (modalidad: Modalidad) =>
    beneficios.reduce((suma, [m, valor]) => (m === modalidad ? suma.plus(valor) : suma), cero);
  const beneficiosMensuales = sumarSi("mensual");
  const beneficiosAcumulados = sumarSi("acumulado");
  const totalIngresos = aportables.plus(beneficiosMensuales);

  // Descuentos. El IESS y el IR se calculan solo sobre lo aportable.
  const iess = q(aportables.times(reglas.iessPersonal));
  const rebaja = rebajaPorGastosPersonales(
    entrada.gastosPersonales ?? 0, entrada.cargasFamiliares ?? 0, entrada.enfermedadCatastrofica ?? false, reglas.canastaBasica ?? 0,
  );
  const ir = retencionIrMensual(aportables, iess, reglas.tablaIr, rebaja.rebaja);
  const totalDescuentos = iess.plus(ir.irMensual).plus(otrosDescuentos);
  const neto = totalIngresos.minus(totalDescuentos);

  // Provisiones del empleador: se muestran, no se descuentan.
  // Código del Trabajo art. 71: la 24ava parte de lo percibido en el año, con horas extras y
  // retribuciones habituales. 15 días / 360 es esa misma fracción; con 30 días sería 1/12.
  const vacaciones = q(aportables.times(reglas.diasVacaciones).div(360));
  const patronal = q(aportables.times(reglas.iessPatronal));
  const provisiones = beneficiosAcumulados.plus(vacaciones).plus(patronal);

  const resultado: ResultadoRol = {
    diasTrabajados: dias,
    mesesServicio: meses,
    valorHora: q(valorHora).toNumber(),
    sueldo: sueldo.toNumber(),
    horasSuplementarias: horasSuplementarias.toNumber(),
    horasExtraordinarias: horasExtraordinarias.toNumber(),
    horasDescanso: horasDescanso.toNumber(),
    horasNocturnas: horasNocturnas.toNumber(),
    valorHorasSuplementarias: vSuplementarias.toNumber(),
    valorHorasExtraordinarias: vExtraordinarias.toNumber(),
    valorHorasDescanso: vDescanso.toNumber(),
    valorRecargoNocturno: vNoc.toNumber(),
    comisiones: comisiones.toNumber(),
    ingresosAportables: aportables.toNumber(),
    beneficiosMensuales: beneficiosMensuales.toNumber(),
    totalIngresos: totalIngresos.toNumber(),
    aporteIess: iess.toNumber(),
    baseIrAnual: ir.baseAnual.toNumber(),
    irAnual: ir.irAnual.toNumber(),
    rebajaIrAnual: ir.rebajaAnual.toNumber(),
    impuestoRenta: ir.irMensual.toNumber(),
    otrosDescuentos: otrosDescuentos.toNumber(),
    totalDescuentos: totalDescuentos.toNumber(),
    netoPagar: neto.toNumber(),
    decimoTercero: decimoTercero.toNumber(),
    decimoTerceroModalidad: opciones.decimoTercero,
    decimoCuarto: decimoCuarto.toNumber(),
    decimoCuartoModalidad: opciones.decimoCuarto,
    fondosReserva: fondos.toNumber(),
    fondosReservaModalidad: opciones.fondosReserva,
    vacaciones: vacaciones.toNumber(),
    aportePatronal: patronal.toNumber(),
    totalProvisiones: provisiones.toNumber(),
    costoEmpleador: totalIngresos.plus(provisiones).toNumber(),
  };

  // --- La traza: las mismas variables de arriba, contadas en el orden en que se calcularon. ---
  const m = (valor: Decimal) => valor.toFixed(2);
  const pct = (fraccion: Monto) => `${D(fraccion).times(100).toDecimalPlaces(4).toString()} %`;
  const pasos: PasoCalculo[] = [];
  const paso = (clave: keyof ResultadoRol, concepto: string, formula: string, detalle: string, valor: number, fuente?: string) =>
    pasos.push({ clave, concepto, formula, detalle, resultado: valor, ...(fuente ? { fuente } : {}) });

  paso("diasTrabajados", "Días trabajados",
    "30, salvo en el mes de ingreso (desde ese día) y en el de salida (hasta ese día); nunca menos de 1",
    dias < 30 ? `${dias} de 30 días` : "mes completo: 30 días", dias);
  paso("mesesServicio", "Meses de servicio", "meses calendario entre el mes de ingreso y el período",
    `${entrada.fechaIngreso} a ${entrada.anio}-${String(entrada.mes).padStart(2, "0")} = ${meses} meses`, meses);
  paso("valorHora", "Valor de la hora", "sueldo base ÷ horas del mes",
    `${m(sueldoBase)} ÷ ${horasMes.toString()} = ${m(valorHora)}`, q(valorHora).toNumber());
  paso("sueldo", "Sueldo del mes", "sueldo base × días trabajados ÷ 30",
    `${m(sueldoBase)} × ${dias} ÷ 30 = ${m(sueldo)}`, sueldo.toNumber());
  if (horasSuplementarias.gt(0)) {
    paso("valorHorasSuplementarias", "Horas suplementarias", "horas × sueldo base × (1 + recargo) ÷ horas del mes",
      `${horasSuplementarias} × ${m(sueldoBase)} × ${D(1).plus(reglas.recargoSuplementarias)} ÷ ${horasMes} = ${m(vSuplementarias)}`,
      vSuplementarias.toNumber());
  }
  if (horasExtraordinarias.gt(0)) {
    paso("valorHorasExtraordinarias", "Horas extraordinarias", "horas × sueldo base × (1 + recargo) ÷ horas del mes",
      `${horasExtraordinarias} × ${m(sueldoBase)} × ${D(1).plus(reglas.recargoExtraordinarias)} ÷ ${horasMes} = ${m(vExtraordinarias)}`,
      vExtraordinarias.toNumber());
  }
  if (horasDescanso.gt(0)) {
    paso("valorHorasDescanso", "Horas de sábado, domingo y feriado", "horas × sueldo base × (1 + recargo) ÷ horas del mes",
      `${horasDescanso} × ${m(sueldoBase)} × ${D(1).plus(reglas.recargoDescanso)} ÷ ${horasMes} = ${m(vDescanso)}`,
      vDescanso.toNumber());
  }
  if (horasNocturnas.gt(0)) {
    paso("valorRecargoNocturno", "Recargo nocturno", "horas × sueldo base × recargo ÷ horas del mes (la hora base ya está en el sueldo)",
      `${horasNocturnas} × ${m(sueldoBase)} × ${D(reglas.recargoNocturno)} ÷ ${horasMes} = ${m(vNoc)}`, vNoc.toNumber());
  }
  if (comisiones.gt(0)) paso("comisiones", "Comisiones", "valor digitado", m(comisiones), comisiones.toNumber());
  paso("ingresosAportables", "Ingresos aportables", "sueldo + horas con recargo + comisiones: la base del IESS, del impuesto, del décimo tercero y de las vacaciones",
    `${m(sueldo)} + ${m(vSuplementarias.plus(vExtraordinarias).plus(vDescanso).plus(vNoc))} + ${m(comisiones)} = ${m(aportables)}`,
    aportables.toNumber());

  const comoSePaga = (modalidad: Modalidad) =>
    modalidad === "mensual" ? "se paga en el rol" : modalidad === "acumulado" ? "se provisiona" : "no lo recibe";
  paso("decimoTercero", "Décimo tercero", `ingresos aportables ÷ 12 (${comoSePaga(opciones.decimoTercero)})`,
    opciones.decimoTercero === "no" ? "no lo recibe: 0.00" : `${m(aportables)} ÷ 12 = ${m(decimoTercero)}`, decimoTercero.toNumber(),
    "Código del Trabajo arts. 112 y 114: no paga IESS ni impuesto cuando se recibe en el rol");
  paso("decimoCuarto", "Décimo cuarto", `SBU × días trabajados ÷ 360 (${comoSePaga(opciones.decimoCuarto)})`,
    opciones.decimoCuarto === "no" ? "no lo recibe: 0.00" : `${m(sbu)} × ${dias} ÷ 360 = ${m(decimoCuarto)}`, decimoCuarto.toNumber());
  paso("fondosReserva", "Fondos de reserva",
    `ingresos aportables × ${pct(reglas.fondosReserva)} desde el mes ${reglas.mesesParaFondos} de servicio (${comoSePaga(opciones.fondosReserva)})`,
    opciones.fondosReserva === "no"
      ? "no los recibe: 0.00"
      : meses >= reglas.mesesParaFondos
        ? `${m(aportables)} × ${pct(reglas.fondosReserva)} = ${m(fondos)}`
        : `${meses} meses de servicio, aún menos de ${reglas.mesesParaFondos}: 0.00`,
    fondos.toNumber());
  paso("beneficiosMensuales", "Beneficios pagados en el rol", "suma de los beneficios con modalidad «mensual»",
    m(beneficiosMensuales), beneficiosMensuales.toNumber());
  paso("totalIngresos", "Total de ingresos", "ingresos aportables + beneficios pagados en el rol",
    `${m(aportables)} + ${m(beneficiosMensuales)} = ${m(totalIngresos)}`, totalIngresos.toNumber());

  paso("aporteIess", "Aporte personal al IESS", "ingresos aportables × tasa personal del régimen",
    `${m(aportables)} × ${pct(reglas.iessPersonal)} = ${m(iess)}`, iess.toNumber());
  paso("baseIrAnual", "Base anual del impuesto a la renta", "(ingresos aportables − IESS) × 12",
    `(${m(aportables)} − ${m(iess)}) × 12 = ${m(ir.baseAnual)}`, ir.baseAnual.toNumber());
  const tramo = reglas.tablaIr.find((t) => t.hasta === null || ir.baseAnual.lte(t.hasta));
  paso("irAnual", "Impuesto a la renta anual", "cuota del tramo + (base − inicio del tramo) × porcentaje del tramo",
    !tramo || ir.baseAnual.lte(0)
      ? "la base no supera cero: 0.00"
      : `${m(D(tramo.cuota))} + (${m(ir.baseAnual)} − ${m(D(tramo.desde))}) × ${pct(tramo.porcentaje)} = ${m(ir.irAnual)}`,
    ir.irAnual.toNumber(), "Tabla del impuesto a la renta del año");
  const declaro = D(entrada.gastosPersonales ?? 0);
  if (declaro.gt(0)) {
    const canasta = D(reglas.canastaBasica ?? 0);
    paso("rebajaIrAnual", "Rebaja por gastos personales",
      "18 % del menor entre los gastos del año y el tope (canasta básica × canastas); no pasa del impuesto anual",
      canasta.lte(0)
        ? "no hay canasta básica definida para el año: sin rebaja"
        : `${m(declaro)} contra el tope ${m(canasta)} × ${rebaja.canastas} = ${m(rebaja.tope)}: ${m(rebaja.gastosAdmitidos)} × 18 % = ${m(rebaja.rebaja)}` +
          (rebaja.rebaja.gt(ir.rebajaAnual) ? `; se resta ${m(ir.rebajaAnual)} porque no puede pasar del impuesto` : ""),
      ir.rebajaAnual.toNumber(),
      "Rebaja del impuesto a la renta por gastos personales (SRI): 18 %, con tope según la canasta familiar básica y las cargas");
  }
  paso("impuestoRenta", "Impuesto a la renta del mes",
    ir.rebajaAnual.gt(0) ? "(impuesto anual − rebaja) ÷ 12" : "impuesto anual ÷ 12",
    ir.rebajaAnual.gt(0)
      ? `(${m(ir.irAnual)} − ${m(ir.rebajaAnual)}) ÷ 12 = ${m(ir.irMensual)}`
      : `${m(ir.irAnual)} ÷ 12 = ${m(ir.irMensual)}`,
    ir.irMensual.toNumber());
  if (otrosDescuentos.gt(0)) paso("otrosDescuentos", "Otros descuentos", "valor digitado", m(otrosDescuentos), otrosDescuentos.toNumber());
  paso("totalDescuentos", "Total de descuentos", "IESS + impuesto a la renta + otros descuentos",
    `${m(iess)} + ${m(ir.irMensual)} + ${m(otrosDescuentos)} = ${m(totalDescuentos)}`, totalDescuentos.toNumber());
  paso("netoPagar", "Neto a pagar", "total de ingresos − total de descuentos",
    `${m(totalIngresos)} − ${m(totalDescuentos)} = ${m(neto)}`, neto.toNumber());

  paso("vacaciones", "Provisión de vacaciones", "ingresos aportables × días de vacaciones ÷ 360",
    `${m(aportables)} × ${reglas.diasVacaciones} ÷ 360 = ${m(vacaciones)}`, vacaciones.toNumber(), "Código del Trabajo art. 71");
  paso("aportePatronal", "Aporte patronal al IESS", "ingresos aportables × tasa patronal del régimen",
    `${m(aportables)} × ${pct(reglas.iessPatronal)} = ${m(patronal)}`, patronal.toNumber());
  paso("totalProvisiones", "Total de provisiones", "beneficios acumulados + vacaciones + aporte patronal",
    `${m(beneficiosAcumulados)} + ${m(vacaciones)} + ${m(patronal)} = ${m(provisiones)}`, provisiones.toNumber());
  paso("costoEmpleador", "Costo del empleador", "total de ingresos + total de provisiones",
    `${m(totalIngresos)} + ${m(provisiones)} = ${m(totalIngresos.plus(provisiones))}`, totalIngresos.plus(provisiones).toNumber());

  return { resultado, traza: { pasos } };
}

/** Horas del mes que un empleado trabajó fuera de su jornada. */
export interface HorasDelMes {
  horasSuplementarias: Monto;
  horasExtraordinarias: Monto;
}

/**
 * Avisos (no bloquean el rol) cuando las horas pasan el tope mensual del régimen.
 * La LOSEP dice que, si se obliga a laborar sobre el límite, igual se pagan; por eso
 * se advierte pero no se rechaza.
 */
export function avisosDeTopes(nombre: string, horas: HorasDelMes, reglas: ReglasRol): string[] {
  const avisos: string[] = [];
  const revisar = (tipo: string, valor: Monto, tope: number | null | undefined) => {
    if (tope != null && D(valor).gt(tope)) {
      avisos.push(`${nombre}: ${valor} horas ${tipo} superan el tope mensual de ${tope}.`);
    }
  };
  revisar("suplementarias", horas.horasSuplementarias, reglas.topeSuplementariasMes);
  revisar("extraordinarias", horas.horasExtraordinarias, reglas.topeExtraordinariasMes);
  return avisos;
}

/** Aviso (no bloquea) cuando se digitaron horas extras a quien no las recibe: no se pagan. */
export function avisoHorasIgnoradas(
  nombre: string,
  horas: HorasDelMes & { horasDescanso: Monto },
): string[] {
  const total = D(horas.horasSuplementarias).plus(horas.horasExtraordinarias).plus(horas.horasDescanso);
  return total.gt(0) ? [`${nombre}: no recibe horas extras; se ignoraron ${total.toString()} horas.`] : [];
}
