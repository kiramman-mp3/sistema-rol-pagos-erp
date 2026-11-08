import { Router } from "express";

import {
  actualizarRegimen, buscarRegimen, eliminarVersionDeRegimen, listarRegimenes, versionesDeRegimen,
} from "../regimenes.ts";
import type { Base } from "../db.ts";
import { ErrorApi, fechaIsoValida } from "../validaciones.ts";
import { cuentaDe, usuarioDe } from "./auth.ts";

/** `?fecha=AAAA-MM-DD`: con qué día se eligen las versiones; sin ella, hoy. */
function fechaPedida(valor: unknown): string | undefined {
  if (valor === undefined || valor === "") return undefined;
  if (!fechaIsoValida(valor)) throw new ErrorApi(400, ["fecha: escribe una fecha válida (AAAA-MM-DD)."]);
  return valor;
}

export function rutasRegimenes(db: Base): Router {
  const router = Router();

  /** Los regímenes con la versión que rige en `fecha` (hoy por defecto). */
  router.get("/", async (req, res) => {
    res.json(await listarRegimenes(db, cuentaDe(res), fechaPedida(req.query.fecha)));
  });

  router.get("/:codigo", async (req, res) => {
    const regimen = await buscarRegimen(db, cuentaDe(res), req.params.codigo, fechaPedida(req.query.fecha));
    if (!regimen) throw new ErrorApi(404, ["El régimen no existe."]);
    res.json(regimen);
  });

  /** Todas las versiones de un régimen, la más reciente primero. */
  router.get("/:codigo/versiones", async (req, res) => {
    const versiones = await versionesDeRegimen(db, cuentaDe(res), req.params.codigo);
    if (!versiones.length) throw new ErrorApi(404, ["El régimen no existe."]);
    res.json(versiones);
  });

  /**
   * Edita las reglas de un régimen: aportes, recargos, topes, vacaciones y beneficios. Con `vigenteDesde`
   * crea una versión nueva desde esa fecha (o corrige la que ya empieza ese día); sin ella corrige la de hoy.
   */
  router.put("/:codigo", async (req, res) => {
    res.json(await actualizarRegimen(db, cuentaDe(res), req.params.codigo, req.body ?? {}, usuarioDe(res)));
  });

  router.delete("/:codigo/versiones/:desde", async (req, res) => {
    await eliminarVersionDeRegimen(db, cuentaDe(res), req.params.codigo, req.params.desde, usuarioDe(res));
    res.status(204).end();
  });

  return router;
}
