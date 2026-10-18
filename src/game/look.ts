/** Datos de la apariencia de los personajes, sin three.js: así el menú carga sin el motor 3D. */

// ───────── Apariencia ─────────

export type Gender = 'boy' | 'girl';
export type HairStyle = 'short' | 'long' | 'ponytail' | 'curly' | 'mohawk' | 'bun' | 'bald';
export type Bottom = 'pants' | 'shorts' | 'skirt';
export type HatStyle = 'none' | 'cap' | 'straw' | 'chef' | 'beanie' | 'helmet' | 'crown';
export type Accessory = 'none' | 'glasses' | 'sunglasses' | 'bowtie' | 'earrings' | 'scarf';
export type BodyType = 'slim' | 'normal' | 'strong' | 'chubby';
export type Height = 'short' | 'medium' | 'tall';
export type Eyes = 'normal' | 'big' | 'happy' | 'lashes';
export type FacialHair = 'none' | 'mustache' | 'goatee' | 'stubble' | 'beard';

export interface Look {
  gender: Gender;
  body: BodyType;
  height: Height;
  skin: number;
  eyes: Eyes;
  facialHair: FacialHair;
  hair: HairStyle;
  hairColor: number;
  shirt: number;
  bottom: Bottom;
  bottomColor: number;
  hat: HatStyle;
  hatColor: number;
  accessory: Accessory;
}

export const LOOK_OPTIONS = {
  gender: [
    { id: 'boy', label: '👦 Chico' },
    { id: 'girl', label: '👧 Chica' },
  ],
  body: [
    { id: 'slim', label: 'Delgado' },
    { id: 'normal', label: 'Normal' },
    { id: 'strong', label: 'Fuerte' },
    { id: 'chubby', label: 'Robusto' },
  ],
  height: [
    { id: 'short', label: 'Bajo' },
    { id: 'medium', label: 'Medio' },
    { id: 'tall', label: 'Alto' },
  ],
  eyes: [
    { id: 'normal', label: 'Normales' },
    { id: 'big', label: 'Grandes' },
    { id: 'happy', label: 'Felices' },
    { id: 'lashes', label: 'Con pestañas' },
  ],
  facialHair: [
    { id: 'none', label: 'Ninguno' },
    { id: 'mustache', label: 'Bigote' },
    { id: 'goatee', label: 'Perilla' },
    { id: 'stubble', label: 'Barba corta' },
    { id: 'beard', label: 'Barba larga' },
  ],
  skin: [0xffe0c4, 0xf5c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21],
  hair: [
    { id: 'short', label: 'Corto' },
    { id: 'long', label: 'Largo' },
    { id: 'ponytail', label: 'Coleta' },
    { id: 'bun', label: 'Moño' },
    { id: 'curly', label: 'Rizado' },
    { id: 'mohawk', label: 'Cresta' },
    { id: 'bald', label: 'Rapado' },
  ],
  hairColor: [0x2b1d14, 0x5d4037, 0xa1887f, 0xf6d36b, 0xd84315, 0x9e9e9e, 0x1e88e5, 0xec407a, 0x43a047],
  shirt: [0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x8e24aa, 0xff7043, 0x00897b, 0xffffff, 0x37474f, 0xf06292],
  bottom: [
    { id: 'pants', label: 'Pantalón' },
    { id: 'shorts', label: 'Pantalón corto' },
    { id: 'skirt', label: 'Falda' },
  ],
  bottomColor: [0x283593, 0x37474f, 0x6d4c41, 0x212121, 0xc62828, 0xf5f5f5],
  hat: [
    { id: 'none', label: 'Ninguno' },
    { id: 'cap', label: 'Gorra' },
    { id: 'straw', label: 'Sombrero' },
    { id: 'chef', label: 'Chef' },
    { id: 'beanie', label: 'Gorro de lana' },
    { id: 'helmet', label: 'Casco' },
    { id: 'crown', label: 'Corona' },
  ],
  hatColor: [0xe53935, 0x1e88e5, 0x43a047, 0xffffff, 0x212121, 0xffb300],
  accessory: [
    { id: 'none', label: 'Ninguno' },
    { id: 'glasses', label: 'Gafas' },
    { id: 'sunglasses', label: 'Gafas de sol' },
    { id: 'bowtie', label: 'Pajarita' },
    { id: 'earrings', label: 'Pendientes' },
    { id: 'scarf', label: 'Bufanda' },
  ],
} as const;

export const DEFAULT_LOOK: Look = {
  gender: 'boy',
  body: 'normal',
  height: 'medium',
  skin: 0xf5c9a0,
  eyes: 'normal',
  facialHair: 'none',
  hair: 'short',
  hairColor: 0x5d4037,
  shirt: 0x1e88e5,
  bottom: 'pants',
  bottomColor: 0x283593,
  hat: 'cap',
  hatColor: 0xffffff,
  accessory: 'none',
};

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function randomLook(): Look {
  const gender = pick(['boy', 'girl'] as const);
  return {
    gender,
    body: pick(['slim', 'normal', 'normal', 'strong', 'chubby'] as const),
    height: pick(['short', 'medium', 'medium', 'tall'] as const),
    skin: pick(LOOK_OPTIONS.skin),
    eyes: pick(gender === 'girl' ? (['normal', 'lashes', 'big', 'happy'] as const) : (['normal', 'normal', 'big', 'happy'] as const)),
    facialHair: gender === 'boy' && Math.random() < 0.35 ? pick(['mustache', 'goatee', 'stubble', 'beard'] as const) : 'none',
    hair: pick(gender === 'girl' ? (['long', 'ponytail', 'bun', 'curly', 'short'] as const) : (['short', 'curly', 'mohawk', 'bald', 'short'] as const)),
    hairColor: pick(LOOK_OPTIONS.hairColor.slice(0, 6)),
    shirt: pick(LOOK_OPTIONS.shirt),
    bottom: gender === 'girl' ? pick(['skirt', 'pants', 'shorts'] as const) : pick(['pants', 'shorts'] as const),
    bottomColor: pick(LOOK_OPTIONS.bottomColor),
    hat: Math.random() < 0.25 ? pick(['cap', 'straw', 'beanie'] as const) : 'none',
    hatColor: pick(LOOK_OPTIONS.hatColor),
    accessory: Math.random() < 0.3 ? pick(['glasses', 'sunglasses', 'bowtie', 'scarf', ...(gender === 'girl' ? (['earrings'] as const) : [])] as const) : 'none',
  };
}
