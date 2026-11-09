import { Router } from "express";
import type { CookieOptions, Request, RequestHandler, Response } from "express";

import {
  crearSesion, DURACION_SESION_MS, hashClave, leerSesion, LimiteIntentos, verificarClave,
} from "../auth.ts";
import { buscarCuenta, buscarUsuario, buscarUsuarioPorEmail, CUENTA_PLANTILLA, registrarCuenta } from "../cuentas.ts";
import type { Correo } from "../correo.ts";
import type { Base } from "../db.ts";
import { permisoQueExige, permisosDe, puede } from "../permisos.ts";
import type { RolUsuario } from "../permisos.ts";
import { correoVerificado, enviarRecuperacion, enviarVerificacion, restablecerClave, verificarCorreo } from "../recuperacion.ts";
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

/** El usuario de la petición: quien queda registrado en la auditoría. */
export function usuarioDe(res: Response): number {
  const id = res.locals.usuarioId;
  if (typeof id !== "number") throw new ErrorApi(401, ["Inicia sesión para continuar."]);
  return id;
}

/**
 * Deja pasar solo a quien trae una sesión válida y anota su cuenta, su usuario y su rol. El rol se lee
 * de la base en cada petición: un cambio de rol o un usuario eliminado valen de inmediato, sin esperar
 * a que venza la cookie. Las rutas públicas pasan siempre: con sesión usan los datos de su cuenta;
 * sin ella, los de la plantilla.
 */
export function exigirSesion(db: Base, secreto: string): RequestHandler {
  return async (req, res, next) => {
    const ruta = req.path.replace(/\/+$/, "").toLowerCase();
    const sesion = leerSesion(leerCookie(req, COOKIE), secreto);
    if (sesion) {
      const usuario = await buscarUsuario(db, sesion.usuarioId);
      if (usuario && usuario.cuentaId === sesion.cuentaId) {
        res.locals.cuentaId = sesion.cuentaId;
        res.locals.usuarioId = sesion.usuarioId;
        res.locals.rolUsuario = usuario.rol;
        return next();
      }
    }
    if (PUBLICAS.some(([metodo, publica]) => metodo === req.method && publica === ruta)) {
      res.locals.cuentaId = CUENTA_PLANTILLA;
      return next();
    }
    next(new ErrorApi(401, ["Inicia sesión para continuar."]));
  };
}

/** Niega con 403 lo que el rol del usuario no puede hacer. Va después de `exigirSesion`. */
export const exigirPermiso: RequestHandler = (req, res, next) => {
  const rol = res.locals.rolUsuario as RolUsuario | undefined;
  if (rol === undefined) return next(); // ruta pública, sin sesión
  if (puede(rol, permisoQueExige(req.method, req.path))) return next();
  next(new ErrorApi(403, [`Tu rol (${rol}) no permite hacer esto.`]));
};

/**
 * Registrarse, entrar, salir, recuperar la contraseña, verificar el correo y saber quién es el usuario
 * de la sesión. `urlPublica` es la dirección de la aplicación que va en los enlaces de los correos; sin
 * ella se usa la de la petición, que solo es de fiar en local.
 */
export function rutasAuth(db: Base, secreto: string, correo: Correo, urlPublica?: string): Router {
  const router = Router();
  const limiteEntrar = new LimiteIntentos();
  const limiteRegistro = new LimiteIntentos();
  const limiteCorreos = new LimiteIntentos();
  const urlDe = (req: Request) => urlPublica ?? `${req.protocol}://${req.get("host")}`;
  /** Un correo que no sale no debe tumbar la operación que lo pidió: queda en el registro del servidor. */
  const sinFallar = (tarea: Promise<void>) => tarea.catch((error: unknown) => console.error("No se pudo enviar el correo:", error));
  // Para que entrar con un correo que no existe tarde lo mismo que con uno que sí existe.
  const hashFalso = hashClave("sin-usuario");

  const abrirSesion = (req: Request, res: Response, usuarioId: number, cuentaId: number) =>
    res.cookie(COOKIE, crearSesion(usuarioId, cuentaId, secreto), { ...opcionesCookie(req), maxAge: DURACION_SESION_MS });

  const datosDeSesion = async (usuarioId: number) => {
    const usuario = await buscarUsuario(db, usuarioId);
    const cuenta = usuario && (await buscarCuenta(db, usuario.cuentaId));
    return usuario && cuenta
      ? {
          autenticado: true, email: usuario.email, empresa: { nombre: cuenta.nombre, ruc: cuenta.ruc },
          rol: usuario.rol, permisos: permisosDe(usuario.rol), emailVerificado: await correoVerificado(db, usuario.id),
        }
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
    res.json(datos ?? { autenticado: false, email: null, empresa: null, rol: null, permisos: [], emailVerificado: false });
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
      const nuevo = await buscarUsuario(db, usuarioId);
      if (nuevo) await sinFallar(enviarVerificacion(db, correo, nuevo, urlDe(req)));
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

  /**
   * Manda un enlace para elegir otra contraseña. Responde lo mismo exista o no el correo, para que no
   * sirva para averiguar quién tiene cuenta; y cuenta cada petición contra el límite de la conexión.
   */
  router.post("/recuperar", async (req, res) => {
    const ip = req.ip ?? "desconocida";
    bloqueo(limiteCorreos, ip, "Demasiadas solicitudes de correo.", res);
    limiteCorreos.fallo(ip);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().slice(0, 254) : "";
    const usuario = email ? await buscarUsuarioPorEmail(db, email) : undefined;
    if (usuario) await sinFallar(enviarRecuperacion(db, correo, usuario, urlDe(req)));
    res.status(202).json({ mensaje: "Si el correo tiene una cuenta, le enviamos un enlace para restablecer la contraseña." });
  });

  router.post("/restablecer", async (req, res) => {
    await restablecerClave(db, req.body?.token, req.body?.clave);
    res.status(204).end();
  });

  router.post("/verificar", async (req, res) => {
    await verificarCorreo(db, req.body?.token);
    res.status(204).end();
  });

  /** Vuelve a mandar el enlace de verificación a quien tiene la sesión abierta. */
  router.post("/reenviar-verificacion", async (req, res) => {
    const sesion = leerSesion(leerCookie(req, COOKIE), secreto);
    const usuario = sesion && (await buscarUsuario(db, sesion.usuarioId));
    if (!usuario) throw new ErrorApi(401, ["Inicia sesión para continuar."]);
    if (await correoVerificado(db, usuario.id)) throw new ErrorApi(409, ["Tu correo ya está verificado."]);
    const ip = req.ip ?? "desconocida";
    bloqueo(limiteCorreos, ip, "Demasiadas solicitudes de correo.", res);
    limiteCorreos.fallo(ip);
    await enviarVerificacion(db, correo, usuario, urlDe(req));
    res.status(202).json({ mensaje: "Te enviamos un enlace de verificación." });
  });

  router.post("/salir", (req, res) => {
    res.clearCookie(COOKIE, opcionesCookie(req));
    res.status(204).end();
  });

  return router;
}
