/** Validaciones de formulario: cédula y RUC ecuatorianos, correo, números y fechas. */
import { Decimal } from "decimal.js";

/** Error con código HTTP y la lista de mensajes que verá el usuario. */
export class ErrorApi extends Error {
  status: number;
  errores: string[];

  constructor(status: number, errores: string[]) {
    super(errores.join(" "));
    this.status = status;
    this.errores = errores;
  }
}

/** El mayor `id` que cabe en una columna INTEGER de Postgres. */
const ID_MAXIMO = 2_147_483_647;

/** ¿Es un número que puede ser el `id` de una fila? */
export const esId = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isInteger(valor) && valor > 0 && valor <= ID_MAXIMO;

/** El `id` de una ruta (`/empleados/:id`): un entero positivo, o un 400. Evita que `abc` llegue a la base como NaN. */
export function leerId(texto: string): number {
  const id = /^\d{1,10}$/.test(texto) ? Number(texto) : NaN;
  if (!esId(id)) throw new ErrorApi(400, ["Identificador inválido."]);
  return id;
}

/** Algoritmo módulo 10 del Registro Civil (personas naturales). */
export function cedulaValida(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;
  const provincia = Number(cedula.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30) || Number(cedula[2]) > 5) {
    return false;
  }
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    const producto = Number(cedula[i]) * (i % 2 === 0 ? 2 : 1);
    suma += producto > 9 ? producto - 9 : producto;
  }
  return (10 - (suma % 10)) % 10 === Number(cedula[9]);
}

/** Dígito verificador módulo 11 (sociedades): `coeficientes` pesa los dígitos anteriores al verificador. */
function modulo11(digitos: string, coeficientes: readonly number[]): number {
  const suma = coeficientes.reduce((s, c, i) => s + c * Number(digitos[i]), 0);
  const resto = suma % 11;
  return resto === 0 ? 0 : 11 - resto; // 10 no es un dígito: ese RUC no existe
}

/**
 * RUC ecuatoriano de 13 dígitos. El tercer dígito dice el tipo de contribuyente:
 * 0 a 5 persona natural (los 10 primeros son su cédula, módulo 10), 6 entidad pública (módulo 11,
 * verificador en el 9.º dígito) y 9 sociedad privada (módulo 11, verificador en el 10.º).
 * Lo que sigue al verificador es el número de establecimiento, que empieza en 1.
 */
export function rucValido(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false;
  const provincia = Number(ruc.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return false;
  const tercero = Number(ruc[2]);
  if (tercero <= 5) return cedulaValida(ruc.slice(0, 10)) && Number(ruc.slice(10)) >= 1;
  if (tercero === 6) return modulo11(ruc, [3, 2, 7, 6, 5, 4, 3, 2]) === Number(ruc[8]) && Number(ruc.slice(9)) >= 1;
  if (tercero === 9) return modulo11(ruc, [4, 3, 2, 7, 6, 5, 4, 3, 2]) === Number(ruc[9]) && Number(ruc.slice(10)) >= 1;
  return false;
}

/** Forma de un correo: algo@dominio.tld, sin espacios. No comprueba que exista. */
export const emailValido = (email: string): boolean =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Convierte el valor de un campo a Decimal; vacío o ausente = 0.
 * Acepta números y textos con coma o punto. Lanza Error si no es válido.
 */
export function aDecimal(valor: unknown, minimo = 0): Decimal {
  const vacio = valor === undefined || valor === null || String(valor).trim() === "";
  if (!vacio && typeof valor !== "number" && typeof valor !== "string") {
    throw new Error("no es un número");
  }
  const texto = vacio ? "0" : String(valor).trim().replace(",", ".");
  let numero: Decimal;
  try {
    numero = new Decimal(texto);
  } catch {
    throw new Error(`'${texto}' no es un número`);
  }
  if (!numero.isFinite()) throw new Error(`'${texto}' no es un número`);
  // El vacío cuenta como 0, pero igual debe cumplir el mínimo del campo.
  if (numero.lt(minimo)) throw new Error(`debe ser mayor o igual a ${minimo}`);
  return numero;
}

/** AAAA-MM-DD que existe en el calendario. */
export function fechaIsoValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}
