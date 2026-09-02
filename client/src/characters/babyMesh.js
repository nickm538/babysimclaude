// Procedural baby body: a metaball field (chubby, seamless anatomy) polygonised with marching cubes,
// then skinned to a skeleton so it can be posed and animated. Rebuilt as the child grows.
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Body proportions in "body units" (standing, Y up, facing +Z). Scaled to real height afterwards.
export function proportions(days) {
  const t = clamp01(days / 1826);
  const e = Math.pow(t, 0.7);
  return {
    headR: lerp(0.125, 0.082, e), headBack: lerp(0.06, 0.05, e), neck: lerp(0.012, 0.035, e),
    torsoLen: lerp(0.30, 0.36, e), torsoW: lerp(0.105, 0.09, e), bellyR: lerp(0.125, 0.085, e), chestR: lerp(0.105, 0.085, e),
    upperArm: lerp(0.095, 0.15, e), foreArm: lerp(0.08, 0.13, e), armR: lerp(0.034, 0.026, e),
    thigh: lerp(0.125, 0.20, e), shin: lerp(0.105, 0.18, e), legR: lerp(0.046, 0.034, e),
    handR: lerp(0.028, 0.026, e), footL: lerp(0.06, 0.095, e), footR: lerp(0.028, 0.03, e),
    chub: lerp(1.0, 0.55, e),
    cheek: lerp(0.05, 0.03, e),
  };
}

// Rest-pose joint positions (T-pose). Returns { joints:{name:Vector3}, hierarchy:[[child,parent]], P }
export function skeletonLayout(days) {
  const P = proportions(days);
  const hipY = P.thigh + P.shin + P.footR;
  const neckY = hipY + P.torsoLen;
  const headBase = neckY + P.neck;
  const J = {};
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  J.hips = v(0, hipY, 0);
  J.spine = v(0, hipY + P.torsoLen * 0.33, 0);
  J.chest = v(0, hipY + P.torsoLen * 0.66, 0);
  J.neck = v(0, neckY, 0);
  J.head = v(0, headBase, 0);
  J.headTop = v(0, headBase + P.headR * 1.85, 0); // end marker
  for (const [s, sx] of [['L', -1], ['R', 1]]) {
    J['shoulder' + s] = v(sx * (P.torsoW + 0.005), hipY + P.torsoLen * 0.9, 0);
    J['elbow' + s] = v(sx * (P.torsoW + 0.005 + P.upperArm), hipY + P.torsoLen * 0.9, 0);
    J['wrist' + s] = v(sx * (P.torsoW + 0.005 + P.upperArm + P.foreArm), hipY + P.torsoLen * 0.9, 0);
    J['handTip' + s] = v(sx * (P.torsoW + 0.005 + P.upperArm + P.foreArm + P.handR * 1.8), hipY + P.torsoLen * 0.9, 0);
    J['hip' + s] = v(sx * P.legR * 1.25, hipY, 0);
    J['knee' + s] = v(sx * P.legR * 1.25, hipY - P.thigh, 0);
    J['ankle' + s] = v(sx * P.legR * 1.25, hipY - P.thigh - P.shin, 0);
    J['toe' + s] = v(sx * P.legR * 1.25, hipY - P.thigh - P.shin - P.footR * 0.6, P.footL);
  }
  // bones: name -> [start joint, end joint, parent bone]
  const bones = [
    ['hips', 'hips', 'spine', null], ['spine', 'spine', 'chest', 'hips'], ['chest', 'chest', 'neck', 'spine'], ['neck', 'neck', 'head', 'chest'], ['head', 'head', 'headTop', 'neck'],
    ['upperArmL', 'shoulderL', 'elbowL', 'chest'], ['foreArmL', 'elbowL', 'wristL', 'upperArmL'], ['handL', 'wristL', 'handTipL', 'foreArmL'],
    ['upperArmR', 'shoulderR', 'elbowR', 'chest'], ['foreArmR', 'elbowR', 'wristR', 'upperArmR'], ['handR', 'wristR', 'handTipR', 'foreArmR'],
    ['thighL', 'hipL', 'kneeL', 'hips'], ['shinL', 'kneeL', 'ankleL', 'thighL'], ['footL', 'ankleL', 'toeL', 'shinL'],
    ['thighR', 'hipR', 'kneeR', 'hips'], ['shinR', 'kneeR', 'ankleR', 'thighR'], ['footR', 'ankleR', 'toeR', 'shinR'],
  ];
  const totalH = J.headTop.y + P.headR * 0.15;
  return { J, bones, P, totalH, hipY, headCenter: v(0, headBase + P.headR * 0.95, 0) };
}

// Metaballs describing flesh volumes. Each: [x,y,z,r,strength]
function bodyBalls(L) {
  const { J, P } = L; const B = [];
  const ball = (p, r, s = 1) => B.push([p.x, p.y, p.z, r, s]);
  const seg = (a, b, r0, r1, n, s = 1) => { for (let i = 0; i <= n; i++) { const t = i / n; B.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(r0, r1, t), s]); } };
  const hc = L.headCenter;
  // head: main + back-of-head + forehead + cheeks + chin + nose
  ball(hc, P.headR, 1.0);
  ball(new THREE.Vector3(0, hc.y + P.headR * 0.05, -P.headR * 0.45), P.headR * 0.8, 0.9); // occiput
  ball(new THREE.Vector3(0, hc.y + P.headR * 0.45, P.headR * 0.25), P.headR * 0.55, 0.6); // forehead bulge
  for (const sx of [-1, 1]) ball(new THREE.Vector3(sx * P.headR * 0.55, hc.y - P.headR * 0.3, P.headR * 0.55), P.headR * 0.3 * (0.9 + 0.2 * P.chub), 0.8); // cheeks
  ball(new THREE.Vector3(0, hc.y - P.headR * 0.75, P.headR * 0.5), P.headR * 0.36, 0.7); // chin/jaw
  ball(new THREE.Vector3(0, hc.y - P.headR * 0.1, P.headR * 0.93), P.headR * 0.17, 0.8); // nose
  for (const sx of [-1, 1]) ball(new THREE.Vector3(sx * P.headR * 0.4, hc.y + P.headR * 0.04, P.headR * 1.0), P.headR * 0.2, -0.32); // shallow eye sockets
  // neck
  seg(J.neck, J.head, P.headR * 0.42, P.headR * 0.45, 2, 0.8);
  // torso
  seg(J.hips, J.neck, P.bellyR * 0.95, P.chestR * 0.9, 5, 1.0);
  ball(new THREE.Vector3(0, J.hips.y + P.torsoLen * 0.3, P.bellyR * 0.25), P.bellyR * (0.9 + 0.15 * P.chub), 0.9); // belly
  ball(new THREE.Vector3(0, J.hips.y + P.torsoLen * 0.72, -P.chestR * 0.05), P.chestR * 1.0, 0.8); // chest
  for (const sx of [-1, 1]) { ball(new THREE.Vector3(sx * P.torsoW * 0.75, J.hips.y + P.torsoLen * 0.7, 0), P.chestR * 0.72, 0.8); ball(new THREE.Vector3(sx * P.torsoW * 0.55, J.hips.y + P.torsoLen * 0.12, 0), P.bellyR * 0.72, 0.9); }
  // shoulders + arms
  for (const s of ['L', 'R']) {
    ball(J['shoulder' + s], P.armR * 1.35, 0.9);
    seg(J['shoulder' + s], J['elbow' + s], P.armR * 1.15, P.armR * 1.0, 4, 1);
    ball(J['elbow' + s], P.armR * 1.05 * (0.9 + 0.2 * P.chub), 0.8);
    seg(J['elbow' + s], J['wrist' + s], P.armR * 0.98, P.armR * 0.8, 4, 1);
    ball(J['wrist' + s], P.armR * 0.85, 0.7); // wrist roll
    const hand = J['wrist' + s].clone().lerp(J['handTip' + s], 0.5);
    ball(hand, P.handR * 1.05, 0.9);
    ball(J['wrist' + s].clone().lerp(J['handTip' + s], 0.85), P.handR * 0.7, 0.6);
    ball(hand.clone().add(new THREE.Vector3(0, 0, P.handR * 0.9)), P.handR * 0.45, 0.6); // thumb
  }
  // hips + legs
  for (const s of ['L', 'R']) {
    ball(J['hip' + s], P.legR * 1.35, 0.9);
    seg(J['hip' + s], J['knee' + s], P.legR * 1.2, P.legR * 0.95, 5, 1);
    ball(J['knee' + s], P.legR * (0.95 + 0.25 * P.chub), 0.8);
    seg(J['knee' + s], J['ankle' + s], P.legR * 0.92, P.legR * 0.7, 5, 1);
    ball(J['ankle' + s], P.legR * 0.7, 0.7);
    seg(J['ankle' + s], J['toe' + s], P.footR * 1.05, P.footR * 0.75, 3, 0.9);
  }
  return B;
}

// Polygonise a ball set. bounds: {min,max} Vector3 in body units. Returns indexed BufferGeometry in body units.
function polygonise(balls, res, bounds, isolation = 1.0) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000);
  mc.isolation = isolation;
  const field = mc.field; field.fill(0);
  const size = bounds.max.clone().sub(bounds.min);
  const inv = new THREE.Vector3(1 / size.x, 1 / size.y, 1 / size.z);
  const n = res;
  const norm = Math.pow(1 - 1 / (2.6 * 2.6), 3); // so a lone ball's isosurface sits exactly at radius r
  for (const [bx, by, bz, r, s] of balls) {
    const nx = (bx - bounds.min.x) * inv.x, ny = (by - bounds.min.y) * inv.y, nz = (bz - bounds.min.z) * inv.z;
    const rr = r * 2.6; // influence radius
    const x0 = Math.max(0, Math.floor((nx - rr * inv.x) * n)), x1 = Math.min(n - 1, Math.ceil((nx + rr * inv.x) * n));
    const y0 = Math.max(0, Math.floor((ny - rr * inv.y) * n)), y1 = Math.min(n - 1, Math.ceil((ny + rr * inv.y) * n));
    const z0 = Math.max(0, Math.floor((nz - rr * inv.z) * n)), z1 = Math.min(n - 1, Math.ceil((nz + rr * inv.z) * n));
    for (let z = z0; z <= z1; z++) { const wz = bounds.min.z + (z / n) * size.z - bz; const wz2 = wz * wz;
      for (let y = y0; y <= y1; y++) { const wy = bounds.min.y + (y / n) * size.y - by; const wy2 = wy * wy;
        for (let x = x0; x <= x1; x++) { const wx = bounds.min.x + (x / n) * size.x - bx; const d2 = wx * wx + wy2 + wz2 + 1e-6;
          // smooth falloff (Wyvill-like) keeps blending local
          const q = d2 / (rr * rr); if (q >= 1) continue;
          const f = 1 - q; const val = s * f * f * f / norm;
          field[z * n * n + y * n + x] += val;
        } } }
  }
  mc.update();
  const g = mc.geometry;
  const count = Math.max(0, Number.isFinite(g.drawRange.count) ? g.drawRange.count : 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const p = g.attributes.position.array, nn = g.attributes.normal.array;
  for (let i = 0; i < count; i++) {
    // mc vertex coords are in [-1,1] -> map to bounds
    pos[i * 3] = bounds.min.x + (p[i * 3] * 0.5 + 0.5) * size.x;
    pos[i * 3 + 1] = bounds.min.y + (p[i * 3 + 1] * 0.5 + 0.5) * size.y;
    pos[i * 3 + 2] = bounds.min.z + (p[i * 3 + 2] * 0.5 + 0.5) * size.z;
    nor[i * 3] = nn[i * 3]; nor[i * 3 + 1] = nn[i * 3 + 1]; nor[i * 3 + 2] = nn[i * 3 + 2];
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo = BufferGeometryUtils.mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  mc.geometry.dispose();
  return geo;
}

function segDist(p, a, b) {
  const ab = b.clone().sub(a); const t = clamp01(p.clone().sub(a).dot(ab) / Math.max(1e-8, ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// Compute skin indices/weights by proximity to bone segments (soft, 3 nearest).
function skinGeometry(geo, L, boneIndex) {
  const pos = geo.attributes.position; const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const segs = L.bones.map(([name, a, b]) => ({ i: boneIndex[name], a: L.J[a], b: L.J[b], name }));
  const p = new THREE.Vector3();
  const headSeg = segs.find((s) => s.name === 'head');
  for (let v = 0; v < n; v++) {
    p.fromBufferAttribute(pos, v);
    const ds = [];
    for (const s of segs) {
      let d = segDist(p, s.a, s.b);
      if (s.name === 'head') d = Math.max(0, p.distanceTo(L.headCenter) - L.P.headR * 0.6) * 0.5; // head is one rigid lump
      if (s.name === 'neck') d *= 1.4;
      ds.push([d, s.i]);
    }
    ds.sort((x, y) => x[0] - y[0]);
    // keep only bones that are reasonably close to the nearest one, so limbs don't inherit torso motion
    const top = ds.slice(0, 3).filter(([d], i) => i === 0 || d < ds[0][0] * 2.2 + 0.01);
    // sharpen: inverse distance^5 with a small floor so joints still blend smoothly
    let total = 0; const w = top.map(([d]) => { const ww = 1 / Math.pow(d + 0.006, 5); total += ww; return ww; });
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = k < top.length ? top[k][1] : 0; sw[v * 4 + k] = k < top.length ? w[k] / total : 0; }
    void headSeg;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
}

// Expression morph targets computed analytically on the polygonised head.
function addFaceMorphs(geo, L) {
  const { P } = L; const hc = L.headCenter; const R = P.headR;
  const pos = geo.attributes.position; const n = pos.count;
  const mouth = new THREE.Vector3(0, hc.y - R * 0.42, R * 0.9);
  const browL = new THREE.Vector3(-R * 0.38, hc.y + R * 0.28, R * 0.88), browR = new THREE.Vector3(R * 0.38, hc.y + R * 0.28, R * 0.88);
  const cheekL = new THREE.Vector3(-R * 0.55, hc.y - R * 0.25, R * 0.62), cheekR = new THREE.Vector3(R * 0.55, hc.y - R * 0.25, R * 0.62);
  const g = (d, s) => Math.exp(-(d * d) / (2 * s * s));
  const targets = { cry: new Float32Array(n * 3), smile: new Float32Array(n * 3), open: new Float32Array(n * 3), frown: new Float32Array(n * 3) };
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    if (p.distanceTo(hc) > R * 1.6) continue;
    const dm = p.distanceTo(mouth), dx = p.x - mouth.x, dy = p.y - mouth.y;
    const inMouth = g(Math.hypot(dx / 1.5, dy), R * 0.16);
    const lower = p.y < mouth.y ? 1 : 0.3;
    const jaw = g(Math.hypot(p.x, Math.max(0, p.y - (mouth.y - R * 0.3)) * 1.3, p.z - R * 0.5), R * 0.55) * (p.y < mouth.y ? 1 : 0);
    const dbL = p.distanceTo(browL), dbR = p.distanceTo(browR), brow = g(dbL, R * 0.22) + g(dbR, R * 0.22);
    const cheek = g(p.distanceTo(cheekL), R * 0.3) + g(p.distanceTo(cheekR), R * 0.3);
    const cornerL = g(p.distanceTo(new THREE.Vector3(mouth.x - R * 0.28, mouth.y, mouth.z - R * 0.08)), R * 0.14), cornerR = g(p.distanceTo(new THREE.Vector3(mouth.x + R * 0.28, mouth.y, mouth.z - R * 0.08)), R * 0.14);
    // CRY: wide open mouth, jaw drops, brows knit down, cheeks bunch, eyes squint handled by lids
    let t = targets.cry;
    t[i * 3] += (dx > 0 ? 1 : -1) * inMouth * R * 0.08;
    t[i * 3 + 1] += -inMouth * lower * R * 0.22 - jaw * R * 0.12 + cheek * R * 0.04;
    t[i * 3 + 2] += -inMouth * R * 0.22 + cheek * R * 0.03;
    t[i * 3] += brow * (p.x > 0 ? -1 : 1) * R * 0.03; t[i * 3 + 1] += -brow * R * 0.05;
    // SMILE: corners up and out, cheeks up
    t = targets.smile;
    t[i * 3] += (p.x > 0 ? 1 : -1) * (cornerL + cornerR) * R * 0.06;
    t[i * 3 + 1] += (cornerL + cornerR) * R * 0.07 + cheek * R * 0.045 + brow * R * 0.015;
    t[i * 3 + 2] += cheek * R * 0.03 - inMouth * R * 0.02;
    // OPEN: round o mouth (feeding / surprise)
    t = targets.open;
    const o = g(dm, R * 0.14);
    t[i * 3 + 1] += -o * lower * R * 0.14 - jaw * R * 0.06; t[i * 3 + 2] += -o * R * 0.12;
    // FROWN: corners down, brows in
    t = targets.frown;
    t[i * 3 + 1] += -(cornerL + cornerR) * R * 0.05 - brow * R * 0.03; t[i * 3] += brow * (p.x > 0 ? -1 : 1) * R * 0.02;
    void dm;
  }
  geo.morphAttributes.position = ['cry', 'smile', 'open', 'frown'].map((k) => new THREE.BufferAttribute(targets[k], 3));
  geo.morphTargetsRelative = true;
  return ['cry', 'smile', 'open', 'frown'];
}

// Spherical lookup of the polygonised head surface: radius along any direction from the head centre.
export class HeadSurface {
  constructor(geo, center, R) {
    this.center = center.clone(); this.R = R; this.rows = 32; this.cols = 64;
    this.grid = new Float32Array(this.rows * this.cols).fill(0);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(center);
      const d = v.length(); if (d > R * 1.9 || d < R * 0.3) continue;
      if (v.y < -R * 0.95) continue; // ignore neck/torso
      const idx = this.index(v.clone().divideScalar(d));
      if (d > this.grid[idx]) this.grid[idx] = d;
    }
    // fill empty bins from neighbours
    for (let pass = 0; pass < 3; pass++) for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c; if (this.grid[i] > 0) continue;
      let sum = 0, n = 0; for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr, cc = (c + dc + this.cols) % this.cols; if (rr < 0 || rr >= this.rows) continue; const g = this.grid[rr * this.cols + cc]; if (g > 0) { sum += g; n++; } }
      if (n) this.grid[i] = sum / n;
    }
  }
  index(dir) {
    const lat = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) / Math.PI; // 0 top .. 1 bottom
    const lon = (Math.atan2(dir.x, dir.z) + Math.PI) / (2 * Math.PI);
    const r = Math.min(this.rows - 1, Math.floor(lat * this.rows)), c = Math.min(this.cols - 1, Math.floor(lon * this.cols));
    return r * this.cols + c;
  }
  radius(dir) { const d = dir.clone().normalize(); const g = this.grid[this.index(d)]; return g > 0 ? g : this.R; }
  point(dir, offset = 0) { const d = dir.clone().normalize(); return this.center.clone().addScaledVector(d, this.radius(d) + offset); }
}

function makeBones(L) {
  const bones = [], byName = {};
  for (const [name, a, , parent] of L.bones) {
    const b = new THREE.Bone(); b.name = name; byName[name] = b;
    const wp = L.J[a];
    if (parent) { const pp = L.J[L.bones.find((x) => x[0] === parent)[1]]; b.position.copy(wp).sub(pp); byName[parent].add(b); } else b.position.copy(wp);
    bones.push(b);
  }
  return { bones, byName };
}

export function buildBabyBody({ days = 0, skinMat, clothMat, diaperMat, res = 84 }) {
  const L = skeletonLayout(days);
  const balls = bodyBalls(L);
  const reach = L.J.handTipR.x + 0.06;
  const bounds = { min: new THREE.Vector3(-reach, -0.05, -0.28), max: new THREE.Vector3(reach, L.totalH + 0.05, 0.3) };
  const geo = polygonise(balls, res, bounds);
  const { bones, byName } = makeBones(L);
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  skinGeometry(geo, L, boneIndex);
  const morphNames = addFaceMorphs(geo, L);
  const skeleton = new THREE.Skeleton(bones);
  const body = new THREE.SkinnedMesh(geo, skinMat);
  body.castShadow = true; body.receiveShadow = true;
  body.add(bones[0]); body.bind(skeleton);
  body.frustumCulled = false;

  // clothing shells: onesie (torso + upper limbs) and diaper — same skeleton, expanded balls
  const torsoNames = new Set();
  const isTorso = (b) => b[1] > L.J.hips.y - L.P.thigh * 0.5 && b[1] < L.J.neck.y - 0.005 && Math.abs(b[0]) < L.P.torsoW + 0.012;
  const cloth = balls.filter(isTorso).map(([x, y, z, r, s]) => [x, y, z, r * 1.07 + 0.004, s]);
  const clothGeo = polygonise(cloth, 64, bounds, 1.0);
  skinGeometry(clothGeo, L, boneIndex);
  const onesie = new THREE.SkinnedMesh(clothGeo, clothMat); onesie.castShadow = true; onesie.frustumCulled = false; onesie.bind(skeleton);
  const diaperBalls = balls.filter((b) => b[1] > L.J.hips.y - L.P.thigh * 0.4 && b[1] < L.J.hips.y + L.P.torsoLen * 0.18 && Math.abs(b[0]) < L.P.torsoW + 0.02).map(([x, y, z, r, s]) => [x, y, z, r * 1.06 + 0.003, s]);
  const diaperGeo = polygonise(diaperBalls, 56, bounds, 1.0);
  skinGeometry(diaperGeo, L, boneIndex);
  const diaper = new THREE.SkinnedMesh(diaperGeo, diaperMat); diaper.frustumCulled = false; diaper.bind(skeleton);
  void torsoNames;
  const surface = new HeadSurface(geo, L.headCenter, L.P.headR);
  return { body, onesie, diaper, skeleton, bones: byName, layout: L, morphNames, surface };
}
