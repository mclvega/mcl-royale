import type { WebGLRenderer } from 'three';

/*
 * Rendimiento común de los juegos 3D (ver PLAN-rendimiento.md). Se copia tal cual a `src/rendimiento.ts`.
 * - Calidad: «Auto» ajusta la resolución según los FPS; «Baja» sin sombras y a resolución 1; «Alta» con todo.
 * - Límite de FPS (30, 60 o máximo) y render a 10 FPS con el juego en pausa o en un menú.
 * - Monitor `?perf`: FPS, ms de lógica y de render, llamadas de dibujo, triángulos, geometrías, texturas y memoria.
 */

export type Calidad = 'auto' | 'baja' | 'alta';
export type LimiteFps = 30 | 60 | 0;

export const CALIDADES: Array<[Calidad, string]> = [['auto', 'Auto'], ['baja', 'Baja'], ['alta', 'Alta']];
export const LIMITES_FPS: Array<[LimiteFps, string]> = [[30, '30'], [60, '60'], [0, 'Máximo']];

const movil = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Resolución máxima según la calidad: 1,5 en móvil (2 en Alta) y 1 en Baja. */
export function ratioMaximo(calidad: Calidad, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): number {
  if (calidad === 'baja') return 1;
  return Math.min(dpr || 1, calidad === 'alta' ? 2 : movil() ? 1.5 : 2);
}

/** Tamaño del mapa de sombras (0 = sin sombras). */
export function tamanoSombras(calidad: Calidad): number {
  return calidad === 'baja' ? 0 : calidad === 'alta' && !movil() ? 2048 : 1024;
}

export class Rendimiento {
  /** Resolución actual del render (la calidad automática la sube o la baja). */
  ratio = 1;
  private ultimoDibujo = 0;
  private acumulado = 0;
  private cuadros = 0;
  private bueno = 0;
  private logica = 0;
  private render = 0;
  private fps = 60;
  private monitor: HTMLElement | null = null;
  private monitorT = 0;
  private calidadActual: Calidad;

  constructor(
    private calidad: () => Calidad,
    private limite: () => LimiteFps,
    /** Aplica una nueva resolución (normalmente llamando a `ajustar` de la escena). */
    private aplicar: (ratio: number) => void,
  ) {
    this.calidadActual = calidad();
    this.ratio = ratioMaximo(this.calidadActual);
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf')) {
      this.monitor = document.createElement('pre');
      this.monitor.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#9f9;background:rgb(0 0 0 / 0.75);border:1px solid #222;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.append(this.monitor);
    }
  }

  /** Al cambiar la calidad en Configuración. */
  reiniciar() {
    this.ratio = ratioMaximo(this.calidad());
    this.bueno = 0;
    this.aplicar(this.ratio);
  }

  /** ¿Toca dibujar este fotograma? Respeta el límite de FPS y baja a 10 FPS en pausa. */
  debeDibujar(ahora: number, enPausa: boolean): boolean {
    if (this.calidad() !== this.calidadActual) {
      this.calidadActual = this.calidad();
      this.reiniciar();
    }
    const limite = enPausa ? 10 : this.limite();
    // Margen de 1 ms para no saltar fotogramas por el redondeo del reloj.
    if (limite && ahora - this.ultimoDibujo < 1000 / limite - 1) return false;
    const dt = ahora - this.ultimoDibujo;
    this.ultimoDibujo = ahora;
    if (dt > 0 && dt < 1000) {
      this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
      if (!enPausa) this.adaptar(dt);
    }
    return true;
  }

  /** Mide un tramo (lógica o render) para el monitor. */
  medir<T>(tipo: 'logica' | 'render', fn: () => T): T {
    if (!this.monitor) return fn();
    const t0 = performance.now();
    const r = fn();
    const ms = performance.now() - t0;
    if (tipo === 'logica') this.logica = this.logica * 0.9 + ms * 0.1;
    else this.render = this.render * 0.9 + ms * 0.1;
    return r;
  }

  get fpsMedios() {
    return this.fps;
  }

  /** Calidad automática: cada 2 s mira el tiempo medio por fotograma. */
  private adaptar(dt: number) {
    if (this.calidad() !== 'auto') return;
    this.acumulado += dt;
    this.cuadros++;
    if (this.acumulado < 2000) return;
    const medio = this.acumulado / this.cuadros;
    this.acumulado = 0;
    this.cuadros = 0;
    const objetivo = this.limite() === 30 ? 1000 / 30 : 1000 / 60;
    const maximo = ratioMaximo('auto');
    if (medio > objetivo * 1.2 && this.ratio > 0.75) {
      // Va lento: menos resolución.
      this.ratio = Math.max(0.75, this.ratio - 0.25);
      this.bueno = 0;
      this.aplicar(this.ratio);
    } else if (medio < objetivo * 1.05 && this.ratio < maximo) {
      // Tres tramos seguidos holgados: se prueba a subir.
      if (++this.bueno >= 3) {
        this.ratio = Math.min(maximo, this.ratio + 0.25);
        this.bueno = 0;
        this.aplicar(this.ratio);
      }
    } else this.bueno = 0;
  }

  /** Actualiza el monitor `?perf` (4 veces por segundo). */
  actualizarMonitor(renderer: WebGLRenderer | null) {
    if (!this.monitor) return;
    const ahora = performance.now();
    if (ahora - this.monitorT < 250) return;
    this.monitorT = ahora;
    const info = renderer?.info;
    const memoria = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    this.monitor.textContent = [
      `FPS ${this.fps.toFixed(0)} · resolución ×${this.ratio}`,
      `lógica ${this.logica.toFixed(2)} ms · render ${this.render.toFixed(2)} ms`,
      info ? `llamadas ${info.render.calls} · triángulos ${info.render.triangles}` : '',
      info ? `geometrías ${info.memory.geometries} · texturas ${info.memory.textures}` : '',
      memoria ? `heap ${(memoria.usedJSHeapSize / 1048576).toFixed(1)} MB` : '',
    ].filter(Boolean).join('\n');
  }
}

/**
 * Libera las geometrías de un objeto que sale de la escena. Los materiales no se tocan:
 * en estos juegos están en cachés compartidas por color.
 */
export function liberar(obj: { traverse: (fn: (o: unknown) => void) => void }) {
  obj.traverse((o) => (o as { geometry?: { dispose: () => void } }).geometry?.dispose());
}
