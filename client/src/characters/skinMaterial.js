// Baby skin: MeshPhysicalMaterial extended with wrapped diffuse, subsurface scattering approximation,
// procedural blush/redness zones (cheeks, knees, palms), micro-detail normals and a soft peach-fuzz sheen.
import * as THREE from 'three';
import { skinDetailTexture } from '../engine/textures.js';

export function makeSkinMaterial({ skinTone = '#f0c9ae', sss = 0.55, blush = 0.35 } = {}) {
  const base = new THREE.Color(skinTone);
  const mat = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.45,
    sheenRoughness: 0.85,
    sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.6),
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
    normalMap: skinDetailTexture(),
    normalScale: new THREE.Vector2(0.18, 0.18),
    envMapIntensity: 0.6,
  });
  mat.userData.uniforms = {
    uSSS: { value: sss },
    uSSSColor: { value: new THREE.Color(0xff5a3c) },
    uBlush: { value: blush },
    uBlushColor: { value: new THREE.Color(0xe8746a) },
    uTime: { value: 0 },
    uHeadY: { value: 0.5 }, // in local model space: height of eyes to place cheeks
    uSick: { value: 0 }, // 0..1 pallor / yellow tint (jaundice) blend
    uJaundice: { value: 0 },
    uFlush: { value: 0 }, // crying flush 0..1
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocalPos;
uniform float uSSS; uniform vec3 uSSSColor; uniform float uBlush; uniform vec3 uBlushColor; uniform float uTime; uniform float uHeadY; uniform float uSick; uniform float uJaundice; uniform float uFlush;
float gauss(float d, float s){ return exp(-d*d/(2.0*s*s)); }`)
      // color variation before lighting
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vLocalPos;
  // cheeks: two blobs either side of the face, slightly below eye line, front-facing
  float cheekL = gauss(length(p - vec3(-0.075, uHeadY - 0.045, 0.085)), 0.045);
  float cheekR = gauss(length(p - vec3( 0.075, uHeadY - 0.045, 0.085)), 0.045);
  float nose = gauss(length(p - vec3(0.0, uHeadY - 0.02, 0.12)), 0.02) * 0.6;
  float chin = gauss(length(p - vec3(0.0, uHeadY - 0.11, 0.09)), 0.03) * 0.4;
  float lowBody = smoothstep(0.55, 0.0, p.y) * 0.18; // knees/feet a little pinker
  float redness = (cheekL + cheekR) * (uBlush + uFlush * 0.9) + nose * (0.4 + uFlush) + chin * 0.3 + lowBody;
  redness = clamp(redness, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBlushColor, redness * 0.55);
  // creases are darker/warmer: use normal facing away from body axis as proxy is expensive; keep subtle noise via time-free hash
  float pale = uSick;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.82) * diffuseColor.rgb + 0.08, pale * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.98, 0.72), uJaundice);
}`)
      // wrapped diffuse + backlight scattering term
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
{
  // everything in view space, like three.js' own lighting
  vec3 n = normalize(normal);
  vec3 v = normalize(vViewPosition);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  // approximate subsurface: light wrapping + rim scatter tinted red
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 l = directionalLights[i].direction;
    float wrap = clamp((dot(n, l) + 0.55) / 1.55, 0.0, 1.0);
    float back = pow(clamp(dot(v, -l + n * 0.3), 0.0, 1.0), 2.5);
    reflectedLight.directDiffuse += directionalLights[i].color * uSSSColor * (wrap * 0.06 + back * 0.12 + fres * 0.05) * uSSS * diffuseColor.rgb;
  }
  #endif
  #if NUM_POINT_LIGHTS > 0
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    vec3 lv = pointLights[i].position + vViewPosition;
    float dist = length(lv);
    vec3 l = lv / dist;
    float att = 1.0 / (1.0 + dist * dist * 0.25);
    float wrap = clamp((dot(n, l) + 0.55) / 1.55, 0.0, 1.0);
    reflectedLight.directDiffuse += pointLights[i].color * uSSSColor * wrap * 0.05 * att * uSSS * diffuseColor.rgb;
  }
  #endif
  reflectedLight.indirectDiffuse += uSSSColor * fres * 0.06 * uSSS * diffuseColor.rgb;
}`);
  };
  mat.customProgramCacheKey = () => 'cradle-skin-v1';
  return mat;
}

export function setSkinState(mat, { sick = 0, jaundice = 0, flush = 0, headY } = {}) {
  const u = mat.userData.uniforms; if (!u) return;
  u.uSick.value += (sick - u.uSick.value) * 0.05;
  u.uJaundice.value += (jaundice - u.uJaundice.value) * 0.05;
  u.uFlush.value += (flush - u.uFlush.value) * 0.08;
  if (headY != null) u.uHeadY.value = headY;
}
