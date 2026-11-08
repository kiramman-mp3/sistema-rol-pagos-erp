import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Sesion, sesionActiva, sesionVencida } from './sesion';

const ESTADO = { autenticado: true, usuario: 'admin', protegida: true };
const SIN_SESION = { autenticado: false, usuario: null, protegida: true };

@Component({ template: '' })
class Vacio {}

describe('sesión', () => {
  let http: HttpTestingController;
  let router: Router;
  let sesion: Sesion;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'sistema/inicio', component: Vacio, canActivate: [sesionActiva] },
          { path: 'entrar', component: Vacio },
        ]),
        provideHttpClient(withInterceptors([sesionVencida])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    sesion = TestBed.inject(Sesion);
  });

  afterEach(() => http.verify());

  describe('guard', () => {
    const intentarEntrar = async (respuesta: object | null, error = false) => {
      const harness = await RouterTestingHarness.create();
      const navegacion = harness.navigateByUrl('/sistema/inicio');
      await new Promise((resolver) => setTimeout(resolver, 0)); // el guard pide la sesión tras unos ciclos del router
      const pedido = http.expectOne('/api/auth/yo');
      if (error) pedido.flush('error', { status: 500, statusText: 'Server Error' });
      else pedido.flush(respuesta);
      await navegacion;
    };

    it('con sesión válida deja entrar al sistema', async () => {
      await intentarEntrar(ESTADO);
      expect(router.url).toBe('/sistema/inicio');
      expect(sesion.usuario()).toBe('admin');
    });

    it('sin sesión lleva al inicio de sesión y recuerda a dónde volver', async () => {
      await intentarEntrar(SIN_SESION);
      expect(router.url).toBe('/entrar?volver=%2Fsistema%2Finicio');
    });

    it('si no se puede consultar la sesión, tampoco deja entrar', async () => {
      await intentarEntrar(null, true);
      expect(router.url).toContain('/entrar');
    });

    it('en un servidor sin inicio de sesión deja entrar', async () => {
      await intentarEntrar({ autenticado: true, usuario: null, protegida: false });
      expect(router.url).toBe('/sistema/inicio');
      expect(sesion.protegida()).toBe(false);
    });

    it('con la sesión ya conocida no vuelve a preguntar', async () => {
      sesion.autenticado.set(true);
      await (await RouterTestingHarness.create()).navigateByUrl('/sistema/inicio');
      expect(router.url).toBe('/sistema/inicio');
    });
  });

  describe('servicio', () => {
    it('entrar envía las credenciales y guarda quién es', () => {
      sesion.entrar('admin', 'secreta').subscribe();
      const r = http.expectOne('/api/auth/entrar');
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({ usuario: 'admin', clave: 'secreta' });
      r.flush(ESTADO);
      expect(sesion.autenticado()).toBe(true);
      expect(sesion.usuario()).toBe('admin');
      expect(sesion.protegida()).toBe(true);
    });

    it('salir avisa al servidor y olvida la sesión', () => {
      sesion.autenticado.set(true);
      sesion.usuario.set('admin');
      sesion.salir().subscribe();
      http.expectOne('/api/auth/salir').flush(null, { status: 204, statusText: 'No Content' });
      expect(sesion.autenticado()).toBe(false);
      expect(sesion.usuario()).toBeNull();
    });
  });

  describe('interceptor', () => {
    const pedir = (url: string) =>
      TestBed.inject(HttpClient)
        .get(url)
        .subscribe({ error: () => undefined });
    const esperarNavegacion = () => new Promise((resolver) => setTimeout(resolver, 0));

    it('un 401 de la API borra la sesión y lleva a iniciar sesión, recordando la pantalla', async () => {
      sesion.autenticado.set(true);
      await (await RouterTestingHarness.create()).navigateByUrl('/sistema/inicio');

      pedir('/api/empleados');
      http
        .expectOne('/api/empleados')
        .flush({ errores: ['Inicia sesión para continuar.'] }, { status: 401, statusText: 'Unauthorized' });
      await esperarNavegacion();

      expect(sesion.autenticado()).toBe(false);
      expect(router.url).toBe('/entrar?volver=%2Fsistema%2Finicio');
    });

    it('un 401 al iniciar sesión no redirige: el error lo muestra el formulario', async () => {
      await router.navigateByUrl('/entrar');
      sesion.entrar('admin', 'mala').subscribe({ error: () => undefined });
      http
        .expectOne('/api/auth/entrar')
        .flush({ errores: ['Usuario o contraseña incorrectos.'] }, { status: 401, statusText: 'Unauthorized' });
      await esperarNavegacion();
      expect(router.url).toBe('/entrar');
    });

    it('otros errores no tocan la sesión', () => {
      sesion.autenticado.set(true);
      pedir('/api/empleados');
      http.expectOne('/api/empleados').flush('x', { status: 500, statusText: 'Server Error' });
      expect(sesion.autenticado()).toBe(true);
    });
  });
});
