import { httpResource } from '@angular/common/http';
import { PercentPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api, ParametrosLey, valorSeguro } from '../../core/api';
import { Avisos } from '../../core/avisos';
import { Sesion } from '../../core/sesion';
import type { Permiso } from '../../core/sesion';
import { DineroPipe, sumar } from '../../core/dinero.pipe';
import { DesgloseCalculo } from './desglose';
import { claseEstado, esInmutable, ESTADOS_ROL, etiquetaEstado } from '../../core/estado-rol';
import { etiquetaRegimen } from '../../core/regimen';
import type {
  CambioReliquidacion, EventoRol, Modalidad, PlanillaIess, RevisionRol, RolCompleto, RolDetalle,
} from '../../core/modelos';

type Accion = 'validar' | 'aprobar' | 'publicar' | 'pagar';

/** Qué paso sigue en cada estado y cómo se llama su botón. */
const SIGUIENTE: Record<string, { accion: Accion; permiso: Permiso; texto: string; trabajando: string; hecho: string } | undefined> = {
  calculado: { accion: 'validar', permiso: 'validar', texto: 'Validar el rol', trabajando: 'Validando…', hecho: 'Rol validado: todo cuadra.' },
  validado: { accion: 'aprobar', permiso: 'aprobar', texto: 'Aprobar', trabajando: 'Aprobando…', hecho: 'Rol aprobado.' },
  aprobado: { accion: 'publicar', permiso: 'publicar', texto: 'Publicar', trabajando: 'Publicando…', hecho: 'Rol publicado. Ya no se puede recalcular.' },
  publicado: { accion: 'pagar', permiso: 'pagar', texto: 'Marcar como pagado', trabajando: 'Guardando…', hecho: 'Rol marcado como pagado.' },
};

/** Lo que se puede corregir de cada empleado al reliquidar un rol. */
const CAMPOS_AJUSTE = [
  { clave: 'sueldoBase', etiqueta: 'Sueldo base' },
  { clave: 'horasSuplementarias', etiqueta: 'H. suplementarias' },
  { clave: 'horasExtraordinarias', etiqueta: 'H. extraordinarias' },
  { clave: 'horasDescanso', etiqueta: 'H. sáb., dom. y feriado' },
  { clave: 'horasNocturnas', etiqueta: 'H. nocturnas' },
  { clave: 'comisiones', etiqueta: 'Comisiones' },
  { clave: 'otrosDescuentos', etiqueta: 'Otros descuentos' },
] as const;

const TEXTO_EVENTO: Record<string, string> = {
  'rol.ajuste_creado': 'Ajuste creado',
  'rol.calculado': 'Calculado',
  'rol.validado': 'Validado',
  'rol.validacion_rechazada': 'Validación rechazada',
  'rol.aprobado': 'Aprobado',
  'rol.publicado': 'Publicado',
  'rol.pagado': 'Pagado',
};

@Component({
  selector: 'app-detalle-rol',
  imports: [RouterLink, DineroPipe, PercentPipe, DesgloseCalculo],
  styles: `
    .volver { margin-left: -.5rem; }
    h1 .insignia { vertical-align: middle; margin-left: .4rem; font-family: var(--cuerpo); letter-spacing: 0; }
    .saltos { display: flex; gap: .5rem; flex-wrap: wrap; margin: -.5rem 0 1.25rem; }
    .saltos a {
      font-weight: 700; font-size: .875rem; text-decoration: none; color: var(--noche);
      background: var(--hoja); border: 1.5px solid var(--linea); border-radius: 999px; padding: .4rem .9rem;
    }
    .saltos a:hover { border-color: var(--marca); background: var(--ingresos-fondo); }
    .ciclo { list-style: none; display: flex; gap: .5rem; flex-wrap: wrap; margin: 0 0 1rem; padding: 0; }
    .ciclo li {
      font-size: .85rem; font-weight: 700; color: var(--tinta-suave);
      border: 1.5px dashed var(--linea); border-radius: 999px; padding: .3rem .85rem;
    }
    .ciclo li.hecho { border-style: solid; background: var(--neto-fondo); border-color: #b5e8cf; color: var(--neto); }
    .ciclo li.actual { border-style: solid; background: var(--sol); border-color: var(--sol); color: var(--tinta); }
    .revision { margin: 1rem 0 0; }
    .revision ul { margin: .4rem 0 0; padding-left: 1.2rem; }
    .historial { list-style: none; margin: 1.25rem 0 0; padding: 0; font-size: .9rem; }
    .historial li { padding: .3rem 0; border-top: 1px solid var(--linea-suave); }
    .confirmar { display: inline-flex; align-items: center; gap: .25rem; font-size: .9rem; font-weight: 600; color: var(--descuentos); }
  `,
  template: `
    @if (datos(); as r) {
      <div class="encabezado">
        <div>
          <a class="boton-texto volver no-imprimir" routerLink="/sistema/roles">‹ Roles de pago</a>
          <h1>@if (r.tipo === 'ajuste') {Ajuste de }{{ nombreMes() }} {{ r.anio }} <span class="insignia no-imprimir" [class]="clase(r.estado)">{{ etiqueta(r.estado) }}</span></h1>
          <p class="apoyo">
            {{ parametros()?.empresa?.nombre }}, RUC {{ parametros()?.empresa?.ruc }}.
            Generado el {{ fechaGeneracion(r.generadoEn) }}.
          </p>
        </div>
        <div class="acciones no-imprimir">
          <a class="boton boton-sol" [href]="'/api/roles/' + r.id + '/csv'" download>Descargar CSV</a>
          <a class="boton boton-claro" [href]="'/api/roles/' + r.id + '/iess.csv'" download>Aportes para el IESS</a>
          <button class="boton boton-claro" type="button" (click)="imprimir()">Imprimir</button>
          @if (!inmutable() && sesion.puede('editar')) {
            <a class="boton boton-claro" [routerLink]="['/sistema/roles/novedades', r.anio, r.mes]">Recalcular</a>
          }
          @if (inmutable()) {
            <span class="apoyo">Publicado: ya no se recalcula ni se elimina.</span>
          } @else if (!sesion.puede('editar')) {
            <!-- solo consulta -->
          } @else if (confirmandoEliminar()) {
            <span class="confirmar" role="alert">
              ¿Eliminar el rol de {{ nombreMes() }}?
              <button class="boton-texto boton-peligro" type="button" (click)="eliminar(r)">Sí, eliminar</button>
              <button class="boton-texto" type="button" (click)="confirmandoEliminar.set(false)">No</button>
            </span>
          } @else {
            <button class="boton-texto boton-peligro" type="button" (click)="confirmandoEliminar.set(true)">Eliminar rol</button>
          }
        </div>
      </div>

      @if (r.tipo === 'ajuste') {
        <div class="aviso aviso-warning" role="note">
          <strong>Ajuste</strong> al rol de {{ nombreMes() }}
          @if (r.origen; as o) { (<a [routerLink]="['/sistema/roles', o.id]">ver el rol original</a>) }.
          Motivo: {{ r.motivo }}. Las cifras son diferencias contra lo ya publicado: un valor negativo es un descuento.
        </div>
      }

      <nav class="saltos no-imprimir" aria-label="Secciones del rol">
        <a href="#titulo-planilla" (click)="ir($event, 'titulo-planilla')">Lo que recibe cada persona</a>
        <a href="#titulo-provisiones" (click)="ir($event, 'titulo-provisiones')">Costo empleador</a>
        <a href="#titulo-iess" (click)="ir($event, 'titulo-iess')">Conciliación con el IESS</a>
      </nav>

      <div class="hoja no-imprimir" role="group" aria-labelledby="titulo-ciclo">
        <div class="hoja-titulo">
          <h2 id="titulo-ciclo">Ciclo del rol</h2>
          <p>
            Se valida, se aprueba y se publica. Un rol publicado ya no se puede recalcular ni eliminar, y cada
            paso queda registrado.
          </p>
        </div>
        <div class="hoja-cuerpo">
          <ol class="ciclo" aria-label="Estado del rol">
            @for (p of pasos; track p.estado; let i = $index) {
              <li [class.hecho]="i < indiceEstado()" [class.actual]="i === indiceEstado()"
                  [attr.aria-current]="i === indiceEstado() ? 'step' : null">{{ p.etiqueta }}</li>
            }
          </ol>

          @if (siguiente(); as paso) {
            @if (!sesion.puede(paso.permiso)) {
              <p class="apoyo" style="margin: 0">
                El siguiente paso es «{{ paso.texto }}»; tu rol no lo permite.
              </p>
            } @else if (confirmandoPublicar()) {
              <span class="confirmar" role="alert">
                ¿Publicar el rol de {{ nombreMes() }}? Ya no se podrá recalcular ni eliminar.
                <button class="boton-texto boton-peligro" type="button" [disabled]="trabajando()" (click)="avanzar(paso)">Sí, publicar</button>
                <button class="boton-texto" type="button" (click)="confirmandoPublicar.set(false)">No</button>
              </span>
            } @else {
              <button class="boton" type="button" [disabled]="trabajando()"
                      (click)="paso.accion === 'publicar' ? confirmandoPublicar.set(true) : avanzar(paso)">
                {{ trabajando() ? paso.trabajando : paso.texto }}
              </button>
            }
          } @else {
            <p class="apoyo" style="margin: 0">El rol está pagado: el ciclo terminó.</p>
          }

          @if (revision(); as v) {
            <div class="aviso revision" [class.aviso-success]="v.valido" [class.aviso-danger]="!v.valido" role="status">
              @if (v.valido) {
                El rol pasó la validación.
              } @else {
                No se puede validar el rol todavía:
                <ul>@for (e of v.errores; track $index) { <li>{{ e }}</li> }</ul>
              }
              @if (v.avisos.length) {
                <strong>Para revisar:</strong>
                <ul>@for (a of v.avisos; track $index) { <li>{{ a }}</li> }</ul>
              }
            </div>
          }

          @if (eventos(); as lista) {
            <ul class="historial" aria-label="Historial del rol">
              @for (e of lista; track $index) {
                <li><strong>{{ textoEvento(e) }}</strong> por {{ e.usuario }}, {{ fechaGeneracion(e.creadoEn) }}</li>
              }
            </ul>
          }
        </div>
      </div>

      @if (r.tipo === 'ordinario' && inmutable()) {
        <section class="hoja no-imprimir" aria-labelledby="titulo-ajustes">
          <div class="hoja-titulo">
            <h2 id="titulo-ajustes">Ajustes de este rol</h2>
            <p>Un rol publicado no se modifica. Si hubo un error, se corrige con un ajuste: un rol aparte que guarda solo la diferencia.</p>
          </div>
          <div class="hoja-cuerpo">
            @if (r.ajustes?.length) {
              <div class="deslizable">
                <table class="tabla">
                  <thead><tr><th>Ajuste</th><th>Estado</th><th>Motivo</th><th class="num">Empleados</th><th class="num">Diferencia en el neto</th></tr></thead>
                  <tbody>
                    @for (a of r.ajustes; track a.id) {
                      <tr>
                        <td><a [routerLink]="['/sistema/roles', a.id]">Rol {{ a.id }}</a>, {{ fechaGeneracion(a.generadoEn) }}</td>
                        <td><span class="insignia" [class]="clase(a.estado)">{{ etiqueta(a.estado) }}</span></td>
                        <td>{{ a.motivo }}</td>
                        <td class="num">{{ a.numEmpleados }}</td>
                        <td class="num">{{ a.totalNeto | dinero }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (r.consolidado; as c) {
                <p class="apoyo">Con los ajustes ya publicados, el mes queda en {{ c.totalNeto | dinero }} de neto a pagar y {{ c.totalCosto | dinero }} de costo del empleador.</p>
              }
            } @else {
              <p class="apoyo">Este rol no tiene ajustes.</p>
            }

            @if (sesion.puede('editar')) {
              @if (!reliquidando()) {
                <button class="boton boton-claro" type="button" (click)="abrirReliquidacion()">Reliquidar este rol</button>
              } @else {
                <form (submit)="enviarReliquidacion($event)">
                  <div class="campo">
                    <label for="motivo-ajuste">Motivo del ajuste</label>
                    <textarea id="motivo-ajuste" class="entrada" rows="2" maxlength="500" [value]="motivo()" (input)="motivo.set(texto($event))"></textarea>
                  </div>
                  <p class="apoyo">
                    Cambia solo lo que estuvo mal; el resto se calcula igual que en el rol original, con las reglas de ley de ese mes
                    (si corregiste una regla, el ajuste la recoge sin que cambies nada aquí).
                  </p>
                  <div class="deslizable">
                    <table class="tabla">
                      <thead>
                        <tr>
                          <th>Empleado</th>
                          @for (c of camposAjuste; track c.clave) { <th class="num">{{ c.etiqueta }}</th> }
                        </tr>
                      </thead>
                      <tbody>
                        @for (v of r.vigente; track v.cedula) {
                          <tr>
                            <td>{{ v.nombres }}</td>
                            @for (c of camposAjuste; track c.clave) {
                              <td class="num">
                                <input class="entrada num" type="number" step="0.01" min="0"
                                       [value]="valorCampo(v, c.clave)" (input)="cambiar(v.cedula, c.clave, $event)"
                                       [attr.aria-label]="c.etiqueta + ' de ' + v.nombres" />
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="acciones">
                    <button class="boton" [disabled]="trabajando()">Crear el ajuste</button>
                    <button class="boton-texto" type="button" (click)="reliquidando.set(false)">Cancelar</button>
                  </div>
                </form>
              }
            }
          </div>
        </section>
      }

      <div class="franja">
        <div class="ecuacion" role="group" aria-label="Del ingreso al neto">
          <div class="termino termino-ingresos">
            <div class="etiqueta">Ingresos</div>
            <div class="cifra">{{ r.totalIngresos | dinero }}</div>
          </div>
          <span class="operador" aria-hidden="true">−</span>
          <div class="termino termino-descuentos">
            <div class="etiqueta">Descuentos</div>
            <div class="cifra">{{ r.totalDescuentos | dinero }}</div>
          </div>
          <span class="operador" aria-hidden="true">=</span>
          <div class="termino termino-neto">
            <div class="etiqueta">Neto a pagar a {{ r.numEmpleados }} empleados</div>
            <div class="cifra">{{ r.totalNeto | dinero }}</div>
          </div>
        </div>
        <div class="ecuacion ecuacion-provision" role="group" aria-label="Del ingreso al costo del empleador">
          <div class="termino termino-ingresos">
            <div class="etiqueta">Ingresos</div>
            <div class="cifra">{{ r.totalIngresos | dinero }}</div>
          </div>
          <span class="operador" aria-hidden="true">+</span>
          <div class="termino termino-provision">
            <div class="etiqueta">Provisiones del empleador</div>
            <div class="cifra">{{ r.totalProvisiones | dinero }}</div>
          </div>
          <span class="operador" aria-hidden="true">=</span>
          <div class="termino termino-costo">
            <div class="etiqueta">Costo total del empleador</div>
            <div class="cifra">{{ r.totalCosto | dinero }}</div>
          </div>
        </div>
      </div>

      <section class="hoja" aria-labelledby="titulo-planilla">
        <div class="hoja-titulo">
          <h2 id="titulo-planilla">Lo que recibe cada empleado</h2>
          <p>Haz clic en un nombre para abrir su boleta imprimible.</p>
        </div>
        <div class="deslizable">
          <table class="tabla planilla">
            <thead>
              <tr>
                <th rowspan="2">Empleado</th>
                <th colspan="5" class="g-ingresos t-ingresos corte">Ingresos</th>
                <th colspan="5" class="g-descuentos t-descuentos corte">Descuentos</th>
                <th rowspan="2" class="num g-neto c-neto corte"><span class="th-largo">Neto a recibir</span><span class="th-corto" aria-hidden="true">Neto</span></th>
              </tr>
              <tr>
                <th class="num corte">Sueldo</th>
                <th class="num"><span class="th-largo">Horas extra</span><span class="th-corto" aria-hidden="true">H. extra</span></th>
                <th class="num">Comisiones</th>
                <th class="num" title="Décimos y fondos de reserva que se pagan dentro del rol"><span class="th-largo">Décimos y fondos</span><span class="th-corto" aria-hidden="true">Déc. y fondos</span></th>
                <th class="num">Total</th>
                <th class="num corte"><span class="th-largo">Aporte IESS</span><span class="th-corto" aria-hidden="true">IESS</span></th>
                <th class="num"><span class="th-largo">Impuesto a la renta</span><span class="th-corto" aria-hidden="true">IR</span></th>
                <th class="num">Otros</th>
                <th class="num" title="Cuotas de préstamos del IESS"><span class="th-largo">Préstamos IESS</span><span class="th-corto" aria-hidden="true">Prést.</span></th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (d of r.detalle; track d.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/sistema/roles', r.id, 'boleta', d.id]">{{ d.nombres }}</a>
                    <span class="secundario">
                      {{ d.cargo }}@if (d.diasTrabajados < 30) {, {{ d.diasTrabajados }} días trabajados}
                    </span>
                    <span class="secundario">{{ regimen(d) }}</span>
                    @if (d.tieneTraza) {
                      <button class="boton-texto no-imprimir" type="button" [attr.aria-expanded]="calculoAbierto() === d.cedula"
                              (click)="alternarCalculo(d.cedula)">
                        {{ calculoAbierto() === d.cedula ? 'Ocultar el cálculo' : 'Cómo se calculó' }}
                      </button>
                    }
                  </td>
                  <td class="num corte">{{ d.sueldo | dinero }}</td>
                  <td class="num">{{ horasExtra(d) | dinero }}</td>
                  <td class="num">{{ d.comisiones | dinero }}</td>
                  <td class="num">{{ d.beneficiosMensuales | dinero }}</td>
                  <td class="num"><strong>{{ d.totalIngresos | dinero }}</strong></td>
                  <td class="num corte">
                    {{ d.aporteIess | dinero }}
                    <span class="secundario">{{ d.tasaIessPersonal | percent: '1.2-2' }}</span>
                  </td>
                  <td class="num">{{ d.impuestoRenta | dinero }}</td>
                  <td class="num">{{ d.otrosDescuentos | dinero }}</td>
                  <td class="num">{{ d.descuentoPrestamos | dinero }}</td>
                  <td class="num"><strong>{{ d.totalDescuentos | dinero }}</strong></td>
                  <td class="num c-neto corte">{{ d.netoPagar | dinero }}</td>
                </tr>
                @if (calculoAbierto() === d.cedula) {
                  <tr class="no-imprimir">
                    <td colspan="12"><app-desglose-calculo [rolId]="r.id" [cedula]="d.cedula" /></td>
                  </tr>
                }
              }
            </tbody>
            <tfoot>
              <tr>
                <td>Totales</td>
                <td class="num corte">{{ totales().sueldo | dinero }}</td>
                <td class="num">{{ totales().horasExtra | dinero }}</td>
                <td class="num">{{ totales().comisiones | dinero }}</td>
                <td class="num">{{ totales().beneficios | dinero }}</td>
                <td class="num">{{ r.totalIngresos | dinero }}</td>
                <td class="num corte">{{ totales().iess | dinero }}</td>
                <td class="num">{{ totales().impuesto | dinero }}</td>
                <td class="num">{{ totales().otros | dinero }}</td>
                <td class="num">{{ totales().prestamos | dinero }}</td>
                <td class="num">{{ r.totalDescuentos | dinero }}</td>
                <td class="num c-neto corte">{{ r.totalNeto | dinero }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="hoja hoja-provision" aria-labelledby="titulo-provisiones">
        <div class="hoja-titulo">
          <h2 id="titulo-provisiones">Costo empleador y provisiones</h2>
          <p>
            Lo paga la empresa aparte del neto. Los décimos y fondos que se pagan en el rol ya están en los
            ingresos; aquí solo aparecen los que el trabajador acumula.
          </p>
        </div>
        <div class="deslizable">
          <table class="tabla planilla">
            <thead>
              <tr>
                <th class="g-provision">Empleado</th>
                <th class="num g-provision"><span class="th-largo">Décimo tercero</span><span class="th-corto" aria-hidden="true">13.º</span></th>
                <th class="num g-provision"><span class="th-largo">Décimo cuarto</span><span class="th-corto" aria-hidden="true">14.º</span></th>
                <th class="num g-provision">Vacaciones</th>
                <th class="num g-provision"><span class="th-largo">Fondos de reserva</span><span class="th-corto" aria-hidden="true">Fondos</span></th>
                <th class="num g-provision"><span class="th-largo">Aporte patronal</span><span class="th-corto" aria-hidden="true">Patronal</span></th>
                <th class="num g-provision"><span class="th-largo">Total provisiones</span><span class="th-corto" aria-hidden="true">Total</span></th>
                <th class="num"><span class="th-largo">Costo empleador</span><span class="th-corto" aria-hidden="true">Costo</span></th>
              </tr>
            </thead>
            <tbody>
              @for (d of r.detalle; track d.id) {
                <tr>
                  <td>{{ d.nombres }}</td>
                  <td class="num">
                    @if (d.decimoTerceroModalidad === 'acumulado') { {{ d.decimoTercero | dinero }} }
                    @else { <span class="apoyo">{{ pagado(d.decimoTerceroModalidad) }}</span> }
                  </td>
                  <td class="num">
                    @if (d.decimoCuartoModalidad === 'acumulado') { {{ d.decimoCuarto | dinero }} }
                    @else { <span class="apoyo">{{ pagado(d.decimoCuartoModalidad) }}</span> }
                  </td>
                  <td class="num">{{ d.vacaciones | dinero }}</td>
                  <td class="num">
                    @if (d.fondosReservaModalidad === 'no') {
                      <span class="apoyo">No recibe</span>
                    } @else if (!d.fondosReserva) {
                      <span class="apoyo" title="Se generan desde el mes 13 de trabajo">Aún no aplica</span>
                    } @else if (d.fondosReservaModalidad === 'acumulado') {
                      {{ d.fondosReserva | dinero }}
                    } @else {
                      <span class="apoyo">{{ pagado(d.fondosReservaModalidad) }}</span>
                    }
                  </td>
                  <td class="num">
                    {{ d.aportePatronal | dinero }}
                    <span class="secundario">{{ d.tasaIessPatronal | percent: '1.2-2' }}</span>
                  </td>
                  <td class="num"><strong>{{ d.totalProvisiones | dinero }}</strong></td>
                  <td class="num"><strong>{{ d.costoEmpleador | dinero }}</strong></td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>Totales</td>
                <td class="num">{{ totales().decimoTercero | dinero }}</td>
                <td class="num">{{ totales().decimoCuarto | dinero }}</td>
                <td class="num">{{ totales().vacaciones | dinero }}</td>
                <td class="num">{{ totales().fondos | dinero }}</td>
                <td class="num">{{ totales().patronal | dinero }}</td>
                <td class="num">{{ r.totalProvisiones | dinero }}</td>
                <td class="num">{{ r.totalCosto | dinero }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="hoja-cuerpo pequeno apoyo">
          El décimo cuarto se calcula sobre el sueldo básico unificado ({{ parametros()?.sbu | dinero }}), el tercero
          sobre los ingresos aportables, las vacaciones sobre esos mismos ingresos según los días del régimen y los
          fondos de reserva desde el mes 13. El costo del empleador es el total de ingresos más estas provisiones.
        </div>
      </section>

      @if (iess(); as p) {
        <section class="hoja" aria-labelledby="titulo-iess">
          <div class="hoja-titulo">
            <h2 id="titulo-iess">Conciliación con el IESS</h2>
            <p>
              El IESS arma la planilla en su portal con tus avisos y novedades; no recibe un archivo. Descarga el
              comprobante del mes (se puede bajar en Excel) y compara, empleado por empleado, la materia gravada y
              los aportes de esta tabla.
            </p>
          </div>
          <div class="deslizable">
            <table class="tabla planilla">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th class="num"><span class="th-largo">Materia gravada</span><span class="th-corto" aria-hidden="true">Gravada</span></th>
                  <th class="num"><span class="th-largo">Aporte personal</span><span class="th-corto" aria-hidden="true">Personal</span></th>
                  <th class="num"><span class="th-largo">Aporte patronal</span><span class="th-corto" aria-hidden="true">Patronal</span></th>
                  <th class="num"><span class="th-largo">Total aportes</span><span class="th-corto" aria-hidden="true">Total</span></th>
                  <th class="num" title="Fondos de reserva que el trabajador acumula: se depositan en el IESS"><span class="th-largo">Fondos a depositar</span><span class="th-corto" aria-hidden="true">A depositar</span></th>
                  <th class="num" title="Fondos de reserva que ya se pagaron en el rol"><span class="th-largo">Fondos pagados en el rol</span><span class="th-corto" aria-hidden="true">Pagados en rol</span></th>
                </tr>
              </thead>
              <tbody>
                @for (f of p.filas; track f.cedula) {
                  <tr>
                    <td>{{ f.nombres }}<span class="secundario">{{ f.cedula }}</span></td>
                    <td class="num">{{ f.materiaGravada | dinero }}</td>
                    <td class="num">
                      {{ f.aportePersonal | dinero }}
                      <span class="secundario">{{ f.tasaPersonal | percent: '1.2-2' }}</span>
                    </td>
                    <td class="num">
                      {{ f.aportePatronal | dinero }}
                      <span class="secundario">{{ f.tasaPatronal | percent: '1.2-2' }}</span>
                    </td>
                    <td class="num"><strong>{{ f.totalAportes | dinero }}</strong></td>
                    <td class="num">{{ f.fondosADepositar | dinero }}</td>
                    <td class="num">{{ f.fondosPagadosEnRol | dinero }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>Totales</td>
                  <td class="num">{{ p.totales.materiaGravada | dinero }}</td>
                  <td class="num">{{ p.totales.aportePersonal | dinero }}</td>
                  <td class="num">{{ p.totales.aportePatronal | dinero }}</td>
                  <td class="num">{{ p.totales.totalAportes | dinero }}</td>
                  <td class="num">{{ p.totales.fondosADepositar | dinero }}</td>
                  <td class="num">{{ p.totales.fondosPagadosEnRol | dinero }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="hoja-cuerpo pequeno apoyo">
            La materia gravada es el sueldo, las horas extras y las comisiones: los décimos y los fondos de reserva
            pagados en el rol no la integran. Los décimos se declaran aparte, en el sistema de décimos del Ministerio
            del Trabajo, no en la planilla del IESS.
          </div>
        </section>
      }
    } @else if (rol.error()) {
      <div class="aviso aviso-danger" role="status">
        No se encontró este rol. Puede que se haya eliminado.
        <a routerLink="/sistema/roles">Volver a roles de pago</a>
      </div>
    } @else {
      <p class="apoyo">Cargando rol…</p>
    }
  `,
})
export class DetalleRol {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);
  protected readonly parametros = inject(ParametrosLey).valor;
  protected readonly rol = httpResource<RolCompleto>(() => `/api/roles/${this.id()}`);
  protected readonly datos = valorSeguro(this.rol);
  protected readonly iess = valorSeguro(httpResource<PlanillaIess>(() => `/api/roles/${this.id()}/iess`));

  protected readonly confirmandoEliminar = signal(false);
  protected readonly confirmandoPublicar = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly revision = signal<RevisionRol | null>(null);

  /** Cédula del empleado cuyo desglose está abierto. */
  protected readonly calculoAbierto = signal<string | null>(null);
  protected alternarCalculo(cedula: string) {
    this.calculoAbierto.update((actual) => (actual === cedula ? null : cedula));
  }

  protected readonly camposAjuste = CAMPOS_AJUSTE;
  protected readonly reliquidando = signal(false);
  protected readonly motivo = signal('');
  /** Lo escrito en la tabla del ajuste, por cédula y campo; lo que no se toca no se envía. */
  private readonly ediciones = signal<Record<string, Record<string, string>>>({});

  private readonly historialRol = httpResource<EventoRol[]>(() => `/api/roles/${this.id()}/historial`);
  protected readonly eventos = valorSeguro(this.historialRol);

  protected readonly pasos = ESTADOS_ROL;
  protected readonly etiqueta = etiquetaEstado;
  protected readonly clase = claseEstado;
  protected readonly inmutable = computed(() => esInmutable(this.datos()?.estado));
  protected readonly indiceEstado = computed(() => ESTADOS_ROL.findIndex((e) => e.estado === this.datos()?.estado));
  protected readonly siguiente = computed(() => SIGUIENTE[this.datos()?.estado ?? '']);

  protected readonly nombreMes = computed(
    () => this.parametros()?.meses[(this.datos()?.mes ?? 1) - 1] ?? '',
  );

  protected readonly totales = computed(() => {
    const d = this.datos()?.detalle ?? [];
    const suma = (campo: (x: RolDetalle) => number) => sumar(d.map(campo));
    return {
      sueldo: suma((x) => x.sueldo),
      horasExtra: suma((x) => this.horasExtra(x)),
      comisiones: suma((x) => x.comisiones),
      iess: suma((x) => x.aporteIess),
      impuesto: suma((x) => x.impuestoRenta),
      otros: suma((x) => x.otrosDescuentos),
      prestamos: suma((x) => x.descuentoPrestamos),
      beneficios: suma((x) => x.beneficiosMensuales),
      // En la tabla de provisiones solo cuenta lo que se acumula.
      decimoTercero: suma((x) => (x.decimoTerceroModalidad === 'acumulado' ? x.decimoTercero : 0)),
      decimoCuarto: suma((x) => (x.decimoCuartoModalidad === 'acumulado' ? x.decimoCuarto : 0)),
      vacaciones: suma((x) => x.vacaciones),
      fondos: suma((x) => (x.fondosReservaModalidad === 'acumulado' ? x.fondosReserva : 0)),
      patronal: suma((x) => x.aportePatronal),
    };
  });

  /** Qué decir en la tabla de provisiones cuando un beneficio no se provisiona. */
  protected pagado(modalidad: Modalidad): string {
    return modalidad === 'mensual' ? 'Pagado en el rol' : 'No recibe';
  }

  protected regimen(d: RolDetalle): string {
    return etiquetaRegimen(this.parametros()?.regimenes, d.regimen, d.regimenAplicado);
  }

  protected horasExtra(d: RolDetalle): number {
    return sumar([
      d.valorHorasSuplementarias, d.valorHorasExtraordinarias, d.valorHorasDescanso, d.valorRecargoNocturno,
    ]);
  }

  /** 2026-10-20T23:33:17 -> 20 de octubre de 2026, 23:33 */
  protected fechaGeneracion(iso: string): string {
    const f = new Date(iso);
    if (Number.isNaN(f.getTime())) return iso;
    const dia = f.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${dia}, ${iso.slice(11, 16)}`;
  }

  protected ir(evento: Event, id: string) {
    evento.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected imprimir() {
    window.print();
  }

  protected textoEvento(e: EventoRol): string {
    return TEXTO_EVENTO[e.accion] ?? e.accion;
  }

  protected abrirReliquidacion() {
    this.motivo.set('');
    this.ediciones.set({});
    this.reliquidando.set(true);
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected valorCampo(v: RolDetalle, clave: string): string {
    return this.ediciones()[v.cedula]?.[clave] ?? String((v as unknown as Record<string, number>)[clave]);
  }

  protected cambiar(cedula: string, clave: string, evento: Event) {
    const valor = this.texto(evento);
    this.ediciones.update((e) => ({ ...e, [cedula]: { ...e[cedula], [clave]: valor } }));
  }

  protected async enviarReliquidacion(evento: Event) {
    evento.preventDefault();
    const r = this.datos();
    if (!r) return;
    const cambios = (r.vigente ?? []).flatMap((v) => {
      const editado = this.ediciones()[v.cedula] ?? {};
      const cambio: CambioReliquidacion = { cedula: v.cedula };
      for (const { clave } of CAMPOS_AJUSTE) {
        const nuevo = editado[clave];
        if (nuevo !== undefined && nuevo !== String((v as unknown as Record<string, number>)[clave])) cambio[clave] = nuevo;
      }
      return Object.keys(cambio).length > 1 ? [cambio] : [];
    });
    this.avisos.limpiar();
    this.trabajando.set(true);
    try {
      const creado = await firstValueFrom(this.api.reliquidarRol(r.id, { motivo: this.motivo(), cambios }));
      this.reliquidando.set(false);
      this.avisos.exito('Ajuste creado. Recorre el mismo ciclo: valídalo, apruébalo y publícalo.');
      await this.router.navigate(['/sistema/roles', creado.id]);
    } catch (error) {
      this.avisos.errorHttp(error);
    } finally {
      this.trabajando.set(false);
    }
  }

  /** Da el paso siguiente del ciclo y refresca el rol y su historial. */
  protected async avanzar(paso: { accion: Accion; hecho: string }) {
    const id = Number(this.id());
    this.avisos.limpiar();
    this.trabajando.set(true);
    this.confirmandoPublicar.set(false);
    try {
      if (paso.accion === 'validar') {
        const r = await firstValueFrom(this.api.validarRol(id));
        this.revision.set(r);
        if (r.valido) this.avisos.exito(paso.hecho, true);
      } else {
        await firstValueFrom(
          paso.accion === 'aprobar'
            ? this.api.aprobarRol(id)
            : paso.accion === 'publicar'
              ? this.api.publicarRol(id)
              : this.api.pagarRol(id),
        );
        this.revision.set(null);
        this.avisos.exito(paso.hecho, paso.accion === 'publicar');
      }
    } catch (error) {
      this.avisos.errorHttp(error);
    } finally {
      this.trabajando.set(false);
      this.rol.reload();
      this.historialRol.reload();
    }
  }

  protected async eliminar(r: RolCompleto) {
    try {
      await firstValueFrom(this.api.eliminarRol(r.id));
      this.avisos.exito('Rol eliminado.');
      await this.router.navigateByUrl('/sistema/roles');
    } catch (error) {
      this.avisos.errorHttp(error);
    }
  }
}
