import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FIT = 0.8;
const FORWARD = 0.026;
const DOWN = 0.003;
const FRAME_SHADE = 0.55;
const LENS_ORDER = 5;

function dress(glasses: THREE.Object3D): [THREE.Vector3, THREE.Vector3] {
  const sums = [new THREE.Vector3(), new THREE.Vector3()] as const;
  const counts = [0, 0];
  glasses.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (!mesh.isMesh || !material) return;
    mesh.frustumCulled = false;
    if (!material.name.endsWith('glass')) {
      material.color.setScalar(FRAME_SHADE);
      return;
    }
    mesh.material = new THREE.MeshBasicMaterial({
      color: 0x1a2630,
      transparent: true,
      opacity: 0.03,
      depthWrite: false,
    });
    mesh.renderOrder = LENS_ORDER;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const side = pos.getX(i) > 0 ? 0 : 1;
      sums[side].add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      counts[side]! += 1;
    }
  });
  return [sums[0].divideScalar(counts[0] || 1), sums[1].divideScalar(counts[1] || 1)];
}

export async function wearGlasses(
  url: string,
  scene: THREE.Scene,
  eyes: readonly [THREE.Vector3, THREE.Vector3],
  head: THREE.Bone,
): Promise<void> {
  const glasses = (await new GLTFLoader().loadAsync(url)).scene;
  const [left, right] = dress(glasses);
  const scale = (FIT * eyes[0].distanceTo(eyes[1])) / left.distanceTo(right);
  const lensMid = left
    .clone()
    .add(right)
    .multiplyScalar(0.5 * scale);
  const eyeMid = eyes[0].clone().add(eyes[1]).multiplyScalar(0.5);
  glasses.scale.setScalar(scale);
  glasses.position
    .copy(eyeMid)
    .sub(lensMid)
    .add(new THREE.Vector3(0, -DOWN, FORWARD));
  scene.add(glasses);
  glasses.updateMatrixWorld(true);
  head.attach(glasses);
}
