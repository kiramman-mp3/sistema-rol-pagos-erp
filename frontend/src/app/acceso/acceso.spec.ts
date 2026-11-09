import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Sesion } from '../core/sesion';
import { Recuperar } from './recuperar';
import { Restablecer } from './restablecer';
import { Verificar } from './verificar';

describe('pantallas de acceso por correo', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
  const escribir = (f: ComponentFixture<unknown>, id: string, valor: string) => {
    const campo = el(f).querySelector<HTMLInputElement>(`#${id}`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  };
  const enviar = (f: ComponentFixture<unknown>) => {
    el(f).querySelector('form')!.dispatchEvent(new Event('submit'));
    f.detectChanges();
  };

  describe('Recuperar', () => {
    it('pide el enlace con el correo y avisa sin decir si la cuenta existe', () => {
      const f = TestBed.createComponent(Recuperar);
      f.detectChanges();
      escribir(f, 'email', ' ana@empresa.com ');
      enviar(f);
      const r = http.expectOne('/api/auth/recuperar');
      expect(r.request.body).toEqual({ email: 'ana@empresa.com' });
      r.flush({ mensaje: 'x' }, { status: 202, statusText: 'Accepted' });
      f.detectChanges();
      expect(el(f).textContent).toContain('Si ese correo tiene una cuenta');
      expect(el(f).querySelector('form')).toBeNull();
    });

    it('con un correo inválido no pide nada', () => {
      const f = TestBed.createComponent(Recuperar);
      f.detectChanges();
      escribir(f, 'email', 'no-es-correo');
      enviar(f);
      http.expectNone('/api/auth/recuperar');
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('correo válido');
    });

    it('si el servidor frena la solicitud, muestra su mensaje y deja reintentar', () => {
      const f = TestBed.createComponent(Recuperar);
      f.detectChanges();
      escribir(f, 'email', 'ana@empresa.com');
      enviar(f);
      http.expectOne('/api/auth/recuperar').flush({ errores: ['Demasiadas solicitudes de correo.'] }, { status: 429, statusText: 'Too Many Requests' });
      f.detectChanges();
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('Demasiadas solicitudes');
      expect(el(f).querySelector('form')).not.toBeNull();
    });
  });

  describe('Restablecer', () => {
    const abrir = (token?: string) => {
      const f = TestBed.createComponent(Restablecer);
      if (token) f.componentRef.setInput('token', token);
      f.detectChanges();
      return f;
    };

    it('sin token explica que el enlace está incompleto', () => {
      const f = abrir();
      expect(el(f).textContent).toContain('incompleto');
      expect(el(f).querySelector('form')).toBeNull();
    });

    it('no envía contraseñas cortas ni distintas', () => {
      const f = abrir('t'.repeat(30));
      escribir(f, 'clave', 'corta');
      escribir(f, 'confirmar', 'corta');
      enviar(f);
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('al menos 10');
      escribir(f, 'clave', 'una-clave-larga-1');
      escribir(f, 'confirmar', 'una-clave-larga-2');
      enviar(f);
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('no coinciden');
      http.expectNone('/api/auth/restablecer');
    });

    it('manda el token y la contraseña, y ofrece ingresar', () => {
      const f = abrir('t'.repeat(30));
      escribir(f, 'clave', 'una-clave-larga-1');
      escribir(f, 'confirmar', 'una-clave-larga-1');
      enviar(f);
      const r = http.expectOne('/api/auth/restablecer');
      expect(r.request.body).toEqual({ token: 't'.repeat(30), clave: 'una-clave-larga-1' });
      r.flush(null, { status: 204, statusText: 'No Content' });
      f.detectChanges();
      expect(el(f).textContent).toContain('ya cambiaste tu contraseña');
      expect(el(f).querySelector('a[href="/entrar"]')).not.toBeNull();
    });

    it('un enlace vencido muestra el motivo y lleva a pedir otro', () => {
      const f = abrir('t'.repeat(30));
      escribir(f, 'clave', 'una-clave-larga-1');
      escribir(f, 'confirmar', 'una-clave-larga-1');
      enviar(f);
      http.expectOne('/api/auth/restablecer').flush(
        { errores: ['El enlace no es válido o ya venció. Pide uno nuevo.'] },
        { status: 400, statusText: 'Bad Request' },
      );
      f.detectChanges();
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('ya venció');
      expect(el(f).querySelector('[role=alert] a[href="/recuperar"]')).not.toBeNull();
    });
  });

  describe('Verificar', () => {
    const abrir = async (token?: string) => {
      const f = TestBed.createComponent(Verificar);
      if (token) f.componentRef.setInput('token', token);
      f.detectChanges();
      TestBed.tick();
      return f;
    };

    it('verifica al abrir el enlace, una sola vez, y deja la sesión al tanto', async () => {
      const f = await abrir('v'.repeat(30));
      http.expectOne('/api/auth/verificar').flush(null, { status: 204, statusText: 'No Content' });
      f.detectChanges();
      TestBed.tick();
      f.detectChanges();
      http.expectNone('/api/auth/verificar');
      expect(el(f).textContent).toContain('quedó verificado');
      expect(TestBed.inject(Sesion).emailVerificado()).toBe(true);
    });

    it('un enlace vencido muestra el motivo', async () => {
      const f = await abrir('v'.repeat(30));
      http.expectOne('/api/auth/verificar').flush(
        { errores: ['El enlace no es válido o ya venció. Pide uno nuevo.'] },
        { status: 400, statusText: 'Bad Request' },
      );
      f.detectChanges();
      expect(el(f).querySelector('[role=alert]')!.textContent).toContain('ya venció');
    });

    it('sin token no pide nada', async () => {
      const f = await abrir();
      http.expectNone('/api/auth/verificar');
      expect(el(f).textContent).toContain('incompleto');
    });
  });
});
