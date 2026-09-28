// Baby skin: MeshPhysicalMaterial extended with curvature-driven subsurface scattering, procedural
// blush/redness zones (cheeks, knees, palms), two scales of triplanar micro-relief and a peach-fuzz
// sheen.
//
// The body comes out of marching cubes with no UV coordinates, so an ordinary normalMap would sample
// a constant texel and do nothing at all. Both detail maps are therefore sampled triplanar in local
// model space: three projections blended by the surface normal, which needs no unwrap and never
// stretches on a shape that is mostly spheres.
import * as THREE from 'three';
import { skinDetailTexture, skinMicroTexture } from '../engine/textures.js';

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
    envMapIntensity: 0.7,
  });
  mat.userData.uniforms = {
    uSSS: { value: sss },
    uSSSColor: { value: new THREE.Color(0xff5a3c) },
    uBlush: { value: blush },
    uBlushColor: { value: new THREE.Color(0xe8746a) },
    uTime: { value: 0 },
    uHeadY: { value: 0.5 },  // in local model space: height of the eyes, to place the cheeks
    uHeadR: { value: 0.1 },  // head radius in the same space: every facial zone is sized from it
    uSick: { value: 0 }, // 0..1 pallor / yellow tint (jaundice) blend
    uJaundice: { value: 0 },
    uFlush: { value: 0 }, // crying flush 0..1
    uDetail: { value: skinDetailTexture().normalMap || skinDetailTexture().map },
    uMicro: { value: skinMicroTexture().normalMap || skinMicroTexture().map },
    // These are detail normals: they exist to break up a highlight, not to reshape the surface. At
    // the strengths they used to carry they swung the shading normal by tens of degrees, which on a
    // face read as blotchy mauve shading and a red scattering streak along every triplanar seam.
    uDetailScale: { value: 0.22 },  // fold/crease scale
    uMicroScale: { value: 0.12 },   // pore/follicle scale
    uCurvature: { value: 1.0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vLocalNormal;\nvarying mat3 vObjToView;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = transformed;')
      // after <skinnormal_vertex> / <defaultnormal_vertex>, objectNormal is the posed object-space
      // normal; normalMatrix is the object->view rotation the fragment stage otherwise cannot see
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvLocalNormal = normalize(objectNormal);\nvObjToView = normalMatrix;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocalPos;
varying vec3 vLocalNormal;
varying mat3 vObjToView;
uniform float uSSS; uniform vec3 uSSSColor; uniform float uBlush; uniform vec3 uBlushColor; uniform float uTime; uniform float uHeadY; uniform float uSick; uniform float uJaundice; uniform float uFlush;
uniform sampler2D uDetail; uniform sampler2D uMicro; uniform float uDetailScale; uniform float uMicroScale; uniform float uCurvature; uniform float uHeadR;
float gauss(float d, float s){ return exp(-d*d/(2.0*s*s)); }
// Triplanar tangent-space normal, blended into the geometric normal (UDN-style: cheap and stable).
vec3 triplanarNormal(sampler2D tex, vec3 p, vec3 n, float scale, float strength) {
  // A gentler blend exponent. At 4.0 the three projections hand over inside a narrow band, and a
  // strong perturbation turns those bands into visible low-frequency streaks across a curved surface
  // — most obviously down the side of a face, which is the one place they must not show.
  vec3 w = pow(abs(n), vec3(3.0));
  w /= max(1e-4, w.x + w.y + w.z);
  vec3 nx = texture2D(tex, p.zy * scale).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(tex, p.xz * scale).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(tex, p.xy * scale).xyz * 2.0 - 1.0;
  // reorient each projection into object space, then weight
  vec3 t = vec3(0.0);
  t += vec3(0.0, nx.y, nx.x) * w.x * sign(n.x);
  t += vec3(ny.x, 0.0, ny.y) * w.y * sign(n.y);
  t += vec3(nz.x, nz.y, 0.0) * w.z * sign(n.z);
  return normalize(n + t * strength);
}`)
      // color variation before lighting
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vLocalPos;
  // Blush zones are measured in head radii, not metres. Written as absolute distances they were sized
  // for a newborn skull and, on anything bigger, two cheek blobs with a 45 mm sigma overlapped across
  // the entire face and painted it flat salmon — the opposite of blush, which is local by definition.
  float R = max(0.02, uHeadR);
  float cheekL = gauss(length(p - vec3(-0.58 * R, uHeadY - 0.34 * R, 0.72 * R)), 0.26 * R);
  float cheekR = gauss(length(p - vec3( 0.58 * R, uHeadY - 0.34 * R, 0.72 * R)), 0.26 * R);
  float nose = gauss(length(p - vec3(0.0, uHeadY - 0.16 * R, 1.02 * R)), 0.15 * R) * 0.6;
  float chin = gauss(length(p - vec3(0.0, uHeadY - 0.86 * R, 0.72 * R)), 0.2 * R) * 0.4;
  float lowBody = smoothstep(0.55, 0.0, p.y) * 0.18; // knees/feet a little pinker
  float redness = (cheekL + cheekR) * (uBlush + uFlush * 0.9) + nose * (0.4 + uFlush) + chin * 0.3 + lowBody;
  redness = clamp(redness, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBlushColor, redness * 0.42);
  // creases are darker/warmer: use normal facing away from body axis as proxy is expensive; keep subtle noise via time-free hash
  float pale = uSick;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.82) * diffuseColor.rgb + 0.08, pale * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.98, 0.72), uJaundice);
}`)
      // Two scales of relief, sampled triplanar in local space, folded into the shading normal. The
      // coarse pass carves the creases; the fine pass breaks up specular so highlights crawl the way
      // they do on skin instead of sliding like they do on vinyl.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 ln = normalize(vLocalNormal);
  vec3 perturbed = triplanarNormal(uDetail, vLocalPos, ln, 9.0, uDetailScale);
  perturbed = triplanarNormal(uMicro, vLocalPos, perturbed, 42.0, uMicroScale);
  // Carry the perturbation into view space, where three does its lighting. vLocalNormal is the
  // post-skinning object-space normal, so this is the same rotation the mesh itself went through.
  vec3 delta = perturbed - ln;
  normal = normalize(normal + vObjToView * delta);
}`)
      // wrapped diffuse + backlight scattering term
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
{
  // everything in view space, like three.js' own lighting
  vec3 n = normalize(normal);
  vec3 v = normalize(vViewPosition);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  // Screen-space curvature. Light scatters furthest where the surface bends tightest and the flesh
  // is thin — fingertips, ears, the rim of a nostril, the bridge of a nose held against a window.
  // Flat expanses like a back or a thigh scatter far less. Without this the whole body glows evenly,
  // which is the tell-tale look of a wax model.
  // The curvature estimate is a screen-space derivative, so anything that makes the shading normal
  // noisy — a detail map, a coarse mesh, a silhouette — reads as infinite curvature. Cap it well
  // below 1 so a bad estimate can never drive scattering to maximum.
  float curv = clamp(length(fwidth(n)) / max(1e-4, length(fwidth(vViewPosition))) * 0.06, 0.0, 0.75);
  float thin = mix(0.5, 1.15, curv) * uCurvature;
  // approximate subsurface: light wrapping + rim scatter tinted red
  // Scattering has to be shadowed like everything else. three applies each light's shadow inside its
  // own light loop, so a term added afterwards from the raw light colour keeps scattering at full
  // strength through shadow — which painted a solid red patch down the shadowed half of every face.
  // The unrolled-loop pragma is what gives a literal index for the shadow map array, exactly as
  // three's own lighting does it.
  #if NUM_DIR_LIGHTS > 0
  // The unrolled body is spliced in without a scope of its own, so every local here is declared once,
  // outside the loop — the same shape three uses for its own light loops.
  DirectionalLight cradleLight;
  float cradleShadow; vec3 cradleL; float cradleWrap; float cradleBack;
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
    cradleLight = directionalLights[ i ];
    cradleShadow = 1.0;
    #if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
    cradleShadow = receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLightShadows[ i ].shadowMapSize, directionalLightShadows[ i ].shadowIntensity, directionalLightShadows[ i ].shadowBias, directionalLightShadows[ i ].shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
    #endif
    cradleL = cradleLight.direction;
    cradleWrap = clamp((dot(n, cradleL) + 0.55) / 1.55, 0.0, 1.0);
    cradleBack = pow(clamp(dot(v, -cradleL + n * 0.3), 0.0, 1.0), 2.5);
    reflectedLight.directDiffuse += cradleLight.color * cradleShadow * uSSSColor * (cradleWrap * 0.045 + cradleBack * 0.09 * thin + fres * 0.035 * thin) * uSSS * diffuseColor.rgb;
  }
  #pragma unroll_loop_end
  #endif
  #if NUM_POINT_LIGHTS > 0
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    vec3 lv = pointLights[i].position + vViewPosition;
    float dist = length(lv);
    vec3 l = lv / dist;
    float att = 1.0 / (1.0 + dist * dist * 0.25);
    float wrap = clamp((dot(n, l) + 0.55) / 1.55, 0.0, 1.0);
    reflectedLight.directDiffuse += pointLights[i].color * uSSSColor * wrap * 0.05 * att * thin * uSSS * diffuseColor.rgb;
  }
  #endif
  reflectedLight.indirectDiffuse += uSSSColor * fres * 0.04 * thin * uSSS * diffuseColor.rgb;
}`);
  };
  mat.customProgramCacheKey = () => 'cradle-skin-v7';
  return mat;
}

export function setSkinState(mat, { sick = 0, jaundice = 0, flush = 0, headY, headR } = {}) {
  const u = mat.userData.uniforms; if (!u) return;
  u.uSick.value += (sick - u.uSick.value) * 0.05;
  u.uJaundice.value += (jaundice - u.uJaundice.value) * 0.05;
  u.uFlush.value += (flush - u.uFlush.value) * 0.08;
  if (headY != null) u.uHeadY.value = headY;
  if (headR != null) u.uHeadR.value = headR;
}
