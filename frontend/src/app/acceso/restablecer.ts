import { Component, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Sesion } from '../core/sesion';
import { mensajeDeError } from './mensaje';

const CLAVE_MINIMA = 10;

function clavesIguales(grupo: AbstractControl): ValidationErrors | null {
  return grupo.get('clave')?.value === grupo.get('confirmar')?.value ? null : { distintas: true };
}

/** Elige la contraseña nueva con el enlace que llegó por correo (`?token=`). */
@Component({
  selector: 'app-restablecer',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="pagina entrar">
      <div class="hoja">
        <div class="hoja-titulo">
          <h1>Elegir una contraseña nueva</h1>
        </div>
        <div class="hoja-cuerpo">
          @if (listo()) {
            <div class="aviso aviso-success" role="status">Listo: ya cambiaste tu contraseña.</div>
            <div class="acciones">
              <a class="boton" routerLink="/entrar">Ingresar</a>
            </div>
          } @else if (!token()) {
            <div class="aviso aviso-danger" role="alert">Este enlace está incompleto. Pide uno nuevo.</div>
            <div class="acciones">
              <a class="boton" routerLink="/recuperar">Pedir un enlace nuevo</a>
            </div>
          } @else {
            @if (error()) {
              <div class="aviso aviso-danger" role="alert">
                {{ error() }}
                @if (enlaceInservible()) {
                  <a routerLink="/recuperar">Pide un enlace nuevo.</a>
                }
              </div>
            }
            <form class="formulario" [formGroup]="form" (ngSubmit)="guardar()">
              <div class="campo">
                <label for="clave">Contraseña nueva (mínimo 10 caracteres)</label>
                <input class="entrada" id="clave" type="password" formControlName="clave" autocomplete="new-password" />
              </div>
              <div class="campo">
                <label for="confirmar">Repite la contraseña</label>
                <input class="entrada" id="confirmar" type="password" formControlName="confirmar" autocomplete="new-password" />
              </div>
              <div class="acciones">
                <button class="boton" type="submit" [disabled]="enviando()">
                  {{ enviando() ? 'Guardando…' : 'Guardar la contraseña' }}
                </button>
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
export class Restablecer {
  private readonly sesion = inject(Sesion);

  /** Del enlace: `?token=`. */
  readonly token = input<string>();

  protected readonly error = signal('');
  /** El servidor rechazó el enlace: venció, ya se usó o no existe. */
  protected readonly enlaceInservible = signal(false);
  protected readonly enviando = signal(false);
  protected readonly listo = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      clave: ['', [Validators.required, Validators.minLength(CLAVE_MINIMA)]],
      confirmar: ['', Validators.required],
    },
    { validators: clavesIguales },
  );

  protected guardar() {
    const token = this.token();
    if (!token) return;
    if (this.form.controls.clave.invalid) {
      this.form.markAllAsTouched();
      this.error.set(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
      return;
    }
    if (this.form.hasError('distintas')) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.error.set('');
    this.enlaceInservible.set(false);
    this.enviando.set(true);
    this.sesion.restablecer(token, this.form.getRawValue().clave).subscribe({
      next: () => this.listo.set(true),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.form.reset();
        this.enlaceInservible.set(true);
        this.error.set(mensajeDeError(e, 'No se pudo guardar la contraseña. Revisa tu conexión.'));
      },
    });
  }
}
