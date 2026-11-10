import * as THREE from 'three';

type Shader = THREE.WebGLProgramParametersWithUniforms;

export interface SkinTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  wrinkles: [THREE.Texture, THREE.Texture, THREE.Texture];
}

export interface WrinkleLayout {
  masks: THREE.DataArrayTexture;
  count: number;
  weights: THREE.Vector3[];
  lids: THREE.Vector2;
  eye: THREE.Vector2;
}

const SKIN_PARS = `
attribute vec4 skinIndex1;
attribute vec4 skinWeight1;
attribute vec4 skinIndex2;
attribute vec4 skinWeight2;
`;

const SKIN_BASE = `
#include <skinbase_vertex>
mat4 bm4 = getBoneMatrix( skinIndex1.x ); mat4 bm5 = getBoneMatrix( skinIndex1.y );
mat4 bm6 = getBoneMatrix( skinIndex1.z ); mat4 bm7 = getBoneMatrix( skinIndex1.w );
mat4 bm8 = getBoneMatrix( skinIndex2.x ); mat4 bm9 = getBoneMatrix( skinIndex2.y );
mat4 bm10 = getBoneMatrix( skinIndex2.z ); mat4 bm11 = getBoneMatrix( skinIndex2.w );
`;

const SKIN_NORMAL = `
mat4 skinMatrix = mat4( 0.0 );
skinMatrix += skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW;
skinMatrix += skinWeight1.x * bm4 + skinWeight1.y * bm5 + skinWeight1.z * bm6 + skinWeight1.w * bm7;
skinMatrix += skinWeight2.x * bm8 + skinWeight2.y * bm9 + skinWeight2.z * bm10 + skinWeight2.w * bm11;
skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
`;

const SKIN_VERTEX = `
transformed = ( skinMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

export function skin12(shader: Shader): void {
  shader.vertexShader = (SKIN_PARS + shader.vertexShader)
    .replace('#include <skinbase_vertex>', SKIN_BASE)
    .replace('#include <skinnormal_vertex>', SKIN_NORMAL)
    .replace('#include <skinning_vertex>', SKIN_VERTEX);
}

export function plain(options: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial(options);
  material.onBeforeCompile = skin12;
  return material;
}

const wrinklePars = ({ count }: WrinkleLayout) => `
varying vec3 vRest;
varying vec3 vRestN;
uniform highp sampler2DArray uMasks;
uniform sampler2D uWm1; uniform sampler2D uWm2; uniform sampler2D uWm3;
uniform vec3 uWm[${count}];
uniform vec2 uLids;
uniform vec2 uEye;
vec3 wmA;
void wrinkleWeights(vec2 uv) {
  wmA = vec3(0.0);
  for (int i = 0; i < ${count}; i++) wmA += texture(uMasks, vec3(uv, float(i))).r * uWm[i];
  wmA = clamp(wmA, 0.0, 1.0);
}
float lidFold() {
  vec2 d = vec2(abs(vRest.x) - uEye.x, vRest.y - uEye.y);
  float near = 1.0 - smoothstep(2.0, 2.6, length(vec2(d.x, d.y * 1.6)));
  float above = smoothstep(0.0, 0.3, d.y);
  float down = smoothstep(-0.05, -0.35, normalize(vRestN).y);
  return near * above * down * smoothstep(0.0, 0.5, vRest.x > 0.0 ? uLids.x : uLids.y);
}
`;

const SKIN_COLOR = `wrinkleWeights(vMapUv);
vec3 c = texture2D(map, vMapUv).rgb;
vec2 nbm = texture2D(normalMap, vMapUv).xy;
float crease = wmA.x * length(texture2D(uWm1, vMapUv).xy - nbm) + wmA.y * length(texture2D(uWm2, vMapUv).xy - nbm);
c *= 1.0 - clamp(crease * 3.5, 0.0, 0.4) * smoothstep(147.0, 151.0, vRest.y);
diffuseColor *= vec4(c, 1.0);
float inMouth = (1.0 - smoothstep(2.4, 3.2, abs(vRest.x))) * smoothstep(139.0, 140.0, vRest.y) * (1.0 - smoothstep(144.4, 145.2, vRest.y));
float inward = 1.0 - smoothstep(0.15, 0.55, vRestN.z);
float deep = 1.0 - smoothstep(8.5, 11.0, vRest.z);
diffuseColor.rgb *= 1.0 - 0.8 * inMouth * inward * (0.4 + 0.6 * deep);`;

const SKIN_NORMAL_MAP = `vec3 nb = texture2D( normalMap, vNormalMapUv ).xyz;
vec3 nn = nb + 4.0 * (wmA.x * (texture2D(uWm1, vNormalMapUv).xyz - nb) + wmA.y * (texture2D(uWm2, vNormalMapUv).xyz - nb) + wmA.z * (texture2D(uWm3, vNormalMapUv).xyz - nb));
vec3 mapN = normalize(nn * 2.0 - 1.0);`;

const LID = `#include <normal_fragment_maps>
vec3 lidUp = normalize(vec3(0.0, 0.35, 1.0));
vec3 lidMix = mix(normal, lidUp, lidFold() * 0.85);
normal = dot(lidMix, lidUp) > 0.05 ? normalize(lidMix) : lidUp;`;

function wrinkleShader(shader: Shader, textures: SkinTextures, layout: WrinkleLayout): void {
  skin12(shader);
  shader.vertexShader =
    'varying vec3 vRest;\nvarying vec3 vRestN;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvRest = position; vRestN = normal;',
    );
  const [wm1, wm2, wm3] = textures.wrinkles;
  Object.assign(shader.uniforms, {
    uWm: { value: layout.weights },
    uLids: { value: layout.lids },
    uEye: { value: layout.eye },
    uMasks: { value: layout.masks },
    uWm1: { value: wm1 },
    uWm2: { value: wm2 },
    uWm3: { value: wm3 },
  });
  shader.fragmentShader = (wrinklePars(layout) + shader.fragmentShader)
    .replace('#include <map_fragment>', SKIN_COLOR)
    .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', SKIN_NORMAL_MAP)
    .replace('#include <normal_fragment_maps>', LID)
    .replace(
      'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );',
      'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv ).rrrr;',
    );
}

export function skinMaterial(textures: SkinTextures, layout: WrinkleLayout): THREE.Material {
  const material = new THREE.MeshPhysicalMaterial({
    map: textures.color,
    normalMap: textures.normal,
    roughnessMap: textures.roughness,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xff8a6a),
  });
  material.onBeforeCompile = (shader) => wrinkleShader(shader, textures, layout);
  return material;
}

export function mouthMaterial(map: THREE.Texture, normalMap: THREE.Texture): THREE.Material {
  const material = new THREE.MeshPhysicalMaterial({ map, normalMap, roughness: 0.45 });
  material.onBeforeCompile = (shader) => {
    skin12(shader);
    shader.vertexShader =
      'varying float vDepth;\nvarying float vSide;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvDepth = position.z - (10.2 - 0.33 * position.x * position.x);\nvSide = abs(position.x);',
      );
    shader.fragmentShader =
      'varying float vDepth;\nvarying float vSide;\n' +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat mouthShade = mix(0.08, 1.0, smoothstep(-1.6, -0.4, vDepth)) * (1.0 - 0.6 * smoothstep(0.9, 2.0, vSide));',
        )
        .replace(
          '#include <opaque_fragment>',
          'outgoingLight *= mouthShade;\n#include <opaque_fragment>',
        );
  };
  return material;
}

export function wrinkleWeights(
  maps: readonly string[],
  masks: readonly string[],
  values: Float32Array,
  out: THREE.Vector3[],
): void {
  out.forEach((v) => v.set(0, 0, 0));
  maps.forEach((full, i) => {
    const [texture, mask] = full.split('.') as [string, string];
    if (!texture.includes('_wm')) return;
    const target = out[masks.indexOf(mask)];
    const k = Number(/wm(\d)/.exec(texture)?.[1] ?? 1) - 1;
    if (target && k < 3) target.setComponent(k, target.getComponent(k) + values[i]!);
  });
}
