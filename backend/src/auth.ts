/**
 * Autenticación: contraseña con scrypt, sesión firmada con HMAC y un límite de intentos fallidos.
 * Sin dependencias: todo sale de `node:crypto`.
 *
 * La sesión no se guarda en ningún lado: la cookie lleva el usuario, su cuenta y el vencimiento,
 * firmados con `SESION_SECRETO`. Cambiar ese secreto cierra todas las sesiones abiertas.
 */
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { esId } from "./validaciones.ts";

const scryptAsync = promisify(scrypt) as (
  clave: string, sal: Buffer, largo: number, opciones: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const LARGO_HASH = 64;

/** `scrypt.N.r.p.sal.hash`, con sal y hash en base64url: lo que se guarda en `usuarios.clave_hash`. */
export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(clave, sal, LARGO_HASH, { N, r: R, p: P });
  return ["scrypt", N, R, P, sal.toString("base64url"), hash.toString("base64url")].join(".");
}

/** Compara una contraseña con su hash guardado. Un hash mal formado nunca coincide. */
export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [esquema, n, r, p, sal, hash] = guardado.split(".");
  if (esquema !== "scrypt" || !sal || !hash) return false;
  const parametros = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Object.values(parametros).every((v) => Number.isInteger(v) && v > 0)) return false;
  const esperado = Buffer.from(hash, "base64url");
  try {
    const calculado = await scryptAsync(clave, Buffer.from(sal, "base64url"), esperado.length, parametros);
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** Igualdad en tiempo constante para textos de cualquier largo. */
export function textosIguales(a: string, b: string): boolean {
  const huella = (t: string) => createHash("sha256").update(t).digest();
  return timingSafeEqual(huella(a), huella(b));
}

/** Cuánto dura una sesión abierta. */
export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

export interface Sesion {
  usuarioId: number;
  cuentaId: number;
  /** milisegundos desde 1970 en que deja de valer */
  vence: number;
}

const firmar = (datos: string, secreto: string) => createHmac("sha256", secreto).update(datos).digest("base64url");

/** Token de sesión: `datos.firma`, ambos en base64url. */
export function crearSesion(usuarioId: number, cuentaId: number, secreto: string, ahora = Date.now()): string {
  const datos = Buffer.from(JSON.stringify({ u: usuarioId, c: cuentaId, e: ahora + DURACION_SESION_MS })).toString("base64url");
  return `${datos}.${firmar(datos, secreto)}`;
}

/** La sesión que lleva el token, o null si está alterado, mal formado o vencido. */
export function leerSesion(token: string | undefined, secreto: string, ahora = Date.now()): Sesion | null {
  if (!token) return null;
  const [datos, firma, resto] = token.split(".");
  if (!datos || !firma || resto !== undefined) return null;
  if (!textosIguales(firma, firmar(datos, secreto))) return null;
  try {
    const { u, c, e } = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as { u: unknown; c: unknown; e: unknown };
    if (!esId(u) || !esId(c) || typeof e !== "number" || e <= ahora) return null;
    return { usuarioId: u, cuentaId: c, vence: e };
  } catch {
    return null;
  }
}

/**
 * Frena la adivinanza de contraseñas: tras `MAXIMO` fallos desde una misma IP, la bloquea hasta que
 * pase la ventana. Vive en memoria: se vacía al reiniciar y cada instancia lleva su propia cuenta, así que es un
 * freno, no una garantía.
 */
export class LimiteIntentos {
  static readonly MAXIMO = 5;
  static readonly VENTANA_MS = 15 * 60 * 1000;
  private static readonly MAX_REGISTROS = 10_000;

  private readonly registros = new Map<string, { fallos: number; desde: number }>();

  /** Segundos que faltan para poder intentar de nuevo; 0 si no está bloqueada. */
  segundosDeEspera(ip: string, ahora = Date.now()): number {
    const r = this.registros.get(ip);
    if (!r) return 0;
    if (ahora - r.desde >= LimiteIntentos.VENTANA_MS) {
      this.registros.delete(ip);
      return 0;
    }
    return r.fallos >= LimiteIntentos.MAXIMO ? Math.ceil((r.desde + LimiteIntentos.VENTANA_MS - ahora) / 1000) : 0;
  }

  fallo(ip: string, ahora = Date.now()) {
    const r = this.registros.get(ip);
    if (r && ahora - r.desde < LimiteIntentos.VENTANA_MS) {
      r.fallos += 1;
      return;
    }
    if (this.registros.size >= LimiteIntentos.MAX_REGISTROS) this.registros.clear();
    this.registros.set(ip, { fallos: 1, desde: ahora });
  }

  exito(ip: string) {
    this.registros.delete(ip);
  }
}

/**
 * El secreto que firma las sesiones sale de `SESION_SECRETO` (al menos 32 caracteres). Sin él,
 * devuelve null: quien arranca decide si inventa uno (local) o se niega a arrancar (servidor).
 */
export function secretoDeEntorno(entorno: Record<string, string | undefined>): string | null {
  const secreto = entorno.SESION_SECRETO?.trim();
  if (!secreto) return null;
  if (secreto.length < 32) throw new Error("SESION_SECRETO debe tener al menos 32 caracteres.");
  return secreto;
}

/** Un secreto nuevo para trabajar en local: las sesiones duran lo que dure el proceso. */
export const secretoAleatorio = () => randomBytes(32).toString("base64url");
