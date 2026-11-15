import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Avisos } from '../../core/avisos';
import type { Prestamo } from '../../core/modelos';
import { Sesion } from '../../core/sesion';
import { Prestamos } from './prestamos';

const PRESTAMO: Prestamo = {
  id: 7, empleadoId: 2, nombres: 'Carlos Villacís', cedula: '1702345677', tipo: 'quirografario',
  cuota: 40, cuotas: 6, primerAnio: 2026, primerMes: 11, ultimoAnio: 2027, ultimoMes: 4,
  total: 240, activo: true, observacion: 'Quirografario IESS',
};
const EMPLEADOS = [
  { id: 1, nombres: 'María Paredes', activo: true },
  { id: 2, nombres: 'Carlos Villacís', activo: true },
  { id: 3, nombres: 'Pedro Guamán', activo: false },
];

describe('Prestamos', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Sesion).permisos.set(['ver', 'editar']);
  });

  const abrir = async (lista: Prestamo[] = [PRESTAMO]) => {
    const fixture = TestBed.createComponent(Prestamos);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/prestamos').flush(lista);
    http.expectOne('/api/empleados').flush(EMPLEADOS);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  /** Deja que termine el `await` de la escritura y responde a la recarga de la lista. */
  const recargar = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, lista: Prestamo[] = [PRESTAMO]) => {
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/prestamos').flush(lista);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const boton = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

  it('lista cada préstamo con su cuota, sus meses y su estado', async () => {
    const { el } = await abrir();
    const fila = el.querySelector('tbody tr')!.textContent!;
    expect(fila).toContain('Carlos Villacís');
    expect(fila).toContain('Quirografario');
    expect(fila).toContain('noviembre de 2026 a abril de 2027');
    expect(fila).toContain('Activo');
    expect(fila).toContain('Quirografario IESS');
  });

  it('dice cuándo no hay préstamos', async () => {
    const { el } = await abrir([]);
    expect(el.querySelector('tbody')!.textContent).toContain('Todavía no hay préstamos registrados.');
  });

  it('solo ofrece a quienes siguen en la empresa', async () => {
    const { el } = await abrir();
    const opciones = [...el.querySelectorAll('#prestamo-empleado option')].map((o) => o.textContent!.trim());
    expect(opciones).toEqual(['Elige a quién se le descuenta', 'María Paredes', 'Carlos Villacís']);
  });

  it('registra un préstamo con lo digitado', async () => {
    const { fixture, el } = await abrir([]);
    const poner = (id: string, valor: string) => {
      const campo = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event(campo.tagName === 'SELECT' ? 'change' : 'input'));
    };
    poner('prestamo-empleado', '2');
    poner('prestamo-tipo', 'hipotecario');
    poner('prestamo-cuota', '55.5');
    poner('prestamo-cuotas', '12');
    poner('prestamo-mes', '3');
    poner('prestamo-anio', '2027');
    poner('prestamo-obs', 'Vivienda');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const pedido = http.expectOne('/api/prestamos');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toEqual({
      empleadoId: 2, tipo: 'hipotecario', cuota: 55.5, cuotas: 12, primerAnio: 2027, primerMes: 3, observacion: 'Vivienda',
    });
    pedido.flush({ ...PRESTAMO, tipo: 'hipotecario' }, { status: 201, statusText: 'Created' });
    await recargar(fixture);
    expect(el.querySelector<HTMLInputElement>('#prestamo-cuota')!.value).toBe('');
    expect(TestBed.inject(Avisos).lista()[0].texto).toBe('Préstamo registrado.');
  });

  it('muestra el motivo cuando el servidor rechaza el préstamo', async () => {
    const { fixture, el } = await abrir([]);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/prestamos').flush({ errores: ['El empleado no existe.'] }, { status: 400, statusText: 'Bad Request' });
    await recargar(fixture, []);
    expect(TestBed.inject(Avisos).lista()[0].texto).toContain('El empleado no existe.');
  });

  it('suspende y reanuda con un PATCH', async () => {
    const { fixture, el } = await abrir();
    boton(el, 'Suspender').click();
    const pedido = http.expectOne('/api/prestamos/7/estado');
    expect(pedido.request.method).toBe('PATCH');
    pedido.flush({ ...PRESTAMO, activo: false });
    await recargar(fixture, [{ ...PRESTAMO, activo: false }]);
    expect(el.querySelector('tbody tr')!.textContent).toContain('Suspendido');
    expect(boton(el, 'Reanudar')).toBeTruthy();
  });

  it('eliminar pide confirmación antes de llamar a la API', async () => {
    const { fixture, el } = await abrir();
    boton(el, 'Eliminar').click();
    fixture.detectChanges();
    http.expectNone('/api/prestamos/7');
    expect(el.textContent).toContain('¿Eliminar el préstamo de Carlos Villacís?');
    boton(el, 'Sí, eliminar').click();
    const pedido = http.expectOne('/api/prestamos/7');
    expect(pedido.request.method).toBe('DELETE');
    pedido.flush(null, { status: 204, statusText: 'No Content' });
    await recargar(fixture, []);
    expect(el.querySelector('tbody')!.textContent).toContain('Todavía no hay préstamos registrados.');
  });

  it('un lector ve la lista, pero no puede registrar, suspender ni eliminar', async () => {
    TestBed.inject(Sesion).permisos.set(['ver']);
    const { el } = await abrir();
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelectorAll('tbody button').length).toBe(0);
  });
});
