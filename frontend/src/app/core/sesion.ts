import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, tap, throwError } from 'rxjs';

import { ParametrosLey } from './api';

/** Lo que el servidor deja hacer a cada rol; la tabla vive en el backend (`permisos.ts`). */
export type Permiso = 'ver' | 'editar' | 'validar' | 'aprobar' | 'publicar' | 'pagar' | 'usuarios';
export type RolUsuario = 'administrador' | 'aprobador' | 'lector';

interface EstadoSesion {
  autenticado: boolean;
  email: string | null;
  empresa: { nombre: string; ruc: string } | null;
  rol?: RolUsuario | null;
  permisos?: Permiso[];
  emailVerificado?: boolean;
}

/** Lo que pide el registro de una empresa. */
export interface DatosRegistro {
  empresa: string;
  ruc: string;
  email: string;
  clave: string;
}

/** Quién está dentro. La cookie de sesión la maneja el navegador; aquí solo se consulta si sigue válida. */
@Injectable({ providedIn: 'root' })
export class Sesion {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);

  /** undefined mientras no se ha preguntado al servidor */
  readonly autenticado = signal<boolean | undefined>(undefined);
  /** el correo de quien entró */
  readonly email = signal<string | null>(null);
  readonly empresa = signal<{ nombre: string; ruc: string } | null>(null);
  readonly rol = signal<RolUsuario | null>(null);
  readonly permisos = signal<Permiso[]>([]);
  /** ¿Confirmó que el correo es suyo? Solo informa: no bloquea nada. */
  readonly emailVerificado = signal(false);

  /** ¿Puede esta persona hacer eso? Solo ordena la pantalla: el servidor es quien lo exige. */
  puede(permiso: Permiso): boolean {
    return this.permisos().includes(permiso);
  }

  private aplicar(estado: EstadoSesion) {
    this.autenticado.set(estado.autenticado);
    this.email.set(estado.email);
    this.empresa.set(estado.empresa);
    this.rol.set(estado.rol ?? null);
    this.permisos.set(estado.permisos ?? []);
    this.emailVerificado.set(estado.emailVerificado ?? false);
  }

  /**
   * Las reglas de ley, la escala y el nombre de la empresa son de cada cuenta: al entrar o salir se
   * vuelven a pedir, para no mostrar lo de la cuenta (o la plantilla) anterior.
   */
  private cambioDeCuenta() {
    // Se busca al momento: así no se piden las reglas solo por consultar la sesión.
    this.injector.get(ParametrosLey).recurso.reload();
  }

  verificar() {
    return this.http.get<EstadoSesion>('/api/auth/yo').pipe(
      tap((estado) => this.aplicar(estado)),
      map((estado) => estado.autenticado),
      catchError(() => of(false)),
    );
  }

  entrar(email: string, clave: string) {
    return this.http.post<EstadoSesion>('/api/auth/entrar', { email, clave }).pipe(
      tap((estado) => this.aplicar(estado)),
      tap(() => this.cambioDeCuenta()),
    );
  }

  /** Crea la cuenta de una empresa y deja la sesión abierta en ella. */
  registrar(datos: DatosRegistro) {
    return this.http.post<EstadoSesion>('/api/auth/registro', datos).pipe(
      tap((estado) => this.aplicar(estado)),
      tap(() => this.cambioDeCuenta()),
    );
  }

  /** Pide el correo con el enlace para elegir otra contraseña. Responde igual exista o no la cuenta. */
  recuperar(email: string) {
    return this.http.post<{ mensaje: string }>('/api/auth/recuperar', { email });
  }

  restablecer(token: string, clave: string) {
    return this.http.post<void>('/api/auth/restablecer', { token, clave });
  }

  verificarCorreo(token: string) {
    return this.http.post<void>('/api/auth/verificar', { token }).pipe(tap(() => this.emailVerificado.set(true)));
  }

  reenviarVerificacion() {
    return this.http.post<{ mensaje: string }>('/api/auth/reenviar-verificacion', {});
  }

  /** Elimina la empresa y todo lo suyo. El servidor pide el RUC y la contraseña; la sesión muere con la cuenta. */
  eliminarCuenta(ruc: string, clave: string) {
    return this.http.delete<void>('/api/cuenta', { body: { ruc, clave } }).pipe(tap(() => this.expirar()));
  }

  salir() {
    return this.http.post<void>('/api/auth/salir', {}).pipe(tap(() => this.expirar()));
  }

  /** La sesión ya no vale (se cerró o venció): lo que se sabe de ella se olvida. */
  expirar() {
    const habia = this.autenticado();
    this.autenticado.set(false);
    this.email.set(null);
    this.empresa.set(null);
    this.rol.set(null);
    this.permisos.set([]);
    this.emailVerificado.set(false);
    if (habia) this.cambioDeCuenta();
  }
}

/** Solo se deja pasar a /sistema con una sesión válida; si no, al inicio de sesión, que luego vuelve aquí. */
export const sesionActiva: CanActivateFn = (_ruta, estado) => {
  const sesion = inject(Sesion);
  const router = inject(Router);
  if (sesion.autenticado()) return true;
  return sesion
    .verificar()
    .pipe(map((valida) => valida || router.createUrlTree(['/entrar'], { queryParams: { volver: estado.url } })));
};

/** Solo deja pasar a quien tiene ese permiso; si no, al inicio del sistema. */
export const conPermiso =
  (permiso: Permiso): CanActivateFn =>
  () => {
    const sesion = inject(Sesion);
    const router = inject(Router);
    return sesion.puede(permiso) || router.createUrlTree(['/sistema/inicio']);
  };

/** Si la API responde 401 (la sesión venció), se lleva a la persona a iniciar sesión de nuevo. */
export const sesionVencida: HttpInterceptorFn = (peticion, siguiente) => {
  const sesion = inject(Sesion);
  const router = inject(Router);
  return siguiente(peticion).pipe(
    catchError((error: unknown) => {
      const esDeLogin = peticion.url.startsWith('/api/auth/');
      if (error instanceof HttpErrorResponse && error.status === 401 && !esDeLogin) {
        sesion.expirar();
        if (!router.url.startsWith('/entrar')) {
          void router.navigate(['/entrar'], { queryParams: { volver: router.url } });
        }
      }
      return throwError(() => error);
    }),
  );
};
