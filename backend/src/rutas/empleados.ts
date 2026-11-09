import { Router } from "express";

import { CONTRATOS } from "../config.ts";
import { cargarEmpleadosDemo } from "../demo.ts";
import { MODALIDADES } from "../calculos.ts";
import type { Modalidad } from "../calculos.ts";
import { consultar, ejecutar, esDuplicado, filaACamel, insertar, uno } from "../db.ts";
import type { Base, Fila } from "../db.ts";
import { avisoDeAnioSinParametros, parametrosDelAnio } from "../parametros.ts";
import { buscarGrado, listarEscala } from "../escala.ts";
import { buscarPuesto, hayPuestosDelRegimen, soltarResponsable } from "../puestos.ts";
import { CATEGORIAS_LOEP, indexarRegimenes, listarRegimenes, regimenAplicado } from "../regimenes.ts";
import { aDecimal, cedulaValida, ErrorApi, fechaIsoValida, leerId } from "../validaciones.ts";
import { cuentaDe } from "./auth.ts";

interface DatosEmpleado {
  cedula: string;
  nombres: string;
  cargo: string;
  sueldoBase: number;
  fechaIngreso: string;
  /** null = sigue en la empresa */
  fechaSalida: string | null;
  tipoContrato: string;
  regimen: string;
  categoriaLoep: string | null;
  escalaId: number | null;
  puestoId: number | null;
  /** null = lo que diga el régimen */
  pagoDecimoTercero: Modalidad | null;
  pagoDecimoCuarto: Modalidad | null;
  pagoFondosReserva: Modalidad | null;
  recibeHorasExtras: boolean | null;
  /** Gastos personales del año que declaró para el impuesto a la renta */
  gastosPersonales: number;
  /** 0 a 5 */
  cargasFamiliares: number;
  enfermedadCatastrofica: boolean;
}

/** Reglas de negocio del formulario. Devuelve los datos limpios y los avisos no bloqueantes. */
async function validar(
  db: Base, cuentaId: number, cuerpo: Record<string, unknown>, actual?: Fila,
): Promise<{ datos: DatosEmpleado; avisos: string[] }> {
  const texto = (campo: string) => String(cuerpo[campo] ?? "").trim();
  const errores: string[] = [];
  const avisos: string[] = [];

  const cedula = texto("cedula");
  const nombres = texto("nombres");
  const cargo = texto("cargo");
  const tipoContrato = texto("tipoContrato");
  const fechaIngreso = texto("fechaIngreso");
  const regimen = texto("regimen") || "CODIGO_TRABAJO";

  if (!cedulaValida(cedula)) errores.push("La cédula no es válida (10 dígitos, módulo 10).");
  if (!nombres || !cargo) errores.push("Nombres y cargo son obligatorios.");
  if (!CONTRATOS.includes(tipoContrato)) errores.push("Tipo de contrato inválido.");
  if (!fechaIsoValida(fechaIngreso)) errores.push("Fecha de ingreso inválida.");
  const salida = texto("fechaSalida");
  let fechaSalida: string | null = null;
  if (salida) {
    if (!fechaIsoValida(salida)) errores.push("Fecha de salida inválida.");
    else if (fechaIsoValida(fechaIngreso) && salida < fechaIngreso) {
      errores.push("La fecha de salida no puede ser anterior a la de ingreso.");
    } else fechaSalida = salida;
  }

  // El régimen existe y, si es mixto (LOEP), hace falta saber si es servidor u obrero.
  const regimenes = indexarRegimenes(await listarRegimenes(db, cuentaId));
  const elegido = regimenes.get(regimen);
  let categoriaLoep: string | null = null;
  if (!elegido) {
    errores.push("El régimen laboral no existe.");
  } else if (elegido.tipo === "mixto") {
    categoriaLoep = texto("categoriaLoep");
    if (!(CATEGORIAS_LOEP as readonly string[]).includes(categoriaLoep)) {
      errores.push(`${elegido.nombre}: indica si el empleado es servidor u obrero.`);
    }
  }

  const vacio = (v: unknown) => v === null || v === undefined || v === "";
  let aplicado: string | null = null;
  if (elegido) {
    try {
      aplicado = regimenAplicado(regimenes, regimen, categoriaLoep).codigo;
    } catch {
      /* la categoría faltante ya quedó reportada arriba */
    }
  }

  // Puesto del orgánico: si el régimen aplicado tiene puestos, se identifica primero (función,
  // responsabilidad, sector) y de él sale el nivel de la escala que sirve de referencia al sueldo.
  let puestoId: number | null = null;
  const puesto = vacio(cuerpo.puestoId) ? undefined : await buscarPuesto(db, cuentaId, Number(cuerpo.puestoId));
  const hayPuestos = aplicado !== null && (await hayPuestosDelRegimen(db, cuentaId, aplicado));
  if (!vacio(cuerpo.puestoId)) {
    if (!puesto) errores.push("El puesto no existe.");
    else if (aplicado && puesto.referencia && puesto.referencia.regimen !== aplicado) {
      errores.push(`El puesto «${puesto.nombre}» es de la escala ${puesto.referencia.regimen}, no de ${aplicado}.`);
    } else puestoId = puesto.id;
  } else if (hayPuestos) {
    errores.push("Elige el puesto del orgánico: de él sale la función y el nivel salarial de referencia.");
  }

  // Grado de la escala salarial: si el régimen que se aplica tiene escala, el grado es obligatorio
  // y debe ser de esa escala; si hay puesto, se propone el de su referencia y se avisa si es otro. El sueldo sale de la tabla.
  let escalaId: number | null = null;
  const pedido = vacio(cuerpo.escalaId) && puestoId !== null ? puesto?.escalaId : cuerpo.escalaId;
  const hayPedido = !vacio(pedido);
  const grado = hayPedido ? await buscarGrado(db, cuentaId, Number(pedido)) : undefined;
  if (hayPedido) {
    if (!grado) errores.push("El grado de la escala salarial no existe.");
    else if (aplicado && grado.regimen !== aplicado) {
      errores.push(`El grado ${grado.grado} es de la escala ${grado.regimen}, no de ${aplicado}.`);
    } else {
      escalaId = grado.id;
      if (puesto && grado.id !== puesto.escalaId) {
        avisos.push(`Aviso: el nivel ${grado.denominacion} difiere de la referencia del puesto «${puesto.nombre}».`);
      }
    }
  } else if (aplicado && (await listarEscala(db, cuentaId, aplicado)).length > 0) {
    errores.push(`Elige un grado de la escala salarial ${aplicado}: el sueldo se toma de la tabla.`);
  }

  // Opciones de pago: vacío = lo que diga el régimen.
  const modalidad = (campo: string, etiqueta: string): Modalidad | null => {
    const valor = cuerpo[campo];
    if (valor === null || valor === undefined || valor === "") return null;
    if (!MODALIDADES.includes(valor as Modalidad)) {
      errores.push(`${etiqueta}: elige 'no', 'mensual' o 'acumulado'.`);
      return null;
    }
    return valor as Modalidad;
  };
  const pagoDecimoTercero = modalidad("pagoDecimoTercero", "Décimo tercero");
  const pagoDecimoCuarto = modalidad("pagoDecimoCuarto", "Décimo cuarto");
  const pagoFondosReserva = modalidad("pagoFondosReserva", "Fondos de reserva");
  const horas = cuerpo.recibeHorasExtras;
  if (horas !== null && horas !== undefined && horas !== "" && typeof horas !== "boolean") {
    errores.push("Horas extras: indica si las recibe o deja la opción del régimen.");
  }
  const recibeHorasExtras = typeof horas === "boolean" ? horas : null;

  // Gastos personales: si el cuerpo no los trae, se conserva lo que el empleado ya tenía (0 si es nuevo).
  const falta = (campo: string) => cuerpo[campo] === undefined || cuerpo[campo] === null || cuerpo[campo] === "";
  let gastosPersonales = Number(actual?.gastos_personales ?? 0);
  if (!falta("gastosPersonales")) {
    try {
      gastosPersonales = aDecimal(cuerpo.gastosPersonales, 0).toNumber();
      if (gastosPersonales > 10_000_000) errores.push("Gastos personales: el valor es demasiado grande.");
    } catch (error) {
      errores.push(`Gastos personales: ${(error as Error).message}.`);
    }
  }
  let cargasFamiliares = Number(actual?.cargas_familiares ?? 0);
  if (!falta("cargasFamiliares")) {
    const cargas = Number(cuerpo.cargasFamiliares);
    if (!Number.isInteger(cargas) || cargas < 0 || cargas > 5) errores.push("Cargas familiares: un número entero de 0 a 5.");
    else cargasFamiliares = cargas;
  }
  let enfermedadCatastrofica = Number(actual?.enfermedad_catastrofica ?? 0) === 1;
  if (cuerpo.enfermedadCatastrofica !== undefined) {
    if (typeof cuerpo.enfermedadCatastrofica !== "boolean") {
      errores.push("Enfermedad catastrófica: indica si aplica (sí o no).");
    } else enfermedadCatastrofica = cuerpo.enfermedadCatastrofica;
  }

  let sueldoBase = 0;
  try {
    sueldoBase = aDecimal(cuerpo.sueldoBase).toNumber();
    if (sueldoBase <= 0) errores.push("El sueldo base debe ser mayor a cero.");
    else {
      // El sueldo registrado es el de hoy, así que se compara con el SBU de este año; si el año aún no
      // tiene parámetros se usa el último que haya y se avisa.
      const anioActual = new Date().getFullYear();
      const { parametros } = await parametrosDelAnio(db, cuentaId, anioActual);
      const sinParametros = avisoDeAnioSinParametros(anioActual, parametros);
      if (sinParametros) avisos.push(sinParametros);
      if (grado && escalaId !== null && grado.esMinimo && sueldoBase < grado.rmu) {
        errores.push(
          `No se puede registrar al empleado: el sueldo ($${sueldoBase}) es menor al mínimo del nivel ${grado.denominacion} ($${grado.rmu}).`,
        );
      } else if (sueldoBase < parametros.sbu) {
        errores.push(
          `No se puede registrar al empleado: el sueldo ($${sueldoBase}) es menor al salario básico unificado ${parametros.anio} ($${parametros.sbu}).`,
        );
      }
      if (grado && escalaId !== null && !grado.esMinimo && sueldoBase !== grado.rmu) {
        errores.push(`El sueldo ($${sueldoBase}) debe ser la RMU del grado ${grado.grado} ($${grado.rmu}).`);
      }
    }
  } catch (error) {
    errores.push(`Sueldo base: ${(error as Error).message}.`);
  }

  if (errores.length) throw new ErrorApi(400, errores);
  return {
    datos: {
      cedula, nombres, cargo, sueldoBase, fechaIngreso, fechaSalida, tipoContrato, regimen, categoriaLoep, escalaId, puestoId,
      pagoDecimoTercero, pagoDecimoCuarto, pagoFondosReserva, recibeHorasExtras,
      gastosPersonales, cargasFamiliares, enfermedadCatastrofica,
    },
    avisos,
  };
}

/** La fecha de hoy en Ecuador (AAAA-MM-DD), no la del servidor, que en Vercel corre en UTC. */
const hoyEnEcuador = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Guayaquil" });

const aApi = (fila: Fila) => ({
  ...filaACamel(fila),
  activo: fila.activo === 1,
  recibeHorasExtras: fila.recibe_horas_extras === null ? null : fila.recibe_horas_extras === 1,
  enfermedadCatastrofica: fila.enfermedad_catastrofica === 1,
});

export function rutasEmpleados(db: Base): Router {
  const router = Router();

  const buscar = async (cuentaId: number, idTexto: string): Promise<Fila> => {
    const fila = await uno(db, "SELECT * FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, leerId(idTexto));
    if (!fila) throw new ErrorApi(404, ["El empleado no existe."]);
    return fila;
  };

  /** Traduce el choque con la restricción UNIQUE de la cédula a un 409 legible. */
  const guardar = async <T>(accion: () => Promise<T>): Promise<T> => {
    try {
      return await accion();
    } catch (error) {
      if (esDuplicado(error)) {
        throw new ErrorApi(409, ["Ya existe un empleado con esa cédula."]);
      }
      throw error;
    }
  };

  router.get("/", async (_req, res) => {
    res.json((await consultar(db, "SELECT * FROM empleados WHERE cuenta_id = ? ORDER BY activo DESC, nombres", cuentaDe(res))).map(aApi));
  });

  router.post("/demo", async (_req, res) => {
    res.status(201).json({ agregados: await cargarEmpleadosDemo(db, cuentaDe(res)) });
  });

  router.get("/:id", async (req, res) => {
    res.json(aApi(await buscar(cuentaDe(res), req.params.id)));
  });

  router.post("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { datos, avisos } = await validar(db, cuentaId, req.body ?? {});
    const id = await guardar(() =>
      insertar(
        db,
        `INSERT INTO empleados (cuenta_id, cedula, nombres, cargo, sueldo_base, fecha_ingreso, fecha_salida, tipo_contrato,
         regimen, categoria_loep, escala_id, puesto_id, pago_decimo_tercero, pago_decimo_cuarto,
         pago_fondos_reserva, recibe_horas_extras, gastos_personales, cargas_familiares, enfermedad_catastrofica)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cuentaId, datos.cedula, datos.nombres, datos.cargo, datos.sueldoBase, datos.fechaIngreso, datos.fechaSalida,
        datos.tipoContrato, datos.regimen, datos.categoriaLoep, datos.escalaId, datos.puestoId,
        datos.pagoDecimoTercero, datos.pagoDecimoCuarto, datos.pagoFondosReserva,
        datos.recibeHorasExtras === null ? null : Number(datos.recibeHorasExtras),
        datos.gastosPersonales, datos.cargasFamiliares, Number(datos.enfermedadCatastrofica),
      ),
    );
    res.status(201).json({ ...aApi(await buscar(cuentaId, String(id))), avisos });
  });

  router.put("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    const { datos, avisos } = await validar(db, cuentaId, req.body ?? {}, actual);
    await guardar(async () => {
      await ejecutar(
        db,
        `UPDATE empleados SET cedula = ?, nombres = ?, cargo = ?, sueldo_base = ?,
         fecha_ingreso = ?, fecha_salida = ?, tipo_contrato = ?, regimen = ?, categoria_loep = ?, escala_id = ?, puesto_id = ?,
         pago_decimo_tercero = ?, pago_decimo_cuarto = ?, pago_fondos_reserva = ?, recibe_horas_extras = ?,
         gastos_personales = ?, cargas_familiares = ?, enfermedad_catastrofica = ?
         WHERE cuenta_id = ? AND id = ?`,
        datos.cedula, datos.nombres, datos.cargo, datos.sueldoBase, datos.fechaIngreso, datos.fechaSalida,
        datos.tipoContrato, datos.regimen, datos.categoriaLoep, datos.escalaId, datos.puestoId,
        datos.pagoDecimoTercero, datos.pagoDecimoCuarto, datos.pagoFondosReserva,
        datos.recibeHorasExtras === null ? null : Number(datos.recibeHorasExtras),
        datos.gastosPersonales, datos.cargasFamiliares, Number(datos.enfermedadCatastrofica), cuentaId, actual.id,
      );
      await soltarResponsable(db, cuentaId, Number(actual.id), datos.puestoId); // si cambió de puesto, ya no lo encabeza
    });
    res.json({ ...aApi(await buscar(cuentaId, req.params.id)), avisos });
  });

  router.patch("/:id/estado", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    // Desactivar a alguien es registrar su salida (hoy, o la fecha que se indique); reactivarlo la borra.
    const pedida = req.body?.fechaSalida;
    if (pedida !== undefined && pedida !== null && pedida !== "" && !fechaIsoValida(pedida)) {
      throw new ErrorApi(400, ["Fecha de salida inválida."]);
    }
    const hoy = hoyEnEcuador();
    const salida = pedida ? String(pedida) : hoy < String(actual.fecha_ingreso) ? String(actual.fecha_ingreso) : hoy;
    if (actual.activo === 1 && salida < String(actual.fecha_ingreso)) {
      throw new ErrorApi(400, ["La fecha de salida no puede ser anterior a la de ingreso."]);
    }
    await ejecutar(
      db,
      "UPDATE empleados SET activo = 1 - activo, fecha_salida = CASE WHEN activo = 1 THEN ? ELSE NULL END WHERE cuenta_id = ? AND id = ?",
      salida, cuentaId, actual.id,
    );
    if (actual.activo === 1) await soltarResponsable(db, cuentaId, Number(actual.id), null); // quien se desactiva deja de ser responsable
    res.json(aApi(await buscar(cuentaId, req.params.id)));
  });

  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    await ejecutar(db, "DELETE FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, actual.id);
    res.status(204).end();
  });

  return router;
}
