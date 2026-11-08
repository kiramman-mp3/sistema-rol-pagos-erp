import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DetalleRol } from './detalle';
import { Avisos } from '../../core/avisos';
import { Sesion } from '../../core/sesion';

const BASE = {
  empleadoId: 1, cedula: '1801234566', cargo: 'Analista', sueldoBase: 1800, fechaIngreso: '2022-07-15',
  regimen: 'CODIGO_TRABAJO', regimenAplicado: 'CODIGO_TRABAJO', tasaIessPersonal: 0.0945, tasaIessPatronal: 0.1115,
  diasTrabajados: 30, mesesServicio: 50, valorHora: 7.5, sueldo: 1800,
  horasSuplementarias: 0, horasExtraordinarias: 0, horasDescanso: 0, horasNocturnas: 0,
  valorHorasSuplementarias: 0, valorHorasExtraordinarias: 0, valorHorasDescanso: 0, valorRecargoNocturno: 0,
  comisiones: 0, ingresosAportables: 1800, beneficiosMensuales: 340.11, totalIngresos: 2140.11,
  aporteIess: 170.1, baseIrAnual: 19560, irAnual: 0, impuestoRenta: 0, otrosDescuentos: 0, totalDescuentos: 170.1,
  netoPagar: 1970.01, decimoTercero: 150, decimoTerceroModalidad: 'mensual', decimoCuarto: 40.17,
  decimoCuartoModalidad: 'mensual', fondosReserva: 149.94, fondosReservaModalidad: 'mensual', vacaciones: 75,
  aportePatronal: 200.7, totalProvisiones: 275.7, costoEmpleador: 2415.81,
};

const ROL = {
  id: 1, anio: 2026, mes: 10, generadoEn: '2026-10-20T10:00:00', numEmpleados: 2,
  estado: 'calculado', tipo: 'ordinario', rolOrigenId: null, motivo: '', validadoEn: null, aprobadoEn: null, publicadoEn: null, pagadoEn: null,
  totalIngresos: 4140.11, totalDescuentos: 400, totalNeto: 3740.11, totalProvisiones: 700, totalCosto: 4840.11,
  detalle: [
    { ...BASE, id: 1, nombres: 'Ana Mensual' },
    {
      ...BASE, id: 2, nombres: 'Beto Acumula', decimoTerceroModalidad: 'acumulado', decimoCuartoModalidad: 'no',
      decimoCuarto: 0, fondosReservaModalidad: 'acumulado', beneficiosMensuales: 0, totalIngresos: 1800,
    },
  ],
};

const PARAMETROS = {
  sbu: 482, meses: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  empresa: { nombre: 'Empresa Demo S.A.', ruc: '1790000000001' },
  regimenes: [{ codigo: 'CODIGO_TRABAJO', nombre: 'Código del Trabajo' }],
};

const IESS = {
  anio: 2026, mes: 10,
  filas: [
    {
      cedula: '1801234566', nombres: 'Ana Mensual', regimenAplicado: 'CODIGO_TRABAJO', diasTrabajados: 30,
      materiaGravada: 1800, tasaPersonal: 0.0945, aportePersonal: 170.1, tasaPatronal: 0.1115, aportePatronal: 200.7,
      totalAportes: 370.8, fondosADepositar: 0, fondosPagadosEnRol: 149.94,
    },
    {
      cedula: '0903456788', nombres: 'Beto Acumula', regimenAplicado: 'CODIGO_TRABAJO', diasTrabajados: 30,
      materiaGravada: 1800, tasaPersonal: 0.0945, aportePersonal: 170.1, tasaPatronal: 0.1115, aportePatronal: 200.7,
      totalAportes: 370.8, fondosADepositar: 149.94, fondosPagadosEnRol: 0,
    },
  ],
  totales: {
    materiaGravada: 3600, aportePersonal: 340.2, aportePatronal: 401.4, totalAportes: 741.6,
    fondosADepositar: 149.94, fondosPagadosEnRol: 149.94,
  },
};

describe('DetalleRol', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Sesion).permisos.set(['ver', 'editar', 'validar', 'aprobar', 'publicar', 'pagar', 'usuarios']);
  });

  const abrirConEstado = async (estado = 'calculado', historial: unknown[] = []) => {
    const fixture = TestBed.createComponent(DetalleRol);
    fixture.componentRef.setInput('id', '1');
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/parametros').flush(PARAMETROS);
    http.expectOne('/api/roles/1').flush({ ...ROL, estado });
    http.expectOne('/api/roles/1/iess').flush(IESS);
    http.expectOne('/api/roles/1/historial').flush(historial);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  const abrir = async () => (await abrirConEstado()).nativeElement as HTMLElement;

  const botones = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());

  const filas = (el: HTMLElement) => [...el.querySelectorAll('section')].map((s) => [...s.querySelectorAll('tbody tr')]);

  it('suma los décimos y fondos pagados en el rol a los ingresos', async () => {
    const el = await abrir();
    expect(el.textContent).toContain('Décimos y fondos');
    const [ingresos] = filas(el);
    expect(ingresos[0].textContent).toContain('$340.11'); // lo que se paga en el rol
    expect(ingresos[0].textContent).toContain('$2,140.11');
    expect(ingresos[1].textContent).toContain('$0.00');
  });

  it('en provisiones solo muestra valor para lo que se acumula', async () => {
    const el = await abrir();
    const [, provisiones] = filas(el);
    const mensual = provisiones[0].textContent ?? '';
    expect(mensual).toContain('Pagado en el rol');
    expect(mensual).not.toContain('$150.00');

    const acumula = provisiones[1].textContent ?? '';
    expect(acumula).toContain('$150.00'); // décimo tercero acumulado
    expect(acumula).toContain('No recibe'); // décimo cuarto
    expect(acumula).toContain('$149.94'); // fondos de reserva acumulados
  });

  it('muestra el régimen y la tasa real del IESS de cada empleado', async () => {
    const el = await abrir();
    expect(el.textContent).toContain('Código del Trabajo');
    expect(el.textContent).toContain('9.45%');
    expect(el.textContent).toContain('11.15%');
  });

  it('muestra la conciliación con el IESS: materia gravada, aportes y fondos a depositar', async () => {
    const el = await abrir();
    const secciones = [...el.querySelectorAll('section')];
    const iess = secciones[secciones.length - 1];
    expect(iess.textContent).toContain('Conciliación con el IESS');
    const [mensual, acumula] = [...iess.querySelectorAll('tbody tr')].map((f) => f.textContent ?? '');
    expect(mensual).toContain('$1,800.00');
    expect(mensual).toContain('$170.10');
    expect(mensual).toContain('$370.80');
    expect(acumula).toContain('$149.94'); // fondos que se depositan en el IESS
    expect(iess.querySelector('tfoot')!.textContent).toContain('$741.60');
  });

  it('un rol calculado ofrece validar, recalcular y eliminar', async () => {
    const el = await abrir();
    expect(el.querySelector('h1')!.textContent).toContain('Calculado');
    expect(botones(el)).toContain('Validar el rol');
    expect(botones(el)).toContain('Eliminar rol');
    expect([...el.querySelectorAll('a')].some((a) => a.textContent?.includes('Recalcular'))).toBe(true);
  });

  it('valida el rol y muestra los errores que lo bloquean', async () => {
    const fixture = await abrirConEstado();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Validar el rol'))!.click();
    http.expectOne('/api/roles/1/validar').flush({
      valido: false, estado: 'calculado', errores: ['Ana Mensual: el neto a pagar es negativo (-5).'], avisos: [],
    });
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.tick();
    http.expectOne('/api/roles/1').flush({ ...ROL, estado: 'calculado' });
    http.expectOne('/api/roles/1/historial').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.revision')!.textContent).toContain('el neto a pagar es negativo');
  });

  it('un lector ve el rol completo pero ningún botón para moverlo', async () => {
    TestBed.inject(Sesion).permisos.set(['ver']);
    const el = (await abrirConEstado('calculado')).nativeElement as HTMLElement;
    expect(botones(el)).not.toContain('Validar el rol');
    expect(botones(el)).not.toContain('Eliminar rol');
    expect([...el.querySelectorAll('a')].some((a) => a.textContent?.includes('Recalcular'))).toBe(false);
    expect(el.textContent).toContain('tu rol no lo permite');
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('un aprobador puede aprobar, pero no eliminar ni recalcular el rol', async () => {
    TestBed.inject(Sesion).permisos.set(['ver', 'validar', 'aprobar', 'publicar']);
    const el = (await abrirConEstado('validado')).nativeElement as HTMLElement;
    expect(botones(el)).toContain('Aprobar');
    expect(botones(el)).not.toContain('Eliminar rol');
    expect([...el.querySelectorAll('a')].some((a) => a.textContent?.includes('Recalcular'))).toBe(false);
  });

  it('el paso de pagar no se ofrece a un aprobador', async () => {
    TestBed.inject(Sesion).permisos.set(['ver', 'validar', 'aprobar', 'publicar']);
    const el = (await abrirConEstado('publicado')).nativeElement as HTMLElement;
    expect(botones(el)).not.toContain('Marcar como pagado');
    expect(el.textContent).toContain('«Marcar como pagado»; tu rol no lo permite');
  });

  it('publicar pide confirmación antes de enviar nada', async () => {
    const fixture = await abrirConEstado('aprobado');
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Publicar')!.click();
    fixture.detectChanges();
    http.expectNone('/api/roles/1/publicar');
    expect(el.textContent).toContain('Ya no se podrá recalcular ni eliminar');

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Sí, publicar'))!.click();
    http.expectOne('/api/roles/1/publicar').flush({ ...ROL, estado: 'publicado' });
  });

  it('un rol publicado no se recalcula ni se elimina; solo falta pagarlo', async () => {
    const el = (await abrirConEstado('publicado', [
      { accion: 'rol.publicado', usuario: 'ana@empresa.com', detalle: null, creadoEn: '2026-10-21T09:30:00' },
    ])).nativeElement as HTMLElement;
    expect(botones(el)).not.toContain('Eliminar rol');
    expect([...el.querySelectorAll('a')].some((a) => a.textContent?.includes('Recalcular'))).toBe(false);
    expect(el.textContent).toContain('ya no se recalcula ni se elimina');
    expect(botones(el)).toContain('Marcar como pagado');
    expect(el.querySelector('.historial')!.textContent).toContain('Publicado por ana@empresa.com');
  });

  it('un rol pagado termina el ciclo', async () => {
    const el = (await abrirConEstado('pagado')).nativeElement as HTMLElement;
    expect(el.textContent).toContain('El rol está pagado: el ciclo terminó.');
    expect(el.querySelector('.ciclo li.actual')!.textContent).toContain('Pagado');
    expect(el.querySelectorAll('.ciclo li.hecho').length).toBe(4);
  });

  it('ofrece descargar los aportes para compararlos con el comprobante del IESS', async () => {
    const el = await abrir();
    const enlace = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('Aportes para el IESS'))!;
    expect(enlace.getAttribute('href')).toBe('/api/roles/1/iess.csv');
  });

  describe('reliquidación', () => {
    const ANA = { ...BASE, id: 1, nombres: 'Ana Mensual', cedula: '1801234566' };
    const BETO = { ...BASE, id: 2, nombres: 'Beto Acumula', cedula: '0903456788' };

    /** Abre el rol 1 con el cuerpo dado encima del rol de ejemplo. */
    const abrirCon = async (extra: object) => {
      const fixture = TestBed.createComponent(DetalleRol);
      fixture.componentRef.setInput('id', '1');
      fixture.detectChanges();
      TestBed.tick();
      http.expectOne('/api/parametros').flush(PARAMETROS);
      http.expectOne('/api/roles/1').flush({ ...ROL, ...extra });
      http.expectOne('/api/roles/1/iess').flush(IESS);
      http.expectOne('/api/roles/1/historial').flush([]);
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    };
    const publicado = { estado: 'publicado', ajustes: [], consolidado: null, vigente: [ANA, BETO] };
    const boton = (el: HTMLElement, texto: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!;

    it('un rol publicado ofrece reliquidar y uno sin publicar no', async () => {
      const { el } = await abrirCon(publicado);
      expect(el.querySelector('#titulo-ajustes')).not.toBeNull();
      expect(el.textContent).toContain('Este rol no tiene ajustes.');
      expect(boton(el, 'Reliquidar este rol')).toBeTruthy();
    });

    it('un rol sin publicar se corrige recalculándolo, no con un ajuste', async () => {
      const { el } = await abrirCon({ estado: 'aprobado' });
      expect(el.querySelector('#titulo-ajustes')).toBeNull();
    });

    it('un lector ve los ajustes pero no puede crear uno', async () => {
      TestBed.inject(Sesion).permisos.set(['ver']);
      const { el } = await abrirCon(publicado);
      expect(el.querySelector('#titulo-ajustes')).not.toBeNull();
      expect(el.textContent).not.toContain('Reliquidar este rol');
    });

    it('envía solo lo que se cambió, con el motivo, y abre el ajuste creado', async () => {
      const { fixture, el } = await abrirCon(publicado);
      boton(el, 'Reliquidar este rol').click();
      fixture.detectChanges();
      expect(el.querySelectorAll('form tbody tr').length).toBe(2);

      const motivo = el.querySelector<HTMLTextAreaElement>('#motivo-ajuste')!;
      motivo.value = 'Faltaron las comisiones';
      motivo.dispatchEvent(new Event('input'));
      const comisiones = el.querySelector<HTMLInputElement>('input[aria-label="Comisiones de Beto Acumula"]')!;
      expect(comisiones.value).toBe('0');
      comisiones.value = '200';
      comisiones.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      const envio = http.expectOne('/api/roles/1/reliquidar');
      expect(envio.request.method).toBe('POST');
      expect(envio.request.body).toEqual({
        motivo: 'Faltaron las comisiones',
        cambios: [{ cedula: '0903456788', comisiones: '200' }],
      });
      envio.flush({ id: 5, empleados: 1, avisos: [] }, { status: 201, statusText: 'Created' });
      await new Promise((resolver) => setTimeout(resolver));
    });

    it('muestra el motivo cuando el servidor rechaza el ajuste', async () => {
      const { fixture, el } = await abrirCon(publicado);
      boton(el, 'Reliquidar este rol').click();
      fixture.detectChanges();
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      http.expectOne('/api/roles/1/reliquidar').flush(
        { errores: ['Motivo: explica en 5 a 500 caracteres por qué se corrige el rol.'] },
        { status: 400, statusText: 'Bad Request' },
      );
      await new Promise((resolver) => setTimeout(resolver));
      expect(TestBed.inject(Avisos).lista()[0].texto).toContain('Motivo');
    });

    it('lista los ajustes y el total del mes con los ya publicados', async () => {
      const { el } = await abrirCon({
        ...publicado,
        ajustes: [{ id: 5, estado: 'publicado', motivo: 'Faltaron las comisiones', generadoEn: '2026-11-02T10:00:00', numEmpleados: 1, totalNeto: 233.5 }],
        consolidado: { totalIngresos: 4400, totalDescuentos: 430, totalNeto: 3973.61, totalProvisiones: 700, totalCosto: 5100 },
      });
      const enlace = [...el.querySelectorAll('.hoja-cuerpo table a')].find((a) => a.textContent?.includes('Rol 5'))!;
      expect(enlace.getAttribute('href')).toBe('/sistema/roles/5');
      expect(el.textContent).toContain('Faltaron las comisiones');
      expect(el.textContent).toContain('$3,973.61');
    });

    it('un ajuste avisa que sus cifras son diferencias y enlaza al rol original', async () => {
      const { el } = await abrirCon({
        tipo: 'ajuste', rolOrigenId: 3, motivo: 'Faltaron las comisiones', estado: 'calculado',
        origen: { id: 3, anio: 2026, mes: 10, estado: 'publicado' },
      });
      expect(el.querySelector('h1')!.textContent).toContain('Ajuste de Octubre 2026');
      const aviso = el.querySelector('.aviso')!;
      expect(aviso.textContent).toContain('Faltaron las comisiones');
      expect(aviso.textContent).toContain('diferencias');
      expect(aviso.querySelector('a')!.getAttribute('href')).toBe('/sistema/roles/3');
      expect(el.querySelector('#titulo-ajustes')).toBeNull();
    });
  });
});
