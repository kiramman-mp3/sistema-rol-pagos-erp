import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Sesion } from '../core/sesion';
import { MarcaAcceso } from '../marca/marca-acceso';

const CLAVE_MINIMA = 10;

/** La confirmación debe ser igual a la contraseña. */
function clavesIguales(grupo: AbstractControl): ValidationErrors | null {
  return grupo.get('clave')?.value === grupo.get('confirmar')?.value ? null : { distintas: true };
}

/** Registro de una empresa: crea su cuenta, con su propio espacio de datos, y abre la sesión. */
@Component({
  selector: 'app-registro',
  imports: [MarcaAcceso, ReactiveFormsModule, RouterLink],
  template: `
    <main class="pagina entrar">
      <app-marca-acceso />
      <div class="hoja">
        <div class="hoja-titulo">
          <h1>Registrar mi empresa</h1>
          <p>Cada empresa tiene su propia cuenta: tus empleados, roles y reglas no los ve nadie más.</p>
        </div>
        <div class="hoja-cuerpo">
          @if (errores().length) {
            <div class="aviso aviso-danger" role="alert">
              @for (e of errores(); track e) {
                <div>{{ e }}</div>
              }
            </div>
          }
          <form class="formulario" [formGroup]="form" (ngSubmit)="registrar()">
            <div class="campo">
              <label for="empresa">Nombre de la empresa</label>
              <input class="entrada" id="empresa" formControlName="empresa" autocomplete="organization" />
            </div>
            <div class="campo">
              <label for="ruc">RUC</label>
              <input class="entrada" id="ruc" formControlName="ruc" inputmode="numeric" maxlength="13" />
            </div>
            <div class="campo">
              <label for="email">Correo</label>
              <input class="entrada" id="email" type="email" formControlName="email" autocomplete="username" />
            </div>
            <div class="campo">
              <label for="clave">Contraseña (mínimo 10 caracteres)</label>
              <input class="entrada" id="clave" type="password" formControlName="clave" autocomplete="new-password" />
            </div>
            <div class="campo">
              <label for="confirmar">Repite la contraseña</label>
              <input class="entrada" id="confirmar" type="password" formControlName="confirmar" autocomplete="new-password" />
            </div>
            <p class="apoyo ayuda">
              Te enviaremos un correo para confirmar tu dirección; con ese mismo correo podrás recuperar la contraseña.
            </p>
            <div class="acciones">
              <button class="boton" type="submit" [disabled]="enviando()">
                {{ enviando() ? 'Creando la cuenta…' : 'Crear cuenta' }}
              </button>
              <a class="boton boton-texto" routerLink="/entrar">Ya tengo cuenta</a>
            </div>
          </form>
        </div>
      </div>
    </main>
  `,
  styles: `
    .entrar {
      max-width: 32rem;
      padding-top: 3rem;
    }
  `,
})
export class Registro {
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly errores = signal<string[]>([]);
  protected readonly enviando = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      empresa: ['', [Validators.required, Validators.minLength(2)]],
      ruc: ['', [Validators.required, Validators.pattern(/^\d{13}$/)]],
      email: ['', [Validators.required, Validators.email]],
      clave: ['', [Validators.required, Validators.minLength(CLAVE_MINIMA)]],
      confirmar: ['', Validators.required],
    },
    { validators: clavesIguales },
  );

  protected registrar() {
    const f = this.form.controls;
    const faltas: string[] = [];
    if (f.empresa.invalid) faltas.push('Escribe el nombre de la empresa.');
    if (f.ruc.invalid) faltas.push('El RUC tiene 13 dígitos.');
    if (f.email.invalid) faltas.push('Escribe un correo válido.');
    if (f.clave.invalid) faltas.push(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
    else if (this.form.hasError('distintas')) faltas.push('Las contraseñas no coinciden.');
    if (faltas.length) {
      this.form.markAllAsTouched();
      this.errores.set(faltas);
      return;
    }
    this.errores.set([]);
    this.enviando.set(true);
    const { empresa, ruc, email, clave } = this.form.getRawValue();
    this.sesion.registrar({ empresa, ruc, email, clave }).subscribe({
      next: () => void this.router.navigateByUrl('/sistema'),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.form.patchValue({ clave: '', confirmar: '' });
        const errores = (e as HttpErrorResponse)?.error?.errores;
        this.errores.set(
          Array.isArray(errores) && errores.length
            ? errores
            : ['No se pudo crear la cuenta. Revisa tu conexión.'],
        );
      },
    });
  }
}
