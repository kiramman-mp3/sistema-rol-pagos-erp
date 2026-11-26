import { httpResource } from '@angular/common/http';
import { PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ParametrosLey, valorSeguro } from '../core/api';
import { DineroPipe } from '../core/dinero.pipe';
import type { ResultadoSimulacion } from '../core/modelos';
import { Concha } from '../marca/concha';
import { Escalon } from '../marca/escalon';
import { Galo, type EstadoGalo } from '../marca/galo';

/** Página de inicio pública: explica el sistema y lleva a /sistema. */
@Component({
  selector: 'app-landing',
  imports: [Concha, Escalon, Galo, RouterLink, DineroPipe, PercentPipe],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly parametros = inject(ParametrosLey);
  protected readonly ley = this.parametros.valor;
  protected readonly reglasPropias = computed(
    () => this.ley()?.regimenes.filter((r) => r.tipo === 'reglas') ?? [],
  );

  // --- Simulador: se calcula en el servidor, con el mismo motor del sistema ---
  protected readonly sueldo = signal('1200');
  protected readonly horas = signal('');
  /** Espera a que termine de escribir para no consultar en cada tecla. */
  private readonly consulta = signal({
    sueldo: 1200, horasSuplementarias: 0, regimen: 'CODIGO_TRABAJO', categoriaLoep: 'servidor',
    decimos: 'mensual',
  });
  protected readonly decimos = signal('mensual');
  protected readonly regimen = signal('CODIGO_TRABAJO');
  protected readonly categoria = signal('servidor');
  protected readonly esMixto = computed(
    () => this.ley()?.regimenes.find((r) => r.codigo === this.regimen())?.tipo === 'mixto',
  );

  protected readonly entradaValida = computed(() => this.consulta().sueldo > 0);

  protected readonly simulacion = httpResource<ResultadoSimulacion>(() => {
    const c = this.consulta();
    if (c.sueldo <= 0) return undefined;
    return {
      url: '/api/simulacion',
      method: 'POST',
      body: {
        sueldo: c.sueldo,
        horasSuplementarias: c.horasSuplementarias,
        regimen: c.regimen,
        categoriaLoep: c.regimen === 'LOEP' ? c.categoriaLoep : undefined,
        decimos: c.decimos,
      },
    };
  });

  protected readonly resultado = valorSeguro(this.simulacion);

  /** Verdadero desde que se toca un campo hasta que se envía la consulta (ya esperó a que terminaras de escribir). */
  private readonly escribiendo = signal(true);

  /** Galo acompaña al simulador: calcula mientras esperas y celebra cuando el rol cuadra. */
  protected readonly estadoGalo = computed<EstadoGalo>(() => {
    if (!this.entradaValida()) return 'atento';
    if (this.escribiendo() || this.simulacion.isLoading()) return 'calculando';
    if (this.simulacion.error()) return 'no-cuadra';
    return this.resultado() ? 'cuadro' : 'atento';
  });

  constructor() {
    effect((alLimpiar) => {
      this.escribiendo.set(true);
      const sueldo = Number(this.sueldo().replace(',', '.'));
      const horasSuplementarias = Number(this.horas().replace(',', '.')) || 0;
      const regimen = this.regimen();
      const categoriaLoep = this.categoria();
      const decimos = this.decimos();
      const temporizador = setTimeout(() => {
        this.consulta.set({
          sueldo: Number.isFinite(sueldo) ? sueldo : 0, horasSuplementarias, regimen, categoriaLoep, decimos,
        });
        this.escribiendo.set(false);
      }, 250);
      alLimpiar(() => clearTimeout(temporizador));
    });
  }

  protected elegir(campo: 'regimen' | 'categoria' | 'decimos', evento: Event) {
    const senal = { regimen: this.regimen, categoria: this.categoria, decimos: this.decimos }[campo];
    senal.set((evento.target as HTMLSelectElement).value);
  }

  protected escribir(campo: 'sueldo' | 'horas', evento: Event) {
    (campo === 'sueldo' ? this.sueldo : this.horas).set((evento.target as HTMLInputElement).value);
  }

  protected readonly anio = new Date().getFullYear();
}
