import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { Sesion } from '../core/sesion';
import { Shell } from './shell';

@Component({ template: '' })
class Vacio {}

describe('Shell', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'entrar', component: Vacio }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  const abrir = (protegida: boolean) => {
    TestBed.inject(Sesion).protegida.set(protegida);
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    http.match('/api/parametros').forEach((r) => r.flush({ empresa: { nombre: 'Casa Demo', ruc: '1' } }));
    return fixture;
  };

  it('muestra Salir cuando el servidor pide iniciar sesión', () => {
    const el = abrir(true).nativeElement as HTMLElement;
    expect(el.querySelector('.salir')?.textContent).toContain('Salir');
  });

  it('no muestra Salir cuando el servidor trabaja sin inicio de sesión', () => {
    const el = abrir(false).nativeElement as HTMLElement;
    expect(el.querySelector('.salir')).toBeNull();
  });

  it('Salir cierra la sesión en el servidor y lleva al inicio de sesión', async () => {
    const fixture = abrir(true);
    const sesion = TestBed.inject(Sesion);
    sesion.autenticado.set(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.salir')!.click();
    http.expectOne('/api/auth/salir').flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(sesion.autenticado()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });
});
