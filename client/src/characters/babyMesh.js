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

// A hand as flesh, at any scale: a wedge of a palm thicker on the thumb side, a lump for each
// knuckle, four tapering fingers of realistic relative length (the middle longest, the little one
// shortest) each with a middle joint and a fingertip pad, and a thumb that comes out of the thenar
// mass at an angle. `wrist` and `tip` are the wrist joint and the fingertip marker; `sx` picks the
// side so the thumb ends up on the inside; `up` is the back-of-hand direction. Shared by the baby,
// the visitors and the player's own arms so every hand in the game is built the same way.
export function handBalls(B, wrist, tip, sx, up, scale = 1) {
  const along = tip.clone().sub(wrist); const len = along.length(); along.normalize();
  const side = new THREE.Vector3().crossVectors(up, along).normalize().multiplyScalar(sx);
  const at = (t, dx = 0, dy = 0) => wrist.clone().addScaledVector(along, t * len).addScaledVector(side, dx).addScaledVector(up, dy);
  const ball = (p, r, s = 1) => B.push([p.x, p.y, p.z, r, s]);
  const seg = (a, b, r0, r1, n, s = 1) => { for (let i = 0; i <= n; i++) { const t = i / n; B.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(r0, r1, t), s]); } };
  const k = scale;
  // palm: wrist to knuckle line, wedge-shaped, thicker at the thumb side
  seg(at(0), at(0.5), 0.028 * k, 0.031 * k, 4, 0.95);
  ball(at(0.32, 0.016 * k, -0.003 * k), 0.028 * k, 0.75);   // thenar
  ball(at(0.36, -0.014 * k, -0.001 * k), 0.022 * k, 0.6);   // hypothenar
  ball(at(0.42, 0, 0.004 * k), 0.026 * k, 0.6);            // back of hand
  // fingers
  const spread = [-0.024, -0.008, 0.008, 0.024], lengths = [0.44, 0.5, 0.47, 0.37];
  for (let i = 0; i < 4; i++) {
    const dx = spread[i] * k, r0 = (0.0108 - Math.abs(i - 1.5) * 0.0007) * k;
    const base = at(0.5, dx, -0.002 * k), mid = at(0.5 + lengths[i] * 0.42, dx, -0.004 * k), end = at(0.5 + lengths[i], dx, -0.008 * k);
    ball(base, r0 * 1.22, 0.8);
    seg(base, mid, r0, r0 * 0.88, 3, 0.9);
    ball(mid, r0 * 0.95, 0.7);
    seg(mid, end, r0 * 0.86, r0 * 0.62, 3, 0.9);
    ball(end, r0 * 0.6, 0.6);
  }
  // thumb: from the thenar, angled out across the palm, two segments
  const tb = at(0.22, 0.03 * k, -0.006 * k), tm = at(0.36, 0.055 * k, -0.01 * k), tt = at(0.5, 0.072 * k, -0.012 * k);
  seg(tb, tm, 0.0145 * k, 0.012 * k, 3, 0.9);
  seg(tm, tt, 0.012 * k, 0.0088 * k, 3, 0.9);
  ball(tt, 0.0088 * k, 0.6);
}

// A foot: heel, arch, instep, ball of the foot and five toes that get smaller outward.
export function footBalls(B, ankle, toe, sx, up, scale = 1) {
  const along = toe.clone().sub(ankle); const len = along.length(); along.normalize();
  const side = new THREE.Vector3().crossVectors(up, along).normalize().multiplyScalar(sx);
  const at = (t, dx = 0, dy = 0) => ankle.clone().addScaledVector(along, t * len).addScaledVector(side, dx).addScaledVector(up, dy);
  const ball = (p, r, s = 1) => B.push([p.x, p.y, p.z, r, s]);
  const seg = (a, b, r0, r1, n, s = 1) => { for (let i = 0; i <= n; i++) { const t = i / n; B.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(r0, r1, t), s]); } };
  const k = scale;
  ball(at(-0.12, 0, 0.01 * k), 0.03 * k, 0.8);                 // heel
  seg(at(0), at(0.75), 0.03 * k, 0.026 * k, 5, 0.95);          // body of the foot
  ball(at(0.45, 0, 0.012 * k), 0.026 * k, 0.55);               // instep
  ball(at(0.78, 0.008 * k, -0.004 * k), 0.026 * k, 0.7);       // ball of the foot
  const spread = [0.022, 0.009, -0.003, -0.014, -0.024], rad = [0.011, 0.0082, 0.0078, 0.0072, 0.0064], ext = [0.22, 0.2, 0.18, 0.16, 0.13];
  for (let i = 0; i < 5; i++) {
    const dx = spread[i] * k, r = rad[i] * k;
    seg(at(0.8, dx, -0.006 * k), at(0.8 + ext[i], dx, -0.01 * k), r, r * 0.8, 3, 0.85);
  }
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
  // Nose: a bridge running down from between the brows into a rounded tip, with the tip standing
  // proud. One ball gives a snout; three give a nose.
  ball(new THREE.Vector3(0, hc.y + P.headR * 0.12, P.headR * 0.82), P.headR * 0.1, 0.45);   // bridge
  ball(new THREE.Vector3(0, hc.y - P.headR * 0.08, P.headR * 0.95), P.headR * 0.15, 0.85);  // tip
  for (const sx of [-1, 1]) ball(new THREE.Vector3(sx * P.headR * 0.1, hc.y - P.headR * 0.14, P.headR * 0.9), P.headR * 0.075, 0.5); // nostril wings
  for (const sx of [-1, 1]) ball(new THREE.Vector3(sx * P.headR * 0.4, hc.y + P.headR * 0.04, P.headR * 1.0), P.headR * 0.22, -0.4); // eye sockets
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
    // a real hand — fingers, knuckles, a thumb — at the baby's scale (palm forward in the T-pose)
    handBalls(B, J['wrist' + s], J['handTip' + s], s === 'L' ? 1 : -1, new THREE.Vector3(0, 0, -1), P.handR / 0.045);
  }
  // hips + legs
  for (const s of ['L', 'R']) {
    ball(J['hip' + s], P.legR * 1.35, 0.9);
    seg(J['hip' + s], J['knee' + s], P.legR * 1.2, P.legR * 0.95, 5, 1);
    ball(J['knee' + s], P.legR * (0.95 + 0.25 * P.chub), 0.8);
    seg(J['knee' + s], J['ankle' + s], P.legR * 0.92, P.legR * 0.7, 5, 1);
    ball(J['ankle' + s], P.legR * 0.7, 0.7);
    footBalls(B, J['ankle' + s], J['toe' + s], s === 'L' ? 1 : -1, new THREE.Vector3(0, 1, 0), P.footR / 0.03);
  }
  // the details that make a face a face: nostrils either side of the nose tip, the groove of the
  // philtrum above the lip, and a navel — all carved with negative balls
  for (const sx of [-1, 1]) ball(new THREE.Vector3(sx * P.headR * 0.07, hc.y - P.headR * 0.2, P.headR * 0.95), P.headR * 0.045, -0.3);   // nostrils
  ball(new THREE.Vector3(0, hc.y - P.headR * 0.3, P.headR * 0.95), P.headR * 0.05, -0.14);                                                // philtrum
  ball(new THREE.Vector3(0, J.hips.y + P.torsoLen * 0.22, P.bellyR * (1.0 + 0.15 * P.chub)), P.bellyR * 0.12, -0.3);
  return B;
}

// Cut a garment out of a whole-body shell. Building a shirt from only the torso's metaballs leaves
// gaps at every zone boundary where the excluded balls still bulge the skin: the flesh pokes
// through the cloth. Building the shell from EVERY ball (inflated) and then discarding the
// triangles outside the garment guarantees the cloth surface is everywhere outside the skin, and
// the cut edge becomes the neckline, hem or cuff.
// A garment shell derived from the body itself, rather than from a second inflated ball field.
//
// Re-polygonising an inflated ball set produces a surface with its own topology and — because
// skinGeometry assigns weights by position — its own skin weights. Under a pose the cloth and the
// skin then deform differently and the skin surfaces through the cloth in a shredded,
// triangle-by-triangle pattern that reads as torn clothing. Offsetting the body's own vertices
// along their own normals gives cloth that shares the body's topology AND its weights, so a cloth
// vertex is the skin vertex it belongs to plus `thickness` times a rotated normal, in every pose.
// It also removes an entire marching-cubes pass per garment.
export function offsetShell(geo, thickness) {
  const src = geo.clone();
  if (!src.attributes.normal) src.computeVertexNormals();
  const p = src.attributes.position, n = src.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * thickness, p.getY(i) + n.getY(i) * thickness, p.getZ(i) + n.getZ(i) * thickness);
  }
  p.needsUpdate = true;
  src.computeVertexNormals();
  // face morphs belong to the face; a shirt should not smile
  src.morphAttributes = {};
  return src;
}

// Cut a garment out of a shell along a boundary, through the triangles rather than between them.
//
// `f(p)` is a signed field: positive inside the garment, negative outside, so the surface f = 0 is
// the hem. Every triangle it crosses is split there and the outside part discarded. Keeping or
// dropping whole triangles by their centroid — the previous approach — left every neckline, cuff and
// hem a sawtooth half a triangle deep, which at these mesh resolutions is several millimetres of
// visible zigzag on the most looked-at edges in the game.
//
// Cut vertices interpolate position and normal. Bone indices cannot be interpolated, so a cut vertex
// takes its skinning whole from whichever end of the edge it landed nearer; over half a triangle the
// weights are effectively identical.
export function clipGeometry(geo, f) {
  const pos = geo.attributes.position, idx = geo.index;
  if (!idx) return geo;
  const nrm = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const ia = idx.array, n0 = pos.count;
  const val = new Float32Array(n0), p = new THREE.Vector3();
  for (let i = 0; i < n0; i++) { p.fromBufferAttribute(pos, i); val[i] = f(p); }
  const P = [], N = [], SI = [], SW = [], out = [];
  for (let i = 0; i < n0; i++) {
    P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (nrm) N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    if (si) SI.push(si.getX(i), si.getY(i), si.getZ(i), si.getW(i));
    if (sw) SW.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i));
  }
  const cache = new Map();
  const cut = (a, b) => {
    const key = a < b ? a * n0 + b : b * n0 + a;
    const hit = cache.get(key); if (hit !== undefined) return hit;
    const t = val[a] / (val[a] - val[b]), near = t < 0.5 ? a : b;
    const v = P.length / 3;
    P.push(pos.getX(a) + (pos.getX(b) - pos.getX(a)) * t, pos.getY(a) + (pos.getY(b) - pos.getY(a)) * t, pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * t);
    if (nrm) N.push(nrm.getX(a) + (nrm.getX(b) - nrm.getX(a)) * t, nrm.getY(a) + (nrm.getY(b) - nrm.getY(a)) * t, nrm.getZ(a) + (nrm.getZ(b) - nrm.getZ(a)) * t);
    if (si) SI.push(si.getX(near), si.getY(near), si.getZ(near), si.getW(near));
    if (sw) SW.push(sw.getX(near), sw.getY(near), sw.getZ(near), sw.getW(near));
    cache.set(key, v); return v;
  };
  for (let i = 0; i < ia.length; i += 3) {
    const a = ia[i], b = ia[i + 1], c = ia[i + 2];
    const ka = val[a] >= 0, kb = val[b] >= 0, kc = val[c] >= 0;
    const k = (ka ? 1 : 0) + (kb ? 1 : 0) + (kc ? 1 : 0);
    if (k === 0) continue;
    if (k === 3) { out.push(a, b, c); continue; }
    // rotate the triangle so the odd vertex comes first; the cyclic order preserves the winding
    let A, B, C;
    if (k === 1) {
      if (ka) { A = a; B = b; C = c; } else if (kb) { A = b; B = c; C = a; } else { A = c; B = a; C = b; }
      out.push(A, cut(A, B), cut(C, A));
    } else {
      if (!ka) { A = a; B = b; C = c; } else if (!kb) { A = b; B = c; C = a; } else { A = c; B = a; C = b; }
      const ab = cut(A, B), ca = cut(C, A);
      out.push(ab, B, C, ab, C, ca);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (nrm) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (si) geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  if (sw) geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(out);
  return geo;
}

// Signed-field helpers for writing a garment boundary: `all` is intersection, `any` is union, and
// `above`/`below`/`within` are the half-spaces. Written this way a boundary reads like the boolean
// it replaced while still being something a triangle can be cut along.
export const above = (v, a) => v - a;
export const below = (v, a) => a - v;
export const all = (...v) => Math.min(...v);
export const any = (...v) => Math.max(...v);

// Polygonise a ball set (shared with the adult NPC builder). bounds: {min,max} Vector3 in body units. Returns indexed BufferGeometry in body units.
export function polygonise(balls, res, bounds, isolation = 1.0, smooth = 4) {
  // Vertex budget scales with the grid: a 96^3 arm overflowed the old fixed 200k buffer and came out
  // with its fingertips missing. Overflow is silent in three, so it is checked below.
  const budget = Math.max(200000, Math.round(res * res * res * 1.2));
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, budget);
  mc.isolation = isolation;
  const field = mc.field; field.fill(0);
  const carve = new Float32Array(field.length); // negative-strength balls, accumulated apart
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
          // p-norm accumulation, not a plain sum: see below. Positive and negative balls accumulate
          // separately — val^4 of a negative strength is positive, so a single shared accumulator
          // made every ball meant to carve (nostrils, the philtrum, an eye socket) add material
          // instead. The two are combined after the loop.
          const v4 = val * val, v8 = v4 * v4, i0 = z * n * n + y * n + x;
          if (val >= 0) field[i0] += v8; else carve[i0] += v8;
        } } }
  }
  // A plain sum of overlapping balls inflates without bound: a limb laid down as six overlapping
  // balls came out at two or three times its designed radius, which is exactly the "blob" look.
  // Accumulating val^4 and taking the fourth root gives a soft maximum — one ball is exactly its
  // radius, two touching balls fillet together with a bulge of at most 19%, six stacked on top of
  // each other bulge 57% instead of 600%. Joins stay smooth; nothing balloons.
  // Carving is deliberately gentler than adding. A nostril or a philtrum is authored smaller than one
  // grid cell, so subtracting at full strength does not cut a nostril — it aliases into a fold across
  // two cells. At this weight the same balls read as the shallow dimples they are meant to be.
  const CARVE = 0.35;
  const root4 = (v) => Math.sqrt(Math.sqrt(v));
  for (let i = 0; i < field.length; i++) {
    const add = field[i] > 0 ? root4(field[i]) : 0, sub = carve[i] > 0 ? root4(carve[i]) * CARVE : 0;
    field[i] = add - sub;
  }
  mc.update();
  const g = mc.geometry;
  const count = Math.max(0, Number.isFinite(g.drawRange.count) ? g.drawRange.count : 0);
  if (count >= budget * 3 - 3) console.warn(`[mesh] marching cubes hit its vertex budget at res ${res} — surface will be truncated`);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const p = g.attributes.position.array, nn = g.attributes.normal.array;
  for (let i = 0; i < count; i++) {
    // mc vertex coords are in [-1,1] -> map to bounds
    pos[i * 3] = bounds.min.x + (p[i * 3] * 0.5 + 0.5) * size.x;
    pos[i * 3 + 1] = bounds.min.y + (p[i * 3 + 1] * 0.5 + 0.5) * size.y;
    pos[i * 3 + 2] = bounds.min.z + (p[i * 3 + 2] * 0.5 + 0.5) * size.z;
    nor[i * 3] = nn[i * 3]; nor[i * 3 + 1] = nn[i * 3 + 1]; nor[i * 3 + 2] = nn[i * 3 + 2];
  }
  // Weld on POSITION ONLY. mergeVertices hashes every attribute it is given, and the normals that
  // marching cubes computes for the same edge from two neighbouring cells differ in their last bits
  // — so with normals present, coincident vertices refused to merge and the skin was left with long
  // seams that read as boundary edges. Normals are recomputed from the welded mesh afterwards.
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo = BufferGeometryUtils.mergeVertices(geo, 1e-5);
  dedupeFaces(geo);
  fillSmallHoles(geo);
  geo.computeVertexNormals();
  mc.geometry.dispose();
  void nor;
  if (smooth > 0) taubinSmooth(geo, smooth);
  return geo;
}

// Marching cubes emits the odd zero-area triangle (an interpolation weight of exactly 0 or 1 puts
// two corners on the same grid point) and, at ambiguous cells, the occasional face twice. After
// welding, both show up as edges shared by three or more triangles — a surface that is closed but
// not manifold, which breaks every downstream count. Drop them.
export function dedupeFaces(geo) {
  const idx = geo.index; if (!idx) return 0;
  const ia = idx.array, out = [], seen = new Set();
  let dropped = 0;
  for (let i = 0; i < ia.length; i += 3) {
    const a = ia[i], b = ia[i + 1], c = ia[i + 2];
    if (a === b || b === c || c === a) { dropped++; continue; }
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) { dropped++; continue; }
    seen.add(k); out.push(a, b, c);
  }
  if (dropped) geo.setIndex(out);
  return dropped;
}

// Marching cubes is not watertight: at the ambiguous cell configurations two neighbouring cells can
// pick different topologies for their shared face and leave a crack — a triangle or two missing
// from an otherwise closed skin. A crack you can see into is exactly what a body must never have,
// so after welding, the boundary edges are chained into loops and any small loop is capped. Large
// loops are left alone (they would be a real design problem, and the smoke test reports them).
export function fillSmallHoles(geo, maxLoop = 96) {
  const idx = geo.index; if (!idx) return 0;
  const ia = Array.from(idx.array);
  const edgeCount = new Map(), key = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
  for (let i = 0; i < ia.length; i += 3) {
    for (const [a, b] of [[ia[i], ia[i + 1]], [ia[i + 1], ia[i + 2]], [ia[i + 2], ia[i]]]) edgeCount.set(key(a, b), (edgeCount.get(key(a, b)) || 0) + 1);
  }
  // directed boundary edges, in the winding of the face that owns them
  const next = new Map();
  for (let i = 0; i < ia.length; i += 3) {
    for (const [a, b] of [[ia[i], ia[i + 1]], [ia[i + 1], ia[i + 2]], [ia[i + 2], ia[i]]]) {
      if (edgeCount.get(key(a, b)) === 1) next.set(a, b);
    }
  }
  let filled = 0;
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [start]; used.add(start);
    let v = next.get(start), ok = false;
    while (v != null && loop.length <= maxLoop) {
      if (v === start) { ok = true; break; }
      if (used.has(v)) break;
      loop.push(v); used.add(v); v = next.get(v);
    }
    if (!ok || loop.length < 3) continue;
    // cap with a fan, reversed so the new faces wind the same way as their neighbours
    for (let k = 1; k < loop.length - 1; k++) ia.push(loop[0], loop[k + 1], loop[k]);
    filled++;
  }
  if (filled) geo.setIndex(ia);
  return filled;
}

// Taubin smoothing (lambda/mu). Marching cubes leaves a faint terracing on curved skin — the grid
// shows through as facets, which is exactly what reads as "low-poly blob". A plain Laplacian pass
// would fix it and shrink the body doing so; alternating a positive and a slightly larger negative
// step relaxes the surface while holding the volume, so cheeks stay round and fingers stay attached.
export function taubinSmooth(geo, iterations = 4, lambda = 0.52, mu = -0.54) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!idx) return geo;
  const n = pos.count;
  // one-ring neighbours, built once
  const start = new Uint32Array(n + 1);
  const ia = idx.array;
  const edges = [];
  for (let i = 0; i < ia.length; i += 3) {
    const a = ia[i], b = ia[i + 1], c = ia[i + 2];
    edges.push(a, b, b, a, b, c, c, b, c, a, a, c);
  }
  for (let e = 0; e < edges.length; e += 2) start[edges[e] + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const cursor = start.slice(0, n);
  const nbr = new Uint32Array(edges.length / 2);
  for (let e = 0; e < edges.length; e += 2) nbr[cursor[edges[e]]++] = edges[e + 1];

  const p = pos.array;
  let src = Float32Array.from(p);
  let dst = new Float32Array(src.length);
  const step = (factor) => {
    for (let v = 0; v < n; v++) {
      const s = start[v], e = start[v + 1];
      const o = v * 3;
      if (e <= s) { dst[o] = src[o]; dst[o + 1] = src[o + 1]; dst[o + 2] = src[o + 2]; continue; }
      let ax = 0, ay = 0, az = 0;
      for (let k = s; k < e; k++) { const q = nbr[k] * 3; ax += src[q]; ay += src[q + 1]; az += src[q + 2]; }
      const inv = 1 / (e - s);
      dst[o] = src[o] + factor * (ax * inv - src[o]);
      dst[o + 1] = src[o + 1] + factor * (ay * inv - src[o + 1]);
      dst[o + 2] = src[o + 2] + factor * (az * inv - src[o + 2]);
    }
    const t = src; src = dst; dst = t;
  };
  for (let i = 0; i < iterations; i++) { step(lambda); step(mu); }
  pos.array.set(src);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function segDist(p, a, b) {
  const ab = b.clone().sub(a); const t = clamp01(p.clone().sub(a).dot(ab) / Math.max(1e-8, ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// Compute skin indices/weights by proximity to bone segments (soft, 3 nearest).
export function skinGeometry(geo, L, boneIndex) {
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

export function makeBones(L) {
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
  // Generous padding: the outermost grid layer is never polygonised, so anything that reaches it is
  // sliced open. The crown of the head used to sit in that layer.
  const bounds = { min: new THREE.Vector3(-reach, -0.08, -0.3), max: new THREE.Vector3(reach, L.totalH + 0.16, 0.32) };
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

  // Clothing: one shell offset off the body, cut into a onesie and a diaper. Cutting a garment out
  // of the whole-body shell is what keeps cloth at the shoulders and crotch — building it from a
  // subset of the balls left the shell rounding off into thin air where the subset ended, and skin
  // came through at exactly those seams.
  const P = L.P;
  const onesieShell = offsetShell(geo, P.torsoW * 0.055 + 0.0035);
  const sleeveEnd = L.J.elbowR.x + P.foreArm * 0.35;
  const onesieKeep = (p) => all(
    above(p.y, L.J.hips.y - P.thigh * 0.62), below(p.y, L.J.neck.y + P.neck * 0.4),
    any(below(Math.abs(p.x), P.torsoW + 0.02),
        all(below(Math.abs(p.x), sleeveEnd), above(p.y, L.J.hips.y + P.torsoLen * 0.45))),
  );
  clipGeometry(onesieShell, onesieKeep);
  const onesie = new THREE.SkinnedMesh(onesieShell, clothMat); onesie.castShadow = true; onesie.receiveShadow = true; onesie.frustumCulled = false; onesie.bind(skeleton);
  // A diaper is bulky, so it stands further off the skin than the onesie and, being outermost at the
  // hips, further off than the onesie stands too.
  const diaperShell = offsetShell(geo, P.torsoW * 0.13 + 0.006);
  const diaperKeep = (p) => all(
    above(p.y, L.J.hips.y - P.thigh * 0.42), below(p.y, L.J.hips.y + P.torsoLen * 0.26),
    below(Math.abs(p.x), P.torsoW + P.legR * 1.5),
  );
  clipGeometry(diaperShell, diaperKeep);
  const diaper = new THREE.SkinnedMesh(diaperShell, diaperMat); diaper.castShadow = true; diaper.frustumCulled = false; diaper.bind(skeleton);
  // A clip predicate that silently rejects everything leaves the child naked and nothing complains,
  // so the triangle counts come out with the model and the smoke asserts on them.
  const tris = (m) => (m.geometry.index ? m.geometry.index.count : 0) / 3;
  const garmentTris = { onesie: tris(onesie), diaper: tris(diaper) };
  const surface = new HeadSurface(geo, L.headCenter, L.P.headR);
  return { body, onesie, diaper, skeleton, bones: byName, layout: L, morphNames, surface, garmentTris };
}
