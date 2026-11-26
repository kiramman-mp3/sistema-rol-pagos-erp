import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { EstadoGalo, Galo } from './galo';

/**
 * Galo con un mensaje debajo: para estados vacíos, cargas y errores de listas.
 * Nunca acompaña montos ni errores de ley o de pago.
 */
@Component({
  selector: 'app-aviso-galo',
  imports: [Galo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: .6rem; padding: .5rem 0; }
    .mensaje { max-width: 32rem; margin: 0; }
  `,
  template: `
    <app-galo [estado]="estado()" [ancho]="ancho()" />
    <p class="mensaje"><ng-content /></p>
  `,
})
export class AvisoGalo {
  readonly estado = input<EstadoGalo>('atento');
  readonly ancho = input('7rem');
}
