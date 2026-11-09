import * as THREE from 'three';

export const FOV = 14;
const ABOVE_HEAD = 0.25;
const BELOW_HEAD = 0.37;
const BELOW_BUST = 0.55;

export function createRenderer(exposure = 1.05): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x1f4a52, 0.9));
  const add = (light: THREE.Light, x: number, y: number, z: number) => {
    light.position.set(x, y, z);
    scene.add(light);
  };
  add(new THREE.DirectionalLight(0xffcf98, 2.2), -1.3, 2.2, 2);
  add(new THREE.DirectionalLight(0xffe9d6, 0.6), 1.6, 1.3, 1.6);
  add(new THREE.DirectionalLight(0x86c7d3, 1.1), 0.9, 2.4, -2.2);
  add(new THREE.PointLight(0xffa860, 0.8, 3, 1.5), 0, 1.05, 0.7);
}

export function frameHead(camera: THREE.PerspectiveCamera, head: THREE.Vector3): void {
  frame(camera, head, BELOW_HEAD);
}

export function frameBust(camera: THREE.PerspectiveCamera, head: THREE.Vector3): void {
  frame(camera, head, BELOW_BUST);
}

function frame(camera: THREE.PerspectiveCamera, head: THREE.Vector3, below: number): void {
  const centre = head.y + (ABOVE_HEAD - below) / 2;
  const span = ABOVE_HEAD + below;
  const distance = span / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.position.set(head.x, centre + 0.04, head.z + distance);
  camera.lookAt(head.x, centre, head.z);
}
