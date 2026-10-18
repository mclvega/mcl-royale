import { ARMAS, MUNICIONES, stats, type Arma, type Municion, type Rareza } from './armas';

export type Cura = 'vendas' | 'botiquin' | 'escudoP' | 'escudoG';

export const CURAS: Record<Cura, { nombre: string; icono: string; pila: number; tiempo: number; vida: number; escudo: number; hasta: number }> = {
  vendas: { nombre: 'Vendas', icono: '🩹', pila: 15, tiempo: 2.5, vida: 15, escudo: 0, hasta: 75 },
  botiquin: { nombre: 'Botiquín', icono: '🧰', pila: 3, tiempo: 6, vida: 100, escudo: 0, hasta: 100 },
  escudoP: { nombre: 'Escudo pequeño', icono: '🧪', pila: 6, tiempo: 2, vida: 0, escudo: 25, hasta: 50 },
  escudoG: { nombre: 'Escudo grande', icono: '🛡️', pila: 3, tiempo: 4, vida: 0, escudo: 50, hasta: 100 },
};
export const ORDEN_CURAS = Object.keys(CURAS) as Cura[];

/** Objeto que puede estar tirado en el mundo. */
export type Objeto =
  | { tipo: 'arma'; arma: Arma; rareza: Rareza; cargador: number }
  | { tipo: 'cura'; cura: Cura; cantidad: number }
  | { tipo: 'municion'; municion: Municion; cantidad: number };

/** Lo que cabe en una ranura del inventario. */
export type Ranura = Extract<Objeto, { tipo: 'arma' | 'cura' }>;

export const RANURAS = 5;

export interface Inventario {
  ranuras: Array<Ranura | null>;
  /** -1 = pico; 0 a 4 = ranura. */
  seleccion: number;
  municion: Record<Municion, number>;
}

export const inventarioVacio = (): Inventario => ({
  ranuras: Array.from({ length: RANURAS }, () => null),
  seleccion: -1,
  municion: { ligera: 0, media: 0, pesada: 0, cartuchos: 0 },
});

export function nombreObjeto(o: Objeto): string {
  if (o.tipo === 'arma') return ARMAS[o.arma].nombre;
  if (o.tipo === 'cura') return `${CURAS[o.cura].nombre} ×${o.cantidad}`;
  return `${MUNICIONES[o.municion].nombre} ×${o.cantidad}`;
}

export const armaNueva = (arma: Arma, rareza: Rareza): Ranura => ({ tipo: 'arma', arma, rareza, cargador: stats(arma, rareza).cargador });

/**
 * Mete un objeto en el inventario. Devuelve lo que no cupo (o lo que se soltó al cambiarlo), o null.
 * - La munición y las curas se apilan.
 * - Un arma o una cura nueva va a una ranura libre; si no hay, cambia la ranura elegida y suelta la anterior.
 */
export function recoger(inv: Inventario, o: Objeto, cambiar = true): Objeto | null {
  if (o.tipo === 'municion') {
    const max = MUNICIONES[o.municion].max;
    const entra = Math.min(o.cantidad, max - inv.municion[o.municion]);
    inv.municion[o.municion] += entra;
    return entra < o.cantidad ? { ...o, cantidad: o.cantidad - entra } : null;
  }
  if (o.tipo === 'cura') {
    let resto = o.cantidad;
    const pila = CURAS[o.cura].pila;
    for (const r of inv.ranuras) {
      if (r?.tipo === 'cura' && r.cura === o.cura && r.cantidad < pila) {
        const entra = Math.min(resto, pila - r.cantidad);
        r.cantidad += entra;
        resto -= entra;
        if (!resto) return null;
      }
    }
    o = { ...o, cantidad: resto };
  }
  const libre = inv.ranuras.indexOf(null);
  if (libre !== -1) {
    inv.ranuras[libre] = { ...o };
    if (o.tipo === 'arma' && inv.seleccion === -1) inv.seleccion = libre;
    return null;
  }
  if (!cambiar || inv.seleccion === -1) return o;
  const soltada = inv.ranuras[inv.seleccion];
  inv.ranuras[inv.seleccion] = { ...o };
  return soltada;
}

/** ¿Cabe sin tener que soltar nada? */
export function cabe(inv: Inventario, o: Objeto): boolean {
  if (o.tipo === 'municion') return inv.municion[o.municion] < MUNICIONES[o.municion].max;
  if (inv.ranuras.includes(null)) return true;
  return o.tipo === 'cura' && inv.ranuras.some((r) => r?.tipo === 'cura' && r.cura === o.cura && r.cantidad < CURAS[o.cura].pila);
}

/** Todo lo que lleva, para soltarlo al morir. */
export function vaciar(inv: Inventario): Objeto[] {
  const fuera: Objeto[] = inv.ranuras.filter((r): r is Ranura => !!r).map((r) => ({ ...r }));
  for (const [m, n] of Object.entries(inv.municion) as Array<[Municion, number]>) if (n > 0) fuera.push({ tipo: 'municion', municion: m, cantidad: n });
  return fuera;
}

/** Valor de un arma para decidir cuál es mejor (lo usan los bots). */
export function valorArma(r: Objeto | null): number {
  if (r?.tipo !== 'arma') return 0;
  const base = { fusil: 6, escopeta: 5, subfusil: 4, francotirador: 3, pistola: 0 }[r.arma];
  return 10 + r.rareza * 4 + base;
}

export interface Salud {
  vida: number;
  escudo: number;
}

/** El daño gasta primero el escudo. La tormenta (`directo`) quita vida aunque haya escudo. */
export function aplicarDano(s: Salud, dano: number, directo = false): void {
  if (!directo) {
    const a = Math.min(s.escudo, dano);
    s.escudo -= a;
    dano -= a;
  }
  s.vida = Math.max(0, s.vida - dano);
}

/** ¿Sirve de algo usar esta cura ahora? */
export function utilCura(s: Salud, c: Cura): boolean {
  const d = CURAS[c];
  return d.vida > 0 ? s.vida < d.hasta : s.escudo < d.hasta;
}

export function aplicarCura(s: Salud, c: Cura): void {
  const d = CURAS[c];
  if (d.vida > 0) s.vida = Math.max(s.vida, Math.min(d.hasta, s.vida + d.vida));
  if (d.escudo > 0) s.escudo = Math.max(s.escudo, Math.min(d.hasta, s.escudo + d.escudo));
}

/** La mejor cura útil que lleva (índice de ranura) o -1. */
export function mejorCura(inv: Inventario, s: Salud): number {
  const orden: Cura[] = s.vida < 50 ? ['botiquin', 'vendas', 'escudoG', 'escudoP'] : ['escudoG', 'escudoP', 'vendas', 'botiquin'];
  for (const c of orden) {
    if (!utilCura(s, c)) continue;
    const i = inv.ranuras.findIndex((r) => r?.tipo === 'cura' && r.cura === c);
    if (i !== -1) return i;
  }
  return -1;
}
