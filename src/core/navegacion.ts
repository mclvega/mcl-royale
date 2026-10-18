import type { Bloque } from './fisica';

/**
 * Mapa de paso para los bots: rejilla de 0,5 m con las celdas bloqueadas por paredes, rocas y troncos.
 * Los caminos se buscan con A* y se alisan (se quitan los puntos intermedios que se ven entre sí).
 */

const CELDA = 0.5;
/** Margen alrededor de los bloques (algo menos que el radio del cuerpo, para pasar por las puertas). */
const MARGEN = 0.3;
const MAX_EXPANSIONES = 40000;

export interface Punto {
  x: number;
  z: number;
}

export class Navegacion {
  readonly n: number;
  private bloqueada: Uint8Array;
  private g: Float32Array;
  private padre: Int32Array;
  private visto: Uint32Array;
  private sello = 0;
  private origen: number;

  constructor(bloques: Bloque[], radioIsla: number) {
    const lado = radioIsla + 4;
    this.n = Math.ceil((lado * 2) / CELDA);
    this.origen = -lado;
    const total = this.n * this.n;
    this.bloqueada = new Uint8Array(total);
    this.g = new Float32Array(total);
    this.padre = new Int32Array(total);
    this.visto = new Uint32Array(total);
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < this.n; k++) {
        const x = this.origen + (i + 0.5) * CELDA;
        const z = this.origen + (k + 0.5) * CELDA;
        if (Math.hypot(x, z) > radioIsla + 1.5) this.bloqueada[i * this.n + k] = 1;
      }
    }
    for (const b of bloques) {
      // Solo estorba lo que está a la altura del cuerpo y no se puede subir de un paso.
      if (b.y0 > 1.5 || b.y1 < 0.45) continue;
      const i0 = this.celdaX(b.x - b.w / 2 - MARGEN);
      const i1 = this.celdaX(b.x + b.w / 2 + MARGEN);
      const k0 = this.celdaX(b.z - b.d / 2 - MARGEN);
      const k1 = this.celdaX(b.z + b.d / 2 + MARGEN);
      for (let i = Math.max(0, i0); i <= Math.min(this.n - 1, i1); i++) {
        for (let k = Math.max(0, k0); k <= Math.min(this.n - 1, k1); k++) {
          const x = this.origen + (i + 0.5) * CELDA;
          const z = this.origen + (k + 0.5) * CELDA;
          if (Math.abs(x - b.x) < b.w / 2 + MARGEN && Math.abs(z - b.z) < b.d / 2 + MARGEN) this.bloqueada[i * this.n + k] = 1;
        }
      }
    }
  }

  private celdaX(v: number) {
    return Math.floor((v - this.origen) / CELDA);
  }

  private indice(p: Punto): number {
    const i = this.celdaX(p.x);
    const k = this.celdaX(p.z);
    if (i < 0 || k < 0 || i >= this.n || k >= this.n) return -1;
    return i * this.n + k;
  }

  private centro(idx: number): Punto {
    const i = Math.floor(idx / this.n);
    const k = idx % this.n;
    return { x: this.origen + (i + 0.5) * CELDA, z: this.origen + (k + 0.5) * CELDA };
  }

  libre(x: number, z: number): boolean {
    const i = this.indice({ x, z });
    return i !== -1 && !this.bloqueada[i];
  }

  /** Celda libre más cercana (en espiral, hasta unos 3 m). */
  private libreCerca(p: Punto): number {
    const i0 = this.celdaX(p.x);
    const k0 = this.celdaX(p.z);
    for (let r = 0; r <= 6; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dk = -r; dk <= r; dk++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
          const i = i0 + di;
          const k = k0 + dk;
          if (i < 0 || k < 0 || i >= this.n || k >= this.n) continue;
          if (!this.bloqueada[i * this.n + k]) return i * this.n + k;
        }
      }
    }
    return -1;
  }

  /** Punto libre más cercano a `p` (o null si todo está ocupado alrededor). */
  puntoLibre(p: Punto): Punto | null {
    if (this.libre(p.x, p.z)) return { x: p.x, z: p.z };
    const i = this.libreCerca(p);
    return i === -1 ? null : this.centro(i);
  }

  /** ¿Se puede ir en línea recta entre dos puntos sin cruzar celdas bloqueadas? */
  recto(a: Punto, b: Punto): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const pasos = Math.ceil(d / (CELDA * 0.5));
    for (let s = 1; s < pasos; s++) {
      const t = s / pasos;
      if (!this.libre(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** Camino de `a` a `b` como lista de puntos (sin incluir `a`), o null si no hay. */
  camino(a: Punto, b: Punto): Punto[] | null {
    const inicio = this.libreCerca(a);
    const fin = this.libreCerca(b);
    if (inicio === -1 || fin === -1) return null;
    if (this.recto(a, b) && this.libre(b.x, b.z)) return [{ x: b.x, z: b.z }];
    const n = this.n;
    const sello = ++this.sello;
    const destino = this.centro(fin);
    const h = (idx: number) => {
      const c = this.centro(idx);
      const dx = Math.abs(c.x - destino.x);
      const dz = Math.abs(c.z - destino.z);
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) / CELDA;
    };
    // Montículo binario de [f, índice].
    const abiertos: number[] = [];
    const prioridad: number[] = [];
    const meter = (idx: number, f: number) => {
      abiertos.push(idx);
      prioridad.push(f);
      let i = abiertos.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (prioridad[p] <= prioridad[i]) break;
        [abiertos[p], abiertos[i]] = [abiertos[i], abiertos[p]];
        [prioridad[p], prioridad[i]] = [prioridad[i], prioridad[p]];
        i = p;
      }
    };
    const sacar = (): number => {
      const top = abiertos[0];
      const ultimo = abiertos.pop()!;
      const ultimaP = prioridad.pop()!;
      if (abiertos.length) {
        abiertos[0] = ultimo;
        prioridad[0] = ultimaP;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < abiertos.length && prioridad[l] < prioridad[m]) m = l;
          if (r < abiertos.length && prioridad[r] < prioridad[m]) m = r;
          if (m === i) break;
          [abiertos[m], abiertos[i]] = [abiertos[i], abiertos[m]];
          [prioridad[m], prioridad[i]] = [prioridad[i], prioridad[m]];
          i = m;
        }
      }
      return top;
    };
    this.visto[inicio] = sello;
    this.g[inicio] = 0;
    this.padre[inicio] = -1;
    meter(inicio, h(inicio));
    let expansiones = 0;
    let llegado = false;
    while (abiertos.length && expansiones++ < MAX_EXPANSIONES) {
      const actual = sacar();
      if (actual === fin) {
        llegado = true;
        break;
      }
      const i = Math.floor(actual / n);
      const k = actual % n;
      for (let di = -1; di <= 1; di++) {
        for (let dk = -1; dk <= 1; dk++) {
          if (!di && !dk) continue;
          const ni = i + di;
          const nk = k + dk;
          if (ni < 0 || nk < 0 || ni >= n || nk >= n) continue;
          const vecino = ni * n + nk;
          if (this.bloqueada[vecino]) continue;
          // En diagonal no se cortan esquinas.
          if (di && dk && (this.bloqueada[i * n + nk] || this.bloqueada[ni * n + k])) continue;
          const coste = this.g[actual] + (di && dk ? 1.414 : 1);
          if (this.visto[vecino] === sello && coste >= this.g[vecino]) continue;
          this.visto[vecino] = sello;
          this.g[vecino] = coste;
          this.padre[vecino] = actual;
          meter(vecino, coste + h(vecino));
        }
      }
    }
    if (!llegado) return null;
    const puntos: Punto[] = [];
    for (let c = fin; c !== -1 && c !== inicio; c = this.padre[c]) puntos.push(this.centro(c));
    puntos.reverse();
    if (this.libre(b.x, b.z)) puntos[puntos.length - 1] = { x: b.x, z: b.z };
    return this.alisar(a, puntos);
  }

  /** Quita los puntos que se pueden saltar yendo en línea recta. */
  private alisar(a: Punto, puntos: Punto[]): Punto[] {
    const fuera: Punto[] = [];
    let desde = a;
    let i = 0;
    while (i < puntos.length) {
      let j = puntos.length - 1;
      while (j > i && !this.recto(desde, puntos[j])) j--;
      fuera.push(puntos[j]);
      desde = puntos[j];
      i = j + 1;
    }
    return fuera;
  }
}
