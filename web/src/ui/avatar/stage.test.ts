import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FOV, frameBust } from './stage.ts';

const ndcY = (camera: THREE.PerspectiveCamera, y: number) => {
  camera.updateMatrixWorld(true);
  return new THREE.Vector3(0, y, 0).project(camera).y;
};

describe('frameBust', () => {
  it('shows her from above the head down to just under the bust', () => {
    const camera = new THREE.PerspectiveCamera(FOV, 0.8, 0.1, 20);
    const head = new THREE.Vector3(0, 1.5, 0);
    frameBust(camera, head);
    expect(ndcY(camera, 1.5 + 0.25)).toBeCloseTo(1, 1);
    expect(ndcY(camera, 1.5 - 0.4)).toBeCloseTo(-1, 1);
  });
});
