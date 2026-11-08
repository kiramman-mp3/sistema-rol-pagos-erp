import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DesgloseCalculo } from './desglose';

const TRAZA = {
  cedula: '1801234566', nombres: 'Ana Mensual', anio: 2026, mes: 10, ajuste: false,
  contexto: { regimen: 'CODIGO_TRABAJO', vigenteDesde: '2026-10-01', anioParametros: 2026, sbu: 482 },
  pasos: [
    { clave: 'diasTrabajados', concepto: 'Días trabajados', formula: '30, salvo en el mes de ingreso', detalle: 'mes completo: 30 días', resultado: 30 },
    { clave: 'sueldo', concepto: 'Sueldo del mes', formula: 'sueldo base × días trabajados ÷ 30', detalle: '1800.00 × 30 ÷ 30 = 1800.00', resultado: 1800 },
    {
      clave: 'vacaciones', concepto: 'Provisión de vacaciones', formula: 'ingresos aportables × días ÷ 360',
      detalle: '1800.00 × 15 ÷ 360 = 75.00', resultado: 75, fuente: 'Código del Trabajo art. 71',
    },
    { clave: 'netoPagar', concepto: 'Neto a pagar', formula: 'ingresos − descuentos', detalle: '2140.11 − 170.10 = 1970.01', resultado: 1970.01 },
  ],
};

describe('DesgloseCalculo', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  const abrir = async (respuesta: () => void) => {
    const fixture = TestBed.createComponent(DesgloseCalculo);
    fixture.componentRef.setInput('rolId', 4);
    fixture.componentRef.setInput('cedula', '1801234566');
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/parametros').flush({ regimenes: [{ codigo: 'CODIGO_TRABAJO', nombre: 'Código del Trabajo' }] });
    respuesta();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('pide la traza del empleado y muestra cada paso con su fórmula y sus números', async () => {
    const el = await abrir(() => http.expectOne('/api/roles/4/traza/1801234566').flush(TRAZA));
    const filas = [...el.querySelectorAll('tbody tr')];
    expect(filas.length).toBe(4);
    expect(filas[1].textContent).toContain('Sueldo del mes');
    expect(filas[1].textContent).toContain('sueldo base × días trabajados ÷ 30');
    expect(filas[1].textContent).toContain('1800.00 × 30 ÷ 30 = 1800.00');
    expect(filas[1].textContent).toContain('$1,800.00');
  });

  it('los días no se muestran como dinero y la fuente aparece bajo el concepto', async () => {
    const el = await abrir(() => http.expectOne('/api/roles/4/traza/1801234566').flush(TRAZA));
    const filas = [...el.querySelectorAll('tbody tr')];
    expect(filas[0].querySelector('td.num')!.textContent?.trim()).toBe('30');
    expect(filas[2].textContent).toContain('Código del Trabajo art. 71');
  });

  it('dice con qué régimen, versión y parámetros se calculó', async () => {
    const el = await abrir(() => http.expectOne('/api/roles/4/traza/1801234566').flush(TRAZA));
    const contexto = el.querySelector('.contexto')!.textContent ?? '';
    expect(contexto).toContain('Código del Trabajo');
    expect(contexto).toContain('vigentes desde 2026-10-01');
    expect(contexto).toContain('parámetros de 2026');
    expect(contexto).toContain('$482.00');
    expect(contexto).not.toContain('ajuste');
  });

  it('en un ajuste avisa que explica el mes completo', async () => {
    const el = await abrir(() => http.expectOne('/api/roles/4/traza/1801234566').flush({ ...TRAZA, ajuste: true }));
    expect(el.querySelector('.contexto')!.textContent).toContain('guarda solo la diferencia');
  });

  it('un rol anterior al desglose lo explica en vez de fallar', async () => {
    const el = await abrir(() =>
      http.expectOne('/api/roles/4/traza/1801234566').flush(
        { errores: ['Este rol se calculó antes de que se guardara el desglose: no hay cómo explicarlo.'] },
        { status: 404, statusText: 'Not Found' },
      ));
    expect(el.textContent).toContain('antes de que el sistema lo guardara');
    expect(el.querySelector('table')).toBeNull();
  });
});
