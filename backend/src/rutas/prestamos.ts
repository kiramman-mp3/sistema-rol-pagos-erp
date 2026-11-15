import { Router } from "express";

import { consultar, ejecutar, filaACamel, insertar, uno } from "../db.ts";
import type { Base, Fila } from "../db.ts";
import { TIPOS_PRESTAMO } from "../prestamos.ts";
import { aDecimal, ErrorApi, esId, leerId } from "../validaciones.ts";
import { cuentaDe } from "./auth.ts";

interface DatosPrestamo {
  empleadoId: number;
  tipo: string;
  cuota: number;
  cuotas: number;
  primerAnio: number;
  primerMes: number;
  observacion: string;
}

/** Reglas del formulario: devuelve los datos limpios o un 400 con todos los errores juntos. */
async function validar(db: Base, cuentaId: number, cuerpo: Record<string, unknown>): Promise<DatosPrestamo> {
  const errores: string[] = [];
  const empleadoId = Number(cuerpo.empleadoId);
  if (!esId(empleadoId) || !(await uno(db, "SELECT id FROM empleados WHERE cuenta_id = ? AND id = ?", cuentaId, empleadoId))) {
    errores.push("El empleado no existe.");
  }
  const tipo = String(cuerpo.tipo ?? "");
  if (!(TIPOS_PRESTAMO as readonly string[]).includes(tipo)) errores.push("Tipo de préstamo: quirografario, hipotecario o prendario.");

  let cuota = 0;
  try {
    cuota = aDecimal(cuerpo.cuota, 0.01).toDecimalPlaces(2).toNumber();
    if (cuota > 1_000_000) errores.push("Cuota: el valor es demasiado grande.");
  } catch (error) {
    errores.push(`Cuota: ${(error as Error).message}.`);
  }
  const cuotas = Number(cuerpo.cuotas);
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 360) errores.push("Número de cuotas: un entero de 1 a 360.");
  const primerAnio = Number(cuerpo.primerAnio);
  const primerMes = Number(cuerpo.primerMes);
  if (!Number.isInteger(primerAnio) || primerAnio < 2020 || primerAnio > 2100) errores.push("Primer año de descuento inválido.");
  if (!Number.isInteger(primerMes) || primerMes < 1 || primerMes > 12) errores.push("Primer mes de descuento inválido.");
  const observacion = String(cuerpo.observacion ?? "").trim();
  if (observacion.length > 200) errores.push("Observación: máximo 200 caracteres.");

  if (errores.length) throw new ErrorApi(400, errores);
  return { empleadoId, tipo, cuota, cuotas, primerAnio, primerMes, observacion };
}

const aApi = (f: Fila) => {
  const termina = Number(f.primer_anio) * 12 + Number(f.primer_mes) - 1 + Number(f.cuotas) - 1;
  return {
    ...filaACamel(f), activo: Number(f.activo) === 1,
    // El mes de la última cuota, para ver hasta cuándo se descuenta.
    ultimoAnio: Math.floor(termina / 12), ultimoMes: (termina % 12) + 1,
    total: Math.round(Number(f.cuota) * Number(f.cuotas) * 100) / 100,
  };
};

const SELECT = `SELECT p.*, e.nombres, e.cedula FROM prestamos_iess p JOIN empleados e ON e.id = p.empleado_id`;

export function rutasPrestamos(db: Base): Router {
  const router = Router();

  const buscar = async (cuentaId: number, idTexto: string): Promise<Fila> => {
    const fila = await uno(db, `${SELECT} WHERE p.cuenta_id = ? AND p.id = ?`, cuentaId, leerId(idTexto));
    if (!fila) throw new ErrorApi(404, ["El préstamo no existe."]);
    return fila;
  };

  router.get("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const filtro = req.query.empleadoId === undefined ? null : leerId(String(req.query.empleadoId));
    const filas = filtro === null
      ? await consultar(db, `${SELECT} WHERE p.cuenta_id = ? ORDER BY e.nombres, p.id`, cuentaId)
      : await consultar(db, `${SELECT} WHERE p.cuenta_id = ? AND p.empleado_id = ? ORDER BY p.id`, cuentaId, filtro);
    res.json(filas.map(aApi));
  });

  router.get("/:id", async (req, res) => {
    res.json(aApi(await buscar(cuentaDe(res), req.params.id)));
  });

  router.post("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const d = await validar(db, cuentaId, req.body ?? {});
    const id = await insertar(
      db,
      `INSERT INTO prestamos_iess (cuenta_id, empleado_id, tipo, cuota, cuotas, primer_anio, primer_mes, observacion, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cuentaId, d.empleadoId, d.tipo, d.cuota, d.cuotas, d.primerAnio, d.primerMes, d.observacion,
      new Date().toISOString().slice(0, 19),
    );
    res.status(201).json(aApi(await buscar(cuentaId, String(id))));
  });

  router.put("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    const d = await validar(db, cuentaId, req.body ?? {});
    await ejecutar(
      db,
      `UPDATE prestamos_iess SET empleado_id = ?, tipo = ?, cuota = ?, cuotas = ?, primer_anio = ?, primer_mes = ?, observacion = ?
       WHERE cuenta_id = ? AND id = ?`,
      d.empleadoId, d.tipo, d.cuota, d.cuotas, d.primerAnio, d.primerMes, d.observacion, cuentaId, actual.id,
    );
    res.json(aApi(await buscar(cuentaId, req.params.id)));
  });

  /** Suspende o reanuda el descuento: un préstamo cancelado no se descuenta, pero queda en el historial. */
  router.patch("/:id/estado", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    await ejecutar(db, "UPDATE prestamos_iess SET activo = 1 - activo WHERE cuenta_id = ? AND id = ?", cuentaId, actual.id);
    res.json(aApi(await buscar(cuentaId, req.params.id)));
  });

  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    await ejecutar(db, "DELETE FROM prestamos_iess WHERE cuenta_id = ? AND id = ?", cuentaId, actual.id);
    res.status(204).end();
  });

  return router;
}
