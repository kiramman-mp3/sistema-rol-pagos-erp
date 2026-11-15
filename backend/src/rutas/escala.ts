import { Router } from "express";

import { actualizarGrado, buscarGrado, crearGrado, eliminarGrado, listarEscala } from "../escala.ts";
import type { Base } from "../db.ts";
import { ErrorApi, leerId } from "../validaciones.ts";
import { cuentaDe } from "./auth.ts";

export function rutasEscala(db: Base): Router {
  const router = Router();

  /** Todos los grados, o solo los de un régimen con `?regimen=LOSEP`. */
  router.get("/", async (req, res) => {
    const regimen = typeof req.query.regimen === "string" ? req.query.regimen : undefined;
    res.json(await listarEscala(db, cuentaDe(res), regimen));
  });

  router.get("/:id", async (req, res) => {
    const grado = await buscarGrado(db, cuentaDe(res), leerId(req.params.id));
    if (!grado) throw new ErrorApi(404, ["El grado no existe."]);
    res.json(grado);
  });

  router.post("/", async (req, res) => {
    res.status(201).json(await crearGrado(db, cuentaDe(res), req.body ?? {}));
  });

  router.put("/:id", async (req, res) => {
    res.json(await actualizarGrado(db, cuentaDe(res), leerId(req.params.id), req.body ?? {}));
  });

  router.delete("/:id", async (req, res) => {
    await eliminarGrado(db, cuentaDe(res), leerId(req.params.id));
    res.status(204).end();
  });

  return router;
}
