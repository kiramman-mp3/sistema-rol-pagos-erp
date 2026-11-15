import { Router } from "express";

import { LimiteIntentos, verificarClave } from "../auth.ts";
import { actualizarEmpresa, buscarCuenta, buscarUsuario } from "../cuentas.ts";
import { eliminarCuenta, exportarCuenta } from "../datos-cuenta.ts";
import type { Base } from "../db.ts";
import { ErrorApi } from "../validaciones.ts";
import { cerrarCookie, cuentaDe, usuarioDe } from "./auth.ts";

/** La empresa de la sesión: su nombre y su RUC, que salen en el rol y en la boleta. */
export function rutasCuenta(db: Base): Router {
  const router = Router();
  // Eliminar pide la contraseña: quien tenga una sesión abierta no puede adivinarla sin freno.
  const limiteEliminar = new LimiteIntentos();

  router.get("/", async (_req, res) => {
    const cuenta = await buscarCuenta(db, cuentaDe(res));
    if (!cuenta) throw new ErrorApi(404, ["La cuenta no existe."]);
    res.json({ nombre: cuenta.nombre, ruc: cuenta.ruc, separarFunciones: cuenta.separarFunciones });
  });

  router.put("/", async (req, res) => {
    const cuenta = await actualizarEmpresa(db, cuentaDe(res), req.body ?? {});
    res.json({ nombre: cuenta.nombre, ruc: cuenta.ruc, separarFunciones: cuenta.separarFunciones });
  });

  /** Todos los datos de la empresa en un archivo JSON. Solo el administrador. */
  router.get("/exportar", async (_req, res) => {
    const datos = await exportarCuenta(db, cuentaDe(res));
    const dia = datos.exportadoEn.slice(0, 10);
    res.set("Content-Disposition", `attachment; filename="rol-pagos-${datos.cuenta.ruc}-${dia}.json"`);
    res.json(datos);
  });

  /**
   * Elimina la empresa y todo lo suyo, para siempre. Pide el RUC de la empresa y la contraseña de quien
   * lo hace: un clic equivocado o una sesión olvidada no bastan. Solo el administrador.
   */
  router.delete("/", async (req, res) => {
    const usuarioId = usuarioDe(res);
    const llave = `usuario:${usuarioId}`;
    const espera = limiteEliminar.segundosDeEspera(llave);
    if (espera > 0) {
      res.set("Retry-After", String(espera));
      throw new ErrorApi(429, [`Demasiados intentos. Vuelve a intentar en ${Math.ceil(espera / 60)} minutos.`]);
    }

    const cuenta = await buscarCuenta(db, cuentaDe(res));
    const usuario = await buscarUsuario(db, usuarioId);
    if (!cuenta || !usuario) throw new ErrorApi(404, ["La cuenta no existe."]);

    const ruc = typeof req.body?.ruc === "string" ? req.body.ruc.trim() : "";
    const clave = typeof req.body?.clave === "string" ? req.body.clave.slice(0, 254) : "";
    const claveCorrecta = await verificarClave(clave, usuario.claveHash);
    if (ruc !== cuenta.ruc || !claveCorrecta) {
      limiteEliminar.fallo(llave);
      throw new ErrorApi(400, ["Escribe el RUC de la empresa y tu contraseña tal como son para confirmar."]);
    }

    await eliminarCuenta(db, cuenta.id);
    limiteEliminar.exito(llave);
    console.log(`Cuenta ${cuenta.id} eliminada por ${usuario.email}.`);
    cerrarCookie(req, res);
    res.status(204).end();
  });

  return router;
}
