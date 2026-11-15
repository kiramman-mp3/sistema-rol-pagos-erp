/** Arma la liquidación de un empleado con lo que dicen la base de datos (roles, vacaciones, préstamos) y sus reglas. */
import { calcularLiquidacion, CAUSAS, CAUSAS_CON_BONIFICACION, CAUSAS_CON_INDEMNIZACION, inicioDecimoTercero, REGIONES } from "./liquidacion.ts";
import type { CausaSalida, EntradaLiquidacion, Region, ResultadoLiquidacion } from "./liquidacion.ts";
import { consultar, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { avisoDeAnioSinParametros, parametrosDelAnio } from "./parametros.ts";
import { indexarRegimenes, listarRegimenes, opcionesDe, regimenAplicado } from "./regimenes.ts";
import type { Regimen } from "./regimenes.ts";
import { numeroDeCuota, aPrestamo } from "./prestamos.ts";
import { diasGozados, diasPorAnioDe, saldoDeVacaciones } from "./vacaciones.ts";
import { ErrorApi, esId, fechaIsoValida } from "./validaciones.ts";

export interface PrestamosPendientes {
  /** Cuotas que faltarían después del mes de salida */
  cuotas: number;
  valor: number;
}

export interface Preparacion {
  empleado: Fila;
  aplicado: Regimen;
  causa: CausaSalida;
  region: Region;
  fechaSalida: string;
  entrada: EntradaLiquidacion;
  resultado: ResultadoLiquidacion;
  prestamos: PrestamosPendientes;
  avisos: string[];
}

const mesDe = (fecha: string) => {
  const [anio, mes] = fecha.split("-").map(Number);
  return anio * 12 + (mes - 1);
};

/** Valida el cuerpo, reúne los datos del empleado y calcula. Lanza 400 con todos los errores, o 409 si ya hay liquidación. */
export async function prepararLiquidacion(db: Base, cuentaId: number, cuerpo: Record<string, unknown>): Promise<Preparacion> {
  const errores: string[] = [];
  const empleadoId = Number(cuerpo.empleadoId);
  const empleado = esId(empleadoId)
    ? await uno(db, "SELECT * FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, empleadoId)
    : undefined;
  if (!empleado) errores.push("El empleado no existe.");

  const causa = String(cuerpo.causa ?? "") as CausaSalida;
  if (!CAUSAS.includes(causa)) errores.push("Causa de la salida inválida.");
  const regionPedida = cuerpo.region === undefined || cuerpo.region === "" ? "sierra" : String(cuerpo.region);
  if (!(REGIONES as readonly string[]).includes(regionPedida)) errores.push("Región: sierra (con Amazonía) o costa (con Galápagos).");
  const region = regionPedida as Region;

  const fechaSalida = cuerpo.fechaSalida;
  if (!fechaIsoValida(fechaSalida)) errores.push("Fecha de salida inválida.");
  else if (empleado) {
    if (fechaSalida < String(empleado.fecha_ingreso)) errores.push("La fecha de salida no puede ser anterior a la de ingreso.");
    if (empleado.fecha_salida && String(empleado.fecha_salida) !== fechaSalida) {
      errores.push(`El empleado ya tiene registrada su salida el ${empleado.fecha_salida}: usa esa fecha.`);
    }
  }
  if (errores.length || !empleado) throw new ErrorApi(400, errores);
  const salida = fechaSalida as string;

  const ya = await uno(db, "SELECT id FROM liquidaciones WHERE empleado_id = ?", empleadoId);
  if (ya) throw new ErrorApi(409, ["Este empleado ya tiene una liquidación: elimínala si hay que rehacerla."]);

  const regimenes = indexarRegimenes(await listarRegimenes(db, cuentaId, salida));
  let aplicado: Regimen;
  try {
    aplicado = regimenAplicado(regimenes, String(empleado.regimen), empleado.categoria_loep as string | null);
  } catch {
    throw new ErrorApi(400, ["No se pudo determinar el régimen que se aplica al empleado."]);
  }
  const conIndemnizacion = CAUSAS_CON_BONIFICACION.includes(causa) || CAUSAS_CON_INDEMNIZACION.includes(causa);
  if (conIndemnizacion && aplicado.codigo !== "CODIGO_TRABAJO") {
    throw new ErrorApi(400, [
      `Las indemnizaciones por esa causa solo están programadas para el Código del Trabajo; el empleado se rige por ${aplicado.codigo}. Usa «renuncia» o «fin del plazo del contrato» para liquidar lo demás.`,
    ]);
  }

  const avisos: string[] = [];
  const { parametros } = await parametrosDelAnio(db, cuentaId, Number(salida.slice(0, 4)));
  const sinParametros = avisoDeAnioSinParametros(Number(salida.slice(0, 4)), parametros);
  if (sinParametros) avisos.push(sinParametros);
  const opciones = opcionesDe(aplicado, empleado);

  // Décimo tercero: lo provisionado en los roles desde el 1 de diciembre anterior.
  const desde = inicioDecimoTercero(salida);
  const primerMes = Math.max(mesDe(desde), mesDe(String(empleado.fecha_ingreso)));
  const ultimoMes = mesDe(salida);
  const provisionado = await uno(
    db,
    `SELECT COALESCE(SUM(d.decimo_tercero), 0) AS total
     FROM roles_detalle d JOIN roles_cabecera c ON c.id = d.rol_id
     WHERE c.cuenta_id = ? AND d.cedula = ? AND d.decimo_tercero_modalidad = 'acumulado'
       AND c.anio * 12 + (c.mes - 1) BETWEEN ? AND ?`,
    cuentaId, String(empleado.cedula), mesDe(desde), ultimoMes,
  );
  const roles = new Set(
    (await consultar(
      db,
      `SELECT anio * 12 + (mes - 1) AS indice FROM roles_cabecera
       WHERE cuenta_id = ? AND tipo = 'ordinario' AND anio * 12 + (mes - 1) BETWEEN ? AND ?`,
      cuentaId, primerMes, ultimoMes,
    )).map((f) => Number(f.indice)),
  );
  for (let indice = primerMes; indice <= ultimoMes; indice++) {
    if (!roles.has(indice)) {
      avisos.push(`Falta el rol de ${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}: lo que provisionaría no entra en el décimo tercero.`);
    }
  }

  // Vacaciones: lo devengado hasta la salida menos lo ya gozado.
  const porAnio = (await diasPorAnioDe(db, cuentaId, [empleado], salida)).get(empleadoId) ?? 0;
  const gozados = (await diasGozados(db, cuentaId)).get(empleadoId) ?? 0;
  const vacaciones = saldoDeVacaciones(String(empleado.fecha_ingreso), salida, porAnio, gozados);
  if (vacaciones.saldo < 0) {
    avisos.push(`${empleado.nombres} tomó ${-vacaciones.saldo} días de vacaciones de más: no se le cobran en la liquidación.`);
  }

  const entrada: EntradaLiquidacion = {
    sueldoBase: String(empleado.sueldo_base), fechaIngreso: String(empleado.fecha_ingreso), fechaSalida: salida,
    causa, region, sbu: parametros.sbu, decimoCuarto: opciones.decimoCuarto,
    decimoTerceroProvisionado: Number(provisionado?.total ?? 0), saldoVacaciones: vacaciones.saldo,
  };
  const resultado = calcularLiquidacion(entrada);

  // Préstamos del IESS: no se descuentan, se informan (la cuota del mes de salida ya la descuenta el último rol).
  const [anioSalida, mesSalida] = salida.split("-").map(Number);
  const prestamos: PrestamosPendientes = { cuotas: 0, valor: 0 };
  for (const f of await consultar(db, "SELECT * FROM prestamos_iess WHERE cuenta_id = ? AND empleado_id = ? AND activo = 1", cuentaId, empleadoId)) {
    const p = aPrestamo(f);
    const hechas = numeroDeCuota({ ...p, cuotas: Number.MAX_SAFE_INTEGER }, anioSalida, mesSalida) ?? 0;
    const faltan = Math.max(0, p.cuotas - Math.min(p.cuotas, hechas));
    prestamos.cuotas += faltan;
    prestamos.valor = Math.round((prestamos.valor + faltan * p.cuota) * 100) / 100;
  }
  if (prestamos.cuotas > 0) {
    avisos.push(`Quedan ${prestamos.cuotas} cuotas de préstamos del IESS por $${prestamos.valor.toFixed(2)}: no se descuentan aquí; avisa al IESS de la salida.`);
  }
  return { empleado, aplicado, causa, region, fechaSalida: salida, entrada, resultado, prestamos, avisos };
}
