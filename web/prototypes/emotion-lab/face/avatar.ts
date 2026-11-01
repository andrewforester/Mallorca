import type { Pad } from '../../../src/emotion/index.ts';
import { clamp } from '../lab.ts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Rng } from '../../../src/cards/index.ts';
import type { VisemeCue, Weights } from '../../../src/face/index.ts';

export const MODEL_URLS = [`${import.meta.env.BASE_URL}avatar/mallorca.glb`];

export type GazeTarget = 'player' | 'cards' | 'board' | 'chips' | 'away' | 'think' | 'down';

const GAZE: Readonly<Record<GazeTarget, readonly [number, number]>> = {
  player: [0, 0],
  cards: [0.02, 0.42],
  board: [0, 0.3],
  chips: [-0.32, 0.36],
  away: [0.45, 0.04],
  think: [-0.3, -0.22],
  down: [0.05, 0.5],
};

export interface IdleState {
  nervous: number;
  arousal: number;
  blinkRate: number;
}

interface Pulse {
  weights: Weights;
  amp: number;
  attack: number;
  hold: number;
  release: number;
  t0: number;
}

interface HeadMove {
  kind: 'shake' | 'nod' | 'tilt';
  amp: number;
  dur: number;
  t0: number;
}

const BONES = [
  'Head',
  'Neck',
  'Spine2',
  'LeftEye',
  'RightEye',
  'LeftShoulder',
  'RightShoulder',
  'LeftArm',
  'RightArm',
];
const BIPED = new Set(['Head', 'Neck', 'Spine2', 'LeftShoulder', 'RightShoulder']);

export function envelope(t: number, a: number, h: number, r: number): number {
  if (t < 0) {
    return 0;
  }
  if (t < a) {
    return t / a;
  }
  if (t < a + h) {
    return 1;
  }
  return t < a + h + r ? 1 - (t - a - h) / r : -1;
}

const smooth = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class Avatar {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 4 / 5, 0.1, 20);
  private meshes: THREE.Mesh[] = [];
  private bones: Record<string, THREE.Bone> = {};
  private base: Record<string, THREE.Quaternion> = {};
  private names = new Set<string>();
  private values: Record<string, number> = {};
  private target: Weights = {};
  private pulses: Pulse[] = [];
  private heads: HeadMove[] = [];
  private blinks: number[] = [];
  private cues: VisemeCue[] = [];
  private cueStart = 0;
  private time = 0;
  private gaze: GazeTarget = 'player';
  private glance: { target: GazeTarget; until: number } | null = null;
  private gazeOffset: [number, number] = [0, 0];
  private gazeNow: [number, number] = [0, 0];
  private headNow: [number, number, number] = [0, 0, 0];
  private nextBlink = 1.5;
  private nextSaccade = 0;
  private pad: Pad = [0, 0, 0];
  private idle: IdleState = { nervous: 0, arousal: 0, blinkRate: 1 };
  private euler = new THREE.Euler();
  private quat = new THREE.Quaternion();
  ready = false;
  private rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.light();
  }

  private light(): void {
    this.scene.add(new THREE.HemisphereLight(0xffe2c0, 0x1f4a52, 0.8));
    const add = (light: THREE.Light, x: number, y: number, z: number) => {
      light.position.set(x, y, z);
      this.scene.add(light);
    };
    add(new THREE.DirectionalLight(0xffcf98, 2.4), -1.3, 2.2, 2.0);
    add(new THREE.DirectionalLight(0xffe9d6, 0.55), 1.6, 1.3, 1.6);
    add(new THREE.DirectionalLight(0x86c7d3, 1.3), 0.9, 2.4, -2.2);
    add(new THREE.PointLight(0xffa860, 0.9, 3, 1.5), 0, 1.05, 0.7);
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    let lastError: unknown;
    for (const url of MODEL_URLS) {
      try {
        this.init(await loader.loadAsync(url));
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  private init(gltf: GLTF): void {
    const root = gltf.scene;
    this.scene.add(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        if (mesh.morphTargetDictionary) {
          this.meshes.push(mesh);
          Object.keys(mesh.morphTargetDictionary).forEach((n) => this.names.add(n));
        }
      }
      if ((o as THREE.Bone).isBone) {
        this.bones[o.name] = o as THREE.Bone;
      }
    });
    for (const n of BONES) {
      const bone = this.bones[n];
      if (bone) {
        this.base[n] = bone.quaternion.clone();
      }
    }
    this.setBone('LeftArm', 0, 0.85, 0.25);
    this.setBone('RightArm', 0, -0.85, 0.25);
    this.names.forEach((n) => (this.values[n] = 0));
    root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    this.bones.Head?.getWorldPosition(head);
    this.camera.position.set(0, head.y + 0.06, 1.55);
    this.camera.lookAt(0, head.y - 0.04, 0);
    this.ready = true;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setFace(weights: Weights, shownPad: Pad, idle: IdleState): void {
    this.target = weights;
    this.pad = shownPad;
    this.idle = idle;
  }

  pulse(
    weights: Weights,
    amp: number,
    attack: number,
    hold: number,
    release: number,
    delay = 0,
  ): void {
    this.pulses.push({ weights, amp, attack, hold, release, t0: this.time + delay });
  }

  blink(delay = 0): void {
    this.blinks.push(this.time + delay);
  }

  blinkBurst(n: number): void {
    for (let i = 0; i < n; i++) {
      this.blink(i * 0.28);
    }
  }

  setGaze(target: GazeTarget): void {
    this.gaze = target;
    this.glance = null;
  }

  headMove(kind: HeadMove['kind'], amp: number, dur: number): void {
    this.heads.push({ kind, amp, dur, t0: this.time });
  }

  speak(cues: VisemeCue[]): void {
    this.cues = cues;
    this.cueStart = this.time;
  }

  syncSpeech(charIndex: number): void {
    const cue = this.cues.find((c) => c.charIndex >= charIndex);
    if (cue) {
      this.cueStart = this.time - cue.at;
    }
  }

  clearTransient(): void {
    this.pulses = [];
    this.heads = [];
    this.blinks = [];
    this.cues = [];
  }

  quiet(): void {
    this.blinks = [];
    this.nextBlink = this.time + 10;
  }

  private setBone(name: string, x: number, y: number, z: number): void {
    const bone = this.bones[name];
    const base = this.base[name];
    if (!bone || !base) {
      return;
    }
    if (BIPED.has(name)) {
      this.euler.set(y, z, x, 'YXZ');
    } else {
      this.euler.set(x, y, z, 'YXZ');
    }
    this.quat.setFromEuler(this.euler);
    bone.quaternion.copy(base).multiply(this.quat);
  }

  private idleTick(): void {
    const { nervous, arousal, blinkRate } = this.idle;
    if (this.time >= this.nextBlink) {
      this.blink();
      const rate = blinkRate * (1 + 1.6 * nervous + 0.5 * Math.max(0, arousal));
      this.nextBlink = this.time + (1.2 + this.rng.next() * 4.2) / rate;
    }
    if (this.time >= this.nextSaccade) {
      this.gazeOffset = [(this.rng.next() - 0.5) * 0.08, (this.rng.next() - 0.5) * 0.05];
      this.nextSaccade = this.time + 0.5 + this.rng.next() * 2.0;
      if (this.gaze === 'player' && !this.glance && this.rng.next() < 0.06 + 0.75 * nervous) {
        const targets: GazeTarget[] = ['cards', 'chips', 'away', 'board'];
        const pick = targets[Math.floor(this.rng.next() * (nervous > 0.3 ? 4 : 2))] ?? 'cards';
        this.glance = { target: pick, until: this.time + 0.35 + this.rng.next() * 0.6 };
      }
    }
    if (this.glance && this.time > this.glance.until) {
      this.glance = null;
    }
  }

  private transient(): Weights {
    const w: Weights = {};
    this.pulses = this.pulses.filter((p) => {
      const e = envelope(this.time - p.t0, p.attack, p.hold, p.release);
      if (e < 0) {
        return false;
      }
      for (const [n, v] of Object.entries(p.weights)) {
        w[n] = (w[n] ?? 0) + v * p.amp * e;
      }
      return true;
    });
    const t = this.time - this.cueStart;
    for (const c of this.cues) {
      const e = envelope(t - c.at, 0.05, 0.03, 0.1);
      if (e <= 0) {
        continue;
      }
      const name = `viseme_${c.viseme}`;
      w[name] = Math.max(w[name] ?? 0, e * (c.viseme === 'E' || c.viseme === 'I' ? 0.45 : 0.7));
      if (c.viseme === 'aa' || c.viseme === 'O' || c.viseme === 'E') {
        w.jawOpen = Math.max(w.jawOpen ?? 0, e * 0.22);
      }
    }
    return w;
  }

  private blinkValue(): number {
    let v = 0;
    this.blinks = this.blinks.filter((t0) => {
      const e = envelope(this.time - t0, 0.07, 0.04, 0.13);
      v = Math.max(v, e);
      return e >= 0 || this.time < t0;
    });
    return v;
  }

  private headOffsets(): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0];
    this.heads = this.heads.filter((h) => {
      const t = this.time - h.t0;
      if (t > h.dur) {
        return false;
      }
      const fade = Math.sin((Math.PI * t) / h.dur);
      if (h.kind === 'shake') {
        out[0] += Math.sin(t * 2 * Math.PI * 1.8) * h.amp * fade;
      } else if (h.kind === 'nod') {
        out[1] += Math.sin(t * 2 * Math.PI * 1.6) * h.amp * fade;
      } else {
        out[2] += h.amp * fade;
      }
      return true;
    });
    return out;
  }

  tick(dt: number): void {
    this.time += dt;
    if (!this.ready) {
      return;
    }
    this.idleTick();
    const tr = this.transient();
    const final: Weights = {};
    for (const n of this.names) {
      this.values[n] = smooth(this.values[n] ?? 0, clamp(this.target[n] ?? 0, 0, 1), 3.2, dt);
      final[n] = (this.values[n] ?? 0) + (tr[n] ?? 0);
    }
    this.eyes(dt, final);
    const b = this.blinkValue();
    final.eyeBlinkLeft = Math.max(final.eyeBlinkLeft ?? 0, b);
    final.eyeBlinkRight = Math.max(final.eyeBlinkRight ?? 0, b);
    for (const mesh of this.meshes) {
      const dict = mesh.morphTargetDictionary ?? {};
      const influences = mesh.morphTargetInfluences ?? [];
      for (const [name, idx] of Object.entries(dict)) {
        influences[idx] = clamp(final[name] ?? 0, 0, 1);
      }
    }
    this.pose(dt);
  }

  private eyes(dt: number, final: Weights): void {
    const target = GAZE[this.glance ? this.glance.target : this.gaze];
    this.gazeNow[0] = smooth(this.gazeNow[0], target[0] + this.gazeOffset[0], 18, dt);
    this.gazeNow[1] = smooth(this.gazeNow[1], target[1] + this.gazeOffset[1], 18, dt);
    const yaw = clamp(this.gazeNow[0] * 0.75, -0.45, 0.45);
    const pitch = clamp(this.gazeNow[1] * 0.7, -0.3, 0.35);
    this.setBone('LeftEye', 0, yaw, pitch);
    this.setBone('RightEye', 0, yaw, pitch);
    for (const side of ['Left', 'Right']) {
      final[`eyeLookDown${side}`] = (final[`eyeLookDown${side}`] ?? 0) + Math.max(0, pitch) * 1.4;
      final[`eyeLookUp${side}`] = (final[`eyeLookUp${side}`] ?? 0) + Math.max(0, -pitch) * 1.2;
    }
  }

  private pose(dt: number): void {
    const [hy, hp, hr] = this.headOffsets();
    const [v, a, d] = this.pad;
    const t = this.time;
    const moodPitch = -0.08 * d - 0.03 * a + 0.07 * Math.max(0, -v);
    this.headNow[0] = smooth(this.headNow[0], this.gazeNow[0] * 0.35, 4, dt);
    this.headNow[1] = smooth(this.headNow[1], this.gazeNow[1] * 0.3 + moodPitch, 3, dt);
    this.headNow[2] = smooth(this.headNow[2], 0.04 * d, 2, dt);
    const sway = [
      Math.sin(t * 0.37) * 0.025 + Math.sin(t * 0.91) * 0.01,
      Math.sin(t * 0.53 + 1) * 0.015,
      Math.sin(t * 0.29 + 2) * 0.015,
    ];
    this.setBone(
      'Head',
      this.headNow[1] * 0.6 + hp + sway[1]!,
      this.headNow[0] * 0.6 + hy + sway[0]!,
      this.headNow[2] + hr + sway[2]!,
    );
    this.setBone('Neck', this.headNow[1] * 0.4, this.headNow[0] * 0.4, 0);
    const breath = Math.sin((t * 2 * Math.PI) / (4.2 - 1.2 * this.idle.nervous)) * 0.012;
    this.setBone('Spine2', -breath + 0.03 * Math.max(0, -d), 0, 0);
    this.setBone('LeftShoulder', 0, 0, breath * 0.6);
    this.setBone('RightShoulder', 0, 0, -breath * 0.6);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
