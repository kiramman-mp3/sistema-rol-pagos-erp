import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Sesion } from '../core/sesion';
import { MarcaAcceso } from '../marca/marca-acceso';

/** Solo se vuelve a una pantalla del sistema: nunca a una dirección que venga de fuera. */
export function destinoSeguro(volver: string | undefined): string {
  return volver && /^\/sistema(\/|\?|$)/.test(volver) ? volver : '/sistema';
}

/** Inicio de sesión de una empresa registrada. */
@Component({
  selector: 'app-entrar',
  imports: [MarcaAcceso, ReactiveFormsModule, RouterLink],
  template: `
    <main class="pagina entrar">
      <app-marca-acceso />
      <div class="hoja">
        <div class="hoja-titulo">
          <h1>Ingresar al sistema</h1>
          <p>Escribe el correo y la contraseña con que registraste tu empresa.</p>
        </div>
        <div class="hoja-cuerpo">
          @if (error()) {
            <div class="aviso aviso-danger" role="alert">{{ error() }}</div>
          }
          <form class="formulario" [formGroup]="form" (ngSubmit)="entrar()">
            <div class="campo">
              <label for="email">Correo</label>
              <input class="entrada" id="email" type="email" formControlName="email" autocomplete="username" />
            </div>
            <div class="campo">
              <label for="clave">Contraseña</label>
              <input
                class="entrada"
                id="clave"
                type="password"
                formControlName="clave"
                autocomplete="current-password"
              />
            </div>
            <div class="acciones">
              <button class="boton" type="submit" [disabled]="enviando()">
                {{ enviando() ? 'Entrando…' : 'Entrar' }}
              </button>
              <a class="boton boton-texto" routerLink="/">Volver al inicio</a>
            </div>
          </form>
          <p class="apoyo"><a routerLink="/recuperar">¿Olvidaste tu contraseña?</a></p>
          <p class="apoyo">¿Tu empresa aún no tiene cuenta? <a routerLink="/registro">Regístrala aquí</a>.</p>
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
export class Entrar {
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  /** Pantalla a la que volver, de `?volver=`. */
  readonly volver = input<string>();

  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', Validators.required],
    clave: ['', Validators.required],
  });

  constructor() {
    // Quien ya tiene sesión no necesita ver esta pantalla.
    this.sesion.verificar().subscribe((valida) => {
      if (valida) void this.router.navigateByUrl(destinoSeguro(this.volver()));
    });
  }

  protected entrar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Escribe el correo y la contraseña.');
      return;
    }
    this.error.set('');
    this.enviando.set(true);
    const { email, clave } = this.form.getRawValue();
    this.sesion.entrar(email, clave).subscribe({
      next: () => void this.router.navigateByUrl(destinoSeguro(this.volver())),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.form.controls.clave.reset('');
        const errores = (e as HttpErrorResponse)?.error?.errores;
        this.error.set(
          Array.isArray(errores) && errores.length
            ? errores[0]
            : 'No se pudo iniciar sesión. Revisa tu conexión.',
        );
      },
    });
  }
}
