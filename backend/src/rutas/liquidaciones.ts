import { Router } from "express";

import { registrarAuditoria } from "../auditoria.ts";
import { consultar, ejecutar, filaACamel, insertar, transaccion, uno } from "../db.ts";
import type { Base, Fila } from "../db.ts";
import { ETIQUETA_CAUSA } from "../liquidacion.ts";
import { prepararLiquidacion } from "../liquidaciones.ts";
import type { Preparacion } from "../liquidaciones.ts";
import { soltarResponsable } from "../puestos.ts";
import { ErrorApi, leerId } from "../validaciones.ts";
import { cuentaDe, usuarioDe } from "./auth.ts";

const aApi = ({ rubros, ...fila }: Fila) => ({
  ...filaACamel(fila),
  causaEtiqueta: ETIQUETA_CAUSA[fila.causa as keyof typeof ETIQUETA_CAUSA] ?? fila.causa,
  rubros: JSON.parse(String(rubros)) as unknown,
});

/** Lo que se muestra antes de guardar: los rubros, el total y los avisos. */
const vista = (p: Preparacion) => ({
  empleadoId: p.empleado.id, nombres: p.empleado.nombres, cedula: p.empleado.cedula,
  fechaIngreso: p.empleado.fecha_ingreso, fechaSalida: p.fechaSalida,
  causa: p.causa, causaEtiqueta: ETIQUETA_CAUSA[p.causa], region: p.region, regimenAplicado: p.aplicado.codigo,
  sueldoBase: Number(p.empleado.sueldo_base), aniosServicio: p.resultado.anios, diasServicio: p.resultado.diasServicio,
  rubros: p.resultado.rubros, total: p.resultado.total,
  prestamosPendientes: p.prestamos, avisos: p.avisos,
});

export function rutasLiquidaciones(db: Base): Router {
  const router = Router();

  const buscar = async (cuentaId: number, idTexto: string): Promise<Fila> => {
    const fila = await uno(db, "SELECT * FROM liquidaciones WHERE cuenta_id = ? AND id = ?", cuentaId, leerId(idTexto));
    if (!fila) throw new ErrorApi(404, ["La liquidación no existe."]);
    return fila;
  };

  router.get("/", async (_req, res) => {
    res.json((await consultar(db, "SELECT * FROM liquidaciones WHERE cuenta_id = ? ORDER BY fecha_salida DESC, id DESC", cuentaDe(res))).map(aApi));
  });

  /** Calcula sin guardar nada: sirve para revisar la liquidación antes de registrarla. */
  router.post("/calcular", async (req, res) => {
    res.json(vista(await prepararLiquidacion(db, cuentaDe(res), req.body ?? {})));
  });

  router.get("/:id", async (req, res) => {
    res.json(aApi(await buscar(cuentaDe(res), req.params.id)));
  });

  /** Registra la liquidación y marca al empleado como salido en esa fecha, todo en una transacción. */
  router.post("/", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const usuarioId = usuarioDe(res);
    const p = await prepararLiquidacion(db, cuentaId, req.body ?? {});
    const id = await transaccion(db, async (tx) => {
      const nuevoId = await insertar(
        tx,
        `INSERT INTO liquidaciones (cuenta_id, empleado_id, cedula, nombres, cargo, regimen_aplicado, sueldo_base, fecha_ingreso,
         fecha_salida, causa, region, anios_servicio, total, rubros, prestamos_cuotas, prestamos_valor, creado_en, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cuentaId, Number(p.empleado.id), p.empleado.cedula, p.empleado.nombres, p.empleado.cargo, p.aplicado.codigo,
        p.empleado.sueldo_base, p.empleado.fecha_ingreso, p.fechaSalida, p.causa, p.region, p.resultado.anios, p.resultado.total,
        JSON.stringify(p.resultado.rubros), p.prestamos.cuotas, p.prestamos.valor, new Date().toISOString().slice(0, 19), usuarioId,
      );
      await ejecutar(tx, "UPDATE empleados SET activo = 0, fecha_salida = ? WHERE cuenta_id = ? AND id = ?", p.fechaSalida, cuentaId, p.empleado.id);
      await soltarResponsable(tx, cuentaId, Number(p.empleado.id), null); // quien se va deja de ser responsable
      await registrarAuditoria(tx, {
        cuentaId, usuarioId, accion: "liquidacion.registrada", entidad: "liquidacion", entidadId: nuevoId,
        detalle: { empleado: p.empleado.nombres, causa: p.causa, fechaSalida: p.fechaSalida, total: p.resultado.total },
      });
      return nuevoId;
    });
    res.status(201).json({ ...aApi(await buscar(cuentaId, String(id))), avisos: p.avisos });
  });

  /** Elimina el registro para poder rehacerlo; no devuelve al empleado a la nómina (eso se hace en Empleados). */
  router.delete("/:id", async (req, res) => {
    const cuentaId = cuentaDe(res);
    const actual = await buscar(cuentaId, req.params.id);
    await transaccion(db, async (tx) => {
      await ejecutar(tx, "DELETE FROM liquidaciones WHERE cuenta_id = ? AND id = ?", cuentaId, actual.id);
      await registrarAuditoria(tx, {
        cuentaId, usuarioId: usuarioDe(res), accion: "liquidacion.eliminada", entidad: "liquidacion", entidadId: Number(actual.id),
        detalle: { empleado: actual.nombres, total: actual.total },
      });
    });
    res.status(204).end();
  });

  return router;
}
