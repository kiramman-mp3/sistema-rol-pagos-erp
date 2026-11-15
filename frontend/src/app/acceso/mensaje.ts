import { HttpErrorResponse } from '@angular/common/http';

/** El primer mensaje que mandó la API, o el de respaldo si no hubo respuesta (sin conexión, por ejemplo). */
export function mensajeDeError(e: unknown, respaldo: string): string {
  const errores = (e as HttpErrorResponse)?.error?.errores;
  return Array.isArray(errores) && errores.length ? String(errores[0]) : respaldo;
}
