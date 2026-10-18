import { stats } from '../core/armas';
import { seVen } from '../core/fisica';
import { mejorCura, valorArma } from '../core/inventario';
import { fuera } from '../core/tormenta';
import { VELOCIDAD, type Cofre, type Luchador, type ObjetoMundo, type Partida } from './logica';

export type Personalidad = 'agresivo' | 'equilibrado' | 'campero';

/** Estado de la IA de un bot. */
export interface EstadoIa {
  personalidad: Personalidad;
  /** Momento del viaje del autobús en que salta (-1 = sin decidir). */
  saltoT: number;
  aterrizaje: { x: number; z: number } | null;
  /** Puntos por los que pasar hasta el destino (p. ej. la puerta de una casa). */
  ruta: Array<{ x: number; z: number }>;
  meta: { objeto: ObjetoMundo | null; cofre: Cofre | null } | null;
  enemigo: Luchador | null;
  reaccion: number;
  revisar: number;
  atascado: number;
  atascos: number;
  ultimaPos: { x: number; z: number };
  /** Segundos que se queda quieto (camperos o tras llegar). */
  espera: number;
  /** Último disparo oído. */
  oido: { x: number; z: number; t: number } | null;
  sinVer: number;
  ignorar: Set<number>;
}

export function crearIa(): EstadoIa {
  return {
    personalidad: 'equilibrado', saltoT: -1, aterrizaje: null, ruta: [], meta: null, enemigo: null, reaccion: 0, revisar: 0,
    atascado: 0, atascos: 0, ultimaPos: { x: 0, z: 0 }, espera: 0, oido: null, sinVer: 9, ignorar: new Set(),
  };
}

const PERSONALIDADES: Personalidad[] = ['agresivo', 'equilibrado', 'equilibrado', 'campero'];

const angulo = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Busca un camino (A*) hasta el punto; devuelve false si no se puede llegar. */
function irA(p: Partida, l: Luchador, x: number, z: number): boolean {
  const camino = p.nav.camino(l.cuerpo, { x, z });
  l.ia.ruta = camino ?? [];
  l.ia.atascos = 0;
  return !!camino;
}

function girarHacia(l: Luchador, x: number, z: number, k: number) {
  const yaw = Math.atan2(-(x - l.cuerpo.x), -(z - l.cuerpo.z));
  l.yaw += angulo(yaw - l.yaw) * Math.min(1, k);
}

/** Elige el arma según la distancia al enemigo (la escopeta de cerca, el francotirador de lejos). */
function elegirArma(p: Partida, l: Luchador, distancia: number) {
  let mejor = -1;
  let valor = 0;
  l.inv.ranuras.forEach((r, i) => {
    if (r?.tipo !== 'arma') return;
    const d = stats(r.arma, r.rareza);
    if (r.cargador <= 0 && l.inv.municion[d.municion] <= 0) return;
    let v = valorArma(r);
    if (r.arma === 'escopeta') v += distancia < 10 ? 15 : -10;
    if (r.arma === 'francotirador') v += distancia > 50 ? 15 : -8;
    if (distancia > d.alcance) v -= 20;
    if (v > valor) {
      valor = v;
      mejor = i;
    }
  });
  if (mejor !== l.inv.seleccion && l.cd <= 0) p.elegirRanura(l, mejor);
}

const tieneArma = (l: Luchador) => l.inv.ranuras.some((r) => r?.tipo === 'arma');

function caminar(p: Partida, l: Luchador, dt: number, vel = VELOCIDAD * 0.85) {
  const ia = l.ia;
  const sig = ia.ruta[0];
  if (!sig) {
    l.moviendose = false;
    return;
  }
  if (dist(l.cuerpo, sig) < 0.8) {
    ia.ruta.shift();
    return;
  }
  const dx = sig.x - l.cuerpo.x;
  const dz = sig.z - l.cuerpo.z;
  const d = Math.hypot(dx, dz) || 1;
  if (!ia.enemigo) {
    girarHacia(l, sig.x, sig.z, dt * 6);
    l.pitch = 0;
  }
  p.mover(l, (dx / d) * vel, (dz / d) * vel, dt, false);
  l.moviendose = true;

  // Atascado: salta y vuelve a buscar el camino; si sigue sin avanzar, abandona el destino.
  ia.atascado += dt;
  if (ia.atascado > 0.8) {
    if (dist(l.cuerpo, ia.ultimaPos) < 0.4) {
      if (l.cuerpo.enSuelo) p.mover(l, 0, 0, 0, true);
      const final = ia.ruta[ia.ruta.length - 1];
      const atascos = ia.atascos + 1;
      if (atascos > 3 || !final) {
        if (ia.meta) ia.ignorar.add(ia.meta.cofre?.id ?? ia.meta.objeto!.id);
        ia.meta = null;
        ia.ruta = [];
      } else {
        irA(p, l, final.x, final.z);
        ia.atascos = atascos;
      }
    }
    ia.atascado = 0;
    ia.ultimaPos = { x: l.cuerpo.x, z: l.cuerpo.z };
  }
}

/** Busca un enemigo visible (campo de visión de unos 220°). */
function buscarEnemigo(p: Partida, l: Luchador): Luchador | null {
  const ojo = p.ojo(l);
  const alcance = l.ia.personalidad === 'agresivo' ? 85 : 70;
  let mejor: Luchador | null = null;
  let d = alcance;
  for (const o of p.luchadores) {
    if (!o.vivo || o === l || o.estado === 'bus') continue;
    const dd = Math.hypot(o.cuerpo.x - l.cuerpo.x, o.cuerpo.z - l.cuerpo.z);
    if (dd >= d) continue;
    const ang = Math.atan2(-(o.cuerpo.x - l.cuerpo.x), -(o.cuerpo.z - l.cuerpo.z));
    if (Math.abs(angulo(ang - l.yaw)) > 1.9 && dd > 5) continue;
    if (!seVen(ojo, p.pecho(o), p.rejilla)) continue;
    mejor = o;
    d = dd;
  }
  return mejor;
}

/** Lo mejor que hay para recoger cerca y dentro de la zona segura. */
function buscarBotin(p: Partida, l: Luchador): EstadoIa['meta'] {
  let mejor: EstadoIa['meta'] = null;
  let d = tieneArma(l) ? 35 : 60;
  const t = p.tormenta;
  const seguro = (x: number, z: number) => Math.hypot(x - t.siguiente.x, z - t.siguiente.z) < t.siguiente.r + (t.cerrando ? 0 : 15);
  for (const c of p.cofres) {
    if (c.abierto || l.ia.ignorar.has(c.id)) continue;
    const dd = dist(l.cuerpo, c) * 0.8;
    if (dd < d && seguro(c.x, c.z)) {
      d = dd;
      mejor = { cofre: c, objeto: null };
    }
  }
  for (const o of p.objetos) {
    if (l.ia.ignorar.has(o.id) || !p.leSirve(l, o.objeto)) continue;
    const dd = dist(l.cuerpo, o) * (o.objeto.tipo === 'arma' && !tieneArma(l) ? 0.5 : 1);
    if (dd < d && seguro(o.x, o.z)) {
      d = dd;
      mejor = { cofre: null, objeto: o };
    }
  }
  return mejor;
}

function puntoSeguro(p: Partida, margen: number) {
  const s = p.tormenta.siguiente;
  const a = p.rng.siguiente() * Math.PI * 2;
  const r = Math.sqrt(p.rng.siguiente()) * s.r * margen;
  return { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r };
}

/* ---------- Estados ---------- */

function enBus(p: Partida, l: Luchador) {
  const ia = l.ia;
  if (ia.saltoT < 0) {
    ia.personalidad = p.rng.elegir(PERSONALIDADES);
    // Aterriza en un lugar con nombre o junto a un botín cualquiera.
    const lugares = p.isla.lugares;
    const destino = p.rng.siguiente() < 0.7 ? p.rng.elegir(lugares) : p.rng.elegir(p.isla.botin);
    ia.aterrizaje = { x: destino.x + p.rng.rango(-8, 8), z: destino.z + p.rng.rango(-8, 8) };
    ia.saltoT = Math.max(1.5, p.momentoMasCerca(ia.aterrizaje.x, ia.aterrizaje.z) - p.rng.rango(1, 3));
  }
  if (p.bus.t >= ia.saltoT) p.saltarDelBus(l);
}

function enAire(p: Partida, l: Luchador, dt: number) {
  const a = l.ia.aterrizaje ?? { x: 0, z: 0 };
  const dx = a.x - l.cuerpo.x;
  const dz = a.z - l.cuerpo.z;
  const d = Math.hypot(dx, dz);
  girarHacia(l, a.x, a.z, dt * 3);
  const v = d > 2 ? VELOCIDAD : 0;
  p.mover(l, (dx / (d || 1)) * v, (dz / (d || 1)) * v, dt, false);
  l.moviendose = false;
}

function combatir(p: Partida, l: Luchador, e: Luchador, dt: number) {
  const ia = l.ia;
  const ojo = p.ojo(l);
  const pe = p.pecho(e);
  const dx = pe.x - ojo.x;
  const dz = pe.z - ojo.z;
  const distancia = Math.hypot(dx, dz);
  elegirArma(p, l, distancia);
  const yaw = Math.atan2(-dx, -dz);
  const dif = angulo(yaw - l.yaw);
  l.yaw += dif * Math.min(1, dt * 7);
  l.pitch = Math.atan2(pe.y - ojo.y, distancia);
  ia.reaccion -= dt;

  const arma = p.datosArma(l);
  // Sin arma: se acerca con el pico o huye a buscar botín.
  if (!arma) {
    if (distancia < 3) p.disparar(l);
    const v = VELOCIDAD * 0.9;
    const huir = !!e.inv.ranuras.some((r) => r?.tipo === 'arma') && distancia > 3;
    p.mover(l, (Math.sin(yaw) * (huir ? 1 : -1)) * v, (Math.cos(yaw) * (huir ? 1 : -1)) * v, dt, false);
    l.moviendose = true;
    return;
  }
  // Se mueve de lado mientras dispara; los agresivos se acercan, los camperos se quedan.
  const lado = Math.sin(p.tiempo * 1.6 + l.id) > 0 ? 1 : -1;
  const avance = ia.personalidad === 'agresivo' && distancia > 12 ? 0.6 : distancia > arma.alcance * 0.8 ? 0.8 : 0;
  const v = VELOCIDAD * (ia.personalidad === 'campero' ? 0.3 : 0.55);
  const fx = -Math.sin(l.yaw);
  const fz = -Math.cos(l.yaw);
  p.mover(l, (Math.cos(l.yaw) * lado + fx * avance) * v, (-Math.sin(l.yaw) * lado + fz * avance) * v, dt, p.rng.siguiente() < 0.004);
  l.moviendose = true;

  const r = p.arma(l);
  if (r?.tipo === 'arma' && r.cargador <= 0) {
    p.recargar(l);
    return;
  }
  if (ia.reaccion <= 0 && Math.abs(dif) < 0.2 && distancia < arma.alcance) {
    // La puntería empeora con la distancia y si el otro se mueve.
    const acierto = Math.min(0.85, p.modo.punteria * Math.max(0.3, 1 - distancia / 90) * (e.moviendose ? 0.8 : 1) * (arma.perdigones > 1 ? 2 : 1));
    const errar = p.rng.siguiente() > acierto;
    const antes = l.pitch;
    if (errar) l.pitch += (p.rng.siguiente() < 0.5 ? 1 : -1) * (0.03 + p.rng.siguiente() * 0.05);
    else l.pitch = Math.atan2(pe.y + (p.rng.siguiente() < 0.15 ? 0.45 : 0) - ojo.y, distancia);
    p.disparar(l, errar ? 0.02 : 0);
    l.pitch = antes;
  }
}

/** Decide adónde ir cuando no hay combate. */
function planificar(p: Partida, l: Luchador) {
  const ia = l.ia;
  const t = p.tormenta;
  const x = l.cuerpo.x;
  const z = l.cuerpo.z;
  // 1. La tormenta manda: ir hacia el círculo siguiente.
  const lejos = Math.hypot(x - t.siguiente.x, z - t.siguiente.z) > t.siguiente.r * 0.85;
  if (fuera(t, x, z) || (lejos && (t.cerrando || t.tiempo < 15))) {
    const final = ia.ruta[ia.ruta.length - 1];
    if (!ia.meta && final && Math.hypot(final.x - t.siguiente.x, final.z - t.siguiente.z) < t.siguiente.r * 0.6) return;
    const destino = puntoSeguro(p, 0.5);
    irA(p, l, destino.x, destino.z);
    ia.meta = null;
    ia.espera = 0;
    return;
  }
  // 2. Curarse si hace falta.
  if (l.vida + l.escudo < 140 && ia.sinVer > 2) {
    const i = mejorCura(l.inv, l);
    if (i !== -1) {
      p.elegirRanura(l, i);
      p.empezarCura(l, i);
      return;
    }
  }
  // 3. Botín.
  const meta = buscarBotin(p, l);
  if (meta) {
    const o = meta.cofre ?? meta.objeto!;
    if (irA(p, l, o.x, o.z)) ia.meta = meta;
    else ia.ignorar.add(o.id);
    return;
  }
  // 4. Ir a por el ruido de disparos.
  if (ia.oido && tieneArma(l) && ia.personalidad !== 'campero' && dist(l.cuerpo, ia.oido) < 70) {
    irA(p, l, ia.oido.x + p.rng.rango(-5, 5), ia.oido.z + p.rng.rango(-5, 5));
    ia.oido = null;
    return;
  }
  // 5. Dar vueltas por la zona segura (los camperos se quedan quietos un rato).
  if (ia.ruta.length === 0) {
    if (ia.personalidad === 'campero' && ia.espera <= 0) ia.espera = p.rng.rango(5, 12);
    const destino = puntoSeguro(p, 0.7);
    irA(p, l, destino.x, destino.z);
  }
}

export function actualizarBot(p: Partida, l: Luchador, dt: number) {
  const ia = l.ia;
  if (l.estado === 'bus') return enBus(p, l);
  if (l.estado !== 'suelo') return enAire(p, l, dt);

  if (ia.oido) {
    ia.oido.t -= dt;
    if (ia.oido.t <= 0) ia.oido = null;
  }
  ia.revisar -= dt;
  ia.sinVer += dt;
  if (ia.revisar <= 0) {
    ia.revisar = 0.25;
    if (ia.enemigo && (!ia.enemigo.vivo || !seVen(p.ojo(l), p.pecho(ia.enemigo), p.rejilla))) ia.enemigo = null;
    // Sin arma no persigue a nadie lejos; fuera de la tormenta, primero huye de ella.
    if (ia.enemigo) {
      const d = dist(l.cuerpo, ia.enemigo.cuerpo);
      if ((!tieneArma(l) && d > 8) || (fuera(p.tormenta, l.cuerpo.x, l.cuerpo.z) && d > 15)) ia.enemigo = null;
    }
    if (!ia.enemigo) {
      const e = buscarEnemigo(p, l);
      if (e && (tieneArma(l) || dist(l.cuerpo, e.cuerpo) < 6)) {
        ia.enemigo = e;
        ia.reaccion = p.modo.reaccion * (0.8 + p.rng.siguiente() * 0.5);
      }
    }
  }

  if (ia.enemigo) {
    ia.sinVer = 0;
    if (l.curando > 0 && l.vida + l.escudo > 60) l.curando = 0;
    if (l.curando <= 0) return combatir(p, l, ia.enemigo, dt);
  }
  if (l.curando > 0) {
    l.moviendose = false;
    return;
  }

  // Recoger o abrir lo que tiene delante.
  const m = ia.meta;
  if (m) {
    const o = m.cofre ?? m.objeto!;
    const sigue = m.cofre ? !m.cofre.abierto : p.objetos.includes(m.objeto!);
    if (!sigue) ia.meta = null;
    else if (dist(l.cuerpo, o) < 1.6 && Math.abs(o.y - l.cuerpo.y) < 1.5) {
      if (m.cofre) p.abrirCofre(l, m.cofre);
      else if (m.objeto) {
        p.recogerBot(l, m.objeto);
        // Si no lo pudo coger, no insiste.
        if (p.objetos.includes(m.objeto)) ia.ignorar.add(m.objeto.id);
      }
      ia.meta = null;
      ia.ruta = [];
      ia.espera = 0.4;
    } else if (ia.ruta.length === 0) {
      ia.ignorar.add(m.cofre?.id ?? m.objeto!.id);
      ia.meta = null;
    }
  }

  // Lleva en la mano su mejor arma.
  const sel = p.arma(l);
  if (sel?.tipo !== 'arma' && l.curando <= 0) elegirArma(p, l, 20);
  const r = p.arma(l);
  if (r?.tipo === 'arma' && r.cargador < stats(r.arma, r.rareza).cargador * 0.5) p.recargar(l);

  if (ia.espera > 0) {
    ia.espera -= dt;
    l.moviendose = false;
    l.yaw += dt * 0.6;
    if (fuera(p.tormenta, l.cuerpo.x, l.cuerpo.z)) ia.espera = 0;
    return;
  }
  if (ia.revisar >= 0.24 && (!ia.meta || ia.ruta.length === 0)) planificar(p, l);
  caminar(p, l, dt);
}
