import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AvisoGalo } from './aviso-galo';
import { Concha } from './concha';
import { EstadoGalo, Galo } from './galo';

@Component({
  imports: [Galo],
  template: `<app-galo [estado]="estado" [interactivo]="interactivo" [decorativo]="decorativo" />`,
})
class Anfitrion {
  estado: EstadoGalo = 'atento';
  interactivo = false;
  decorativo = true;
}

function montar(config: Partial<Anfitrion> = {}) {
  const fixture = TestBed.createComponent(Anfitrion);
  Object.assign(fixture.componentInstance, config);
  fixture.detectChanges();
  return fixture;
}

describe('Galo', () => {
  it.each(['atento', 'calculando', 'cuadro', 'no-cuadra'] as EstadoGalo[])('dibuja el estado %s', (estado) => {
    const svg = montar({ estado }).nativeElement.querySelector('svg');
    expect(svg.classList.contains(estado)).toBe(true);
    expect(svg.querySelectorAll('.pieza').length).toBe(4);
  });

  it('cada estado trae su propio mensaje en la burbuja', () => {
    const texto = (estado: EstadoGalo) => montar({ estado }).nativeElement.querySelector('svg').textContent;
    expect(texto('cuadro')).toContain('¡Cuadró!');
    expect(texto('calculando')).toContain('= ?');
    expect(texto('no-cuadra')).toContain('≠');
    expect(texto('atento').trim()).toBe('');
  });

  it('es decorativo por defecto y se anuncia solo si se pide', () => {
    expect(montar().nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    const svg = montar({ decorativo: false, estado: 'cuadro' }).nativeElement.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('todo cuadra');
  });

  it('cada instancia usa su propio recorte para el caparazón', () => {
    const a = montar().nativeElement.querySelector('clipPath').id;
    const b = montar().nativeElement.querySelector('clipPath').id;
    expect(a).not.toBe(b);
  });

  describe('interactivo', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('un clic lo esconde en el caparazón y luego vuelve a asomar', () => {
      const fixture = montar({ interactivo: true });
      const galo: HTMLElement = fixture.nativeElement.querySelector('app-galo');
      expect(galo.getAttribute('role')).toBe('button');
      galo.click();
      fixture.detectChanges();
      expect(galo.classList.contains('escondido')).toBe(true);
      vi.advanceTimersByTime(1600);
      fixture.detectChanges();
      expect(galo.classList.contains('escondido')).toBe(false);
    });

    it('si no es interactivo, el clic no hace nada', () => {
      const fixture = montar();
      const galo: HTMLElement = fixture.nativeElement.querySelector('app-galo');
      galo.click();
      fixture.detectChanges();
      expect(galo.classList.contains('escondido')).toBe(false);
      expect(galo.getAttribute('role')).toBeNull();
    });
  });
});

describe('AvisoGalo', () => {
  it('muestra a Galo con el mensaje proyectado', () => {
    @Component({ imports: [AvisoGalo], template: `<app-aviso-galo estado="no-cuadra">Algo no cuadra</app-aviso-galo>` })
    class Prueba {}
    const fixture = TestBed.createComponent(Prueba);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Algo no cuadra');
    expect(fixture.nativeElement.querySelector('svg.no-cuadra')).not.toBeNull();
  });
});

describe('Concha', () => {
  it('dibuja las cuatro piezas con el ancho pedido', () => {
    @Component({ imports: [Concha], template: `<app-concha ancho="3rem" />` })
    class Prueba {}
    const fixture = TestBed.createComponent(Prueba);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('polygon').length).toBe(4);
    expect(fixture.nativeElement.querySelector('app-concha').style.width).toBe('3rem');
  });
});
