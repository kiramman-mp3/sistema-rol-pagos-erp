import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { conPermiso, Sesion, sesionActiva, sesionVencida } from './sesion';

const ESTADO = { autenticado: true, email: 'ana@empresa.com', empresa: { nombre: 'Casa Demo', ruc: '1790010937001' } };
const APROBADOR = { ...ESTADO, rol: 'aprobador', permisos: ['ver', 'validar', 'aprobar', 'publicar'] };
const SIN_SESION = { autenticado: false, email: null, empresa: null };

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

  afterEach(() => {
    // Entrar o salir vuelve a pedir las reglas de la cuenta: aquí no interesan.
    TestBed.tick();
    http.match('/api/parametros');
    http.verify();
  });

  describe('rol y permisos', () => {
    it('guarda el rol y los permisos que informa el servidor', () => {
      sesion.entrar('ana@empresa.com', 'x').subscribe();
      http.expectOne('/api/auth/entrar').flush(APROBADOR);
      expect(sesion.rol()).toBe('aprobador');
      expect(sesion.puede('aprobar')).toBe(true);
      expect(sesion.puede('editar')).toBe(false);
      expect(sesion.puede('usuarios')).toBe(false);
    });

    it('sin permisos en la respuesta, no puede nada', () => {
      sesion.entrar('ana@empresa.com', 'x').subscribe();
      http.expectOne('/api/auth/entrar').flush(ESTADO);
      expect(sesion.rol()).toBeNull();
      expect(sesion.puede('ver')).toBe(false);
    });

    it('al expirar la sesión, el rol y los permisos se olvidan', () => {
      sesion.entrar('ana@empresa.com', 'x').subscribe();
      http.expectOne('/api/auth/entrar').flush(APROBADOR);
      sesion.expirar();
      expect(sesion.rol()).toBeNull();
      expect(sesion.permisos()).toEqual([]);
    });

    it('conPermiso deja pasar a quien lo tiene y manda al inicio a quien no', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'sistema/inicio', component: Vacio },
            { path: 'sistema/usuarios', component: Vacio, canActivate: [conPermiso('usuarios')] },
          ]),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });
      const otra = TestBed.inject(Sesion);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/sistema/usuarios');
      expect(TestBed.inject(Router).url).toBe('/sistema/inicio');

      otra.permisos.set(['ver', 'usuarios']);
      await harness.navigateByUrl('/sistema/usuarios');
      expect(TestBed.inject(Router).url).toBe('/sistema/usuarios');
    });
  });

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
      expect(sesion.email()).toBe('ana@empresa.com');
      expect(sesion.empresa()?.nombre).toBe('Casa Demo');
    });

    it('sin sesión lleva al inicio de sesión y recuerda a dónde volver', async () => {
      await intentarEntrar(SIN_SESION);
      expect(router.url).toBe('/entrar?volver=%2Fsistema%2Finicio');
    });

    it('si no se puede consultar la sesión, tampoco deja entrar', async () => {
      await intentarEntrar(null, true);
      expect(router.url).toContain('/entrar');
    });

    it('con la sesión ya conocida no vuelve a preguntar', async () => {
      sesion.autenticado.set(true);
      await (await RouterTestingHarness.create()).navigateByUrl('/sistema/inicio');
      expect(router.url).toBe('/sistema/inicio');
    });
  });

  describe('servicio', () => {
    it('entrar envía las credenciales, guarda quién es y vuelve a pedir las reglas de su cuenta', () => {
      sesion.entrar('ana@empresa.com', 'secreta').subscribe();
      const r = http.expectOne('/api/auth/entrar');
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({ email: 'ana@empresa.com', clave: 'secreta' });
      r.flush(ESTADO);
      expect(sesion.autenticado()).toBe(true);
      expect(sesion.email()).toBe('ana@empresa.com');
      expect(sesion.empresa()).toEqual({ nombre: 'Casa Demo', ruc: '1790010937001' });
      TestBed.tick();
      http.match('/api/parametros'); // las reglas se piden de nuevo: son de la cuenta que entró
    });

    it('registrar crea la cuenta y deja la sesión abierta', () => {
      const datos = { empresa: 'Casa Demo', ruc: '1790010937001', email: 'ana@empresa.com', clave: 'una-clave-larga' };
      sesion.registrar(datos).subscribe();
      const r = http.expectOne('/api/auth/registro');
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual(datos);
      r.flush(ESTADO);
      expect(sesion.autenticado()).toBe(true);
      expect(sesion.empresa()?.nombre).toBe('Casa Demo');
      TestBed.tick();
      http.match('/api/parametros');
    });

    it('salir avisa al servidor y olvida la sesión', () => {
      sesion.autenticado.set(true);
      sesion.email.set('ana@empresa.com');
      sesion.salir().subscribe();
      http.expectOne('/api/auth/salir').flush(null, { status: 204, statusText: 'No Content' });
      expect(sesion.autenticado()).toBe(false);
      expect(sesion.email()).toBeNull();
      expect(sesion.empresa()).toBeNull();
      TestBed.tick();
      http.match('/api/parametros');
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
      sesion.entrar('ana@empresa.com', 'mala').subscribe({ error: () => undefined });
      http
        .expectOne('/api/auth/entrar')
        .flush({ errores: ['Correo o contraseña incorrectos.'] }, { status: 401, statusText: 'Unauthorized' });
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
