import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bodyMaterials } from './materials.ts';

const fetched: string[] = [];
const tex = (name: string) => {
  fetched.push(name);
  return Promise.resolve(new THREE.Texture());
};

describe('bodyMaterials', () => {
  it('fetches nothing for a rig that has only her head', async () => {
    fetched.length = 0;
    expect(await bodyMaterials(tex, ['head', 'cards'])).toEqual({});
    expect(fetched).toEqual([]);
  });

  it('dresses her body and sweater when the rig has them', async () => {
    fetched.length = 0;
    const dressed = await bodyMaterials(tex, ['head', 'body', 'sweater']);
    expect(Object.keys(dressed).sort()).toEqual(['body', 'sweater']);
    expect(fetched.sort()).toEqual([
      'body_color_map.webp',
      'body_normal_map.webp',
      'knit_normal_map.webp',
    ]);
  });
});
