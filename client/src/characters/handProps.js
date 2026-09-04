// The objects the parent's hand actually holds.
//
// These sit about 40 cm from the camera and fill a third of the screen while you feed, change or
// medicate the baby, so they are the most closely looked-at geometry in the game. They get the same
// treatment as the characters: turned profiles instead of primitives, real wall thickness instead of
// open-ended cylinders, and materials with a surface rather than a colour. Everything is procedural.
import * as THREE from 'three';
import { matte, fabricTexture, printedFabricTexture, clothMaterial, canvas, toTexture, fbm } from '../engine/textures.js';

// A lathe from a list of [radius, y] pairs, resampled so the silhouette is smooth rather than faceted.
function turned(profile, seg = 28) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

// Push the top of a closed solid inward to hollow it — how a spoon bowl or a scoop is actually
// shaped. Displacing an existing surface keeps the mesh closed; subtracting a second sphere would not.
function dimple(geo, centre, radius, depth) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = Math.hypot(v.x - centre.x, v.z - centre.z);
    if (v.y > centre.y - 1e-4 && d < radius) {
      const k = Math.cos((d / radius) * Math.PI * 0.5);
      p.setY(i, v.y - depth * k * k);
    }
  }
  p.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}

// Rumple a slab of cloth: low-frequency folds along both axes, strongest away from where it is held.
function rumple(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = fbm(v.x * freq + seed, v.z * freq - seed, seed | 0, 3) - 0.5;
    p.setY(i, v.y + f * amp * (0.35 + Math.min(1, Math.hypot(v.x, v.z) * 6)));
  }
  p.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}

// A board-book cover: a colour field, a title band and a hand-drawn animal blob. Two hundred pixels
// of canvas is enough at this distance, and it means the book is a book rather than a yellow brick.
function bookCover(size = 192) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(size * 0.08, size * 0.08, size * 0.84, size * 0.3);
  ctx.fillStyle = '#5b4a2f';
  for (let i = 0; i < 3; i++) ctx.fillRect(size * 0.14, size * (0.15 + i * 0.07), size * (0.62 - i * 0.16), size * 0.035);
  ctx.fillStyle = '#e07a5f';
  ctx.beginPath(); ctx.ellipse(size * 0.5, size * 0.66, size * 0.2, size * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.36, size * 0.55, size * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2019';
  ctx.beginPath(); ctx.arc(size * 0.33, size * 0.53, size * 0.014, 0, Math.PI * 2); ctx.fill();
  return { map: toTexture(c, 1), roughness: 0.72 };
}

export function buildHandProps() {
  const items = {};
  const add = (name, obj) => { obj.visible = false; items[name] = obj; };

  // --- bottle: frosted polypropylene body, milk that sits at a level, a silicone teat, a ribbed collar
  const bottle = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) });
  bottle.add(new THREE.Mesh(turned([[0, -0.066], [0.02, -0.068], [0.027, -0.062], [0.028, 0.02], [0.026, 0.042], [0.019, 0.055], [0.019, 0.062], [0, 0.062]]), bodyMat));
  // Milk is opaque and fills to a level; a shorter lathe inside the shell reads as a half-full bottle.
  const milk = new THREE.Mesh(turned([[0, -0.06], [0.019, -0.062], [0.025, -0.056], [0.0255, 0.006], [0, 0.006]], 22),
    new THREE.MeshPhysicalMaterial({ color: 0xfff8e8, roughness: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.4, sheen: 0.2 }));
  bottle.add(milk);
  const teat = new THREE.Mesh(turned([[0, 0.062], [0.022, 0.062], [0.021, 0.066], [0.011, 0.07], [0.014, 0.076], [0.013, 0.086], [0.009, 0.097], [0.006, 0.106], [0, 0.108]], 22),
    new THREE.MeshPhysicalMaterial({ color: 0xf0c9a8, roughness: 0.55, clearcoat: 0.45, clearcoatRoughness: 0.45 }));
  bottle.add(teat);
  const collar = new THREE.Mesh(turned([[0.019, 0.055], [0.031, 0.055], [0.031, 0.072], [0.026, 0.072], [0.026, 0.058], [0.019, 0.058], [0.019, 0.055]], 30), matte({ color: 0x7fc8e8, roughness: 0.45 }));
  bottle.add(collar);
  for (let i = 0; i < 18; i++) { // knurling on the screw collar — you feel it, so you should see it
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.016, 0.004), matte({ color: 0x6fbcdc, roughness: 0.5 }));
    const a = (i / 18) * Math.PI * 2;
    rib.position.set(Math.cos(a) * 0.0312, 0.0635, Math.sin(a) * 0.0312); rib.rotation.y = -a; bottle.add(rib);
  }
  bottle.position.set(0, 0.05, 0.03); bottle.rotation.x = -0.9; add('bottle', bottle);

  // --- diaper: an hourglass shell with a padded core, not a slab
  const dg = new THREE.BoxGeometry(0.17, 0.028, 0.13, 14, 3, 10);
  { const p = dg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = Math.abs(v.x) / 0.085;               // 0 at the crotch, 1 at the waistbands
      p.setZ(i, v.z * (0.62 + t * 0.38));            // pinched waist
      p.setY(i, v.y * (1 + (1 - t) * 0.7) + (1 - t) * 0.004); // padded through the middle
    }
    p.needsUpdate = true; dg.computeVertexNormals(); }
  const diaper = new THREE.Group();
  diaper.add(new THREE.Mesh(dg, clothMaterial(printedFabricTexture({ color: '#fbfaf7', repeat: 8, seed: 12, print: 'dots' }), { sheen: 0.35, extra: { roughness: 0.96 } })));
  for (const sx of [-1, 1]) { // the fastening tabs
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.05), matte({ color: 0xe8e2d6, roughness: 0.9 }));
    tab.position.set(sx * 0.088, 0.006, 0); diaper.add(tab);
  }
  diaper.position.set(0, 0.04, 0.05); add('diaper', diaper);

  // --- bowl: turned with a real wall, purée as a shallow lumpy dome
  const bowl = new THREE.Group();
  bowl.add(new THREE.Mesh(turned([[0, -0.018], [0.026, -0.019], [0.036, -0.008], [0.049, 0.016], [0.052, 0.02], [0.048, 0.02], [0.045, 0.014], [0.033, -0.006], [0.024, -0.014], [0, -0.014]], 30),
    matte({ color: 0xffb27a, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 })));
  const food = new THREE.Mesh(new THREE.SphereGeometry(0.042, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), matte({ color: 0xe0a24a, roughness: 0.85 }));
  food.scale.set(1, 0.28, 1); food.position.y = 0.006;
  rumple(food.geometry, 0.006, 40, 3); // purée is not a mirror
  bowl.add(food);
  bowl.position.set(0, 0.05, 0.03); add('bowl', bowl);

  // --- spoon: a turned handle and a hollowed bowl, on one closed solid each
  const spoon = new THREE.Group();
  const spoonMat = matte({ color: 0xff8a5c, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  spoon.add(new THREE.Mesh(turned([[0, -0.055], [0.0045, -0.052], [0.005, -0.01], [0.0042, 0.02], [0.0055, 0.038], [0.005, 0.044], [0, 0.046]], 14), spoonMat));
  const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 14), spoonMat);
  scoop.scale.set(1, 0.42, 1.5); scoop.position.y = 0.055;
  scoop.geometry = dimple(scoop.geometry.clone(), new THREE.Vector3(0, 0.006, 0), 0.013, 0.009);
  spoon.add(scoop);
  spoon.position.set(0, 0.03, 0.06); spoon.rotation.x = -1.2; add('spoon', spoon);

  // --- book: a board book — two thick covers, a page block, a printed spine
  const book = new THREE.Group();
  const cover = new THREE.MeshStandardMaterial({ map: bookCover().map, roughness: 0.72, metalness: 0 });
  const pages = matte({ color: 0xf7f2e6, roughness: 0.95 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.135), cover); top.position.y = 0.016; book.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.135), cover); bot.position.y = -0.016; book.add(bot);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.164, 0.026, 0.13), pages); book.add(block);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.135, 12, 1, false, Math.PI * 0.5, Math.PI),
    matte({ color: 0xd9a63f, roughness: 0.6 }));
  spine.rotation.x = Math.PI / 2; spine.position.x = -0.085; book.add(spine);
  book.position.set(0, 0.035, 0.05); add('book', book);

  // --- thermometer: a turned body with a steel probe and a lit display
  const thermo = new THREE.Group();
  thermo.add(new THREE.Mesh(turned([[0, -0.062], [0.0035, -0.06], [0.005, -0.04], [0.009, -0.01], [0.011, 0.03], [0.0105, 0.052], [0.007, 0.058], [0, 0.059]], 20),
    matte({ color: 0xf7f7f5, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 })));
  const probe = new THREE.Mesh(turned([[0, -0.076], [0.0022, -0.074], [0.0028, -0.064], [0.0034, -0.06], [0, -0.06]], 12),
    new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, roughness: 0.25, metalness: 0.85, clearcoat: 0.3 }));
  thermo.add(probe);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.002, 0.018), matte({ color: 0x18241f, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1, emissive: new THREE.Color(0x2e6b4f), emissiveIntensity: 0.55 }));
  screen.position.set(0, 0.011, 0.019); screen.rotation.x = -Math.PI / 2; thermo.add(screen);
  thermo.rotation.x = -1.1; thermo.position.set(0, 0.045, 0.05); add('thermometer', thermo);

  // --- oral syringe: barrel, finger flange, thumb pad
  const syringe = new THREE.Group();
  syringe.add(new THREE.Mesh(turned([[0, -0.05], [0.005, -0.048], [0.006, 0.03], [0.0065, 0.038], [0, 0.038]], 18),
    new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2, transmission: 0.35, thickness: 0.006, ior: 1.46 })));
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.003, 0.008), matte({ color: 0xf4f1ea, roughness: 0.35, clearcoat: 0.5 }));
  flange.position.y = 0.037; syringe.add(flange);
  const plunger = new THREE.Mesh(turned([[0, 0.028], [0.0035, 0.03], [0.0035, 0.076], [0.009, 0.078], [0.009, 0.082], [0, 0.082]], 16), matte({ color: 0x9ad0e6, roughness: 0.5, clearcoat: 0.4 }));
  syringe.add(plunger);
  syringe.rotation.x = -1.1; syringe.position.set(0, 0.04, 0.05); add('medicine', syringe);

  // --- toy: a stitched fabric ball, panels and all
  const toy = new THREE.Group();
  const toyTex = printedFabricTexture({ color: '#3d9dc4', repeat: 3, seed: 21, print: 'stars' });
  toy.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 26, 20), clothMaterial(toyTex, { sheen: 0.7, sheenTint: 0.8 })));
  const seamMat = clothMaterial(fabricTexture({ color: '#f2ede2', repeat: 12, weave: 3, seed: 22 }), { sheen: 0.5 });
  for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2]]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.0448, 0.0022, 8, 40), seamMat);
    seam.rotation.set(...rot); toy.add(seam);
  }
  toy.position.set(0, 0.045, 0.04); add('toy', toy);

  // --- cloth: a muslin square that has actually been used, so it does not lie flat
  const cg = new THREE.BoxGeometry(0.13, 0.008, 0.13, 16, 1, 16);
  rumple(cg, 0.016, 26, 7);
  const cloth = new THREE.Mesh(cg, clothMaterial(printedFabricTexture({ color: '#bfe6d2', repeat: 6, seed: 31, print: 'checks' }), { sheen: 0.75, sheenTint: 0.7 }));
  cloth.position.set(0, 0.03, 0.05); add('cloth', cloth);

  return items;
}
