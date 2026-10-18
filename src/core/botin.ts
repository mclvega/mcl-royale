import { ARMAS, MUNICIONES, ORDEN_ARMAS, type Arma, type Rareza } from './armas';
import { armaNueva, type Cura, type Objeto } from './inventario';
import type { Rng } from './rng';

/** Probabilidad de cada rareza (común → legendaria). Los cofres dan mejores armas. */
const PESOS_SUELO = [46, 30, 16, 6, 2];
const PESOS_COFRE = [20, 32, 28, 14, 6];

function elegirPeso(rng: Rng, pesos: number[]): number {
  let t = rng.siguiente() * pesos.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pesos.length; i++) {
    t -= pesos[i];
    if (t < 0) return i;
  }
  return pesos.length - 1;
}

/** Rareza al azar; `mejora` > 1 desplaza la probabilidad hacia las mejores. */
export function rarezaAlAzar(rng: Rng, cofre: boolean, mejora = 1): Rareza {
  const base = cofre ? PESOS_COFRE : PESOS_SUELO;
  const pesos = base.map((p, i) => p * Math.pow(Math.max(0.2, mejora), i));
  return elegirPeso(rng, pesos) as Rareza;
}

/** Arma al azar que exista en esa rareza (se ajusta la rareza al rango del arma). */
export function armaAlAzar(rng: Rng, cofre: boolean, mejora = 1): Objeto {
  const rareza = rarezaAlAzar(rng, cofre, mejora);
  const pesos: Record<Arma, number> = { pistola: 22, subfusil: 20, fusil: 26, escopeta: 22, francotirador: 10 };
  const arma = ORDEN_ARMAS[elegirPeso(rng, ORDEN_ARMAS.map((a) => pesos[a]))];
  const [min, max] = ARMAS[arma].rarezas;
  return armaNueva(arma, Math.min(max, Math.max(min, rareza)) as Rareza);
}

export function municionDe(arma: Arma, paquetes = 1): Objeto {
  const m = ARMAS[arma].municion;
  return { tipo: 'municion', municion: m, cantidad: MUNICIONES[m].paquete * paquetes };
}

export function curaAlAzar(rng: Rng): Objeto {
  const cura: Cura = (['vendas', 'vendas', 'botiquin', 'escudoP', 'escudoP', 'escudoG'] as const)[rng.entero(0, 5)];
  const cantidad = cura === 'vendas' ? 5 : cura === 'escudoP' ? 3 : 1;
  return { tipo: 'cura', cura, cantidad };
}

/** Lo que sale de un cofre (arma con su munición y casi siempre algo más) o lo que hay tirado en un punto. */
export function botinDe(rng: Rng, cofre: boolean, mejora = 1): Objeto[] {
  const fuera: Objeto[] = [];
  if (cofre || rng.siguiente() < 0.6) {
    const a = armaAlAzar(rng, cofre, mejora);
    fuera.push(a);
    if (a.tipo === 'arma') fuera.push(municionDe(a.arma, cofre ? 2 : 1));
  }
  if (cofre ? rng.siguiente() < 0.8 : fuera.length === 0 || rng.siguiente() < 0.25) fuera.push(curaAlAzar(rng));
  if (!fuera.length || (!cofre && rng.siguiente() < 0.3)) fuera.push(municionDe(rng.elegir(ORDEN_ARMAS)));
  return fuera;
}
