import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Avisos } from '../../core/avisos';
import type { PeriodoVacaciones, SaldoVacaciones } from '../../core/modelos';
import { Sesion } from '../../core/sesion';
import { Vacaciones } from './vacaciones';

const SALDOS: SaldoVacaciones[] = [
  { empleadoId: 1, nombres: 'María Paredes', cedula: '1801234566', fechaIngreso: '2019-03-01', diasPorAnio: 15, devengados: 120.5, gozados: 30, saldo: 90.5 },
  { empleadoId: 2, nombres: 'Pedro Guamán', cedula: '0606789014', fechaIngreso: '2026-10-16', diasPorAnio: 15, devengados: 0.63, gozados: 11, saldo: -10.37 },
];
const PERIODO: PeriodoVacaciones = {
  id: 7, empleadoId: 1, nombres: 'María Paredes', cedula: '1801234566',
  desde: '2026-03-02', hasta: '2026-03-16', dias: 15, observacion: 'Viaje',
};
const EMPLEADOS = [
  { id: 1, nombres: 'María Paredes', activo: true },
  { id: 2, nombres: 'Pedro Guamán', activo: true },
  { id: 3, nombres: 'Luis Tipán', activo: false },
];

describe('Vacaciones', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Sesion).permisos.set(['ver', 'editar']);
  });

  const abrir = async (periodos: PeriodoVacaciones[] = [PERIODO]) => {
    const fixture = TestBed.createComponent(Vacaciones);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/vacaciones/saldos').flush(SALDOS);
    http.expectOne('/api/vacaciones').flush(periodos);
    http.expectOne('/api/empleados').flush(EMPLEADOS);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  /** Deja que termine el `await` de la escritura y responde a la recarga de las dos listas. */
  const recargar = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, periodos: PeriodoVacaciones[] = [PERIODO]) => {
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/vacaciones').flush(periodos);
    http.expectOne('/api/vacaciones/saldos').flush(SALDOS);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const boton = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

  it('muestra el saldo de cada persona y marca en rojo a quien debe días', async () => {
    const { el } = await abrir();
    const filas = [...el.querySelectorAll('#tabla-saldos tbody tr')];
    expect(filas[0].textContent).toContain('María Paredes');
    expect(filas[0].textContent).toContain('90.5');
    expect(filas[0].querySelector('.debe')).toBeNull();
    expect(filas[1].textContent).toContain('-10.37');
    expect(filas[1].querySelector('.debe')).not.toBeNull();
  });

  it('lista los periodos gozados con sus días', async () => {
    const { el } = await abrir();
    const fila = el.querySelector('#tabla-periodos tbody tr')!.textContent!;
    expect(fila).toContain('María Paredes');
    expect(fila).toContain('2026-03-02');
    expect(fila).toContain('2026-03-16');
    expect(fila).toContain('15');
    expect(fila).toContain('Viaje');
  });

  it('dice cuándo no hay vacaciones registradas', async () => {
    const { el } = await abrir([]);
    expect(el.querySelector('#tabla-periodos tbody')!.textContent).toContain('Todavía no hay vacaciones registradas.');
  });

  it('solo ofrece a quienes siguen en la empresa', async () => {
    const { el } = await abrir();
    const opciones = [...el.querySelectorAll('#vacaciones-empleado option')].map((o) => o.textContent!.trim());
    expect(opciones).toEqual(['Elige quién sale de vacaciones', 'María Paredes', 'Pedro Guamán']);
  });

  it('registra un periodo, avisa el resultado y vuelve a pedir los saldos', async () => {
    const { fixture, el } = await abrir([]);
    const poner = (id: string, valor: string) => {
      const campo = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event(campo.tagName === 'SELECT' ? 'change' : 'input'));
    };
    poner('vacaciones-empleado', '2');
    poner('vacaciones-desde', '2026-10-20');
    poner('vacaciones-hasta', '2026-10-30');
    poner('vacaciones-obs', 'Descanso');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const pedido = http.expectOne('/api/vacaciones');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toEqual({ empleadoId: 2, desde: '2026-10-20', hasta: '2026-10-30', observacion: 'Descanso' });
    pedido.flush(
      { ...PERIODO, empleadoId: 2, nombres: 'Pedro Guamán', dias: 11, avisos: ['Pedro Guamán ha tomado 11 días y a esa fecha lleva devengados 0.63: queda debiendo 10.37.'] },
      { status: 201, statusText: 'Created' },
    );
    await recargar(fixture);
    const textos = TestBed.inject(Avisos).lista().map((a) => a.texto);
    expect(textos[0]).toBe('Vacaciones registradas: 11 días de Pedro Guamán.');
    expect(textos[1]).toContain('queda debiendo 10.37');
    expect(el.querySelector<HTMLInputElement>('#vacaciones-desde')!.value).toBe('');
  });

  it('muestra el motivo cuando el servidor rechaza el periodo', async () => {
    const { fixture, el } = await abrir([]);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/vacaciones').flush({ errores: ['Fecha de inicio inválida.'] }, { status: 400, statusText: 'Bad Request' });
    await recargar(fixture, []);
    expect(TestBed.inject(Avisos).lista()[0].texto).toContain('Fecha de inicio inválida.');
  });

  it('eliminar pide confirmación antes de llamar a la API', async () => {
    const { fixture, el } = await abrir();
    boton(el, 'Eliminar').click();
    fixture.detectChanges();
    http.expectNone('/api/vacaciones/7');
    expect(el.textContent).toContain('¿Eliminar estas vacaciones de María Paredes?');
    boton(el, 'Sí, eliminar').click();
    const pedido = http.expectOne('/api/vacaciones/7');
    expect(pedido.request.method).toBe('DELETE');
    pedido.flush(null, { status: 204, statusText: 'No Content' });
    await recargar(fixture, []);
    expect(el.querySelector('#tabla-periodos tbody')!.textContent).toContain('Todavía no hay vacaciones registradas.');
  });

  it('un lector ve saldos y periodos, pero no puede registrar ni eliminar', async () => {
    TestBed.inject(Sesion).permisos.set(['ver']);
    const { el } = await abrir();
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelectorAll('tbody button').length).toBe(0);
  });
});
