import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { mensajeDeError } from '../../acceso/mensaje';
import { Sesion } from '../../core/sesion';

/** Llevarse todos los datos de la empresa o eliminarla. Solo para administradores. */
@Component({
  selector: 'app-cuenta',
  imports: [ReactiveFormsModule],
  styles: `
    .peligro { border-left: 6px solid var(--descuentos); }
    .boton-peligro { background: var(--descuentos); border-color: var(--descuentos); color: #fff; }
  `,
  template: `
    <div class="encabezado">
      <div>
        <h1>Cuenta</h1>
        <p class="apoyo">Los datos de {{ sesion.empresa()?.nombre }} son suyos: puedes llevártelos o eliminarlos.</p>
      </div>
    </div>

    <section class="hoja" aria-labelledby="titulo-exportar">
      <div class="hoja-titulo"><h2 id="titulo-exportar">Descargar todos los datos</h2></div>
      <div class="hoja-cuerpo">
        <p>
          Un archivo JSON con los empleados, novedades, reglas de ley, escala, orgánico, roles con su desglose, usuarios
          (sin contraseñas) y el registro de auditoría.
        </p>
        <div class="acciones">
          <a class="boton" href="/api/cuenta/exportar" download>Descargar el archivo</a>
        </div>
      </div>
    </section>

    <section class="hoja peligro" aria-labelledby="titulo-eliminar">
      <div class="hoja-titulo"><h2 id="titulo-eliminar">Eliminar la empresa</h2></div>
      <div class="hoja-cuerpo">
        <p>
          Borra la cuenta y <strong>todo lo suyo, para siempre</strong>: empleados, roles (también los publicados y pagados),
          usuarios y auditoría. No se puede deshacer. Descarga los datos antes si los necesitas.
        </p>
        @if (!confirmando()) {
          <div class="acciones">
            <button type="button" class="boton boton-peligro" (click)="confirmando.set(true)">Eliminar la empresa…</button>
          </div>
        } @else {
          @if (error()) {
            <div class="aviso aviso-danger" role="alert">{{ error() }}</div>
          }
          <form class="formulario" [formGroup]="form" (ngSubmit)="eliminar()">
            <div class="campo">
              <label for="ruc">Escribe el RUC de la empresa ({{ sesion.empresa()?.ruc }})</label>
              <input class="entrada" id="ruc" formControlName="ruc" inputmode="numeric" autocomplete="off" />
            </div>
            <div class="campo">
              <label for="clave">Tu contraseña</label>
              <input class="entrada" id="clave" type="password" formControlName="clave" autocomplete="current-password" />
            </div>
            <div class="acciones">
              <button type="submit" class="boton boton-peligro" [disabled]="enviando()">
                {{ enviando() ? 'Eliminando…' : 'Eliminar para siempre' }}
              </button>
              <button type="button" class="boton boton-texto" (click)="cancelar()">Cancelar</button>
            </div>
          </form>
        }
      </div>
    </section>
  `,
})
export class Cuenta {
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly confirmando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    ruc: ['', Validators.required],
    clave: ['', Validators.required],
  });

  protected cancelar() {
    this.confirmando.set(false);
    this.error.set('');
    this.form.reset();
  }

  protected eliminar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Escribe el RUC de la empresa y tu contraseña.');
      return;
    }
    this.error.set('');
    this.enviando.set(true);
    const { ruc, clave } = this.form.getRawValue();
    this.sesion.eliminarCuenta(ruc.trim(), clave).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (e: unknown) => {
        this.enviando.set(false);
        this.form.controls.clave.reset('');
        this.error.set(mensajeDeError(e, 'No se pudo eliminar la cuenta. Revisa tu conexión.'));
      },
    });
  }
}
