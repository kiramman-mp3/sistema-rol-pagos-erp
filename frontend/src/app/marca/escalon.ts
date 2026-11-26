import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * El escalón: la escala salarial dibujada, un peldaño por grado y un color de la marca por peldaño.
 * Separa secciones y adorna el encabezado de la boleta.
 */
@Component({
  selector: 'app-escalon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; line-height: 0; }
    svg { width: 100%; height: 2.2rem; display: block; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  `,
  template: `
    <svg viewBox="0 0 320 44" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="0" y="32" width="80" height="12" fill="#2b44d6" />
      <rect x="80" y="22" width="80" height="12" fill="#ef4b3c" />
      <rect x="160" y="12" width="80" height="12" fill="#0b7f55" />
      <rect x="240" y="2" width="80" height="12" fill="#ffc93c" />
      <path
        d="M0 32 H80 V22 H160 V12 H240 V2 H320"
        fill="none" stroke="#17163a" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"
      />
    </svg>
  `,
})
export class Escalon {}
