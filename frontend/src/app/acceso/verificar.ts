import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Sesion } from '../core/sesion';
import { mensajeDeError } from './mensaje';

/** Confirma el correo con el enlace que llegó (`?token=`). Se confirma al abrirlo: no hay que pulsar nada. */
@Component({
  selector: 'app-verificar',
  imports: [RouterLink],
  template: `
    <main class="pagina entrar">
      <div class="hoja">
        <div class="hoja-titulo">
          <h1>Verificar el correo</h1>
        </div>
        <div class="hoja-cuerpo">
          @switch (estado()) {
            @case ('listo') {
              <div class="aviso aviso-success" role="status">Listo: tu correo quedó verificado.</div>
              <div class="acciones">
                <a class="boton" routerLink="/sistema">Ir al sistema</a>
              </div>
            }
            @case ('error') {
              <div class="aviso aviso-danger" role="alert">{{ error() }}</div>
              <p class="apoyo">Si tienes la sesión abierta, pide otro enlace desde el aviso del sistema.</p>
              <div class="acciones">
                <a class="boton" routerLink="/sistema">Ir al sistema</a>
              </div>
            }
            @default {
              <p class="apoyo">Confirmando tu correo…</p>
            }
          }
        </div>
      </div>
    </main>
  `,
  styles: `
    .entrar {
      max-width: 28rem;
      padding-top: 4rem;
    }
  `,
})
export class Verificar {
  private readonly sesion = inject(Sesion);

  readonly token = input<string>();

  protected readonly estado = signal<'espera' | 'listo' | 'error'>('espera');
  protected readonly error = signal('');
  private enviado = false;

  constructor() {
    effect(() => {
      const token = this.token();
      // Una sola vez: el enlace se gasta al usarse y repetir la petición diría que ya venció.
      if (this.enviado) return;
      this.enviado = true;
      if (!token) {
        this.error.set('Este enlace está incompleto.');
        this.estado.set('error');
        return;
      }
      this.sesion.verificarCorreo(token).subscribe({
        next: () => this.estado.set('listo'),
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e, 'No se pudo verificar el correo. Revisa tu conexión.'));
          this.estado.set('error');
        },
      });
    });
  }
}
