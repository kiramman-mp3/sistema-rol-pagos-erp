import { Router } from "express";
import type { Response } from "express";
import { Decimal } from "decimal.js";

import type { ResultadoRol } from "../calculos.ts";
import { listarAuditoria, registrarAuditoria } from "../auditoria.ts";
import { darPaso, esInmutable, exigirPaso, rechazarValidacion, revisarRol } from "../ciclo.ts";
import {
  consultar, ejecutar, esDuplicado, filaACamel, insertar, transaccion, uno,
} from "../db.ts";
import type { Base, Fila } from "../db.ts";
import { calcularMes, CAMPOS_NOVEDAD, COLUMNAS_NOVEDAD, insertarDetalle, totalDe } from "../nomina.ts";
import type { Novedad } from "../nomina.ts";
import { parametrosDelAnio } from "../parametros.ts";
import { detalleVigente, reliquidar } from "../reliquidacion.ts";
import { fechaDeCierre, indexarRegimenes, listarRegimenes, opcionesDe, regimenAplicado } from "../regimenes.ts";
import { documentoCsv } from "../csv.ts";
import { planillaIess } from "../iess.ts";
import { aDecimal, ErrorApi, leerId } from "../validaciones.ts";
import { cuentaDe, usuarioDe } from "./auth.ts";

export type { Novedad };

function leerPeriodo(anioTexto: unknown, mesTexto: unknown): { anio: number; mes: number } {
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || anio < 2020 || anio > 2100 || mes < 1 || mes > 12) {
    throw new ErrorApi(400, ["Período inválido."]);
  }
  return { anio, mes };
}

/**
 * Quienes estuvieron en nómina ese mes: ingresaron antes de que termine y no salieron antes de que
 * empiece (las fechas ISO se comparan como texto). Un inactivo sin fecha de salida está fuera de todos
 * los meses; uno con fecha de salida sigue en los meses hasta ella.
 */
export function empleadosDelPeriodo(db: Base, cuentaId: number, anio: number, mes: number): Promise<Fila[]> {
  const mesTexto = `${anio}-${String(mes).padStart(2, "0")}`;
  return consultar(
    db,
    `SELECT * FROM empleados
     WHERE cuenta_id = ? AND fecha_ingreso <= ? AND (fecha_salida IS NULL OR fecha_salida >= ?)
       AND (activo = 1 OR fecha_salida IS NOT NULL)
     ORDER BY nombres`,
    cuentaId, `${mesTexto}-31`, `${mesTexto}-01`,
  );
}

/** Estado del rol de ese mes; `undefined` si todavía no se generó. */
const estadoDelRol = async (db: Base, cuentaId: number, anio: number, mes: number) =>
  (await uno(db, "SELECT estado FROM roles_cabecera WHERE cuenta_id = ? AND anio = ? AND mes = ? AND tipo = 'ordinario'", cuentaId, anio, mes))
    ?.estado as string | undefined;

const errorRolInmutable = (anio: number, mes: number, estado: unknown) =>
  new ErrorApi(409, [
    `El rol de ${anio}-${String(mes).padStart(2, "0")} está «${estado}»: ya no se puede recalcular ni eliminar.`,
  ]);

/**
 * Calcula y guarda todo en una sola transacción; reemplaza el rol del mes si existía, salvo que esté
 * publicado o pagado (409). El rol nuevo empieza en «calculado». `usuarioId` es quien lo pidió (`null`: el sistema).
 */
export async function guardarRol(
  db: Base, cuentaId: number, anio: number, mes: number,
  empleados: Fila[], novedades: Map<number, Novedad>, usuarioId: number | null = null,
): Promise<{ rolId: number; avisos: string[] }> {
  const cero = new Decimal(0);
  const { calculos, avisos } = await calcularMes(db, cuentaId, anio, mes, empleados.map((e) => ({ e })), novedades);
  const total = (campo: keyof ResultadoRol) => totalDe(calculos, campo);

  const rolId = await transaccion(db, async (tx) => {
    // Un rol publicado no se toca: el DELETE lo salta y el INSERT choca con el UNIQUE del mes.
    const reemplazado = await consultar(
      tx,
      `DELETE FROM roles_cabecera
       WHERE cuenta_id = ? AND anio = ? AND mes = ? AND tipo = 'ordinario' AND estado NOT IN ('publicado', 'pagado') RETURNING id`,
      cuentaId, anio, mes,
    );
    let nuevoId: number;
    try {
      nuevoId = await insertar(
        tx,
        `INSERT INTO roles_cabecera (cuenta_id, anio, mes, generado_en, num_empleados, total_ingresos,
         total_descuentos, total_neto, total_provisiones, total_costo, generado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cuentaId, anio, mes, new Date().toISOString().slice(0, 19), calculos.length,
        total("totalIngresos"), total("totalDescuentos"), total("netoPagar"),
        total("totalProvisiones"), total("costoEmpleador"), usuarioId,
      );
    } catch (error) {
      if (esDuplicado(error)) throw errorRolInmutable(anio, mes, "publicado");
      throw error;
    }
    await registrarAuditoria(tx, {
      cuentaId, usuarioId, accion: "rol.calculado", entidad: "rol", entidadId: nuevoId,
      detalle: {
        anio, mes, empleados: calculos.length, neto: total("netoPagar"),
        ...(reemplazado.length ? { reemplazaAlRol: Number(reemplazado[0].id) } : {}),
      },
    });

    for (const c of calculos) {
      const { e, n } = c;
      await insertarDetalle(tx, nuevoId, c);
      await ejecutar(
        tx,
        `INSERT INTO novedades (empleado_id, anio, mes, ${COLUMNAS_NOVEDAD.join(", ")})
         VALUES (?, ?, ?, ${COLUMNAS_NOVEDAD.map(() => "?").join(", ")})
         ON CONFLICT (empleado_id, anio, mes) DO UPDATE SET
         ${COLUMNAS_NOVEDAD.map((c) => `${c} = excluded.${c}`).join(", ")}`,
        Number(e.id), anio, mes,
        ...CAMPOS_NOVEDAD.map((campo) => (n?.[campo] ?? cero).toNumber()),
      );
    }
    return nuevoId;
  });
  return { rolId, avisos };
}

const COLUMNAS_CSV = [
  "cedula", "nombres", "cargo", "regimen_aplicado", "sueldo", "valor_horas_suplementarias",
  "valor_horas_extraordinarias", "valor_horas_descanso", "valor_recargo_nocturno", "comisiones",
  "ingresos_aportables", "beneficios_mensuales", "total_ingresos", "aporte_iess", "impuesto_renta",
  "otros_descuentos", "total_descuentos", "neto_pagar", "decimo_tercero", "decimo_tercero_modalidad",
  "decimo_cuarto", "decimo_cuarto_modalidad", "fondos_reserva", "fondos_reserva_modalidad",
  "vacaciones", "aporte_patronal", "costo_empleador",
];

const COLUMNAS_IESS = [
  "cedula", "nombres", "regimen", "dias_trabajados", "materia_gravada", "tasa_aporte_personal", "aporte_personal",
  "tasa_aporte_patronal", "aporte_patronal", "total_aportes", "fondos_reserva_a_depositar_en_iess",
  "fondos_reserva_pagados_en_rol",
];

/** La traza se pide aparte (pesa y solo se mira de a un empleado): el detalle solo dice si la hay. */
const sinTraza = ({ traza, ...fila }: Fila) => ({ ...filaACamel(fila), tieneTraza: traza !== null && traza !== undefined });

export function rutasRoles(db: Base): Router {
  const router = Router();

  const cargar = async (cuentaId: number, idTexto: string) => {
    const cabecera = await uno(db, "SELECT * FROM roles_cabecera WHERE cuenta_id = ? AND id = ?", cuentaId, leerId(idTexto));
    if (!cabecera) throw new ErrorApi(404, ["El rol no existe."]);
    const detalle = await consultar(
      db, "SELECT * FROM roles_detalle WHERE rol_id = ? ORDER BY nombres", Number(cabecera.id),
    );
    return { cabecera, detalle };
  };

  router.get("/", async (_req, res) => {
    res.json(
      (await consultar(db, "SELECT * FROM roles_cabecera WHERE cuenta_id = ? ORDER BY anio DESC, mes DESC", cuentaDe(res))).map(filaACamel),
    );
  });

  /** Empleados que entrarán al rol del mes y las novedades que ya se habían digitado. */
  router.get("/periodo/:anio/:mes", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { anio, mes } = leerPeriodo(req.params.anio, req.params.mes);
    const regimenes = indexarRegimenes(await listarRegimenes(db, cuentaId, fechaDeCierre(anio, mes)));
    const estadoRol = await estadoDelRol(db, cuentaId, anio, mes);
    const guardadas = new Map(
      (await consultar(
        db,
        `SELECT n.* FROM novedades n JOIN empleados e ON e.id = n.empleado_id
         WHERE e.cuenta_id = ? AND n.anio = ? AND n.mes = ?`,
        cuentaId, anio, mes,
      )).map((n) => [Number(n.empleado_id), n]),
    );
    res.json({
      anio, mes,
      existe: estadoRol !== undefined,
      estado: estadoRol ?? null,
      empleados: (await empleadosDelPeriodo(db, cuentaId, anio, mes)).map((e) => {
        const g = guardadas.get(Number(e.id));
        return {
          id: e.id, nombres: e.nombres, cargo: e.cargo, sueldoBase: e.sueldo_base,
          regimen: e.regimen,
          regimenAplicado: regimenAplicado(regimenes, String(e.regimen), e.categoria_loep as string | null).codigo,
          recibeHorasExtras: opcionesDe(
            regimenAplicado(regimenes, String(e.regimen), e.categoria_loep as string | null), e,
          ).recibeHorasExtras,
          novedades: {
            horasSuplementarias: g?.horas_suplementarias ?? 0,
            horasExtraordinarias: g?.horas_extraordinarias ?? 0,
            horasDescanso: g?.horas_descanso ?? 0,
            horasNocturnas: g?.horas_nocturnas ?? 0,
            comisiones: g?.comisiones ?? 0,
            otrosDescuentos: g?.otros_descuentos ?? 0,
          },
        };
      }),
    });
  });

  router.post("/generar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const cuerpo = req.body ?? {};
    const { anio, mes } = leerPeriodo(cuerpo.anio, cuerpo.mes);
    const estadoActual = await estadoDelRol(db, cuentaId, anio, mes);
    if (esInmutable(estadoActual)) throw errorRolInmutable(anio, mes, estadoActual);
    const empleados = await empleadosDelPeriodo(db, cuentaId, anio, mes);
    if (!empleados.length) throw new ErrorApi(400, ["No hay empleados activos para ese período."]);

    const errores: string[] = [];
    const novedades = new Map<number, Novedad>();
    const enviadas: Record<string, unknown>[] = Array.isArray(cuerpo.novedades) ? cuerpo.novedades : [];
    for (const e of empleados) {
      const enviada = enviadas.find((n) => Number(n.empleadoId) === Number(e.id)) ?? {};
      try {
        novedades.set(
          Number(e.id),
          Object.fromEntries(CAMPOS_NOVEDAD.map((c) => [c, aDecimal(enviada[c])])) as Novedad,
        );
      } catch (error) {
        errores.push(`${e.nombres}: ${(error as Error).message}.`);
      }
    }
    if (errores.length) throw new ErrorApi(400, errores);

    const { rolId, avisos } = await guardarRol(db, cuentaId, anio, mes, empleados, novedades, usuarioDe(res));
    res.status(201).json({ id: rolId, empleados: empleados.length, avisos });
  });

  router.get("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera, detalle } = await cargar(cuentaId, req.params.id);
    const base = { ...filaACamel(cabecera), detalle: detalle.map(sinTraza) };
    if (cabecera.tipo === "ajuste") {
      const origen = await uno(db, "SELECT id, anio, mes, estado FROM roles_cabecera WHERE id = ?", Number(cabecera.rol_origen_id));
      return void res.json({ ...base, origen: origen ? filaACamel(origen) : null });
    }
    // Un rol publicado o pagado puede tener ajustes: se listan, y se da cómo quedó cada empleado y el total del mes.
    const ajustes = await consultar(
      db,
      `SELECT id, estado, motivo, generado_en, num_empleados, total_ingresos, total_descuentos, total_neto,
              total_provisiones, total_costo
       FROM roles_cabecera WHERE cuenta_id = ? AND rol_origen_id = ? ORDER BY id`,
      cuentaId, Number(cabecera.id),
    );
    const vigentes = ajustes.filter((a) => a.estado === "publicado" || a.estado === "pagado");
    const sumar = (campo: string) =>
      vigentes.reduce((s, a) => s.plus(Number(a[campo])), new Decimal(Number(cabecera[campo]))).toDecimalPlaces(2).toNumber();
    res.json({
      ...base,
      ajustes: ajustes.map(filaACamel),
      consolidado: ajustes.length ? {
        totalIngresos: sumar("total_ingresos"), totalDescuentos: sumar("total_descuentos"), totalNeto: sumar("total_neto"),
        totalProvisiones: sumar("total_provisiones"), totalCosto: sumar("total_costo"),
      } : null,
      vigente: cabecera.estado === "publicado" || cabecera.estado === "pagado"
        ? (await detalleVigente(db, Number(cabecera.id))).map(sinTraza) : [],
    });
  });

  /** Cómo se calculó a un empleado en este rol: cada paso con su fórmula, sus números y el régimen con que se hizo. */
  router.get("/:id/traza/:cedula", async (req, res) => {
    const { cabecera, detalle } = await cargar(cuentaDe(res), req.params.id);
    const fila = detalle.find((d) => String(d.cedula) === req.params.cedula);
    if (!fila) throw new ErrorApi(404, ["Esa persona no está en este rol."]);
    if (!fila.traza) {
      throw new ErrorApi(404, ["Este rol se calculó antes de que se guardara el desglose: no hay cómo explicarlo."]);
    }
    res.json({
      cedula: fila.cedula, nombres: fila.nombres, anio: cabecera.anio, mes: cabecera.mes, ajuste: cabecera.tipo === "ajuste",
      ...JSON.parse(String(fila.traza)),
    });
  });

  /**
   * Corrige un rol publicado o pagado con un rol de ajuste: recalcula el mes con los cambios pedidos y
   * guarda solo la diferencia. Cuerpo: `motivo` y `cambios` (por cédula: sueldoBase, horas, comisiones, descuentos).
   */
  router.post("/:id/reliquidar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera } = await cargar(cuentaId, req.params.id);
    const cuerpo = req.body ?? {};
    const { rolId, empleados, avisos } = await reliquidar(
      db, cuentaId, usuarioDe(res), Number(cabecera.id), cuerpo.motivo, cuerpo.cambios,
    );
    res.status(201).json({ id: rolId, empleados, avisos });
  });

  router.get("/:id/csv", async (req, res) => {
    const { cabecera, detalle } = await cargar(cuentaDe(res), req.params.id);
    const nombre = `rol_${cabecera.anio}_${String(cabecera.mes).padStart(2, "0")}.csv`;
    res
      .type("text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename=${nombre}`)
      .send(documentoCsv(COLUMNAS_CSV, detalle.map((d) => COLUMNAS_CSV.map((c) => d[c]))));
  });

  /** Aportes del rol por empleado, para contrastarlos con el comprobante del IESS. */
  router.get("/:id/iess", async (req, res) => {
    const { cabecera, detalle } = await cargar(cuentaDe(res), req.params.id);
    res.json(planillaIess(Number(cabecera.anio), Number(cabecera.mes), detalle));
  });

  router.get("/:id/iess.csv", async (req, res) => {
    const { cabecera, detalle } = await cargar(cuentaDe(res), req.params.id);
    const p = planillaIess(Number(cabecera.anio), Number(cabecera.mes), detalle);
    const filas: unknown[][] = p.filas.map((f) => [
      f.cedula, f.nombres, f.regimenAplicado, f.diasTrabajados, f.materiaGravada, f.tasaPersonal,
      f.aportePersonal, f.tasaPatronal, f.aportePatronal, f.totalAportes, f.fondosADepositar, f.fondosPagadosEnRol,
    ]);
    filas.push([
      "TOTAL", "", "", "", p.totales.materiaGravada, "", p.totales.aportePersonal, "", p.totales.aportePatronal,
      p.totales.totalAportes, p.totales.fondosADepositar, p.totales.fondosPagadosEnRol,
    ]);
    const nombre = `iess_${p.anio}_${String(p.mes).padStart(2, "0")}.csv`;
    res
      .type("text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename=${nombre}`)
      .send(documentoCsv(COLUMNAS_IESS, filas));
  });

  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera } = await cargar(cuentaId, req.params.id);
    if (esInmutable(cabecera.estado)) throw errorRolInmutable(Number(cabecera.anio), Number(cabecera.mes), cabecera.estado);
    await transaccion(db, async (tx) => {
      const { changes } = await ejecutar(
        tx,
        "DELETE FROM roles_cabecera WHERE cuenta_id = ? AND id = ? AND estado NOT IN ('publicado', 'pagado')",
        cuentaId, Number(cabecera.id),
      );
      if (!changes) throw errorRolInmutable(Number(cabecera.anio), Number(cabecera.mes), "publicado");
      await registrarAuditoria(tx, {
        cuentaId, usuarioId: usuarioDe(res), accion: "rol.eliminado", entidad: "rol", entidadId: Number(cabecera.id),
        detalle: { anio: cabecera.anio, mes: cabecera.mes, estado: cabecera.estado },
      });
    });
    res.status(204).end();
  });

  /** Lo que impide o desaconseja avanzar el rol, con los datos de hoy (empleados y parámetros de ley). */
  const revisar = async (cuentaId: number, cabecera: Fila, detalle: Fila[]) => {
    const anio = Number(cabecera.anio);
    const { parametros } = await parametrosDelAnio(db, cuentaId, anio);
    const ajuste = cabecera.tipo === "ajuste";
    const esperados = ajuste ? [] : await empleadosDelPeriodo(db, cuentaId, anio, Number(cabecera.mes));
    return revisarRol(cabecera, detalle, esperados, parametros.anio, ajuste);
  };

  /** Responde con el rol tal como quedó después del paso. */
  const responderCabecera = async (cuentaId: number, id: number, res: Response) => {
    res.json(filaACamel((await uno(db, "SELECT * FROM roles_cabecera WHERE cuenta_id = ? AND id = ?", cuentaId, id))!));
  };

  /** Revisa el rol: si no hay errores bloqueantes pasa a «validado»; si los hay, no avanza (y uno validado retrocede). */
  router.post("/:id/validar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const usuarioId = usuarioDe(res);
    const { cabecera, detalle } = await cargar(cuentaId, req.params.id);
    exigirPaso(cabecera, "validar");
    const { errores, avisos } = await revisar(cuentaId, cabecera, detalle);
    if (errores.length) await rechazarValidacion(db, cuentaId, usuarioId, Number(cabecera.id), errores);
    else await darPaso(db, cuentaId, usuarioId, Number(cabecera.id), "validar", { avisos });
    const actual = (await uno(db, "SELECT estado FROM roles_cabecera WHERE id = ?", Number(cabecera.id)))!;
    res.json({ valido: !errores.length, estado: actual.estado, errores, avisos });
  });

  /** Con la separación de funciones activada, quien generó el rol no puede aprobarlo ni publicarlo. */
  const exigirOtraPersona = async (cuentaId: number, cabecera: Fila, usuarioId: number) => {
    const cuenta = await uno(db, "SELECT separar_funciones FROM cuentas WHERE id = ?", cuentaId);
    if (Boolean(cuenta?.separar_funciones) && cabecera.generado_por === usuarioId) {
      throw new ErrorApi(403, [
        "Con la separación de funciones activada, quien generó el rol no puede aprobarlo ni publicarlo.",
      ]);
    }
  };

  router.post("/:id/aprobar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera } = await cargar(cuentaId, req.params.id);
    await exigirOtraPersona(cuentaId, cabecera, usuarioDe(res));
    await darPaso(db, cuentaId, usuarioDe(res), Number(cabecera.id), "aprobar");
    await responderCabecera(cuentaId, Number(cabecera.id), res);
  });

  /** Publicar vuelve a revisar el rol: los datos pudieron cambiar desde que se validó. */
  router.post("/:id/publicar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera, detalle } = await cargar(cuentaId, req.params.id);
    exigirPaso(cabecera, "publicar");
    await exigirOtraPersona(cuentaId, cabecera, usuarioDe(res));
    const { errores } = await revisar(cuentaId, cabecera, detalle);
    if (errores.length) throw new ErrorApi(409, ["No se puede publicar el rol:", ...errores]);
    await darPaso(db, cuentaId, usuarioDe(res), Number(cabecera.id), "publicar");
    await responderCabecera(cuentaId, Number(cabecera.id), res);
  });

  router.post("/:id/pagar", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera } = await cargar(cuentaId, req.params.id);
    await darPaso(db, cuentaId, usuarioDe(res), Number(cabecera.id), "pagar");
    await responderCabecera(cuentaId, Number(cabecera.id), res);
  });

  /** Quién hizo cada paso del rol y cuándo. */
  router.get("/:id/historial", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const { cabecera } = await cargar(cuentaId, req.params.id);
    res.json(await listarAuditoria(db, cuentaId, "rol", Number(cabecera.id)));
  });

  return router;
}
