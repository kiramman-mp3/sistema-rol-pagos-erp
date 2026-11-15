import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, valorSeguro } from '../../core/api';
import { Avisos } from '../../core/avisos';
import type { DatosCuenta, ListaUsuarios, UsuarioCuenta } from '../../core/modelos';
import { Sesion } from '../../core/sesion';

type Rol = UsuarioCuenta['rol'];

const DESCRIPCION: Record<Rol, string> = {
  administrador: 'Todo: cambia datos, genera roles, los aprueba, publica y paga, y gestiona usuarios.',
  aprobador: 'Consulta, valida, aprueba y publica roles. No cambia datos ni marca pagos.',
  lector: 'Solo consulta.',
};

/** Usuarios de la cuenta, sus roles y la regla de separación de funciones. Solo para administradores. */
@Component({
  selector: 'app-usuarios',
  styles: `
    .confirmar { display: inline-flex; align-items: center; gap: .25rem; font-size: .9rem; font-weight: 600; color: var(--descuentos); }
    .opcion { display: inline-flex; align-items: center; gap: .6rem; font-weight: 600; }
  `,
  template: `
    <div class="encabezado">
      <div>
        <h1>Usuarios</h1>
        <p class="apoyo">Quién puede entrar a la cuenta de {{ sesion.empresa()?.nombre }} y qué puede hacer.</p>
      </div>
    </div>

    <section class="hoja" aria-labelledby="titulo-lista">
      <div class="hoja-titulo"><h2 id="titulo-lista">Personas con acceso</h2></div>
      <div class="deslizable">
        <table class="tabla">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Rol</th>
              <th><span class="solo-lectura">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (u of usuarios(); track u.id) {
              <tr>
                <td>
                  {{ u.email }}
                  @if (u.email === sesion.email()) { <span class="insignia insignia-suave">tú</span> }
                </td>
                <td>
                  <select class="entrada" [value]="u.rol" [attr.aria-label]="'Rol de ' + u.email"
                          (change)="cambiarRol(u, $any($event.target).value)">
                    @for (r of roles(); track r) { <option [value]="r" [selected]="r === u.rol">{{ r }}</option> }
                  </select>
                </td>
                <td class="num">
                  @if (conClave() === u.id) {
                    <input class="entrada" type="password" autocomplete="new-password" placeholder="Contraseña nueva"
                           [attr.aria-label]="'Contraseña nueva de ' + u.email" #nueva />
                    <button class="boton-texto" type="button" (click)="cambiarClave(u, nueva.value)">Guardar</button>
                    <button class="boton-texto" type="button" (click)="conClave.set(null)">Cancelar</button>
                  } @else if (porEliminar() === u.id) {
                    <span class="confirmar" role="alert">
                      ¿Eliminar a {{ u.email }}?
                      <button class="boton-texto boton-peligro" type="button" (click)="eliminar(u)">Sí, eliminar</button>
                      <button class="boton-texto" type="button" (click)="porEliminar.set(null)">No</button>
                    </span>
                  } @else {
                    <button class="boton-texto" type="button" (click)="conClave.set(u.id)">Nueva contraseña</button>
                    @if (u.email !== sesion.email()) {
                      <button class="boton-texto boton-peligro" type="button" (click)="porEliminar.set(u.id)">Eliminar</button>
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="tabla-vacia">{{ lista.isLoading() ? 'Cargando usuarios…' : 'No se pudo cargar la lista.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="hoja-cuerpo pequeno apoyo">
        <ul class="sin-vinetas">
          @for (r of roles(); track r) { <li><strong>{{ r }}:</strong> {{ descripcion(r) }}</li> }
        </ul>
      </div>
    </section>

    <section class="hoja" aria-labelledby="titulo-nuevo">
      <div class="hoja-titulo">
        <h2 id="titulo-nuevo">Agregar un usuario</h2>
        <p>
          El sistema no envía correos: defines la contraseña inicial y se la entregas a la persona. Si la pierde,
          le pones una nueva desde esta pantalla.
        </p>
      </div>
      <div class="hoja-cuerpo">
        <form class="formulario" (submit)="$event.preventDefault(); agregar()">
          <div class="campo c2">
            <label for="usuario-email">Correo</label>
            <input class="entrada" id="usuario-email" type="email" autocomplete="off"
                   [value]="email()" (input)="email.set($any($event.target).value)" />
          </div>
          <div class="campo c2">
            <label for="usuario-clave">Contraseña (mínimo 10 caracteres)</label>
            <input class="entrada" id="usuario-clave" type="password" autocomplete="new-password"
                   [value]="clave()" (input)="clave.set($any($event.target).value)" />
          </div>
          <div class="campo c2">
            <label for="usuario-rol">Rol</label>
            <select class="entrada" id="usuario-rol" [value]="rolNuevo()" (change)="rolNuevo.set($any($event.target).value)">
              @for (r of roles(); track r) { <option [value]="r" [selected]="r === rolNuevo()">{{ r }}</option> }
            </select>
          </div>
          <div class="acciones">
            <button class="boton" [disabled]="trabajando()">Agregar usuario</button>
          </div>
        </form>
      </div>
    </section>

    <section class="hoja" aria-labelledby="titulo-separacion">
      <div class="hoja-titulo">
        <h2 id="titulo-separacion">Separación de funciones</h2>
        <p>
          Con esta regla, quien generó un rol no puede aprobarlo ni publicarlo: lo debe hacer otra persona.
          Requiere al menos dos usuarios que puedan aprobar.
        </p>
      </div>
      <div class="hoja-cuerpo">
        <label class="opcion">
          <input type="checkbox" [checked]="separar()" [disabled]="trabajando() || !cuenta()"
                 (change)="cambiarSeparacion($any($event.target).checked)" />
          Quien genera el rol no puede aprobarlo ni publicarlo
        </label>
      </div>
    </section>
  `,
})
export class Usuarios {
  protected readonly sesion = inject(Sesion);
  private readonly api = inject(Api);
  private readonly avisos = inject(Avisos);

  protected readonly lista = httpResource<ListaUsuarios>(() => '/api/usuarios');
  private readonly datos = valorSeguro(this.lista);
  private readonly cuentaRecurso = httpResource<DatosCuenta>(() => '/api/cuenta');
  protected readonly cuenta = valorSeguro(this.cuentaRecurso);

  protected readonly usuarios = computed(() => this.datos()?.usuarios ?? []);
  protected readonly roles = computed(() => this.datos()?.roles ?? []);
  protected readonly separar = computed(() => this.cuenta()?.separarFunciones ?? false);

  protected readonly email = signal('');
  protected readonly clave = signal('');
  protected readonly rolNuevo = signal<Rol>('lector');
  protected readonly trabajando = signal(false);
  protected readonly conClave = signal<number | null>(null);
  protected readonly porEliminar = signal<number | null>(null);

  protected descripcion(rol: Rol): string {
    return DESCRIPCION[rol];
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
      () => firstValueFrom(this.api.crearUsuario({ email: this.email(), clave: this.clave(), rol: this.rolNuevo() })),
      'Usuario agregado.',
    );
    if (ok) {
      this.email.set('');
      this.clave.set('');
    }
  }

  protected cambiarRol(u: UsuarioCuenta, rol: Rol) {
    return this.hacer(() => firstValueFrom(this.api.cambiarUsuario(u.id, { rol })), `${u.email} ahora es ${rol}.`);
  }

  protected async cambiarClave(u: UsuarioCuenta, clave: string) {
    if (await this.hacer(() => firstValueFrom(this.api.cambiarUsuario(u.id, { clave })), `Contraseña de ${u.email} cambiada.`)) {
      this.conClave.set(null);
    }
  }

  protected async eliminar(u: UsuarioCuenta) {
    await this.hacer(() => firstValueFrom(this.api.eliminarUsuario(u.id)), `${u.email} ya no tiene acceso.`);
    this.porEliminar.set(null);
  }

  protected async cambiarSeparacion(activa: boolean) {
    const empresa = this.cuenta();
    if (!empresa) return;
    await this.hacer(
      () => firstValueFrom(this.api.guardarCuenta({ empresa: empresa.nombre, ruc: empresa.ruc, separarFunciones: activa })),
      activa ? 'Separación de funciones activada.' : 'Separación de funciones desactivada.',
    );
    this.cuentaRecurso.reload();
  }
}
