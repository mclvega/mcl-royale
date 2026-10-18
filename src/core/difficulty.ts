export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Probabilidad base de que un bot acierte un disparo (0 a 1). */
  punteria: number;
  /** Segundos que tarda un bot en reaccionar al verte. */
  reaccion: number;
  /** Multiplicador del daño de los bots contra ti. */
  dano: number;
  /** Multiplicador de la velocidad de la tormenta. */
  tormenta: number;
  /** Mejora de la rareza del botín que encuentran los bots. */
  botin: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', punteria: 0.1, reaccion: 1.2, dano: 0.5, tormenta: 0.8, botin: 0.5 },
  facil: { nombre: 'Fácil', punteria: 0.18, reaccion: 0.85, dano: 0.75, tormenta: 0.9, botin: 0.75 },
  normal: { nombre: 'Normal', punteria: 0.28, reaccion: 0.55, dano: 1, tormenta: 1, botin: 1 },
  desafio: { nombre: 'Desafío', punteria: 0.4, reaccion: 0.35, dano: 1.25, tormenta: 1.15, botin: 1.25 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

/** Ajuste por nivel: los niveles no se acaban y la dificultad sube poco a poco. */
export function modoNivel(m: Modo, nivel: number): Modo {
  const n = Math.max(0, Math.min(nivel - 1, 40));
  return {
    ...m,
    punteria: Math.min(0.75, m.punteria * (1 + n * 0.025)),
    reaccion: m.reaccion * Math.max(0.55, 1 - n * 0.015),
    dano: m.dano * (1 + n * 0.01),
    tormenta: m.tormenta * (1 + Math.min(n, 20) * 0.02),
    botin: m.botin * (1 + n * 0.02),
  };
}

/** Para pasar de nivel hay que quedar entre los 3 primeros. */
export const PUESTO_PARA_SUBIR = 3;
