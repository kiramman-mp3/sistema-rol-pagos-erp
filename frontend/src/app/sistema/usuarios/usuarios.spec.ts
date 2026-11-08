import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Avisos } from '../../core/avisos';
import { Sesion } from '../../core/sesion';
import { Usuarios } from './usuarios';

const LISTA = {
  roles: ['administrador', 'aprobador', 'lector'],
  usuarios: [
    { id: 1, email: 'ana@empresa.com', rol: 'administrador', creadoEn: '2026-10-01T10:00:00' },
    { id: 2, email: 'beto@empresa.com', rol: 'lector', creadoEn: '2026-10-02T10:00:00' },
  ],
};
const CUENTA = { nombre: 'Casa Demo', ruc: '1790010937001', separarFunciones: false };

describe('Usuarios', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const sesion = TestBed.inject(Sesion);
    sesion.email.set('ana@empresa.com');
    sesion.empresa.set({ nombre: 'Casa Demo', ruc: '1790010937001' });
  });

  const abrir = async () => {
    const fixture = TestBed.createComponent(Usuarios);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/usuarios').flush(LISTA);
    http.expectOne('/api/cuenta').flush(CUENTA);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  /** Deja que termine el `await` de la escritura y responde a la recarga de la lista. */
  const recargar = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/usuarios').flush(LISTA);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const boton = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

  it('lista a las personas con su rol y marca a quien está dentro', async () => {
    const { el } = await abrir();
    const filas = [...el.querySelectorAll('tbody tr')];
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('ana@empresa.com');
    expect(filas[0].textContent).toContain('tú');
    expect(filas[1].querySelector<HTMLSelectElement>('select')!.value).toBe('lector');
  });

  it('no ofrece eliminarse a uno mismo', async () => {
    const { el } = await abrir();
    const filas = [...el.querySelectorAll('tbody tr')];
    expect(filas[0].textContent).not.toContain('Eliminar');
    expect(filas[1].textContent).toContain('Eliminar');
  });

  it('agrega un usuario con su correo, contraseña y rol', async () => {
    const { fixture, el } = await abrir();
    const poner = (id: string, valor: string) => {
      const campo = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event(campo.tagName === 'SELECT' ? 'change' : 'input'));
    };
    poner('usuario-email', 'nueva@empresa.com');
    poner('usuario-clave', 'una-clave-larga-1');
    poner('usuario-rol', 'aprobador');
    fixture.detectChanges(); // en el navegador, cada tecla refresca la pantalla
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const pedido = http.expectOne('/api/usuarios');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toEqual({ email: 'nueva@empresa.com', clave: 'una-clave-larga-1', rol: 'aprobador' });
    pedido.flush({ id: 3, email: 'nueva@empresa.com', rol: 'aprobador', creadoEn: '' }, { status: 201, statusText: 'Created' });
    await recargar(fixture);
    expect(el.querySelector<HTMLInputElement>('#usuario-clave')!.value).toBe('');
  });

  it('cambia el rol de alguien con un PATCH', async () => {
    const { fixture, el } = await abrir();
    const select = el.querySelectorAll<HTMLSelectElement>('tbody select')[1];
    select.value = 'aprobador';
    select.dispatchEvent(new Event('change'));
    const pedido = http.expectOne('/api/usuarios/2');
    expect(pedido.request.method).toBe('PATCH');
    expect(pedido.request.body).toEqual({ rol: 'aprobador' });
    pedido.flush({ ...LISTA.usuarios[1], rol: 'aprobador' });
    await recargar(fixture);
  });

  it('eliminar pide confirmación antes de llamar a la API', async () => {
    const { fixture, el } = await abrir();
    boton(el, 'Eliminar').click();
    fixture.detectChanges();
    http.expectNone('/api/usuarios/2');
    expect(el.textContent).toContain('¿Eliminar a beto@empresa.com?');
    boton(el, 'Sí, eliminar').click();
    const pedido = http.expectOne('/api/usuarios/2');
    expect(pedido.request.method).toBe('DELETE');
    pedido.flush(null, { status: 204, statusText: 'No Content' });
    await recargar(fixture);
  });

  it('cambia la contraseña de otra persona', async () => {
    const { fixture, el } = await abrir();
    el.querySelectorAll<HTMLButtonElement>('tbody button')[0].click(); // «Nueva contraseña» de la primera fila
    fixture.detectChanges();
    const campo = el.querySelector<HTMLInputElement>('tbody input[type="password"]')!;
    campo.value = 'otra-clave-larga-9';
    boton(el, 'Guardar').click();
    const pedido = http.expectOne('/api/usuarios/1');
    expect(pedido.request.body).toEqual({ clave: 'otra-clave-larga-9' });
    pedido.flush(LISTA.usuarios[0]);
    await recargar(fixture);
  });

  it('activa la separación de funciones guardando la cuenta con el valor nuevo', async () => {
    const { fixture, el } = await abrir();
    const casilla = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(casilla.checked).toBe(false);
    casilla.checked = true;
    casilla.dispatchEvent(new Event('change'));
    const pedido = http.expectOne('/api/cuenta');
    expect(pedido.request.method).toBe('PUT');
    expect(pedido.request.body).toEqual({ empresa: 'Casa Demo', ruc: '1790010937001', separarFunciones: true });
    pedido.flush({ ...CUENTA, separarFunciones: true });
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/usuarios').flush(LISTA);
    http.expectOne('/api/cuenta').flush({ ...CUENTA, separarFunciones: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  });

  it('muestra el motivo cuando el servidor rechaza el cambio', async () => {
    const { fixture, el } = await abrir();
    const select = el.querySelectorAll<HTMLSelectElement>('tbody select')[0];
    select.value = 'lector';
    select.dispatchEvent(new Event('change'));
    http.expectOne('/api/usuarios/1').flush(
      { errores: ['La cuenta debe conservar al menos un administrador.'] },
      { status: 409, statusText: 'Conflict' },
    );
    await recargar(fixture);
    expect(TestBed.inject(Avisos).lista()[0].texto).toContain('al menos un administrador');
  });
});
