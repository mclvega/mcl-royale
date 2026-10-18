import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAREZAS, type Arma } from '../core/armas';
import type { Bloque } from '../core/fisica';
import type { Objeto } from '../core/inventario';
import type { Isla } from '../core/isla';
import { liberar } from '../rendimiento';
import { animateWalk, createAvatar, randomLook, type Look } from './characters';
import { Partida, type Cofre, type Luchador, type ObjetoMundo } from './logica';

const cacheMat = new Map<string, THREE.Material>();
function mat(color: number, basico = false, opacidad = 1): THREE.Material {
  const clave = `${color}|${basico}|${opacidad}`;
  let m = cacheMat.get(clave);
  if (!m) {
    const o = { color, transparent: opacidad < 1, opacity: opacidad, depthWrite: opacidad >= 1 };
    m = basico ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o);
    cacheMat.set(clave, m);
  }
  return m;
}

function malla(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sombra = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = sombra;
  m.receiveShadow = true;
  return m;
}

/** Textura generada en un lienzo (sin archivos de imagen). */
function textura(ancho: number, alto: number, pintar: (c: CanvasRenderingContext2D) => void, repetir = 1): THREE.CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  pintar(lienzo.getContext('2d')!);
  const t = new THREE.CanvasTexture(lienzo);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetir, repetir);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

const moteado = (base: string, motas: string[], repetir: number, n = 600) =>
  textura(128, 128, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < n; i++) {
      c.fillStyle = motas[i % motas.length];
      c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  }, repetir);

const texCaja = () =>
  textura(64, 64, (c) => {
    c.fillStyle = '#a0703a';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#8a5e2e';
    for (let y = 0; y < 64; y += 16) c.fillRect(0, y, 64, 2);
    c.strokeStyle = '#5a3a1a';
    c.lineWidth = 6;
    c.strokeRect(3, 3, 58, 58);
  });

const texTablas = (base: string, linea: string) =>
  textura(64, 64, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = linea;
    for (let y = 0; y < 64; y += 8) c.fillRect(0, y, 64, 1);
  });

/** Colores de las paredes y los tejados según el estilo de la casa. */
const PAREDES = ['#efe2c4', '#bcd7e8', '#f2c4c4', '#c9a27a', '#b23a2e', '#9aa3ab'];
const TEJADOS = [0x9c4a2f, 0x37586e, 0x7b3f61, 0x5d4632, 0x6b2a20, 0x5c636c];
const ROCAS = [0x8d9094, 0x9a8f84, 0x7d858f];
const CAJAS = [0, 0xe2c25a, 0x2e7d9a];

/** Arma en la mano o tirada en el suelo. */
function modeloArma(arma: Arma | 'pico', rareza = 0): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x2b2b2b);
  const color = mat(RAREZAS[rareza].hex);
  const madera = mat(0x7a4a24);
  const caja = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => g.add(malla(new THREE.BoxGeometry(w, h, d), m, x, y, z));
  switch (arma) {
    case 'pico':
      caja(0.04, 0.04, 0.7, madera, 0, 0, -0.1);
      caja(0.05, 0.42, 0.05, mat(0x9fa8b0), 0, 0, -0.45);
      break;
    case 'pistola':
      caja(0.05, 0.07, 0.22, metal, 0, 0, -0.06);
      caja(0.045, 0.12, 0.05, color, 0, -0.08, 0.02);
      break;
    case 'subfusil':
      caja(0.06, 0.09, 0.42, metal, 0, 0, -0.08);
      caja(0.035, 0.16, 0.05, color, 0, -0.1, -0.12);
      caja(0.04, 0.11, 0.06, metal, 0, -0.08, 0.06);
      break;
    case 'fusil':
      caja(0.06, 0.09, 0.62, metal, 0, 0, -0.12);
      caja(0.055, 0.11, 0.2, color, 0, -0.01, 0.26);
      caja(0.04, 0.15, 0.06, color, 0, -0.1, -0.08);
      caja(0.03, 0.05, 0.14, metal, 0, 0.07, -0.08);
      break;
    case 'escopeta':
      caja(0.06, 0.07, 0.7, metal, 0, 0.02, -0.18);
      caja(0.065, 0.06, 0.26, color, 0, -0.04, -0.22);
      caja(0.06, 0.12, 0.24, madera, 0, -0.03, 0.24);
      break;
    case 'francotirador':
      caja(0.06, 0.08, 0.85, metal, 0, 0, -0.15);
      caja(0.055, 0.12, 0.26, color, 0, -0.02, 0.28);
      g.add(malla(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8).rotateX(Math.PI / 2), color, 0, 0.08, -0.06));
      break;
  }
  return g;
}

/** Objeto del suelo: armas, curas y munición. */
function modeloObjeto(o: Objeto): THREE.Group {
  const g = new THREE.Group();
  if (o.tipo === 'arma') {
    const a = modeloArma(o.arma, o.rareza);
    a.scale.setScalar(1.4);
    a.rotation.z = Math.PI / 2;
    a.position.y = 0.35;
    g.add(a);
    // Haz de luz del color de la rareza.
    const haz = malla(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6, 1, true), mat(RAREZAS[o.rareza].hex, true, 0.35), 0, 1.1, 0, false);
    haz.receiveShadow = false;
    g.add(haz);
  } else if (o.tipo === 'cura') {
    const c = o.cura;
    if (c === 'vendas') g.add(malla(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), mat(0xf5f5f5), 0, 0.25, 0));
    else if (c === 'botiquin') {
      g.add(malla(new THREE.BoxGeometry(0.4, 0.28, 0.2), mat(0xe53935), 0, 0.3, 0));
      g.add(malla(new THREE.BoxGeometry(0.22, 0.06, 0.21), mat(0xffffff), 0, 0.3, 0), malla(new THREE.BoxGeometry(0.06, 0.2, 0.21), mat(0xffffff), 0, 0.3, 0));
    } else {
      const r = c === 'escudoP' ? 0.11 : 0.17;
      g.add(malla(new THREE.SphereGeometry(r, 10, 8), mat(0x3ca0ff), 0, 0.25 + r, 0), malla(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), mat(0xdddddd), 0, 0.3 + r * 2, 0));
    }
  } else {
    const color = { ligera: 0x9e9e9e, media: 0x43a047, pesada: 0x5d4037, cartuchos: 0xe53935 }[o.municion];
    g.add(malla(new THREE.BoxGeometry(0.3, 0.18, 0.2), mat(color), 0, 0.2, 0));
  }
  return g;
}

function modeloCofre(): THREE.Group {
  const g = new THREE.Group();
  g.add(malla(new THREE.BoxGeometry(0.9, 0.5, 0.55), mat(0xb8862b), 0, 0.25, 0));
  const tapa = new THREE.Group();
  tapa.position.set(0, 0.5, -0.275);
  tapa.add(malla(new THREE.BoxGeometry(0.92, 0.18, 0.57), mat(0xe0b040), 0, 0.09, 0.285));
  tapa.add(malla(new THREE.BoxGeometry(0.12, 0.14, 0.04), mat(0x444444), 0, 0, 0.58));
  g.add(tapa);
  const brillo = malla(new THREE.SphereGeometry(0.75, 10, 8), mat(0xffe27a, true, 0.18), 0, 0.4, 0, false);
  g.add(brillo);
  g.userData = { tapa, brillo };
  return g;
}

/** Autobús volador con globo (al estilo de los battle royale). */
function modeloBus(): THREE.Group {
  const g = new THREE.Group();
  g.add(malla(new THREE.BoxGeometry(2.6, 2.2, 7), mat(0x1e88e5), 0, 0, 0));
  g.add(malla(new THREE.BoxGeometry(2.65, 0.7, 5.6), mat(0xbfe6ff), 0, 0.45, -0.4));
  g.add(malla(new THREE.BoxGeometry(2.7, 0.3, 7.05), mat(0xffffff), 0, -0.6, 0));
  for (const [x, z] of [[-1.3, 2.4], [1.3, 2.4], [-1.3, -2.4], [1.3, -2.4]]) g.add(malla(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10).rotateZ(Math.PI / 2), mat(0x222222), x, -1.1, z));
  g.add(malla(new THREE.SphereGeometry(3.4, 14, 10), mat(0xe53935), 0, 6.2, 0));
  g.add(malla(new THREE.SphereGeometry(3.45, 14, 10, 0, Math.PI * 2, 1.2, 0.5), mat(0xffffff), 0, 6.2, 0));
  for (const [x, z] of [[-1.1, 2.8], [1.1, 2.8], [-1.1, -2.8], [1.1, -2.8]]) g.add(malla(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 4), mat(0x444444), x, 2.9, z * 0.7));
  return g;
}

/** Planeador: un ala delta de colores sobre la cabeza. */
function modeloPlaneador(color: number): THREE.Group {
  const g = new THREE.Group();
  const forma = new THREE.Shape();
  forma.moveTo(0, -1.1);
  forma.lineTo(1.6, 0.7);
  forma.lineTo(-1.6, 0.7);
  forma.closePath();
  const ala = malla(new THREE.ShapeGeometry(forma), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }), 0, 2.6, 0);
  ala.rotation.x = -Math.PI / 2;
  g.add(ala);
  for (const x of [-0.5, 0.5]) g.add(malla(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), mat(0x333333), x * 0.5, 2.05, 0));
  return g;
}

interface ModeloLuchador {
  grupo: THREE.Group;
  cuerpo: THREE.Group;
  arma: string;
  mano: THREE.Object3D;
  armaMalla: THREE.Group | null;
  fogonazo: THREE.Mesh;
  planeador: THREE.Group;
}

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  private escena = new THREE.Scene();
  private modelos = new Map<Luchador, ModeloLuchador>();
  private looks = new Map<number, Look>();
  private lookActual = '';
  private objetos = new Map<ObjetoMundo, THREE.Group>();
  private cofres = new Map<Cofre, THREE.Group>();
  private trazos: THREE.Mesh[] = [];
  private impactos: THREE.Mesh[] = [];
  private sol: THREE.DirectionalLight;
  private tamSombras = -1;
  private tormenta: THREE.Mesh;
  private tormentaSiguiente: THREE.Mesh;
  private bus = modeloBus();
  private agua: THREE.Mesh;
  private texAgua: THREE.CanvasTexture;
  private va = new THREE.Vector3();
  private vb = new THREE.Vector3();
  private vp = new THREE.Vector3();
  private static ARRIBA = new THREE.Vector3(0, 1, 0);

  /** Se reutiliza el renderer entre partidas: cada partida tiene una isla nueva. */
  constructor(lienzo: HTMLCanvasElement, isla: Isla, renderer?: THREE.WebGLRenderer) {
    this.renderer = renderer ?? new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const cielo = 0x9fd6ff;
    this.escena.background = new THREE.Color(cielo);
    this.escena.fog = new THREE.Fog(cielo, 70, 230);

    this.escena.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a8a4a, 1.5));
    const sol = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sol = sol;
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    Object.assign(sol.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
    this.escena.add(sol, sol.target);

    // Mar y playa.
    this.texAgua = textura(64, 64, (c) => {
      c.fillStyle = '#2a8fd6';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#4fb0ee';
      for (let i = 0; i < 40; i++) c.fillRect(Math.random() * 64, Math.random() * 64, 6, 1);
    }, 60);
    this.agua = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: this.texAgua }));
    this.agua.rotation.x = -Math.PI / 2;
    this.agua.position.y = -0.6;
    this.escena.add(this.agua);
    const playa = new THREE.Mesh(new THREE.CircleGeometry(isla.radio + 9, 72), new THREE.MeshLambertMaterial({ map: moteado('#e8d49a', ['#d8c486', '#f2e2b0'], 30) }));
    playa.rotation.x = -Math.PI / 2;
    playa.position.y = -0.08;
    playa.receiveShadow = true;
    this.escena.add(playa);
    const hierba = new THREE.Mesh(new THREE.CircleGeometry(isla.radio + 1, 72), new THREE.MeshLambertMaterial({ map: moteado('#6fb64a', ['#5fa23e', '#7cc456', '#66ad44'], 40, 900) }));
    hierba.rotation.x = -Math.PI / 2;
    hierba.receiveShadow = true;
    this.escena.add(hierba);

    this.construirIsla(isla);

    // Tormenta: pared morada que se cierra y la línea del círculo siguiente.
    this.tormenta = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 160, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
    this.tormenta.position.y = 70;
    this.tormentaSiguiente = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.tormentaSiguiente.position.y = 0.2;
    this.escena.add(this.tormenta, this.tormentaSiguiente, this.bus);
    this.escena.add(this.camara);
  }

  /** Tamaño del mapa de sombras según la calidad (0 = sin sombras). */
  sombras(tam: number) {
    if (tam === this.tamSombras) return;
    this.tamSombras = tam;
    this.renderer.shadowMap.enabled = tam > 0;
    if (tam > 0) {
      this.sol.shadow.mapSize.set(tam, tam);
      this.sol.shadow.map?.dispose();
      this.sol.shadow.map = null;
    }
    this.escena.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  private construirIsla(isla: Isla) {
    const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const estatico = (...ms: THREE.Mesh[]) => {
      for (const m of ms) {
        m.updateMatrix();
        const g = m.geometry;
        g.applyMatrix4(m.matrix);
        const material = m.material as THREE.Material;
        if (!porMaterial.has(material)) porMaterial.set(material, []);
        porMaterial.get(material)!.push(g);
      }
    };
    const paredes = PAREDES.map((c) => new THREE.MeshLambertMaterial({ map: texTablas(c, '#00000022') }));
    const caja = new THREE.MeshLambertMaterial({ map: texCaja() });
    const suelo = new THREE.MeshLambertMaterial({ map: texTablas('#a77b4f', '#7a5634') });
    const hormigon = mat(0xa7adb3);

    const cajaUv = (bl: Bloque, geo: THREE.BoxGeometry) => {
      const alto = bl.y1 - bl.y0;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        const cara = Math.floor(i / 4);
        const u = cara < 2 ? bl.d : bl.w;
        const v = cara === 2 || cara === 3 ? bl.d : alto;
        uv.setXY(i, uv.getX(i) * u * 0.5, uv.getY(i) * v * 0.5);
      }
    };

    for (const bl of isla.bloques) {
      const alto = bl.y1 - bl.y0;
      const cy = bl.y0 + alto / 2;
      switch (bl.tipo) {
        case 'pared': {
          const geo = new THREE.BoxGeometry(bl.w, alto, bl.d);
          cajaUv(bl, geo);
          estatico(malla(geo, paredes[bl.estilo % paredes.length], bl.x, cy, bl.z));
          break;
        }
        case 'techo': {
          estatico(malla(new THREE.BoxGeometry(bl.w, alto, bl.d), mat(TEJADOS[bl.estilo % TEJADOS.length]), bl.x, cy, bl.z));
          // Tejado a dos aguas (solo visual) y suelo de madera.
          const tejado = malla(new THREE.CylinderGeometry(0.01, Math.min(bl.w, bl.d) * 0.62, 1.4, 4, 1), mat(TEJADOS[bl.estilo % TEJADOS.length]), bl.x, bl.y1 + 0.7, bl.z);
          tejado.rotation.y = Math.PI / 4;
          tejado.scale.set(bl.w / Math.min(bl.w, bl.d), 1, bl.d / Math.min(bl.w, bl.d));
          estatico(tejado, malla(new THREE.PlaneGeometry(bl.w - 0.9, bl.d - 0.9).rotateX(-Math.PI / 2), suelo, bl.x, 0.02, bl.z));
          break;
        }
        case 'caja':
          if (bl.estilo === 0) estatico(malla(new THREE.BoxGeometry(bl.w, alto, bl.d), caja, bl.x, cy, bl.z));
          else estatico(malla(new THREE.BoxGeometry(bl.w, alto, bl.d), mat(CAJAS[bl.estilo]), bl.x, cy, bl.z));
          break;
        case 'roca': {
          const r = malla(new THREE.DodecahedronGeometry(0.5, 0), mat(ROCAS[bl.estilo % ROCAS.length]), bl.x, bl.y0 + alto * 0.45, bl.z);
          r.scale.set(bl.w * 1.1, alto * 1.1, bl.d * 1.1);
          r.rotation.y = bl.x * 3.1;
          estatico(r);
          break;
        }
        case 'valla':
          estatico(malla(new THREE.BoxGeometry(bl.w, 0.12, bl.d), mat(0x8d6e4a), bl.x, bl.y1 - 0.2, bl.z), malla(new THREE.BoxGeometry(bl.w, 0.12, bl.d), mat(0x8d6e4a), bl.x, bl.y1 - 0.65, bl.z));
          for (let t = -0.5; t <= 0.5; t += 0.125) {
            const largo = Math.max(bl.w, bl.d);
            const x = bl.w > bl.d ? bl.x + t * largo : bl.x;
            const z = bl.w > bl.d ? bl.z : bl.z + t * largo;
            estatico(malla(new THREE.BoxGeometry(0.12, alto, 0.12), mat(0x6d4c41), x, cy, z));
          }
          break;
        case 'torre':
          estatico(malla(new THREE.BoxGeometry(bl.w, alto, bl.d), hormigon, bl.x, cy, bl.z), malla(new THREE.BoxGeometry(bl.w + 1.4, 0.3, bl.d + 1.4), mat(0x5c636c), bl.x, bl.y1, bl.z));
          break;
        case 'tronco':
          break;
      }
    }

    // Árboles: tronco y copa (pino, redondo o alto).
    for (const t of isla.arboles) {
      const e = t.escala;
      estatico(malla(new THREE.CylinderGeometry(0.18 * e, 0.26 * e, 2.4 * e, 6), mat(0x6d4c41), t.x, 1.2 * e, t.z));
      if (t.tipo === 0) {
        for (let k = 0; k < 3; k++) estatico(malla(new THREE.ConeGeometry((1.8 - k * 0.45) * e, 1.8 * e, 7), mat(0x2e7d32), t.x, (2.2 + k * 1.0) * e, t.z));
      } else if (t.tipo === 1) {
        estatico(malla(new THREE.IcosahedronGeometry(1.7 * e, 0), mat(0x43a047), t.x, 3.3 * e, t.z), malla(new THREE.IcosahedronGeometry(1.1 * e, 0), mat(0x5cb85c), t.x + 0.6 * e, 4.1 * e, t.z));
      } else {
        estatico(malla(new THREE.ConeGeometry(1.2 * e, 5 * e, 7), mat(0x1b5e20), t.x, 4.2 * e, t.z));
      }
    }

    for (const [material, geos] of porMaterial) {
      // Las geometrías con índice y sin él no se pueden unir juntas: se separan.
      const grupos = [geos.filter((g) => g.index), geos.filter((g) => !g.index)];
      for (const lista of grupos) {
        if (!lista.length) continue;
        const unida = malla(mergeGeometries(lista), material);
        this.escena.add(unida);
      }
      for (const g of geos) g.dispose();
    }
  }

  /** Libera la escena (geometrías y texturas) antes de crear la de la partida siguiente. */
  destruir() {
    liberar(this.escena);
    // Los materiales con textura son de esta isla (los de `mat` se comparten y se quedan).
    this.escena.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (m?.map) {
        m.map.dispose();
        m.dispose();
      }
    });
    this.escena.clear();
    this.modelos.clear();
    this.objetos.clear();
    this.cofres.clear();
  }

  ajustar(ancho: number, alto: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  private lookDe(l: Luchador, propio: Look): Look {
    if (l.esJugador) return propio;
    let look = this.looks.get(l.id);
    if (!look) this.looks.set(l.id, (look = randomLook()));
    return look;
  }

  private modelo(l: Luchador, look: Look): ModeloLuchador {
    let m = this.modelos.get(l);
    if (!m) {
      const lk = this.lookDe(l, look);
      const a = createAvatar(lk);
      const brazos = a.body.userData.arms as THREE.Object3D[];
      const fogonazo = malla(new THREE.SphereGeometry(0.08, 6, 4), mat(0xffd27a, true), 0, -0.36, 0.75, false);
      fogonazo.visible = false;
      brazos[1].add(fogonazo);
      const planeador = modeloPlaneador(lk.shirt);
      planeador.visible = false;
      a.group.add(planeador);
      m = { grupo: a.group, cuerpo: a.body, arma: '', mano: brazos[1], armaMalla: null, fogonazo, planeador };
      this.modelos.set(l, m);
      this.escena.add(a.group);
    }
    return m;
  }

  /** Cambia el arma que lleva en la mano si ha cambiado. */
  private ponerArma(p: Partida, l: Luchador, m: ModeloLuchador) {
    const r = p.arma(l);
    const clave = r?.tipo === 'arma' ? `${r.arma}${r.rareza}` : r?.tipo === 'cura' ? 'cura' : 'pico';
    if (clave === m.arma) return;
    m.arma = clave;
    if (m.armaMalla) {
      m.mano.remove(m.armaMalla);
      liberar(m.armaMalla);
    }
    const arma = r?.tipo === 'arma' ? modeloArma(r.arma, r.rareza) : r?.tipo === 'cura' ? modeloObjeto(r) : modeloArma('pico');
    arma.position.set(0, -0.4, 0.2);
    if (r?.tipo === 'cura') arma.position.set(0, -0.6, 0.1);
    m.mano.add(arma);
    m.armaMalla = arma;
  }

  dibujar(p: Partida, look: Look, efectos: boolean, camaraCerca: boolean) {
    const clave = JSON.stringify(look);
    if (clave !== this.lookActual) {
      for (const [l, m] of this.modelos) if (l.esJugador) {
        this.escena.remove(m.grupo);
        liberar(m.grupo);
        this.modelos.delete(l);
      }
      this.lookActual = clave;
    }

    // Cámara: tercera persona del jugador, del observado o detrás del autobús.
    const j = p.jugador;
    const sigue = j.vivo ? j : p.observado;
    let ocultar: Luchador | null = null;
    if (sigue && sigue.estado === 'bus') {
      const b = p.posicionBus();
      const dir = Partida.direccion(sigue.yaw, sigue.pitch);
      this.camara.position.set(b.x - dir.x * 22, b.y + 4 - dir.y * 22, b.z - dir.z * 22);
      this.camara.lookAt(b.x, b.y + 2, b.z);
    } else if (sigue) {
      const zoom = sigue === j && p.zoom;
      const c = p.camara(sigue, zoom);
      let atras = c.atras;
      if (camaraCerca && !zoom && sigue.estado === 'suelo') atras *= 0.7;
      const dir = Partida.direccion(sigue.yaw, sigue.pitch);
      const k = atras / c.atras;
      this.camara.position.set(c.x + dir.x * c.atras * (1 - k), c.y + dir.y * c.atras * (1 - k), c.z + dir.z * c.atras * (1 - k));
      this.camara.rotation.set(sigue.pitch, sigue.yaw, 0, 'YXZ');
      const d = sigue === j ? p.datosArma(j) : null;
      if (atras < 0.9 || (zoom && d && d.zoom > 2)) ocultar = sigue;
    } else {
      this.camara.position.set(j.cuerpo.x + 4, j.cuerpo.y + 8, j.cuerpo.z + 4);
      this.camara.lookAt(j.cuerpo.x, j.cuerpo.y, j.cuerpo.z);
    }
    const d = j.vivo ? p.datosArma(j) : null;
    const fov = p.zoom && d ? 70 / d.zoom : 70;
    if (this.camara.fov !== fov) {
      this.camara.fov = fov;
      this.camara.updateProjectionMatrix();
    }

    // El sol (y su sombra) sigue a la cámara.
    const cx = this.camara.position.x;
    const cz = this.camara.position.z;
    this.sol.position.set(cx + 30, 70, cz + 20);
    this.sol.target.position.set(cx, 0, cz);

    for (const l of p.luchadores) {
      const m = this.modelo(l, look);
      m.grupo.visible = l.estado !== 'bus' && l !== ocultar && (l.vivo || l.muerteT < 3);
      if (!m.grupo.visible) continue;
      this.ponerArma(p, l, m);
      m.grupo.position.set(l.cuerpo.x, l.cuerpo.y, l.cuerpo.z);
      m.grupo.rotation.set(0, l.yaw + Math.PI, 0);
      m.planeador.visible = l.estado === 'planeando';
      const brazos = m.cuerpo.userData.arms as THREE.Object3D[];
      if (!l.vivo) {
        // Cae y desaparece en un destello.
        const k = Math.min(1, l.muerteT * 3);
        m.grupo.rotation.x = (-Math.PI / 2) * k;
        m.grupo.position.y = l.cuerpo.y + 0.15 * k;
        m.grupo.scale.setScalar(Math.max(0.01, 1 - Math.max(0, l.muerteT - 2)));
        m.fogonazo.visible = false;
        continue;
      }
      m.grupo.scale.setScalar(1);
      m.grupo.rotation.x = l.estado === 'cayendo' ? 0.9 : 0;
      if (l.estado === 'suelo') {
        animateWalk(m.cuerpo, p.tiempo + l.id, l.moviendose);
        brazos[1].rotation.x = -1.35 - l.pitch;
        brazos[0].rotation.x = -1.15 - l.pitch;
        brazos[0].rotation.z = -0.45;
        if (p.arma(l)?.tipo !== 'arma') {
          // Pico: golpe hacia abajo; cura: brazo al pecho.
          const golpe = Math.max(0, 1 - l.disparo * 3);
          brazos[1].rotation.x = p.arma(l)?.tipo === 'cura' ? -1.9 : -1.6 + golpe * 1.4;
          brazos[0].rotation.x = 0;
          brazos[0].rotation.z = 0;
        }
      } else {
        // En el aire: brazos arriba.
        animateWalk(m.cuerpo, 0, false);
        brazos[0].rotation.set(Math.PI, 0, 0.3);
        brazos[1].rotation.set(Math.PI, 0, -0.3);
      }
      const r = p.arma(l);
      m.fogonazo.visible = l.disparo < 0.05 && r?.tipo === 'arma';
    }

    this.dibujarBotin(p, efectos);
    this.dibujarTrazos(p);

    // Tormenta.
    const t = p.tormenta;
    this.tormenta.position.set(t.actual.x, 70, t.actual.z);
    this.tormenta.scale.set(Math.max(0.1, t.actual.r), 1, Math.max(0.1, t.actual.r));
    // La pared se ve fuerte de cerca y casi transparente de lejos (si no, tiñe todo el cielo).
    const aPared = Math.abs(t.actual.r - Math.hypot(cx - t.actual.x, cz - t.actual.z));
    (this.tormenta.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0.12, Math.min(1, 1 - (aPared - 8) / 50));
    this.tormentaSiguiente.visible = t.siguiente.r < t.actual.r - 0.5;
    this.tormentaSiguiente.position.set(t.siguiente.x, 0.2, t.siguiente.z);
    this.tormentaSiguiente.scale.set(Math.max(0.1, t.siguiente.r), 1, Math.max(0.1, t.siguiente.r));

    // Autobús.
    this.bus.visible = p.bus.t < p.bus.duracion;
    if (this.bus.visible) {
      const b = p.posicionBus();
      this.bus.position.set(b.x, b.y, b.z);
      this.bus.rotation.y = Math.atan2(p.bus.x1 - p.bus.x0, p.bus.z1 - p.bus.z0);
      this.bus.position.y += Math.sin(p.tiempo * 1.5) * 0.3;
    }
    if (efectos) this.texAgua.offset.set(p.tiempo * 0.01, p.tiempo * 0.006);
    this.renderer.render(this.escena, this.camara);
  }

  private dibujarBotin(p: Partida, efectos: boolean) {
    const vivos = new Set(p.objetos);
    for (const [o, g] of this.objetos) {
      if (!vivos.has(o)) {
        this.escena.remove(g);
        liberar(g);
        this.objetos.delete(o);
      }
    }
    const cx = this.camara.position.x;
    const cz = this.camara.position.z;
    for (const o of p.objetos) {
      let g = this.objetos.get(o);
      if (!g) {
        g = modeloObjeto(o.objeto);
        g.position.set(o.x, o.y, o.z);
        this.objetos.set(o, g);
        this.escena.add(g);
      }
      // Solo los cercanos: hay muchos objetos por la isla.
      g.visible = Math.abs(o.x - cx) < 90 && Math.abs(o.z - cz) < 90;
      if (g.visible && efectos) {
        g.rotation.y = p.tiempo * 1.2 + o.id;
        g.position.y = o.y + Math.sin(p.tiempo * 2 + o.id) * 0.05;
      }
    }
    for (const c of p.cofres) {
      let g = this.cofres.get(c);
      if (!g) {
        g = modeloCofre();
        g.position.set(c.x, c.y, c.z);
        g.rotation.y = (c.id * 1.7) % (Math.PI * 2);
        this.cofres.set(c, g);
        this.escena.add(g);
      }
      g.visible = Math.abs(c.x - cx) < 100 && Math.abs(c.z - cz) < 100;
      const { tapa, brillo } = g.userData as { tapa: THREE.Object3D; brillo: THREE.Mesh };
      tapa.rotation.x = c.abierto ? -1.9 : 0;
      brillo.visible = !c.abierto;
      if (!c.abierto && efectos) brillo.scale.setScalar(1 + Math.sin(p.tiempo * 4 + c.id) * 0.12);
    }
  }

  private dibujarTrazos(p: Partida) {
    while (this.trazos.length < p.trazos.length) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), mat(0xfff2b0, true, 0.85));
      this.trazos.push(t);
      this.escena.add(t);
    }
    this.trazos.forEach((m, i) => {
      const t = p.trazos[i];
      m.visible = !!t;
      if (!t) return;
      const a = this.va.set(t.x0, t.y0, t.z0);
      const b = this.vb.set(t.x1, t.y1, t.z1);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, a.distanceTo(b), 1);
      m.quaternion.setFromUnitVectors(Render3D.ARRIBA, b.sub(a).normalize());
    });

    while (this.impactos.length < p.impactos.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(0x333333, true));
      this.impactos.push(m);
      this.escena.add(m);
    }
    this.impactos.forEach((m, i) => {
      const imp = p.impactos[i];
      m.visible = !!imp;
      if (!imp) return;
      m.position.set(imp.x, imp.y, imp.z);
      m.material = imp.sangre ? mat(0x4fc3f7, true) : mat(0x3a3a3a, true);
      m.scale.setScalar(imp.sangre ? 1.5 + (0.4 - imp.t) * 4 : 1);
    });
  }

  /** Proyecta un punto del mundo a la pantalla (nombres, daño y botín). */
  proyectar(x: number, y: number, z: number, ancho: number, alto: number): { x: number; y: number; visible: boolean } {
    const v = this.vp.set(x, y, z).project(this.camara);
    return { x: ((v.x + 1) / 2) * ancho, y: ((1 - v.y) / 2) * alto, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
}

export { Partida };
