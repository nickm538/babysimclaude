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
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, DATA_DIR: dir, DATABASE_URL: '', SESSION_SECRET: 'smoke', NODE_ENV: 'development', CRADLE_DEBUG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const clickStep = async (sel, label) => { try { const n = await page.$$eval(sel, (els) => { if (!els.length) throw new Error('not found'); if (els[0].disabled) throw new Error('disabled'); els[0].click(); return els.length; }); void n; return true; } catch (e) { await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-fail.png') }); check(false, `${label}: ${String(e.message).split('\n')[0]}`); return false; } };
    await clickStep('#fab-phone', 'open phone'); await wait(300);
    const tabs = ['baby', 'health', 'shop', 'wardrobe', 'school', 'home', 'friends', 'journal', 'settings'];
    const tabLens = {};
    for (const t of tabs) { await clickStep(`[data-tab="${t}"]`, 'tab ' + t); await wait(150); tabLens[t] = await page.evaluate(() => document.querySelector('#ph-body').innerHTML.length); }
    check(Object.values(tabLens).every((n) => n > 200), `phone tabs render (${Object.entries(tabLens).map(([k, v]) => k + ':' + v).join(' ')})`);
    await clickStep('[data-tab="shop"]', 'shop tab'); await wait(150);
    await clickStep('[data-item="wipes"] [data-add]', 'add to cart'); await wait(100); await clickStep('[data-cart-order]', 'order'); await wait(600);
    const ordered = await page.evaluate(() => (window.__cradle && document.body.innerText.includes('Order placed')) || document.querySelectorAll('.toast').length > 0);
    check(ordered, 'shop order from the phone');
    await clickStep('[data-tab="baby"]', 'baby tab'); await wait(200); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-phone.png') });
    await clickStep('#ph-close', 'close phone'); await wait(200);
    await clickStep('#fab-chat', 'open chat'); await wait(400);
    try { await page.$eval('#chat-input', (el) => { el.value = 'hello little one, mama is here'; }); } catch (e) { check(false, 'chat input: ' + e.message.split('\n')[0]); }
    await clickStep('#chat-form button[type=submit]', 'send chat'); await wait(1500);
    const chatOk = await page.evaluate(() => document.querySelectorAll('.msg.baby').length >= 1 && document.querySelectorAll('.msg.parent').length >= 1);
    check(chatOk, 'chat panel round-trip');
    await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-chat.png') });
    await clickStep('#chat-close', 'close chat'); await wait(200);
    const temperOpened = await page.evaluate(() => { const b = [...document.querySelectorAll('.actions button')].find((x) => x.textContent.includes('Lose your temper')); if (!b) return 'nobutton'; b.click(); return 'clicked'; }); await wait(400); const hasModal = await page.evaluate(() => !!document.querySelector('#ch-cancel')); check(temperOpened === 'clicked' && hasModal, 'temper chooser opens'); if (hasModal) await page.$eval('#ch-cancel', (el) => el.click());
    // age the baby into a toddler through the debug endpoint and make sure the model rebuilds without errors
    await j('POST', `/api/games/${id}/actions`, { id: 'put_down', params: { location: 'play_mat', position: 'sitting' } }, u.token);
    const aged = await j('POST', `/api/games/${id}/debug/advance`, { days: 730 }, u.token);
    check(aged.game.sim.days > 700, `debug advance -> ${aged.game.sim.days.toFixed(0)} days, status ${aged.game.status}`);
    await wait(4000);
    const rebuilt = await page.evaluate(() => { const G = window.__cradle; return { days: G.baby.days, band: G.baby.builtDays, verts: G.baby.body.geometry.attributes.position.count, cap: !!G.baby.face.cap }; });
    check(rebuilt.days > 700 && rebuilt.band >= 9, `toddler model rebuilt (band ${rebuilt.band}, ${rebuilt.verts} verts, hair cap ${rebuilt.cap})`);
    await page.evaluate(() => { const G = window.__cradle; G.controls.colliders = []; const b = G.baby.worldPosition(); G.controls.eyeHeight = 1.1; G.controls.pos.set(b.x + 0.2, 0, b.z + 1.3); G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
    await wait(1500); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-toddler.png') });

    const shot = path.join(process.cwd(), 'scripts', 'smoke-screenshot.png'); await page.screenshot({ path: shot }); console.log('screenshot ->', shot);
    if (process.env.SMOKE_SHOTS) {
      // put the baby in the crib and look at it from the nursery; then a close-up of the face
      await j('POST', `/api/games/${id}/actions`, { id: 'put_down', params: { location: 'crib', position: 'back' } }, u.token);
      await wait(2500);
      await page.evaluate(() => { const G = window.__cradle; G.controls.pos.set(3.4, 0, -2.2); G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
      await wait(1500); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-crib.png') });
      await page.evaluate(() => { const G = window.__cradle; G.controls.pos.set(4.0, 0, -3.5); G.controls.eyeHeight = 1.25; G.controls.lookAt(G.baby.headWorldPosition()); G.controls.lookWeight = 1; });
      await wait(1500); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-face.png') });
      await page.evaluate(() => { const G = window.__cradle; G.controls.colliders = []; const h = G.baby.headWorldPosition(); G.controls.eyeHeight = h.y + 0.42; G.controls.pos.set(h.x, 0, h.z + 0.06); G.controls.yaw = 0; G.controls.pitch = -1.5; G.controls.lookWeight = 0; });
      await wait(1200); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-overhead.png') });
      await page.evaluate(() => { const G = window.__cradle; const b = G.baby.worldPosition(); G.controls.eyeHeight = b.y + 0.22; G.controls.pos.set(b.x, 0, b.z + 0.75); G.controls.yaw = 0; G.controls.pitch = -0.3; G.controls.lookWeight = 0; });
      await wait(1200); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-side.png') });
      await page.evaluate(() => { const G = window.__cradle; G.baby.debug = { noCloth: true, skeleton: true }; const h = G.baby.headWorldPosition(); G.controls.eyeHeight = h.y + 0.5; G.controls.pos.set(h.x + 0.15, 0, h.z + 0.02); G.controls.yaw = 0; G.controls.pitch = -1.5; });
      await wait(1200); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-skeleton.png') });
      await page.evaluate(() => { const G = window.__cradle; G.baby.debug = {}; });
      await page.evaluate(() => { const G = window.__cradle; G.controls.eyeHeight = 1.62; G.controls.pos.set(-1.5, 0, 3.9); G.controls.yaw = 0; G.controls.pitch = -0.1; G.controls.lookWeight = 0; });
      await wait(1200); await page.screenshot({ path: path.join(process.cwd(), 'scripts', 'smoke-room.png') });
    }
    check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors.slice(0, 5).map((e) => e.replace(/\s+/g, ' ').slice(0, 600)).join(' | ') : ''}`);
    await browser.close();
  } else console.log('playwright not installed — skipping browser check');
} catch (e) { failed = true; console.error('FAIL', e); }
srv.kill('SIGTERM');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
