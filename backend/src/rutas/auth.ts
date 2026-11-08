import { Router } from "express";
import type { CookieOptions, Request, RequestHandler } from "express";

import {
  crearSesion, DURACION_SESION_MS, leerSesion, LimiteIntentos, textosIguales, verificarClave,
} from "../auth.ts";
import type { ConfigAuth } from "../auth.ts";
import { ErrorApi } from "../validaciones.ts";

const COOKIE = "rol_sesion";

/** Estas rutas son públicas: la página de inicio las usa sin haber entrado. */
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

/** Deja pasar solo a quien trae una sesión válida, salvo las rutas públicas. */
export function exigirSesion(auth: ConfigAuth): RequestHandler {
  return (req, _res, next) => {
    const ruta = req.path.replace(/\/+$/, "").toLowerCase();
    if (PUBLICAS.some(([metodo, publica]) => metodo === req.method && publica === ruta)) return next();
    if (!leerSesion(leerCookie(req, COOKIE), auth.secreto)) {
      return next(new ErrorApi(401, ["Inicia sesión para continuar."]));
    }
    next();
  };
}

/** Entrar, salir y saber si hay sesión. Sin `auth`, la API está abierta y `yo` lo dice. */
export function rutasAuth(auth: ConfigAuth | null): Router {
  const router = Router();
  const limite = new LimiteIntentos();

  router.get("/yo", (req, res) => {
    if (!auth) return void res.json({ autenticado: true, usuario: null, protegida: false });
    const sesion = leerSesion(leerCookie(req, COOKIE), auth.secreto);
    res.json({ autenticado: sesion !== null, usuario: sesion?.usuario ?? null, protegida: true });
  });

  router.post("/entrar", async (req, res) => {
    if (!auth) throw new ErrorApi(400, ["El inicio de sesión no está configurado."]);
    const ip = req.ip ?? "desconocida";
    const espera = limite.segundosDeEspera(ip);
    if (espera > 0) {
      res.set("Retry-After", String(espera));
      throw new ErrorApi(429, [`Demasiados intentos fallidos. Vuelve a intentar en ${Math.ceil(espera / 60)} minutos.`]);
    }

    const texto = (campo: string) => (typeof req.body?.[campo] === "string" ? req.body[campo].slice(0, 200) : "");
    const usuario = texto("usuario");
    // La contraseña se verifica siempre, aunque el usuario no exista: así no se distingue por el tiempo.
    const claveCorrecta = await verificarClave(texto("clave"), auth.claveHash);
    if (!(claveCorrecta && textosIguales(usuario, auth.usuario))) {
      limite.fallo(ip);
      throw new ErrorApi(401, ["Usuario o contraseña incorrectos."]);
    }

    limite.exito(ip);
    res.cookie(COOKIE, crearSesion(auth.usuario, auth.secreto), { ...opcionesCookie(req), maxAge: DURACION_SESION_MS });
    res.json({ autenticado: true, usuario: auth.usuario, protegida: true });
  });

  router.post("/salir", (req, res) => {
    res.clearCookie(COOKIE, opcionesCookie(req));
    res.status(204).end();
  });

  return router;
}
