// The home: open-plan ground floor with living room, nursery nook, kitchen corner, stairs and front door.
import * as THREE from 'three';
import { woodTexture, plasterTexture, tileTexture, wallpaperTexture, stdMaterial, matte } from '../engine/textures.js';
import { buildFurniture } from './furniture.js';

export const SPOTS = {
  crib: { pos: [4.6, 0.82, -3.5], rot: Math.PI / 2, kind: 'lie' },
  toddler_bed: { pos: [4.6, 0.42, -3.5], rot: Math.PI / 2, kind: 'lie' },
  changing_table: { pos: [4.6, 0.95, -1.2], rot: Math.PI / 2, kind: 'lie' },
  bath: { pos: [4.6, 1.0, -1.2], rot: Math.PI / 2, kind: 'lie' },
  play_mat: { pos: [3.0, 0.03, 1.5], rot: 0.4, kind: 'floor' },
  floor: { pos: [1.4, 0.03, -0.9], rot: -0.6, kind: 'floor' },
  sofa: { pos: [0.5, 0.5, 1.75], rot: Math.PI, kind: 'lie' },
  high_chair: { pos: [-3.5, 0.78, -2.5], rot: Math.PI, kind: 'sit' },
  playpen: { pos: [-2.5, 0.06, 1.2], rot: 0.2, kind: 'floor' },
  kitchen: { pos: [-4.8, 0.03, -2.6], rot: 1.2, kind: 'floor' },
  stairs: { pos: [-5.0, 0.03, 0.7], rot: 0, kind: 'floor' },
  hospital: { pos: [0, -10, 0], rot: 0, kind: 'hidden' },
};

export function buildHouse(scene, opts = {}) {
  const g = new THREE.Group(); g.name = 'house';
  const colliders = [], interactables = [];
  const W = 12, D = 10, H = 2.8;

  const floorTex = woodTexture({ base: '#a8794f', dark: '#6e4a2c', repeat: 6, planks: 6, seed: 2 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1), stdMaterial(floorTex, { roughness: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);

  const kitchenFloor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5), stdMaterial(tileTexture({ repeat: 5 }), { roughness: 0.35 }));
  kitchenFloor.rotation.x = -Math.PI / 2; kitchenFloor.position.set(-4.2, 0.005, -2.5); kitchenFloor.receiveShadow = true; g.add(kitchenFloor);

  // A ceiling is plaster too — the one flat white plane in the room was the giveaway that it was a render.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), stdMaterial(plasterTexture({ color: '#f4f1ea', repeat: 5, seed: 12 }), { roughness: 0.95, normalScale: new THREE.Vector2(0.35, 0.35) }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H; g.add(ceiling);

  const wallMat = stdMaterial(plasterTexture({ color: '#e6dfd3', repeat: 4 }), { roughness: 0.92 });
  const nurseryMat = stdMaterial(wallpaperTexture({ base: '#efe3ea', accent: '#d9b9c8', repeat: 5 }), { roughness: 0.9 });
  const kitchenWallMat = stdMaterial(plasterTexture({ color: '#dfe6e3', repeat: 4, seed: 7 }), { roughness: 0.9 });

  // walls with cut-outs: build as box segments
  const wall = (x, y, z, w, h, d, mat = wallMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = true; g.add(m); return m; };
  // north wall (z=-5): window at x in [1.5,4.5]
  wall(-2.25 - 1.25, H / 2, -5, 8.5 - 3, H, 0.2); // x from -6 to -1  -> center -3.5 width 5
  wall(0.25, H / 2, -5, 2.5, H, 0.2); // -1..1.5
  wall(5.25, H / 2, -5, 1.5, H, 0.2, nurseryMat); // 4.5..6
  wall(3, 0.45, -5, 3, 0.9, 0.2, nurseryMat); // sill under window
  wall(3, H - 0.25, -5, 3, 0.5, 0.2, nurseryMat); // header
  // east wall (x=6): window z in [-3,-1]
  wall(6, H / 2, -4, 0.2, H, 2, nurseryMat); // z -5..-3
  wall(6, 0.45, -2, 0.2, 0.9, 2, nurseryMat); wall(6, H - 0.25, -2, 0.2, 0.5, 2, nurseryMat);
  wall(6, H / 2, 2, 0.2, H, 6, nurseryMat); // z -1..5
  // south wall (z=5): door at x in [-2.1,-0.9]
  wall(-4.05, H / 2, 5, 3.9, H, 0.2); // -6..-2.1
  wall(-1.5, H - 0.3, 5, 1.2, 0.6, 0.2); // door header
  wall(2.55, H / 2, 5, 6.9, H, 0.2); // -0.9..6
  // west wall (x=-6)
  wall(-6, H / 2, 0, 0.2, H, 10, kitchenWallMat);
  // nursery partial partition (a low half wall between living and nursery)
  wall(2.4, 0.5, -4.2, 0.15, 1.0, 1.6, nurseryMat);
  colliders.push({ min: { x: 2.3, z: -5 }, max: { x: 2.5, z: -3.4 } });

  // Profiled trim. A flat strip at the foot of a wall is a painted line; a real skirting has an ogee
  // that catches a highlight along its top edge and throws a shadow under its lip, and coving does
  // the same where the wall turns into the ceiling. This is most of what makes a room read as built
  // rather than as a box with textures on it.
  const trimMat = matte({ color: 0xf8f6f1, roughness: 0.45 });
  const trimProfile = (pts) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath(); return sh; };
  // skirting seen end-on: flat against the wall, stepping out and rolling over at the top
  const skirtShape = trimProfile([[0, 0], [0.028, 0], [0.028, 0.10], [0.020, 0.125], [0.020, 0.15], [0.006, 0.165], [0, 0.165]]);
  // coving: a concave sweep from wall to ceiling
  const coveShape = trimProfile([[0, 0], [0, -0.085], [0.012, -0.082], [0.03, -0.062], [0.048, -0.03], [0.055, 0]]);
  const runTrim = (shape, len, x, y, z, rotY) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 2 });
    geo.rotateY(Math.PI / 2); geo.translate(0, 0, -len / 2);
    const m = new THREE.Mesh(geo, trimMat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };
  //          length  x      y            z      facing
  for (const [len, x, z, rotY] of [
    [W, 0, -4.9, 0],            // north
    [W, 0, 4.9, Math.PI],       // south
    [D, -5.9, 0, Math.PI / 2],  // west
    [D, 5.9, 0, -Math.PI / 2],  // east
  ]) {
    runTrim(skirtShape, len, x, 0, z, rotY);
    runTrim(coveShape, len, x, H, z, rotY);
  }

  // windows: glass + frames + outside sky plane
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  // Window glass is the one legitimately see-through surface in the house, and it is done one way, not
  // two: transmission alone on hardware that can render it (opacity on top of transmission made the
  // pane look doubly ghosted), and a reflective, faintly tinted pane on mobile.
  // Tagged so the smoke test's transparency audit can tell the one legitimate see-through surface in
  // the house apart from an accident.
  const glassMat = mobile
    ? new THREE.MeshPhysicalMaterial({ color: 0xcfe2f3, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.35, envMapIntensity: 1.6, clearcoat: 1 })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.96, roughness: 0.04, thickness: 0.006, ior: 1.5, envMapIntensity: 1.2 })
  glassMat.userData.glass = true;
  const frameMat = matte({ color: 0xffffff, roughness: 0.5 });
  const mkWindow = (cx, cy, cz, w, h, rotY) => {
    const grp = new THREE.Group(); grp.position.set(cx, cy, cz); grp.rotation.y = rotY;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), glassMat); grp.add(glass);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), frameMat); fr.position.z = 0.05; grp.add(fr);
    // The reveal: the thickness of the wall showing round the opening, plus a sill deep enough to
    // put something on. Without it the glass looks painted onto a flat surface.
    for (const [ox, oy, rw, rh] of [[0, (h + 0.11) / 2, w + 0.22, 0.11], [0, -(h + 0.11) / 2, w + 0.22, 0.11], [(w + 0.11) / 2, 0, 0.11, h], [-(w + 0.11) / 2, 0, 0.11, h]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.2), frameMat);
      r.position.set(ox, oy, -0.02); r.castShadow = r.receiveShadow = true; grp.add(r);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, 0.26), frameMat);
    sill.position.set(0, -(h / 2) - 0.09, 0.09); sill.castShadow = sill.receiveShadow = true; grp.add(sill);
    // glazing bars: a real window is divided, and the shadows they throw across the floor are half
    // of what makes a sun patch look like sunlight
    for (let i = 1; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.022, h, 0.05), frameMat);
      b.position.set(-w / 2 + (w * i) / 3, 0, 0.02); b.castShadow = true; grp.add(b);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, 0.05), frameMat);
    cross.position.set(0, 0, 0.02); cross.castShadow = true; grp.add(cross);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000 })); inner.visible = false; grp.add(inner);
    for (const [ox, oy, ww, hh] of [[0, 0, 0.04, h], [0, 0, w, 0.04]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.06), frameMat); b.position.set(ox, oy, 0.03); grp.add(b); }
    // sky card behind
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.6), new THREE.MeshBasicMaterial({ color: 0x9fc7ee, toneMapped: true })); sky.position.z = -0.6; grp.add(sky); grp.userData.sky = sky;
    // curtains
    const curtMat = matte({ color: 0xd8c3a5, roughness: 1, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.45, h + 0.5, 6, 1), curtMat); const p = c.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 30) * 0.05); c.geometry.computeVertexNormals(); c.position.set(sx * (w / 2 + 0.15), 0.1, 0.12); grp.add(c); }
    g.add(grp); return grp;
  };
  const windows = [mkWindow(3, 1.6, -4.9, 3, 1.4, 0), mkWindow(5.9, 1.6, -2, 2, 1.4, -Math.PI / 2)];

  // front door
  const doorGrp = new THREE.Group(); doorGrp.position.set(-1.5, 0, 4.9);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.08), stdMaterial(woodTexture({ base: '#4d3324', dark: '#2b1a10', repeat: 1, planks: 1, seed: 5 }), { roughness: 0.6 }));
  door.position.y = 1.1; door.castShadow = true; doorGrp.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), matte({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 })); knob.position.set(0.45, 1.05, -0.06); doorGrp.add(knob);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.6), matte({ color: 0x5a4a3a, roughness: 1 })); mat.position.set(0, 0.01, -0.5); doorGrp.add(mat);
  door.userData.interact = { id: 'door', label: 'Front door' }; interactables.push(door);
  g.add(doorGrp);
  colliders.push({ min: { x: -6, z: 4.8 }, max: { x: 6, z: 5 } }, { min: { x: -6, z: -5 }, max: { x: 6, z: -4.8 } }, { min: { x: -6, z: -5 }, max: { x: -5.8, z: 5 } }, { min: { x: 5.8, z: -5 }, max: { x: 6, z: 5 } });

  // thermostat on the wall
  const thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24), matte({ color: 0xf0f0f0, roughness: 0.4 }));
  thermo.rotation.x = Math.PI / 2; thermo.position.set(0.25, 1.5, -4.88); thermo.userData.interact = { id: 'thermostat', label: 'Thermostat' }; interactables.push(thermo); g.add(thermo);

  // stairs along west wall from z=0.5 to z=3.5 going up
  const stairMat = stdMaterial(woodTexture({ base: '#9a6b45', dark: '#5e3d24', repeat: 1, planks: 1, seed: 8 }), { roughness: 0.55 });
  const stairs = new THREE.Group();
  for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.28), stairMat); s.position.set(-5.4, 0.09 + i * 0.18, 0.7 + i * 0.28); s.castShadow = s.receiveShadow = true; stairs.add(s); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 3.4), matte({ color: 0xf8f6f2, roughness: 0.5 })); rail.position.set(-4.88, 1.6, 2.2); rail.rotation.x = -0.55; stairs.add(rail);
  stairs.userData.interact = { id: 'stairs', label: 'Stairs' }; interactables.push(stairs); g.add(stairs);
  colliders.push({ min: { x: -6, z: 0.5 }, max: { x: -4.85, z: 4 } });
  const gate = new THREE.Group(); gate.position.set(-5.4, 0, 0.45); gate.visible = false;
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), matte({ color: 0xffffff, roughness: 0.4 })); b.position.set(-0.48 + i * 0.12, 0.38, 0); gate.add(b); }
  const gtop = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 0.03), matte({ color: 0xffffff })); gtop.position.y = 0.75; gate.add(gtop);
  g.add(gate);

  const furniture = buildFurniture(g, colliders, interactables, opts);
  scene.add(g);

  return { group: g, colliders, interactables, windows, furniture, gate, spots: SPOTS, setNight(night, skyColor) { for (const w of windows) w.userData.sky.material.color.copy(skyColor); void night; } };
}
