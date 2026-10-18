import * as THREE from 'three';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
const mat = (color: number) => {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
};

// ───────── Apariencia (en look.ts, sin three.js) ─────────

export * from './look';
import { DEFAULT_LOOK, type BodyType, type Height, type Look } from './look';

// ───────── Construcción ─────────

export interface Character {
  group: THREE.Group;
  body: THREE.Group;
}

const HEAD_Y = 1.28;
const HEAD_R = 0.24;

/** Radio del torso, anchura de hombros, profundidad y grosor de brazos según el tipo de cuerpo. */
const BODY: Record<BodyType, { r: number; shoulders: number; depth: number; arm: number }> = {
  slim: { r: 0.25, shoulders: 1, depth: 0.95, arm: 0.06 },
  normal: { r: 0.3, shoulders: 1, depth: 1, arm: 0.07 },
  strong: { r: 0.31, shoulders: 1.2, depth: 1, arm: 0.09 },
  chubby: { r: 0.37, shoulders: 1.05, depth: 1.1, arm: 0.08 },
};

const HEIGHT: Record<Height, number> = { short: 0.88, medium: 1, tall: 1.1 };

function addEyes(body: THREE.Group, look: Look) {
  const y = HEAD_Y + 0.04;
  for (const x of [-0.09, 0.09]) {
    switch (look.eyes) {
      case 'big':
        body.add(m(new THREE.SphereGeometry(0.055, 10, 8), 0xffffff, x, y, 0.2));
        body.add(m(new THREE.SphereGeometry(0.032, 8, 6), 0x222222, x, y, 0.245));
        break;
      case 'happy': {
        const arc = m(new THREE.TorusGeometry(0.035, 0.011, 4, 8, Math.PI), 0x222222, x, y - 0.015, 0.225);
        body.add(arc);
        break;
      }
      case 'lashes':
        body.add(m(new THREE.SphereGeometry(0.035, 8, 6), 0x222222, x, y, 0.21));
        body.add(m(new THREE.BoxGeometry(0.07, 0.015, 0.02), 0x222222, x + (x < 0 ? -0.01 : 0.01), y + 0.045, 0.215));
        break;
      default:
        body.add(m(new THREE.SphereGeometry(0.035, 8, 6), 0x222222, x, y, 0.21));
    }
  }
}

function addFacialHair(body: THREE.Group, look: Look) {
  const c = look.hairColor;
  // Mitad delantera de la parte baja de la cabeza (mandíbula).
  const jaw = (r: number) => m(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI, Math.PI * 0.6, Math.PI * 0.4), c, 0, HEAD_Y, 0);
  switch (look.facialHair) {
    case 'mustache':
      body.add(m(new THREE.BoxGeometry(0.16, 0.04, 0.04), c, 0, HEAD_Y - 0.035, 0.225));
      break;
    case 'goatee':
      body.add(m(new THREE.BoxGeometry(0.14, 0.035, 0.04), c, 0, HEAD_Y - 0.035, 0.225));
      body.add(m(new THREE.BoxGeometry(0.08, 0.09, 0.05), c, 0, HEAD_Y - 0.17, 0.19));
      break;
    case 'stubble':
      body.add(jaw(HEAD_R + 0.012));
      body.add(m(new THREE.BoxGeometry(0.16, 0.04, 0.04), c, 0, HEAD_Y - 0.035, 0.225));
      break;
    case 'beard':
      body.add(jaw(HEAD_R + 0.02));
      body.add(m(new THREE.BoxGeometry(0.16, 0.04, 0.04), c, 0, HEAD_Y - 0.035, 0.23));
      body.add(m(new THREE.BoxGeometry(0.26, 0.2, 0.12), c, 0, HEAD_Y - 0.27, 0.13));
      break;
    case 'none':
      break;
  }
}

function m(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

function addHair(body: THREE.Group, look: Look) {
  const c = look.hairColor;
  // Casquete: por delante solo cubre la parte alta de la cabeza (deja la frente y los ojos a la vista)
  // y por detrás baja hasta la nuca.
  const cap = () => {
    body.add(m(new THREE.SphereGeometry(HEAD_R + 0.02, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), c, 0, HEAD_Y, 0));
    body.add(m(new THREE.SphereGeometry(HEAD_R + 0.02, 16, 10, Math.PI, Math.PI, 0, Math.PI * 0.62), c, 0, HEAD_Y, 0));
  };
  switch (look.hair) {
    case 'short':
      cap();
      body.add(m(new THREE.BoxGeometry(0.26, 0.05, 0.06), c, 0, HEAD_Y + 0.19, 0.15));
      break;
    case 'long':
      cap();
      body.add(m(new THREE.BoxGeometry(0.46, 0.5, 0.14), c, 0, HEAD_Y - 0.12, -0.16));
      break;
    case 'ponytail':
      cap();
      body.add(m(new THREE.SphereGeometry(0.09, 10, 8), c, 0, HEAD_Y + 0.08, -0.28));
      body.add(m(new THREE.CylinderGeometry(0.06, 0.03, 0.32, 8), c, 0, HEAD_Y - 0.12, -0.33));
      break;
    case 'bun':
      cap();
      body.add(m(new THREE.SphereGeometry(0.11, 12, 8), c, 0, HEAD_Y + 0.27, -0.06));
      break;
    case 'curly':
      body.add(m(new THREE.IcosahedronGeometry(0.28, 1), c, 0, HEAD_Y + 0.13, -0.11));
      break;
    case 'mohawk':
      body.add(m(new THREE.BoxGeometry(0.07, 0.18, 0.4), c, 0, HEAD_Y + 0.25, -0.02));
      break;
    case 'bald':
      break;
  }
}

function addHat(body: THREE.Group, look: Look) {
  const c = look.hatColor;
  const top = HEAD_Y + 0.17;
  switch (look.hat) {
    case 'cap':
      body.add(m(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 16), c, 0, top + 0.02, 0));
      body.add(m(new THREE.BoxGeometry(0.3, 0.03, 0.18), c, 0, top - 0.02, 0.24));
      break;
    case 'straw':
      body.add(m(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), 0xe6c35c, 0, top, 0));
      body.add(m(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 16), 0xe6c35c, 0, top + 0.08, 0));
      body.add(m(new THREE.CylinderGeometry(0.245, 0.245, 0.04, 16), c, 0, top + 0.03, 0));
      break;
    case 'chef':
      body.add(m(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16), 0xffffff, 0, top + 0.08, 0));
      body.add(m(new THREE.SphereGeometry(0.26, 14, 10), 0xffffff, 0, top + 0.26, 0));
      break;
    case 'beanie':
      body.add(m(new THREE.SphereGeometry(HEAD_R + 0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), c, 0, HEAD_Y + 0.06, 0));
      body.add(m(new THREE.SphereGeometry(0.06, 8, 6), 0xffffff, 0, HEAD_Y + 0.34, 0));
      break;
    case 'helmet':
      body.add(m(new THREE.SphereGeometry(HEAD_R + 0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), 0xfdd835, 0, HEAD_Y + 0.06, 0));
      body.add(m(new THREE.BoxGeometry(0.34, 0.03, 0.12), 0xfdd835, 0, HEAD_Y + 0.13, 0.25));
      break;
    case 'crown': {
      const gold = 0xffc107;
      body.add(m(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12, 1, true), gold, 0, top + 0.06, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        body.add(m(new THREE.ConeGeometry(0.045, 0.12, 4), gold, Math.cos(a) * 0.18, top + 0.16, Math.sin(a) * 0.18));
      }
      break;
    }
    case 'none':
      break;
  }
}

function addAccessory(body: THREE.Group, look: Look) {
  const eyeY = HEAD_Y + 0.04;
  switch (look.accessory) {
    case 'glasses':
      for (const x of [-0.09, 0.09]) {
        const r = m(new THREE.TorusGeometry(0.055, 0.012, 6, 14), 0x212121, x, eyeY, 0.225);
        body.add(r);
      }
      body.add(m(new THREE.BoxGeometry(0.06, 0.015, 0.015), 0x212121, 0, eyeY, 0.23));
      break;
    case 'sunglasses':
      body.add(m(new THREE.BoxGeometry(0.34, 0.08, 0.03), 0x111111, 0, eyeY, 0.225));
      break;
    case 'earrings':
      for (const x of [-HEAD_R, HEAD_R]) body.add(m(new THREE.SphereGeometry(0.03, 8, 6), 0xffc107, x, HEAD_Y - 0.06, 0.02));
      break;
    case 'scarf': {
      const scarf = m(new THREE.TorusGeometry(0.17, 0.06, 8, 16), 0xc62828, 0, 1.04, 0);
      scarf.rotation.x = Math.PI / 2;
      body.add(scarf, m(new THREE.BoxGeometry(0.1, 0.24, 0.05), 0xc62828, 0.1, 0.9, 0.2));
      break;
    }
    case 'bowtie':
      for (const x of [-0.06, 0.06]) {
        const cone = m(new THREE.ConeGeometry(0.05, 0.09, 4), 0xc62828, x, 1.0, 0.27);
        cone.rotation.z = x < 0 ? -Math.PI / 2 : Math.PI / 2;
        body.add(cone);
      }
      break;
    case 'none':
      break;
  }
}

/** Personaje low-poly que mira hacia +z, construido a partir de su apariencia. */
export function createAvatar(look: Look): Character {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const girl = look.gender === 'girl';
  const shape = BODY[look.body] ?? BODY.normal;
  const torsoR = shape.r - (girl ? 0.03 : 0);

  // Torso (camiseta) y parte de abajo
  const torso = m(new THREE.CapsuleGeometry(torsoR, 0.42, 4, 12), look.shirt, 0, 0.58, 0);
  torso.scale.set(shape.shoulders, 1, shape.depth);
  body.add(torso);
  // La parte de abajo se ensancha igual que el torso para que la camiseta no sobresalga.
  const lower =
    look.bottom === 'skirt'
      ? m(new THREE.CylinderGeometry(torsoR + 0.015, torsoR + 0.15, 0.34, 14), look.bottomColor, 0, 0.3, 0)
      : (() => {
          const h = look.bottom === 'shorts' ? 0.24 : 0.38;
          return m(new THREE.CylinderGeometry(torsoR + 0.02, torsoR + 0.025, h, 14), look.bottomColor, 0, 0.42 - h / 2, 0);
        })();
  lower.scale.set(shape.shoulders, 1, shape.depth);
  body.add(lower);
  if (look.bottom !== 'pants') for (const x of [-0.12, 0.12]) body.add(m(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), look.skin, x, 0.1, 0.02));
  for (const x of [-0.12, 0.12]) body.add(m(new THREE.BoxGeometry(0.13, 0.07, 0.2), 0x3e2723, x, 0.035, 0.05));

  // Brazos (se balancean al andar)
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (torsoR * shape.shoulders + shape.arm - 0.01), 0.85, 0);
    arm.add(m(new THREE.CapsuleGeometry(shape.arm, 0.24, 4, 8), look.shirt, 0, -0.18, 0));
    arm.add(m(new THREE.SphereGeometry(shape.arm, 8, 6), look.skin, 0, -0.38, 0));
    arm.rotation.z = side * 0.12;
    arms.push(arm);
    body.add(arm);
  }
  body.userData.arms = arms;

  // Cabeza y cara
  body.add(m(new THREE.SphereGeometry(HEAD_R, 16, 12), look.skin, 0, HEAD_Y, 0));
  addEyes(body, look);
  const smile = m(new THREE.TorusGeometry(0.045, 0.012, 6, 10, Math.PI), 0x8d3b3b, 0, HEAD_Y - 0.07, 0.225);
  smile.rotation.z = Math.PI;
  body.add(smile);
  if (girl) for (const x of [-0.13, 0.13]) body.add(m(new THREE.SphereGeometry(0.035, 8, 6), 0xf8a5a5, x, HEAD_Y - 0.04, 0.19));

  addFacialHair(body, look);
  addHair(body, look);
  addHat(body, look);
  addAccessory(body, look);

  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  // Altura: escala todo el cuerpo (quien añada una pila a la espalda puede compensarla con userData.heightScale).
  const hs = HEIGHT[look.height] ?? 1;
  body.scale.setScalar(hs);
  body.userData.heightScale = hs;
  return { group, body };
}

/** Personaje con camiseta de un color (y gorra opcional): para personal y otros NPC. */
export function createCharacter(color: number, hat?: number): Character {
  return createAvatar({ ...DEFAULT_LOOK, shirt: color, hat: hat === undefined ? 'none' : 'cap', hatColor: hat ?? 0xffffff });
}

/** Balanceo al caminar (cuerpo y brazos). */
export function animateWalk(body: THREE.Object3D, t: number, moving: boolean) {
  body.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.08 : 0;
  body.rotation.z = moving ? Math.sin(t * 11) * 0.06 : 0;
  const arms = body.userData.arms as THREE.Object3D[] | undefined;
  if (arms) arms.forEach((a, i) => (a.rotation.x = moving ? Math.sin(t * 11 + i * Math.PI) * 0.6 : 0));
}
