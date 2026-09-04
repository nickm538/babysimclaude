// Algorithmic art on the walls: three generative framed pieces (flow-field ink, Voronoi stained glass,
// noise landscape), a nursery growth chart that fills in as the child grows, and a family photo wall
// whose frames appear as memories accumulate. Everything is seeded from the baby's name, so each game
// gets its own gallery. No external assets — all canvas paths and per-pixel maths.
import * as THREE from 'three';
import { canvas, mulberry32, hashString, fbm, toTexture, matte } from '../engine/textures.js';

const FRAME_W = matte({ color: 0xf3efe7, roughness: 0.5 });
// Mount board is cotton card: nearly white, but with a visible tooth that breaks up the highlight.
const MOUNT_CARD = matte({ color: 0xfdfbf6, roughness: 0.95 });

function texFromCanvas(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function paper(ctx, s, tone = '#f6f1e6') {
  ctx.fillStyle = tone; ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s), d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const n = 0.96 + fbm(x / 9, y / 9, 5, 2) * 0.08; const i = (y * s + x) * 4; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
  ctx.putImageData(img, 0, 0);
}

// 1) Flow-field ink: thousands of short strokes advected through a smooth vector field.
export function flowFieldArt(seed, s = 384) {
  const R = mulberry32(seed), c = canvas(s), ctx = c.getContext('2d');
  paper(ctx, s, '#f7f2e7');
  const hue = R(), inkA = new THREE.Color().setHSL(hue, 0.55, 0.28), inkB = new THREE.Color().setHSL((hue + 0.42) % 1, 0.6, 0.42);
  const scale = 0.006 + R() * 0.006, swirl = 2 + R() * 4;
  ctx.lineCap = 'round';
  const lines = 260;
  for (let i = 0; i < lines; i++) {
    let x = R() * s, y = R() * s;
    const t = R();
    const col = inkA.clone().lerp(inkB, t);
    ctx.strokeStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${0.12 + t * 0.3})`;
    ctx.lineWidth = 0.6 + R() * 2.2;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 90; k++) {
      const a = (fbm(x * scale * 12, y * scale * 12, seed % 97, 3) - 0.5) * Math.PI * swirl + Math.atan2(s / 2 - y, s / 2 - x) * 0.35;
      x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2;
      if (x < -20 || x > s + 20 || y < -20 || y > s + 20) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // a single confident ink circle to anchor the composition
  ctx.strokeStyle = `rgba(${(inkA.r * 255) | 0},${(inkA.g * 255) | 0},${(inkA.b * 255) | 0},0.5)`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(s * (0.4 + R() * 0.2), s * (0.4 + R() * 0.2), s * (0.16 + R() * 0.08), R() * 6, R() * 6 + 5.4); ctx.stroke();
  return c;
}

// 2) Voronoi stained glass: nearest-site cells with leaded edges.
export function voronoiArt(seed, s = 256) {
  const R = mulberry32(seed + 991), c = canvas(s), ctx = c.getContext('2d');
  const n = 22 + Math.floor(R() * 12);
  const sx = [], sy = [], sc = [];
  const baseHue = R();
  for (let i = 0; i < n; i++) {
    sx.push(R() * s); sy.push(R() * s);
    const h = (baseHue + (R() - 0.5) * 0.34 + (R() < 0.18 ? 0.5 : 0)) % 1;
    sc.push(new THREE.Color().setHSL((h + 1) % 1, 0.55 + R() * 0.35, 0.34 + R() * 0.34));
  }
  const img = ctx.createImageData(s, s), d = img.data;
  const owner = new Int16Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let best = 1e9, bi = 0, second = 1e9;
    for (let i = 0; i < n; i++) { const dx = x - sx[i], dy = y - sy[i]; const dd = dx * dx + dy * dy; if (dd < best) { second = best; best = dd; bi = i; } else if (dd < second) second = dd; }
    const idx = y * s + x; owner[idx] = bi;
    const edge = Math.sqrt(second) - Math.sqrt(best); // distance to the cell boundary
    const shade = 0.72 + 0.28 * Math.min(1, edge / 26) + (fbm(x / 7, y / 7, seed, 2) - 0.5) * 0.16;
    const col = sc[bi], i4 = idx * 4;
    const lead = Math.max(0, 1 - edge / 2.2);
    d[i4] = (col.r * shade * (1 - lead) + 0.06 * lead) * 255;
    d[i4 + 1] = (col.g * shade * (1 - lead) + 0.05 * lead) * 255;
    d[i4 + 2] = (col.b * shade * (1 - lead) + 0.05 * lead) * 255;
    d[i4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  void owner;
  return c;
}

// 3) Noise landscape: layered fbm ridges under a graded sky with a low sun.
export function landscapeArt(seed, w = 384, h = 288) {
  const R = mulberry32(seed + 4242), c = canvas(w, h), ctx = c.getContext('2d');
  const warm = R() < 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const top = new THREE.Color().setHSL(warm ? 0.06 + R() * 0.03 : 0.58, 0.5, 0.34);
  const bot = new THREE.Color().setHSL(warm ? 0.09 : 0.52, 0.7, 0.72);
  g.addColorStop(0, `#${top.getHexString()}`); g.addColorStop(1, `#${bot.getHexString()}`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const sunX = w * (0.2 + R() * 0.6), sunY = h * (0.3 + R() * 0.2), sunR = h * 0.075;
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 5);
  sg.addColorStop(0, 'rgba(255,244,214,0.95)'); sg.addColorStop(0.12, 'rgba(255,226,170,0.7)'); sg.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff6de'; ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
  const layers = 5;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const col = new THREE.Color().setHSL(warm ? 0.05 + t * 0.03 : 0.55 - t * 0.06, 0.28 + t * 0.2, 0.52 - t * 0.4);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.beginPath(); ctx.moveTo(0, h);
    const base = h * (0.5 + t * 0.4), amp = h * (0.16 - t * 0.02);
    for (let x = 0; x <= w; x += 3) ctx.lineTo(x, base - (fbm(x / (60 - l * 8) + l * 40, l * 13.7, seed + l, 4) - 0.5) * amp * 2.4);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  }
  // birds
  ctx.strokeStyle = 'rgba(30,26,24,0.55)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) { const x = w * (0.15 + R() * 0.7), y = h * (0.16 + R() * 0.2), s = 3 + R() * 4; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s * 0.7, x, y); ctx.quadraticCurveTo(x + s / 2, y - s * 0.7, x + s, y); ctx.stroke(); }
  return c;
}

// A framed picture: canvas art + moulding. Returns the group.
function framed(art, w, h, { depth = 0.035, mat = FRAME_W } = {}) {
  const grp = new THREE.Group();
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texFromCanvas(art), roughness: 0.62, metalness: 0 }));
  pic.position.z = depth * 0.55; grp.add(pic);
  const b = 0.035;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + b * 2, h + b * 2, depth), mat);
  back.castShadow = true; back.receiveShadow = true; grp.add(back);
  // A window mount, not a white rectangle behind the picture: real card with a bevelled aperture cut
  // through it. The bevel is the giveaway detail — it catches a line of light along the top edge and
  // is the whole reason a mounted print looks framed rather than printed on the wall.
  const ow = w + b * 1.1, oh = h + b * 1.1, aw = w * 0.9, ah = h * 0.9;
  const shape = new THREE.Shape();
  shape.moveTo(-ow / 2, -oh / 2); shape.lineTo(ow / 2, -oh / 2); shape.lineTo(ow / 2, oh / 2); shape.lineTo(-ow / 2, oh / 2); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-aw / 2, -ah / 2); hole.lineTo(-aw / 2, ah / 2); hole.lineTo(aw / 2, ah / 2); hole.lineTo(aw / 2, -ah / 2); hole.closePath();
  shape.holes.push(hole);
  const mountGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0022, bevelSegments: 1, curveSegments: 1 });
  const mount = new THREE.Mesh(mountGeo, MOUNT_CARD);
  mount.position.z = depth * 0.55 + 0.0004; mount.castShadow = true; grp.add(mount);
  return grp;
}

// Silhouette "photograph": duotone bust portraits of a parent and child.
function photoCanvas(seed, index, s = 192) {
  const R = mulberry32(seed + index * 7717), c = canvas(s, s), ctx = c.getContext('2d');
  const hue = (R() * 0.15 + 0.08) % 1;
  const back = new THREE.Color().setHSL(hue, 0.25 + R() * 0.2, 0.72 + R() * 0.1);
  const fg = new THREE.Color().setHSL((hue + 0.5) % 1, 0.22, 0.24 + R() * 0.1);
  const g = ctx.createRadialGradient(s / 2, s * 0.42, s * 0.1, s / 2, s * 0.5, s * 0.75);
  g.addColorStop(0, `#${back.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`);
  g.addColorStop(1, `#${back.getHexString()}`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const bust = (cx, cy, r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - r * 2.1, s);
    ctx.quadraticCurveTo(cx - r * 1.9, cy + r * 1.15, cx, cy + r * 1.05);
    ctx.quadraticCurveTo(cx + r * 1.9, cy + r * 1.15, cx + r * 2.1, s);
    ctx.closePath(); ctx.fill();
  };
  const adult = `#${fg.getHexString()}`, child = `#${fg.clone().lerp(back, 0.3).getHexString()}`;
  bust(s * 0.42, s * 0.4, s * 0.15, adult);
  bust(s * 0.66, s * 0.56, s * 0.085 + index * 0.4, child);
  // light leak + border
  ctx.fillStyle = 'rgba(255,246,220,0.16)'; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, s * 0.6); ctx.lineTo(s * 0.55, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = s * 0.05; ctx.strokeRect(0, 0, s, s);
  return c;
}

// Growth chart board. Marks are redrawn whenever the child gets measurably taller.
function growthCanvas(name, marks, w = 200, h = 900) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#f6efe0'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d8c8ab'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  // ruler: chart spans 30..130 cm bottom->top
  const yFor = (cm) => h - 26 - ((cm - 30) / 100) * (h - 74);
  ctx.strokeStyle = '#b9a headers'; // (unused colour string guard)
  for (let cm = 30; cm <= 130; cm++) {
    const y = yFor(cm), major = cm % 10 === 0, mid = cm % 5 === 0;
    ctx.strokeStyle = major ? '#8c7a5c' : '#bfae90'; ctx.lineWidth = major ? 2.5 : 1;
    ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(major ? 54 : mid ? 40 : 30, y); ctx.stroke();
    if (major) { ctx.fillStyle = '#7a6a50'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(String(cm), 60, y); }
  }
  ctx.fillStyle = '#6b5a41'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('HOW I GREW', w / 2, 30);
  ctx.font = '16px system-ui, sans-serif'; ctx.fillText(name || 'Baby', w / 2, 52);
  ctx.textAlign = 'left';
  const cols = ['#e0575f', '#3f8ecf', '#54a86b', '#d99a2b', '#8b62c9'];
  marks.forEach((m, i) => {
    const y = yFor(m.cm); if (y < 60 || y > h - 10) return;
    ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(96, y); ctx.lineTo(w - 16, y); ctx.stroke();
    ctx.fillStyle = cols[i % cols.length]; ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(m.label, 100, y - 8);
  });
  return c;
}

const AGE_MARKS = [0, 30, 90, 180, 270, 365, 550, 730, 1095, 1460, 1826];
const markLabel = (d) => (d < 25 ? 'birth' : d < 350 ? `${Math.round(d / 30)} mo` : `${(d / 365).toFixed(d % 365 < 40 ? 0 : 1)} yr`);

export function buildArt(scene, { name = 'Baby', seed = null } = {}) {
  const S = seed == null ? hashString(name) : seed;
  const group = new THREE.Group(); group.name = 'art'; scene.add(group);
  const place = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; group.add(obj); return obj; };

  // A gallery wall, hung the way people actually hang one: a big anchor piece with smaller work
  // clustered round it, at eye level rather than up near the ceiling. Three lonely squares floating
  // high on a wall read as placeholder art, which is what this was.
  place(framed(landscapeArt(S + 5), 0.86, 0.62), -1.3, 1.62, -4.88);
  place(framed(flowFieldArt(S), 0.4, 0.52), -2.35, 1.7, -4.88);
  place(framed(voronoiArt(S + 11), 0.36, 0.36), -2.35, 1.16, -4.88);
  place(framed(flowFieldArt(S + 23), 0.3, 0.4), -0.42, 1.82, -4.88);
  place(framed(voronoiArt(S + 31), 0.3, 0.3), -0.42, 1.36, -4.88);
  place(framed(landscapeArt(S + 41), 0.44, 0.32), 0.28, 1.6, -4.88);
  // and a small shelf below it with a couple of things on it, so the wall has depth
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.12), FRAME_W);
  ledge.castShadow = ledge.receiveShadow = true;
  place(ledge, -1.3, 1.06, -4.83);
  for (const [x, r, h, c] of [[-1.75, 0.045, 0.13, 0xb5714e], [-1.55, 0.032, 0.09, 0xdfe3e6], [-0.92, 0.038, 0.16, 0x8fbfa8]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, h, 16), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.7, sheen: 0.2 }));
    pot.castShadow = true; place(pot, x, 1.08 + h / 2, -4.8);
  }

  // --- nursery growth chart on the north nursery wall
  const marks = [];
  const chartTex = texFromCanvas(growthCanvas(name, marks));
  const chart = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.35, 0.004), new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.85 }));
  chart.castShadow = chart.receiveShadow = true;
  place(chart, 5.45, 0.95, -4.885);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02), FRAME_W); place(rail, 5.45, 1.64, -4.88);

  // --- photo wall above the sofa (south wall), revealed as memories accumulate
  const photos = [];
  const spots = [[-0.35, 1.72, 0.24], [0.15, 1.98, 0.2], [0.62, 1.7, 0.28], [1.15, 1.95, 0.22], [1.6, 1.66, 0.18], [-0.8, 1.98, 0.18]];
  spots.forEach(([x, y, w], i) => {
    const f = framed(photoCanvas(S, i), w, w * 1.02, { depth: 0.028 });
    f.rotation.y = Math.PI; f.position.set(x, y, 4.885); f.visible = false;
    group.add(f); photos.push(f);
  });

  const state = { lastCm: -1, memories: -1 };
  return {
    group, photos, chart,
    update(view) {
      if (!view || !view.baby) return;
      const cm = view.baby.phys.heightCm, days = view.sim.days;
      // one mark per age milestone that has already passed, using the height at that point (current height for the latest)
      const want = AGE_MARKS.filter((d) => d <= days).length;
      if (want !== marks.length || Math.abs(cm - state.lastCm) > 1.2) {
        state.lastCm = cm;
        marks.length = 0;
        for (let i = 0; i < want; i++) {
          const d = AGE_MARKS[i];
          const est = i === want - 1 ? cm : cm * (0.42 + 0.58 * Math.pow(Math.min(1, d / Math.max(1, days)), 0.45));
          marks.push({ cm: Math.max(30, Math.min(130, est)), label: markLabel(d) });
        }
        chart.material.map.image = growthCanvas(view.baby.name, marks);
        chart.material.map.needsUpdate = true;
      }
      const mem = Object.values(view.baby.milestones || {}).filter(Boolean).length + (view.baby.counters ? Math.floor((view.baby.counters.photos || 0)) : 0);
      if (mem !== state.memories) {
        state.memories = mem;
        photos.forEach((p, i) => { p.visible = mem >= 2 + i * 3; });
      }
    },
  };
}
