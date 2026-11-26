import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Concha } from './concha';

/** Logo de Cuadra sobre las pantallas de acceso (ingresar, registrar, recuperar, verificar). */
@Component({
  selector: 'app-marca-acceso',
  imports: [Concha, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; justify-content: center; margin-bottom: 1.25rem; }
    a { display: inline-flex; align-items: center; gap: .65rem; text-decoration: none; color: var(--noche); font: 800 1.6rem/1 var(--display); letter-spacing: -0.03em; }
    small { font: 600 .8rem var(--cuerpo); color: var(--tinta-suave); letter-spacing: 0; }
  `,
  template: `
    <a routerLink="/" aria-label="Cuadra, volver a la página de inicio">
      <app-concha ancho="3rem" linea="#17163a" borde="#18237a" />
      <span>Cuadra<br /><small>Rol de pagos</small></span>
    </a>
  `,
})
export class MarcaAcceso {}
