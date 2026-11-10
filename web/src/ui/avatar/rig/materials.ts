import * as THREE from 'three';
import { eyeMaterial, occlusionMap } from './eyes.ts';
import type { WrinkleLayout } from './skin.ts';
import { fabricMaterial } from './fabric.ts';
import { mouthMaterial, plain, skinMaterial } from './skin.ts';

export interface Materials {
  byMesh: Record<string, THREE.Material>;
  cardsSoft: THREE.Material;
}

const ORDER: Readonly<Record<string, number>> = {
  eyelashes: 1,
  eyeshell: 2,
  saliva: 2,
  cards: 3,
};

export const renderOrderOf = (name: string): number => ORDER[name] ?? 0;
export const CARDS_SOFT_ORDER = 4;

function loader(base: string) {
  const textures = new THREE.TextureLoader();
  return async (name: string, srgb = false, flipY = true): Promise<THREE.Texture> => {
    const t = await textures.loadAsync(base + name);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.flipY = flipY;
    return t;
  };
}

function hairMaterials(
  cards: THREE.Texture,
): Pick<Record<string, THREE.Material>, 'cards'> & { soft: THREE.Material } {
  const hair = {
    map: cards,
    side: THREE.DoubleSide,
    roughness: 0.5,
    sheen: 0.5,
    sheenColor: new THREE.Color(0x6a4a3a),
    sheenRoughness: 0.4,
    specularIntensity: 0.4,
  };
  return {
    cards: plain({ ...hair, alphaTest: 0.5 }),
    soft: plain({ ...hair, transparent: true, alphaTest: 0.12, depthWrite: false }),
  };
}

export type TextureLoad = (name: string, srgb?: boolean) => Promise<THREE.Texture>;

export async function bodyMaterials(
  tex: TextureLoad,
  meshes: readonly string[],
): Promise<Partial<Record<'body' | 'sweater', THREE.Material>>> {
  if (!meshes.includes('body') && !meshes.includes('sweater')) return {};
  const [map, normalMap, knit] = await Promise.all([
    tex('body_color_map.webp', true),
    tex('body_normal_map.webp'),
    tex('knit_normal_map.webp'),
  ]);
  const body = plain({
    map,
    normalMap,
    roughness: 0.55,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xff8a6a),
  });
  return { body, sweater: fabricMaterial(knit) };
}

function films(lashes: THREE.Texture): Record<string, THREE.Material> {
  return {
    eyelashes: plain({
      map: lashes,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.02,
      side: THREE.DoubleSide,
      roughness: 1,
      specularIntensity: 0.1,
    }),
    eyeshell: plain({
      color: 0x1a0d08,
      transparent: true,
      alphaMap: occlusionMap(),
      roughness: 1,
      depthWrite: false,
    }),
    saliva: plain({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      depthWrite: false,
    }),
    cartilage: plain({ color: 0xc9827a, roughness: 0.35 }),
  };
}

export async function loadMaterials(
  base: string,
  hairFolder: string,
  layout: WrinkleLayout,
  meshes: readonly string[],
): Promise<Materials> {
  const tex = loader(base);
  const dressing = bodyMaterials(tex, meshes);
  const [
    color,
    normal,
    roughness,
    wm1,
    wm2,
    wm3,
    teethC,
    teethN,
    eyesC,
    eyesN,
    lashes,
    cards,
    scalp,
  ] = await Promise.all([
    tex('head_color_map.webp', true),
    tex('head_normal_map.webp'),
    tex('head_roughness_map.webp'),
    tex('head_wm1_normal_map.webp'),
    tex('head_wm2_normal_map.webp'),
    tex('head_wm3_normal_map.webp'),
    tex('teeth_color_map.webp', true),
    tex('teeth_normal_map.webp'),
    tex('eyes_color_map.webp', true),
    tex('eyes_normal_map.webp'),
    tex('eyelashes.webp', true),
    tex(`${hairFolder}hair_cards.webp`, true, false),
    tex(`${hairFolder}scalp.webp`),
  ]);
  const eye = eyeMaterial(eyesC, eyesN);
  const { soft, ...hair } = hairMaterials(cards);
  const dressed = await dressing;
  const byMesh: Record<string, THREE.Material> = {
    head: skinMaterial({ color, normal, roughness, wrinkles: [wm1, wm2, wm3], scalp }, layout),
    teeth: mouthMaterial(teethC, teethN),
    eyeLeft: eye,
    eyeRight: eye,
    ...films(lashes),
    ...dressed,
    ...hair,
  };
  return { byMesh, cardsSoft: soft };
}
