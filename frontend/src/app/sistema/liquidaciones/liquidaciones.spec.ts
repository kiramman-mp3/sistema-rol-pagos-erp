import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Avisos } from '../../core/avisos';
import type { Liquidacion, VistaLiquidacion } from '../../core/modelos';
import { Sesion } from '../../core/sesion';
import { Liquidaciones } from './liquidaciones';

const RUBROS = [
  { clave: 'decimoTercero', concepto: 'Décimo tercero proporcional', formula: 'suma de lo provisionado', detalle: '300.00 provisionados', valor: 300 },
  { clave: 'vacaciones', concepto: 'Vacaciones no gozadas', formula: 'días de saldo × sueldo base ÷ 30', detalle: '64 días × 1800.00 ÷ 30 = 3840.00', valor: 3840 },
] as const;

const VISTA: VistaLiquidacion = {
  empleadoId: 2, nombres: 'Carlos Villacís', cedula: '1702345677', fechaIngreso: '2022-07-15', fechaSalida: '2026-10-20',
  causa: 'renuncia', causaEtiqueta: 'Renuncia voluntaria', region: 'sierra', regimenAplicado: 'CODIGO_TRABAJO',
  sueldoBase: 1800, aniosServicio: 4.2667, diasServicio: 1536, rubros: [...RUBROS], total: 4140,
  prestamosPendientes: { cuotas: 0, valor: 0 }, avisos: ['Falta el rol de 2026-09: lo que provisionaría no entra en el décimo tercero.'],
};

const REGISTRADA: Liquidacion = {
  id: 5, empleadoId: 1, cedula: '1801234566', nombres: 'María Paredes', cargo: 'Gerente', regimenAplicado: 'CODIGO_TRABAJO',
  sueldoBase: 4500, fechaIngreso: '2019-03-01', fechaSalida: '2026-09-30', causa: 'desahucio', causaEtiqueta: 'Desahucio',
  region: 'sierra', aniosServicio: 7.5, total: 9000, rubros: [...RUBROS], prestamosCuotas: 4, prestamosValor: 160,
};

const EMPLEADOS = [
  { id: 1, nombres: 'María Paredes', activo: false },
  { id: 2, nombres: 'Carlos Villacís', activo: true },
  { id: 3, nombres: 'Pedro Guamán', activo: true },
];

describe('Liquidaciones', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Sesion).permisos.set(['ver', 'editar']);
  });

  const abrir = async (registradas: Liquidacion[] = [REGISTRADA]) => {
    const fixture = TestBed.createComponent(Liquidaciones);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/liquidaciones').flush(registradas);
    http.expectOne('/api/empleados').flush(EMPLEADOS);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  const poner = (el: HTMLElement, id: string, valor: string) => {
    const campo = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event(campo.tagName === 'SELECT' ? 'change' : 'input'));
  };

  /** Llena el formulario como lo haría una persona y pide el cálculo. */
  const calcular = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }, el: HTMLElement, vista = VISTA) => {
    poner(el, 'liq-empleado', '2');
    poner(el, 'liq-fecha', '2026-10-20');
    poner(el, 'liq-causa', 'renuncia');
    poner(el, 'liq-region', 'sierra');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const pedido = http.expectOne('/api/liquidaciones/calcular');
    expect(pedido.request.body).toEqual({ empleadoId: 2, fechaSalida: '2026-10-20', causa: 'renuncia', region: 'sierra' });
    pedido.flush(vista);
    await new Promise((resolver) => setTimeout(resolver));
    fixture.detectChanges();
  };

  const boton = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!;

  it('lista las liquidaciones registradas y despliega sus rubros', async () => {
    const { fixture, el } = await abrir();
    const fila = el.querySelector('#tabla-registradas tbody tr')!.textContent!;
    expect(fila).toContain('María Paredes');
    expect(fila).toContain('2026-09-30');
    expect(fila).toContain('Desahucio');
    expect(fila).toContain('$9,000.00');
    boton(el, 'Ver rubros').click();
    fixture.detectChanges();
    expect(el.querySelector('tr.rubros')!.textContent).toContain('Vacaciones no gozadas: $3,840.00');
    expect(el.querySelector('tr.rubros')!.textContent).toContain('Quedaban 4 cuotas de préstamos del IESS por $160.00');
  });

  it('solo ofrece a quienes siguen en la empresa', async () => {
    const { el } = await abrir([]);
    const opciones = [...el.querySelectorAll('#liq-empleado option')].map((o) => o.textContent!.trim());
    expect(opciones).toEqual(['Elige quién sale', 'Carlos Villacís', 'Pedro Guamán']);
  });

  it('calcula y muestra cada rubro con su explicación, los avisos y el total', async () => {
    const { fixture, el } = await abrir([]);
    await calcular(fixture, el);
    const filas = [...el.querySelectorAll('#tabla-vista tbody tr')];
    expect(filas.length).toBe(2);
    expect(filas[1].textContent).toContain('Vacaciones no gozadas');
    expect(filas[1].textContent).toContain('64 días × 1800.00 ÷ 30 = 3840.00');
    expect(el.querySelector('#tabla-vista tfoot')!.textContent).toContain('$4,140.00');
    expect(el.textContent).toContain('Falta el rol de 2026-09');
    expect(el.textContent).toContain('Renuncia voluntaria, salida el 2026-10-20');
  });

  it('cambiar un dato del formulario descarta la liquidación calculada', async () => {
    const { fixture, el } = await abrir([]);
    await calcular(fixture, el);
    expect(el.querySelector('#tabla-vista')).not.toBeNull();
    poner(el, 'liq-causa', 'despido_intempestivo');
    fixture.detectChanges();
    expect(el.querySelector('#tabla-vista')).toBeNull();
  });

  it('muestra el motivo cuando el servidor rechaza el cálculo', async () => {
    const { fixture, el } = await abrir([]);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/liquidaciones/calcular').flush({ errores: ['El empleado no existe.'] }, { status: 400, statusText: 'Bad Request' });
    await new Promise((resolver) => setTimeout(resolver));
    fixture.detectChanges();
    expect(TestBed.inject(Avisos).lista()[0].texto).toContain('El empleado no existe.');
    expect(el.querySelector('#tabla-vista')).toBeNull();
  });

  it('registrar pide confirmación, guarda y vuelve a pedir las listas', async () => {
    const { fixture, el } = await abrir([]);
    await calcular(fixture, el);
    boton(el, 'Registrar y dar de salida').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('lo da de salida el 2026-10-20');
    http.expectNone({ method: 'POST', url: '/api/liquidaciones' });
    boton(el, 'Sí, registrar').click();
    const pedido = http.expectOne({ method: 'POST', url: '/api/liquidaciones' });
    expect(pedido.request.body).toEqual({ empleadoId: 2, fechaSalida: '2026-10-20', causa: 'renuncia', region: 'sierra' });
    pedido.flush({ ...REGISTRADA, id: 6, nombres: 'Carlos Villacís', fechaSalida: '2026-10-20', avisos: [] }, { status: 201, statusText: 'Created' });
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/liquidaciones').flush([REGISTRADA]);
    http.expectOne('/api/empleados').flush(EMPLEADOS);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Avisos).lista()[0].texto).toContain('Carlos Villacís quedó con salida el 2026-10-20');
    expect(el.querySelector('#tabla-vista')).toBeNull();
  });

  it('eliminar pide confirmación antes de llamar a la API', async () => {
    const { fixture, el } = await abrir();
    boton(el, 'Eliminar').click();
    fixture.detectChanges();
    http.expectNone('/api/liquidaciones/5');
    expect(el.textContent).toContain('¿Eliminar la liquidación de María Paredes?');
    boton(el, 'Sí, eliminar').click();
    const pedido = http.expectOne('/api/liquidaciones/5');
    expect(pedido.request.method).toBe('DELETE');
    pedido.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/liquidaciones').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#tabla-registradas tbody')!.textContent).toContain('Todavía no hay liquidaciones registradas.');
  });

  it('un lector ve las liquidaciones, pero no puede calcular, registrar ni eliminar', async () => {
    TestBed.inject(Sesion).permisos.set(['ver']);
    const { el } = await abrir();
    expect(el.querySelector('form')).toBeNull();
    expect(boton(el, 'Eliminar')).toBeUndefined();
    expect(boton(el, 'Ver rubros')).toBeTruthy();
  });
});
