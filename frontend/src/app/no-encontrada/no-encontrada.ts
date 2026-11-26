import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Galo } from '../marca/galo';

/** Página 404: la dirección no existe, así que no cuadra. */
@Component({
  selector: 'app-no-encontrada',
  imports: [Galo, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 2rem 1rem; background: var(--papel); }
    .caja { display: grid; justify-items: center; gap: 1rem; text-align: center; max-width: 30rem; }
    h1 { font-size: clamp(1.8rem, 3vw + 1rem, 2.6rem); }
    p { margin: 0; color: var(--tinta-suave); }
    .codigo { font: 800 .8rem var(--cuerpo); letter-spacing: .14em; text-transform: uppercase; color: var(--descuentos); }
    .acciones { margin-top: .5rem; justify-content: center; }
  `,
  template: `
    <main class="caja">
      <app-galo estado="no-cuadra" ancho="13rem" [interactivo]="true" />
      <span class="codigo">Error 404</span>
      <h1>Esta página no está en el rol</h1>
      <p>La dirección que abriste no existe o ya cambió de lugar. Vuelve al inicio y sigue desde ahí.</p>
      <div class="acciones">
        <a class="boton boton-sol" routerLink="/">Volver al inicio</a>
        <a class="boton boton-claro" routerLink="/sistema/inicio">Ir a mi empresa</a>
      </div>
    </main>
  `,
})
export class NoEncontrada {}
