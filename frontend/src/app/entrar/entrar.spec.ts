import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Entrar, destinoSeguro } from './entrar';

@Component({ template: '' })
class Vacio {}

describe('destinoSeguro', () => {
  it('acepta pantallas del sistema', () => {
    expect(destinoSeguro('/sistema')).toBe('/sistema');
    expect(destinoSeguro('/sistema/empleados/3/editar')).toBe('/sistema/empleados/3/editar');
    expect(destinoSeguro('/sistema?x=1')).toBe('/sistema?x=1');
  });

  it('rechaza direcciones de fuera o raras y vuelve al sistema', () => {
    for (const malo of [undefined, '', 'https://malo.com', '//malo.com', '/sistemaX', '/otra', 'sistema/inicio', '/\\malo.com']) {
      expect(destinoSeguro(malo)).toBe('/sistema');
    }
  });
});

describe('Entrar', () => {
  let http: HttpTestingController;
  let router: Router;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'entrar', component: Entrar },
            { path: 'sistema/empleados', component: Vacio },
            { path: 'sistema', component: Vacio },
            { path: '', component: Vacio },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    // Entrar o salir vuelve a pedir las reglas de la cuenta: aquí no interesan.
    TestBed.tick();
    http.match('/api/parametros');
    http.verify();
  });

  const abrir = async (url = '/entrar') => {
    await harness.navigateByUrl(url);
    // Al abrirse pregunta si ya hay sesión.
    http.expectOne('/api/auth/yo').flush({ autenticado: false, email: null, empresa: null });
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  };

  const escribir = (el: HTMLElement, email: string, clave: string) => {
    const poner = (id: string, valor: string) => {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    };
    poner('email', email);
    poner('clave', clave);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
  };

  it('con los datos correctos entra y vuelve a la pantalla que se pidió', async () => {
    const el = await abrir('/entrar?volver=%2Fsistema%2Fempleados');
    escribir(el, 'ana@empresa.com', 'secreta');
    const r = http.expectOne('/api/auth/entrar');
    expect(r.request.body).toEqual({ email: 'ana@empresa.com', clave: 'secreta' });
    r.flush({ autenticado: true, email: 'ana@empresa.com', empresa: { nombre: 'Casa Demo', ruc: '1790010937001' } });
    TestBed.tick();
    http.match('/api/parametros').forEach((r) => r.flush({}));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/sistema/empleados');
  });

  it('no vuelve a una dirección de fuera del sistema', async () => {
    const el = await abrir('/entrar?volver=https%3A%2F%2Fmalo.com');
    escribir(el, 'ana@empresa.com', 'secreta');
    http.expectOne('/api/auth/entrar').flush({ autenticado: true, email: 'ana@empresa.com', empresa: { nombre: 'Casa Demo', ruc: '1790010937001' } });
    TestBed.tick();
    http.match('/api/parametros').forEach((r) => r.flush({}));
    await harness.fixture.whenStable();
    expect(router.url).toBe('/sistema');
  });

  it('con datos incorrectos muestra el mensaje del servidor y vacía la contraseña', async () => {
    const el = await abrir();
    escribir(el, 'ana@empresa.com', 'mala');
    http
      .expectOne('/api/auth/entrar')
      .flush({ errores: ['Correo o contraseña incorrectos.'] }, { status: 401, statusText: 'Unauthorized' });
    harness.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Correo o contraseña incorrectos.');
    expect(el.querySelector<HTMLInputElement>('#clave')!.value).toBe('');
    expect(router.url).toBe('/entrar');
  });

  it('si el servidor bloquea por demasiados intentos, muestra su aviso', async () => {
    const el = await abrir();
    escribir(el, 'ana@empresa.com', 'mala');
    http
      .expectOne('/api/auth/entrar')
      .flush({ errores: ['Demasiados intentos fallidos. Vuelve a intentar en 15 minutos.'] }, { status: 429, statusText: 'Too Many Requests' });
    harness.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Demasiados intentos');
  });

  it('sin escribir nada no envía y pide los datos', async () => {
    const el = await abrir();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
    http.expectNone('/api/auth/entrar');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Escribe el correo y la contraseña');
  });

  it('si ya hay sesión, salta el formulario', async () => {
    await harness.navigateByUrl('/entrar?volver=%2Fsistema%2Fempleados');
    http.expectOne('/api/auth/yo').flush({ autenticado: true, email: 'ana@empresa.com', empresa: { nombre: 'Casa Demo', ruc: '1790010937001' } });
    await harness.fixture.whenStable();
    expect(router.url).toBe('/sistema/empleados');
  });
});
