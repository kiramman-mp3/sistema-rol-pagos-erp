/**
 * Enlaces de un solo uso por correo: recuperar la contraseña y verificar el correo.
 * El token se manda por correo y en la base queda solo su hash (SHA-256): quien lea la tabla no puede usarlo.
 */
import { createHash, randomBytes } from "node:crypto";

import { hashClave } from "./auth.ts";
import { consultar, ejecutar, insertar, transaccion, uno } from "./db.ts";
import type { Base } from "./db.ts";
import { CLAVE_MAXIMA, CLAVE_MINIMA } from "./cuentas.ts";
import type { Usuario } from "./cuentas.ts";
import type { Correo } from "./correo.ts";
import { registrarAuditoria } from "./auditoria.ts";
import { ErrorApi } from "./validaciones.ts";

export type TipoToken = "recuperar" | "verificar";

const HORA_MS = 60 * 60 * 1000;
/** Cuánto vale cada enlace. */
export const DURACION_TOKEN_MS: Record<TipoToken, number> = { recuperar: HORA_MS, verificar: 48 * HORA_MS };

const huella = (token: string) => createHash("sha256").update(token).digest("hex");
const aFecha = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** Un token nuevo para ese usuario. Los anteriores del mismo tipo dejan de valer. Devuelve el token en claro. */
export async function crearToken(db: Base, usuarioId: number, tipo: TipoToken, ahora = Date.now()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await transaccion(db, async (tx) => {
    await ejecutar(tx, "UPDATE tokens_usuario SET usado_en = ? WHERE usuario_id = ? AND tipo = ? AND usado_en IS NULL", aFecha(ahora), usuarioId, tipo);
    await insertar(
      tx, "INSERT INTO tokens_usuario (usuario_id, tipo, token_hash, vence_en) VALUES (?, ?, ?, ?)",
      usuarioId, tipo, huella(token), aFecha(ahora + DURACION_TOKEN_MS[tipo]),
    );
  });
  return token;
}

/**
 * Gasta el token y devuelve el usuario al que pertenece. Es atómico: dos peticiones con el mismo token
 * no pueden usarlo las dos. Un token desconocido, vencido o ya usado es un 400 con el mismo mensaje.
 */
export async function gastarToken(db: Base, token: unknown, tipo: TipoToken, ahora = Date.now()): Promise<number> {
  const invalido = new ErrorApi(400, ["El enlace no es válido o ya venció. Pide uno nuevo."]);
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw invalido;
  const filas = await consultar(
    db,
    `UPDATE tokens_usuario SET usado_en = ?
     WHERE token_hash = ? AND tipo = ? AND usado_en IS NULL AND vence_en > ?
     RETURNING usuario_id`,
    aFecha(ahora), huella(token), tipo, aFecha(ahora),
  );
  if (!filas.length) throw invalido;
  return Number(filas[0].usuario_id);
}

/** Pone la contraseña nueva y anula cualquier otro enlace de recuperación pendiente. */
export async function restablecerClave(db: Base, token: unknown, clave: unknown, ahora = Date.now()): Promise<void> {
  if (typeof clave !== "string" || clave.length < CLAVE_MINIMA) {
    throw new ErrorApi(400, [`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`]);
  }
  if (clave.length > CLAVE_MAXIMA) throw new ErrorApi(400, [`La contraseña no puede pasar de ${CLAVE_MAXIMA} caracteres.`]);
  const claveHash = await hashClave(clave);
  await transaccion(db, async (tx) => {
    const usuarioId = await gastarToken(tx, token, "recuperar", ahora);
    await ejecutar(tx, "UPDATE usuarios SET clave_hash = ? WHERE id = ?", claveHash, usuarioId);
    // Quien recibió el correo es dueño del buzón: con eso también queda verificado.
    await ejecutar(tx, "UPDATE usuarios SET email_verificado_en = COALESCE(email_verificado_en, ?) WHERE id = ?", aFecha(ahora), usuarioId);
    const f = await uno(tx, "SELECT cuenta_id FROM usuarios WHERE id = ?", usuarioId);
    await registrarAuditoria(tx, {
      cuentaId: Number(f?.cuenta_id), usuarioId, accion: "usuario.clave_restablecida", entidad: "usuario", entidadId: usuarioId,
    });
  });
}

/** Marca el correo como verificado. */
export async function verificarCorreo(db: Base, token: unknown, ahora = Date.now()): Promise<void> {
  await transaccion(db, async (tx) => {
    const usuarioId = await gastarToken(tx, token, "verificar", ahora);
    await ejecutar(tx, "UPDATE usuarios SET email_verificado_en = COALESCE(email_verificado_en, ?) WHERE id = ?", aFecha(ahora), usuarioId);
  });
}

export async function correoVerificado(db: Base, usuarioId: number): Promise<boolean> {
  const f = await uno(db, "SELECT email_verificado_en FROM usuarios WHERE id = ?", usuarioId);
  return f?.email_verificado_en != null;
}

/** `urlPublica` sin la barra final + la pantalla del frontend + el token. */
const enlace = (urlPublica: string, pantalla: string, token: string) => `${urlPublica.replace(/\/+$/, "")}/${pantalla}?token=${token}`;

export async function enviarRecuperacion(db: Base, correo: Correo, usuario: Usuario, urlPublica: string) {
  const token = await crearToken(db, usuario.id, "recuperar");
  await correo.enviar({
    para: usuario.email,
    asunto: "Restablecer tu contraseña · Rol de pagos Ecuador",
    texto: [
      "Recibimos una solicitud para restablecer tu contraseña.",
      "",
      `Abre este enlace (vale 1 hora y solo se puede usar una vez):`,
      enlace(urlPublica, "restablecer", token),
      "",
      "Si no la pediste tú, ignora este mensaje: tu contraseña sigue igual.",
    ].join("\n"),
  });
}

export async function enviarVerificacion(db: Base, correo: Correo, usuario: Usuario, urlPublica: string) {
  const token = await crearToken(db, usuario.id, "verificar");
  await correo.enviar({
    para: usuario.email,
    asunto: "Confirma tu correo · Rol de pagos Ecuador",
    texto: [
      "Confirma que este correo es tuyo abriendo este enlace (vale 48 horas):",
      enlace(urlPublica, "verificar", token),
      "",
      "Si no creaste una cuenta, ignora este mensaje.",
    ].join("\n"),
  });
}
