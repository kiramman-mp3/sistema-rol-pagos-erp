import { Router } from "express";

import { actualizarEmpresa, buscarCuenta } from "../cuentas.ts";
import type { Base } from "../db.ts";
import { ErrorApi } from "../validaciones.ts";
import { cuentaDe } from "./auth.ts";

/** La empresa de la sesión: su nombre y su RUC, que salen en el rol y en la boleta. */
export function rutasCuenta(db: Base): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const cuenta = await buscarCuenta(db, cuentaDe(res));
    if (!cuenta) throw new ErrorApi(404, ["La cuenta no existe."]);
    res.json({ nombre: cuenta.nombre, ruc: cuenta.ruc });
  });

  router.put("/", async (req, res) => {
    const cuenta = await actualizarEmpresa(db, cuentaDe(res), req.body ?? {});
    res.json({ nombre: cuenta.nombre, ruc: cuenta.ruc });
  });

  return router;
}
