import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Sesion } from '../core/sesion';
import { mensajeDeError } from './mensaje';
import { MarcaAcceso } from '../marca/marca-acceso';

/** Pide el correo con el enlace para elegir otra contraseña. */
@Component({
  selector: 'app-recuperar',
  imports: [MarcaAcceso, ReactiveFormsModule, RouterLink],
  template: `
    <main class="pagina entrar">
      <app-marca-acceso />
      <div class="hoja">
        <div class="hoja-titulo">
          <h1>Recuperar la contraseña</h1>
          <p>Escribe el correo de tu cuenta y te enviaremos un enlace para elegir otra contraseña.</p>
        </div>
        <div class="hoja-cuerpo">
          @if (enviado()) {
            <div class="aviso aviso-success" role="status">
              Si ese correo tiene una cuenta, te enviamos un enlace. Vale 1 hora y solo se puede usar una vez.
              Revisa también la carpeta de correo no deseado.
            </div>
            <div class="acciones">
              <a class="boton" routerLink="/entrar">Volver a ingresar</a>
            </div>
          } @else {
            @if (error()) {
              <div class="aviso aviso-danger" role="alert">{{ error() }}</div>
            }
            <form class="formulario" [formGroup]="form" (ngSubmit)="enviar()">
              <div class="campo">
                <label for="email">Correo</label>
                <input class="entrada" id="email" type="email" formControlName="email" autocomplete="username" />
              </div>
              <div class="acciones">
                <button class="boton" type="submit" [disabled]="enviando()">
                  {{ enviando() ? 'Enviando…' : 'Enviar el enlace' }}
                </button>
                <a class="boton boton-texto" routerLink="/entrar">Volver</a>
              </div>
            </form>
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
export class Recuperar {
  private readonly sesion = inject(Sesion);

  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Escribe un correo válido.');
      return;
    }
    this.error.set('');
    this.enviando.set(true);
    this.sesion.recuperar(this.form.getRawValue().email.trim()).subscribe({
      next: () => this.enviado.set(true),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e, 'No se pudo enviar la solicitud. Revisa tu conexión.'));
      },
    });
  }
}
