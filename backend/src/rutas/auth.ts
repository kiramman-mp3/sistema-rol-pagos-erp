import { Router } from "express";
import type { CookieOptions, Request, RequestHandler, Response } from "express";

import {
  crearSesion, DURACION_SESION_MS, hashClave, leerSesion, LimiteIntentos, verificarClave,
} from "../auth.ts";
import { buscarCuenta, buscarUsuario, buscarUsuarioPorEmail, CUENTA_PLANTILLA, registrarCuenta } from "../cuentas.ts";
import type { Base } from "../db.ts";
import { ErrorApi } from "../validaciones.ts";

const COOKIE = "rol_sesion";

/**
 * Estas rutas se pueden usar sin haber entrado: la página de inicio las usa. Con sesión responden con
 * los datos de la cuenta; sin ella, con los de la plantilla de ley.
 */
const PUBLICAS: readonly (readonly [metodo: string, ruta: string])[] = [
  ["GET", "/parametros"],
  ["POST", "/simulacion"],
];

/** Valor de una cookie de la petición; Express no trae lector de cookies. */
function leerCookie(req: Request, nombre: string): string | undefined {
  for (const trozo of (req.headers.cookie ?? "").split(";")) {
    const [clave, ...valor] = trozo.trim().split("=");
    if (clave === nombre) return valor.join("=");
  }
  return undefined;
}

const opcionesCookie = (req: Request): CookieOptions => ({
  httpOnly: true,
  sameSite: "strict",
  secure: req.secure,
  path: "/",
});

/** La cuenta de la petición, que `exigirSesion` dejó en `res.locals`. Todo dato se pide con ella. */
export function cuentaDe(res: Response): number {
  const id = res.locals.cuentaId;
  if (typeof id !== "number") throw new ErrorApi(401, ["Inicia sesión para continuar."]);
  return id;
}

/**
 * Deja pasar solo a quien trae una sesión válida y anota su cuenta. Las rutas públicas pasan siempre:
 * con sesión usan los datos de su cuenta; sin ella, los de la plantilla.
 */
export function exigirSesion(secreto: string): RequestHandler {
  return (req, res, next) => {
    const ruta = req.path.replace(/\/+$/, "").toLowerCase();
    const sesion = leerSesion(leerCookie(req, COOKIE), secreto);
    if (sesion) {
      res.locals.cuentaId = sesion.cuentaId;
      res.locals.usuarioId = sesion.usuarioId;
      return next();
    }
    if (PUBLICAS.some(([metodo, publica]) => metodo === req.method && publica === ruta)) {
      res.locals.cuentaId = CUENTA_PLANTILLA;
      return next();
    }
    next(new ErrorApi(401, ["Inicia sesión para continuar."]));
  };
}

/** Registrarse, entrar, salir y saber quién es el usuario de la sesión. */
export function rutasAuth(db: Base, secreto: string): Router {
  const router = Router();
  const limiteEntrar = new LimiteIntentos();
  const limiteRegistro = new LimiteIntentos();
  // Para que entrar con un correo que no existe tarde lo mismo que con uno que sí existe.
  const hashFalso = hashClave("sin-usuario");

  const abrirSesion = (req: Request, res: Response, usuarioId: number, cuentaId: number) =>
    res.cookie(COOKIE, crearSesion(usuarioId, cuentaId, secreto), { ...opcionesCookie(req), maxAge: DURACION_SESION_MS });

  const datosDeSesion = async (usuarioId: number) => {
    const usuario = await buscarUsuario(db, usuarioId);
    const cuenta = usuario && (await buscarCuenta(db, usuario.cuentaId));
    return usuario && cuenta
      ? { autenticado: true, email: usuario.email, empresa: { nombre: cuenta.nombre, ruc: cuenta.ruc } }
      : null;
  };

  const bloqueo = (limite: LimiteIntentos, ip: string, mensaje: string, res: Response) => {
    const espera = limite.segundosDeEspera(ip);
    if (espera > 0) {
      res.set("Retry-After", String(espera));
      throw new ErrorApi(429, [`${mensaje} Vuelve a intentar en ${Math.ceil(espera / 60)} minutos.`]);
    }
  };

  router.get("/yo", async (req, res) => {
    const sesion = leerSesion(leerCookie(req, COOKIE), secreto);
    const datos = sesion && (await datosDeSesion(sesion.usuarioId));
    res.json(datos ?? { autenticado: false, email: null, empresa: null });
  });

  /** Crea la cuenta de una empresa con su primer usuario y deja la sesión abierta. */
  router.post("/registro", async (req, res) => {
    const ip = req.ip ?? "desconocida";
    bloqueo(limiteRegistro, ip, "Demasiados registros desde esta conexión.", res);
    const cuerpo = req.body ?? {};
    try {
      const { cuentaId, usuarioId } = await registrarCuenta(db, cuerpo);
      limiteRegistro.fallo(ip);
      abrirSesion(req, res, usuarioId, cuentaId);
      res.status(201).json(await datosDeSesion(usuarioId));
    } catch (error) {
      // Un correo repetido cuenta como intento: así no sirve para averiguar qué correos están registrados.
      if (error instanceof ErrorApi && error.status === 409) limiteRegistro.fallo(ip);
      throw error;
    }
  });

  router.post("/entrar", async (req, res) => {
    const ip = req.ip ?? "desconocida";
    bloqueo(limiteEntrar, ip, "Demasiados intentos fallidos.", res);

    const texto = (campo: string) => (typeof req.body?.[campo] === "string" ? req.body[campo].slice(0, 254) : "");
    const usuario = await buscarUsuarioPorEmail(db, texto("email").trim());
    // La contraseña se verifica siempre, aunque el correo no exista: así no se distingue por el tiempo.
    const claveCorrecta = await verificarClave(texto("clave"), usuario?.claveHash ?? (await hashFalso));
    if (!usuario || !claveCorrecta) {
      limiteEntrar.fallo(ip);
      throw new ErrorApi(401, ["Correo o contraseña incorrectos."]);
    }

    limiteEntrar.exito(ip);
    abrirSesion(req, res, usuario.id, usuario.cuentaId);
    res.json(await datosDeSesion(usuario.id));
  });

  router.post("/salir", (req, res) => {
    res.clearCookie(COOKIE, opcionesCookie(req));
    res.status(204).end();
  });

  return router;
}
