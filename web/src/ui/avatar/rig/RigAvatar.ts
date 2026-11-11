import * as THREE from 'three';
import type { FaceRenderer } from '../avatar.ts';
import type { Pose } from '../motion.ts';
import { FOV, addLights, createRenderer, frameBust } from '../stage.ts';
import type { HairKey } from '../hair.ts';
import { hairBase } from '../hair.ts';
import type { HairAssets, MeshSection, RigAssets } from './assets.ts';
import { loadAssets, loadHair } from './assets.ts';
import { NormalTracker, applyBlends, followHead } from './blend.ts';
import type { MeshData } from './geometry.ts';
import { meshGeometry } from './geometry.ts';
import { wearGlasses } from './glasses.ts';
import { shineEyes } from './eyes.ts';
import type { Materials } from './materials.ts';
import { CARDS_SOFT_ORDER, loadMaterials, renderOrderOf } from './materials.ts';
import { createRig } from './riglogic.ts';
import { RigState } from './rigState.ts';
import type { WrinkleLayout } from './skin.ts';
import { wrinkleWeights } from './skin.ts';

const WASM_URL = new URL('./riglogic.wasm', import.meta.url);
const EXPOSURE = 1.45;

interface LiveMesh {
  data: MeshData;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  normals: NormalTracker | null;
}

function maskTexture({ header, masks }: RigAssets): THREE.DataArrayTexture {
  const size = header.maskSize;
  const texture = new THREE.DataArrayTexture(masks, size, size, header.masks.length);
  texture.format = THREE.RedFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

interface Placed {
  bin: ArrayBuffer;
  section: MeshSection;
}

const sectionsOf = ({ bin, header }: RigAssets, hair: HairAssets): Placed[] => [
  ...header.meshes.map((section) => ({ bin, section })),
  { bin: hair.bin, section: hair.mesh },
];

function eyeCenter(state: RigState): THREE.Vector2 {
  state.root.updateMatrixWorld(true);
  const eye = state.root.worldToLocal(
    state.bone('FACIAL_L_Eye')!.getWorldPosition(new THREE.Vector3()),
  );
  return new THREE.Vector2(Math.abs(eye.x), eye.y);
}

export class RigAvatar implements FaceRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly base: string;
  private readonly hair: HairKey;
  private readonly renderer = createRenderer(EXPOSURE);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  private state: RigState | null = null;
  private assets: RigAssets | null = null;
  private layout: WrinkleLayout | null = null;
  private live: LiveMesh[] = [];
  private head: LiveMesh | null = null;
  private eye: THREE.MeshPhysicalMaterial | null = null;

  constructor(base: string, hair: HairKey) {
    this.base = base;
    this.hair = hair;
    this.canvas = this.renderer.domElement;
    addLights(this.scene);
    const fill = new THREE.DirectionalLight(0xfff4ea, 1.3);
    fill.position.set(0.2, 1.7, 2.5);
    this.scene.add(fill, new THREE.AmbientLight(0xffffff, 0.35));
  }

  async load(): Promise<void> {
    const [assets, hair, wasm] = await Promise.all([
      loadAssets(this.base),
      loadHair(hairBase(this.base, this.hair)),
      fetch(WASM_URL).then((r) => r.arrayBuffer()),
    ]);
    const state = new RigState(assets, await createRig(wasm, assets.dna));
    const { masks, maps } = assets.header;
    const weights = masks.map(() => new THREE.Vector3());
    this.layout = {
      masks: maskTexture(assets),
      count: masks.length,
      weights,
      lids: new THREE.Vector2(),
      eye: eyeCenter(state),
    };
    const materials = await loadMaterials(this.base, hairBase('', this.hair), this.layout, [
      ...assets.header.meshes.map((m) => m.name),
      hair.mesh.name,
    ]);
    this.assets = assets;
    this.state = state;
    this.scene.add(state.root);
    this.buildMeshes(sectionsOf(assets, hair), state, materials);
    this.eye = materials.eye;
    wrinkleWeights(maps, masks, state.update(this.restPose()).maps, weights);
    await this.dress(state);
    await this.compile();
  }

  private async compile(): Promise<void> {
    let failed = false;
    this.renderer.debug.onShaderError = () => {
      failed = true;
    };
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderer.debug.onShaderError = null;
    if (failed) throw new Error('her shaders did not compile');
  }

  private restPose(): Pose {
    return {
      weights: {},
      eyes: [0, 0],
      head: [0, 0, 0],
      neck: [0, 0, 0],
      spine: [0, 0, 0],
      shoulder: 0,
      shine: 1,
    };
  }

  private buildMeshes(sections: Placed[], state: RigState, materials: Materials): void {
    const skeleton = new THREE.Skeleton(state.bones);
    state.root.updateMatrixWorld(true);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number) => {
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      state.root.add(mesh);
      mesh.bind(skeleton);
      return mesh;
    };
    for (const { bin, section } of sections) {
      const material = materials.byMesh[section.name];
      if (!material) continue;
      const data = meshGeometry(bin, section);
      add(data.geometry, material, renderOrderOf(section.name));
      if (section.name === 'cards') add(data.geometry, materials.cardsSoft, CARDS_SOFT_ORDER);
      this.track(section.name, data);
    }
  }

  private track(name: string, data: MeshData): void {
    if (!data.targets.length && !data.follow) return;
    const attribute = data.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals =
      name === 'head'
        ? new NormalTracker(
            data.geometry.getAttribute('normal').array as Float32Array,
            data.base,
            data.geometry.index!.array,
          )
        : null;
    const entry = { data, positions: attribute.array as Float32Array, attribute, normals };
    if (name === 'head') this.head = entry;
    this.live.push(entry);
  }

  private async dress(state: RigState): Promise<void> {
    const world = (name: string) => state.bone(name)!.getWorldPosition(new THREE.Vector3());
    state.root.updateMatrixWorld(true);
    frameBust(this.camera, world('head'));
    const eyes = [world('FACIAL_L_Eye'), world('FACIAL_R_Eye')] as const;
    await wearGlasses(`${this.base}glasses/glasses.gltf`, this.scene, eyes, state.bone('head')!);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(pose: Pose): void {
    if (this.state && this.assets && this.layout) {
      const frame = this.state.update(pose);
      this.deform(frame.blends);
      this.layout.lids.set(...frame.lids);
      if (this.eye) shineEyes(this.eye, pose.shine);
      wrinkleWeights(
        this.assets.header.maps,
        this.assets.header.masks,
        frame.maps,
        this.layout.weights,
      );
    }
    this.renderer.render(this.scene, this.camera);
  }

  private deform(blends: Float32Array): void {
    const head = this.head;
    for (const m of this.live) {
      if (m.data.follow && head) {
        followHead(
          { now: head.positions, base: head.data.base },
          m.data.follow,
          m.data.base,
          m.positions,
        );
      } else {
        applyBlends(m.data.base, m.data.targets, blends, m.positions);
      }
      m.attribute.needsUpdate = true;
      if (m.normals) {
        const normal = m.data.geometry.getAttribute('normal') as THREE.BufferAttribute;
        m.normals.update(m.positions, normal.array as Float32Array);
        normal.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
