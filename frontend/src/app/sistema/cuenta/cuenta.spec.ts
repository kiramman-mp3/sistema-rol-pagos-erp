import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { Sesion } from '../../core/sesion';
import { Cuenta } from './cuenta';

@Component({ template: '' })
class Vacio {}

describe('Cuenta', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: Vacio }]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Sesion).empresa.set({ nombre: 'Casa Demo', ruc: '1790000028001' });
  });

  const abrir = () => {
    const f = TestBed.createComponent(Cuenta);
    f.detectChanges();
    return f;
  };
  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const escribir = (f: ComponentFixture<unknown>, id: string, valor: string) => {
    const campo = el(f).querySelector<HTMLInputElement>(`#${id}`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  };
  const pedirEliminar = (f: ComponentFixture<unknown>) => {
    el(f).querySelector<HTMLButtonElement>('.boton-peligro')!.click();
    f.detectChanges();
  };
  const enviar = (f: ComponentFixture<unknown>) => {
    el(f).querySelector('form')!.dispatchEvent(new Event('submit'));
    f.detectChanges();
  };

  it('ofrece descargar todos los datos', () => {
    const enlace = el(abrir()).querySelector<HTMLAnchorElement>('a[download]')!;
    expect(enlace.getAttribute('href')).toBe('/api/cuenta/exportar');
  });

  it('eliminar pide confirmar primero: no muestra el formulario hasta pulsar', () => {
    const f = abrir();
    expect(el(f).querySelector('form')).toBeNull();
    pedirEliminar(f);
    expect(el(f).querySelector('form')).not.toBeNull();
    expect(el(f).textContent).toContain('1790000028001');
    http.expectNone('/api/cuenta');
  });

  it('cancelar vuelve atrás sin pedir nada', () => {
    const f = abrir();
    pedirEliminar(f);
    el(f).querySelector<HTMLButtonElement>('.boton-texto')!.click();
    f.detectChanges();
    expect(el(f).querySelector('form')).toBeNull();
    http.expectNone('/api/cuenta');
  });

  it('sin el RUC y la contraseña no pide nada', () => {
    const f = abrir();
    pedirEliminar(f);
    enviar(f);
    http.expectNone('/api/cuenta');
    expect(el(f).querySelector('[role=alert]')!.textContent).toContain('RUC');
  });

  it('manda el RUC y la contraseña, cierra la sesión y vuelve al inicio', async () => {
    const f = abrir();
    const sesion = TestBed.inject(Sesion);
    sesion.autenticado.set(true);
    pedirEliminar(f);
    escribir(f, 'ruc', ' 1790000028001 ');
    escribir(f, 'clave', 'mi-clave-larga-1');
    enviar(f);
    const r = http.expectOne('/api/cuenta');
    expect(r.request.method).toBe('DELETE');
    expect(r.request.body).toEqual({ ruc: '1790000028001', clave: 'mi-clave-larga-1' });
    r.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolver) => setTimeout(resolver, 0));
    http.match('/api/parametros').forEach((p) => p.flush({}));
    expect(sesion.autenticado()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('si el servidor rechaza, muestra el motivo, borra la contraseña y deja reintentar', () => {
    const f = abrir();
    pedirEliminar(f);
    escribir(f, 'ruc', '1790000028001');
    escribir(f, 'clave', 'mala');
    enviar(f);
    http.expectOne('/api/cuenta').flush(
      { errores: ['Escribe el RUC de la empresa y tu contraseña tal como son para confirmar.'] },
      { status: 400, statusText: 'Bad Request' },
    );
    f.detectChanges();
    expect(el(f).querySelector('[role=alert]')!.textContent).toContain('tal como son');
    expect(el(f).querySelector<HTMLInputElement>('#clave')!.value).toBe('');
    expect(TestBed.inject(Sesion).autenticado()).not.toBe(false);
  });
});
