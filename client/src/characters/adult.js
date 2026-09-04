// Adult NPCs: the visitors the social layer has always been sending round, finally standing in the
// living room. Same pipeline as the baby — a metaball field polygonised with marching cubes, Taubin
// smoothed, skinned to a skeleton — but with adult proportions, real clothing volumes over the body
// rather than a flat colour, and an idle that never quite stands still.
import * as THREE from 'three';
import { polygonise, skinGeometry, makeBones, HeadSurface, clipGeometry, handBalls, footBalls } from './babyMesh.js';
import { makeSkinMaterial } from './skinMaterial.js';
import { irisTexture, hairMaterial } from './babyFace.js';
import { fabricTexture, clothMaterial, skinMicroTexture } from '../engine/textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Adult proportions in metres. `build` 0..1 goes slight -> heavy, `h` is standing height.
export function adultProportions({ h = 1.68, build = 0.5, female = true } = {}) {
  const u = h / 1.68;
  const b = 0.85 + build * 0.5;
  return {
    headR: 0.093 * u, neck: 0.055 * u, neckR: 0.052 * u * b,
    torsoLen: 0.52 * u, shoulderW: (female ? 0.175 : 0.205) * u,
    chestR: (female ? 0.115 : 0.128) * u * b, waistR: (female ? 0.098 : 0.112) * u * b,
    hipR: (female ? 0.128 : 0.115) * u * b,
    upperArm: 0.30 * u, foreArm: 0.26 * u, armR: 0.042 * u * b,
    thigh: 0.42 * u, shin: 0.40 * u, legR: 0.072 * u * b,
    handR: 0.045 * u, footL: 0.13 * u, footR: 0.038 * u,
    bust: female ? 0.055 * u * b : 0,
  };
}

export function adultLayout(opts = {}) {
  const P = adultProportions(opts);
  const hipY = P.thigh + P.shin + P.footR;
  const neckY = hipY + P.torsoLen;
  const headBase = neckY + P.neck;
  const J = {};
  J.hips = V(0, hipY, 0);
  J.spine = V(0, hipY + P.torsoLen * 0.34, 0);
  J.chest = V(0, hipY + P.torsoLen * 0.7, 0);
  J.neck = V(0, neckY, 0);
  J.head = V(0, headBase, 0);
  J.headTop = V(0, headBase + P.headR * 1.9, 0);
  for (const [s, sx] of [['L', -1], ['R', 1]]) {
    const shY = hipY + P.torsoLen * 0.94;
    J['shoulder' + s] = V(sx * P.shoulderW, shY, 0);
    J['elbow' + s] = V(sx * (P.shoulderW + P.upperArm), shY, 0);
    J['wrist' + s] = V(sx * (P.shoulderW + P.upperArm + P.foreArm), shY, 0);
    J['handTip' + s] = V(sx * (P.shoulderW + P.upperArm + P.foreArm + P.handR * 1.7), shY, 0);
    J['hip' + s] = V(sx * P.hipR * 0.55, hipY, 0);
    J['knee' + s] = V(sx * P.hipR * 0.55, hipY - P.thigh, 0);
    J['ankle' + s] = V(sx * P.hipR * 0.55, hipY - P.thigh - P.shin, 0);
    J['toe' + s] = V(sx * P.hipR * 0.55, hipY - P.thigh - P.shin - P.footR * 0.55, P.footL);
  }
  const bones = [
    ['hips', 'hips', 'spine', null], ['spine', 'spine', 'chest', 'hips'], ['chest', 'chest', 'neck', 'spine'],
    ['neck', 'neck', 'head', 'chest'], ['head', 'head', 'headTop', 'neck'],
    ['upperArmL', 'shoulderL', 'elbowL', 'chest'], ['foreArmL', 'elbowL', 'wristL', 'upperArmL'], ['handL', 'wristL', 'handTipL', 'foreArmL'],
    ['upperArmR', 'shoulderR', 'elbowR', 'chest'], ['foreArmR', 'elbowR', 'wristR', 'upperArmR'], ['handR', 'wristR', 'handTipR', 'foreArmR'],
    ['thighL', 'hipL', 'kneeL', 'hips'], ['shinL', 'kneeL', 'ankleL', 'thighL'], ['footL', 'ankleL', 'toeL', 'shinL'],
    ['thighR', 'hipR', 'kneeR', 'hips'], ['shinR', 'kneeR', 'ankleR', 'thighR'], ['footR', 'ankleR', 'toeR', 'shinR'],
  ];
  // The segment sums only approximate the requested stature, so normalise: scale every joint and
  // every radius by the ratio, and the NPC is exactly as tall as it was asked to be.
  const raw = J.headTop.y;
  const k = (opts.h || 1.68) / raw;
  if (Math.abs(k - 1) > 1e-4) {
    for (const key of Object.keys(J)) J[key].multiplyScalar(k);
    for (const key of Object.keys(P)) P[key] *= k;
  }
  return { J, bones, P, totalH: J.headTop.y, hipY: J.hips.y, headCenter: V(0, J.head.y + P.headR * 0.9, 0) };
}

// Flesh volumes. A torso is not a cylinder: it tapers from ribcage to waist and flares again at the
// hips, and that S is most of what makes a silhouette read as a person rather than a mannequin.
function adultBalls(L, female) {
  const { J, P } = L, B = [];
  const ball = (p, r, s = 1) => B.push([p.x, p.y, p.z, r, s]);
  const seg = (a, b, r0, r1, n, s = 1) => { for (let i = 0; i <= n; i++) { const t = i / n; B.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(r0, r1, t), s]); } };
  const hc = L.headCenter;

  // skull: cranium, occiput, brow ridge, jaw, chin, nose
  ball(hc, P.headR, 1.0);
  ball(V(0, hc.y + P.headR * 0.06, -P.headR * 0.42), P.headR * 0.82, 0.9);
  ball(V(0, hc.y + P.headR * 0.42, P.headR * 0.2), P.headR * 0.56, 0.55);
  ball(V(0, hc.y - P.headR * 0.55, P.headR * 0.16), P.headR * 0.58, 0.75);   // jaw
  ball(V(0, hc.y - P.headR * 0.78, P.headR * 0.3), P.headR * 0.3, 0.5);      // chin
  // nose: bridge, tip, nostril wings — and carved nostrils and a philtrum below
  ball(V(0, hc.y + P.headR * 0.1, P.headR * 0.66), P.headR * 0.085, 0.3);
  ball(V(0, hc.y - P.headR * 0.12, P.headR * 0.8), P.headR * 0.115, 0.42);
  for (const sx of [-1, 1]) ball(V(sx * P.headR * 0.09, hc.y - P.headR * 0.17, P.headR * 0.75), P.headR * 0.06, 0.3);
  for (const sx of [-1, 1]) ball(V(sx * P.headR * 0.06, hc.y - P.headR * 0.21, P.headR * 0.78), P.headR * 0.035, -0.28);
  ball(V(0, hc.y - P.headR * 0.3, P.headR * 0.78), P.headR * 0.04, -0.12);
  for (const sx of [-1, 1]) ball(V(sx * P.headR * 0.34, hc.y + P.headR * 0.03, P.headR * 0.82), P.headR * 0.16, -0.3);  // eye sockets
  for (const sx of [-1, 1]) ball(V(sx * P.headR * 0.5, hc.y - P.headR * 0.2, P.headR * 0.45), P.headR * 0.3, 0.4); // cheekbones

  // neck into shoulders (trapezius)
  seg(J.neck.clone().setY(J.neck.y - 0.01), V(0, hc.y - P.headR * 0.72, 0), P.neckR, P.neckR * 0.9, 3, 0.95);
  for (const sx of [-1, 1]) ball(V(sx * P.shoulderW * 0.55, J.neck.y - 0.03, -0.01), P.chestR * 0.55, 0.7);

  // torso: chest -> waist -> hips
  seg(J.chest, J.spine, P.chestR, P.waistR, 4, 1);
  seg(J.spine, J.hips, P.waistR, P.hipR, 4, 1);
  ball(V(0, J.hips.y - P.hipR * 0.25, -P.hipR * 0.22), P.hipR * 0.85, 0.85); // seat
  ball(V(0, J.spine.y + P.torsoLen * 0.06, P.waistR * 0.35), P.waistR * 0.7, 0.5); // belly
  if (female) for (const sx of [-1, 1]) ball(V(sx * P.chestR * 0.48, J.chest.y - P.torsoLen * 0.08, P.chestR * 0.62), P.bust, 0.8);

  // deltoids and arms — tapering, with a wrist that is narrower than a forearm
  for (const [s, sx] of [['L', -1], ['R', 1]]) {
    ball(J['shoulder' + s], P.armR * 1.5, 0.9);
    seg(J['shoulder' + s], J['elbow' + s], P.armR * 1.35, P.armR * 0.98, 5);
    seg(J['elbow' + s], J['wrist' + s], P.armR * 1.05, P.armR * 0.66, 5);
    // a real hand at adult scale, palm forward in the T-pose
    handBalls(B, J['wrist' + s], J['handTip' + s], sx, V(0, 0, -1), P.handR / 0.045);

    // legs: thigh mass, knee, calf belly high on the shin, narrow ankle
    ball(J['hip' + s], P.legR * 1.2, 0.9);
    seg(J['hip' + s], J['knee' + s], P.legR * 1.25, P.legR * 0.82, 5);
    ball(J['knee' + s], P.legR * 0.8, 0.8);
    const ank = J['ankle' + s];
    ball(V(J['knee' + s].x, lerp(J['knee' + s].y, ank.y, 0.32), -P.legR * 0.28), P.legR * 0.86, 0.75); // calf
    seg(J['knee' + s], ank, P.legR * 0.8, P.legR * 0.42, 5);
    footBalls(B, ank, J['toe' + s], sx, V(0, 1, 0), P.footR / 0.03);
  }
  return B;
}

const CLOTH_PALETTE = ['#4a5c78', '#7d6a86', '#8a5a4a', '#5c6f5a', '#6b6f7a', '#8d7a5e', '#57657d', '#7a4f5c'];
const SKIN_TONES = ['#f3d3bd', '#eac3a4', '#d9a884', '#c08a63', '#9a6a48', '#7a5236', '#5c3d28'];
const HAIR_COLORS = ['#2b1d14', '#4a2f1d', '#6b4423', '#8d6a3f', '#b08b5a', '#6e6e70', '#c9c6c0'];

// Deterministic per contact id, so grandma looks the same every visit.
function hashOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function appearanceFor(id, { relation = 'friend' } = {}) {
  const h = hashOf(String(id) + ':look');
  const pick = (arr, shift) => arr[(h >>> shift) % arr.length];
  const older = ['grandma', 'grandpa'].includes(relation);
  const female = relation === 'grandma' || relation === 'aunt' || (relation !== 'grandpa' && relation !== 'uncle' && ((h >>> 21) & 1) === 0);
  return {
    female,
    height: (female ? 1.60 : 1.74) + (((h >>> 3) % 100) / 100 - 0.5) * 0.13 - (older ? 0.04 : 0),
    build: 0.3 + ((h >>> 9) % 100) / 140 + (older ? 0.15 : 0),
    skinTone: pick(SKIN_TONES, 5),
    hairColor: older && ((h >>> 17) % 100) < 70 ? pick(['#8e8b86', '#b8b4ad', '#d6d2cb'], 11) : pick(HAIR_COLORS, 11),
    hairLength: female ? 0.35 + ((h >>> 13) % 100) / 200 : ((h >>> 13) % 100) / 500,
    clothColor: pick(CLOTH_PALETTE, 7),
    eyeColor: pick(['#4a3020', '#5a7a6a', '#3f5a7a', '#6b4a2a'], 19),
  };
}

// A visitor standing in the room. `build()` is deliberate about cost: an NPC is only ever built when
// somebody actually arrives, and disposed when they leave.
export class Adult {
  constructor(scene, { id = 'guest', relation = 'friend', name = 'Visitor', mobile = false, lowSpec = false } = {}) {
    this.scene = scene; this.id = id; this.name = name;
    this.look = appearanceFor(id, { relation });
    this.root = new THREE.Group(); this.root.name = 'adult:' + id;
    scene.add(this.root);
    this.t = Math.random() * 10;
    this.gaze = new THREE.Vector3(0, 1.5, 1);
    this.mobile = mobile;
    this.lowSpec = !!lowSpec;
    this.build();
  }

  build() {
    const look = this.look;
    const L = adultLayout({ h: look.height, build: look.build, female: look.female });
    this.layout = L;
    const balls = adultBalls(L, look.female);
    const reach = L.J.handTipR.x + 0.08;
    const bounds = { min: V(-reach, -0.06, -0.3), max: V(reach, L.totalH + 0.06, 0.34) };
    const res = this.lowSpec ? 56 : this.mobile ? 64 : 80;

    this.skin = makeSkinMaterial({ skinTone: look.skinTone, sss: 0.32, blush: 0.14 });
    const geo = polygonise(balls, res, bounds, 1.0, 3);
    const { bones, byName } = makeBones(L);
    const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
    skinGeometry(geo, L, boneIndex);
    const skeleton = new THREE.Skeleton(bones);
    const body = new THREE.SkinnedMesh(geo, this.skin);
    body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    body.add(bones[0]); body.bind(skeleton);
    this.root.add(body);
    this.body = body; this.bones = byName; this.skeleton = skeleton;

    // Clothing as real volume over the body. The whole body is inflated into one shell and each
    // garment is cut out of it, so the cloth is everywhere outside the skin — building a top from
    // only the torso's balls left gaps at the shoulders and neck where flesh poked through.
    const P = L.P;
    const shell = balls.map(([x, y, z, r, s]) => [x, y, z, r * 1.06 + 0.009, s]);
    const shellGeo = polygonise(shell, Math.round(res * 0.85), bounds, 1.0, 3);
    const sleeveEnd = P.shoulderW + P.upperArm * 0.9;
    const topKeep = (p) => (p.y > L.J.hips.y - 0.03 && p.y < L.J.neck.y - P.neckR * 0.45 && Math.abs(p.x) <= P.shoulderW + 0.02)
      || (p.y > L.J.chest.y - 0.16 && p.y < L.J.neck.y && Math.abs(p.x) > P.shoulderW - 0.02 && Math.abs(p.x) < sleeveEnd);
    const legKeep = (p) => p.y < L.J.hips.y + P.hipR * 0.4 && p.y > L.J.ankleR.y + 0.025 && Math.abs(p.x) < P.hipR * 1.6;

    // DoubleSide: the cut edges are the neckline, hem and cuffs, and you see the inside of a collar.
    this.clothMat = clothMaterial(fabricTexture({ color: look.clothColor, repeat: 8, weave: 3 }), { sheen: 0.55, sheenTint: 0.5, extra: { side: THREE.DoubleSide } });
    this.trouserMat = clothMaterial(fabricTexture({ color: '#3a4049', repeat: 9, weave: 4 }), { sheen: 0.3, sheenTint: 0.25, extra: { side: THREE.DoubleSide } });

    for (const [keep, mat] of [[topKeep, this.clothMat], [legKeep, this.trouserMat]]) {
      const g = clipGeometry(shellGeo.clone(), keep);
      if (!g.index || g.index.count === 0) continue;
      skinGeometry(g, L, boneIndex);
      const m = new THREE.SkinnedMesh(g, mat);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.bind(skeleton);
      body.add(m);
    }
    shellGeo.dispose();

    this.surface = new HeadSurface(geo, L.headCenter, P.headR);
    this.buildHead();
    this.rest = bones.map((b) => b.quaternion.clone());
  }

  buildHead() {
    const L = this.layout, P = L.P, look = this.look;
    const head = this.bones.head;
    const face = new THREE.Group(); head.add(face); this.face = face;
    const onSurface = (dir, off = 0) => this.surface.point(dir, off).sub(L.J.head);
    const eyeR = P.headR * 0.135;

    // Same construction as the baby's eyes: one opaque ball with a tear-film clearcoat and a painted
    // iris cap scaled forward for the corneal bulge. Nothing transparent anywhere in an eye.
    const sclera = new THREE.MeshPhysicalMaterial({ color: 0xf1f2f4, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.15, sheenColor: new THREE.Color(0xffd0c8) });
    const iris = new THREE.MeshPhysicalMaterial({ map: irisTexture(look.eyeColor), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const socket = new THREE.Group();
      socket.position.copy(onSurface(V(sx * 0.36, 0.1, 1), -eyeR * 0.55));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 16), sclera); socket.add(ball);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.012, 24, 12, 0, Math.PI * 2, 0, 0.58), iris);
      ir.rotation.x = Math.PI / 2; ir.scale.z = 1.12; socket.add(ir);
      // lids in skin, so blinking is the same material as the face
      const lidGeo = new THREE.SphereGeometry(eyeR * 1.12, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const upper = new THREE.Mesh(lidGeo, this.skin); upper.rotation.x = -0.6; upper.scale.set(1.05, 1, 1.05); socket.add(upper);
      const lower = new THREE.Mesh(lidGeo, this.skin); lower.rotation.x = Math.PI + 0.68; lower.scale.set(1.05, 1, 1.05); socket.add(lower);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.08, eyeR * 0.024, 6, 20, Math.PI * 0.8), hairMaterial('#241610', 0.85));
      lash.position.y = eyeR * 0.05; lash.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.1); lash.scale.set(1, 1, 0.55); upper.add(lash);
      face.add(socket);
      this.eyes.push({ socket, upper, lower, sx });

      const brow = new THREE.Mesh(new THREE.TorusGeometry(P.headR * 0.14, P.headR * 0.017, 6, 16, Math.PI * 0.5),
        hairMaterial(new THREE.Color(look.hairColor).multiplyScalar(0.8), 0.92));
      brow.position.copy(onSurface(V(sx * 0.35, 0.25, 1), -P.headR * 0.005));
      brow.rotation.set(0.1, sx * 0.22, Math.PI * 0.74 + sx * 0.06);
      brow.scale.set(1, 0.9, 0.2);
      face.add(brow);

      // the same three-piece ear the baby has: a curled rim, a hollow and a lobe
      const earG = new THREE.Group();
      earG.position.copy(onSurface(V(sx, -0.02, -0.08), P.headR * 0.01));
      earG.rotation.set(0, sx * 0.4, sx * -0.1);
      const helix = new THREE.Mesh(new THREE.TorusGeometry(P.headR * 0.115, P.headR * 0.025, 8, 20, Math.PI * 1.45), this.skin);
      helix.rotation.set(0, Math.PI / 2, Math.PI * 0.32); helix.scale.set(1, 1.2, 0.5); earG.add(helix);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(P.headR * 0.08, 14, 10), this.skin);
      bowl.scale.set(0.4, 1.0, 0.7); bowl.position.set(-sx * P.headR * 0.012, -P.headR * 0.01, 0); earG.add(bowl);
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(P.headR * 0.04, 10, 8), this.skin);
      lobe.scale.set(0.55, 0.9, 0.8); lobe.position.set(0, -P.headR * 0.13, P.headR * 0.005); earG.add(lobe);
      face.add(earG);
    }

    // mouth: a closed line that catches shadow, not a painted stripe
    const lips = new THREE.Mesh(new THREE.TorusGeometry(P.headR * 0.135, P.headR * 0.026, 8, 20, Math.PI),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(look.skinTone).multiplyScalar(0.72).lerp(new THREE.Color(0xa2544e), 0.35),
        roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.4, sheenColor: new THREE.Color(0xe08a80),
        normalMap: skinMicroTexture().normalMap || skinMicroTexture().map, normalScale: new THREE.Vector2(0.3, 0.3),
      }));
    lips.position.copy(onSurface(V(0, -0.5, 1), -P.headR * 0.004));
    lips.rotation.set(Math.PI * 0.5 + 0.2, 0, Math.PI); lips.scale.set(1.05, 1, 0.42);
    face.add(lips);

    // hair: an instanced shell of short strands over the scalp, so it has volume and catches light
    this.buildHair();
  }

  buildHair() {
    const L = this.layout, P = L.P, look = this.look;
    // A solid scalp under the strands, so the head reads as a mass of hair with texture on top rather
    // than a bald skull with lines stuck in it. Strands alone are never dense enough to be opaque.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(P.headR * 1.02, 40, 28, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMaterial(look.hairColor, 0.62));
    cap.position.copy(L.headCenter.clone().sub(L.J.head)).add(V(0, P.headR * 0.03, -P.headR * 0.08));
    cap.rotation.x = -0.12; cap.scale.set(1.02, 1.0, 1.06); cap.castShadow = true;
    this.bones.head.add(cap);
    this.hairCap = cap;
    const count = this.lowSpec ? 260 : this.mobile ? 900 : 2200;
    const len = P.headR * (0.35 + look.hairLength * 2.2);
    const geo = new THREE.CylinderGeometry(P.headR * 0.012, P.headR * 0.004, len, 4, 1, false);
    geo.translate(0, len * 0.5, 0);
    const mat = hairMaterial(look.hairColor, 0.55);
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = true; inst.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), scale = V(1, 1, 1);
    const seed = hashOf(this.id + ':hair');
    let rnd = seed;
    const rand = () => ((rnd = Math.imul(rnd ^ (rnd >>> 15), 2246822519)) >>> 0) / 4294967296;
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      // sample the upper hemisphere, denser at the crown, none across the face
      const u = rand(), v = rand();
      const theta = Math.acos(1 - u * 1.05);
      const phi = v * Math.PI * 2;
      const dir = V(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
      if (dir.z > 0.35 && dir.y < 0.45) continue;          // forehead and face stay bare
      if (dir.y < -0.15) continue;
      const p = this.surface.point(dir, P.headR * 0.01).sub(L.J.head);
      // strands lie along the skull and fall with gravity — down and back, never straight up
      const tangentDown = V(dir.x * 0.25, -0.75, -0.55 + dir.z * 0.2).normalize();
      const tilt = dir.clone().multiplyScalar(0.3).add(tangentDown.multiplyScalar(0.7 + look.hairLength * 0.3)).normalize();
      q.setFromUnitVectors(up, tilt);
      scale.set(1, 0.7 + rand() * 0.7, 1);
      m.compose(p, q, scale);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    this.bones.head.add(inst);
    this.hair = inst;
  }

  // Stand somewhere, facing a point.
  place(pos, faceTowards) {
    this.root.position.copy(pos);
    if (faceTowards) {
      const d = faceTowards.clone().sub(pos); d.y = 0;
      if (d.lengthSq() > 1e-6) this.root.rotation.y = Math.atan2(d.x, d.z);
    }
  }

  lookAt(worldPoint) { this.gaze.copy(worldPoint); }

  // Idle: breathing, a slow weight shift, a head that tracks whatever it was told to watch, and a
  // blink. Nobody stands perfectly still, and a character that does reads as a prop.
  update(dt) {
    this.t += dt;
    const t = this.t, B = this.bones;
    if (!B) return;
    const breath = Math.sin(t * 1.15) * 0.5 + 0.5;
    const sway = Math.sin(t * 0.31), sway2 = Math.sin(t * 0.19 + 1.1);

    // Sitting is a pose, not a position: hips drop to seat height, thighs come forward, shins hang.
    const L = this.layout, P = L.P;
    const sit = this.sitting ? 1 : 0;
    this.sitBlend = (this.sitBlend ?? sit) + (sit - (this.sitBlend ?? sit)) * Math.min(1, dt * 4);
    const k = this.sitBlend;
    if (B.chest) B.chest.rotation.x = -0.02 + breath * 0.022 + k * 0.06;
    if (B.spine) { B.spine.rotation.z = sway * 0.012; B.spine.rotation.x = k * 0.05; }
    if (B.hips) {
      B.hips.rotation.z = sway * 0.02 * (1 - k);
      B.hips.position.y = L.J.hips.y + breath * 0.004 - k * (P.thigh - 0.04);   // seat height
      B.hips.position.z = k * 0.12;                                              // scooted back onto the cushion
    }
    for (const [s, sx] of [['L', -1], ['R', 1]]) {
      const th = B['thigh' + s], sh = B['shin' + s];
      if (th) th.rotation.x = -k * (Math.PI * 0.5 - 0.08) + sway2 * 0.01 * (1 - k);
      if (sh) sh.rotation.x = k * (Math.PI * 0.5 - 0.15);
    }

    // Arms hang and swing a little; elbows never lock straight. Seated, they rest on the thighs.
    // The sign matters: the rest pose is a T, and the arm points along +X on the right, so bringing
    // it DOWN is a negative rotation about Z. Getting this backwards stands everyone in the room
    // with both arms over their head, which is what it used to do.
    for (const [s, sx] of [['L', -1], ['R', 1]]) {
      const ua = B['upperArm' + s], fa = B['foreArm' + s];
      if (ua) {
        ua.rotation.z = -sx * (Math.PI * 0.46 - 0.05) - sx * sway * 0.03 * (1 - k);
        ua.rotation.x = sway2 * 0.05 + k * 0.5;             // seated, the upper arms come forward
      }
      if (fa) {
        fa.rotation.z = -sx * (0.2 + breath * 0.04);         // a natural carrying angle, never locked
        fa.rotation.x = -k * 1.0;                            // seated, forearms fold onto the thighs
      }
    }

    // head towards the gaze target, clamped so nobody swivels like an owl
    if (B.head) {
      const local = this.root.worldToLocal(this.gaze.clone());
      const dy = Math.atan2(local.x, local.z);
      const dist = Math.hypot(local.x, local.z);
      const dx = -Math.atan2(local.y - this.layout.J.head.y, Math.max(0.15, dist));
      const clamp = (v, m) => Math.max(-m, Math.min(m, v));
      B.head.rotation.y += (clamp(dy, 0.7) * 0.65 - B.head.rotation.y) * Math.min(1, dt * 3);
      B.head.rotation.x += (clamp(dx, 0.45) - B.head.rotation.x) * Math.min(1, dt * 3);
      if (B.neck) { B.neck.rotation.y = B.head.rotation.y * 0.35; B.neck.rotation.x = B.head.rotation.x * 0.3; }
    }

    // blink
    this.blinkIn = (this.blinkIn ?? 2) - dt;
    if (this.blinkIn <= 0) { this.blinkIn = 2.5 + Math.random() * 4; this.blinkT = 0.16; }
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      const k = Math.max(0, Math.sin((1 - this.blinkT / 0.16) * Math.PI));
      for (const e of this.eyes) { e.upper.rotation.x = -0.42 + k * 1.5; e.lower.rotation.x = Math.PI + 0.5 - k * 0.35; }
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.skin) { const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose(); }
    });
    this.skin?.dispose();
    this.scene.remove(this.root);
  }
}
