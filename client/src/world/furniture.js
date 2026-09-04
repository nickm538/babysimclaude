// Furniture and props. Everything is built from primitives with procedural PBR textures.
import * as THREE from 'three';
import { woodTexture, fabricTexture, rugTexture, plasterTexture, stdMaterial, clothMaterial, matte, mulberry32 } from '../engine/textures.js';

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
const rounded = (w, h, d, r, mat) => { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: 4, curveSegments: 8 }); geo.center(); const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; };

export function buildFurniture(g, colliders, interactables, opts) {
  const F = {};
  // Seeded, so the books on the shelf and the set of the leaves are the same every time this house
  // is built — a room that reshuffles itself on every reload does not feel like a home.
  const rand = mulberry32((opts && opts.seed) || 7);
  const wood = stdMaterial(woodTexture({ base: '#b98b5f', dark: '#7d5535', repeat: 1.5, planks: 1, seed: 3 }), { roughness: 0.5 });
  const darkWood = stdMaterial(woodTexture({ base: '#5c3d2a', dark: '#33200f', repeat: 1.5, planks: 1, seed: 4 }), { roughness: 0.45 });
  // Painted furniture is a satin coat over timber: a faint grain shows through, and the roughness
  // varies with it. A flat white was the one material in the room that looked like a render.
  const white = stdMaterial(woodTexture({ base: '#f7f5f0', dark: '#e9e4da', repeat: 2.2, planks: 1, seed: 11 }), { roughness: 0.5, normalScale: new THREE.Vector2(0.25, 0.25) });
  // Upholstery gets sheen: a sofa arm without it is a painted board however good the weave map is.
  const sofaFab = clothMaterial(fabricTexture({ color: '#6b7f92', repeat: 3 }), { sheen: 0.7, sheenTint: 0.55 });
  const cushionFab = clothMaterial(fabricTexture({ color: '#c9a86a', repeat: 2, weave: 4 }), { sheen: 0.85, sheenTint: 0.7 });
  const chrome = matte({ color: 0xcfd3d8, metalness: 0.9, roughness: 0.3 });
  const add = (m, coll, inter) => { g.add(m); if (coll) colliders.push(coll); if (inter) { m.userData.interact = inter; interactables.push(m); } return m; };

  // rug
  // The rug is a real slab with thickness, not a decal lying on the boards — it catches its own
  // contact shadow at the edge and reads as something you could trip on.
  const rugMat = clothMaterial(rugTexture(), { sheen: 0.35, sheenTint: 0.3, extra: { roughness: 1 } });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.016, 3.2), rugMat);
  rug.position.set(0.8, 0.008, 0.6); rug.receiveShadow = true; rug.castShadow = true; g.add(rug);

  // sofa
  const sofa = new THREE.Group(); sofa.position.set(0.5, 0, 1.9);
  sofa.add(rounded(2.2, 0.42, 0.9, 0.08, sofaFab).translateY(0.24));
  const back = rounded(2.2, 0.55, 0.22, 0.08, sofaFab); back.position.set(0, 0.7, 0.36); sofa.add(back);
  for (const sx of [-1, 1]) { const arm = rounded(0.22, 0.6, 0.9, 0.08, sofaFab); arm.position.set(sx * 1.05, 0.32, 0); sofa.add(arm); }
  for (const sx of [-0.55, 0.55]) { const c = rounded(0.95, 0.14, 0.8, 0.05, sofaFab); c.position.set(sx, 0.5, -0.02); sofa.add(c); }
  const pillow = rounded(0.42, 0.42, 0.14, 0.06, cushionFab); pillow.position.set(-0.7, 0.72, 0.22); pillow.rotation.x = -0.15; sofa.add(pillow);
  for (const [x, z] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) sofa.add(cyl(0.03, 0.025, 0.1, darkWood, x, 0.05, z));
  F.sofa = add(sofa, { min: { x: -0.65, z: 1.4 }, max: { x: 1.65, z: 2.4 } }, { id: 'sofa', label: 'Sofa' });

  // coffee table with tablet
  const table = new THREE.Group(); table.position.set(0.5, 0, 0.2);
  table.add(box(1.1, 0.04, 0.55, wood, 0, 0.42, 0));
  for (const [x, z] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]]) table.add(cyl(0.02, 0.02, 0.42, darkWood, x, 0.21, z));
  const tablet = box(0.24, 0.012, 0.17, matte({ color: 0x1a1a1f, roughness: 0.3, metalness: 0.4 }), 0.2, 0.45, 0.05); tablet.rotation.y = 0.3;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.14), new THREE.MeshPhysicalMaterial({ color: 0x1b2a44, emissive: 0x3d6fb8, emissiveIntensity: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 })); screen.rotation.x = -Math.PI / 2; screen.position.y = 0.007; tablet.add(screen);
  table.add(tablet); tablet.userData.interact = { id: 'tablet', label: 'Tablet' }; interactables.push(tablet);
  const mug = cyl(0.04, 0.035, 0.09, white, -0.35, 0.485, 0.1); table.add(mug);
  F.table = add(table, { min: { x: -0.1, z: -0.1 }, max: { x: 1.1, z: 0.5 } });

  // TV console + TV on north wall
  const tvc = new THREE.Group(); tvc.position.set(-1, 0, -4.55);
  tvc.add(box(1.6, 0.5, 0.42, darkWood, 0, 0.25, 0));
  const tv = box(1.3, 0.75, 0.04, matte({ color: 0x0d0d10, roughness: 0.25, metalness: 0.5 }), 0, 0.95, 0.05);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.69), new THREE.MeshPhysicalMaterial({ color: 0x07090e, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 })); tvScreen.position.z = 0.021; tv.add(tvScreen); tvc.add(tv);
  F.tv = add(tvc, { min: { x: -1.85, z: -5 }, max: { x: -0.15, z: -4.3 } });

  // bookshelf
  const shelf = new THREE.Group(); shelf.position.set(-3.2, 0, -4.7);
  shelf.add(box(1.0, 1.9, 0.3, wood, 0, 0.95, 0));
  for (let i = 0; i < 4; i++) { const row = box(0.92, 0.03, 0.28, darkWood, 0, 0.3 + i * 0.44, 0.01); shelf.add(row); for (let b = 0; b < 7; b++) { const bk = box(0.05 + rand() * 0.03, 0.22 + rand() * 0.08, 0.2, matte({ color: new THREE.Color().setHSL(rand(), 0.5, 0.4), roughness: 0.8 }), -0.4 + b * 0.12, 0.44 + i * 0.44, 0.02); shelf.add(bk); } }
  F.shelf = add(shelf, { min: { x: -3.75, z: -5 }, max: { x: -2.65, z: -4.5 } }, { id: 'bookshelf', label: 'Bookshelf' });

  // floor lamp
  const lamp = new THREE.Group(); lamp.position.set(2.2, 0, 3.6);
  lamp.add(cyl(0.14, 0.16, 0.02, chrome, 0, 0.01, 0)); lamp.add(cyl(0.012, 0.012, 1.4, chrome, 0, 0.7, 0));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 24, 1, true), matte({ color: 0xf3e2c2, roughness: 1, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0 })); shade.position.y = 1.45; lamp.add(shade); F.lampShade = shade;
  F.lamp = add(lamp, { min: { x: 2.0, z: 3.4 }, max: { x: 2.4, z: 3.8 } });

  // plant
  const plant = new THREE.Group(); plant.position.set(5.4, 0, 4.4);
  plant.add(cyl(0.18, 0.14, 0.32, matte({ color: 0xb5714e, roughness: 0.9 }), 0, 0.16, 0));
  const leafMat = matte({ color: 0x3f7a3a, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) { const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.5, 1, 4), leafMat); const p = leaf.geometry.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.pow(p.getY(k) + 0.25, 2) * 0.6); leaf.geometry.computeVertexNormals(); leaf.position.y = 0.5; leaf.rotation.set(-0.3 - rand() * 0.4, i * 0.7, 0); leaf.castShadow = true; plant.add(leaf); }
  F.plant = add(plant, { min: { x: 5.2, z: 4.2 }, max: { x: 5.6, z: 4.6 } });

  // --- nursery nook ---
  // crib
  const crib = new THREE.Group(); crib.position.set(4.6, 0, -3.5);
  crib.add(box(1.3, 0.05, 0.75, white, 0, 0.6, 0)); // mattress base
  const mattress = box(1.22, 0.14, 0.68, clothMaterial(fabricTexture({ color: '#f2eee6', repeat: 4, weave: 3 }), { sheen: 0.4, sheenTint: 0.5 }), 0, 0.7, 0); crib.add(mattress);
  const sheet = box(1.2, 0.02, 0.66, clothMaterial(fabricTexture({ color: '#cfe0f2', repeat: 5, weave: 2 }), { sheen: 0.5, sheenTint: 0.6 }), 0, 0.78, 0); crib.add(sheet);
  for (const sz of [-1, 1]) for (let i = 0; i < 12; i++) crib.add(cyl(0.012, 0.012, 0.9, white, -0.6 + i * 0.109, 0.9, sz * 0.36, 8));
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) crib.add(cyl(0.012, 0.012, 0.9, white, sx * 0.62, 0.9, -0.3 + i * 0.12, 8));
  for (const sz of [-1, 1]) crib.add(box(1.32, 0.05, 0.05, white, 0, 1.33, sz * 0.37));
  for (const sx of [-1, 1]) crib.add(box(0.05, 0.05, 0.78, white, sx * 0.64, 1.33, 0));
  for (const [x, z] of [[-0.62, -0.36], [0.62, -0.36], [-0.62, 0.36], [0.62, 0.36]]) crib.add(cyl(0.025, 0.025, 1.36, white, x, 0.68, z, 10));
  // mobile
  const mobile = new THREE.Group(); mobile.position.set(0, 1.35, 0);
  mobile.add(cyl(0.01, 0.01, 0.9, chrome, 0, 0.45, 0, 8)); const arm = cyl(0.01, 0.01, 0.5, chrome, 0.25, 0.9, 0, 8); arm.rotation.z = Math.PI / 2; mobile.add(arm);
  const hub = new THREE.Group(); hub.position.set(0.5, 0.9, 0);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), matte({ color: [0xff8a80, 0xffd54f, 0x80d8ff, 0xb9f6ca, 0xea80fc][i], roughness: 0.6 })); s.position.set(Math.cos(a) * 0.2, -0.28, Math.sin(a) * 0.2); hub.add(s); const str = cyl(0.002, 0.002, 0.28, chrome, Math.cos(a) * 0.2, -0.14, Math.sin(a) * 0.2, 4); hub.add(str); }
  mobile.add(hub); crib.add(mobile); F.mobileHub = hub;
  F.crib = add(crib, { min: { x: 3.95, z: -3.9 }, max: { x: 5.25, z: -3.1 } }, { id: 'crib', label: 'Crib' });
  // toddler bed (hidden until owned)
  const tbed = new THREE.Group(); tbed.position.set(4.6, 0, -3.5); tbed.visible = false;
  tbed.add(box(1.5, 0.3, 0.8, wood, 0, 0.15, 0)); tbed.add(box(1.42, 0.1, 0.72, stdMaterial(fabricTexture({ color: '#f5efe3', repeat: 4 }), {}), 0, 0.34, 0)); tbed.add(box(1.5, 0.35, 0.05, wood, 0, 0.5, -0.38)); tbed.add(box(0.05, 0.25, 0.8, wood, -0.73, 0.45, 0));
  F.toddlerBed = add(tbed);
  // changing table
  const ct = new THREE.Group(); ct.position.set(4.6, 0, -1.2);
  ct.add(box(1.0, 0.85, 0.6, white, 0, 0.425, 0)); ct.add(box(1.04, 0.05, 0.64, white, 0, 0.87, 0));
  const pad = rounded(0.9, 0.08, 0.5, 0.03, stdMaterial(fabricTexture({ color: '#dfe9dc', repeat: 3 }), {})); pad.position.y = 0.93; ct.add(pad);
  for (let i = 0; i < 2; i++) ct.add(box(0.9, 0.3, 0.02, wood, 0, 0.25 + i * 0.36, 0.3)); // drawer fronts
  for (let i = 0; i < 2; i++) ct.add(cyl(0.015, 0.015, 0.08, chrome, 0, 0.25 + i * 0.36, 0.33, 8).rotateX(Math.PI / 2));
  const wipes = box(0.18, 0.08, 0.1, matte({ color: 0x6fbbe0, roughness: 0.5 }), 0.35, 0.98, -0.15); ct.add(wipes);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.16, 24, 1, true), matte({ color: 0xbfe3ef, roughness: 0.3, side: THREE.DoubleSide })); tub.scale.z = 0.6; tub.position.y = 1.0; tub.visible = false; ct.add(tub); F.tub = tub;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshPhysicalMaterial({ color: 0x9cd3ea, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, sheen: 0.2, sheenColor: new THREE.Color(0xffffff) })); water.rotation.x = -Math.PI / 2; water.scale.y = 0.6; water.position.y = 1.03; water.visible = false; ct.add(water); F.water = water;
  F.changingTable = add(ct, { min: { x: 4.1, z: -1.5 }, max: { x: 5.1, z: -0.9 } }, { id: 'changing_table', label: 'Changing table' });
  // dresser
  const dresser = new THREE.Group(); dresser.position.set(5.5, 0, 0.8);
  dresser.add(box(0.5, 0.95, 1.0, wood, 0, 0.475, 0)); for (let i = 0; i < 3; i++) dresser.add(box(0.02, 0.26, 0.9, darkWood, -0.26, 0.18 + i * 0.3, 0));
  F.dresser = add(dresser, { min: { x: 5.2, z: 0.3 }, max: { x: 5.8, z: 1.3 } }, { id: 'dresser', label: 'Wardrobe' });
  // rocking chair
  const rc = new THREE.Group(); rc.position.set(3.0, 0, -3.8); rc.rotation.y = 0.6;
  // Built like a real nursing chair: curved rockers, splayed legs, a spindle back with turned beads,
  // arms you could rest an elbow on, and a cushion. The flat board that used to be the back was the
  // most obviously fake object in the nursery.
  const seat = rounded(0.56, 0.07, 0.5, 0.03, wood); seat.position.set(0, 0.45, 0); rc.add(seat);
  const cushion = rounded(0.5, 0.09, 0.44, 0.04, cushionFab); cushion.position.set(0, 0.52, 0.01); rc.add(cushion);
  for (const sx of [-1, 1]) {
    // rockers as an arc of short segments, so they curve rather than being a straight bar
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * 0.62;
      const seg = box(0.045, 0.035, 0.09, darkWood, sx * 0.26, 0.028 + t * t * 0.55, t);
      seg.rotation.x = -t * 1.5; rc.add(seg);
    }
    for (const sz of [-0.19, 0.19]) {
      const leg = cyl(0.022, 0.028, 0.42, darkWood, sx * 0.26, 0.24, sz, 10);
      leg.rotation.x = sz > 0 ? 0.06 : -0.06; rc.add(leg);
    }
    const arm = rounded(0.07, 0.05, 0.46, 0.02, wood); arm.position.set(sx * 0.29, 0.68, -0.02); rc.add(arm);
    rc.add(cyl(0.018, 0.018, 0.24, darkWood, sx * 0.29, 0.57, 0.18, 8));
    rc.add(cyl(0.026, 0.026, 0.58, wood, sx * 0.26, 0.74, -0.23, 10));
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.18 + i * 0.09;
    rc.add(cyl(0.013, 0.016, 0.5, wood, x, 0.72, -0.23, 8));
    rc.add(cyl(0.021, 0.021, 0.05, wood, x, 0.62, -0.23, 8));   // a turned bead partway up
  }
  const rail = rounded(0.58, 0.09, 0.05, 0.02, wood); rail.position.set(0, 1.02, -0.23); rc.add(rail);
  F.rocker = add(rc, { min: { x: 2.65, z: -4.15 }, max: { x: 3.35, z: -3.45 } }, { id: 'rocker', label: 'Rocking chair' });
  // nightlight
  const nl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matte({ color: 0xffd9a8, emissive: 0xffb070, emissiveIntensity: 0.6 })); nl.position.set(5.86, 0.35, -3.0); g.add(nl); F.nightlightMesh = nl;

  // play mat + toys
  const mat = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), stdMaterial(fabricTexture({ color: '#9ecbb5', repeat: 5, weave: 5 }), { roughness: 1 })); mat.rotation.x = -Math.PI / 2; mat.position.set(3.0, 0.02, 1.5); mat.receiveShadow = true; mat.userData.interact = { id: 'play_mat', label: 'Play mat' }; interactables.push(mat); g.add(mat); F.playMat = mat;
  F.toys = new THREE.Group(); F.toys.position.set(3.0, 0, 1.5); g.add(F.toys);
  const toyMats = [0xff6f61, 0xffd166, 0x06d6a0, 0x118ab2, 0x8338ec];
  for (let i = 0; i < 4; i++) { const b = box(0.1, 0.1, 0.1, matte({ color: toyMats[i], roughness: 0.6 }), -0.5 + i * 0.13, 0.05, 0.55); b.rotation.y = i * 0.5; F.toys.add(b); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 24), matte({ color: 0xff6f61, roughness: 0.45 })); ball.position.set(0.55, 0.11, -0.3); ball.castShadow = true; F.toys.add(ball); F.ball = ball;
  const rattle = new THREE.Group(); rattle.position.set(-0.4, 0.04, -0.4); rattle.add(cyl(0.012, 0.012, 0.14, white, 0, 0, 0, 8).rotateZ(Math.PI / 2)); const rh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), matte({ color: 0x118ab2, roughness: 0.5 })); rh.position.x = 0.1; rattle.add(rh); F.toys.add(rattle);
  const book = box(0.18, 0.02, 0.15, matte({ color: 0xffd166, roughness: 0.8 }), 0.2, 0.01, 0.6); F.toys.add(book);

  // The clutter a house with a baby actually has. A room that is tidy and sparse reads as a
  // showroom; the muslins over the sofa arm, the basket of washing nobody folded and the mug you
  // put down two hours ago are what make it look lived in.
  const clutter = new THREE.Group(); g.add(clutter); F.clutter = clutter;
  // laundry basket with a heap of washing
  const basket = new THREE.Group(); basket.position.set(-1.9, 0, 2.9); basket.rotation.y = 0.4;
  basket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.3, 18, 1, true), clothMaterial(fabricTexture({ color: '#d8cbb4', repeat: 6, weave: 2, seed: 12 }), { sheen: 0.3, extra: { side: THREE.DoubleSide } })).translateY(0.15));
  for (let i = 0; i < 5; i++) {
    const c = ['#e7dfd2', '#bcd8f2', '#f7cdb9', '#cfd2d6', '#bfe6d2'][i];
    const heap = new THREE.Mesh(new THREE.SphereGeometry(0.09 + rand() * 0.04, 12, 9), clothMaterial(fabricTexture({ color: c, repeat: 8, weave: 3, seed: 20 + i }), { sheen: 0.5 }));
    heap.position.set((rand() - 0.5) * 0.22, 0.3 + rand() * 0.05, (rand() - 0.5) * 0.22);
    heap.scale.set(1, 0.55, 1); heap.rotation.y = rand() * 3; heap.castShadow = true; basket.add(heap);
  }
  clutter.add(basket);
  // muslins over the sofa arm
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.34), clothMaterial(fabricTexture({ color: i ? '#f5f1ea' : '#bfe6d2', repeat: 10, weave: 2, seed: 30 + i }), { sheen: 0.6 }));
    m.position.set(-0.55 + i * 0.06, 0.63 - i * 0.02, 1.9 + i * 0.05); m.rotation.set(0.1, 0.3 + i * 0.4, 0.35);
    m.castShadow = m.receiveShadow = true; clutter.add(m);
  }
  // a mug and a half-read book on the floor by the sofa
  clutter.add(cyl(0.042, 0.036, 0.095, white, 1.55, 0.05, 1.45, 18));
  const floorBook = box(0.2, 0.03, 0.16, matte({ color: 0xc96f5a, roughness: 0.75 }), 1.15, 0.015, 1.15);
  floorBook.rotation.y = 0.5; clutter.add(floorBook);
  // a nappy stack and a wipes pack left out on the floor near the changing table
  const stack = box(0.22, 0.14, 0.16, clothMaterial(fabricTexture({ color: '#eef2f6', repeat: 12, weave: 2, seed: 41 }), { sheen: 0.35 }), 4.0, 0.07, -0.55);
  stack.rotation.y = -0.3; clutter.add(stack);
  // a toy left where it was dropped, in the middle of the floor
  const stray = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 14), matte({ color: 0x8338ec, roughness: 0.5 }));
  stray.position.set(1.9, 0.055, 0.05); stray.castShadow = true; clutter.add(stray);

  // playpen (hidden until owned)
  const pen = new THREE.Group(); pen.position.set(-2.5, 0, 1.2); pen.visible = false;
  const penMat = clothMaterial(fabricTexture({ color: '#dedede', repeat: 10, weave: 2, seed: 8 }), { sheen: 0.3, sheenTint: 0.4, extra: { side: THREE.DoubleSide } });
  for (const [x, z, w, d] of [[0, -0.7, 1.4, 0.03], [0, 0.7, 1.4, 0.03], [-0.7, 0, 0.03, 1.4], [0.7, 0, 0.03, 1.4]]) pen.add(box(w, 0.75, d, penMat, x, 0.38, z));
  pen.add(box(1.4, 0.04, 1.4, stdMaterial(fabricTexture({ color: '#d9d2c5', repeat: 3 }), {}), 0, 0.02, 0));
  F.playpen = add(pen, null, { id: 'playpen', label: 'Playpen' });

  // --- kitchen corner ---
  const counterMat = matte({ color: 0xe8e4dc, roughness: 0.35 });
  const cab = stdMaterial(woodTexture({ base: '#d9d2c6', dark: '#b7ad9d', repeat: 1, planks: 1, seed: 9 }), { roughness: 0.6 });
  const kitchen = new THREE.Group(); kitchen.position.set(-5.65, 0, -3.0);
  kitchen.add(box(0.6, 0.88, 3.0, cab, 0, 0.44, 0)); kitchen.add(box(0.66, 0.05, 3.06, counterMat, 0, 0.905, 0));
  const sink = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.5), chrome); sink.position.set(0, 0.86, 0.6); kitchen.add(sink);
  const tap = cyl(0.012, 0.012, 0.25, chrome, -0.2, 1.05, 0.6, 8); kitchen.add(tap);
  const warmer = box(0.16, 0.14, 0.16, matte({ color: 0xf3f3f3, roughness: 0.4 }), 0.05, 1.0, -0.6); kitchen.add(warmer);
  const bottle = new THREE.Group(); bottle.position.set(0.05, 1.07, -0.35);
  bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 20), new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) })));
  const nip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 16), matte({ color: 0xf0c9a8, roughness: 0.6 })); nip.position.y = 0.09; bottle.add(nip);
  const milk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 16), matte({ color: 0xfff8e8 })); milk.position.y = -0.015; bottle.add(milk);
  kitchen.add(bottle); F.bottle = bottle;
  kitchen.userData.interact = { id: 'kitchen', label: 'Kitchen counter' }; interactables.push(kitchen);
  F.kitchen = add(kitchen, { min: { x: -6, z: -4.6 }, max: { x: -5.3, z: -1.4 } });
  const fridge = box(0.7, 1.8, 0.7, matte({ color: 0xdfe3e6, metalness: 0.6, roughness: 0.35 }), -5.6, 0.9, -0.55);
  fridge.add(box(0.02, 0.5, 0.03, chrome, 0.36, 0.2, 0.2)); F.fridge = add(fridge, { min: { x: -6, z: -0.95 }, max: { x: -5.2, z: -0.15 } }, { id: 'fridge', label: 'Fridge' });
  // high chair (hidden until owned)
  const hc = new THREE.Group(); hc.position.set(-3.5, 0, -2.5); hc.visible = false;
  hc.add(box(0.4, 0.04, 0.4, wood, 0, 0.62, 0)); hc.add(box(0.4, 0.35, 0.04, wood, 0, 0.82, -0.18)); hc.add(box(0.5, 0.03, 0.3, white, 0, 0.9, 0.2));
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) hc.add(cyl(0.015, 0.015, 0.62, wood, x, 0.31, z, 8));
  F.highChair = add(hc, null, { id: 'high_chair', label: 'High chair' });
  // potty (hidden)
  const potty = new THREE.Group(); potty.position.set(5.3, 0, -0.2); potty.visible = false;
  potty.add(cyl(0.16, 0.13, 0.22, matte({ color: 0x8ad0ea, roughness: 0.5 }), 0, 0.11, 0));
  F.potty = add(potty, null, { id: 'potty', label: 'Potty' });

  // package at door (hidden)
  const pkg = box(0.45, 0.32, 0.35, matte({ color: 0xc19a6b, roughness: 0.9 }), -1.5, 0.16, 4.25);
  pkg.add(box(0.46, 0.02, 0.06, matte({ color: 0xa87c4f }), 0, 0.16, 0)); pkg.visible = false;
  F.package = add(pkg, null, { id: 'package', label: 'Package' });
  // nurse silhouette at door (hidden)
  const nurse = new THREE.Group(); nurse.position.set(-0.4, 0, 4.4); nurse.visible = false;
  nurse.add(cyl(0.18, 0.2, 1.3, matte({ color: 0x6fb1e0, roughness: 0.8 }), 0, 0.65, 0)); nurse.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), matte({ color: 0xd9a982, roughness: 0.7 })).translateY(1.45)); nurse.add(box(0.34, 0.25, 0.14, matte({ color: 0xffffff }), 0.3, 0.9, 0));
  F.nurse = add(nurse, null, { id: 'nurse', label: 'Visiting nurse' });

  // baby-proofing visuals
  F.proof = {};
  const cover = () => box(0.06, 0.09, 0.01, white, 0, 0, 0);
  F.proof.outlet_covers = new THREE.Group(); for (const [x, z, ry] of [[1.2, -4.88, 0], [-4.5, -4.88, 0], [5.88, 2.5, -Math.PI / 2], [3.5, 4.88, Math.PI]]) { const c = cover(); c.position.set(x, 0.3, z); c.rotation.y = ry; F.proof.outlet_covers.add(c); } F.proof.outlet_covers.visible = false; g.add(F.proof.outlet_covers);
  F.proof.corner_guards = new THREE.Group(); for (const [x, z] of [[-0.05, -0.075], [1.05, -0.075], [-0.05, 0.475], [1.05, 0.475]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), new THREE.MeshPhysicalMaterial({ color: 0xe8e8e8, roughness: 0.75, sheen: 0.4, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.15 })); c.position.set(x, 0.42, z); F.proof.corner_guards.add(c); } F.proof.corner_guards.visible = false; g.add(F.proof.corner_guards);
  F.proof.cabinet_locks = new THREE.Group(); for (let i = 0; i < 3; i++) { const l = box(0.03, 0.03, 0.06, white, -5.33, 0.75, -4.0 + i * 1.0); F.proof.cabinet_locks.add(l); } F.proof.cabinet_locks.visible = false; g.add(F.proof.cabinet_locks);
  F.proof.anchors = new THREE.Group(); const strap = box(0.03, 0.4, 0.01, matte({ color: 0xdddddd }), -3.2, 2.05, -4.85); F.proof.anchors.add(strap); F.proof.anchors.visible = false; g.add(F.proof.anchors);
  F.proof.cord_clips = new THREE.Group(); const clip = box(0.04, 0.06, 0.02, white, 4.4, 2.1, -4.85); F.proof.cord_clips.add(clip); F.proof.cord_clips.visible = false; g.add(F.proof.cord_clips);
  F.proof.small_objects = new THREE.Group(); F.proof.small_objects.visible = false; g.add(F.proof.small_objects);
  // small hazardous objects on the floor (shown until cleared)
  F.smallObjects = new THREE.Group(); for (const [x, z, c] of [[1.9, -1.4, 0x888888], [-1.0, 2.9, 0xff4444], [2.8, 0.2, 0x333333]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), matte({ color: c, metalness: 0.3, roughness: 0.5 })); m.position.set(x, 0.018, z); F.smallObjects.add(m); } g.add(F.smallObjects);

  void opts;
  return F;
}
