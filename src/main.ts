import './styles.css';

import { app } from './app';
import { audio } from './audio';
import { MUNICIONES, RAREZAS, stats } from './core/armas';
import { MODOS, modoNivel, PUESTO_PARA_SUBIR } from './core/difficulty';
import { Entrada } from './core/input';
import { CURAS, RANURAS } from './core/inventario';
import { iniciarBucle } from './core/loop';
import { FASES, fuera } from './core/tormenta';
import { iniciarPantallaCompleta } from './fullscreen';
import { controlesVacios, JUGADORES, Partida, type Luchador, type Resumen } from './game/logica';
import type { Render3D } from './game/render3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { anotarPartida, limpiarNombre } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
const controles = document.getElementById('controles')!;
const entrada = new Entrada(
  [
    { nombre: 'curar', teclas: ['KeyQ'], mando: 3, etiqueta: '✚' },
    { nombre: 'recargar', teclas: ['KeyR'], mando: 2, etiqueta: 'R' },
    { nombre: 'recoger', teclas: ['KeyE'], mando: 1, etiqueta: '✋' },
    { nombre: 'mira', teclas: ['KeyZ'], mando: 6, etiqueta: '🔭' },
    { nombre: 'saltar', teclas: ['Space'], mando: 0, etiqueta: '⤒' },
    // En táctil el disparo usa botones propios (ver más abajo); aquí queda para el mando (gatillo derecho).
    { nombre: 'disparar', teclas: [], mando: 7, etiqueta: '' },
  ],
  controles,
);
const tactil = matchMedia('(pointer: coarse)').matches || (import.meta.env.DEV && location.search.includes('tactil'));
if (tactil) document.body.classList.add('tactil');

let partida: Partida | null = null;
let render: Render3D | null = null;
/** El motor 3D (three.js) se descarga aparte: el menú aparece sin esperarlo. */
let modulo3d: Promise<typeof import('./game/render3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/render3d'));

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta);
app.aplicarConfig();

/* ---------- Tamaño ---------- */

const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());

let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

/* ---------- Mirar: ratón (con el puntero bloqueado) o arrastrando en la mitad derecha ---------- */

let giroX = 0;
let giroY = 0;
let raton = false;
let zoomPendiente = false;
let ranuraPendiente: number | 'siguiente' | 'anterior' | null = null;
let observarPendiente: 1 | -1 | 0 = 0;
const sensibilidad = () => app.g.config.sensibilidad / 5;

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== lienzo3d) return;
  giroX += e.movementX * 0.0022 * sensibilidad();
  giroY += e.movementY * 0.0022 * sensibilidad();
});
lienzo3d.addEventListener('mousedown', (e) => {
  if (!partida || tactil) return;
  if (document.pointerLockElement !== lienzo3d) {
    void lienzo3d.requestPointerLock();
    return;
  }
  if (partida.observado) {
    observarPendiente = e.button === 2 ? -1 : 1;
    return;
  }
  if (e.button === 0) raton = true;
  if (e.button === 2) zoomPendiente = true;
});
addEventListener('mouseup', (e) => e.button === 0 && (raton = false));
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!partida) return;
  ranuraPendiente = e.deltaY > 0 ? 'siguiente' : 'anterior';
  e.preventDefault();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (partida?.observado && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) observarPendiente = e.key === 'ArrowRight' ? 1 : -1;
  if (e.key >= '1' && e.key <= String(RANURAS)) ranuraPendiente = Number(e.key) - 1;
  if (e.code === 'KeyF') ranuraPendiente = -1;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== lienzo3d && partida && !partida.terminada && !partida.pausada && !tactil && document.body.classList.contains('jugando')) pausar();
});

/*
 * Controles táctiles al estilo de los shooters móviles:
 * - Mitad derecha: arrastrar para mirar.
 * - Botón de disparo grande a la derecha: mientras se mantiene, arrastrar también apunta.
 * - Deslizar hacia arriba desde el botón de disparo activa o quita la mira.
 * - Botón de disparo pequeño a la izquierda: dispara con el pulgar izquierdo mientras el derecho apunta.
 */
const GIRO_TACTIL = 0.0055;
const zonaMirar = h('div', { class: 'zona-mirar' });
controles.prepend(zonaMirar);

function arrastrarParaMirar(
  el: HTMLElement,
  alEmpezar?: () => void,
  alMover?: (dx: number, dy: number, t: number, my: number) => boolean | void,
  alSoltar?: () => void,
) {
  let toque = { id: -1, x: 0, y: 0, x0: 0, y0: 0, t0: 0 };
  el.addEventListener('pointerdown', (e) => {
    if (toque.id !== -1) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    toque = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() };
    alEmpezar?.();
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== toque.id) return;
    const my = e.clientY - toque.y;
    const retener = alMover?.(e.clientX - toque.x0, e.clientY - toque.y0, performance.now() - toque.t0, my) === true;
    giroX += (e.clientX - toque.x) * GIRO_TACTIL * sensibilidad();
    if (!retener) giroY += my * GIRO_TACTIL * sensibilidad();
    toque.x = e.clientX;
    toque.y = e.clientY;
  });
  const soltar = (e: PointerEvent) => {
    if (e.pointerId !== toque.id) return;
    toque.id = -1;
    alSoltar?.();
  };
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
}
arrastrarParaMirar(zonaMirar);

let fuegoTactil = 0;
const botonFuego = h('div', { class: 'fuego fuego-der', 'aria-label': 'Disparar (desliza hacia arriba para apuntar)', role: 'button' }, h('span', { text: '🔫' }), h('small', { text: '⇡ mira' }));
const botonFuegoIzq = h('div', { class: 'fuego fuego-izq', 'aria-label': 'Disparar', role: 'button' }, h('span', { text: '🔫' }));
controles.append(botonFuego, botonFuegoIzq);
let deslizoMira = false;
let giroRetenido = 0;
const ventanaMira = (dx: number, dy: number, t: number) => !deslizoMira && dy <= 0 && Math.abs(dx) < 50 && t < 450;
arrastrarParaMirar(
  botonFuego,
  () => {
    fuegoTactil++;
    deslizoMira = false;
    giroRetenido = 0;
    botonFuego.classList.add('activo');
  },
  (dx, dy, t, my) => {
    if (ventanaMira(dx, dy, t)) {
      if (dy < -55) {
        deslizoMira = true;
        giroRetenido = 0;
        zoomPendiente = true;
        navigator.vibrate?.(15);
      } else giroRetenido += my;
      return true;
    }
    giroY += giroRetenido * GIRO_TACTIL * sensibilidad();
    giroRetenido = 0;
    return false;
  },
  () => {
    fuegoTactil--;
    botonFuego.classList.remove('activo');
  },
);
arrastrarParaMirar(
  botonFuegoIzq,
  () => {
    fuegoTactil++;
    botonFuegoIzq.classList.add('activo');
  },
  undefined,
  () => {
    fuegoTactil--;
    botonFuegoIzq.classList.remove('activo');
  },
);

const textoMira = botonFuego.querySelector('small')!;
let miraMostrada = false;
function actualizarBotonMira(zoom: boolean) {
  if (zoom === miraMostrada) return;
  miraMostrada = zoom;
  botonFuego.classList.toggle('apuntando', zoom);
  textoMira.textContent = zoom ? '⇡ quitar mira' : '⇡ mira';
}

/** Botones del modo espectador. */
const barraEspectador = h(
  'div',
  { class: 'espectador' },
  h('button', { type: 'button', class: 'btn btn-secundario', 'aria-label': 'Jugador anterior', text: '◀', onclick: () => (observarPendiente = -1) }),
  h('button', { type: 'button', class: 'btn btn-secundario', 'aria-label': 'Jugador siguiente', text: '▶', onclick: () => (observarPendiente = 1) }),
);
document.body.append(barraEspectador);
let espectando = false;
function actualizarEspectador(si: boolean) {
  if (si === espectando) return;
  espectando = si;
  document.body.classList.toggle('espectando', si);
}

document.body.append(h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));

/* ---------- Ranuras del inventario (botones: también sirven en táctil) ---------- */

const barraRanuras = h('div', { class: 'ranuras', role: 'toolbar', 'aria-label': 'Inventario' });
const botonesRanura: HTMLButtonElement[] = [];
for (let i = -1; i < RANURAS; i++) {
  const b = h('button', { type: 'button', class: 'ranura', 'aria-label': i === -1 ? 'Pico' : `Ranura ${i + 1}` }) as HTMLButtonElement;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ranuraPendiente = i;
  });
  botonesRanura.push(b);
  barraRanuras.append(b);
}
document.body.append(barraRanuras);
let claveRanuras = '';

function actualizarRanuras(j: Luchador) {
  const clave = JSON.stringify([j.inv.ranuras, j.inv.seleccion]);
  if (clave === claveRanuras) return;
  claveRanuras = clave;
  botonesRanura.forEach((b, k) => {
    const i = k - 1;
    const r = i >= 0 ? j.inv.ranuras[i] : null;
    b.classList.toggle('elegida', j.inv.seleccion === i);
    b.style.borderColor = r?.tipo === 'arma' ? RAREZAS[r.rareza].color : '';
    b.replaceChildren(
      h('span', { class: 'ranura-icono', text: i === -1 ? '⛏️' : !r ? '' : r.tipo === 'arma' ? '🔫' : CURAS[r.cura].icono }),
      h('small', { text: i === -1 ? 'Pico' : !r ? (tactil ? '' : String(i + 1)) : r.tipo === 'arma' ? stats(r.arma, r.rareza).nombre : `×${r.cantidad}` }),
    );
  });
}

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
  if (!si) {
    entrada.limpiar();
    raton = false;
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!tactil) {
    void lienzo3d.requestPointerLock?.();
  }
}

const AYUDA = tactil
  ? 'Joystick izquierdo para moverte; arrastra a la derecha para mirar. ⤒ salta del autobús y abre el planeador. Mantén 🔫 para disparar; desliza hacia arriba desde 🔫 (o toca 🔭) para apuntar. ✋ abre cofres y recoge, ✚ te cura, R recarga. Toca una ranura para elegir arma.'
  : 'WASD para moverte, ratón para mirar y clic para disparar. Espacio salta del autobús y abre el planeador. Clic derecho o Z: apuntar. E abre cofres y recoge, Q te cura, R recarga. 1 a 5 o la rueda eligen ranura, F el pico. Esc pausa.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🪂 McL Royale' }),
      h('p', { class: 'texto-suave', text: `Battle royale sin construcción: salta del autobús, busca armas y sé el último de ${JUGADORES} en pie. Cada nivel es una isla nueva.` }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  liberarPartida();
  const e = app.g.estadisticas;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🪂 McL Royale' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · Nivel ${app.g.nivel} · 🏆 ${e.victorias} victorias` }),
      boton(`Jugar · Nivel ${app.g.nivel}`, jugar, { variante: 'primario', icono: '▶' }),
      boton(`Dificultad: ${MODOS[app.g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Personaje', () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(menu)), { icono: '👕' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: `Queda entre los ${PUESTO_PARA_SUBIR} primeros para pasar de nivel. ${AYUDA}` }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

function records() {
  const e = app.g.estadisticas;
  const dato = (t: string, v: string | number) => h('div', { class: 'fila-mejora' }, h('span', { text: t }), h('strong', { text: String(v) }));
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `#${r.puesto} · ${r.bajas} bajas · nivel ${r.nivel}` })))
    : [h('p', { class: 'texto-suave', text: 'Aún no hay récords. ¡Juega una partida!' })];
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '🏆 Récords' }),
      dato('Nivel más alto', app.g.nivelMax),
      dato('Partidas', e.partidas),
      dato('Victorias', e.victorias),
      dato(`Top ${PUESTO_PARA_SUBIR}`, e.top3),
      dato('Bajas totales', e.bajas),
      dato('Más bajas en una partida', e.maxBajas),
      h('h2', { text: 'Mejores partidas' }),
      ...filas,
      boton('Volver', menu, { icono: '←' }),
    ),
  );
}

/* ---------- Partida ---------- */

let marcaAcierto = 0;
let marcaCabeza = false;
let marcaEscudo = false;
let marcaDano = 0;
let anguloDano = 0;
/** Resumen pendiente de mostrar (se espera un poco tras caer o ganar). */
let finPendiente: { r: Resumen; t: number; sube: boolean; record: boolean; nivel: number } | null = null;
let mirandoFin = false;
let minimapa: HTMLCanvasElement | null = null;

function liberarPartida() {
  partida = null;
  finPendiente = null;
  mirandoFin = false;
  actualizarEspectador(false);
}

async function jugar() {
  audio.iniciar();
  const mod = await cargar3d();
  liberarPartida();
  const nivel = app.g.nivel;
  const p = new Partida(
    modoNivel(MODOS[app.g.config.dificultad], nivel),
    nivel,
    {
      disparo: (s) => {
        if (s.esJugador) return audio.efecto('disparo');
        const d = Math.hypot(s.cuerpo.x - p.jugador.cuerpo.x, s.cuerpo.z - p.jugador.cuerpo.z);
        if (d < 80) audio.efecto('disparo', Math.max(0.08, 1 - d / 80));
      },
      acierto: (cabeza, escudo) => {
        marcaAcierto = 0.25;
        marcaCabeza = cabeza;
        marcaEscudo = escudo;
        audio.efecto('golpe');
      },
      golpeRecibido: (angulo) => {
        marcaDano = 0.7;
        anguloDano = angulo;
        audio.efecto('dano');
      },
      baja: (a, v) => {
        if (v.esJugador) audio.efecto('muerte');
        else if (a?.esJugador) audio.efecto('explosion');
      },
      recoger: () => audio.efecto('recoger'),
      cofre: () => audio.efecto('nivel'),
      curado: () => audio.efecto('recoger'),
      aterrizaje: () => audio.efecto('boton'),
      fin: (r) => {
        // Se anota ya: si sale del juego, el resultado no se pierde.
        const n = app.g.nivel;
        const { subeNivel, record } = anotarPartida(app.g, r, app.nombre(), PUESTO_PARA_SUBIR);
        app.guardar();
        finPendiente = { r, t: r.victoria ? 2.5 : 2, sube: subeNivel, record, nivel: n };
        if (r.victoria) audio.efecto('nivel');
      },
      ganador: (g) => {
        if (mirandoFin && !g.esJugador) setTimeout(() => partida === p && pantallaGanador(g), 1500);
      },
    },
    Date.now(),
    app.nombre(),
  );
  partida = p;
  if (import.meta.env.DEV) (window as unknown as { __partida: Partida }).__partida = p;
  const renderer = render?.renderer;
  render?.destruir();
  render = new mod.Render3D(lienzo3d, p.isla, renderer);
  minimapa = crearMinimapa(p);
  ajustar();
  claveRanuras = '';
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  if (!partida || partida.terminada || partida.pausada) return;
  partida.pausada = true;
  jugando(false);
  const p = partida;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `Nivel ${p.nivel} · Quedan ${p.vivos} · Tus bajas: ${p.jugador.bajas}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Configuración', () => configuracion(volverAPausa, true), { icono: '⚙️' }),
      boton('Salir al menú', salir, { icono: '🚪' }),
    ),
  );
}

/** Salir a mitad de partida cuenta como eliminación en el puesto actual. */
function salir() {
  const p = partida;
  if (p && p.jugador.vivo && !finPendiente && !p.ganador) {
    anotarPartida(app.g, { puesto: p.vivos, bajas: p.jugador.bajas }, app.nombre(), 0);
    app.guardar();
  }
  menu();
}

function volverAPausa() {
  if (!partida) return menu();
  partida.pausada = false;
  pausar();
}

function continuar() {
  if (!partida) return;
  partida.pausada = false;
  mostrarPanel(null);
  jugando(true);
}

const tiempoTexto = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function pantallaFin(f: NonNullable<typeof finPendiente>) {
  const p = partida;
  if (p) p.pausada = true;
  jugando(false);
  const { r } = f;
  const titulo = r.victoria ? '🏆 ¡Último en pie!' : `Puesto #${r.puesto} de ${JUGADORES}`;
  const nivel = f.sube ? `¡Pasas al nivel ${f.nivel + 1}!` : `Queda entre los ${PUESTO_PARA_SUBIR} primeros para pasar del nivel ${f.nivel}.`;
  const puedeMirar = p && !r.victoria && !p.ganador && p.vivos > 1;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: titulo }),
      h('p', { class: 'texto-suave', text: `${r.bajas} bajas · ${r.dano} de daño · ${tiempoTexto(r.tiempo)} de partida` }),
      h('p', { class: 'texto-suave', text: f.record ? `${nivel} · Entra en tus récords.` : nivel }),
      boton(f.sube ? `Siguiente nivel (${f.nivel + 1})` : 'Reintentar', jugar, { variante: 'primario', icono: '↻' }),
      puedeMirar ? boton('Ver el resto de la partida', () => {
        if (!partida) return;
        partida.pausada = false;
        mirandoFin = true;
        mostrarPanel(null);
        jugando(true);
      }, { icono: '👁' }) : null,
      boton('Récords', records, { icono: '🏆' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  );
}

function pantallaGanador(g: Luchador) {
  if (partida) partida.pausada = true;
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: `🏆 Ganó ${g.nombre}` }),
      h('p', { class: 'texto-suave', text: `${g.bajas} bajas. ¡A por la revancha!` }),
      boton(finPendiente?.sube ? 'Siguiente nivel' : 'Jugar otra vez', jugar, { variante: 'primario', icono: '↻' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  );
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || (e.code === 'Escape' && tactil)) pausar();
});
document.addEventListener('visibilitychange', () => document.hidden && pausar());

/* ---------- Minimapa ---------- */

const ESCALA_MAPA = 2;
function crearMinimapa(p: Partida): HTMLCanvasElement {
  const R = p.isla.radio + 12;
  const tam = Math.round(R * 2 * ESCALA_MAPA);
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const g = c.getContext('2d')!;
  const px = (v: number) => (v + R) * ESCALA_MAPA;
  g.fillStyle = '#2a8fd6';
  g.fillRect(0, 0, tam, tam);
  g.fillStyle = '#e8d49a';
  g.beginPath();
  g.arc(px(0), px(0), (p.isla.radio + 9) * ESCALA_MAPA, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6fb64a';
  g.beginPath();
  g.arc(px(0), px(0), (p.isla.radio + 1) * ESCALA_MAPA, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2e7d32';
  for (const t of p.isla.arboles) g.fillRect(px(t.x) - 2, px(t.z) - 2, 4, 4);
  for (const b of p.isla.bloques) {
    if (b.tipo === 'techo') g.fillStyle = '#8d5a3b';
    else if (b.tipo === 'roca') g.fillStyle = '#8d9094';
    else if (b.tipo === 'caja' || b.tipo === 'torre') g.fillStyle = '#a0703a';
    else continue;
    g.fillRect(px(b.x - b.w / 2), px(b.z - b.d / 2), b.w * ESCALA_MAPA, b.d * ESCALA_MAPA);
  }
  g.font = 'bold 15px system-ui, sans-serif';
  g.textAlign = 'center';
  for (const l of p.isla.lugares) {
    g.fillStyle = '#000a';
    g.fillText(l.nombre, px(l.x) + 1, px(l.z) + 31);
    g.fillStyle = '#fff';
    g.fillText(l.nombre, px(l.x), px(l.z) + 30);
  }
  return c;
}

/** Minimapa centrado en el jugador (norte arriba), con la tormenta y el círculo siguiente. */
function dibujarMinimapa(p: Partida, centro: Luchador, x: number, y: number, tam: number) {
  if (!minimapa) return;
  const R = p.isla.radio + 12;
  const zoom = centro.estado === 'bus' || centro.estado === 'cayendo' ? 1 : 2.4;
  const ver = (R * 2) / zoom;
  const cx = centro.estado === 'bus' || centro.estado === 'cayendo' ? 0 : centro.cuerpo.x;
  const cz = centro.estado === 'bus' || centro.estado === 'cayendo' ? 0 : centro.cuerpo.z;
  const esc = tam / ver;
  const aPx = (wx: number, wz: number) => ({ x: x + tam / 2 + (wx - cx) * esc, y: y + tam / 2 + (wz - cz) * esc });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, tam, tam);
  ctx.clip();
  ctx.fillStyle = '#2a8fd6';
  ctx.fillRect(x, y, tam, tam);
  const o = aPx(-R, -R);
  ctx.drawImage(minimapa, o.x, o.y, R * 2 * esc, R * 2 * esc);
  // Tormenta: todo lo de fuera, en morado.
  const t = p.tormenta;
  const ca = aPx(t.actual.x, t.actual.z);
  ctx.fillStyle = 'rgba(120, 50, 230, 0.4)';
  ctx.beginPath();
  ctx.rect(x, y, tam, tam);
  ctx.arc(ca.x, ca.y, Math.max(0, t.actual.r * esc), 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#d6b3ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ca.x, ca.y, Math.max(0, t.actual.r * esc), 0, Math.PI * 2);
  ctx.stroke();
  if (t.siguiente.r < t.actual.r - 0.5) {
    const cs = aPx(t.siguiente.x, t.siguiente.z);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cs.x, cs.y, Math.max(0, t.siguiente.r * esc), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Ruta del autobús.
  if (p.bus.t < p.bus.duracion) {
    const a = aPx(p.bus.x0, p.bus.z0);
    const b = aPx(p.bus.x1, p.bus.z1);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Enemigos que acaban de disparar cerca.
  for (const l of p.luchadores) {
    if (!l.vivo || l === centro || l.disparo > 1.5 || l.estado !== 'suelo') continue;
    if (Math.hypot(l.cuerpo.x - centro.cuerpo.x, l.cuerpo.z - centro.cuerpo.z) > 45) continue;
    const q = aPx(l.cuerpo.x, l.cuerpo.z);
    ctx.fillStyle = '#ff4a4a';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tú: flecha hacia donde miras.
  const yo = centro.estado === 'bus' ? p.posicionBus() : centro.cuerpo;
  const q = aPx(yo.x, yo.z);
  ctx.translate(q.x, q.y);
  ctx.rotate(-centro.yaw);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#fff8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, tam, tam);
}

/* ---------- HUD ---------- */

const sombra = (texto: string, x: number, y: number, color = '#fff') => {
  ctx.fillStyle = '#000a';
  ctx.fillText(texto, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y);
};

function barra(x: number, y: number, w: number, hh: number, valor: number, color: string, texto: string) {
  ctx.fillStyle = '#0009';
  ctx.fillRect(x, y, w, hh);
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * Math.min(1, valor / 100)), hh - 4);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  sombra(texto, x + 6, y + hh / 2);
}

function dibujarHud(p: Partida, dt: number) {
  ctx.clearRect(0, 0, ancho, alto);
  const j = p.jugador;
  const cx = ancho / 2;
  const cy = alto / 2;
  marcaAcierto = Math.max(0, marcaAcierto - dt);
  marcaDano = Math.max(0, marcaDano - dt);
  ctx.textBaseline = 'middle';
  const centro = j.vivo ? j : p.observado ?? j;

  // Viñeta: rojo al recibir daño, morado dentro de la tormenta.
  const enTormenta = centro.vivo && centro.estado === 'suelo' && fuera(p.tormenta, centro.cuerpo.x, centro.cuerpo.z);
  if (marcaDano > 0 || enTormenta) {
    const g = ctx.createRadialGradient(cx, cy, Math.min(ancho, alto) * 0.3, cx, cy, Math.max(ancho, alto) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, enTormenta ? 'rgba(130,50,230,0.55)' : `rgba(200,0,0,${marcaDano * 0.6})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }

  const d = p.datosArma(j);
  const enSuelo = j.vivo && j.estado === 'suelo';
  if (enSuelo && p.zoom && d && d.zoom > 2) {
    // Mira telescópica.
    const r = Math.min(ancho, alto) * 0.45;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, ancho, alto);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
  } else if (enSuelo) {
    const hueco = 5 + p.retroceso * 300 + (j.moviendose ? 7 : 0) + (d && !p.zoom ? d.precision * 120 : 0);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * hueco, cy + dy * hueco);
      ctx.lineTo(cx + dx * (hueco + 7), cy + dy * (hueco + 7));
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }
  if (marcaAcierto > 0) {
    ctx.strokeStyle = marcaCabeza ? '#ffd23f' : marcaEscudo ? '#4fc3f7' : '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.moveTo(cx + dx * 6, cy + dy * 6);
      ctx.lineTo(cx + dx * 13, cy + dy * 13);
    }
    ctx.stroke();
  }
  // De dónde viene el daño: un arco rojo alrededor de la mira.
  if (marcaDano > 0 && j.vivo) {
    const a = -anguloDano - Math.PI / 2;
    ctx.strokeStyle = `rgba(255,60,60,${marcaDano})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, a - 0.35, a + 0.35);
    ctx.stroke();
  }

  if (render) {
    // Números de daño.
    ctx.textAlign = 'center';
    for (const n of p.numeros) {
      const pt = render.proyectar(n.x, n.y + (0.9 - n.t) * 0.8, n.z, ancho, alto);
      if (!pt.visible) continue;
      ctx.font = `bold ${n.cabeza ? 22 : 18}px system-ui, sans-serif`;
      sombra(String(n.valor), pt.x, pt.y, n.cabeza ? '#ffd23f' : n.escudo ? '#4fc3f7' : '#fff');
    }
    // Nombres del botín cercano.
    if (app.g.config.marcadoresBotin && centro.estado === 'suelo') {
      ctx.font = 'bold 12px system-ui, sans-serif';
      for (const o of p.objetos) {
        const dd = Math.hypot(o.x - centro.cuerpo.x, o.z - centro.cuerpo.z);
        if (dd > 7) continue;
        const pt = render.proyectar(o.x, o.y + 0.75, o.z, ancho, alto);
        if (pt.visible) sombra(p.textoObjeto(o.objeto), pt.x, pt.y, o.objeto.tipo === 'arma' ? RAREZAS[o.objeto.rareza].color : '#eee');
      }
    }
  }

  const arriba = tactil ? 12 : 12;
  // Minimapa y contadores (arriba a la derecha, debajo de la pausa).
  const tam = Math.min(150, Math.round(Math.min(ancho, alto) * 0.3));
  const mx = ancho - tam - 12;
  const my = arriba + 52;
  dibujarMinimapa(p, centro, mx, my, tam);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'right';
  sombra(`👤 ${p.vivos}   ☠ ${j.bajas}`, ancho - 66, arriba + 22);
  const t = p.tormenta;
  ctx.font = '13px system-ui, sans-serif';
  const textoTormenta = t.fase >= FASES.length ? '🌀 Tormenta final' : t.cerrando ? `🌀 Se cierra · ${tiempoTexto(t.tiempo)}` : p.bus.t < p.bus.duracion * 0.5 ? '🌀 Pronto' : `🌀 Fase ${t.fase + 1} · cierra en ${tiempoTexto(t.tiempo)}`;
  if (tactil) sombra(textoTormenta, mx - 8, my + 12, t.cerrando ? '#d6b3ff' : '#fff');
  else sombra(textoTormenta, ancho - 12, my + tam + 16, t.cerrando ? '#d6b3ff' : '#fff');

  // Brújula.
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  const rumbos: Array<[string, number]> = [['N', 0], ['NE', -Math.PI / 4], ['E', -Math.PI / 2], ['SE', (-3 * Math.PI) / 4], ['S', Math.PI], ['SO', (3 * Math.PI) / 4], ['O', Math.PI / 2], ['NO', Math.PI / 4]];
  const anchoBrujula = Math.min(320, ancho * 0.4);
  for (const [nombre, a] of rumbos) {
    const dif = Math.atan2(Math.sin(a - centro.yaw), Math.cos(a - centro.yaw));
    if (Math.abs(dif) > 1.2) continue;
    sombra(nombre, cx - (dif / 1.2) * (anchoBrujula / 2), arriba + 14, nombre.length === 1 ? '#ffd23f' : '#ddd');
  }

  // Registro de bajas (arriba a la izquierda).
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  p.registro.forEach((r, i) => sombra(r.texto, 14, arriba + 22 + i * 20, r.propio ? '#ffd23f' : '#fff'));

  // Vida, escudo y munición (sobre las ranuras).
  if (j.vivo) {
    // En táctil, a la izquierda (los botones de acción ocupan la derecha).
    const bw = tactil ? Math.min(200, ancho * 0.28) : Math.min(230, ancho * 0.36);
    const bx = tactil ? 14 : cx - bw / 2;
    const by = alto - (tactil ? 104 : 102);
    barra(bx, by, bw, 16, j.escudo, '#3ca0ff', `🛡 ${Math.ceil(j.escudo)}`);
    barra(bx, by + 19, bw, 18, j.vida, j.vida > 30 ? '#5ad13c' : '#ff5a5a', `✚ ${Math.ceil(j.vida)}`);
    const r = p.arma(j);
    if (r?.tipo === 'arma') {
      const s = stats(r.arma, r.rareza);
      ctx.textAlign = 'left';
      ctx.font = 'bold 18px system-ui, sans-serif';
      sombra(j.recargando > 0 ? 'Recargando…' : `${r.cargador} | ${j.inv.municion[s.municion]}`, bx + bw + 12, by + 18, r.cargador === 0 ? '#ff5a5a' : '#fff');
      ctx.font = '11px system-ui, sans-serif';
      sombra(MUNICIONES[s.municion].nombre, bx + bw + 12, by + 36, '#ccc');
    }
  }

  // Mensajes del centro.
  ctx.textAlign = 'center';
  const tecla = (pc: string, tc: string) => (tactil ? tc : pc);
  if (j.vivo && j.curando > 0) {
    const r = j.inv.ranuras[j.curaRanura];
    if (r?.tipo === 'cura') {
      const total = CURAS[r.cura].tiempo;
      ctx.fillStyle = '#0009';
      ctx.fillRect(cx - 80, cy + 50, 160, 10);
      ctx.fillStyle = '#5ad13c';
      ctx.fillRect(cx - 78, cy + 52, 156 * (1 - j.curando / total), 6);
      ctx.font = 'bold 14px system-ui, sans-serif';
      sombra(`${CURAS[r.cura].icono} ${CURAS[r.cura].nombre}…`, cx, cy + 40);
    }
  }
  if (j.vivo && j.estado === 'bus') {
    ctx.font = 'bold 22px system-ui, sans-serif';
    sombra(p.bus.t > 1 ? `${tecla('Espacio', '⤒')}: saltar del autobús` : 'El autobús despega…', cx, alto * 0.28);
    ctx.font = '14px system-ui, sans-serif';
    sombra('Mira el mapa y elige dónde aterrizar', cx, alto * 0.28 + 28);
  } else if (j.vivo && j.estado === 'cayendo') {
    ctx.font = 'bold 18px system-ui, sans-serif';
    sombra(`Altura ${Math.round(j.cuerpo.y)} m · ${tecla('Espacio', '⤒')}: abrir el planeador`, cx, alto * 0.28);
  } else if (j.vivo && j.estado === 'suelo') {
    const i = p.interactuable(j);
    if (i) {
      const r = i.objeto?.objeto;
      ctx.font = 'bold 16px system-ui, sans-serif';
      const lleno = r && r.tipo !== 'municion' && !j.inv.ranuras.includes(null) && j.inv.seleccion === -1 && !(r.tipo === 'cura' && j.inv.ranuras.some((x) => x?.tipo === 'cura' && x.cura === r.cura));
      const texto = i.cofre ? 'Abrir cofre' : r ? (lleno ? 'Inventario lleno: elige la ranura que quieres cambiar' : `Recoger ${p.textoObjeto(r)}`) : '';
      sombra(`${tecla('[E]', '✋')} ${texto}`, cx, cy + 90, r?.tipo === 'arma' ? RAREZAS[r.rareza].color : '#ffd23f');
    }
  }
  if (!j.vivo && p.observado) {
    const o = p.observado;
    ctx.font = 'bold 18px system-ui, sans-serif';
    sombra(`👁 ${o.nombre} · ${o.bajas} bajas`, cx, alto - (tactil ? 150 : 74));
    ctx.font = '13px system-ui, sans-serif';
    sombra(`${tactil ? '◀ ▶' : 'clic o ← →'} para cambiar · pausa para salir`, cx, alto - (tactil ? 128 : 52));
  } else if (!j.vivo) {
    ctx.font = 'bold 24px system-ui, sans-serif';
    sombra(`Eliminado · puesto #${j.puesto}`, cx, cy - 60, '#ff9a9a');
  }
  if (p.ganador?.esJugador) {
    ctx.font = 'bold 34px system-ui, sans-serif';
    sombra('🏆 ¡Último en pie!', cx, cy - 80, '#ffd23f');
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/* ---------- Bucle ---------- */

let fps = 60;
let ultimo = performance.now();
iniciarBucle(
  (dt) => rend.medir('logica', () => {
    entrada.actualizar();
    if (!partida || partida.pausada) {
      giroX = giroY = 0;
      return;
    }
    const c = controlesVacios();
    c.x = entrada.x;
    c.z = entrada.y;
    c.giroX = giroX;
    c.giroY = giroY;
    giroX = giroY = 0;
    c.disparar = raton || fuegoTactil > 0 || entrada.activo('disparar');
    c.saltar = entrada.activo('saltar');
    c.recargar = entrada.pulsado('recargar');
    c.recoger = entrada.pulsado('recoger');
    c.curar = entrada.pulsado('curar');
    c.zoom = zoomPendiente || entrada.pulsado('mira');
    c.ranura = ranuraPendiente;
    c.asistido = tactil && app.g.config.apuntadoAsistido;
    c.autoDisparo = tactil && app.g.config.disparoAutomatico;
    c.observar = observarPendiente;
    observarPendiente = 0;
    zoomPendiente = false;
    ranuraPendiente = null;
    if (!c.disparar) partida.soltarGatillo();
    partida.actualizar(dt, c);
    actualizarBotonMira(partida.zoom);
    actualizarEspectador(!!partida.observado);
    if (finPendiente && !mirandoFin) {
      finPendiente.t -= dt;
      if (finPendiente.t <= 0) {
        mirandoFin = true;
        pantallaFin(finPendiente);
      }
    }
  }),
  () => {
    const ahora = performance.now();
    if (!rend.debeDibujar(ahora, !partida || partida.pausada)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (partida && render) {
      render.sombras(tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => render!.dibujar(partida!, app.g.look, !app.g.config.animacionesReducidas, app.g.config.camara === 'cerca'));
      dibujarHud(partida, dt);
      actualizarRanuras(partida.jugador);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(render?.renderer ?? null);
  },
);

if (import.meta.env.DEV && location.search.includes('demo')) void jugar();
else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

// Con el menú ya visible, se descarga el motor 3D en segundo plano para que «Jugar» sea instantáneo.
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));
