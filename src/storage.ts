import { DEFAULT_LOOK, LOOK_OPTIONS, type Look } from './game/look';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

export interface Record_ {
  nombre: string;
  nivel: number;
  /** Puesto final (1 = victoria). */
  puesto: number;
  bajas: number;
  fecha: string;
}

export interface Estadisticas {
  partidas: number;
  victorias: number;
  top3: number;
  bajas: number;
  mejorPuesto: number;
  maxBajas: number;
}

const estadisticasNuevas = (): Estadisticas => ({ partidas: 0, victorias: 0, top3: 0, bajas: 0, mejorPuesto: 0, maxBajas: 0 });

export interface Guardado {
  v: 1;
  nombre: string | null;
  records: Record_[];
  /** Nivel actual: cada partida es una isla nueva y más difícil. */
  nivel: number;
  /** Nivel más alto alcanzado. */
  nivelMax: number;
  estadisticas: Estadisticas;
  /** Apariencia del jugador (mismo sistema de personajes que el Arcade). */
  look: Look;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-royale:v1';
const MAX_RECORDS = 10;

export const guardadoNuevo = (): Guardado => ({
  v: 1, nombre: null, records: [], nivel: 1, nivelMax: 1, estadisticas: estadisticasNuevas(),
  look: { ...DEFAULT_LOOK, shirt: 0x1e88e5, hat: 'cap', hatColor: 0x212121 }, config: configPorDefecto(),
});

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return { nombre: v.nombre.slice(0, 20), nivel: entero(v.nivel, 1, 1e6, 1), puesto: entero(v.puesto, 1, 10, 10), bajas: entero(v.bajas, 0, 1e7, 0), fecha: v.fecha };
}

/** Orden de la tabla: mejor puesto, luego más bajas y luego nivel más alto. */
const comparar = (a: Record_, b: Record_) => a.puesto - b.puesto || b.bajas - a.bajas || b.nivel - a.nivel;

function normalizarEstadisticas(v: unknown): Estadisticas {
  const e = estadisticasNuevas();
  if (!esObjeto(v)) return e;
  return {
    partidas: entero(v.partidas, 0, 1e7, 0),
    victorias: entero(v.victorias, 0, 1e7, 0),
    top3: entero(v.top3, 0, 1e7, 0),
    bajas: entero(v.bajas, 0, 1e8, 0),
    mejorPuesto: entero(v.mejorPuesto, 0, 10, 0),
    maxBajas: entero(v.maxBajas, 0, 1e4, 0),
  };
}

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarLook(entrada: unknown, porDefecto: Look): Look {
  if (!esObjeto(entrada)) return { ...porDefecto };
  const look = { ...porDefecto } as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(LOOK_OPTIONS)) {
    const valor = entrada[clave];
    const validos = (opciones as readonly unknown[]).map((o) => (typeof o === 'object' && o ? (o as { id: string }).id : o));
    if (validos.includes(valor)) look[clave] = valor;
  }
  return look as unknown as Look;
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const records = Array.isArray(entrada.records)
    ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
    : [];
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    records,
    nivel: entero(entrada.nivel, 1, 1e6, 1),
    nivelMax: Math.max(entero(entrada.nivelMax, 1, 1e6, 1), entero(entrada.nivel, 1, 1e6, 1)),
    estadisticas: normalizarEstadisticas(entrada.estadisticas),
    look: normalizarLook(entrada.look, base.look),
    config: normalizarConfig(entrada.config),
  };
}

export function agregarRecord(g: Guardado, r: Record_): boolean {
  g.records.push(r);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return g.records.includes(r);
}

/** Anota el resultado de una partida: estadísticas, récords y paso de nivel (Top 3). */
export function anotarPartida(g: Guardado, r: { puesto: number; bajas: number }, nombre: string, puestoParaSubir: number): { subeNivel: boolean; record: boolean } {
  const e = g.estadisticas;
  e.partidas++;
  e.bajas += r.bajas;
  if (r.puesto === 1) e.victorias++;
  if (r.puesto <= 3) e.top3++;
  e.mejorPuesto = e.mejorPuesto ? Math.min(e.mejorPuesto, r.puesto) : r.puesto;
  e.maxBajas = Math.max(e.maxBajas, r.bajas);
  const record = agregarRecord(g, { nombre, nivel: g.nivel, puesto: r.puesto, bajas: r.bajas, fecha: new Date().toISOString().slice(0, 10) });
  const subeNivel = r.puesto <= puestoParaSubir;
  if (subeNivel) {
    g.nivel++;
    g.nivelMax = Math.max(g.nivelMax, g.nivel);
  }
  return { subeNivel, record };
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}
