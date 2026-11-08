import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';

import { ParametrosLey, valorSeguro } from '../../core/api';
import { DineroPipe } from '../../core/dinero.pipe';
import type { TrazaRol } from '../../core/modelos';
import { etiquetaRegimen } from '../../core/regimen';

/** Cómo se calculó cada valor del rol de un empleado: fórmula, números y resultado, paso a paso. */
@Component({
  selector: 'app-desglose-calculo',
  imports: [DineroPipe],
  styles: `
    .contexto { margin: 0 0 .6rem; font-size: .9rem; }
    .fuente { display: block; font-size: .8rem; color: var(--tinta-suave); }
    .formula { color: var(--tinta-suave); font-size: .85rem; }
    .con-numeros { font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.clave td { font-weight: 700; }
  `,
  template: `
    @if (traza(); as t) {
      <p class="contexto">
        Calculado con las reglas de <strong>{{ regimen(t) }}</strong> vigentes desde {{ t.contexto.vigenteDesde }} y los
        parámetros de {{ t.contexto.anioParametros }} (SBU {{ t.contexto.sbu | dinero }}).
        @if (t.ajuste) {
          Este ajuste guarda solo la diferencia; el desglose explica el cálculo completo del mes con los cambios.
        }
      </p>
      <div class="deslizable">
        <table class="tabla" [attr.aria-label]="'Cálculo de ' + t.nombres">
          <thead>
            <tr><th>Concepto</th><th>Cómo se calcula</th><th>Con sus números</th><th class="num">Resultado</th></tr>
          </thead>
          <tbody>
            @for (p of t.pasos; track p.clave) {
              <tr [class.clave]="esTotal(p.clave)">
                <td>
                  {{ p.concepto }}
                  @if (p.fuente) { <span class="fuente">{{ p.fuente }}</span> }
                </td>
                <td class="formula">{{ p.formula }}</td>
                <td class="con-numeros">{{ p.detalle }}</td>
                <td class="num">{{ valor(p.clave, p.resultado) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (recurso.error()) {
      <p class="apoyo">No hay desglose guardado para este empleado: el rol se calculó antes de que el sistema lo guardara.</p>
    } @else {
      <p class="apoyo">Cargando el cálculo…</p>
    }
  `,
})
export class DesgloseCalculo {
  readonly rolId = input.required<number>();
  readonly cedula = input.required<string>();

  protected readonly recurso = httpResource<TrazaRol>(() => `/api/roles/${this.rolId()}/traza/${this.cedula()}`);
  protected readonly traza = valorSeguro(this.recurso);
  private readonly parametros = inject(ParametrosLey).valor;
  private readonly dinero = new DineroPipe();

  protected readonly esTotal = (clave: string) => ['ingresosAportables', 'totalIngresos', 'totalDescuentos', 'netoPagar', 'costoEmpleador'].includes(clave);

  protected readonly regimenes = computed(() => this.parametros()?.regimenes);

  protected regimen(t: TrazaRol): string {
    return etiquetaRegimen(this.regimenes(), t.contexto.regimen);
  }

  /** Días, meses y horas no son dinero. */
  protected valor(clave: string, resultado: number): string {
    return clave === 'diasTrabajados' || clave === 'mesesServicio' ? String(resultado) : this.dinero.transform(resultado);
  }
}
