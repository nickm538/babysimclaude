// Procedural PBR-ish textures drawn on canvases (no asset downloads): wood, plaster, fabric, rug, tile, wallpaper.
import * as THREE from 'three';

const cache = new Map();

export function canvas(size, h = size) { const c = document.createElement('canvas'); c.width = size; c.height = h; return c; }

// deterministic per-game randomness: hashString('Ada') -> seed -> mulberry32 stream
export function hashString(s) { let h = 2166136261 >>> 0; const str = String(s == null ? '' : s); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function mulberry32(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function noise2(x, y, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = noise2(x0, y0, seed), b = noise2(x0 + 1, y0, seed), c = noise2(x0, y0 + 1, seed), d = noise2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, seed, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * smoothNoise(x * f, y * f, seed + i); a *= 0.5; f *= 2.1; } return s; }

export function toTexture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Height-map (grayscale canvas) -> normal map canvas
function normalFromHeight(hc, strength = 2) {
  const size = hc.width, src = hc.getContext('2d').getImageData(0, 0, size, size).data;
  const out = canvas(size), ctx = out.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const i = (y * size + x) * 4;
    d[i] = (n.x * 0.5 + 0.5) * 255; d[i + 1] = (n.y * 0.5 + 0.5) * 255; d[i + 2] = (n.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function woodTexture({ size = 512, base = '#8a5a34', dark = '#5b3a1e', repeat = 2, planks = 4, seed = 1 } = {}) {
  const key = `wood${base}${dark}${planks}${seed}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d'); const hc = canvas(size), hctx = hc.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data, himg = hctx.createImageData(size, size), hd = himg.data;
  const b = new THREE.Color(base), k = new THREE.Color(dark);
  const pw = size / planks;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const plank = Math.floor(x / pw), off = noise2(plank, 0, seed) * 300;
    const g = fbm((x % pw) / 40 + off, y / 9 + off, seed + plank, 3);
    const ring = 0.5 + 0.5 * Math.sin(((x % pw) / pw) * 14 + fbm(x / 60, y / 60, seed) * 6 + y / 70);
    let t = THREE.MathUtils.clamp(0.35 + g * 0.5 + ring * 0.25, 0, 1);
    const edge = (x % pw) < 2 || (x % pw) > pw - 3 ? 0.55 : 1;
    const i = (y * size + x) * 4;
    const r = (b.r + (k.r - b.r) * t) * edge, gg = (b.g + (k.g - b.g) * t) * edge, bb = (b.b + (k.b - b.b) * t) * edge;
    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = bb * 255; d[i + 3] = 255;
    const hv = (0.5 + (1 - t) * 0.4) * edge; hd[i] = hd[i + 1] = hd[i + 2] = hv * 255; hd[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); hctx.putImageData(himg, 0, 0);
  const out = { map: toTexture(c, repeat), normalMap: toTexture(normalFromHeight(hc, 1.6), repeat, false), roughness: 0.55 };
  cache.set(key, out); return out;
}

export function plasterTexture({ size = 256, color = '#e8e1d6', repeat = 3, seed = 3, grain = 0.06 } = {}) {
  const key = `plaster${color}${seed}${grain}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d'); const hc = canvas(size), hctx = hc.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data, himg = hctx.createImageData(size, size), hd = himg.data;
  const col = new THREE.Color(color);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / 18, y / 18, seed, 4) - 0.5;
    const v = 1 + n * grain * 2;
    const i = (y * size + x) * 4;
    d[i] = col.r * v * 255; d[i + 1] = col.g * v * 255; d[i + 2] = col.b * v * 255; d[i + 3] = 255;
    hd[i] = hd[i + 1] = hd[i + 2] = (0.5 + n) * 255; hd[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); hctx.putImageData(himg, 0, 0);
  const out = { map: toTexture(c, repeat), normalMap: toTexture(normalFromHeight(hc, 0.8), repeat, false), roughness: 0.92 };
  cache.set(key, out); return out;
}

export function fabricTexture({ size = 256, color = '#6d7f8c', repeat = 6, seed = 5, weave = 6 } = {}) {
  const key = `fabric${color}${seed}${weave}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d'); const hc = canvas(size), hctx = hc.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data, himg = hctx.createImageData(size, size), hd = himg.data;
  const col = new THREE.Color(color);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const wx = 0.5 + 0.5 * Math.sin(x / weave * Math.PI * 2), wy = 0.5 + 0.5 * Math.sin(y / weave * Math.PI * 2);
    const w = (wx * wy) * 0.5 + 0.5;
    const n = fbm(x / 30, y / 30, seed, 3) - 0.5;
    const v = 0.78 + w * 0.3 + n * 0.12;
    const i = (y * size + x) * 4;
    d[i] = col.r * v * 255; d[i + 1] = col.g * v * 255; d[i + 2] = col.b * v * 255; d[i + 3] = 255;
    hd[i] = hd[i + 1] = hd[i + 2] = w * 255; hd[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); hctx.putImageData(himg, 0, 0);
  const out = { map: toTexture(c, repeat), normalMap: toTexture(normalFromHeight(hc, 1.2), repeat, false), roughness: 0.95 };
  cache.set(key, out); return out;
}

// Seeded vector-style rug: fringe, guard stripes, a running-vine border and a lobed medallion with
// pendants and corner spandrels. Every game gets a different palette rotation and petal count.
export function rugTexture({ size = 512, colors = ['#b8927a', '#8a5f4a', '#d9c5b2', '#6f4a3c'], seed = 9 } = {}) {
  const key = `rug${colors.join()}${seed}`; if (cache.has(key)) return cache.get(key);
  const R = mulberry32(seed >>> 0 || 9);
  const c = canvas(size), ctx = c.getContext('2d');
  const [field, dark, light, deep] = colors;
  const S = size, M = S / 2;
  ctx.fillStyle = field; ctx.fillRect(0, 0, S, S);
  // fringe at the two short ends
  ctx.strokeStyle = light; ctx.lineWidth = 2;
  for (let i = 0; i < 64; i++) { const x = 6 + i * ((S - 12) / 63); ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x + (R() - 0.5) * 3, 16); ctx.moveTo(x, S - 2); ctx.lineTo(x + (R() - 0.5) * 3, S - 16); ctx.stroke(); }
  // outer field + guard stripes
  const band = (inset, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.strokeRect(inset, inset, S - inset * 2, S - inset * 2); };
  band(20, 12, deep); band(34, 4, light); band(74, 4, light); band(96, 10, dark);
  // running vine inside the wide border
  ctx.save(); ctx.strokeStyle = light; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const vine = (len, flip) => {
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x < len; x += 16) ctx.quadraticCurveTo(x + 8, (x / 16) % 2 ? -9 * flip : 9 * flip, x + 16, 0);
    ctx.stroke();
    for (let x = 8; x < len; x += 32) { ctx.beginPath(); ctx.ellipse(x, -7 * flip, 5, 3, -0.6 * flip, 0, Math.PI * 2); ctx.fillStyle = deep; ctx.fill(); }
  };
  for (let s = 0; s < 4; s++) { ctx.save(); ctx.translate(M, M); ctx.rotate(s * Math.PI / 2); ctx.translate(-(S / 2 - 55), -(S / 2 - 55)); vine(S - 110, 1); ctx.restore(); }
  ctx.restore();
  // corner spandrels
  ctx.fillStyle = dark;
  for (const [cx, cy, a] of [[110, 110, 0], [S - 110, 110, Math.PI / 2], [S - 110, S - 110, Math.PI], [110, S - 110, -Math.PI / 2]]) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-1, -1);
    ctx.quadraticCurveTo(48, -6, 42, 42); ctx.quadraticCurveTo(-6, 48, -1, -1); ctx.fill(); ctx.restore();
  }
  // medallion: lobed rosette + inner star + pendants
  const petals = 8 + Math.floor(R() * 5), rad = S * 0.24;
  ctx.save(); ctx.translate(M, M);
  ctx.fillStyle = deep; ctx.beginPath();
  for (let i = 0; i <= 240; i++) { const a = (i / 240) * Math.PI * 2, r = rad * (0.82 + 0.18 * Math.cos(a * petals)); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = light; ctx.beginPath();
  for (let i = 0; i <= 240; i++) { const a = (i / 240) * Math.PI * 2, r = rad * 0.62 * (0.85 + 0.15 * Math.cos(a * petals + Math.PI)); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath();
  for (let i = 0; i < petals * 2; i++) { const a = (i / (petals * 2)) * Math.PI * 2, r = rad * (i % 2 ? 0.16 : 0.4); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = field; ctx.beginPath(); ctx.arc(0, 0, rad * 0.13, 0, Math.PI * 2); ctx.fill();
  // pendants above and below
  ctx.fillStyle = deep;
  for (const sy of [-1, 1]) { ctx.save(); ctx.scale(1, sy); ctx.beginPath(); ctx.moveTo(0, -rad - 4); ctx.quadraticCurveTo(16, -rad - 34, 0, -rad - 62); ctx.quadraticCurveTo(-16, -rad - 34, 0, -rad - 4); ctx.fill(); ctx.restore(); }
  ctx.restore();
  // small field flowers scattered on the open ground
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, rr = rad + 34 + R() * (M - rad - 118);
    const x = M + Math.cos(a) * rr, y = M + Math.sin(a) * rr;
    ctx.fillStyle = i % 3 ? light : dark;
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const aa = (k / 5) * Math.PI * 2; ctx.ellipse(x + Math.cos(aa) * 5, y + Math.sin(aa) * 5, 3.4, 3.4, 0, 0, Math.PI * 2); } ctx.fill();
  }
  // pile / fibre noise
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const n = 0.86 + fbm(x / 5, y / 9, seed, 2) * 0.3; const i = (y * size + x) * 4; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
  ctx.putImageData(img, 0, 0);
  const out = { map: toTexture(c, 1), roughness: 1 };
  cache.set(key, out); return out;
}

export function tileTexture({ size = 256, color = '#dcd6cc', grout = '#a9a29a', repeat = 4, n = 2 } = {}) {
  const key = `tile${color}${n}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d'); const hc = canvas(size), hctx = hc.getContext('2d');
  ctx.fillStyle = grout; ctx.fillRect(0, 0, size, size); hctx.fillStyle = '#555'; hctx.fillRect(0, 0, size, size);
  const s = size / n, g = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 0.94 + noise2(i, j, 4) * 0.08; const col = new THREE.Color(color).multiplyScalar(v);
    ctx.fillStyle = `#${col.getHexString()}`; ctx.fillRect(i * s + g, j * s + g, s - g * 2, s - g * 2);
    hctx.fillStyle = '#bbb'; hctx.fillRect(i * s + g, j * s + g, s - g * 2, s - g * 2);
  }
  const out = { map: toTexture(c, repeat), normalMap: toTexture(normalFromHeight(hc, 1.5), repeat, false), roughness: 0.35 };
  cache.set(key, out); return out;
}

// --- generative wallpaper -------------------------------------------------------------------
// Vector motifs drawn as canvas paths on a half-drop grid. Everything is stamped nine times
// (dx,dy ∈ {-S,0,S}) so the tile wraps seamlessly. Motif + palette shift are seeded per game.
const MOTIFS = ['sprig', 'bloom', 'fern', 'trellis', 'star'];

function drawMotif(ctx, kind, s, R, accent, accent2) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const leaf = (len, w, dir) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(dir * w, -len * 0.55, 0, -len); ctx.quadraticCurveTo(-dir * w * 0.25, -len * 0.5, 0, 0); ctx.fill(); };
  if (kind === 'sprig') {
    ctx.strokeStyle = accent; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(0, s * 0.42); ctx.quadraticCurveTo(s * 0.06, 0, 0, -s * 0.4); ctx.stroke();
    ctx.fillStyle = accent2;
    for (let i = 0; i < 4; i++) { const y = s * (0.26 - i * 0.16); for (const dir of [-1, 1]) { ctx.save(); ctx.translate(0, y); ctx.rotate(dir * (0.9 - i * 0.08)); leaf(s * 0.2, s * 0.075, 1); ctx.restore(); } }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, -s * 0.42, s * 0.035, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'bloom') {
    const petals = 5 + Math.floor(R() * 3);
    ctx.fillStyle = accent2;
    for (let i = 0; i < petals; i++) { ctx.save(); ctx.rotate((i / petals) * Math.PI * 2); leaf(s * 0.34, s * 0.12, 1); ctx.restore(); }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, s * 0.062, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = s * 0.02;
    for (let i = 0; i < petals; i++) { ctx.save(); ctx.rotate((i / petals) * Math.PI * 2 + Math.PI / petals); ctx.beginPath(); ctx.moveTo(0, -s * 0.1); ctx.lineTo(0, -s * 0.24); ctx.stroke(); ctx.restore(); }
  } else if (kind === 'fern') {
    ctx.strokeStyle = accent; ctx.lineWidth = s * 0.028;
    ctx.beginPath(); ctx.moveTo(0, s * 0.4); ctx.quadraticCurveTo(s * 0.14, 0, s * 0.02, -s * 0.42); ctx.stroke();
    ctx.lineWidth = s * 0.02; ctx.strokeStyle = accent2;
    for (let i = 0; i < 7; i++) { const t = i / 7, y = s * (0.36 - t * 0.7), l = s * (0.2 - t * 0.13); for (const dir of [-1, 1]) { ctx.beginPath(); ctx.moveTo(t * s * 0.1, y); ctx.quadraticCurveTo(dir * l, y - l * 0.4, dir * l * 1.15, y - l); ctx.stroke(); } }
  } else if (kind === 'trellis') {
    ctx.strokeStyle = accent; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.quadraticCurveTo(0, -s * 0.34, s * 0.5, 0); ctx.quadraticCurveTo(0, s * 0.34, -s * 0.5, 0); ctx.stroke();
    ctx.fillStyle = accent2; ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent2; ctx.lineWidth = s * 0.018;
    ctx.beginPath(); ctx.moveTo(-s * 0.22, 0); ctx.lineTo(s * 0.22, 0); ctx.stroke();
  } else {
    ctx.fillStyle = accent2; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = s * (i % 2 ? 0.12 : 0.3); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, s * 0.05, 0, Math.PI * 2); ctx.fill();
  }
}

export function wallpaperTexture({ size = 512, base = '#f1e9dc', accent = '#d8c8b2', repeat = 4, seed = 17, motif = null, cell = 4 } = {}) {
  const key = `wp${base}${accent}${seed}${motif}${cell}`; if (cache.has(key)) return cache.get(key);
  const R = mulberry32((seed >>> 0) || 17);
  const c = canvas(size), ctx = c.getContext('2d');
  const bc = new THREE.Color(base), ac = new THREE.Color(accent);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  // subtle two-tone: soft vertical bands slightly off the base colour
  const band = bc.clone().lerp(ac, 0.22);
  ctx.fillStyle = `#${band.getHexString()}`; ctx.globalAlpha = 0.35;
  const bands = 4 + Math.floor(R() * 3), bw = size / bands;
  for (let i = 0; i < bands; i += 2) ctx.fillRect(i * bw, 0, bw, size);
  ctx.globalAlpha = 1;
  // hairline pinstripes between the bands
  ctx.strokeStyle = `#${bc.clone().lerp(ac, 0.45).getHexString()}`; ctx.lineWidth = 1;
  for (let i = 0; i <= bands; i++) { ctx.beginPath(); ctx.moveTo(i * bw, 0); ctx.lineTo(i * bw, size); ctx.stroke(); }
  const kind = motif || MOTIFS[Math.floor(R() * MOTIFS.length)];
  const a1 = `#${ac.getHexString()}`, a2 = `#${ac.clone().lerp(bc, 0.45).getHexString()}`;
  const step = size / cell, ms = step * 0.78;
  for (let gy = 0; gy < cell; gy++) for (let gx = 0; gx < cell; gx++) {
    const cx = gx * step + step / 2 + (gy % 2 ? step / 2 : 0), cy = gy * step + step / 2;
    const rot = (R() - 0.5) * 0.5, sc = 0.82 + R() * 0.3;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      if (cx + dx < -step || cx + dx > size + step || cy + dy < -step || cy + dy > size + step) continue;
      ctx.save(); ctx.translate(cx + dx, cy + dy); ctx.rotate(rot); ctx.scale(sc, sc);
      drawMotif(ctx, kind, ms, mulberry32(seed + gx * 31 + gy * 7), a1, a2);
      ctx.restore();
    }
  }
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const n = 0.965 + fbm(x / 14, y / 14, seed + 3, 2) * 0.07; const i = (y * size + x) * 4; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
  ctx.putImageData(img, 0, 0);
  const out = { map: toTexture(c, repeat), roughness: 0.9, motif: kind };
  cache.set(key, out); return out;
}

// Printed knit for baby clothes: a knit weave plus a seeded print (stripes / dots / stars / checks).
export function printedFabricTexture({ size = 256, color = '#f5f1ea', repeat = 10, seed = 5, print = 'dots' } = {}) {
  const key = `print${color}${seed}${print}`; if (cache.has(key)) return cache.get(key);
  const base = fabricTexture({ size, color, repeat, seed, weave: 3 });
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.drawImage(base.map.image, 0, 0);
  const col = new THREE.Color(color);
  const dark = col.clone().lerp(new THREE.Color(0x2b3a55), 0.42), light = col.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const a1 = `#${dark.getHexString()}`, a2 = `#${light.getHexString()}`;
  const R = mulberry32(seed * 7919 + 13);
  ctx.globalAlpha = 0.75;
  if (print === 'stripes') { ctx.fillStyle = a1; for (let i = 0; i < 8; i++) ctx.fillRect(0, i * (size / 8), size, size / 26); }
  else if (print === 'checks') { ctx.fillStyle = a1; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) ctx.fillRect(i * size / 8, j * size / 8, size / 8, size / 8); }
  else if (print === 'stars') {
    ctx.fillStyle = a1;
    for (let i = 0; i < 22; i++) { const x = R() * size, y = R() * size, s = size * 0.035; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? s * 0.45 : s; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); }
  } else { for (let i = 0; i < 46; i++) { ctx.fillStyle = i % 3 ? a2 : a1; ctx.beginPath(); ctx.arc(R() * size, R() * size, size * (0.012 + R() * 0.012), 0, Math.PI * 2); ctx.fill(); } }
  ctx.globalAlpha = 1;
  const out = { map: toTexture(c, repeat), normalMap: base.normalMap, roughness: 0.98 };
  cache.set(key, out); return out;
}

export function skinDetailTexture(size = 256) {
  if (cache.has('skin')) return cache.get('skin');
  const hc = canvas(size), hctx = hc.getContext('2d'), img = hctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const pores = fbm(x / 3.2, y / 3.2, 21, 3), fine = fbm(x / 11, y / 11, 22, 2);
    const v = 0.5 + (pores - 0.5) * 0.35 + (fine - 0.5) * 0.25;
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);
  const t = toTexture(normalFromHeight(hc, 0.55), 8, false);
  cache.set('skin', t); return t;
}

export function stdMaterial(tex, extra = {}) {
  return new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap || null, normalScale: new THREE.Vector2(0.6, 0.6), roughness: tex.roughness ?? 0.8, metalness: 0, ...extra });
}
