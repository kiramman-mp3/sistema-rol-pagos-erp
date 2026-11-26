import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, computed, inject, input, signal,
} from '@angular/core';

export type EstadoGalo = 'atento' | 'calculando' | 'cuadro' | 'no-cuadra';

const ETIQUETAS: Record<EstadoGalo, string> = {
  atento: 'Galo, la tortuga de Cuadra',
  calculando: 'Galo está haciendo las cuentas',
  cuadro: 'Galo celebra: todo cuadra',
  'no-cuadra': 'Galo avisa que algo no cuadra',
};

const BOCA: Record<EstadoGalo, string> = {
  atento: 'M211 113 q8 6 16 -2',
  calculando: 'M212 114 h12',
  cuadro: 'M208 110 q11 14 23 -1',
  'no-cuadra': 'M210 116 q4 -4 8 0 t8 0',
};

let contador = 0;

/**
 * Galo, la tortuga de Galápagos que acompaña a Cuadra. Tiene cuatro estados:
 * atento (reposo), calculando, cuadró (todo bien) y no cuadra (hay una diferencia que revisar).
 * Cada estado tiene su propia animación; con «reducir movimiento» activado queda quieto.
 * Con `interactivo`, un clic esconde la cabeza y las patas en el caparazón.
 *
 * Solo va donde no hay montos: portada, estados vacíos, cargas y avisos de éxito.
 */
@Component({
  selector: 'app-galo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'ancho()',
    '[attr.role]': 'interactivo() ? "button" : null',
    '[attr.tabindex]': 'interactivo() ? 0 : null',
    '[attr.aria-label]': 'interactivo() ? "Toca a Galo para que se esconda en su caparazón" : null',
    '[class.interactivo]': 'interactivo()',
    '[class.escondido]': 'escondido()',
    '[class.pausado]': '!visible()',
    '(click)': 'esconder()',
    '(keydown.enter)': 'esconder()',
    '(keydown.space)': 'esconder(); $event.preventDefault()',
  },
  styles: `
    :host { display: block; line-height: 0; }
    :host(.interactivo) { cursor: pointer; border-radius: 16px; }
    svg { width: 100%; height: auto; overflow: visible; }
    text { font-family: var(--display, 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif); font-weight: 800; text-anchor: middle; }

    /* Todo gira alrededor de puntos del propio dibujo (coordenadas del viewBox). */
    .suelo { opacity: .12; transform-origin: 118px 176px; }
    .cuerpo, .cabeza, .cuello, .pata, .cola, .ojo, .burbuja, .confeti > * { transform-box: view-box; }
    .cuerpo { transform-origin: 105px 172px; }
    .cabeza, .cuello { transform-origin: 184px 120px; transition: transform .4s cubic-bezier(.34, 1.56, .64, 1); }
    .pata { transform-origin: 0 0; transition: transform .35s cubic-bezier(.34, 1.56, .64, 1); }
    .pata-a { transform-origin: 63px 130px; }
    .pata-b { transform-origin: 143px 130px; }
    .cola { transform-origin: 30px 140px; transition: transform .3s ease; }
    .ojo { transform-origin: 218px 98px; }

    /* Fuera de pantalla no se mueve: la celebración empieza cuando Galo aparece. */
    :host(.pausado) * { animation-play-state: paused !important; }

    /* Click: se esconde en el caparazón. */
    :host(.escondido) .cabeza, :host(.escondido) .cuello { transform: translate(-6px, 8px) scale(.18); }
    :host(.escondido) .pata { transform: scaleY(.15); }
    :host(.escondido) .cola { transform: scale(.1); }

    @media (prefers-reduced-motion: no-preference) {
      /* Reposo: respira, parpadea y mueve un poco la cabeza. */
      .atento .cuerpo { animation: respira 3.6s ease-in-out infinite; }
      .atento .cabeza { animation: asiente 6s ease-in-out infinite; }
      .atento .ojo, .no-cuadra .ojo, .calculando .ojo { animation: parpadea 5.2s infinite; }
      .atento .suelo { animation: sombra 3.6s ease-in-out infinite; }

      /* Calculando: camina en su lugar y las piezas del caparazón se encienden una tras otra. */
      .calculando .cuerpo { animation: camina-cuerpo .7s ease-in-out infinite; }
      .calculando .pata-a { animation: paso .7s ease-in-out infinite; }
      .calculando .pata-b { animation: paso .7s ease-in-out infinite .35s; }
      .calculando .cabeza { animation: mira-arriba 2.4s ease-in-out infinite; }
      .calculando .pieza { animation: enciende 1.6s ease-in-out infinite; }
      .calculando .p2 { animation-delay: .4s; } .calculando .p3 { animation-delay: .8s; } .calculando .p4 { animation-delay: 1.2s; }
      .calculando .punto { animation: punto 1.2s ease-in-out infinite; }
      .calculando .punto-2 { animation-delay: .2s; }

      /* Cuadró: salta de alegría y suelta confeti. */
      .cuadro .cuerpo { animation: salto 1.8s cubic-bezier(.3, .7, .4, 1) 3; }
      .cuadro .burbuja { animation: aparece .5s cubic-bezier(.34, 1.56, .64, 1) both; }
      .cuadro .confeti > * { animation: cae 2.2s ease-in 2 backwards; }
      .cuadro .confeti > *:nth-child(2) { animation-delay: .35s; }
      .cuadro .confeti > *:nth-child(3) { animation-delay: .7s; }
      .cuadro .confeti > *:nth-child(4) { animation-delay: 1.05s; }
      .cuadro .suelo { animation: sombra-salto 1.8s cubic-bezier(.3, .7, .4, 1) 3; }

      /* No cuadra: niega con la cabeza, sin dramatismo. */
      .no-cuadra .cabeza { animation: niega 2.6s ease-in-out infinite; }
      .no-cuadra .burbuja { animation: aparece .45s cubic-bezier(.34, 1.56, .64, 1) both, tiembla 3s ease-in-out .6s infinite; }
    }

    @keyframes respira { 50% { transform: translateY(-3px) scaleY(1.012); } }
    @keyframes asiente { 0%, 55%, 100% { transform: rotate(0); } 70% { transform: rotate(-3.5deg); } 85% { transform: rotate(1.5deg); } }
    @keyframes parpadea { 0%, 91%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.08); } }
    @keyframes sombra { 50% { transform: scaleX(.96); opacity: .09; } }

    @keyframes camina-cuerpo { 50% { transform: translateY(-4px) rotate(-1deg); } }
    @keyframes paso { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-9px) rotate(-10deg); } }
    @keyframes mira-arriba { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-5deg); } }
    @keyframes enciende { 0%, 100% { opacity: .55; } 40% { opacity: 1; } }
    @keyframes punto { 0%, 100% { transform: scale(1); opacity: .6; } 50% { transform: scale(1.5); opacity: 1; } }

    @keyframes salto {
      0%, 100% { transform: translateY(0) scale(1.05, .93); }
      18% { transform: translateY(0) scale(.97, 1.04); }
      45% { transform: translateY(-26px) scale(1, 1); }
      70% { transform: translateY(0) scale(1.05, .93); }
      80% { transform: translateY(-4px) scale(1); }
    }
    @keyframes sombra-salto { 45% { transform: scaleX(.7); opacity: .06; } }
    @keyframes aparece { from { transform: scale(0); } to { transform: scale(1); } }
    @keyframes cae {
      0% { transform: translateY(-14px) rotate(0); opacity: 0; }
      15% { opacity: 1; }
      100% { transform: translateY(70px) rotate(240deg); opacity: 0; }
    }

    @keyframes niega { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(5deg); } 30% { transform: rotate(-5deg); } 45% { transform: rotate(3deg); } 60% { transform: rotate(0); } }
    @keyframes tiembla { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-4deg); } }
    .burbuja { transform-origin: 224px 40px; }
  `,
  template: `
    <svg
      viewBox="0 0 270 190"
      [class]="estado()"
      [attr.role]="decorativo() ? null : 'img'"
      [attr.aria-label]="decorativo() ? null : etiqueta()"
      [attr.aria-hidden]="decorativo() ? 'true' : null"
      focusable="false"
    >
      <ellipse class="suelo" cx="118" cy="176" rx="92" ry="7" fill="#17163a" />

      <g class="cuerpo">
        <path class="cola" d="M30 134 L8 146 L32 150 Z" fill="#ffc93c" stroke="#17163a" stroke-width="4" stroke-linejoin="round" />
        <rect class="pata pata-a" x="48" y="128" width="30" height="44" rx="13" fill="#ffc93c" stroke="#17163a" stroke-width="4" />
        <rect class="pata pata-b" x="128" y="128" width="30" height="44" rx="13" fill="#ffc93c" stroke="#17163a" stroke-width="4" />
        <rect class="cuello" x="168" y="100" width="34" height="44" rx="15" fill="#ffc93c" stroke="#17163a" stroke-width="4" />

        <!-- Caparazón: las cuatro piezas de la boleta -->
        <clipPath [id]="idCaparazon"><path [attr.d]="domo" /></clipPath>
        <g [attr.clip-path]="'url(#' + idCaparazon + ')'">
          <rect x="0" y="40" width="270" height="110" fill="#ffffff" />
          <polygon class="pieza p1" points="105,142 -115,142 -50.6,-13.6" fill="#2b44d6" />
          <polygon class="pieza p2" points="105,142 -50.6,-13.6 105,-78" fill="#ef4b3c" />
          <polygon class="pieza p3" points="105,142 105,-78 260.6,-13.6" fill="#0b7f55" />
          <polygon class="pieza p4" points="105,142 260.6,-13.6 325,142" fill="#e39a1b" />
          <rect x="0" y="127" width="270" height="15" fill="#18237a" />
          <g stroke="#17163a" stroke-width="3.5" stroke-linecap="round">
            <line x1="105" y1="142" x2="-50.6" y2="-13.6" />
            <line x1="105" y1="142" x2="105" y2="-78" />
            <line x1="105" y1="142" x2="260.6" y2="-13.6" />
          </g>
        </g>
        <path [attr.d]="domo" fill="none" stroke="#17163a" stroke-width="4" stroke-linejoin="round" />
        <line x1="25" y1="142" x2="185" y2="142" stroke="#17163a" stroke-width="4" stroke-linecap="round" />

        <g class="cabeza">
          <ellipse cx="206" cy="104" rx="28" ry="25" fill="#ffc93c" stroke="#17163a" stroke-width="4" />
          <circle cx="224" cy="110" r="4.2" fill="#ef4b3c" opacity=".55" />
          <circle cx="216" cy="98" r="10.5" fill="#fff" stroke="#17163a" stroke-width="3" />
          <path d="M205.5 98 L196 96" stroke="#17163a" stroke-width="3" stroke-linecap="round" />
          @switch (estado()) {
            @case ('calculando') { <circle class="ojo" cx="215" cy="93" r="3.6" fill="#17163a" /> }
            @case ('cuadro') { <path d="M208 101 q8 -10 16 0" fill="none" stroke="#17163a" stroke-width="3.5" stroke-linecap="round" /> }
            @case ('no-cuadra') {
              <circle class="ojo" cx="212" cy="100" r="3.6" fill="#17163a" />
              <path d="M203 84 l16 -6" fill="none" stroke="#17163a" stroke-width="3.5" stroke-linecap="round" />
            }
            @default { <circle class="ojo" cx="218" cy="98" r="3.6" fill="#17163a" /> }
          }
          <path [attr.d]="boca()" fill="none" stroke="#17163a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </g>

      @switch (estado()) {
        @case ('calculando') {
          <g class="burbuja">
            <rect x="186" y="6" width="76" height="34" rx="17" fill="#fff" stroke="#17163a" stroke-width="3" />
            <text x="224" y="30" font-size="20" fill="#18237a">= ?</text>
          </g>
          <circle class="punto punto-1" cx="206" cy="51" r="4.5" fill="#fff" stroke="#17163a" stroke-width="2.5" />
          <circle class="punto punto-2" cx="198" cy="62" r="2.8" fill="#fff" stroke="#17163a" stroke-width="2.5" />
        }
        @case ('cuadro') {
          <g class="burbuja">
            <rect x="164" y="8" width="100" height="34" rx="17" fill="#dcf7ea" stroke="#17163a" stroke-width="3" />
            <text x="214" y="31" font-size="17" fill="#0b7f55">¡Cuadró!</text>
          </g>
          <g class="confeti">
            <circle cx="22" cy="40" r="5" fill="#ef4b3c" />
            <rect x="62" y="20" width="9" height="9" fill="#2b44d6" />
            <circle cx="118" cy="22" r="4.5" fill="#ffc93c" stroke="#17163a" stroke-width="2" />
            <rect x="150" y="30" width="8" height="8" fill="#0b7f55" />
          </g>
        }
        @case ('no-cuadra') {
          <g class="burbuja">
            <rect x="196" y="6" width="62" height="36" rx="18" fill="#ffece8" stroke="#17163a" stroke-width="3" />
            <text x="227" y="33" font-size="26" fill="#c8382a">≠</text>
          </g>
          <circle cx="208" cy="53" r="4.5" fill="#fff" stroke="#17163a" stroke-width="2.5" />
          <circle cx="200" cy="64" r="2.8" fill="#fff" stroke="#17163a" stroke-width="2.5" />
        }
      }
    </svg>
  `,
})
export class Galo implements OnDestroy {
  readonly estado = input<EstadoGalo>('atento');
  /** Ancho CSS; el alto sale de la proporción. */
  readonly ancho = input('12rem');
  /** Si es verdadero, un clic lo esconde en su caparazón. */
  readonly interactivo = input(false);
  /** Adorno sin significado propio: se oculta a los lectores de pantalla. */
  readonly decorativo = input(true);

  protected readonly etiqueta = computed(() => ETIQUETAS[this.estado()]);
  protected readonly boca = computed(() => BOCA[this.estado()]);
  protected readonly domo = 'M25 142 C25 82 62 48 105 48 C148 48 185 82 185 142 Z';
  protected readonly id = `galo-${++contador}`;
  protected readonly idCaparazon = `${this.id}-caparazon`;

  protected readonly escondido = signal(false);
  protected readonly visible = signal(true);
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  private observador: IntersectionObserver | undefined;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      this.observador = new IntersectionObserver(([entrada]) => this.visible.set(entrada.isIntersecting));
      this.observador.observe(host);
    });
  }

  protected esconder() {
    if (!this.interactivo() || this.escondido()) return;
    this.escondido.set(true);
    this.temporizador = setTimeout(() => this.escondido.set(false), 1500);
  }

  ngOnDestroy() {
    clearTimeout(this.temporizador);
    this.observador?.disconnect();
  }
}
