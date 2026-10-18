import { MUNICIONES, multiplicadorZona, PICO, RAREZAS, stats, type DatosArma } from '../core/armas';
import { botinDe } from '../core/botin';
import type { Modo } from '../core/difficulty';
import { moverCuerpo, rayoCaja, rayoMapa, Rejilla, seVen, type Cuerpo, type Punto3 } from '../core/fisica';
import { aplicarCura, aplicarDano, cabe, CURAS, inventarioVacio, mejorCura, nombreObjeto, recoger, RANURAS, vaciar, valorArma, type Inventario, type Objeto, type Ranura } from '../core/inventario';
import { generarIsla, type Casa, type Isla } from '../core/isla';
import { Navegacion } from '../core/navegacion';
import { crearRng, type Rng } from '../core/rng';
import { actualizarTormenta, crearTormenta, danoTormenta, fuera, type Tormenta } from '../core/tormenta';
import { actualizarBot, crearIa, type EstadoIa } from './ia';

export const ALTURA_OJOS = 1.6;
export const VELOCIDAD = 6;
const SALTO = 7.2;
export const JUGADORES = 10;
const ALTURA_BUS = 70;
const VELOCIDAD_BUS = 12;
/** Altura a la que se abre el planeador. */
const ALTURA_PLANEADOR = 28;

export type Estado = 'bus' | 'cayendo' | 'planeando' | 'suelo';

export interface Controles {
  /** Movimiento relativo a la vista: x = lateral, z = adelante (-1) / atrás (+1). */
  x: number;
  z: number;
  giroX: number;
  giroY: number;
  disparar: boolean;
  saltar: boolean;
  recargar: boolean;
  recoger: boolean;
  curar: boolean;
  zoom: boolean;
  /** -1 = pico, 0 a 4 = ranura; 'siguiente' / 'anterior' para la rueda. */
  ranura: number | 'siguiente' | 'anterior' | null;
  /** Ayuda de apuntado (pantallas táctiles). */
  asistido: boolean;
  /** Disparo automático cuando la mira está sobre un enemigo. */
  autoDisparo: boolean;
  /** Muerto: cambiar de jugador observado (1 = siguiente, -1 = anterior). */
  observar?: 1 | -1 | 0;
}

export const controlesVacios = (): Controles => ({
  x: 0, z: 0, giroX: 0, giroY: 0, disparar: false, saltar: false, recargar: false, recoger: false, curar: false, zoom: false, ranura: null, asistido: false, autoDisparo: false,
});

export interface Luchador {
  id: number;
  nombre: string;
  esJugador: boolean;
  cuerpo: Cuerpo;
  yaw: number;
  pitch: number;
  vida: number;
  escudo: number;
  vivo: boolean;
  estado: Estado;
  inv: Inventario;
  cd: number;
  recargando: number;
  /** Segundos que faltan para terminar de curarse (0 = no se está curando). */
  curando: number;
  curaRanura: number;
  /** Segundos desde el último disparo (animaciones y radar). */
  disparo: number;
  moviendose: boolean;
  bajas: number;
  danoCausado: number;
  muerteT: number;
  puesto: number;
  ia: EstadoIa;
}

export interface ObjetoMundo {
  id: number;
  x: number;
  y: number;
  z: number;
  objeto: Objeto;
  /** Segundos desde que apareció (para la animación). */
  t: number;
}

export interface Cofre {
  id: number;
  x: number;
  y: number;
  z: number;
  abierto: boolean;
  casa: Casa | null;
}

export interface Trazo {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  t: number;
  propio: boolean;
}

export interface Impacto {
  x: number; y: number; z: number;
  t: number;
  sangre: boolean;
}

export interface NumeroDano {
  x: number; y: number; z: number;
  valor: number;
  t: number;
  escudo: boolean;
  cabeza: boolean;
}

export interface Resumen {
  puesto: number;
  bajas: number;
  dano: number;
  tiempo: number;
  victoria: boolean;
}

export interface EventosPartida {
  disparo?: (s: Luchador) => void;
  golpeRecibido?: (angulo: number) => void;
  acierto?: (cabeza: boolean, escudo: boolean) => void;
  baja?: (asesino: Luchador | null, victima: Luchador) => void;
  recoger?: () => void;
  cofre?: () => void;
  curado?: () => void;
  aterrizaje?: () => void;
  /** Tu partida terminó: te eliminaron o ganaste. */
  fin: (r: Resumen) => void;
  /** Queda uno solo (se avisa aunque estés mirando como espectador). */
  ganador?: (g: Luchador) => void;
}

const NOMBRES = ['Lupe', 'Toño', 'Nacho', 'Rocío', 'Paco', 'Marta', 'Quique', 'Sole', 'Rubén', 'Inés', 'Chema', 'Luz', 'Beto', 'Pili', 'Fito', 'Vero', 'Lalo', 'Nuria', 'Tito', 'Maite'];

export interface Bus {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  duracion: number;
  t: number;
}

export class Partida {
  readonly isla: Isla;
  readonly rejilla: Rejilla;
  readonly nav: Navegacion;
  readonly rng: Rng;
  luchadores: Luchador[] = [];
  jugador!: Luchador;
  objetos: ObjetoMundo[] = [];
  cofres: Cofre[] = [];
  tormenta: Tormenta;
  bus: Bus;
  tiempo = 0;
  zoom = false;
  retroceso = 0;
  terminada = false;
  pausada = false;
  ganador: Luchador | null = null;
  /** Jugador cuya vista se sigue tras caer (modo espectador). */
  observado: Luchador | null = null;
  trazos: Trazo[] = [];
  impactos: Impacto[] = [];
  numeros: NumeroDano[] = [];
  registro: Array<{ texto: string; t: number; propio: boolean }> = [];
  private siguienteId = 1;
  private gatilloSoltado = true;
  private resumenEnviado = false;
  private muerteJugador = 0;
  private tiempoTormenta = 0;

  constructor(readonly modo: Modo, readonly nivel: number, private eventos: EventosPartida, semilla = Date.now(), nombreJugador = 'Tú') {
    this.rng = crearRng(semilla);
    this.isla = generarIsla(nivel * 1000 + (semilla % 1000));
    this.rejilla = new Rejilla(this.isla.bloques);
    this.nav = new Navegacion(this.isla.bloques, this.isla.radio);
    this.tormenta = crearTormenta(this.rng, this.isla.radio, modo.tormenta);
    this.bus = this.crearBus();
    this.repartirBotin();

    const nombres = [...NOMBRES];
    for (let i = 0; i < JUGADORES; i++) {
      const nombre = i === 0 ? nombreJugador : nombres.splice(this.rng.entero(0, nombres.length - 1), 1)[0];
      this.luchadores.push(this.crearLuchador(nombre, i === 0));
    }
    this.jugador = this.luchadores[0];
  }

  /* ---------- Preparación ---------- */

  private crearBus(): Bus {
    const R = this.isla.radio;
    const a = this.rng.siguiente() * Math.PI * 2;
    const desvio = this.rng.rango(-0.3, 0.3) * R;
    const px = -Math.sin(a) * desvio;
    const pz = Math.cos(a) * desvio;
    const l = R * 1.35;
    const bus = { x0: px - Math.cos(a) * l, z0: pz - Math.sin(a) * l, x1: px + Math.cos(a) * l, z1: pz + Math.sin(a) * l, duracion: (l * 2) / VELOCIDAD_BUS, t: 0 };
    return bus;
  }

  posicionBus(t = this.bus.t) {
    const k = Math.min(1, t / this.bus.duracion);
    return { x: this.bus.x0 + (this.bus.x1 - this.bus.x0) * k, y: ALTURA_BUS, z: this.bus.z0 + (this.bus.z1 - this.bus.z0) * k };
  }

  /** Momento del viaje en que el autobús pasa más cerca de un punto. */
  momentoMasCerca(x: number, z: number): number {
    const dx = this.bus.x1 - this.bus.x0;
    const dz = this.bus.z1 - this.bus.z0;
    const k = Math.max(0, Math.min(1, ((x - this.bus.x0) * dx + (z - this.bus.z0) * dz) / (dx * dx + dz * dz)));
    return k * this.bus.duracion;
  }

  private repartirBotin() {
    for (const p of this.isla.botin) {
      if (p.cofre) this.cofres.push({ id: this.siguienteId++, x: p.x, y: p.y, z: p.z, abierto: false, casa: p.casa });
      else for (const o of botinDe(this.rng, false)) this.soltar(o, p.x, p.y, p.z, 0.8);
    }
  }

  private crearLuchador(nombre: string, esJugador: boolean): Luchador {
    const b = this.posicionBus(0);
    const l: Luchador = {
      id: this.siguienteId++, nombre, esJugador,
      cuerpo: { x: b.x, y: b.y, z: b.z, vy: 0, radio: 0.35, alto: 1.8, enSuelo: false },
      yaw: 0, pitch: -0.2, vida: 100, escudo: 0, vivo: true, estado: 'bus',
      inv: inventarioVacio(), cd: 0, recargando: 0, curando: 0, curaRanura: -1, disparo: 9, moviendose: false,
      bajas: 0, danoCausado: 0, muerteT: 0, puesto: 0,
      ia: crearIa(),
    };
    if (!esJugador) l.ia.saltoT = -1;
    return l;
  }

  /** Deja un objeto en el mundo; con `esparcir` > 0 cae un poco desplazado. */
  soltar(o: Objeto, x: number, y: number, z: number, esparcir = 0): ObjetoMundo {
    // Nunca dentro de una pared ni al otro lado (se prueba hasta encontrar un sitio libre a la vista).
    let px = x;
    let pz = z;
    for (let i = 0; i < 8; i++) {
      const a = this.rng.siguiente() * Math.PI * 2;
      const r = esparcir * this.rng.siguiente();
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      if ((y > 0.5 || this.nav.libre(cx, cz)) && this.nav.recto({ x, z }, { x: cx, z: cz })) {
        px = cx;
        pz = cz;
        break;
      }
    }
    if (y <= 0.5 && !this.nav.libre(px, pz)) {
      const libre = this.nav.puntoLibre({ x: px, z: pz });
      if (libre) {
        px = libre.x;
        pz = libre.z;
      }
    }
    const om = { id: this.siguienteId++, x: px, y, z: pz, objeto: o, t: 0 };
    this.objetos.push(om);
    return om;
  }

  get vivos(): number {
    let n = 0;
    for (const l of this.luchadores) if (l.vivo) n++;
    return n;
  }

  get enBus(): boolean {
    return this.jugador.estado === 'bus';
  }

  /* ---------- Bucle ---------- */

  actualizar(dt: number, c: Controles) {
    if (this.pausada || this.terminada) return;
    this.tiempo += dt;
    for (const t of this.trazos) t.t -= dt;
    this.trazos = this.trazos.filter((t) => t.t > 0);
    for (const i of this.impactos) i.t -= dt;
    this.impactos = this.impactos.filter((i) => i.t > 0);
    for (const n of this.numeros) n.t -= dt;
    this.numeros = this.numeros.filter((n) => n.t > 0);
    for (const r of this.registro) r.t -= dt;
    this.registro = this.registro.filter((r) => r.t > 0);
    for (const o of this.objetos) o.t += dt;
    this.retroceso = Math.max(0, this.retroceso - dt * 0.12);

    // El autobús cruza la isla; al final todos saltan.
    if (this.bus.t < this.bus.duracion) this.bus.t += dt;
    else for (const l of this.luchadores) if (l.estado === 'bus') this.saltarDelBus(l);

    // La tormenta empieza cuando el autobús se va.
    if (this.bus.t >= this.bus.duracion * 0.5) {
      this.tiempoTormenta += dt;
      actualizarTormenta(this.tormenta, dt, this.rng, this.isla.radio);
    }

    this.actualizarJugador(dt, c);
    this.actualizarEspectador(dt, c.observar ?? 0);
    for (const l of this.luchadores) {
      if (!l.vivo) {
        l.muerteT += dt;
        continue;
      }
      l.cd -= dt;
      l.disparo += dt;
      if (l.recargando > 0) {
        l.recargando -= dt;
        if (l.recargando <= 0) this.completarRecarga(l);
      }
      if (l.curando > 0) {
        l.curando -= dt;
        if (l.curando <= 0) this.completarCura(l);
      }
      if (!l.esJugador) actualizarBot(this, l, dt);
      if (l.estado === 'bus') {
        const b = this.posicionBus();
        l.cuerpo.x = b.x;
        l.cuerpo.y = b.y;
        l.cuerpo.z = b.z;
      }
      // Tormenta: quita vida aunque haya escudo.
      if (l.estado === 'suelo' && fuera(this.tormenta, l.cuerpo.x, l.cuerpo.z)) {
        aplicarDano(l, danoTormenta(this.tormenta) * dt, true);
        if (l.vida <= 0) this.eliminar(l, null);
      }
    }
  }

  saltarDelBus(l: Luchador) {
    if (l.estado !== 'bus') return;
    l.estado = 'cayendo';
    l.cuerpo.vy = 0;
    l.cuerpo.y -= 2;
  }

  /** Movimiento en el suelo o en el aire, según el estado. `mx`/`mz` en coordenadas del mundo, ya multiplicados por la velocidad. */
  mover(l: Luchador, mx: number, mz: number, dt: number, saltar: boolean) {
    const c = l.cuerpo;
    if (l.estado === 'bus') return;
    if (l.estado === 'cayendo' || l.estado === 'planeando') {
      const sobreSuelo = c.y;
      if (l.estado === 'cayendo' && (sobreSuelo < ALTURA_PLANEADOR || (saltar && sobreSuelo < ALTURA_BUS - 10))) l.estado = 'planeando';
      const horizontal = l.estado === 'cayendo' ? 2.2 : 1.8;
      c.vy = l.estado === 'cayendo' ? Math.max(c.vy, -24) : -5.5;
      moverCuerpo(c, mx * horizontal * dt, mz * horizontal * dt, dt, this.rejilla, l.estado === 'cayendo' ? 20 : 0);
      if (c.enSuelo) {
        l.estado = 'suelo';
        if (l.esJugador) this.eventos.aterrizaje?.();
      }
    } else {
      if (saltar && c.enSuelo) c.vy = SALTO;
      moverCuerpo(c, mx * dt, mz * dt, dt, this.rejilla);
    }
    // Agua: no se puede salir de la isla.
    const r = Math.hypot(c.x, c.z);
    const max = this.isla.radio + 2;
    if (r > max) {
      c.x = (c.x / r) * max;
      c.z = (c.z / r) * max;
    }
  }

  /* ---------- Jugador ---------- */

  arma(l: Luchador): Ranura | null {
    const r = l.inv.seleccion >= 0 ? l.inv.ranuras[l.inv.seleccion] : null;
    return r ?? null;
  }

  datosArma(l: Luchador): DatosArma | null {
    const r = this.arma(l);
    return r?.tipo === 'arma' ? stats(r.arma, r.rareza) : null;
  }

  private actualizarJugador(dt: number, c: Controles) {
    const j = this.jugador;
    if (!j.vivo) return;
    const d = this.datosArma(j);
    const sens = this.zoom ? (d && d.zoom > 2 ? 0.3 : 0.6) : 1;
    j.yaw -= c.giroX * sens;
    j.pitch = Math.max(-1.2, Math.min(1.2, j.pitch - c.giroY * sens));

    if (j.estado === 'bus') {
      if (c.saltar && this.bus.t > 1) this.saltarDelBus(j);
      return;
    }

    if (c.asistido && j.estado === 'suelo') this.asistir(dt);
    if (c.ranura !== null) this.elegirRanura(j, c.ranura);
    if (c.zoom && d && j.estado === 'suelo') this.zoom = !this.zoom;
    if (!d || j.estado !== 'suelo') this.zoom = false;
    if (c.recargar) this.recargar(j);
    if (c.curar) {
      const i = mejorCura(j.inv, j);
      if (i !== -1) this.empezarCura(j, i);
    }
    if (c.recoger) this.interactuar(j);

    const largo = Math.hypot(c.x, c.z);
    const mx = largo > 1 ? c.x / largo : c.x;
    const mz = largo > 1 ? c.z / largo : c.z;
    const vel = VELOCIDAD * (this.zoom ? 0.6 : 1) * (j.curando > 0 ? 0.45 : 1);
    const sin = Math.sin(j.yaw);
    const cos = Math.cos(j.yaw);
    j.moviendose = largo > 0.1;
    this.mover(j, (mx * cos + mz * sin) * vel, (-mx * sin + mz * cos) * vel, dt, c.saltar);
    if (j.estado !== 'suelo') return;

    // Munición: se recoge sola al pasar por encima.
    for (const o of this.objetos) {
      if (o.objeto.tipo === 'municion' && o.t > 0.6 && Math.hypot(o.x - j.cuerpo.x, o.z - j.cuerpo.z) < 1.3 && Math.abs(o.y - j.cuerpo.y) < 1.5) this.recogerObjeto(j, o);
    }

    const sel = this.arma(j);
    if (sel?.tipo === 'cura' && c.disparar) this.empezarCura(j, j.inv.seleccion);
    else if (c.disparar || (c.autoDisparo && this.enemigoEnMira())) this.disparar(j);
  }

  elegirRanura(l: Luchador, r: number | 'siguiente' | 'anterior') {
    const antes = l.inv.seleccion;
    if (r === 'siguiente' || r === 'anterior') {
      const paso = r === 'siguiente' ? 1 : -1;
      let i = l.inv.seleccion;
      for (let k = 0; k < RANURAS + 1; k++) {
        i += paso;
        if (i >= RANURAS) i = -1;
        if (i < -1) i = RANURAS - 1;
        if (i === -1 || l.inv.ranuras[i]) break;
      }
      l.inv.seleccion = i;
    } else if (r === -1 || l.inv.ranuras[r]) l.inv.seleccion = r;
    if (l.inv.seleccion !== antes) {
      l.recargando = 0;
      l.curando = 0;
      l.cd = Math.max(l.cd, 0.25);
      if (l.esJugador) this.zoom = false;
    }
  }

  /** Lo más cercano que se puede recoger o abrir (para el aviso del HUD). */
  interactuable(l: Luchador): { objeto: ObjetoMundo | null; cofre: Cofre | null } | null {
    let mejor: ObjetoMundo | null = null;
    let cofre: Cofre | null = null;
    let d = 2.3;
    for (const o of this.objetos) {
      if (o.objeto.tipo === 'municion') continue;
      const dist = Math.hypot(o.x - l.cuerpo.x, o.z - l.cuerpo.z);
      if (dist < d && Math.abs(o.y - l.cuerpo.y) < 1.5) {
        d = dist;
        mejor = o;
      }
    }
    for (const c of this.cofres) {
      if (c.abierto) continue;
      const dist = Math.hypot(c.x - l.cuerpo.x, c.z - l.cuerpo.z);
      if (dist < d && Math.abs(c.y - l.cuerpo.y) < 1.5) {
        d = dist;
        cofre = c;
        mejor = null;
      }
    }
    return mejor || cofre ? { objeto: mejor, cofre } : null;
  }

  private interactuar(l: Luchador) {
    const i = this.interactuable(l);
    if (i?.cofre) this.abrirCofre(l, i.cofre);
    else if (i?.objeto) this.recogerObjeto(l, i.objeto);
  }

  abrirCofre(l: Luchador, c: Cofre) {
    if (c.abierto) return;
    c.abierto = true;
    const mejora = l.esJugador ? 1 : this.modo.botin;
    for (const o of botinDe(this.rng, true, mejora)) this.soltar(o, c.x, c.y, c.z, 1.1);
    if (l.esJugador) this.eventos.cofre?.();
  }

  recogerObjeto(l: Luchador, o: ObjetoMundo, cambiar = true) {
    const i = this.objetos.indexOf(o);
    if (i === -1) return;
    const resto = recoger(l.inv, o.objeto, cambiar);
    if (resto === o.objeto) return;
    this.objetos.splice(i, 1);
    if (resto) this.soltar(resto, l.cuerpo.x, l.cuerpo.y, l.cuerpo.z, 0.6).t = 0;
    if (l.esJugador) this.eventos.recoger?.();
  }

  /* ---------- Curas y recarga ---------- */

  empezarCura(l: Luchador, ranura: number) {
    const r = l.inv.ranuras[ranura];
    if (r?.tipo !== 'cura' || l.curando > 0 || l.estado !== 'suelo') return;
    l.curando = CURAS[r.cura].tiempo;
    l.curaRanura = ranura;
    l.recargando = 0;
    if (l.esJugador) this.zoom = false;
  }

  private completarCura(l: Luchador) {
    const r = l.inv.ranuras[l.curaRanura];
    l.curando = 0;
    if (r?.tipo !== 'cura') return;
    aplicarCura(l, r.cura);
    r.cantidad--;
    if (r.cantidad <= 0) {
      l.inv.ranuras[l.curaRanura] = null;
      if (l.inv.seleccion === l.curaRanura) l.inv.seleccion = -1;
    }
    if (l.esJugador) this.eventos.curado?.();
  }

  recargar(l: Luchador) {
    const r = this.arma(l);
    if (r?.tipo !== 'arma' || l.recargando > 0) return;
    const d = stats(r.arma, r.rareza);
    if (r.cargador >= d.cargador || l.inv.municion[d.municion] <= 0) return;
    l.recargando = d.recarga;
    l.curando = 0;
    if (l.esJugador) this.zoom = false;
  }

  private completarRecarga(l: Luchador) {
    const r = this.arma(l);
    if (r?.tipo !== 'arma') return;
    const d = stats(r.arma, r.rareza);
    const falta = Math.min(d.cargador - r.cargador, l.inv.municion[d.municion]);
    r.cargador += falta;
    l.inv.municion[d.municion] -= falta;
  }

  /* ---------- Cámara y disparos ---------- */

  ojo(l: Luchador): Punto3 {
    return { x: l.cuerpo.x, y: l.cuerpo.y + ALTURA_OJOS, z: l.cuerpo.z };
  }

  pecho(l: Luchador): Punto3 {
    return { x: l.cuerpo.x, y: l.cuerpo.y + 1.2, z: l.cuerpo.z };
  }

  static direccion(yaw: number, pitch: number) {
    const cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  }

  /**
   * Cámara en tercera persona, sobre el hombro derecho. Se acerca al apuntar y no atraviesa paredes.
   * `atras` es la distancia de la cámara al hombro (los disparos del jugador empiezan ahí).
   */
  camara(l: Luchador, zoom = false): { x: number; y: number; z: number; atras: number } {
    const dir = Partida.direccion(l.yaw, l.pitch);
    const aire = l.estado !== 'suelo';
    const lado = aire ? 0 : zoom ? 0.55 : 0.7;
    const rx = Math.cos(l.yaw);
    const rz = -Math.sin(l.yaw);
    const px = l.cuerpo.x + rx * lado;
    const py = l.cuerpo.y + (aire ? 1.2 : 1.65);
    const pz = l.cuerpo.z + rz * lado;
    let atras = aire ? 7 : zoom ? 1.5 : 3.3;
    const choque = rayoMapa(px, py, pz, -dir.x, -dir.y, -dir.z, this.rejilla, atras + 0.3);
    atras = Math.max(0.3, Math.min(atras, choque - 0.3));
    return { x: px - dir.x * atras, y: Math.max(0.3, py - dir.y * atras), z: pz - dir.z * atras, atras };
  }

  /** Origen y dirección del disparo: el jugador apunta con la cámara; los bots, desde sus ojos. */
  private origenDisparo(l: Luchador): Punto3 {
    if (!l.esJugador) return this.ojo(l);
    const c = this.camara(l, this.zoom);
    const dir = Partida.direccion(l.yaw, l.pitch);
    return { x: c.x + dir.x * c.atras, y: c.y + dir.y * c.atras, z: c.z + dir.z * c.atras };
  }

  /** Ayuda de apuntado: acerca la mira al enemigo visible más cercano al centro. */
  private asistir(dt: number) {
    const j = this.jugador;
    const ojo = this.origenDisparo(j);
    let mejor: { dYaw: number; dPitch: number; angulo: number } | null = null;
    for (const e of this.luchadores) {
      if (!e.vivo || e === j || e.estado !== 'suelo') continue;
      const p = this.pecho(e);
      const dx = p.x - ojo.x;
      const dy = p.y - ojo.y;
      const dz = p.z - ojo.z;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const dYaw = Math.atan2(Math.sin(yaw - j.yaw), Math.cos(yaw - j.yaw));
      const dPitch = pitch - j.pitch;
      const angulo = Math.hypot(dYaw, dPitch);
      if (angulo > 0.22 || (mejor && angulo > mejor.angulo) || !seVen(ojo, p, this.rejilla)) continue;
      mejor = { dYaw, dPitch, angulo };
    }
    if (!mejor) return;
    const k = Math.min(1, dt * 4);
    j.yaw += mejor.dYaw * k;
    j.pitch += mejor.dPitch * k;
  }

  /** Se llama cuando el jugador suelta el gatillo (armas semiautomáticas). */
  soltarGatillo() {
    this.gatilloSoltado = true;
  }

  disparar(l: Luchador, desvioExtra = 0) {
    if (l.cd > 0 || l.recargando > 0 || l.estado !== 'suelo' || l.curando > 0) return;
    const r = this.arma(l);
    if (r?.tipo === 'cura') return;
    if (r?.tipo !== 'arma') {
      this.golpePico(l);
      return;
    }
    const d = stats(r.arma, r.rareza);
    if (l.esJugador && !d.automatica && !this.gatilloSoltado) return;
    if (r.cargador <= 0) {
      this.recargar(l);
      return;
    }
    if (l.esJugador) this.gatilloSoltado = false;
    l.cd = d.cadencia;
    l.disparo = 0;
    r.cargador--;
    this.eventos.disparo?.(l);
    for (const o of this.luchadores) if (!o.esJugador && o !== l) o.ia.oido = { x: l.cuerpo.x, z: l.cuerpo.z, t: 4 };

    const ojo = this.origenDisparo(l);
    let dispersion = d.precision + (l.moviendose || !l.cuerpo.enSuelo ? d.dispersionMovimiento : 0) + desvioExtra;
    if (l.esJugador) {
      dispersion += this.retroceso;
      if (r.arma === 'francotirador' && !this.zoom) dispersion += 0.06;
      else if (this.zoom) dispersion *= 0.5;
    }
    const retrocesoAntes = this.retroceso;
    if (l.esJugador) {
      this.retroceso = Math.min(0.07, this.retroceso + d.retroceso);
      if (r.arma === 'francotirador') this.zoom = false;
    }
    // Desde dónde se ve salir la bala: la mano del que dispara.
    const mano = { x: l.cuerpo.x + Math.cos(l.yaw) * 0.3, y: l.cuerpo.y + 1.35, z: l.cuerpo.z - Math.sin(l.yaw) * 0.3 };
    const danos = new Map<Luchador, { dano: number; cabeza: boolean }>();
    for (let k = 0; k < d.perdigones; k++) {
      const yaw = l.yaw + (this.rng.siguiente() - 0.5) * 2 * dispersion;
      const pitch = l.pitch + (this.rng.siguiente() - 0.5) * 2 * dispersion + (l.esJugador ? retrocesoAntes * 0.5 : 0);
      const dir = Partida.direccion(yaw, pitch);
      const hasta = rayoMapa(ojo.x, ojo.y, ojo.z, dir.x, dir.y, dir.z, this.rejilla, d.alcance);
      const golpe = this.rayoLuchadores(l, ojo, dir, hasta);
      const fin = golpe ? golpe.t : hasta;
      const px = ojo.x + dir.x * fin;
      const py = ojo.y + dir.y * fin;
      const pz = ojo.z + dir.z * fin;
      if (k < 3 || d.perdigones === 1) this.trazos.push({ x0: mano.x, y0: mano.y, z0: mano.z, x1: px, y1: py, z1: pz, t: 0.06, propio: l.esJugador });
      if (golpe) {
        this.impactos.push({ x: px, y: py, z: pz, t: 0.4, sangre: true });
        // Las escopetas pierden daño con la distancia.
        const caida = d.perdigones > 1 ? Math.max(0.35, 1 - fin / d.alcance) : 1;
        let dano = d.dano * multiplicadorZona(golpe.zona, d.cabeza) * caida;
        if (!l.esJugador && golpe.l.esJugador) dano *= this.modo.dano;
        const previo = danos.get(golpe.l) ?? { dano: 0, cabeza: false };
        danos.set(golpe.l, { dano: previo.dano + dano, cabeza: previo.cabeza || golpe.zona === 'cabeza' });
      } else if (fin < d.alcance - 0.01) {
        this.impactos.push({ x: px, y: py, z: pz, t: 2, sangre: false });
      }
    }
    for (const [v, x] of danos) this.herir(v, x.dano, l, x.cabeza);
  }

  private golpePico(l: Luchador) {
    l.cd = PICO.cadencia;
    l.disparo = 0;
    const ojo = this.ojo(l);
    const dir = Partida.direccion(l.yaw, l.pitch);
    const golpe = this.rayoLuchadores(l, ojo, dir, PICO.alcance);
    if (golpe) this.herir(golpe.l, PICO.dano * (l.esJugador ? 1 : this.modo.dano), l, golpe.zona === 'cabeza');
  }

  private rayoLuchadores(l: Luchador, o: Punto3, dir: Punto3, hasta: number) {
    let golpe: { l: Luchador; t: number; zona: 'cabeza' | 'cuerpo' | 'piernas' } | null = null;
    for (const v of this.luchadores) {
      if (!v.vivo || v === l || v.estado === 'bus') continue;
      const { x, y, z } = v.cuerpo;
      if (Math.abs(x - o.x) > hasta + 1 && Math.abs(z - o.z) > hasta + 1) continue;
      const zonas: Array<['cabeza' | 'cuerpo' | 'piernas', number, number, number]> = [
        ['cabeza', 1.4, 1.85, 0.18],
        ['cuerpo', 0.75, 1.4, 0.32],
        ['piernas', 0, 0.75, 0.24],
      ];
      for (const [zona, y0, y1, r] of zonas) {
        const t = rayoCaja(o.x, o.y, o.z, dir.x, dir.y, dir.z, x - r, y + y0, z - r, x + r, y + y1, z + r);
        if (t < hasta && (!golpe || t < golpe.t)) golpe = { l: v, t, zona };
      }
    }
    return golpe;
  }

  /** ¿Hay un enemigo justo en el centro de la mira, a tiro y sin obstáculos? */
  enemigoEnMira(): boolean {
    const j = this.jugador;
    const d = this.datosArma(j);
    if (!d) return false;
    const o = this.origenDisparo(j);
    const dir = Partida.direccion(j.yaw, j.pitch);
    const hasta = rayoMapa(o.x, o.y, o.z, dir.x, dir.y, dir.z, this.rejilla, d.alcance);
    return this.rayoLuchadores(j, o, dir, hasta) !== null;
  }

  private herir(v: Luchador, dano: number, atacante: Luchador, cabeza: boolean) {
    if (!v.vivo) return;
    const conEscudo = v.escudo > 0;
    const antes = v.vida + v.escudo;
    aplicarDano(v, dano);
    const hecho = antes - (v.vida + v.escudo);
    atacante.danoCausado += hecho;
    v.curando = 0;
    if (v.esJugador) this.eventos.golpeRecibido?.(Math.atan2(-(atacante.cuerpo.x - v.cuerpo.x), -(atacante.cuerpo.z - v.cuerpo.z)) - v.yaw);
    if (atacante.esJugador) {
      this.eventos.acierto?.(cabeza, conEscudo);
      this.numeros.push({ x: v.cuerpo.x, y: v.cuerpo.y + 2.1, z: v.cuerpo.z, valor: Math.round(hecho), t: 0.9, escudo: conEscudo, cabeza });
    }
    // El que recibe un disparo se gira hacia quien le disparó.
    if (!v.esJugador && (!v.ia.enemigo || !v.ia.enemigo.vivo)) {
      v.ia.enemigo = atacante;
      v.ia.reaccion = this.modo.reaccion * 0.6;
    }
    if (v.vida <= 0) this.eliminar(v, atacante, cabeza);
  }

  private eliminar(v: Luchador, asesino: Luchador | null, cabeza = false) {
    if (!v.vivo) return;
    v.vivo = false;
    v.vida = 0;
    v.muerteT = 0;
    v.puesto = this.vivos + 1;
    if (asesino) asesino.bajas++;
    const texto = asesino ? `${asesino.nombre} ${cabeza ? '🎯' : '🔫'} ${v.nombre}` : `🌀 ${v.nombre} cayó en la tormenta`;
    this.registro.unshift({ texto, t: 5, propio: v.esJugador || !!asesino?.esJugador });
    this.registro = this.registro.slice(0, 5);
    for (const o of vaciar(v.inv)) this.soltar(o, v.cuerpo.x, v.cuerpo.y, v.cuerpo.z, 1.4);
    v.inv = inventarioVacio();
    this.eventos.baja?.(asesino, v);
    if (v.esJugador) {
      this.zoom = false;
      this.enviarResumen(false);
    }
    if (this.vivos <= 1 && !this.ganador) {
      this.ganador = this.luchadores.find((l) => l.vivo) ?? v;
      this.ganador.puesto = 1;
      if (this.ganador.esJugador) this.enviarResumen(true);
      this.eventos.ganador?.(this.ganador);
    }
  }

  private enviarResumen(victoria: boolean) {
    if (this.resumenEnviado) return;
    this.resumenEnviado = true;
    const j = this.jugador;
    this.eventos.fin({ puesto: victoria ? 1 : j.puesto, bajas: j.bajas, dano: Math.round(j.danoCausado), tiempo: Math.round(this.tiempo), victoria });
  }

  /** Tras caer (2 s viendo tu cuerpo) se sigue la vista de quien te eliminó o de otro jugador. */
  private actualizarEspectador(dt: number, cambio: number) {
    if (this.jugador.vivo) {
      this.observado = null;
      return;
    }
    this.muerteJugador += dt;
    if (this.muerteJugador < 2) return;
    const lista = this.luchadores.filter((l) => l.vivo);
    if (!lista.length) {
      this.observado = null;
      return;
    }
    const i = this.observado ? lista.indexOf(this.observado) : -1;
    if (i === -1) this.observado = lista[0];
    else if (cambio) this.observado = lista[(i + cambio + lista.length) % lista.length];
  }

  /* ---------- Ayudas para la IA ---------- */

  /** ¿Quiere este luchador el objeto? */
  leSirve(l: Luchador, o: Objeto): boolean {
    if (o.tipo === 'municion') return l.inv.ranuras.some((r) => r?.tipo === 'arma' && stats(r.arma, r.rareza).municion === o.municion) && l.inv.municion[o.municion] < MUNICIONES[o.municion].paquete * 6;
    if (o.tipo === 'cura') return cabe(l.inv, o);
    if (cabe(l.inv, o)) return !l.inv.ranuras.some((r) => r?.tipo === 'arma' && r.arma === o.arma && r.rareza >= o.rareza);
    const peor = Math.min(...l.inv.ranuras.map((r) => (r?.tipo === 'arma' ? valorArma(r) : 0)));
    return valorArma(o) > peor;
  }

  /** Un bot recoge el objeto; si no cabe, cambia su peor ranura. */
  recogerBot(l: Luchador, om: ObjetoMundo) {
    if (!cabe(l.inv, om.objeto)) {
      let peor = 0;
      let valor = Infinity;
      l.inv.ranuras.forEach((r, i) => {
        const v = r?.tipo === 'arma' ? valorArma(r) : r ? 5 : 0;
        if (v < valor) {
          valor = v;
          peor = i;
        }
      });
      l.inv.seleccion = peor;
    }
    this.recogerObjeto(l, om);
  }

  textoObjeto(o: Objeto): string {
    return o.tipo === 'arma' ? `${nombreObjeto(o)} (${RAREZAS[o.rareza].nombre})` : nombreObjeto(o);
  }
}
