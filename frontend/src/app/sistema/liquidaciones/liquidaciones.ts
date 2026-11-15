import { httpResource } from '@angular/common/http';
import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, valorSeguro } from '../../core/api';
import { Avisos } from '../../core/avisos';
import { DineroPipe } from '../../core/dinero.pipe';
import type { CausaSalida, Empleado, Liquidacion, RegionDecimo, VistaLiquidacion } from '../../core/modelos';
import { Sesion } from '../../core/sesion';

const CAUSAS: { valor: CausaSalida; etiqueta: string }[] = [
  { valor: 'renuncia', etiqueta: 'Renuncia voluntaria' },
  { valor: 'acuerdo', etiqueta: 'Terminación por acuerdo de las partes' },
  { valor: 'desahucio', etiqueta: 'Desahucio' },
  { valor: 'despido_intempestivo', etiqueta: 'Despido intempestivo' },
  { valor: 'visto_bueno_empleador', etiqueta: 'Visto bueno a favor del empleador' },
  { valor: 'visto_bueno_trabajador', etiqueta: 'Visto bueno a favor del trabajador' },
  { valor: 'fin_contrato', etiqueta: 'Fin del plazo del contrato' },
];

const REGIONES: { valor: RegionDecimo; etiqueta: string }[] = [
  { valor: 'sierra', etiqueta: 'Sierra y Amazonía (décimo cuarto de agosto a julio)' },
  { valor: 'costa', etiqueta: 'Costa y Galápagos (décimo cuarto de marzo a febrero)' },
];

/** Liquidación de quien sale: se calcula, se revisa y recién entonces se registra y se da de salida al empleado. */
@Component({
  selector: 'app-liquidaciones',
  imports: [DineroPipe],
  styles: `
    .confirmar { display: inline-flex; align-items: center; gap: .25rem; font-size: .9rem; font-weight: 600; color: var(--descuentos); }
    .total td { font-weight: 700; }
  `,
  template: `
    <div class="encabezado">
      <div>
        <h1>Liquidaciones</h1>
        <p class="apoyo">
          Lo que se le paga a quien sale, además de su último rol: los décimos acumulados, las vacaciones no
          gozadas y las indemnizaciones que corresponden a la causa de la salida. El sueldo del mes de salida lo
          paga el rol de ese mes.
        </p>
      </div>
    </div>

    @if (sesion.puede('editar')) {
      <section class="hoja" aria-labelledby="titulo-nueva">
        <div class="hoja-titulo">
          <h2 id="titulo-nueva">Calcular una liquidación</h2>
          <p>Genera antes los roles de los meses trabajados desde diciembre: de ellos sale el décimo tercero provisionado.</p>
        </div>
        <div class="hoja-cuerpo">
          <form class="formulario" (submit)="$event.preventDefault(); calcular()">
            <div class="campo c2">
              <label for="liq-empleado">Empleado</label>
              <select class="entrada" id="liq-empleado" (change)="cambiar(empleadoId, $any($event.target).value)">
                <option value="">Elige quién sale</option>
                @for (e of empleados(); track e.id) {
                  <option [value]="e.id" [selected]="'' + e.id === empleadoId()">{{ e.nombres }}</option>
                }
              </select>
            </div>
            <div class="campo">
              <label for="liq-fecha">Fecha de salida</label>
              <input class="entrada" id="liq-fecha" type="date" [value]="fechaSalida()"
                     (input)="cambiar(fechaSalida, $any($event.target).value)" />
            </div>
            <div class="campo">
              <label for="liq-causa">Causa de la salida</label>
              <select class="entrada" id="liq-causa" (change)="cambiar(causa, $any($event.target).value)">
                @for (c of causas; track c.valor) { <option [value]="c.valor" [selected]="c.valor === causa()">{{ c.etiqueta }}</option> }
              </select>
            </div>
            <div class="campo c2">
              <label for="liq-region">Región</label>
              <select class="entrada" id="liq-region" (change)="cambiar(region, $any($event.target).value)">
                @for (r of regiones; track r.valor) { <option [value]="r.valor" [selected]="r.valor === region()">{{ r.etiqueta }}</option> }
              </select>
            </div>
            <div class="acciones">
              <button class="boton" [disabled]="trabajando()">Calcular</button>
            </div>
          </form>
        </div>
      </section>
    }

    @if (vista(); as v) {
      <section class="hoja" aria-labelledby="titulo-vista">
        <div class="hoja-titulo">
          <h2 id="titulo-vista">Liquidación de {{ v.nombres }}</h2>
          <p>
            {{ v.causaEtiqueta }}, salida el {{ v.fechaSalida }}. {{ v.aniosServicio }} años de servicio
            ({{ v.diasServicio }} días), sueldo base {{ v.sueldoBase | dinero }}.
          </p>
        </div>
        @for (a of v.avisos; track a) { <div class="aviso aviso-warning" role="status">{{ a }}</div> }
        <div class="deslizable">
          <table class="tabla" id="tabla-vista">
            <thead>
              <tr><th>Rubro</th><th>Cómo se calculó</th><th class="num">Valor</th></tr>
            </thead>
            <tbody>
              @for (r of v.rubros; track r.clave) {
                <tr>
                  <td>{{ r.concepto }}</td>
                  <td>{{ r.detalle }} <span class="secundario">{{ r.formula }}</span>@if (r.fuente) { <span class="secundario">{{ r.fuente }}</span> }</td>
                  <td class="num">{{ r.valor | dinero }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="total"><td colspan="2">Total a pagar</td><td class="num">{{ v.total | dinero }}</td></tr>
            </tfoot>
          </table>
        </div>
        @if (sesion.puede('editar')) {
          <div class="hoja-cuerpo">
            @if (confirmando()) {
              <span class="confirmar" role="alert">
                Registrar la liquidación de {{ v.nombres }} lo da de salida el {{ v.fechaSalida }}. ¿Continuar?
                <button class="boton-texto boton-peligro" type="button" (click)="registrar()">Sí, registrar</button>
                <button class="boton-texto" type="button" (click)="confirmando.set(false)">No</button>
              </span>
            } @else {
              <button class="boton" type="button" [disabled]="trabajando()" (click)="confirmando.set(true)">Registrar y dar de salida</button>
            }
          </div>
        }
      </section>
    }

    <section class="hoja" aria-labelledby="titulo-lista">
      <div class="hoja-titulo"><h2 id="titulo-lista">Liquidaciones registradas</h2></div>
      <div class="deslizable">
        <table class="tabla" id="tabla-registradas">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Salida</th>
              <th>Causa</th>
              <th class="num">Total</th>
              <th><span class="solo-lectura">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (l of liquidaciones(); track l.id) {
              <tr>
                <td>{{ l.nombres }} <span class="secundario">{{ l.cargo }}</span></td>
                <td>{{ l.fechaSalida }}</td>
                <td>{{ l.causaEtiqueta }}</td>
                <td class="num"><strong>{{ l.total | dinero }}</strong></td>
                <td class="num">
                  @if (porEliminar() === l.id) {
                    <span class="confirmar" role="alert">
                      ¿Eliminar la liquidación de {{ l.nombres }}?
                      <button class="boton-texto boton-peligro" type="button" (click)="eliminar(l)">Sí, eliminar</button>
                      <button class="boton-texto" type="button" (click)="porEliminar.set(null)">No</button>
                    </span>
                  } @else {
                    <button class="boton-texto" type="button" [attr.aria-expanded]="abierta() === l.id" (click)="alternar(l.id)">
                      {{ abierta() === l.id ? 'Ocultar' : 'Ver rubros' }}
                    </button>
                    @if (sesion.puede('editar')) {
                      <button class="boton-texto boton-peligro" type="button" (click)="porEliminar.set(l.id)">Eliminar</button>
                    }
                  }
                </td>
              </tr>
              @if (abierta() === l.id) {
                <tr class="rubros">
                  <td colspan="5">
                    <ul class="sin-vinetas">
                      @for (r of l.rubros; track r.clave) {
                        <li><strong>{{ r.concepto }}:</strong> {{ r.valor | dinero }} <span class="secundario">{{ r.detalle }}</span></li>
                      }
                    </ul>
                    @if (l.prestamosCuotas > 0) {
                      <p class="pequeno apoyo">Quedaban {{ l.prestamosCuotas }} cuotas de préstamos del IESS por {{ l.prestamosValor | dinero }}.</p>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="5" class="tabla-vacia">{{ lista.isLoading() ? 'Cargando liquidaciones…' : lista.error() ? 'No se pudo cargar la lista.' : 'Todavía no hay liquidaciones registradas.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="hoja-cuerpo pequeno apoyo">
        Eliminar una liquidación no devuelve al empleado a la nómina: eso se hace desde Empleados.
      </div>
    </section>
  `,
})
export class Liquidaciones {
  protected readonly sesion = inject(Sesion);
  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);

  protected readonly lista = httpResource<Liquidacion[]>(() => '/api/liquidaciones');
  private readonly datos = valorSeguro(this.lista);
  private readonly recursoEmpleados = httpResource<Empleado[]>(() => '/api/empleados');
  private readonly todos = valorSeguro(this.recursoEmpleados);

  protected readonly causas = CAUSAS;
  protected readonly regiones = REGIONES;
  protected readonly liquidaciones = computed(() => this.datos() ?? []);
  /** A quien ya salió no se le calcula: su liquidación, si falta, se registra con su fecha desde Empleados. */
  protected readonly empleados = computed(() => (this.todos() ?? []).filter((e) => e.activo));

  protected readonly empleadoId = signal('');
  protected readonly fechaSalida = signal('');
  protected readonly causa = signal<CausaSalida>('renuncia');
  protected readonly region = signal<RegionDecimo>('sierra');
  protected readonly vista = signal<VistaLiquidacion | null>(null);
  protected readonly confirmando = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly abierta = signal<number | null>(null);
  protected readonly porEliminar = signal<number | null>(null);

  /** Cambiar un dato del formulario deja sin efecto la liquidación que ya se había calculado con los anteriores. */
  protected cambiar<T extends string>(campo: WritableSignal<T>, valor: string) {
    campo.set(valor as T);
    this.vista.set(null);
    this.confirmando.set(false);
  }

  protected alternar(id: number) {
    this.abierta.update((actual) => (actual === id ? null : id));
  }

  private datosDelFormulario() {
    return {
      empleadoId: Number(this.empleadoId()),
      fechaSalida: this.fechaSalida(),
      causa: this.causa(),
      region: this.region(),
    };
  }

  protected async calcular() {
    this.avisos.limpiar();
    this.trabajando.set(true);
    this.confirmando.set(false);
    try {
      this.vista.set(await firstValueFrom(this.api.calcularLiquidacion(this.datosDelFormulario())));
    } catch (error) {
      this.vista.set(null);
      this.avisos.errorHttp(error);
    } finally {
      this.trabajando.set(false);
    }
  }

  protected async registrar() {
    this.avisos.limpiar();
    this.trabajando.set(true);
    try {
      const r = await firstValueFrom(this.api.registrarLiquidacion(this.datosDelFormulario()));
      this.avisos.exito(`Liquidación de ${r.nombres} registrada: ${r.nombres} quedó con salida el ${r.fechaSalida}.`);
      this.vista.set(null);
      this.empleadoId.set('');
      this.fechaSalida.set('');
    } catch (error) {
      this.avisos.errorHttp(error);
    } finally {
      this.confirmando.set(false);
      this.trabajando.set(false);
      this.lista.reload();
      this.recursoEmpleados.reload();
    }
  }

  protected async eliminar(l: Liquidacion) {
    this.avisos.limpiar();
    this.trabajando.set(true);
    try {
      await firstValueFrom(this.api.eliminarLiquidacion(l.id));
      this.avisos.exito(`Liquidación de ${l.nombres} eliminada.`);
    } catch (error) {
      this.avisos.errorHttp(error);
    } finally {
      this.trabajando.set(false);
      this.porEliminar.set(null);
      this.lista.reload();
    }
  }
}
