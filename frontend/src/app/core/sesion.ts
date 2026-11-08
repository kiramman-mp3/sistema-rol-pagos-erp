import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, tap, throwError } from 'rxjs';

interface EstadoSesion {
  autenticado: boolean;
  usuario: string | null;
  /** false cuando el servidor corre sin inicio de sesión (trabajo local) */
  protegida: boolean;
}

/** Quién está dentro. La cookie de sesión la maneja el navegador; aquí solo se consulta si sigue válida. */
@Injectable({ providedIn: 'root' })
export class Sesion {
  private readonly http = inject(HttpClient);

  /** undefined mientras no se ha preguntado al servidor */
  readonly autenticado = signal<boolean | undefined>(undefined);
  readonly usuario = signal<string | null>(null);
  readonly protegida = signal(false);

  private aplicar(estado: EstadoSesion) {
    this.autenticado.set(estado.autenticado);
    this.usuario.set(estado.usuario);
    this.protegida.set(estado.protegida);
  }

  verificar() {
    return this.http.get<EstadoSesion>('/api/auth/yo').pipe(
      tap((estado) => this.aplicar(estado)),
      map((estado) => estado.autenticado),
      catchError(() => of(false)),
    );
  }

  entrar(usuario: string, clave: string) {
    return this.http
      .post<EstadoSesion>('/api/auth/entrar', { usuario, clave })
      .pipe(tap((estado) => this.aplicar(estado)));
  }

  salir() {
    return this.http.post<void>('/api/auth/salir', {}).pipe(tap(() => this.expirar()));
  }

  /** La sesión ya no vale (se cerró o venció): lo que se sabe de ella se olvida. */
  expirar() {
    this.autenticado.set(false);
    this.usuario.set(null);
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
