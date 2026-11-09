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

  const abrir = async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise((resolver) => setTimeout(resolver, 0)); // el recurso pide las reglas tras un ciclo
    http.match('/api/parametros').forEach((r) => r.flush({ empresa: { nombre: 'Casa Demo', ruc: '1' } }));
    await new Promise((resolver) => setTimeout(resolver, 0));
    TestBed.tick();
    fixture.detectChanges();
    return fixture;
  };

  it('muestra el nombre de la empresa y el botón Salir', async () => {
    const el = (await abrir()).nativeElement as HTMLElement;
    expect(el.querySelector('.empresa strong')?.textContent).toContain('Casa Demo');
    expect(el.querySelector('.salir')?.textContent).toContain('Salir');
  });

  it('el administrador ve el enlace a Usuarios; los demás, no', async () => {
    const sesion = TestBed.inject(Sesion);
    sesion.permisos.set(['ver', 'editar', 'usuarios']);
    const el = (await abrir()).nativeElement as HTMLElement;
    const enlaces = () => [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(enlaces()).toContain('Usuarios');
    expect(el.querySelector('.aviso-warning')).toBeNull();
  });

  it('un lector no ve Usuarios y recibe el aviso de que solo consulta', async () => {
    const sesion = TestBed.inject(Sesion);
    sesion.rol.set('lector');
    sesion.permisos.set(['ver']);
    const el = (await abrir()).nativeElement as HTMLElement;
    expect([...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim())).not.toContain('Usuarios');
    expect(el.querySelector('.aviso-warning')!.textContent).toContain('solo puedes consultar');
  });

  it('un aprobador es avisado de que no cambia datos', async () => {
    const sesion = TestBed.inject(Sesion);
    sesion.rol.set('aprobador');
    sesion.permisos.set(['ver', 'validar', 'aprobar', 'publicar']);
    const el = (await abrir()).nativeElement as HTMLElement;
    expect(el.querySelector('.aviso-warning')!.textContent).toContain('validar, aprobar y publicar roles');
  });

  it('avisa si el correo no está verificado y deja pedir otro enlace', async () => {
    const sesion = TestBed.inject(Sesion);
    sesion.email.set('ana@empresa.com');
    const fixture = await abrir();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.aviso-info')!.textContent).toContain('ana@empresa.com');
    el.querySelector<HTMLButtonElement>('.aviso-info button')!.click();
    http.expectOne('/api/auth/reenviar-verificacion').flush({ mensaje: 'x' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(el.querySelector('.aviso-info')!.textContent).toContain('Te enviamos un enlace nuevo');
    expect(el.querySelector('.aviso-info button')).toBeNull();
  });

  it('con el correo verificado no muestra el aviso', async () => {
    TestBed.inject(Sesion).emailVerificado.set(true);
    const el = (await abrir()).nativeElement as HTMLElement;
    expect(el.querySelector('.aviso-info')).toBeNull();
  });

  it('Salir cierra la sesión en el servidor y lleva al inicio de sesión', async () => {
    const fixture = await abrir();
    const sesion = TestBed.inject(Sesion);
    sesion.autenticado.set(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.salir')!.click();
    http.expectOne('/api/auth/salir').flush(null, { status: 204, statusText: 'No Content' });
    TestBed.tick();
    await new Promise((resolver) => setTimeout(resolver, 0));
    http.match('/api/parametros').forEach((r) => r.flush({})); // al salir se piden de nuevo las reglas públicas
    await fixture.whenStable();
    expect(sesion.autenticado()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/entrar');
  });
});
