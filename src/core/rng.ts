/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da la misma partida. */
export function crearRng(semilla: number) {
  let s = semilla >>> 0;
  const siguiente = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    rango: (min: number, max: number) => min + siguiente() * (max - min),
    entero: (min: number, max: number) => Math.floor(min + siguiente() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)],
  };
}

export type Rng = ReturnType<typeof crearRng>;
