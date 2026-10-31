import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Angles, Pose } from './motion.ts';

const BONES = ['Head', 'Neck', 'Spine2', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder'];
const ARMS: ReadonlyArray<[string, Angles]> = [
  ['LeftArm', [0, 0.85, 0.25]],
  ['RightArm', [0, -0.85, 0.25]],
];

const FOV = 14;
const ABOVE_HEAD = 0.25;
const BELOW_HEAD = 0.37;

const biped = ([pitch, yaw, roll]: Angles): Angles => [yaw, roll, pitch];

export class Avatar {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  private meshes: THREE.Mesh[] = [];
  private bones: Record<string, THREE.Bone> = {};
  private base: Record<string, THREE.Quaternion> = {};
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.light();
  }

  private light(): void {
    this.scene.add(new THREE.HemisphereLight(0xffe2c0, 0x1f4a52, 0.9));
    const add = (light: THREE.Light, x: number, y: number, z: number) => {
      light.position.set(x, y, z);
      this.scene.add(light);
    };
    add(new THREE.DirectionalLight(0xffcf98, 2.2), -1.3, 2.2, 2);
    add(new THREE.DirectionalLight(0xffe9d6, 0.6), 1.6, 1.3, 1.6);
    add(new THREE.DirectionalLight(0x86c7d3, 1.1), 0.9, 2.4, -2.2);
    add(new THREE.PointLight(0xffa860, 0.8, 3, 1.5), 0, 1.05, 0.7);
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    this.scene.add(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        if (mesh.morphTargetDictionary) this.meshes.push(mesh);
      }
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
    });
    for (const name of [...BONES, ...ARMS.map(([n]) => n)]) {
      const bone = this.bones[name];
      if (bone) this.base[name] = bone.quaternion.clone();
    }
    for (const [name, angles] of ARMS) this.setBone(name, angles);
    root.updateMatrixWorld(true);
    this.frame();
  }

  private frame(): void {
    const head = new THREE.Vector3();
    this.bones.Head?.getWorldPosition(head);
    const centre = head.y + (ABOVE_HEAD - BELOW_HEAD) / 2;
    const span = ABOVE_HEAD + BELOW_HEAD;
    const distance = span / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.position.set(0, centre + 0.04, distance);
    this.camera.lookAt(0, centre, 0);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private setBone(name: string, [x, y, z]: Angles): void {
    const bone = this.bones[name];
    const base = this.base[name];
    if (!bone || !base) return;
    this.euler.set(x, y, z, 'YXZ');
    this.quat.setFromEuler(this.euler);
    bone.quaternion.copy(base).multiply(this.quat);
  }

  render(pose: Pose): void {
    for (const mesh of this.meshes) {
      const dict = mesh.morphTargetDictionary ?? {};
      const influences = mesh.morphTargetInfluences ?? [];
      for (const [name, idx] of Object.entries(dict)) influences[idx] = pose.weights[name] ?? 0;
    }
    const [yaw, pitch] = pose.eyes;
    this.setBone('LeftEye', [0, yaw, pitch]);
    this.setBone('RightEye', [0, yaw, pitch]);
    this.setBone('Head', biped(pose.head));
    this.setBone('Neck', biped(pose.neck));
    this.setBone('Spine2', biped(pose.spine));
    this.setBone('LeftShoulder', biped([0, 0, pose.shoulder]));
    this.setBone('RightShoulder', biped([0, 0, -pose.shoulder]));
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
