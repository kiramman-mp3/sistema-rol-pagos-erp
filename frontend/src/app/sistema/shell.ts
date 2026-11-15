import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Avisos } from '../core/avisos';
import { ParametrosLey } from '../core/api';
import { Sesion } from '../core/sesion';

/** Barra superior, navegación y avisos de todas las pantallas del sistema. */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="barra">
      <div class="barra-interior">
        <a class="marca" routerLink="/" title="Volver a la página de inicio">
          <span class="bandera" aria-hidden="true"><i></i><i></i><i></i></span>
          Rol de pagos<small>Ecuador 2026</small>
        </a>
        <nav class="navegacion" aria-label="Principal">
          <a routerLink="/sistema/inicio" routerLinkActive ariaCurrentWhenActive="page">Inicio</a>
          <a routerLink="/sistema/empleados" routerLinkActive ariaCurrentWhenActive="page">Empleados</a>
          <a routerLink="/sistema/roles" routerLinkActive ariaCurrentWhenActive="page">Roles de pago</a>
          <a routerLink="/sistema/prestamos" routerLinkActive ariaCurrentWhenActive="page">Préstamos</a>
          <a routerLink="/sistema/vacaciones" routerLinkActive ariaCurrentWhenActive="page">Vacaciones</a>
          <a routerLink="/sistema/organico" routerLinkActive ariaCurrentWhenActive="page">Orgánico</a>
          <a routerLink="/sistema/parametros" routerLinkActive ariaCurrentWhenActive="page">Parámetros</a>
          @if (sesion.puede('usuarios')) {
            <a routerLink="/sistema/usuarios" routerLinkActive ariaCurrentWhenActive="page">Usuarios</a>
            <a routerLink="/sistema/cuenta" routerLinkActive ariaCurrentWhenActive="page">Cuenta</a>
          }
        </nav>
        <span class="empresa">
          <strong>{{ parametros()?.empresa?.nombre }}</strong>
          <a routerLink="/informacion">Información</a>
          <button type="button" class="boton-texto salir" (click)="salir()">Salir</button>
        </span>
      </div>
    </header>

    <main class="pagina">
      @if (sesion.rol() && !sesion.puede('editar')) {
        <div class="aviso aviso-warning no-imprimir" role="status">
          Entraste como <strong>{{ sesion.rol() }}</strong>:
          {{ sesion.puede('aprobar') ? 'puedes consultar, validar, aprobar y publicar roles, pero no cambiar datos.' : 'solo puedes consultar.' }}
        </div>
      }
      @if (!sesion.emailVerificado()) {
        <div class="aviso aviso-info no-imprimir" role="status">
          Aún no verificas tu correo{{ sesion.email() ? ' (' + sesion.email() + ')' : '' }}.
          @switch (reenvio()) {
            @case ('enviado') {
              Te enviamos un enlace nuevo.
            }
            @case ('error') {
              No se pudo enviar el enlace; inténtalo más tarde.
            }
            @default {
              <button type="button" class="boton-texto" [disabled]="reenvio() === 'enviando'" (click)="reenviar()">
                Reenviar el enlace
              </button>
            }
          }
        </div>
      }
      @for (aviso of avisos.lista(); track aviso.id) {
        <div class="aviso aviso-{{ aviso.tipo }} no-imprimir" role="status">{{ aviso.texto }}</div>
      }
      <router-outlet />
    </main>
  `,
})
export class Shell {
  protected readonly avisos = inject(Avisos);
  protected readonly parametros = inject(ParametrosLey).valor;
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly reenvio = signal<'' | 'enviando' | 'enviado' | 'error'>('');

  protected reenviar() {
    this.reenvio.set('enviando');
    this.sesion.reenviarVerificacion().subscribe({
      next: () => this.reenvio.set('enviado'),
      error: () => this.reenvio.set('error'),
    });
  }

  protected salir() {
    this.sesion.salir().subscribe(() => void this.router.navigateByUrl('/entrar'));
  }
}
