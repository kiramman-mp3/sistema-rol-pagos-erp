import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, valorSeguro } from '../../core/api';
import { Avisos } from '../../core/avisos';
import type { Empleado, PeriodoVacaciones, SaldoVacaciones } from '../../core/modelos';
import { Sesion } from '../../core/sesion';

/** Vacaciones gozadas de cada empleado y los días que le quedan. */
@Component({
  selector: 'app-vacaciones',
  styles: `
    .confirmar { display: inline-flex; align-items: center; gap: .25rem; font-size: .9rem; font-weight: 600; color: var(--descuentos); }
    .debe { color: var(--descuentos); font-weight: 700; }
  `,
  template: `
    <div class="encabezado">
      <div>
        <h1>Vacaciones</h1>
        <p class="apoyo">
          Los días se devengan cada mes según el régimen de la persona (15 al año en el Código del Trabajo, 30 en la
          LOSEP). El saldo es lo devengado menos lo que ya tomó.
        </p>
      </div>
    </div>

    <section class="hoja" aria-labelledby="titulo-saldos">
      <div class="hoja-titulo"><h2 id="titulo-saldos">Saldo de cada persona</h2></div>
      <div class="deslizable">
        <table class="tabla" id="tabla-saldos">
          <thead>
            <tr>
              <th>Empleado</th>
              <th class="num">Días al año</th>
              <th class="num">Devengados</th>
              <th class="num">Gozados</th>
              <th class="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            @for (s of saldos(); track s.empleadoId) {
              <tr>
                <td>{{ s.nombres }} <span class="secundario">Ingresó el {{ s.fechaIngreso }}</span></td>
                <td class="num">{{ s.diasPorAnio }}</td>
                <td class="num">{{ s.devengados }}</td>
                <td class="num">{{ s.gozados }}</td>
                <td class="num" [class.debe]="s.saldo < 0"><strong>{{ s.saldo }}</strong></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="tabla-vacia">{{ listaSaldos.isLoading() ? 'Cargando saldos…' : listaSaldos.error() ? 'No se pudo cargar la lista.' : 'No hay empleados activos.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="hoja-cuerpo pequeno apoyo">
        Los días de un periodo son días calendario, con el primero y el último incluidos. No se suman los días
        adicionales por antigüedad.
      </div>
    </section>

    <section class="hoja" aria-labelledby="titulo-periodos">
      <div class="hoja-titulo"><h2 id="titulo-periodos">Periodos gozados</h2></div>
      <div class="deslizable">
        <table class="tabla" id="tabla-periodos">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th class="num">Días</th>
              <th><span class="solo-lectura">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of periodos(); track p.id) {
              <tr>
                <td>
                  {{ p.nombres }}
                  @if (p.observacion) { <span class="secundario">{{ p.observacion }}</span> }
                </td>
                <td>{{ p.desde }}</td>
                <td>{{ p.hasta }}</td>
                <td class="num">{{ p.dias }}</td>
                <td class="num">
                  @if (porEliminar() === p.id) {
                    <span class="confirmar" role="alert">
                      ¿Eliminar estas vacaciones de {{ p.nombres }}?
                      <button class="boton-texto boton-peligro" type="button" (click)="eliminar(p)">Sí, eliminar</button>
                      <button class="boton-texto" type="button" (click)="porEliminar.set(null)">No</button>
                    </span>
                  } @else if (sesion.puede('editar')) {
                    <button class="boton-texto boton-peligro" type="button" (click)="porEliminar.set(p.id)">Eliminar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="tabla-vacia">{{ listaPeriodos.isLoading() ? 'Cargando vacaciones…' : listaPeriodos.error() ? 'No se pudo cargar la lista.' : 'Todavía no hay vacaciones registradas.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (sesion.puede('editar')) {
      <section class="hoja" aria-labelledby="titulo-nuevo">
        <div class="hoja-titulo">
          <h2 id="titulo-nuevo">Registrar vacaciones</h2>
          <p>Si ya tomó más días de los devengados, se registra igual y se avisa.</p>
        </div>
        <div class="hoja-cuerpo">
          <form class="formulario" (submit)="$event.preventDefault(); agregar()">
            <div class="campo c2">
              <label for="vacaciones-empleado">Empleado</label>
              <select class="entrada" id="vacaciones-empleado" (change)="empleadoId.set($any($event.target).value)">
                <option value="">Elige quién sale de vacaciones</option>
                @for (e of empleados(); track e.id) {
                  <option [value]="e.id" [selected]="'' + e.id === empleadoId()">{{ e.nombres }}</option>
                }
              </select>
            </div>
            <div class="campo">
              <label for="vacaciones-desde">Desde</label>
              <input class="entrada" id="vacaciones-desde" type="date"
                     [value]="desde()" (input)="desde.set($any($event.target).value)" />
            </div>
            <div class="campo">
              <label for="vacaciones-hasta">Hasta</label>
              <input class="entrada" id="vacaciones-hasta" type="date"
                     [value]="hasta()" (input)="hasta.set($any($event.target).value)" />
            </div>
            <div class="campo c2">
              <label for="vacaciones-obs">Observación (opcional)</label>
              <input class="entrada" id="vacaciones-obs" type="text" maxlength="200"
                     [value]="observacion()" (input)="observacion.set($any($event.target).value)" />
            </div>
            <div class="acciones">
              <button class="boton" [disabled]="trabajando()">Registrar vacaciones</button>
            </div>
          </form>
        </div>
      </section>
    }
  `,
})
export class Vacaciones {
  protected readonly sesion = inject(Sesion);
  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);

  protected readonly listaSaldos = httpResource<SaldoVacaciones[]>(() => '/api/vacaciones/saldos');
  protected readonly listaPeriodos = httpResource<PeriodoVacaciones[]>(() => '/api/vacaciones');
  private readonly recursoEmpleados = httpResource<Empleado[]>(() => '/api/empleados');
  private readonly datosSaldos = valorSeguro(this.listaSaldos);
  private readonly datosPeriodos = valorSeguro(this.listaPeriodos);
  private readonly todos = valorSeguro(this.recursoEmpleados);

  protected readonly saldos = computed(() => this.datosSaldos() ?? []);
  protected readonly periodos = computed(() => this.datosPeriodos() ?? []);
  /** Solo quienes siguen en la empresa pueden salir de vacaciones. */
  protected readonly empleados = computed(() => (this.todos() ?? []).filter((e) => e.activo));

  protected readonly empleadoId = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly observacion = signal('');
  protected readonly trabajando = signal(false);
  protected readonly porEliminar = signal<number | null>(null);

  /** Corre una escritura y vuelve a pedir las dos listas, porque cambia el saldo. */
  private async hacer(trabajo: () => Promise<unknown>): Promise<boolean> {
    this.avisos.limpiar();
    this.trabajando.set(true);
    try {
      await trabajo();
      return true;
    } catch (error) {
      this.avisos.errorHttp(error);
      return false;
    } finally {
      this.trabajando.set(false);
      this.listaPeriodos.reload();
      this.listaSaldos.reload();
    }
  }

  protected async agregar() {
    const ok = await this.hacer(async () => {
      const r = await firstValueFrom(
        this.api.registrarVacaciones({
          empleadoId: Number(this.empleadoId()),
          desde: this.desde(),
          hasta: this.hasta(),
          observacion: this.observacion(),
        }),
      );
      this.avisos.exito(`Vacaciones registradas: ${r.dias} días de ${r.nombres}.`);
      r.avisos.forEach((a) => this.avisos.aviso(a));
    });
    if (ok) {
      this.empleadoId.set('');
      this.desde.set('');
      this.hasta.set('');
      this.observacion.set('');
    }
  }

  protected async eliminar(p: PeriodoVacaciones) {
    await this.hacer(async () => {
      await firstValueFrom(this.api.eliminarVacaciones(p.id));
      this.avisos.exito(`Vacaciones de ${p.nombres} eliminadas.`);
    });
    this.porEliminar.set(null);
  }
}
