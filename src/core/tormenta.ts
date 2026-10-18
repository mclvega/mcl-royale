import type { Rng } from './rng';

/** Fase de la tormenta: espera con el círculo quieto y luego se cierra hasta el radio siguiente. */
export interface Fase {
  espera: number;
  cierre: number;
  /** Radio final de la fase (fracción del radio de la isla). */
  radio: number;
  /** Vida por segundo fuera del círculo. */
  dano: number;
}

export const FASES: Fase[] = [
  { espera: 45, cierre: 30, radio: 0.7, dano: 1 },
  { espera: 35, cierre: 25, radio: 0.45, dano: 2 },
  { espera: 25, cierre: 20, radio: 0.26, dano: 4 },
  { espera: 20, cierre: 18, radio: 0.12, dano: 7 },
  { espera: 15, cierre: 20, radio: 0, dano: 10 },
];

export interface Circulo {
  x: number;
  z: number;
  r: number;
}

export interface Tormenta {
  fase: number;
  /** true mientras el círculo se cierra. */
  cerrando: boolean;
  /** Segundos que quedan de la etapa actual (espera o cierre). */
  tiempo: number;
  inicio: Circulo;
  actual: Circulo;
  siguiente: Circulo;
  velocidad: number;
}

/** El centro del círculo nuevo cae dentro del anterior, de modo que el nuevo quede entero dentro. */
function siguienteCirculo(c: Circulo, r: number, rng: Rng, radioIsla: number): Circulo {
  const margen = Math.max(0, c.r - r);
  for (let i = 0; i < 20; i++) {
    const a = rng.siguiente() * Math.PI * 2;
    const d = Math.sqrt(rng.siguiente()) * margen;
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    // Que el centro quede en tierra firme.
    if (Math.hypot(x, z) <= radioIsla * 0.8 || i === 19) return { x, z, r };
  }
  return { x: c.x, z: c.z, r };
}

export function crearTormenta(rng: Rng, radioIsla: number, velocidad = 1): Tormenta {
  const inicio = { x: 0, z: 0, r: radioIsla * 1.15 };
  return {
    fase: 0,
    cerrando: false,
    tiempo: FASES[0].espera / velocidad,
    inicio: { ...inicio },
    actual: { ...inicio },
    siguiente: siguienteCirculo(inicio, radioIsla * FASES[0].radio, rng, radioIsla),
    velocidad,
  };
}

export function actualizarTormenta(t: Tormenta, dt: number, rng: Rng, radioIsla: number): void {
  if (t.fase >= FASES.length) return;
  const f = FASES[t.fase];
  t.tiempo -= dt;
  if (t.cerrando) {
    const k = Math.min(1, 1 - t.tiempo / (f.cierre / t.velocidad));
    t.actual.x = t.inicio.x + (t.siguiente.x - t.inicio.x) * k;
    t.actual.z = t.inicio.z + (t.siguiente.z - t.inicio.z) * k;
    t.actual.r = t.inicio.r + (t.siguiente.r - t.inicio.r) * k;
  }
  if (t.tiempo > 0) return;
  if (!t.cerrando) {
    t.cerrando = true;
    t.tiempo = f.cierre / t.velocidad;
    t.inicio = { ...t.actual };
    return;
  }
  t.actual = { ...t.siguiente };
  t.fase++;
  t.cerrando = false;
  if (t.fase >= FASES.length) return;
  const nf = FASES[t.fase];
  t.tiempo = nf.espera / t.velocidad;
  t.inicio = { ...t.actual };
  t.siguiente = siguienteCirculo(t.actual, radioIsla * nf.radio, rng, radioIsla);
}

export const fuera = (t: Tormenta, x: number, z: number) => Math.hypot(x - t.actual.x, z - t.actual.z) > t.actual.r;

/** Daño por segundo de la tormenta ahora mismo. */
export const danoTormenta = (t: Tormenta) => FASES[Math.min(t.fase, FASES.length - 1)].dano;
