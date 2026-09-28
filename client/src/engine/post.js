// Post-processing: ambient occlusion and anti-aliasing.
//
// This is what turns a room of well-lit primitives into a room of objects that have weight. Direct
// lights alone cannot darken the millimetre of contact where a leg meets the floor or where a chin
// folds into a neck; GTAO computes that occlusion from depth and normals, and it is the single
// largest step towards "these things are actually touching each other".
//
// Everything degrades gracefully: if the pipeline cannot be built (no float render targets, an old
// mobile driver), the caller falls back to a plain forward render and the game plays identically.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Tuned for a domestic interior in metres: occlusion that reads at the scale of a chin, a nappy
// crease and a sofa cushion, not at the scale of the whole room.
const AO_NEAR = {
  radius: 0.16,          // metres of influence — a baby's features live at this scale
  distanceExponent: 1.6,
  thickness: 0.45,
  scale: 1.0,
  samples: 12,
  distanceFallOff: 1.0,
  screenSpaceRadius: false,
};
const AO_MOBILE = { ...AO_NEAR, samples: 6, radius: 0.2 };
// AO is low-frequency and gets denoised anyway, so it is computed at half resolution and upsampled.
// GTAOPass renders its own depth and normals, so this costs nothing but fill rate.
const AO_SCALE = 0.5;

// Software rasterisers (SwiftShader, llvmpipe, Mesa's software path) are one to two orders of
// magnitude slower than a GPU at the fill-heavy work post-processing does. A composited frame there
// costs seconds, not milliseconds, so the whole chain is skipped rather than made unplayable.
export function isSoftwareRenderer(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name);
  } catch { return false; }
}

export class PostFX {
  constructor(renderer, scene, camera, { mobile = false, quality = 'high' } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.mobile = mobile;
    this.enabled = false;
    this.quality = quality;
    if (isSoftwareRenderer(renderer)) { console.warn('[post] software renderer — post-processing off'); return; }
    try { this.build(); this.enabled = true; } catch (e) { console.warn('[post] falling back to forward rendering:', e.message); this.dispose(); }
  }

  build() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    // Half-float keeps the tone mapper working on HDR values instead of clipping them to 0..1
    // before OutputPass ever sees them.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,                     // SMAA does the anti-aliasing; MSAA on top is pure cost
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    const composer = new EffectComposer(r, target);
    composer.setPixelRatio(r.getPixelRatio());
    composer.setSize(size.x / r.getPixelRatio(), size.y / r.getPixelRatio());

    composer.addPass(new RenderPass(this.scene, this.camera));

    // GTAO runs before tone mapping so the occlusion darkens scene-referred light, the way a real
    // cavity does, rather than darkening an already-graded image.
    const ao = new GTAOPass(this.scene, this.camera, Math.round(size.x * AO_SCALE), Math.round(size.y * AO_SCALE));
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = this.mobile ? 0.8 : 1.0;
    ao.updateGtaoMaterial(this.mobile ? AO_MOBILE : AO_NEAR);
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: this.mobile ? 6 : 12 });
    composer.addPass(ao);
    this.ao = ao;

    // Tone map + convert to sRGB once, at the end, on the composited HDR image.
    composer.addPass(new OutputPass());

    // SMAA reconstructs the edges MSAA cannot (alpha-tested hair, the marching-cubes silhouette).
    if (!this.mobile) {
      const smaa = new SMAAPass(size.x, size.y);
      composer.addPass(smaa);
      this.smaa = smaa;
    }

    this.composer = composer;
    this.target = target;
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setSize(w, h);
    const px = this.renderer.getPixelRatio();
    this.ao?.setSize(Math.round(w * px * AO_SCALE), Math.round(h * px * AO_SCALE));
    this.smaa?.setSize(w * px, h * px);
  }

  // AO is the expensive pass; let the quality control turn it off without tearing the chain down.
  setAO(on) { if (this.ao) this.ao.enabled = !!on; }

  render() {
    if (!this.enabled) return false;
    this.composer.render();
    return true;
  }

  dispose() {
    try { this.composer?.dispose?.(); } catch { /* nothing to clean */ }
    try { this.target?.dispose?.(); } catch { /* nothing to clean */ }
    this.composer = null; this.target = null; this.ao = null; this.smaa = null;
    this.enabled = false;
  }
}
