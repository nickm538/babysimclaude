// End-to-end smoke test: boots the server on a temp file store, registers a user, creates a game,
// performs actions over REST + WebSocket, then (if playwright is available) loads the 3D client in Chromium
// and checks for console errors and a rendered frame. Usage: node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const PORT = Number(process.env.SMOKE_PORT) || 3457;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cradle-smoke-'));
// Defaults to the JSON file store so the smoke needs no database. Set SMOKE_DATABASE_URL to run the
// whole thing against a real Postgres instead — that is the path Railway takes, so it is worth
// exercising before a deploy.
const smokeDb = process.env.SMOKE_DATABASE_URL || '';
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: dir, DATABASE_URL: smokeDb, SESSION_SECRET: 'smoke', NODE_ENV: 'development', CRADLE_DEBUG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`)); srv.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
const base = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() { for (let i = 0; i < 40; i++) { try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch { /* */ } await wait(250); } throw new Error('server did not start'); }
const j = async (method, p, body, token) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(`${p}: ${d.error}`); return d; };
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.error('FAIL', m); } else console.log('ok  ', m); };
try {
  await ready();
  const u = await j('POST', '/api/auth/register', { username: 'smoke' + Date.now().toString(36).slice(-4), password: 'test1234' });
  check(u.token, 'register');
  const cat = await j('GET', '/api/games/catalog', null, u.token); check(cat.shop.length > 10, 'catalog');
  const g = await j('POST', '/api/games', { babyName: 'Smokey', sex: 'girl' }, u.token); check(g.game.baby.name === 'Smokey', 'create game');
  const id = g.game.id;
  const a = await j('POST', `/api/games/${id}/actions`, { id: 'hold', params: {} }, u.token); check(a.ok && a.game.baby.state.held, 'hold via REST');
  const o = await j('POST', `/api/games/${id}/orders`, { items: [{ id: 'formula' }, { id: 'diapers', size: 'N' }] }, u.token); check(o.ok, 'order');
  const c = await j('POST', `/api/games/${id}/chat`, { text: 'hi sweet girl' }, u.token); check(typeof c.reply === 'string' && c.reply.length > 3, `chat (${c.source}): ${c.reply.slice(0, 60)}`);
  const h = await j('POST', `/api/games/${id}/chat`, { text: 'SHUT UP AND STOP CRYING!!!' }, u.token); check(h.tone === 'harsh' && h.game.stats.yells === 1, 'harsh chat counts as yelling');
  // websocket
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(u.token)}&game=${id}`);
  const first = await new Promise((res, rej) => { ws.once('message', (m) => res(JSON.parse(m))); ws.once('error', rej); });
  check(first.type === 'state' && first.view.id === id, 'ws hello state');
  ws.send(JSON.stringify({ type: 'action', id: 'cuddle', params: {}, reqId: 1 }));
  const ar = await new Promise((res) => { const on = (m) => { const d = JSON.parse(m); if (d.type === 'action_result') { ws.off('message', on); res(d); } }; ws.on('message', on); });
  check(ar.ok, 'ws action');
  const tick = await new Promise((res) => { const on = (m) => { const d = JSON.parse(m); if (d.type === 'state' && d.view.sim.time > 0) { ws.off('message', on); res(d); } }; ws.on('message', on); });
  check(tick.view.sim.time > 0, `ws tick advanced sim to ${tick.view.sim.time.toFixed(0)}s`);
  ws.close();
  const ev = await j('GET', `/api/games/${id}/events`, null, u.token); check(Array.isArray(ev.events), 'events endpoint');
  // browser
  let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import(path.join(process.cwd(), 'node_modules/playwright/index.mjs')); } catch { /* */ } }
  if (!pw) { try { const p = process.env.SMOKE_PW_PATH; if (p) pw = await import(p); } catch { /* */ } }
  if (pw) {
    const browser = await pw.chromium.launch({ executablePath: process.env.SMOKE_CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Screenshots are diagnostics, not assertions. On a software rasteriser a single frame can take
    // longer than Playwright's default timeout, and a stalled screenshot must never hold up (or
    // silently fail) a run whose actual checks have all passed.
    const shoot = async (file, ms = 15000) => {
      try { await page.screenshot({ path: path.join(process.cwd(), 'scripts', file), timeout: ms }); return true; }
      catch (e) { console.log(`note screenshot ${file} skipped: ${String(e.message).split('\n')[0]}`); return false; }
    };
    const errors = [];
    page.on('pageerror', (e) => errors.push((e && e.stack) ? String(e.stack) : String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.evaluate((t) => localStorage.setItem('cradle.token', t), u.token);
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__cradle && window.__cradle.baby && window.__cradle.baby.body, null, { timeout: 60000 }).catch(() => {});
    await wait(2500);
    const info = await page.evaluate(() => { const G = window.__cradle; const gl = document.getElementById('gl'); return { built: !!(G && G.baby && G.baby.body), verts: G && G.baby && G.baby.body ? G.baby.body.geometry.attributes.position.count : 0, hud: !!document.querySelector('.topbar'), size: [gl.width, gl.height], hasBars: !!document.getElementById('bar-fullness') }; });
    check(info.built, `baby mesh built (${info.verts} vertices)`);
    check(info.hud && info.hasBars, 'HUD rendered');
    // click through the phone tabs, the shop cart, the chat and the temper chooser
    const clickStep = async (sel, label) => { try { const n = await page.$$eval(sel, (els) => { if (!els.length) throw new Error('not found'); if (els[0].disabled) throw new Error('disabled'); els[0].click(); return els.length; }); void n; return true; } catch (e) { await shoot('smoke-fail.png'); check(false, `${label}: ${String(e.message).split('\n')[0]}`); return false; } };
    await clickStep('#fab-phone', 'open phone'); await wait(300);
    const tabs = ['baby', 'health', 'shop', 'wardrobe', 'school', 'home', 'contacts', 'friends', 'story', 'settings'];
    const tabLens = {};
    for (const t of tabs) { await clickStep(`[data-tab="${t}"]`, 'tab ' + t); await wait(150); tabLens[t] = await page.evaluate(() => document.querySelector('#ph-body').innerHTML.length); }
    check(Object.values(tabLens).every((n) => n > 200), `phone tabs render (${Object.entries(tabLens).map(([k, v]) => k + ':' + v).join(' ')})`);
    await clickStep('[data-tab="shop"]', 'shop tab'); await wait(150);
    await clickStep('[data-item="wipes"] [data-add]', 'add to cart'); await wait(100); await clickStep('[data-cart-order]', 'order'); await wait(600);
    const ordered = await page.evaluate(() => (window.__cradle && document.body.innerText.includes('Order placed')) || document.querySelectorAll('.toast').length > 0);
    check(ordered, 'shop order from the phone');
    await clickStep('[data-tab="baby"]', 'baby tab'); await wait(200); await shoot('smoke-phone.png');
    await clickStep('#ph-close', 'close phone'); await wait(200);
    await clickStep('#fab-chat', 'open chat'); await wait(400);
    try { await page.$eval('#chat-input', (el) => { el.value = 'hello little one, mama is here'; }); } catch (e) { check(false, 'chat input: ' + e.message.split('\n')[0]); }
    await clickStep('#chat-form button[type=submit]', 'send chat'); await wait(1500);
    const chatOk = await page.evaluate(() => document.querySelectorAll('.msg.baby').length >= 1 && document.querySelectorAll('.msg.parent').length >= 1);
    check(chatOk, 'chat panel round-trip');
    await shoot('smoke-chat.png');
    await clickStep('#chat-close', 'close chat'); await wait(200);
    // fire a particle burst so the effects shader actually compiles and runs a few frames
    const burst = await page.evaluate(() => {
      const G = window.__cradle;
      if (!G || !G.effects) return 'missing';
      G.effects.emit('confetti', G.baby.headWorldPosition(), 64);
      G.effects.emit('hearts', G.baby.headWorldPosition(), 24);
      return G.effects.count;
    });
    await wait(500);
    check(typeof burst === 'number' && burst > 0, `particle burst emitted (${burst})`);
    const temperOpened = await page.evaluate(() => { const b = [...document.querySelectorAll('.actions button')].find((x) => x.textContent.includes('Lose your temper')); if (!b) return 'nobutton'; b.click(); return 'clicked'; }); await wait(400); const hasModal = await page.evaluate(() => !!document.querySelector('#ch-cancel')); check(temperOpened === 'clicked' && hasModal, 'temper chooser opens'); if (hasModal) await page.$eval('#ch-cancel', (el) => el.click());
    // a visitor should actually appear in the room, not just in the Family tab
    const vis = await j('POST', `/api/games/${id}/debug/visitor`, { activity: 'holding the baby' }, u.token);
    check(vis.ok, `debug visitor -> ${vis.visitor ? vis.visitor.name : 'none'}`);
    await wait(2500);
    const npc = await page.evaluate(() => {
      const G = window.__cradle;
      if (!G || !G.visitors) return { built: false, reason: 'no visitor manager' };
      const rec = [...G.visitors.people.values()][0];
      if (!rec) return { built: false, reason: 'nobody in the room' };
      let verts = 0, meshes = 0;
      rec.npc.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { meshes++; verts += o.geometry?.attributes?.position?.count || 0; } });
      // Rendered size, not designed size: the geometry's own box, the skinned box (what the bones do
      // to it), and the root's world scale. A person who is 1.5m in the layout must be 1.5m on screen.
      const body = rec.npc.body;
      body.geometry.computeBoundingBox();
      const g = body.geometry.boundingBox;
      let skinned = null;
      try { body.computeBoundingBox(); skinned = body.boundingBox; } catch { /* older three */ }
      rec.npc.root.updateMatrixWorld(true);
      const e = rec.npc.root.matrixWorld.elements;
      const worldScale = Math.hypot(e[0], e[1], e[2]);
      return { built: true, meshes, verts, hair: !!rec.npc.hair, height: rec.npc.layout.totalH, sitting: !!rec.npc.sitting,
        geoH: g.max.y - g.min.y, skinH: skinned ? skinned.max.y - skinned.min.y : null, worldScale, rootY: rec.npc.root.position.y };
    });
    check(npc.built && npc.verts > 3000, `visitor rendered (${npc.meshes} meshes, ${npc.verts} verts, ${npc.height ? npc.height.toFixed(2) : '?'}m)${npc.reason ? ' — ' + npc.reason : ''}`);
    if (npc.built) {
      // The rest-pose geometry must be exactly the designed height. The skinned box is the posed
      // one, so a visitor who is sitting down is legitimately shorter — and if they are seated, that
      // is the check: sitting has to actually change their shape, not just their position.
      check(Math.abs(npc.geoH * npc.worldScale - npc.height) < 0.1,
        `visitor is built at its designed height (layout ${npc.height.toFixed(2)}m, geometry ${npc.geoH.toFixed(2)}m, world scale ${npc.worldScale.toFixed(2)})`);
      if (npc.skinH != null) {
        const ok = npc.sitting ? npc.skinH < npc.geoH * 0.9 : Math.abs(npc.skinH - npc.geoH) < 0.2;
        check(ok, `visitor is posed ${npc.sitting ? 'sitting' : 'standing'} (skinned ${npc.skinH.toFixed(2)}m vs rest ${npc.geoH.toFixed(2)}m)`);
      }
    }
    // Stand back and look at the visitor so the screenshot shows a person, not a wall. The baby goes
    // down first, otherwise a held head fills the frame.
    if (npc.built) {
      await j('POST', `/api/games/${id}/actions`, { id: 'put_down', params: { location: 'play_mat', position: 'back' } }, u.token);
      await wait(600);
      await page.evaluate(() => {
        const G = window.__cradle;
        const rec = [...G.visitors.people.values()][0];
        const p = rec.npc.root.position;
        // yaw 0 looks down -Z, so stand on the +Z side of them and look back
        G.controls.pos.set(p.x, 1.62, p.z + 1.7);
        G.controls.yaw = 0; G.controls.pitch = -0.06;
      });
      await wait(1500);
      await shoot('smoke-visitor.png');
    }

    // Talking is gameplay: what you type must move real stats and cause real events.
    const beforeChat = await j('GET', `/api/games/${id}`, null, u.token);
    const esteem0 = beforeChat.game.baby.emo.esteem;
    check(typeof esteem0 === 'number', `self-esteem is tracked (${esteem0 == null ? 'missing' : esteem0.toFixed(0)})`);
    const cruel = await j('POST', `/api/games/${id}/chat`, { text: 'i hate you, you are horrible' }, u.token);
    check(cruel.game.baby.emo.esteem < esteem0 && Array.isArray(cruel.words) && cruel.words.length > 0,
      `cruelty lands (esteem ${esteem0.toFixed(0)} -> ${cruel.game.baby.emo.esteem.toFixed(0)}, ${(cruel.words || []).join('/')})`);
    const low = cruel.game.baby.emo.esteem;
    const kind = await j('POST', `/api/games/${id}/chat`, { text: 'i am sorry. i love you so much, you are wonderful' }, u.token);
    check(kind.game.baby.emo.esteem > low, `praise and apology repair some of it (-> ${kind.game.baby.emo.esteem.toFixed(0)})`);
    // A request a newborn cannot possibly carry out is refused by the simulation, with a reason.
    const chore = await j('POST', `/api/games/${id}/chat`, { text: 'go wash the dishes' }, u.token);
    check(chore.outcome && chore.outcome.kind === 'too_young', `a request is understood as a request (${chore.outcome ? chore.outcome.kind : 'none'})`);

    // the player's own arms are the most-looked-at geometry in the game — make sure they build
    await j('POST', `/api/games/${id}/actions`, { id: 'hold', params: {} }, u.token);
    await wait(1200);
    const arms = await page.evaluate(() => {
      const a = window.__cradle && window.__cradle.arms;
      if (!a || !a.right || !a.right.mesh) return { ok: false };
      const g = a.right.mesh.geometry;
      return { ok: true, verts: g.attributes.position.count, skinned: !!g.attributes.skinWeight, bones: Object.keys(a.right.bones).length, visible: a.rig.visible };
    });
    check(arms.ok && arms.verts > 2000 && arms.skinned, `first-person arm mesh (${arms.verts} verts, ${arms.bones} bones, skinned=${arms.skinned})`);

    // Every piece of skin must be a closed surface — no holes, no open ends, nothing you can see
    // into. A closed triangle mesh has no boundary edges (every edge is shared by exactly two faces),
    // so count them. Garments are cut open on purpose (neckline, cuffs) and are not checked here.
    const holes = await page.evaluate(() => {
      const G = window.__cradle;
      const boundaryEdges = (geo) => {
        const idx = geo.index; if (!idx) return -1;
        const seen = new Map(); const ia = idx.array;
        for (let i = 0; i < ia.length; i += 3) {
          for (const [a, b] of [[ia[i], ia[i + 1]], [ia[i + 1], ia[i + 2]], [ia[i + 2], ia[i]]]) {
            const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
            seen.set(k, (seen.get(k) || 0) + 1);
          }
        }
        let open = 0; for (const n of seen.values()) if (n !== 2) open++;
        return open;
      };
      const out = {};
      if (G.baby?.body) out.baby = boundaryEdges(G.baby.body.geometry);
      if (G.arms?.right?.mesh) out.arm = boundaryEdges(G.arms.right.mesh.geometry);
      const rec = G.visitors && [...G.visitors.people.values()][0];
      if (rec) out.visitor = boundaryEdges(rec.npc.body.geometry);
      return out;
    });
    const leaky = Object.entries(holes).filter(([, n]) => n !== 0);
    check(leaky.length === 0, `skin meshes are closed surfaces (${Object.entries(holes).map(([k, v]) => `${k}:${v}`).join(' ')} boundary edges)`);

    // Nothing in the world is see-through except window glass, and nothing is a bare flat colour.
    // These are design rules that are easy to break by accident and impossible to spot in a diff, so
    // they are audited on the live scene instead of trusted.
    const audit = await page.evaluate(() => {
      const G = window.__cradle;
      const seen = new Set(), ghosts = [], flat = [];
      G.R.scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (!m || seen.has(m.uuid)) continue;
          seen.add(m.uuid);
          if (m.userData && m.userData.glass) continue;
          if (m.isPointsMaterial || m.isLineBasicMaterial || m.isSpriteMaterial) continue;
          if (m.transparent === true && (m.opacity ?? 1) < 0.99) ghosts.push(`${o.name || o.type}:${m.type}@${(m.opacity ?? 1).toFixed(2)}`);
          // a material with no map, no normal map and no roughness map is a flat solid colour
          const textured = !!(m.map || m.normalMap || m.roughnessMap || m.emissiveMap || m.sheen > 0 || m.clearcoat > 0 || m.transmission > 0 || m.isShaderMaterial);
          if (!textured && !m.isMeshBasicMaterial) flat.push(`${o.name || o.type}:${m.type}`);
        }
      });
      return { ghosts: ghosts.slice(0, 8), ghostCount: ghosts.length, flat: flat.slice(0, 8), flatCount: flat.length, materials: seen.size };
    });
    check(audit.ghostCount === 0, `nothing is see-through but the windows (${audit.materials} materials, ${audit.ghostCount} translucent${audit.ghostCount ? ': ' + audit.ghosts.join(', ') : ''})`);
    check(audit.flatCount === 0, `nothing is a bare flat colour (${audit.flatCount} untextured${audit.flatCount ? ': ' + audit.flat.join(', ') : ''})`);

    // age the baby into a toddler through the debug endpoint and make sure the model rebuilds without errors
    await j('POST', `/api/games/${id}/actions`, { id: 'put_down', params: { location: 'play_mat', position: 'sitting' } }, u.token);
    const aged = await j('POST', `/api/games/${id}/debug/advance`, { days: 730 }, u.token);
    check(aged.game.sim.days > 700, `debug advance -> ${aged.game.sim.days.toFixed(0)} days, status ${aged.game.status}`);
    // The rebuild happens on the next rendered frame after the new state lands; under a software
    // rasteriser a frame can take seconds, so wait for the rebuild itself rather than a fixed time.
    await page.waitForFunction(() => { const G = window.__cradle; return G && G.baby && G.baby.builtDays >= 9; }, null, { timeout: 120000 }).catch(() => {});
    const rebuilt = await page.evaluate(() => { const G = window.__cradle; return { days: G.baby.days, band: G.baby.builtDays, verts: G.baby.body.geometry.attributes.position.count, cap: !!G.baby.face.cap }; });
    check(rebuilt.days > 700 && rebuilt.band >= 9, `toddler model rebuilt (band ${rebuilt.band}, ${rebuilt.verts} verts, hair cap ${rebuilt.cap})`);
    await page.evaluate(() => { const G = window.__cradle; G.controls.colliders = []; const b = G.baby.worldPosition(); G.controls.eyeHeight = 1.1; G.controls.pos.set(b.x + 0.2, 0, b.z + 1.3); G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
    await wait(1500); await shoot('smoke-toddler.png');

    if (await shoot('smoke-screenshot.png')) console.log('screenshot ->', path.join(process.cwd(), 'scripts', 'smoke-screenshot.png'));
    if (process.env.SMOKE_SHOTS) {
      // put the baby in the crib and look at it from the nursery; then a close-up of the face
      await j('POST', `/api/games/${id}/actions`, { id: 'put_down', params: { location: 'crib', position: 'back' } }, u.token);
      await wait(2500);
      await page.evaluate(() => { const G = window.__cradle; G.controls.pos.set(3.4, 0, -2.2); G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
      await wait(1500); await shoot('smoke-crib.png');
      await page.evaluate(() => { const G = window.__cradle; G.controls.pos.set(4.0, 0, -3.5); G.controls.eyeHeight = 1.25; G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
      await wait(1500); await shoot('smoke-face.png');
      await page.evaluate(() => { const G = window.__cradle; G.controls.colliders = []; const h = G.baby.headWorldPosition(); G.controls.eyeHeight = h.y + 0.42; G.controls.pos.set(h.x, 0, h.z + 0.06); G.controls.yaw = 0; G.controls.pitch = -1.5; G.controls.lookWeight = 0; });
      await wait(1200); await shoot('smoke-overhead.png');
      await page.evaluate(() => { const G = window.__cradle; const b = G.baby.worldPosition(); G.controls.eyeHeight = b.y + 0.22; G.controls.pos.set(b.x, 0, b.z + 0.75); G.controls.yaw = 0; G.controls.pitch = -0.3; G.controls.lookWeight = 0; });
      await wait(1200); await shoot('smoke-side.png');
      await page.evaluate(() => { const G = window.__cradle; G.baby.debug = { noCloth: true, skeleton: true }; const h = G.baby.headWorldPosition(); G.controls.eyeHeight = h.y + 0.5; G.controls.pos.set(h.x + 0.15, 0, h.z + 0.02); G.controls.yaw = 0; G.controls.pitch = -1.5; });
      await wait(1200); await shoot('smoke-skeleton.png');
      await page.evaluate(() => { const G = window.__cradle; G.baby.debug = {}; });
      // One reference shot at full quality — shadows, ambient occlusion, full mesh density — so the
      // headless run can show what the pipeline actually produces rather than its fallback.
      if (process.env.SMOKE_HQ) {
        await page.goto(base + '/?quality=high', { waitUntil: 'load' });
        await page.waitForFunction(() => window.__cradle && window.__cradle.baby && window.__cradle.baby.body, null, { timeout: 180000 }).catch(() => {});
        await wait(6000);
        const hq = await page.evaluate(() => {
          const G = window.__cradle;
          G.controls.colliders = [];
          G.controls.pos.set(2.0, 0, 1.1); G.controls.eyeHeight = 1.5; G.controls.yaw = 0.35; G.controls.pitch = -0.22;
          return { post: !!(G.R.post && G.R.post.enabled), shadow: G.R.sun.shadow.mapSize.x, verts: G.baby.body.geometry.attributes.position.count };
        });
        await wait(8000);
        await shoot('smoke-hq.png', 180000);
        console.log(`note high-quality reference: post=${hq.post} shadowMap=${hq.shadow} babyVerts=${hq.verts}`);
      }
      await page.evaluate(() => { const G = window.__cradle; G.controls.eyeHeight = 1.62; G.controls.pos.set(-1.5, 0, 3.9); G.controls.yaw = 0; G.controls.pitch = -0.1; G.controls.lookWeight = 0; });
      await wait(1200); await shoot('smoke-room.png');
    }
    check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors.slice(0, 5).map((e) => e.replace(/\s+/g, ' ').slice(0, 600)).join(' | ') : ''}`);
    await browser.close();
  } else console.log('playwright not installed — skipping browser check');
} catch (e) { failed = true; console.error('FAIL', e); }
srv.kill('SIGTERM');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
