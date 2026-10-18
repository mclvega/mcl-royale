/**
 * Entrada unificada: teclado, mando y pantalla táctil.
 * - `x`, `y`: dirección en [-1, 1] (flechas/WASD, stick izquierdo o joystick táctil flotante en la mitad izquierda).
 * - `botones`: acciones con nombre, asociadas a teclas, botones del mando y botones táctiles.
 */
export interface BotonDef {
  nombre: string;
  teclas: string[];
  mando: number;
  etiqueta: string;
}

export class Entrada {
  x = 0;
  y = 0;
  private teclas = new Set<string>();
  private toque = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private tactiles = new Set<string>();
  private anteriores = new Set<string>();
  private actuales = new Set<string>();
  private base?: HTMLElement;
  private perilla?: HTMLElement;

  constructor(private defs: BotonDef[], contenedor: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.teclas.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
    window.addEventListener('blur', () => this.teclas.clear());
    this.montarTactil(contenedor);
  }

  private montarTactil(contenedor: HTMLElement) {
    const zona = document.createElement('div');
    zona.className = 'zona-joystick';
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.perilla = document.createElement('div');
    this.perilla.className = 'perilla';
    this.base.append(this.perilla);
    zona.append(this.base);
    contenedor.append(zona);

    zona.addEventListener('pointerdown', (e) => {
      if (this.toque.id !== -1) return;
      zona.setPointerCapture(e.pointerId);
      this.toque = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.base!.style.left = `${e.clientX}px`;
      this.base!.style.top = `${e.clientY}px`;
      this.base!.classList.add('visible');
    });
    zona.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.toque.id) return;
      this.toque.x = e.clientX;
      this.toque.y = e.clientY;
    });
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== this.toque.id) return;
      this.toque.id = -1;
      this.base!.classList.remove('visible');
    };
    zona.addEventListener('pointerup', soltar);
    zona.addEventListener('pointercancel', soltar);

    const fila = document.createElement('div');
    fila.className = 'botones-tactiles';
    for (const d of this.defs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton-tactil';
      b.textContent = d.etiqueta;
      b.setAttribute('aria-label', d.nombre);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.tactiles.add(d.nombre);
      });
      const fin = () => this.tactiles.delete(d.nombre);
      b.addEventListener('pointerup', fin);
      b.addEventListener('pointerleave', fin);
      b.addEventListener('pointercancel', fin);
      fila.append(b);
    }
    contenedor.append(fila);
  }

  /** Se llama una vez por paso de simulación. */
  actualizar() {
    let x = 0;
    let y = 0;
    const t = this.teclas;
    if (t.has('ArrowLeft') || t.has('KeyA')) x -= 1;
    if (t.has('ArrowRight') || t.has('KeyD')) x += 1;
    if (t.has('ArrowUp') || t.has('KeyW')) y -= 1;
    if (t.has('ArrowDown') || t.has('KeyS')) y += 1;

    const mando = navigator.getGamepads?.().find((m) => m) ?? null;
    if (mando) {
      const [ax = 0, ay = 0] = mando.axes;
      if (Math.hypot(ax, ay) > 0.25) {
        x = ax;
        y = ay;
      }
      if (mando.buttons[14]?.pressed) x = -1;
      if (mando.buttons[15]?.pressed) x = 1;
      if (mando.buttons[12]?.pressed) y = -1;
      if (mando.buttons[13]?.pressed) y = 1;
    }

    if (this.toque.id !== -1) {
      const radio = 50;
      let dx = this.toque.x - this.toque.ox;
      let dy = this.toque.y - this.toque.oy;
      const l = Math.hypot(dx, dy);
      if (l > radio) {
        dx = (dx / l) * radio;
        dy = (dy / l) * radio;
      }
      this.perilla!.style.transform = `translate(${dx}px, ${dy}px)`;
      if (l > 8) {
        x = dx / radio;
        y = dy / radio;
      }
    }

    const l = Math.hypot(x, y);
    this.x = l > 1 ? x / l : x;
    this.y = l > 1 ? y / l : y;

    this.anteriores = this.actuales;
    this.actuales = new Set();
    for (const d of this.defs) {
      if (this.tactiles.has(d.nombre) || d.teclas.some((k) => t.has(k)) || (mando?.buttons[d.mando]?.pressed ?? false)) {
        this.actuales.add(d.nombre);
      }
    }
  }

  /** Botón mantenido. */
  activo(nombre: string): boolean {
    return this.actuales.has(nombre);
  }

  /** Botón recién pulsado en este paso. */
  pulsado(nombre: string): boolean {
    return this.actuales.has(nombre) && !this.anteriores.has(nombre);
  }

  limpiar() {
    this.teclas.clear();
    this.tactiles.clear();
    this.toque.id = -1;
    this.base?.classList.remove('visible');
  }
}
