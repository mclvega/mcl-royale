/**
 * Física sencilla de la isla: cuerpos cilíndricos contra bloques alineados a los ejes.
 * Una rejilla espacial limita cada consulta a los bloques cercanos. Unidades en metros; el suelo está en y = 0.
 */

export type TipoBloque = 'pared' | 'techo' | 'caja' | 'roca' | 'tronco' | 'valla' | 'torre';

export interface Bloque {
  /** Centro en el plano y medidas. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Altura de la base y de la cima. */
  y0: number;
  y1: number;
  tipo: TipoBloque;
  /** Índice del color o estilo (para el dibujo). */
  estilo: number;
  /** Marca interna para no revisar dos veces el mismo bloque en una consulta. */
  marca?: number;
}

export function bloque(tipo: TipoBloque, x: number, z: number, w: number, d: number, h: number, y0 = 0, estilo = 0): Bloque {
  return { tipo, x, z, w, d, y0, y1: y0 + h, estilo };
}

export interface Cuerpo {
  x: number;
  y: number;
  z: number;
  vy: number;
  radio: number;
  alto: number;
  enSuelo: boolean;
}

const CELDA = 8;
const PASO_MAXIMO = 0.45;
const VECINAS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export class Rejilla {
  private celdas = new Map<number, Bloque[]>();
  private marca = 0;
  private vacia: Bloque[] = [];

  constructor(readonly bloques: Bloque[]) {
    for (const b of bloques) {
      const x0 = Math.floor((b.x - b.w / 2 - 1) / CELDA);
      const x1 = Math.floor((b.x + b.w / 2 + 1) / CELDA);
      const z0 = Math.floor((b.z - b.d / 2 - 1) / CELDA);
      const z1 = Math.floor((b.z + b.d / 2 + 1) / CELDA);
      for (let i = x0; i <= x1; i++) {
        for (let k = z0; k <= z1; k++) {
          const c = Rejilla.clave(i, k);
          let lista = this.celdas.get(c);
          if (!lista) this.celdas.set(c, (lista = []));
          lista.push(b);
        }
      }
    }
  }

  private static clave(i: number, k: number) {
    return (i + 500) * 1000 + (k + 500);
  }

  /** Bloques que tocan la celda del punto (con 1 m de margen). */
  cerca(x: number, z: number): Bloque[] {
    return this.celdas.get(Rejilla.clave(Math.floor(x / CELDA), Math.floor(z / CELDA))) ?? this.vacia;
  }

  /** Recorre, sin repetir, los bloques de las celdas que cruza un segmento. */
  recorrer(ox: number, oz: number, dx: number, dz: number, largo: number, f: (b: Bloque) => void) {
    const m = ++this.marca;
    const pasos = Math.ceil(largo / (CELDA / 2)) + 1;
    for (let s = 0; s <= pasos; s++) {
      const t = Math.min(largo, (s * CELDA) / 2);
      const x = ox + dx * t;
      const z = oz + dz * t;
      // Celda del punto y las de alrededor (el segmento puede cortar una esquina).
      for (const [ex, ez] of VECINAS) {
        const c = Rejilla.clave(Math.floor((x + ex * 2) / CELDA), Math.floor((z + ez * 2) / CELDA));
        const lista = this.celdas.get(c);
        if (!lista) continue;
        for (const b of lista) {
          if (b.marca === m) continue;
          b.marca = m;
          f(b);
        }
      }
    }
  }
}

/** Mueve un cuerpo cilíndrico por el plano y lo saca de los bloques; se sube solo a escalones bajos. */
export function moverCuerpo(c: Cuerpo, dx: number, dz: number, dt: number, rejilla: Rejilla, gravedad = 20): void {
  c.x += dx;
  c.z += dz;
  const bloques = rejilla.cerca(c.x, c.z);
  for (const bl of bloques) {
    if (c.y >= bl.y1 - 0.01 || c.y + c.alto <= bl.y0) continue;
    const px = Math.max(bl.x - bl.w / 2, Math.min(c.x, bl.x + bl.w / 2));
    const pz = Math.max(bl.z - bl.d / 2, Math.min(c.z, bl.z + bl.d / 2));
    const ex = c.x - px;
    const ez = c.z - pz;
    const dist2 = ex * ex + ez * ez;
    if (dist2 >= c.radio * c.radio) continue;
    if (bl.y1 - c.y <= PASO_MAXIMO && c.enSuelo) {
      c.y = bl.y1;
      continue;
    }
    if (dist2 > 1e-8) {
      const dist = Math.sqrt(dist2);
      c.x = px + (ex / dist) * c.radio;
      c.z = pz + (ez / dist) * c.radio;
    } else {
      // El centro quedó dentro: salir por el lado más cercano.
      const sx = bl.w / 2 - Math.abs(c.x - bl.x) + c.radio;
      const sz = bl.d / 2 - Math.abs(c.z - bl.z) + c.radio;
      if (sx < sz) c.x += Math.sign(c.x - bl.x || 1) * sx;
      else c.z += Math.sign(c.z - bl.z || 1) * sz;
    }
  }

  // Gravedad y suelo: la cima más alta que hay debajo.
  c.vy -= gravedad * dt;
  let nuevaY = c.y + c.vy * dt;
  let suelo = 0;
  let techo = Infinity;
  for (const bl of rejilla.cerca(c.x, c.z)) {
    if (Math.abs(c.x - bl.x) > bl.w / 2 + c.radio * 0.5 || Math.abs(c.z - bl.z) > bl.d / 2 + c.radio * 0.5) continue;
    if (bl.y1 <= c.y + 0.01) suelo = Math.max(suelo, bl.y1);
    else if (bl.y0 >= c.y + c.alto - 0.01) techo = Math.min(techo, bl.y0);
  }
  if (nuevaY + c.alto > techo) {
    nuevaY = techo - c.alto;
    c.vy = Math.min(0, c.vy);
  }
  c.enSuelo = nuevaY <= suelo;
  if (c.enSuelo) {
    nuevaY = suelo;
    c.vy = 0;
  }
  c.y = nuevaY;
}

let t0 = 0;
let t1 = Infinity;
/** Recorta el intervalo [t0, t1] del rayo con una franja de un eje. */
function eje(o: number, d: number, mn: number, mx: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
  let a = (mn - o) / d;
  let b2 = (mx - o) / d;
  if (a > b2) {
    const c = a;
    a = b2;
    b2 = c;
  }
  if (a > t0) t0 = a;
  if (b2 < t1) t1 = b2;
  return t0 <= t1;
}

/** Distancia a la que un rayo entra en una caja alineada con los ejes (o Infinity si no la toca). */
export function rayoCaja(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): number {
  t0 = 0;
  t1 = Infinity;
  if (!eje(ox, dx, minX, maxX) || !eje(oy, dy, minY, maxY) || !eje(oz, dz, minZ, maxZ)) return Infinity;
  return t0;
}

/** Distancia hasta el primer bloque (o el suelo) que cruza el rayo. */
export function rayoMapa(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, rejilla: Rejilla, max = 200): number {
  let mejor = oy + dy * max < 0 && dy < 0 ? -oy / dy : max;
  const h = Math.hypot(dx, dz);
  const recorrido = h > 1e-6 ? Math.min(max, mejor) * h : 0;
  rejilla.recorrer(ox, oz, h > 1e-6 ? dx / h : 0, h > 1e-6 ? dz / h : 0, recorrido, (bl) => {
    const t = rayoCaja(ox, oy, oz, dx, dy, dz, bl.x - bl.w / 2, bl.y0, bl.z - bl.d / 2, bl.x + bl.w / 2, bl.y1, bl.z + bl.d / 2);
    if (t < mejor) mejor = t;
  });
  return mejor;
}

export interface Punto3 {
  x: number;
  y: number;
  z: number;
}

/** ¿Hay línea de visión entre dos puntos? */
export function seVen(a: Punto3, b: Punto3, rejilla: Rejilla): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-6) return true;
  return rayoMapa(a.x, a.y, a.z, dx / l, dy / l, dz / l, rejilla, l) >= l - 0.05;
}
