// World effects: short-lived particle bursts that give a milestone or a good moment a physical
// presence in the room instead of leaving it to a banner. One additive Points cloud, one small
// procedural sprite atlas, no external assets and no per-frame allocation.
import * as THREE from 'three';

const MAX = 320;

// A soft radial dot and a heart, drawn once into a 2x1 atlas and reused by every particle.
function spriteAtlas() {
  const s = 64, c = document.createElement('canvas');
  c.width = s * 2; c.height = s;
  const x = c.getContext('2d');

  const g = x.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);

  x.save();
  x.translate(s * 1.5, s * 0.54); x.scale(s / 32, s / 32);
  x.fillStyle = '#fff'; x.beginPath();
  x.moveTo(0, 8);
  x.bezierCurveTo(-12, -1, -8, -12, 0, -6);
  x.bezierCurveTo(8, -12, 12, -1, 0, 8);
  x.closePath(); x.fill();
  x.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CONFETTI = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xf7f3e8, 0xffa8c5];
const HEARTS = [0xff6b8b, 0xff97b0, 0xffc2d1];
const SPARKS = [0xfff2c4, 0xffe08a, 0xffffff];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.count = 0;
    // Ring buffer of live particles; index i in the buffer maps to attribute index i.
    this.p = Array.from({ length: MAX }, () => ({ life: 0, ttl: 1, vx: 0, vy: 0, vz: 0, spin: 0, drag: 0.98, gravity: -1.6 }));

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.uvo = new Float32Array(MAX); // 0 = dot, 0.5 = heart (u offset into the atlas)
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aUvOffset', new THREE.BufferAttribute(this.uvo, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: spriteAtlas() }, uScale: { value: 340 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aUvOffset; attribute float aAlpha;
        varying vec3 vColor; varying float vUvOffset; varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor; vUvOffset = aUvOffset; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec3 vColor; varying float vUvOffset; varying float vAlpha;
        void main() {
          vec2 uv = vec2(gl_PointCoord.x * 0.5 + vUvOffset, 1.0 - gl_PointCoord.y);
          vec4 tex = texture2D(uAtlas, uv);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.geo = geo;
    this.tmp = new THREE.Color();
  }

  // Emit `n` particles from `origin` (a THREE.Vector3), oldest particles recycled first.
  emit(kind, origin, n = 40) {
    if (!origin) return;
    const palette = kind === 'hearts' ? HEARTS : kind === 'sparkle' ? SPARKS : CONFETTI;
    const heart = kind === 'hearts';
    for (let k = 0; k < n; k++) {
      const i = this.count % MAX;
      this.count++;
      const p = this.p[i];
      p.life = 0;
      p.ttl = heart ? 2.4 + Math.random() * 1.1 : 1.5 + Math.random() * 1.2;
      p.gravity = heart ? 0.55 : -2.6;          // hearts drift up, confetti falls
      p.drag = heart ? 0.965 : 0.985;
      const a = Math.random() * Math.PI * 2;
      const speed = heart ? 0.5 + Math.random() * 0.5 : 1.4 + Math.random() * 1.5;
      const up = heart ? 0.5 + Math.random() * 0.6 : 1.5 + Math.random() * 1.4;
      p.vx = Math.cos(a) * speed; p.vz = Math.sin(a) * speed; p.vy = up;
      const o = i * 3;
      this.pos[o] = origin.x + (Math.random() - 0.5) * 0.14;
      this.pos[o + 1] = origin.y + (Math.random() - 0.5) * 0.1;
      this.pos[o + 2] = origin.z + (Math.random() - 0.5) * 0.14;
      this.tmp.setHex(palette[(Math.random() * palette.length) | 0]);
      this.col[o] = this.tmp.r; this.col[o + 1] = this.tmp.g; this.col[o + 2] = this.tmp.b;
      this.size[i] = heart ? 0.055 + Math.random() * 0.035 : 0.03 + Math.random() * 0.03;
      this.uvo[i] = heart ? 0.5 : 0;
      this.alpha[i] = 1;
    }
    this.geo.setDrawRange(0, MAX);
    this.dirty();
  }

  dirty() {
    for (const name of ['position', 'aColor', 'aSize', 'aUvOffset', 'aAlpha']) this.geo.getAttribute(name).needsUpdate = true;
  }

  update(dt) {
    if (!this.count) return;
    const d = Math.min(0.05, dt);
    let live = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life >= p.ttl) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      p.life += d;
      live = true;
      p.vy += p.gravity * d;
      p.vx *= p.drag; p.vy *= p.drag; p.vz *= p.drag;
      const o = i * 3;
      this.pos[o] += p.vx * d; this.pos[o + 1] += p.vy * d; this.pos[o + 2] += p.vz * d;
      if (this.pos[o + 1] < 0.02) { this.pos[o + 1] = 0.02; p.vy = Math.abs(p.vy) * 0.25; p.vx *= 0.7; p.vz *= 0.7; }
      const k = p.life / p.ttl;
      this.alpha[i] = k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.55) / 0.45);
    }
    this.dirty();
    if (!live) { this.count = 0; this.geo.setDrawRange(0, 0); }
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.uniforms.uAtlas.value.dispose();
    this.points.material.dispose();
  }
}
