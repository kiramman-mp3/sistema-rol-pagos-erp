import { Router } from "express";

import { consultar, ejecutar, filaACamel, insertar, uno } from "../db.ts";
import type { Base, Fila } from "../db.ts";
import { hoyEnEcuador } from "../regimenes.ts";
import { diasEntre, diasGozados, diasPorAnioDe, saldoDeVacaciones } from "../vacaciones.ts";
import { ErrorApi, esId, fechaIsoValida, leerId } from "../validaciones.ts";
import { cuentaDe } from "./auth.ts";

const SELECT = `SELECT v.*, e.nombres, e.cedula FROM vacaciones_gozadas v JOIN empleados e ON e.id = v.empleado_id`;

/** La fecha hasta la que se devengan los días: hoy, o la salida si ya se fue. */
const corteDe = (e: Fila, hasta: string) => (e.fecha_salida && String(e.fecha_salida) < hasta ? String(e.fecha_salida) : hasta);

export function rutasVacaciones(db: Base): Router {
  const router = Router();

  /** Cuántos días lleva devengados, gozados y le quedan a cada persona que sigue en la empresa. */
  router.get("/saldos", async (_req, res) => {
    const cuentaId = cuentaDe(res);
    const hoy = hoyEnEcuador();
    const empleados = await consultar(db, "SELECT * FROM empleados WHERE cuenta_id = ? AND activo = 1 ORDER BY nombres", cuentaId);
    const dias = await diasPorAnioDe(db, cuentaId, empleados, hoy);
    const gozados = await diasGozados(db, cuentaId);
    res.json(empleados.map((e) => ({
      empleadoId: e.id, nombres: e.nombres, cedula: e.cedula, fechaIngreso: e.fecha_ingreso,
      ...saldoDeVacaciones(String(e.fecha_ingreso), corteDe(e, hoy), dias.get(Number(e.id)) ?? 0, gozados.get(Number(e.id)) ?? 0),
    })));
  });

  router.get("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const filtro = req.query.empleadoId === undefined ? null : leerId(String(req.query.empleadoId));
    const filas = filtro === null
      ? await consultar(db, `${SELECT} WHERE v.cuenta_id = ? ORDER BY v.desde DESC, v.id DESC`, cuentaId)
      : await consultar(db, `${SELECT} WHERE v.cuenta_id = ? AND v.empleado_id = ? ORDER BY v.desde DESC, v.id DESC`, cuentaId, filtro);
    res.json(filas.map(filaACamel));
  });

  router.post("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const cuerpo = req.body ?? {};
    const errores: string[] = [];
    const empleadoId = Number(cuerpo.empleadoId);
    const empleado = esId(empleadoId)
      ? await uno(db, "SELECT * FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, empleadoId)
      : undefined;
    if (!empleado) errores.push("El empleado no existe.");
    const { desde, hasta } = cuerpo;
    const observacion = String(cuerpo.observacion ?? "").trim();
    if (!fechaIsoValida(desde)) errores.push("Fecha de inicio inválida.");
    if (!fechaIsoValida(hasta)) errores.push("Fecha de fin inválida.");
    if (observacion.length > 200) errores.push("Observación: máximo 200 caracteres.");
    if (fechaIsoValida(desde) && fechaIsoValida(hasta)) {
      if (hasta < desde) errores.push("La fecha de fin no puede ser anterior a la de inicio.");
      else if (diasEntre(desde, hasta) > 366) errores.push("Un periodo no puede pasar de 366 días.");
      if (empleado && desde < String(empleado.fecha_ingreso)) errores.push("Las vacaciones no pueden empezar antes del ingreso del empleado.");
      if (empleado?.fecha_salida && hasta > String(empleado.fecha_salida)) errores.push("Las vacaciones no pueden terminar después de la salida del empleado.");
    }
    if (errores.length || !empleado) throw new ErrorApi(400, errores);

    const desdeIso = desde as string;
    const hastaIso = hasta as string;
    const choque = await uno(
      db, "SELECT desde, hasta FROM vacaciones_gozadas WHERE empleado_id = ? AND desde <= ? AND hasta >= ?", empleadoId, hastaIso, desdeIso,
    );
    if (choque) throw new ErrorApi(409, [`Ya tiene vacaciones del ${choque.desde} al ${choque.hasta}, que se cruzan con estas fechas.`]);

    const dias = diasEntre(desdeIso, hastaIso);
    const id = await insertar(
      db,
      `INSERT INTO vacaciones_gozadas (cuenta_id, empleado_id, desde, hasta, dias, observacion, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      cuentaId, empleadoId, desdeIso, hastaIso, dias, observacion, new Date().toISOString().slice(0, 19),
    );

    // No bloquea: avisa si, con estas vacaciones, ya tomó más días de los que lleva devengados a esa fecha.
    const avisos: string[] = [];
    const porAnio = (await diasPorAnioDe(db, cuentaId, [empleado], hastaIso)).get(empleadoId) ?? 0;
    const total = (await diasGozados(db, cuentaId)).get(empleadoId) ?? 0;
    const saldo = saldoDeVacaciones(String(empleado.fecha_ingreso), corteDe(empleado, hastaIso), porAnio, total);
    if (saldo.saldo < 0) {
      avisos.push(`${empleado.nombres} ha tomado ${saldo.gozados} días y a esa fecha lleva devengados ${saldo.devengados}: queda debiendo ${-saldo.saldo}.`);
    }
    res.status(201).json({ ...filaACamel((await uno(db, `${SELECT} WHERE v.id = ?`, id)) as Fila), avisos });
  });

  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const id = leerId(req.params.id);
    if (!(await uno(db, "SELECT id FROM vacaciones_gozadas WHERE cuenta_id = ? AND id = ?", cuentaId, id))) {
      throw new ErrorApi(404, ["El periodo de vacaciones no existe."]);
    }
    await ejecutar(db, "DELETE FROM vacaciones_gozadas WHERE cuenta_id = ? AND id = ?", cuentaId, id);
    res.status(204).end();
  });

  return router;
}
