import { bloque, type Bloque } from './fisica';
import { crearRng, type Rng } from './rng';

/**
 * Isla generada con semilla: cada nivel es una isla distinta.
 * Unos lugares con nombre (pueblos, granjas y almacenes) y, entre ellos, bosque y rocas.
 */

export const RADIO_ISLA = 100;

export type TipoLugar = 'pueblo' | 'granja' | 'almacen';

export interface Lugar {
  nombre: string;
  tipo: TipoLugar;
  x: number;
  z: number;
  r: number;
}

/** Casa con puerta: los bots entran por `fuera` → `dentro`. */
export interface Casa {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  estilo: number;
  fuera: { x: number; z: number };
  dentro: { x: number; z: number };
}

export interface PuntoBotin {
  x: number;
  y: number;
  z: number;
  cofre: boolean;
  casa: Casa | null;
}

export interface Arbol {
  x: number;
  z: number;
  escala: number;
  tipo: number;
}

export interface Isla {
  radio: number;
  bloques: Bloque[];
  lugares: Lugar[];
  casas: Casa[];
  botin: PuntoBotin[];
  arboles: Arbol[];
}

const NOMBRES = ['Pinar Alegre', 'Granja Vieja', 'Puerto Sal', 'Villa Roca', 'Los Almacenes', 'Colina Verde', 'El Molino', 'Arenal', 'Valle Hondo', 'Las Torres', 'Río Claro', 'Monte Pino'];

const GROSOR = 0.3;
const PUERTA = { ancho: 1.6, alto: 2.3 };
const VENTANA = { ancho: 1.2, y0: 1.1, y1: 2.0 };

/** Pared recta con un hueco centrado (puerta o ventana). `eje` = 'x' si la pared corre a lo largo de x. */
function pared(eje: 'x' | 'z', c: number, fijo: number, largo: number, alto: number, hueco: { ancho: number; y0: number; y1: number } | null, estilo: number): Bloque[] {
  const pieza = (centro: number, l: number, y0: number, y1: number) =>
    eje === 'x' ? bloque('pared', centro, fijo, l, GROSOR, y1 - y0, y0, estilo) : bloque('pared', fijo, centro, GROSOR, l, y1 - y0, y0, estilo);
  if (!hueco) return [pieza(c, largo, 0, alto)];
  const lado = (largo - hueco.ancho) / 2;
  const fuera: Bloque[] = [pieza(c - hueco.ancho / 2 - lado / 2, lado, 0, alto), pieza(c + hueco.ancho / 2 + lado / 2, lado, 0, alto)];
  if (hueco.y1 < alto) fuera.push(pieza(c, hueco.ancho, hueco.y1, alto));
  if (hueco.y0 > 0) fuera.push(pieza(c, hueco.ancho, 0, hueco.y0));
  return fuera;
}

/** Lados: 0 = +z, 1 = +x, 2 = -z, 3 = -x. */
function casa(cx: number, cz: number, w: number, d: number, h: number, puerta: number, estilo: number, bloques: Bloque[]): Casa {
  const hueco = (lado: number) => (lado === puerta ? { ancho: PUERTA.ancho, y0: 0, y1: PUERTA.alto } : VENTANA);
  bloques.push(
    ...pared('x', cx, cz + d / 2, w, h, hueco(0), estilo),
    ...pared('x', cx, cz - d / 2, w, h, hueco(2), estilo),
    ...pared('z', cz, cx + w / 2, d - GROSOR * 2, h, hueco(1), estilo),
    ...pared('z', cz, cx - w / 2, d - GROSOR * 2, h, hueco(3), estilo),
    bloque('techo', cx, cz, w + 0.5, d + 0.5, 0.3, h, estilo),
  );
  const nx = puerta === 1 ? 1 : puerta === 3 ? -1 : 0;
  const nz = puerta === 0 ? 1 : puerta === 2 ? -1 : 0;
  const media = nx ? w / 2 : d / 2;
  return {
    x: cx, z: cz, w, d, h, estilo,
    fuera: { x: cx + nx * (media + 1.6), z: cz + nz * (media + 1.6) },
    dentro: { x: cx + nx * (media - 1.3), z: cz + nz * (media - 1.3) },
  };
}

/** Lado de la casa que mira hacia un punto. */
function ladoHacia(cx: number, cz: number, x: number, z: number): number {
  const dx = x - cx;
  const dz = z - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 0 : 2;
}

function botinCasa(c: Casa, rng: Rng, botin: PuntoBotin[]) {
  const libre = (m: number) => ({ x: c.x + rng.rango(-c.w / 2 + m, c.w / 2 - m), z: c.z + rng.rango(-c.d / 2 + m, c.d / 2 - m) });
  if (rng.siguiente() < 0.65) botin.push({ ...libre(1.2), y: 0, cofre: true, casa: c });
  const n = rng.entero(1, 2);
  for (let i = 0; i < n; i++) botin.push({ ...libre(0.9), y: 0, cofre: false, casa: c });
}

function construirLugar(l: Lugar, rng: Rng, isla: Isla) {
  const { bloques, casas, botin } = isla;
  const nueva = (x: number, z: number, w: number, d: number, h: number, estilo: number) => {
    const c = casa(x, z, w, d, h, ladoHacia(x, z, l.x, l.z), estilo, bloques);
    casas.push(c);
    botinCasa(c, rng, botin);
    return c;
  };
  if (l.tipo === 'pueblo') {
    const n = rng.entero(4, 6);
    const giro = rng.siguiente() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = giro + (i / n) * Math.PI * 2 + rng.rango(-0.15, 0.15);
      const r = rng.rango(13, 16);
      nueva(l.x + Math.cos(a) * r, l.z + Math.sin(a) * r, rng.rango(6.5, 8.5), rng.rango(5.5, 7), rng.rango(3, 3.4), rng.entero(0, 3));
    }
    // Fuente o pozo en la plaza y cajas sueltas.
    bloques.push(bloque('roca', l.x, l.z, 2.4, 2.4, 0.9, 0, 1));
    for (let i = 0; i < 3; i++) {
      const a = rng.siguiente() * Math.PI * 2;
      bloques.push(bloque('caja', l.x + Math.cos(a) * 6, l.z + Math.sin(a) * 6, 1.2, 1.2, 1.2));
    }
    botin.push({ x: l.x + 3, y: 0, z: l.z, cofre: true, casa: null });
  } else if (l.tipo === 'granja') {
    // Granero grande, una casa y vallas con fardos.
    nueva(l.x, l.z, 12, 9, 4.5, 4);
    const a = rng.siguiente() * Math.PI * 2;
    nueva(l.x + Math.cos(a) * 15, l.z + Math.sin(a) * 15, 7, 6, 3.2, rng.entero(0, 3));
    const rv = 19;
    for (let k = 0; k < 4; k++) {
      const s = k < 2 ? 1 : -1;
      if (k % 2 === 0) bloques.push(bloque('valla', l.x + s * rv, l.z + (rng.siguiente() - 0.5) * 6, 0.2, 10, 1.1));
      else bloques.push(bloque('valla', l.x + (rng.siguiente() - 0.5) * 6, l.z + s * rv, 10, 0.2, 1.1));
    }
    for (let i = 0; i < 5; i++) {
      const b = rng.siguiente() * Math.PI * 2;
      const r = rng.rango(8, 12);
      const x = l.x + Math.cos(b) * r;
      const z = l.z + Math.sin(b) * r;
      if (!ocupado(bloques, x, z, 1.2)) bloques.push(bloque('caja', x, z, 1.6, 1.2, 1.2, 0, 1));
    }
    botin.push({ x: l.x + Math.cos(a + 1) * 10, y: 0, z: l.z + Math.sin(a + 1) * 10, cofre: false, casa: null });
  } else {
    // Almacenes: dos naves y una pila de contenedores, con una torre en medio.
    const a = rng.siguiente() * Math.PI * 2;
    for (const s of [-1, 1]) nueva(l.x + Math.cos(a) * 11 * s, l.z + Math.sin(a) * 11 * s, 10, 8, 4.2, 5);
    bloques.push(bloque('torre', l.x, l.z, 3, 3, 6, 0));
    for (let i = 0; i < 7; i++) {
      const b = rng.siguiente() * Math.PI * 2;
      const r = rng.rango(4, 8);
      const x = l.x + Math.cos(b + Math.PI / 2 + a) * r;
      const z = l.z + Math.sin(b + Math.PI / 2 + a) * r;
      const alto = rng.siguiente() < 0.4 ? 2.4 : 1.2;
      if (!ocupado(bloques, x, z, 1.4)) bloques.push(bloque('caja', x, z, 2.4, 1.2, alto, 0, 2));
    }
    botin.push({ x: l.x + Math.cos(a + Math.PI / 2) * 3, y: 0, z: l.z + Math.sin(a + Math.PI / 2) * 3, cofre: true, casa: null });
  }
}

const distancia = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** ¿Choca un círculo con algún bloque? */
function ocupado(bloques: Bloque[], x: number, z: number, r: number): boolean {
  return bloques.some((b) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}

export function generarIsla(semilla: number): Isla {
  const rng = crearRng(semilla * 7919 + 13);
  const isla: Isla = { radio: RADIO_ISLA, bloques: [], lugares: [], casas: [], botin: [], arboles: [] };
  const R = RADIO_ISLA;

  // Lugares: uno cerca del centro y el resto en un anillo, bien separados.
  const nombres = [...NOMBRES];
  const tipos: TipoLugar[] = ['pueblo', 'granja', 'almacen', 'pueblo', 'granja', 'pueblo'];
  const cuantos = rng.entero(5, 6);
  const giro = rng.siguiente() * Math.PI * 2;
  for (let i = 0; i < cuantos; i++) {
    let x = 0;
    let z = 0;
    if (i > 0) {
      const a = giro + ((i - 1) / (cuantos - 1)) * Math.PI * 2 + rng.rango(-0.25, 0.25);
      const r = rng.rango(48, R - 30);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } else {
      x = rng.rango(-10, 10);
      z = rng.rango(-10, 10);
    }
    const nombre = nombres.splice(rng.entero(0, nombres.length - 1), 1)[0];
    const tipo = i === 0 ? 'pueblo' : tipos[(i + rng.entero(0, 5)) % tipos.length];
    isla.lugares.push({ nombre, tipo, x, z, r: 22 });
  }
  for (const l of isla.lugares) construirLugar(l, rng, isla);

  const enLugar = (x: number, z: number, m: number) => isla.lugares.some((l) => distancia(l, { x, z }) < l.r + m);

  // Rocas para cubrirse por el campo.
  for (let i = 0, puestas = 0; i < 400 && puestas < 45; i++) {
    const a = rng.siguiente() * Math.PI * 2;
    const r = Math.sqrt(rng.siguiente()) * (R - 8);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (enLugar(x, z, 2)) continue;
    const w = rng.rango(1.6, 3.6);
    const d = rng.rango(1.6, 3.6);
    if (ocupado(isla.bloques, x, z, Math.max(w, d))) continue;
    isla.bloques.push(bloque('roca', x, z, w, d, rng.rango(1.1, 2.6), 0, rng.entero(0, 2)));
    puestas++;
  }

  // Bosque: troncos que paran las balas y copas solo visuales.
  for (let i = 0; i < 1200 && isla.arboles.length < 170; i++) {
    const a = rng.siguiente() * Math.PI * 2;
    const r = Math.sqrt(rng.siguiente()) * (R - 6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (enLugar(x, z, 3) || ocupado(isla.bloques, x, z, 2)) continue;
    if (isla.arboles.some((t) => distancia(t, { x, z }) < 4.5)) continue;
    const escala = rng.rango(0.8, 1.3);
    isla.arboles.push({ x, z, escala, tipo: rng.entero(0, 2) });
    isla.bloques.push(bloque('tronco', x, z, 0.5 * escala, 0.5 * escala, 3.2 * escala));
  }

  // Botín suelto por el campo.
  for (let i = 0, puestos = 0; i < 400 && puestos < 26; i++) {
    const a = rng.siguiente() * Math.PI * 2;
    const r = Math.sqrt(rng.siguiente()) * (R - 10);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (enLugar(x, z, 0) || ocupado(isla.bloques, x, z, 1)) continue;
    isla.botin.push({ x, y: 0, z, cofre: rng.siguiente() < 0.25, casa: null });
    puestos++;
  }
  return isla;
}

/** ¿Está el punto dentro de la casa? */
export const dentroDeCasa = (c: Casa, x: number, z: number) => Math.abs(x - c.x) < c.w / 2 && Math.abs(z - c.z) < c.d / 2;
