import * as THREE from 'three';
import { app } from '../app';
import { createAvatar, LOOK_OPTIONS, randomLook, type Look } from '../game/characters';
import { boton, h, mostrarPanel } from './dom';

type ClaveOpcion = 'gender' | 'body' | 'height' | 'eyes' | 'facialHair' | 'hair' | 'bottom' | 'hat' | 'accessory';
type ClaveColor = 'skin' | 'hairColor' | 'shirt' | 'bottomColor' | 'hatColor';

// Mismas secciones que la personalización del Arcade (testjuegoia/src/game/customize.ts).
const SECCIONES: ({ tipo: 'opcion'; clave: ClaveOpcion; titulo: string } | { tipo: 'color'; clave: ClaveColor; titulo: string })[] = [
  { tipo: 'opcion', clave: 'gender', titulo: 'Género' },
  { tipo: 'opcion', clave: 'body', titulo: 'Tipo de cuerpo' },
  { tipo: 'opcion', clave: 'height', titulo: 'Altura' },
  { tipo: 'color', clave: 'skin', titulo: 'Tono de piel' },
  { tipo: 'opcion', clave: 'eyes', titulo: 'Ojos' },
  { tipo: 'opcion', clave: 'hair', titulo: 'Peinado' },
  { tipo: 'color', clave: 'hairColor', titulo: 'Color de pelo y barba' },
  { tipo: 'opcion', clave: 'facialHair', titulo: 'Vello facial' },
  { tipo: 'color', clave: 'shirt', titulo: 'Camiseta' },
  { tipo: 'opcion', clave: 'bottom', titulo: 'Parte de abajo' },
  { tipo: 'color', clave: 'bottomColor', titulo: 'Color de abajo' },
  { tipo: 'opcion', clave: 'hat', titulo: 'Gorro' },
  { tipo: 'color', clave: 'hatColor', titulo: 'Color del gorro' },
  { tipo: 'opcion', clave: 'accessory', titulo: 'Accesorio' },
];

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Vista previa 3D que gira, en su propio renderer pequeño. */
function crearVista(contenedor: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(200, 240);
  contenedor.append(renderer.domElement);
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xffffff, 0x445577, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.8);
  sol.position.set(2, 4, 3);
  escena.add(sol);
  const piso = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshLambertMaterial({ color: 0x324477 }));
  piso.rotation.x = -Math.PI / 2;
  escena.add(piso);
  const camara = new THREE.PerspectiveCamera(32, 200 / 240, 0.1, 20);
  camara.position.set(0, 1.3, 4.2);
  camara.lookAt(0, 0.85, 0);
  let avatar: THREE.Group | null = null;
  let angulo = 0.5;
  let arrastrando = false;
  let ultimoX = 0;
  const lienzo = renderer.domElement;
  lienzo.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    ultimoX = e.clientX;
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    angulo += (e.clientX - ultimoX) * 0.02;
    ultimoX = e.clientX;
  });
  lienzo.addEventListener('pointerup', () => (arrastrando = false));
  renderer.setAnimationLoop(() => {
    if (!arrastrando) angulo += 0.012;
    if (avatar) avatar.rotation.y = angulo;
    renderer.render(escena, camara);
  });
  return {
    mostrar(look: Look) {
      if (avatar) escena.remove(avatar);
      avatar = createAvatar(look).group;
      escena.add(avatar);
    },
    cerrar() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      lienzo.remove();
    },
  };
}

/** Pantalla para personalizar al arquero. */
export function pantallaPersonaje(alVolver: () => void) {
  const look: Look = { ...app.g.look };
  const opciones = h('div', { class: 'cz-opciones' });
  const lienzo = h('div', { class: 'cz-lienzo' });
  const vista = crearVista(lienzo);

  const pintar = () => {
    opciones.replaceChildren(
      ...SECCIONES.filter((s) => s.clave !== 'hatColor' || (look.hat !== 'none' && look.hat !== 'chef' && look.hat !== 'crown')).map((s) => {
        if (s.tipo === 'opcion') {
          const lista = LOOK_OPTIONS[s.clave] as readonly { id: string; label: string }[];
          return h('div', { class: 'cz-seccion' }, h('b', { text: s.titulo }),
            h('div', { class: 'segmentado' }, ...lista.map((o) => {
              const b = boton(o.label, () => {
                (look as unknown as Record<string, string>)[s.clave] = o.id;
                pintar();
              });
              b.setAttribute('aria-pressed', String(look[s.clave] === o.id));
              return b;
            })));
        }
        const colores = LOOK_OPTIONS[s.clave] as readonly number[];
        return h('div', { class: 'cz-seccion' }, h('b', { text: s.titulo }),
          h('div', { class: 'cz-colores' }, ...colores.map((c) =>
            h('button', {
              type: 'button', class: look[s.clave] === c ? 'on' : '', style: `background:${hex(c)}`, 'aria-label': `Color ${hex(c)}`,
              onclick: () => {
                (look as unknown as Record<string, number>)[s.clave] = c;
                pintar();
              },
            }))));
      }),
    );
    vista.mostrar(look);
    app.g.look = { ...look };
    app.guardar();
  };

  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Listo', () => {
        vista.cerrar();
        alVolver();
      }, { icono: '←' }), h('h2', { text: '👕 Tu personaje' })),
      h('div', { class: 'cz-vista' }, lienzo, boton('Aleatorio', () => {
        Object.assign(look, randomLook());
        pintar();
      }, { icono: '🎲', variante: 'suave' }), h('small', { class: 'texto-suave', text: 'Arrastra para girar' })),
      opciones,
    ),
  );
  pintar();
}
