import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Registro } from './registro';

@Component({ template: '' })
class Vacio {}

describe('Registro', () => {
  let http: HttpTestingController;
  let router: Router;
  let el: HTMLElement;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'registro', component: Registro },
          { path: 'sistema', component: Vacio },
          { path: 'entrar', component: Vacio },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registro');
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  });

  afterEach(() => {
    // Entrar o salir vuelve a pedir las reglas de la cuenta: aquí no interesan.
    TestBed.tick();
    http.match('/api/parametros');
    http.verify();
  });

  const escribir = (valores: Record<string, string>) => {
    for (const [id, valor] of Object.entries(valores)) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
  };

  const BUENOS = {
    empresa: 'Casa Demo S.A.', ruc: '1790010937001', email: 'ana@empresa.com',
    clave: 'una-clave-larga', confirmar: 'una-clave-larga',
  };

  it('con datos válidos crea la cuenta y entra al sistema', async () => {
    escribir(BUENOS);
    const r = http.expectOne('/api/auth/registro');
    expect(r.request.body).toEqual({
      empresa: 'Casa Demo S.A.', ruc: '1790010937001', email: 'ana@empresa.com', clave: 'una-clave-larga',
    });
    r.flush({ autenticado: true, email: 'ana@empresa.com', empresa: { nombre: 'Casa Demo S.A.', ruc: '1790010937001' } });
    TestBed.tick();
    http.match('/api/parametros').forEach((r) => r.flush({}));
    await harness.fixture.whenStable();
    http.match('/api/parametros'); // al entrar se piden de nuevo las reglas de la cuenta
    expect(router.url).toBe('/sistema');
  });

  it('no envía nada si faltan datos, y dice cuáles', () => {
    escribir({ ...BUENOS, empresa: '', ruc: '123', email: 'malo', clave: 'corta', confirmar: 'corta' });
    http.expectNone('/api/auth/registro');
    const texto = el.querySelector('[role="alert"]')!.textContent!;
    expect(texto).toContain('nombre de la empresa');
    expect(texto).toContain('13 dígitos');
    expect(texto).toContain('correo');
    expect(texto).toContain('al menos 10');
  });

  it('no envía si las contraseñas no coinciden', () => {
    escribir({ ...BUENOS, confirmar: 'otra-distinta-1' });
    http.expectNone('/api/auth/registro');
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('no coinciden');
  });

  it('muestra los errores del servidor y vacía las contraseñas', () => {
    escribir(BUENOS);
    http
      .expectOne('/api/auth/registro')
      .flush({ errores: ['Ya existe una cuenta con ese correo.'] }, { status: 409, statusText: 'Conflict' });
    harness.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Ya existe una cuenta con ese correo.');
    expect(el.querySelector<HTMLInputElement>('#clave')!.value).toBe('');
    expect(el.querySelector<HTMLInputElement>('#confirmar')!.value).toBe('');
    expect(router.url).toBe('/registro');
  });
});
