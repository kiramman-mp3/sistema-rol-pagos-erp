import { HttpClient, HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';

import type {
  DatosEmpleado,
  DatosLiquidacion,
  DatosPrestamo,
  DatosVacaciones,
  Empleado,
  EntradaSimulacion,
  Liquidacion,
  Grado,
  Parametros,
  PeriodoVacaciones,
  Prestamo,
  DatosCuenta,
  Puesto,
  CambioReliquidacion,
  Regimen,
  RevisionRol,
  RolCabecera,
  VistaLiquidacion,
  UsuarioCuenta,
  ResultadoSimulacion,
  TramoIr,
} from './modelos';

/** Lo que se digita en la grilla: texto de los campos, vacío = 0. */
export interface NovedadEnviada {
  empleadoId: number;
  horasSuplementarias: string;
  horasExtraordinarias: string;
  horasDescanso: string;
  horasNocturnas: string;
  comisiones: string;
  otrosDescuentos: string;
}

/** Lo que se envía al crear o editar un grado de la escala salarial. */
export type DatosGrado = Omit<Grado, 'id'>;

/** Lo que se envía al crear o editar un puesto del orgánico. */
export type DatosPuesto = Pick<Puesto, 'nombre' | 'superiorId' | 'funcion' | 'responsabilidad' | 'sector' | 'escalaId'>;

/**
 * Valor de un recurso HTTP, o undefined mientras carga o si falló.
 * Leer `recurso.value()` directamente lanza una excepción cuando el recurso está en error.
 */
export function valorSeguro<T>(recurso: HttpResourceRef<T | undefined>) {
  return computed(() => (recurso.hasValue() ? recurso.value() : undefined));
}

/**
 * Escrituras contra la API. Las lecturas de pantalla usan `httpResource` en cada
 * componente, que ya trae estados de carga y error como señales.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  crearEmpleado(datos: DatosEmpleado) {
    return this.http.post<Empleado>('/api/empleados', datos);
  }
  editarEmpleado(id: number, datos: DatosEmpleado) {
    return this.http.put<Empleado>(`/api/empleados/${id}`, datos);
  }
  cambiarEstado(id: number) {
    return this.http.patch<Empleado>(`/api/empleados/${id}/estado`, {});
  }
  eliminarEmpleado(id: number) {
    return this.http.delete<void>(`/api/empleados/${id}`);
  }
  cargarDemo() {
    return this.http.post<{ agregados: number }>('/api/empleados/demo', {});
  }

  crearPrestamo(datos: DatosPrestamo) {
    return this.http.post<Prestamo>('/api/prestamos', datos);
  }
  cambiarEstadoPrestamo(id: number) {
    return this.http.patch<Prestamo>(`/api/prestamos/${id}/estado`, {});
  }
  eliminarPrestamo(id: number) {
    return this.http.delete<void>(`/api/prestamos/${id}`);
  }

  registrarVacaciones(datos: DatosVacaciones) {
    return this.http.post<PeriodoVacaciones & { avisos: string[] }>('/api/vacaciones', datos);
  }
  eliminarVacaciones(id: number) {
    return this.http.delete<void>(`/api/vacaciones/${id}`);
  }

  calcularLiquidacion(datos: DatosLiquidacion) {
    return this.http.post<VistaLiquidacion>('/api/liquidaciones/calcular', datos);
  }
  registrarLiquidacion(datos: DatosLiquidacion) {
    return this.http.post<Liquidacion & { avisos: string[] }>('/api/liquidaciones', datos);
  }
  eliminarLiquidacion(id: number) {
    return this.http.delete<void>(`/api/liquidaciones/${id}`);
  }

  generarRol(anio: number, mes: number, novedades: NovedadEnviada[]) {
    return this.http.post<{ id: number; empleados: number; avisos: string[] }>('/api/roles/generar', {
      anio,
      mes,
      novedades,
    });
  }
  eliminarRol(id: number) {
    return this.http.delete<void>(`/api/roles/${id}`);
  }
  crearUsuario(datos: { email: string; clave: string; rol: UsuarioCuenta['rol'] }) {
    return this.http.post<UsuarioCuenta>('/api/usuarios', datos);
  }
  cambiarUsuario(id: number, datos: { rol?: UsuarioCuenta['rol']; clave?: string }) {
    return this.http.patch<UsuarioCuenta>(`/api/usuarios/${id}`, datos);
  }
  eliminarUsuario(id: number) {
    return this.http.delete<void>(`/api/usuarios/${id}`);
  }
  guardarCuenta(datos: { empresa: string; ruc: string; separarFunciones: boolean }) {
    return this.http.put<DatosCuenta>('/api/cuenta', datos);
  }

  validarRol(id: number) {
    return this.http.post<RevisionRol>(`/api/roles/${id}/validar`, {});
  }
  aprobarRol(id: number) {
    return this.http.post<RolCabecera>(`/api/roles/${id}/aprobar`, {});
  }
  publicarRol(id: number) {
    return this.http.post<RolCabecera>(`/api/roles/${id}/publicar`, {});
  }
  pagarRol(id: number) {
    return this.http.post<RolCabecera>(`/api/roles/${id}/pagar`, {});
  }
  reliquidarRol(id: number, datos: { motivo: string; cambios: CambioReliquidacion[] }) {
    return this.http.post<{ id: number; empleados: number; avisos: string[] }>(`/api/roles/${id}/reliquidar`, datos);
  }

  guardarParametros(anio: number, datos: { sbu: number; canastaBasica?: number; tablaIr: TramoIr[]; fuente: string }) {
    return this.http.put<unknown>(`/api/parametros/${anio}`, datos);
  }
  guardarRegimen(codigo: string, datos: Record<string, unknown>) {
    return this.http.put<Regimen>(`/api/regimenes/${codigo}`, datos);
  }
  versionesRegimen(codigo: string) {
    return this.http.get<Regimen[]>(`/api/regimenes/${codigo}/versiones`);
  }
  eliminarVersionRegimen(codigo: string, desde: string) {
    return this.http.delete<void>(`/api/regimenes/${codigo}/versiones/${desde}`);
  }
  crearGrado(datos: DatosGrado) {
    return this.http.post<Grado>('/api/escala', datos);
  }
  editarGrado(id: number, datos: DatosGrado) {
    return this.http.put<Grado>(`/api/escala/${id}`, datos);
  }
  eliminarGrado(id: number) {
    return this.http.delete<void>(`/api/escala/${id}`);
  }

  crearPuesto(datos: DatosPuesto) {
    return this.http.post<Puesto>('/api/puestos', datos);
  }
  editarPuesto(id: number, datos: DatosPuesto) {
    return this.http.put<Puesto>(`/api/puestos/${id}`, datos);
  }
  asignarResponsable(id: number, empleadoId: number | null) {
    return this.http.patch<Puesto>(`/api/puestos/${id}/responsable`, { empleadoId });
  }
  eliminarPuesto(id: number) {
    return this.http.delete<void>(`/api/puestos/${id}`);
  }

  simular(entrada: EntradaSimulacion) {
    return this.http.post<ResultadoSimulacion>('/api/simulacion', entrada);
  }
}

/** Reglas de ley 2026 y datos de la empresa, cargados una sola vez. */
@Injectable({ providedIn: 'root' })
export class ParametrosLey {
  readonly recurso = httpResource<Parametros>(() => '/api/parametros');
  readonly valor = valorSeguro(this.recurso);
}
