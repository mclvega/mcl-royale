/** Armas del battle royale. La rareza mejora el daño, la precisión y la recarga. */

export type Arma = 'pistola' | 'subfusil' | 'fusil' | 'escopeta' | 'francotirador';
export type Municion = 'ligera' | 'media' | 'pesada' | 'cartuchos';
/** 0 común, 1 poco común, 2 rara, 3 épica, 4 legendaria. */
export type Rareza = 0 | 1 | 2 | 3 | 4;

export const RAREZAS: Array<{ nombre: string; color: string; hex: number }> = [
  { nombre: 'común', color: '#b0b0b0', hex: 0xb0b0b0 },
  { nombre: 'poco común', color: '#5ad13c', hex: 0x5ad13c },
  { nombre: 'rara', color: '#3ca0ff', hex: 0x3ca0ff },
  { nombre: 'épica', color: '#c060ff', hex: 0xc060ff },
  { nombre: 'legendaria', color: '#ffb020', hex: 0xffb020 },
];

export interface DatosArma {
  nombre: string;
  municion: Municion;
  dano: number;
  /** Segundos entre disparos. */
  cadencia: number;
  automatica: boolean;
  cargador: number;
  recarga: number;
  /** Dispersión en radianes (quieto / moviéndose). */
  precision: number;
  dispersionMovimiento: number;
  retroceso: number;
  alcance: number;
  perdigones: number;
  /** Multiplicador del daño en la cabeza. */
  cabeza: number;
  /** Aumento de la mira. */
  zoom: number;
  /** Rarezas mínima y máxima en que aparece. */
  rarezas: [Rareza, Rareza];
}

export const ARMAS: Record<Arma, DatosArma> = {
  pistola: { nombre: 'Pistola', municion: 'ligera', dano: 24, cadencia: 0.22, automatica: false, cargador: 16, recarga: 1.4, precision: 0.012, dispersionMovimiento: 0.025, retroceso: 0.01, alcance: 70, perdigones: 1, cabeza: 2, zoom: 1.3, rarezas: [0, 2] },
  subfusil: { nombre: 'Subfusil', municion: 'ligera', dano: 17, cadencia: 0.075, automatica: true, cargador: 30, recarga: 2.0, precision: 0.02, dispersionMovimiento: 0.02, retroceso: 0.006, alcance: 55, perdigones: 1, cabeza: 1.75, zoom: 1.3, rarezas: [1, 3] },
  fusil: { nombre: 'Fusil de asalto', municion: 'media', dano: 31, cadencia: 0.18, automatica: true, cargador: 30, recarga: 2.3, precision: 0.008, dispersionMovimiento: 0.04, retroceso: 0.01, alcance: 140, perdigones: 1, cabeza: 1.5, zoom: 1.5, rarezas: [1, 4] },
  escopeta: { nombre: 'Escopeta', municion: 'cartuchos', dano: 11, cadencia: 0.9, automatica: false, cargador: 5, recarga: 4.0, precision: 0.065, dispersionMovimiento: 0.02, retroceso: 0.04, alcance: 26, perdigones: 10, cabeza: 1.8, zoom: 1.2, rarezas: [0, 3] },
  francotirador: { nombre: 'Francotirador', municion: 'pesada', dano: 100, cadencia: 1.5, automatica: false, cargador: 1, recarga: 2.6, precision: 0.001, dispersionMovimiento: 0.1, retroceso: 0.05, alcance: 250, perdigones: 1, cabeza: 2.5, zoom: 4, rarezas: [2, 4] },
};

export const ORDEN_ARMAS = Object.keys(ARMAS) as Arma[];

export const MUNICIONES: Record<Municion, { nombre: string; paquete: number; max: number }> = {
  ligera: { nombre: 'Munición ligera', paquete: 30, max: 999 },
  media: { nombre: 'Munición media', paquete: 20, max: 999 },
  pesada: { nombre: 'Munición pesada', paquete: 6, max: 999 },
  cartuchos: { nombre: 'Cartuchos', paquete: 8, max: 999 },
};

/** Valores del arma con la mejora de su rareza. */
export function stats(arma: Arma, rareza: Rareza): DatosArma {
  const d = ARMAS[arma];
  return {
    ...d,
    dano: Math.round(d.dano * (1 + rareza * 0.07)),
    precision: d.precision * (1 - rareza * 0.08),
    recarga: d.recarga * (1 - rareza * 0.06),
  };
}

/** Pico: siempre lo llevas; golpe cuerpo a cuerpo. */
export const PICO = { nombre: 'Pico', dano: 20, cadencia: 0.5, alcance: 2.2 };

export const multiplicadorZona = (zona: 'cabeza' | 'cuerpo' | 'piernas', cabeza: number) => (zona === 'cabeza' ? cabeza : zona === 'piernas' ? 0.9 : 1);
