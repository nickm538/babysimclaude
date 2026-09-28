// The player's own forearm and hand, built as one continuous piece of flesh rather than a stack of
// capsules with a sphere for a palm. Same pipeline as the baby and the visitors: a metaball field
// polygonised with marching cubes, Taubin smoothed, skinned to a small hand rig.
//
// These are on screen every time you pick the baby up, so they are the most-looked-at geometry in
// the game. A joint you can see the seam of is the thing that breaks the illusion.
import * as THREE from 'three';
import { polygonise, skinGeometry, taubinSmooth, clipGeometry, handBalls } from './babyMesh.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;

// An adult arm from mid-upper-arm to fingertips, lying along +Z with the palm facing -Y.
// sx: -1 left, +1 right. Everything in metres.
export function armLayout(sx = 1) {
  const J = {};
  J.shoulder = V(0, 0, 0);
  J.elbow = V(0, 0, 0.26);
  J.wrist = V(0, 0, 0.52);
  J.palm = V(0, 0, 0.60);
  J.knuckles = V(0, 0, 0.665);
  J.fingerTip = V(0, 0, 0.775);
  J.thumbBase = V(sx * 0.035, -0.008, 0.585);
  J.thumbTip = V(sx * 0.075, -0.012, 0.665);
  const bones = [
    ['upperArm', 'shoulder', 'elbow', null],
    ['foreArm', 'elbow', 'wrist', 'upperArm'],
    ['hand', 'wrist', 'knuckles', 'foreArm'],
    ['fingers', 'knuckles', 'fingerTip', 'hand'],
    ['thumb', 'thumbBase', 'thumbTip', 'hand'],
  ];
  return { J, bones, sx, headCenter: V(0, 0, 0), P: {} };
}

// Anatomy notes that matter to the silhouette: a forearm is widest a third of the way down from the
// elbow (the brachioradialis) and narrowest at the wrist; a palm is a wedge, thicker at the thumb
// side; knuckles are lumps, not a straight edge; fingers taper and the middle one is longest.
function armBalls(L) {
  const { J, sx } = L, B = [];
  const ball = (p, r, s = 1) => B.push([p.x, p.y, p.z, r, s]);
  const seg = (a, b, r0, r1, n, s = 1) => { for (let i = 0; i <= n; i++) { const t = i / n; B.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(r0, r1, t), s]); } };

  // upper arm, tapering into the elbow
  seg(J.shoulder, J.elbow, 0.058, 0.043, 5);
  ball(J.elbow, 0.044, 0.9);
  // forearm: swell then taper hard to the wrist
  const brach = J.elbow.clone().lerp(J.wrist, 0.28);
  seg(J.elbow, brach, 0.043, 0.049, 3);
  seg(brach, J.wrist, 0.049, 0.028, 6);
  ball(V(J.wrist.x, J.wrist.y - 0.004, J.wrist.z), 0.027, 0.85);

  // the hand: the same anatomical recipe as every other hand in the game, palm facing -Y
  handBalls(B, J.wrist, J.fingerTip, sx, V(0, 1, 0), 1);
  return B;
}

// Sleeve: the whole arm inflated, then cut at the cuff. Building it from a subset of balls left the
// shoulder end open — a hollow tube you could see the arm sitting inside of.
const sleeveBalls = (balls) => balls.map(([x, y, z, r, s]) => [x, y, z, r * 1.1 + 0.006, s]);
const CUFF_Z = 0.38;

export function buildArm({ sx = 1, skinMat, sleeveMat, mobile = false }) {
  const L = armLayout(sx);
  const balls = armBalls(L);
  // The shoulder end sits well inside the bounds so the isosurface closes into a rounded stump
  // (never seen — it is behind the camera) instead of being sliced open by the grid edge.
  const bounds = {
    min: V(sx > 0 ? -0.085 : -0.12, -0.085, -0.14),
    max: V(sx > 0 ? 0.12 : 0.085, 0.085, 0.82),
  };
  const res = mobile ? 72 : 96;
  const geo = polygonise(balls, res, bounds, 1.0, mobile ? 2 : 4);

  // small hand rig
  const bones = [], byName = {};
  for (const [name, a, b, parent] of L.bones) {
    const bone = new THREE.Bone(); bone.name = name;
    const start = L.J[a], end = L.J[b];
    if (parent) { const p = L.J[L.bones.find((x) => x[0] === parent)[1]]; bone.position.copy(start.clone().sub(p)); }
    else bone.position.copy(start);
    bone.userData.end = end;
    byName[name] = bone; bones.push(bone);
  }
  for (const [name, , , parent] of L.bones) { if (parent) byName[parent].add(byName[name]); }
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  skinGeometry(geo, L, boneIndex);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geo, skinMat);
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  mesh.add(bones[0]); mesh.bind(skeleton);

  const sb = sleeveBalls(balls);
  let sleeve = null;
  if (sb.length) {
    const sg = polygonise(sb, Math.round(res * 0.7), bounds, 1.0, 2);
    clipGeometry(sg, (p) => p.z < CUFF_Z);
    skinGeometry(sg, L, boneIndex);
    sleeve = new THREE.SkinnedMesh(sg, sleeveMat);
    sleeve.castShadow = true; sleeve.frustumCulled = false;
    sleeve.bind(skeleton);
    mesh.add(sleeve);
  }
  return { mesh, sleeve, bones: byName, skeleton, layout: L };
}

export { taubinSmooth };
