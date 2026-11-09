import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Angles, Pose } from './motion.ts';
import { FOV, addLights, createRenderer, frameHead } from './stage.ts';

const BONES = ['Head', 'Neck', 'Spine2', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder'];
const ARMS: ReadonlyArray<[string, Angles]> = [
  ['LeftArm', [0, 0.85, 0.25]],
  ['RightArm', [0, -0.85, 0.25]],
];

const biped = ([pitch, yaw, roll]: Angles): Angles => [yaw, roll, pitch];

export interface FaceRenderer {
  readonly canvas: HTMLCanvasElement;
  load(): Promise<void>;
  resize(width: number, height: number): void;
  render(pose: Pose): void;
  dispose(): void;
}

export class Avatar implements FaceRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  private meshes: THREE.Mesh[] = [];
  private bones: Record<string, THREE.Bone> = {};
  private base: Record<string, THREE.Quaternion> = {};
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();

  private readonly url: string;

  constructor(url: string) {
    this.url = url;
    this.renderer = createRenderer();
    this.canvas = this.renderer.domElement;
    addLights(this.scene);
  }

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(this.url);
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
    frameHead(this.camera, new THREE.Vector3(0, head.y, 0));
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
