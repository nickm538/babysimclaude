// Procedural PBR-ish textures drawn on canvases (no asset downloads): wood, plaster, fabric, rug, tile, wallpaper.
import * as THREE from 'three';

const cache = new Map();

function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

function noise2(x, y, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = noise2(x0, y0, seed), b = noise2(x0 + 1, y0, seed), c = noise2(x0, y0 + 1, seed), d = noise2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * smoothNoise(x * f, y * f, seed + i); a *= 0.5; f *= 2.1; } return s; }

function toTexture(c, repeat = 1, srgb = true) {
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

export function rugTexture({ size = 512, colors = ['#b8927a', '#8a5f4a', '#d9c5b2', '#6f4a3c'], seed = 9 } = {}) {
  const key = `rug${colors.join()}${seed}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, size, size);
  // concentric bordered pattern with diamonds
  const bands = 6;
  for (let i = 0; i < bands; i++) { const m = 12 + i * 34; ctx.strokeStyle = colors[(i + 1) % colors.length]; ctx.lineWidth = 10; ctx.strokeRect(m, m, size - m * 2, size - m * 2); }
  ctx.fillStyle = colors[3];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const cx = 60 + i * 78, cy = 60 + j * 78; if (cx > size - 60 || cy > size - 60) continue;
    ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 18, cy); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 18, cy); ctx.closePath(); ctx.fill();
  }
  // fiber noise overlay
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const n = 0.85 + fbm(x / 6, y / 6, seed, 2) * 0.3; const i = (y * size + x) * 4; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
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

export function wallpaperTexture({ size = 256, base = '#f1e9dc', accent = '#d8c8b2', repeat = 4 } = {}) {
  const key = `wp${base}${accent}`; if (cache.has(key)) return cache.get(key);
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = accent; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 64 + 32 + (j % 2) * 32, cy = j * 64 + 32;
    ctx.beginPath(); ctx.ellipse(cx, cy, 14, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy + 22); ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const n = 0.96 + fbm(x / 14, y / 14, 11, 2) * 0.08; const i = (y * size + x) * 4; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
  ctx.putImageData(img, 0, 0);
  const out = { map: toTexture(c, repeat), roughness: 0.9 };
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
