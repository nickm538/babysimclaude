// Face rig attached to the head bone: eyes with iris/pupil, eyelids that blink and squint, brows, ears,
// mouth cavity/tongue/lips (revealed by the cry/open morphs) and instanced hair strands.
import * as THREE from 'three';

function irisTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  const col = new THREE.Color(color), light = col.clone().lerp(new THREE.Color(0xffffff), 0.35), dark = col.clone().multiplyScalar(0.35);
  g.addColorStop(0, `#${dark.getHexString()}`); g.addColorStop(0.35, `#${col.getHexString()}`); g.addColorStop(0.7, `#${light.getHexString()}`); g.addColorStop(0.9, `#${col.getHexString()}`); g.addColorStop(1, '#1a1410');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  // fibres
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2 + Math.random() * 0.05; ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); ctx.lineTo(128 + Math.cos(a + 0.02) * 118, 128 + Math.sin(a + 0.02) * 118); ctx.stroke(); }
  ctx.fillStyle = '#050403'; ctx.beginPath(); ctx.arc(128, 128, 44, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildFace({ headBone, layout, skinMat, appearance, days, surface }) {
  const P = layout.P, R = P.headR;
  const hc = layout.headCenter.clone().sub(layout.J.head); // head center relative to head bone
  // place features on the measured skin surface (body-space direction from the head centre -> head-bone-local point)
  const onSurface = (dir, offset = 0) => surface.point(dir, offset).sub(layout.J.head);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = new THREE.Group(); face.name = 'face';
  headBone.add(face);
  const F = { group: face, eyes: [], lids: [], brows: [], gaze: new THREE.Vector3(0, 0, 1), blink: 0, squint: 0, browRaise: 0, browFurrow: 0 };

  const eyeR = R * 0.165;
  const scleraMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f6fa, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 });
  const irisMat = new THREE.MeshStandardMaterial({ map: irisTexture(appearance.eyeColor || '#4a3020'), roughness: 0.35 });
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const corneaMat = mobile ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.25, clearcoat: 1, envMapIntensity: 1.2 }) : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0, thickness: 0.002, transparent: true, opacity: 0.55, ior: 1.38, envMapIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.copy(onSurface(V(sx * 0.42, 0.05, 1), -eyeR * 0.62));
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 32, 24), scleraMat); ball.castShadow = false; eye.add(ball);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.01, 32, 16, 0, Math.PI * 2, 0, 0.62), irisMat); iris.rotation.x = Math.PI / 2; eye.add(iris);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.06, 24, 12, 0, Math.PI * 2, 0, 0.7), corneaMat); cornea.rotation.x = Math.PI / 2; cornea.scale.z = 1.15; eye.add(cornea);
    socket.add(eye);
    // lids: sphere caps slightly larger than the eye, skin material; upper rotates down to blink
    const lidGeo = new THREE.SphereGeometry(eyeR * 1.16, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const upper = new THREE.Mesh(lidGeo, skinMat); upper.rotation.x = -0.35; upper.scale.set(1.05, 1, 1.05); socket.add(upper);
    const lower = new THREE.Mesh(lidGeo, skinMat); lower.rotation.x = Math.PI + 0.42; lower.scale.set(1.05, 1, 1.05); socket.add(lower);
    // lashes: thin dark torus arc on the upper lid edge
    const lash = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.12, eyeR * 0.045, 6, 24, Math.PI * 0.95), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.9 }));
    lash.position.y = eyeR * 0.15; lash.rotation.set(Math.PI * 0.62, 0, Math.PI * 0.03); upper.add(lash);
    face.add(socket);
    F.eyes.push({ socket, eye, upper, lower, sx });
    // brow
    const brow = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.028, 8, 20, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: appearance.hairColor || '#4a2f1d', roughness: 0.95 }));
    brow.position.copy(onSurface(V(sx * 0.42, 0.34, 1), R * 0.01));
    brow.rotation.set(0.3, 0, Math.PI * 0.1 + sx * 0.05); brow.scale.set(1, 0.6, 0.35);
    face.add(brow); F.brows.push({ mesh: brow, sx, y0: brow.position.y, rz0: brow.rotation.z });
    // ear
    const ear = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 20, 14), skinMat);
    ear.position.copy(onSurface(V(sx, -0.02, -0.08), R * 0.04)); ear.scale.set(0.45, 1, 0.75); ear.rotation.y = sx * 0.3; face.add(ear);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(R * 0.11, 14, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(appearance.skinTone || '#f0c9ae').multiplyScalar(0.72), roughness: 0.9 }));
    concha.position.copy(onSurface(V(sx, -0.03, -0.05), R * 0.06)); concha.scale.set(0.35, 0.8, 0.6); face.add(concha);
  }
  // mouth: cavity (dark) + tongue + lips
  const mouthSurf = onSurface(V(0, -0.45, 1), 0);
  const mouthPos = onSurface(V(0, -0.45, 1), -R * 0.34);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 20, 14), new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 0.6 }));
  cavity.position.copy(mouthPos); cavity.scale.set(1.2, 0.8, 0.9); face.add(cavity);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd76a72, roughness: 0.45, clearcoat: 0.4 }));
  tongue.position.set(mouthPos.x, mouthPos.y - R * 0.06, mouthPos.z - R * 0.02); tongue.scale.set(1.1, 0.5, 1.2); face.add(tongue);
  const lipMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(appearance.skinTone || '#f0c9ae').lerp(new THREE.Color(0xd66c68), 0.55), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const upperLip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.045, 10, 26, Math.PI), lipMat);
  upperLip.position.copy(mouthSurf).add(V(0, R * 0.03, R * 0.01)); upperLip.rotation.set(-0.4, 0, 0); upperLip.scale.set(1, 0.5, 0.7); face.add(upperLip);
  const lowerLip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.19, R * 0.05, 10, 26, Math.PI), lipMat);
  lowerLip.position.copy(mouthSurf).add(V(0, -R * 0.02, R * 0.01)); lowerLip.rotation.set(0.5, 0, Math.PI); lowerLip.scale.set(1, 0.55, 0.7); face.add(lowerLip);
  F.mouth = { cavity, tongue, upperLip, lowerLip, y0: lowerLip.position.y, uy0: upperLip.position.y, R };
  // pacifier (hidden)
  const paci = new THREE.Group(); paci.position.copy(mouthSurf).add(V(0, 0, R * 0.05)); paci.visible = false;
  paci.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.03, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8fd3f4, roughness: 0.4 })));
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.26, R * 0.26, R * 0.05, 24), new THREE.MeshStandardMaterial({ color: 0x8fd3f4, roughness: 0.4 })); shield.rotation.x = Math.PI / 2; paci.add(shield);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.12, R * 0.03, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffffff })); ring.position.z = R * 0.1; ring.rotation.x = Math.PI / 2; paci.add(ring);
  face.add(paci); F.pacifier = paci;

  // hair: instanced tapered strands on the scalp; amount and length grow with age
  const amount = Math.max(0.05, Math.min(1, Number(appearance.hairAmount ?? 0.5) || 0.5));
  const count = Math.floor(120 + amount * 900 + Math.min(1, days / 700) * 2400);
  const len = R * (0.09 + amount * 0.1 + Math.min(1, days / 900) * 0.4);
  const strandGeo = new THREE.CylinderGeometry(R * 0.002, R * 0.008, len, 5, 3);
  strandGeo.translate(0, len / 2, 0);
  // bend strands
  const sp = strandGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); sp.setZ(i, sp.getZ(i) + (y / len) * (y / len) * len * 0.6); }
  const hairMat = new THREE.MeshStandardMaterial({ color: appearance.hairColor || '#3b2417', roughness: 0.55, metalness: 0.05 });
  const hair = new THREE.InstancedMesh(strandGeo, hairMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), nrm = new THREE.Vector3(), col = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const u = Math.random(), v = Math.random();
    const theta = Math.acos(1 - 2 * u), phi = v * Math.PI * 2; // uniform on sphere
    nrm.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    // scalp region: above brow line (y > 0.18R relative to center), not on the face (z < 0.55R when low)
    pos.copy(onSurface(nrm, -R * 0.01));
    const rel = pos.clone().sub(hc);
    if (rel.y < R * 0.12) continue;
    if (rel.z > R * 0.45 && rel.y < R * 0.55) continue;
    if (rel.z > R * 0.7) continue;
    const density = amount * (0.5 + 0.5 * Math.max(0, rel.y / R)); if (Math.random() > density + 0.35) continue;
    // orientation: along normal, tilted toward the back/down
    const dir = nrm.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, -0.5, -0.9)).normalize();
    q.setFromUnitVectors(up, dir);
    const s = 0.7 + Math.random() * 0.6;
    m.compose(pos, q, new THREE.Vector3(1, s, 1));
    hair.setMatrixAt(placed, m);
    col.set(hairMat.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12); hair.setColorAt(placed, col);
    placed++;
  }
  hair.count = Math.max(1, placed); hair.instanceMatrix.needsUpdate = true; if (hair.instanceColor) hair.instanceColor.needsUpdate = true;
  hair.castShadow = false; face.add(hair); F.hair = hair;
  if (days > 300) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
    const capR = surface.radius(new THREE.Vector3(0, 1, 0)); cap.scale.setScalar(capR / R * 1.02); cap.position.copy(hc).add(new THREE.Vector3(0, R * 0.02, -R * 0.1)); cap.rotation.x = -0.2; face.add(cap); F.cap = cap;
  }
  F.headCenterLocal = hc;
  return F;
}

// Per-frame face update. state: { blink 0..1, squint 0..1, browRaise -1..1, gazeTarget: Vector3 (world) | null, mouth: 'closed'|'suck', pacifier }
export function updateFace(F, dt, st, headBone) {
  // eyes track target
  if (st.gazeTarget) {
    const local = headBone.worldToLocal(st.gazeTarget.clone());
    for (const e of F.eyes) {
      const dir = local.clone().sub(e.socket.position).normalize();
      const yaw = THREE.MathUtils.clamp(Math.atan2(dir.x, dir.z), -0.45, 0.45), pitch = THREE.MathUtils.clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -0.35, 0.35);
      e.eye.rotation.y += (yaw - e.eye.rotation.y) * Math.min(1, dt * 10);
      e.eye.rotation.x += (pitch - e.eye.rotation.x) * Math.min(1, dt * 10);
    }
  } else for (const e of F.eyes) { e.eye.rotation.x *= 0.95; e.eye.rotation.y *= 0.95; }
  const close = Math.max(st.blink, st.squint * 0.75, st.sleep ? 1 : 0);
  for (const e of F.eyes) {
    const target = -0.35 + close * 1.75;
    e.upper.rotation.x += (target - e.upper.rotation.x) * Math.min(1, dt * (st.blink > 0.5 ? 30 : 12));
    const lowerT = Math.PI + 0.42 - close * 0.35 - st.smile * 0.25;
    e.lower.rotation.x += (lowerT - e.lower.rotation.x) * Math.min(1, dt * 10);
  }
  for (const b of F.brows) {
    const ty = b.y0 + st.browRaise * F.mouth.R * 0.06 - st.browFurrow * F.mouth.R * 0.04;
    b.mesh.position.y += (ty - b.mesh.position.y) * Math.min(1, dt * 8);
    const trz = b.rz0 + b.sx * (st.browFurrow * 0.35 - st.browRaise * 0.1);
    b.mesh.rotation.z += (trz - b.mesh.rotation.z) * Math.min(1, dt * 8);
  }
  const M = F.mouth;
  const open = st.cry * 1.0 + st.open * 0.7;
  M.lowerLip.position.y += ((M.y0 - open * M.R * 0.24) - M.lowerLip.position.y) * Math.min(1, dt * 12);
  M.upperLip.position.y += ((M.uy0 + open * M.R * 0.04) - M.upperLip.position.y) * Math.min(1, dt * 12);
  M.lowerLip.scale.x = 1 + st.smile * 0.25 + st.cry * 0.15;
  M.upperLip.scale.x = 1 + st.smile * 0.25 + st.cry * 0.15;
  M.tongue.position.y += ((M.y0 - M.R * 0.08 - open * M.R * 0.12) - M.tongue.position.y) * Math.min(1, dt * 10);
  F.pacifier.visible = !!st.pacifier;
}
