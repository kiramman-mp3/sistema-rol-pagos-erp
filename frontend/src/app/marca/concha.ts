import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let contador = 0;

/**
 * El símbolo de Cuadra: el caparazón de Galo como un gráfico de cuatro piezas, una por cada concepto
 * de la boleta (ingresos, descuentos, neto y provisiones). Es el logo y el ícono de la aplicación.
 */
@Component({
  selector: 'app-concha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width]': 'ancho()' },
  styles: `
    :host { display: inline-block; flex: none; line-height: 0; }
    svg { width: 100%; height: auto; overflow: visible; }
  `,
  template: `
    <svg viewBox="0 0 100 76" aria-hidden="true" focusable="false">
      <clipPath [id]="id"><path [attr.d]="domo" /></clipPath>
      <g [attr.clip-path]="'url(#' + id + ')'">
        <polygon points="50,66 -70,66 -34.9,-18.9" fill="#2b44d6" />
        <polygon points="50,66 -34.9,-18.9 50,-54" fill="#ef4b3c" />
        <polygon points="50,66 50,-54 134.9,-18.9" fill="#0b7f55" />
        <polygon points="50,66 134.9,-18.9 170,66" fill="#e39a1b" />
        <rect x="0" y="55" width="100" height="11" [attr.fill]="borde()" />
        <g [attr.stroke]="linea()" stroke-width="4" stroke-linecap="round">
          <line x1="50" y1="66" x2="-34.9" y2="-18.9" />
          <line x1="50" y1="66" x2="50" y2="-54" />
          <line x1="50" y1="66" x2="134.9" y2="-18.9" />
        </g>
      </g>
      <path [attr.d]="domo" fill="none" [attr.stroke]="linea()" stroke-width="5" stroke-linejoin="round" />
      <line x1="6" y1="66" x2="94" y2="66" [attr.stroke]="linea()" stroke-width="5" stroke-linecap="round" />
    </svg>
  `,
})
export class Concha {
  /** Ancho CSS; el alto sale de la proporción. */
  readonly ancho = input('2.4rem');
  /** Color del contorno y de las líneas entre piezas. */
  readonly linea = input('#17163a');
  /** Color de la franja inferior (el borde del caparazón). */
  readonly borde = input('#18237a');

  protected readonly id = `concha-${++contador}`;
  protected readonly domo = 'M6 66 C6 32 26 8 50 8 C74 8 94 32 94 66 Z';
}
