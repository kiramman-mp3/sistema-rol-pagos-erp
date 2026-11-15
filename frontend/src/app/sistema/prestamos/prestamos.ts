import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, valorSeguro } from '../../core/api';
import { Avisos } from '../../core/avisos';
import { DineroPipe } from '../../core/dinero.pipe';
import type { Empleado, Prestamo, TipoPrestamo } from '../../core/modelos';
import { Sesion } from '../../core/sesion';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const TIPOS: { valor: TipoPrestamo; etiqueta: string }[] = [
  { valor: 'quirografario', etiqueta: 'Quirografario' },
  { valor: 'hipotecario', etiqueta: 'Hipotecario' },
  { valor: 'prendario', etiqueta: 'Prendario' },
];

/** Préstamos del IESS de los empleados: el rol descuenta una cuota por mes hasta completarlas. */
@Component({
  selector: 'app-prestamos',
  imports: [DineroPipe],
  styles: `
    .confirmar { display: inline-flex; align-items: center; gap: .25rem; font-size: .9rem; font-weight: 600; color: var(--descuentos); }
  `,
  template: `
    <div class="encabezado">
      <div>
        <h1>Préstamos del IESS</h1>
        <p class="apoyo">
          Los quirografarios, hipotecarios y prendarios que el IESS cobra a través del empleador. El rol descuenta
          la cuota de cada mes, desde el mes indicado hasta completar las cuotas.
        </p>
      </div>
    </div>

    <section class="hoja" aria-labelledby="titulo-lista">
      <div class="hoja-titulo"><h2 id="titulo-lista">Préstamos registrados</h2></div>
      <div class="deslizable">
        <table class="tabla">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Tipo</th>
              <th class="num">Cuota</th>
              <th class="num">Cuotas</th>
              <th>Se descuenta</th>
              <th>Estado</th>
              <th><span class="solo-lectura">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of prestamos(); track p.id) {
              <tr>
                <td>
                  {{ p.nombres }}
                  @if (p.observacion) { <span class="secundario">{{ p.observacion }}</span> }
                </td>
                <td>{{ etiquetaTipo(p.tipo) }}</td>
                <td class="num">{{ p.cuota | dinero }}</td>
                <td class="num">{{ p.cuotas }} <span class="secundario">{{ p.total | dinero }} en total</span></td>
                <td>{{ mes(p.primerAnio, p.primerMes) }} a {{ mes(p.ultimoAnio, p.ultimoMes) }}</td>
                <td>
                  <span class="insignia" [class.insignia-suave]="!p.activo">{{ p.activo ? 'Activo' : 'Suspendido' }}</span>
                </td>
                <td class="num">
                  @if (porEliminar() === p.id) {
                    <span class="confirmar" role="alert">
                      ¿Eliminar el préstamo de {{ p.nombres }}?
                      <button class="boton-texto boton-peligro" type="button" (click)="eliminar(p)">Sí, eliminar</button>
                      <button class="boton-texto" type="button" (click)="porEliminar.set(null)">No</button>
                    </span>
                  } @else if (sesion.puede('editar')) {
                    <button class="boton-texto" type="button" (click)="alternar(p)">{{ p.activo ? 'Suspender' : 'Reanudar' }}</button>
                    <button class="boton-texto boton-peligro" type="button" (click)="porEliminar.set(p.id)">Eliminar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="tabla-vacia">{{ lista.isLoading() ? 'Cargando préstamos…' : lista.error() ? 'No se pudo cargar la lista.' : 'Todavía no hay préstamos registrados.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="hoja-cuerpo pequeno apoyo">
        Un préstamo suspendido no se descuenta, pero queda en el historial. Los roles ya generados conservan lo que se descontó.
      </div>
    </section>

    @if (sesion.puede('editar')) {
      <section class="hoja" aria-labelledby="titulo-nuevo">
        <div class="hoja-titulo">
          <h2 id="titulo-nuevo">Registrar un préstamo</h2>
          <p>Copia la cuota y el número de cuotas del comprobante del IESS: aquí no se calcula interés.</p>
        </div>
        <div class="hoja-cuerpo">
          <form class="formulario" (submit)="$event.preventDefault(); agregar()">
            <div class="campo c2">
              <label for="prestamo-empleado">Empleado</label>
              <select class="entrada" id="prestamo-empleado" (change)="empleadoId.set($any($event.target).value)">
                <option value="">Elige a quién se le descuenta</option>
                @for (e of empleados(); track e.id) {
                  <option [value]="e.id" [selected]="'' + e.id === empleadoId()">{{ e.nombres }}</option>
                }
              </select>
            </div>
            <div class="campo">
              <label for="prestamo-tipo">Tipo</label>
              <select class="entrada" id="prestamo-tipo" (change)="tipo.set($any($event.target).value)">
                @for (t of tipos; track t.valor) { <option [value]="t.valor" [selected]="t.valor === tipo()">{{ t.etiqueta }}</option> }
              </select>
            </div>
            <div class="campo">
              <label for="prestamo-cuota">Cuota mensual ($)</label>
              <input class="entrada" id="prestamo-cuota" type="number" step="0.01" min="0.01" inputmode="decimal"
                     [value]="cuota()" (input)="cuota.set($any($event.target).value)" />
            </div>
            <div class="campo">
              <label for="prestamo-cuotas">Número de cuotas</label>
              <input class="entrada" id="prestamo-cuotas" type="number" step="1" min="1" max="360"
                     [value]="cuotas()" (input)="cuotas.set($any($event.target).value)" />
            </div>
            <div class="campo">
              <label for="prestamo-mes">Primer descuento: mes</label>
              <select class="entrada" id="prestamo-mes" (change)="primerMes.set($any($event.target).value)">
                @for (m of meses; track m; let i = $index) { <option [value]="i + 1" [selected]="'' + (i + 1) === primerMes()">{{ m }}</option> }
              </select>
            </div>
            <div class="campo">
              <label for="prestamo-anio">Primer descuento: año</label>
              <input class="entrada" id="prestamo-anio" type="number" step="1" min="2020" max="2100"
                     [value]="primerAnio()" (input)="primerAnio.set($any($event.target).value)" />
            </div>
            <div class="campo c2">
              <label for="prestamo-obs">Observación (opcional)</label>
              <input class="entrada" id="prestamo-obs" type="text" maxlength="200"
                     [value]="observacion()" (input)="observacion.set($any($event.target).value)" />
            </div>
            <div class="acciones">
              <button class="boton" [disabled]="trabajando()">Registrar préstamo</button>
            </div>
          </form>
        </div>
      </section>
    }
  `,
})
export class Prestamos {
  protected readonly sesion = inject(Sesion);
  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);

  protected readonly lista = httpResource<Prestamo[]>(() => '/api/prestamos');
  private readonly datos = valorSeguro(this.lista);
  private readonly recursoEmpleados = httpResource<Empleado[]>(() => '/api/empleados');
  private readonly todos = valorSeguro(this.recursoEmpleados);

  protected readonly tipos = TIPOS;
  protected readonly meses = MESES;
  protected readonly prestamos = computed(() => this.datos() ?? []);
  /** Solo a quienes siguen en la empresa se les puede abrir un préstamo. */
  protected readonly empleados = computed(() => (this.todos() ?? []).filter((e) => e.activo));

  private readonly hoy = new Date();
  protected readonly empleadoId = signal('');
  protected readonly tipo = signal<TipoPrestamo>('quirografario');
  protected readonly cuota = signal('');
  protected readonly cuotas = signal('');
  protected readonly primerMes = signal(String(this.hoy.getMonth() + 1));
  protected readonly primerAnio = signal(String(this.hoy.getFullYear()));
  protected readonly observacion = signal('');
  protected readonly trabajando = signal(false);
  protected readonly porEliminar = signal<number | null>(null);

  protected etiquetaTipo(tipo: TipoPrestamo): string {
    return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
  }

  protected mes(anio: number, mes: number): string {
    return `${MESES[mes - 1]} de ${anio}`;
  }

  /** Corre una escritura, avisa el resultado y vuelve a pedir la lista. */
  private async hacer(trabajo: () => Promise<unknown>, exito: string): Promise<boolean> {
    this.avisos.limpiar();
    this.trabajando.set(true);
    try {
      await trabajo();
      this.avisos.exito(exito);
      return true;
    } catch (error) {
      this.avisos.errorHttp(error);
      return false;
    } finally {
      this.trabajando.set(false);
      this.lista.reload();
    }
  }

  protected async agregar() {
    const ok = await this.hacer(
      () =>
        firstValueFrom(
          this.api.crearPrestamo({
            empleadoId: Number(this.empleadoId()),
            tipo: this.tipo(),
            cuota: Number(this.cuota()),
            cuotas: Number(this.cuotas()),
            primerAnio: Number(this.primerAnio()),
            primerMes: Number(this.primerMes()),
            observacion: this.observacion(),
          }),
        ),
      'Préstamo registrado.',
    );
    if (ok) {
      this.empleadoId.set('');
      this.cuota.set('');
      this.cuotas.set('');
      this.observacion.set('');
    }
  }

  protected alternar(p: Prestamo) {
    return this.hacer(
      () => firstValueFrom(this.api.cambiarEstadoPrestamo(p.id)),
      p.activo ? `Préstamo de ${p.nombres} suspendido: ya no se descuenta.` : `Préstamo de ${p.nombres} reanudado.`,
    );
  }

  protected async eliminar(p: Prestamo) {
    await this.hacer(() => firstValueFrom(this.api.eliminarPrestamo(p.id)), `Préstamo de ${p.nombres} eliminado.`);
    this.porEliminar.set(null);
  }
}
