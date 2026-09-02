// Cradle — client bootstrap and the game loop glue between the 3D world, the UI and the server.
import * as THREE from 'three';
import { api } from './net/api.js';
import { GameSocket } from './net/socket.js';
import { store } from './state.js';
import { Renderer } from './engine/renderer.js';
import { FirstPersonControls } from './engine/controls.js';
import { buildHouse, SPOTS } from './world/house.js';
import { Baby } from './characters/baby.js';
import { ParentArms } from './characters/parentArms.js';
import { GameAudio } from './audio/audio.js';
import { HUD } from './ui/hud.js';
import { contextActions } from './ui/actions.js';
import { Phone } from './ui/phone.js';
import { Chat } from './ui/chat.js';
import { authScreen, gameSelectScreen, awayModal, deathModal, winModal, chooserModal } from './ui/screens.js';
import { NotificationCenter } from './ui/notifications.js';
import { buildArt } from './world/art.js';
import { chooseWord, chooseAllergen, chooseDiscipline, choosePlayActivity, chooseLearn, chooseCare, chooseChores, showObservation, ACTION_DUR } from './ui/interactions.js';

const $boot = document.getElementById('boot'), $status = document.getElementById('boot-status');
const ui = document.getElementById('ui'), overlay = document.getElementById('overlay');
const status = (t) => { $status.textContent = t; };

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

async function main() {
  status('Signing in…');
  if (api.token) { try { const r = await api.me(); store.user = r.user; } catch { api.setToken(null); } }
  if (!store.user) { $boot.classList.add('out'); await authScreen(overlay); }
  status('Loading…');
  store.catalog = await api.catalog(); store.llm = store.catalog.llm;
  $boot.classList.add('out');
  const games = (await api.games()).games;
  const active = games.find((g) => g.status === 'active');
  const pick = active && sessionStorage.getItem('cradle.autoresume') !== '0' && games.length === 1 ? { id: active.id } : await gameSelectScreen(overlay, games);
  await startGame(pick.id, pick.fresh);
}

async function startGame(gameId, fresh) {
  store.gameId = gameId;
  const first = await api.game(gameId);
  store.setView(first.game);
  const view = first.game;
  const G = window.__cradle = buildWorld(view);
  G.tts = localStorage.getItem('cradle.tts') !== '0';
  if (first.awaySummary && first.awaySummary.hours >= 0.25 && !fresh) await awayModal(overlay, first.awaySummary, view);
  // audio needs a user gesture on iOS: first tap anywhere
  const unlock = () => { G.audio.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  G.socket = new GameSocket(api.token, gameId, {
    state: (v, events) => { store.status = 'online'; store.setView(v, events); },
    status: (s) => { store.status = s; if (store.view) store.emit('view', { view: store.view, prev: store.view, events: [] }); },
    playdate: (m) => handlePlaydate(G, m),
  });
  store.on('event', (e) => onEvent(G, e));
  store.on('view', ({ view: v, prev }) => onView(G, v, prev));
  if (view.status === 'dead') deathModal(overlay, view, () => restart());
  if (view.status === 'won' && !sessionStorage.getItem('cradle.winShown')) { sessionStorage.setItem('cradle.winShown', '1'); winModal(overlay, view, () => restart()); }
  G.arms.set(view.baby.state.held ? 'hold' : 'none');
  if (fresh) tutorial(G);
}

function restart() { sessionStorage.setItem('cradle.autoresume', '0'); location.reload(); }

function buildWorld(view) {
  const R = new Renderer(document.getElementById('gl'));
  const house = buildHouse(R.scene);
  const controls = new FirstPersonControls(R.camera, document.getElementById('gl'), { colliders: house.colliders });
  const audio = new GameAudio();
  const baby = new Baby(R.scene, audio);
  const heldRig = new THREE.Group(); R.camera.add(heldRig); R.scene.add(R.camera);
  const arms = new ParentArms(R.camera, { skinTone: view.baby.appearance.skinTone });
  const G = { R, house, controls, audio, baby, heldRig, arms, action: null, holding: null, holdingFood: null, near: {}, tapCooldown: 0, guest: null, lastActionsKey: '' };
  const hud = new HUD(ui, {
    onSpeed: (s) => setSpeed(G, s),
    onPhone: () => { G.phone.toggle(); },
    onChat: () => { G.chat.toggle(); },
    onGoTo: () => goTo(G, 'baby'),
    onAlerts: () => { G.alerts.markAllSeen(); G.phone.open('story'); },
    onMood: () => G.phone.open('baby'),
  });
  G.hud = hud;
  const alertsHost = document.getElementById('alerts') || (() => { const d = document.createElement('div'); d.id = 'alerts'; ui.appendChild(d); return d; })();
  G.alerts = new NotificationCenter(alertsHost, {
    onOpen: () => G.phone.open('story'),
    onCta: (cta) => { if (!cta) return; if (String(cta.action).startsWith('ui:')) uiAction(G, String(cta.action).slice(3), cta.params); else runAction(G, cta.action, cta.params || {}, { anim: 'none', remote: true }); },
    audio, vibrate: (ms) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } },
    effects: () => G.effects,
    babyHead: () => baby.headWorldPosition(),
  });
  G.alerts.bindGame(store.gameId);
  G.alerts.attachBell(document.getElementById('fab-alerts'));
  try { G.art = buildArt(R.scene, { name: view.baby.name }); } catch (e) { console.warn('[art]', e.message); }
  G.phone = new Phone(overlay, { run: (id, p, o) => runAction(G, id, p, o), setSpeed: (s) => setSpeed(G, s), audio, switchGame: () => restart(), signOut: () => { api.setToken(null); location.reload(); }, playdate: (kind, arg) => playdate(G, kind, arg), get tts() { return G.tts; }, set tts(v) { G.tts = v; } });
  G.chat = new Chat(overlay, { nearBaby: () => G.near.baby || (store.view && store.view.baby.state.held), onReply: (text) => { if (G.tts && audio.ctx) audio.speak(text, store.view.sim.days); }, onSpeak: () => { controls.lookAt(baby.headWorldPosition()); } });
  controls.onStep = () => audio.footstep();
  R.onFrame.push((dt) => frame(G, dt));
  R.start();
  return G;
}

function setSpeed(G, s) { api.settings(store.gameId, { timeScale: s }).then((r) => { if (store.view) { store.view.settings = r.settings; store.emit('view', { view: store.view, prev: store.view, events: [] }); } }); }

const NEAR = { baby: 1.75, kitchen: 1.6, changing_table: 1.5, crib: 1.6, sofa: 1.6, play_mat: 1.5, high_chair: 1.4, playpen: 1.5, door: 1.8, potty: 1.2, toddler_bed: 1.6, thermostat: 1.2 };
const POINTS = { kitchen: [-5.2, 0, -2.6], changing_table: [4.6, 0, -1.2], crib: [4.6, 0, -3.5], sofa: [0.5, 0, 1.9], play_mat: [3.0, 0, 1.5], high_chair: [-3.5, 0, -2.5], playpen: [-2.5, 0, 1.2], door: [-1.5, 0, 4.6], potty: [5.3, 0, -0.2], toddler_bed: [4.6, 0, -3.5], thermostat: [0.25, 0, -4.7] };

function frame(G, dt) {
  const v = store.view; if (!v) return;
  G.controls.update(dt);
  G.baby.update(v, dt, G.R.camera, G.heldRig);
  G.arms.update(dt);
  if (G.guest) G.guest.update(G.guestView, dt, G.R.camera, new THREE.Group());
  // daylight
  G.R.setDaylight(v.sim.clock, v.sim.season);
  G.house.setNight(G.R.isNight, G.R.skyColor);
  G.house.furniture.lampShade.material.emissiveIntensity = G.R.lamp.intensity > 0.5 ? 0.9 : 0;
  if (G.audio.ctx) G.audio.setTimeOfDay(G.R.isNight, v.sim.clock / 3600);
  // proximity
  const p = G.controls.pos; const near = {};
  const bp = G.baby.worldPosition(); near.baby = v.baby.state.held || (Math.hypot(p.x - bp.x, p.z - bp.z) < NEAR.baby && !v.baby.state.hospitalized);
  for (const [k, pt] of Object.entries(POINTS)) near[k] = Math.hypot(p.x - pt[0], p.z - pt[2]) < NEAR[k];
  G.near = near;
  // baby label in screen space
  if (!v.baby.state.held && !v.baby.state.hospitalized) {
    const hp = G.baby.headWorldPosition().add(new THREE.Vector3(0, 0.25, 0));
    const sp = hp.clone().project(G.R.camera);
    const onScreen = sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1;
    const st = v.baby.state;
    const text = st.crying ? `😢 ${v.baby.name} — ${st.cryCause} (${Math.round(st.cryMinutes)} min)` : st.activity === 'sleeping' ? `😴 ${v.baby.name} — sleeping` : `${v.baby.name} — ${v.baby.mood}`;
    G.hud.setBabyLabel(onScreen ? { x: (sp.x * 0.5 + 0.5) * innerWidth, y: (-sp.y * 0.5 + 0.5) * innerHeight } : null, text, st.crying);
  } else G.hud.setBabyLabel(null);
  // tap-to-interact
  const tap = G.controls.consumeTap();
  if (tap && !G.action) handleTap(G, tap);
  // action progress
  if (G.action) {
    G.action.t += dt; const f = Math.min(1, G.action.t / G.action.dur);
    G.hud.progress(G.action.label, f);
    if (G.action.look) G.controls.lookAt(G.baby.headWorldPosition());
    if (f >= 1) finishAction(G);
  }
  if (G.art && G.art.update) G.art.update(v);
  if (!G.choiceOpen && v.pendingChoices && v.pendingChoices.length && !document.querySelector('.modal')) showChoice(G, v.pendingChoices[0]);
  // context actions (rebuild only when the situation changes)
  const key = JSON.stringify([near, G.holding, v.baby.state.held, v.baby.state.activity, v.baby.state.crying, v.baby.needs.diaper < 60, v.baby.state.needsBurp, v.house.doorPackages.length, v.house.nurseHere, v.parent.away, !!G.action, v.inventory.bottlesClean, v.baby.state.pacifier, v.baby.wear.swaddled]);
  if (key !== G.lastActionsKey) {
    G.lastActionsKey = key;
    G.hud.setActions(G.action ? [{ hint: G.action.label }] : contextActions({ view: v, near, holding: G.holding, holdingFood: G.holdingFood, run: (id, params, opts) => runAction(G, id, params, opts) }));
  }
  // world props reflecting state
  const F = G.house.furniture, inv = v.inventory;
  F.package.visible = v.house.doorPackages.length > 0; F.nurse.visible = !!v.house.nurseHere;
  F.playpen.visible = inv.playpen > 0; F.highChair.visible = inv.high_chair > 0; F.potty.visible = inv.potty > 0; F.toddlerBed.visible = inv.toddler_bed > 0; F.crib.visible = !(inv.toddler_bed > 0 && v.sim.days > 540);
  for (const [k, g] of Object.entries(F.proof)) g.visible = !!v.house.proofing[k];
  F.smallObjects.visible = !v.house.proofing.small_objects; G.house.gate.visible = !!v.house.proofing.stair_gate;
  F.mobileHub.rotation.y += dt * 0.4; F.bottle.visible = G.holding !== 'bottle';
  const bath = G.action && G.action.opts.bath; F.tub.visible = !!bath; F.water.visible = !!bath;
  G.house.furniture.nightlightMesh.material.emissiveIntensity = G.R.nightlight.intensity > 0 ? 0.8 : 0.05;
  if (G.audio.ctx) { G.audio.setWhiteNoise(v.baby.state.whiteNoise); G.audio.setMobile(v.baby.state.location === 'crib' && v.baby.state.activity !== 'sleeping' && inv.toys.includes('mobile') && v.sim.days < 150); }
}

function handleTap(G, tap) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2((tap.x / innerWidth) * 2 - 1, -(tap.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, G.R.camera);
  const targets = [...G.house.interactables, G.baby.root];
  const hits = ray.intersectObjects(targets, true);
  if (!hits.length) return;
  let o = hits[0].object; while (o && !o.userData.interact && o !== G.baby.root) o = o.parent;
  if (G.audio.ctx) G.audio.click();
  const v = store.view;
  if (o === G.baby.root || (o && o.parent === G.baby.root) || hits[0].object.parent?.name === 'face' || isDescendant(hits[0].object, G.baby.root)) { if (!G.near.baby) { store.toast(`Walk closer to ${v.baby.name}.`, 'info'); goTo(G, 'baby'); } else G.controls.lookAt(G.baby.headWorldPosition()); return; }
  const id = o && o.userData.interact ? o.userData.interact.id : null;
  if (!id) return;
  if (id === 'tablet') G.phone.open('baby');
  else if (id === 'thermostat') G.phone.open('home');
  else if (id === 'dresser') G.phone.open('wardrobe');
  else if (id === 'bookshelf') G.phone.open('school');
  else if (id === 'door') { if (G.near.door) { if (v.house.doorPackages.length) runAction(G, 'collect_package', { orderId: v.house.doorPackages[0] }, { anim: 'none', dur: 2 }); else if (v.house.nurseHere) runAction(G, 'nurse_visit', {}, { anim: 'item', item: 'medicine', dur: 5 }); else store.toast('Nobody at the door.', 'info'); } else goTo(G, 'door'); }
  else if (id === 'package') { if (G.near.door) runAction(G, 'collect_package', { orderId: v.house.doorPackages[0] }, { anim: 'none', dur: 2 }); else goTo(G, 'door'); }
  else if (id === 'nurse') { if (G.near.door) runAction(G, 'nurse_visit', {}, { anim: 'item', item: 'medicine', dur: 5 }); else goTo(G, 'door'); }
  else if (id === 'kitchen' || id === 'fridge') { if (!G.near.kitchen) goTo(G, 'kitchen'); else store.toast('Use the actions at the bottom to prepare food.', 'info'); }
  else if (['crib', 'changing_table', 'sofa', 'play_mat', 'high_chair', 'playpen', 'potty', 'rocker'].includes(id)) { if (!G.near[id === 'rocker' ? 'crib' : id]) goTo(G, id === 'rocker' ? 'crib' : id); }
  else if (id === 'stairs') store.toast(v.house.proofing.stair_gate ? 'The stair gate is closed.' : 'No gate on these stairs. A crawling baby can fall.', v.house.proofing.stair_gate ? 'good' : 'warn');
}
function isDescendant(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

// Auto-walk toward a point (open-plan house, so a straight line with collision sliding is enough).
function goTo(G, target) {
  const v = store.view; if (!v) return;
  let pt;
  if (target === 'baby') { const b = G.baby.worldPosition(); if (v.baby.state.held) return; pt = [b.x, 0, b.z]; }
  else pt = POINTS[target];
  if (!pt) return;
  const dest = new THREE.Vector3(pt[0], 0, pt[2]);
  const start = G.controls.pos.clone();
  const dir = dest.clone().sub(start); const len = dir.length(); if (len < 0.3) return;
  dir.normalize();
  const stop = dest.clone().addScaledVector(dir, -(target === 'baby' ? 1.0 : 0.9));
  G.controls.enabled = true;
  const walker = (dt) => {
    const d = stop.clone().sub(G.controls.pos); d.y = 0; const dl = d.length();
    if (dl < 0.12 || G.controls.joy || G.controls.keys.size) { G.R.onFrame.splice(G.R.onFrame.indexOf(walker), 1); G.controls.lookAt(target === 'baby' ? G.baby.headWorldPosition() : new THREE.Vector3(pt[0], 0.9, pt[2])); return; }
    d.normalize(); const step = d.clone().multiplyScalar(Math.min(dl, 2.4 * dt)); const next = G.controls.pos.clone().add(step); G.controls.resolve(next); G.controls.pos.copy(next);
    G.controls.vel.copy(d.multiplyScalar(2.4));
    const ty = Math.atan2(-d.x, -d.z); let dy = ty - G.controls.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); G.controls.yaw += dy * Math.min(1, dt * 6);
  };
  G.R.onFrame.push(walker);
}

// Execute an action: proximity check, animation, server call.
async function runAction(G, id, params = {}, opts = {}) {
  const v = store.view; if (!v || G.action) return;
  if (id.startsWith('ui:')) return uiAction(G, id.slice(3));
  const needsBaby = !['prepare', 'wash_bottles', 'collect_package', 'nurse_visit', 'thermostat', 'babysitter', 'return', 'doctor', 'leave', 'white_noise'].includes(id) && !opts.remote;
  if ((needsBaby || opts.near) && !(G.near.baby || v.baby.state.held)) { store.toast(`Walk over to ${v.baby.name} first.`, 'warn'); goTo(G, 'baby'); return; }
  if (id === 'prepare') { // local-only: pick up prepared food
    G.holding = params.item; G.holdingFood = params.food || 'formula';
    startAnim(G, `Preparing ${G.holdingFood.replace('_', ' ')}…`, opts, () => { G.arms.set('item', params.item); store.toast(`You're carrying ${G.holdingFood.replace('_', ' ')}. Take it to ${v.baby.name}.`, 'info'); });
    return;
  }
  if (opts.anim === 'none' && !opts.dur) { const r = await send(G, id, params); if (r && r.report) showReport(G, r.report); return; }
  startAnim(G, `${labelFor(id, params)}…`, opts, async () => {
    const r = await send(G, id, params);
    if (opts.consumes && r && r.ok) { G.holding = null; G.holdingFood = null; G.arms.set(store.view.baby.state.held ? 'hold' : 'none'); }
    if (r && r.report) showReport(G, r.report);
    if (r && r.detail) showObservation(r.detail);
  });
}

function labelFor(id, params) {
  const map = { feed: 'Feeding', hold: 'Picking up', put_down: 'Putting down', rock: 'Rocking', cuddle: 'Cuddling', burp: 'Burping', change_diaper: 'Changing diaper', bathe: 'Bathing', dress: 'Dressing', sing: 'Singing', play: 'Playing', read: 'Reading', tummy_time: 'Tummy time', put_to_sleep: 'Settling to sleep', pacifier: 'Pacifier', swaddle: 'Swaddling', check_temp: 'Taking temperature', medicine: 'Giving medicine', lesson: 'Teaching', potty: 'Potty time', wash_bottles: 'Washing bottles', nurse_visit: 'Nurse visit', collect_package: 'Bringing in delivery', vitamin_d: 'Vitamin D', yell: 'Yelling', scream: 'Screaming' };
  return map[id] || id; void params;
}

function startAnim(G, label, opts, done) {
  G.action = { t: 0, dur: opts.dur || 3, label, opts, done, look: opts.look || opts.anim === 'hold' || opts.anim === 'item' };
  if (opts.anim === 'hold') G.arms.set('hold'); else if (opts.anim === 'item') G.arms.set('item', opts.item);
  if (opts.item === 'bottle' || opts.item === 'spoon') G.baby.feeding = true;
  if (opts.bath && G.audio.ctx) G.audio.splash();
  if (opts.item === 'toy' && G.audio.ctx) G.audio.rattle();
  G.controls.enabled = opts.anim === 'none' && !opts.look;
}
async function finishAction(G) {
  const a = G.action; G.action = null; G.hud.progress(null); G.baby.feeding = false; G.controls.enabled = true;
  const held = store.view && store.view.baby.state.held;
  G.arms.set(held ? 'hold' : G.holding ? 'item' : 'none', G.holding || null);
  try { await a.done(); } catch (e) { store.toast(e.message, 'danger'); }
  const held2 = store.view && store.view.baby.state.held;
  G.arms.set(held2 ? 'hold' : G.holding ? 'item' : 'none', G.holding || null);
}
async function send(G, id, params) {
  const r = await G.socket.action(id, params);
  if (!r.ok) store.toast(r.message || 'Could not do that.', 'warn'); else if (r.message && !['Holding.', 'Talked.'].includes(r.message)) store.toast(r.message, 'good', 3200);
  return r;
}

function showReport(G, report) {
  const el = document.createElement('div'); el.className = 'modal';
  el.innerHTML = `<div class="card"><h2>📞 Telehealth visit</h2><div class="journal">${report.notes.map((n) => `<div class="e ${report.severity === 'ok' ? 'good' : report.severity}">${n}</div>`).join('')}</div>${report.advice.length ? `<h4 style="margin:10px 0 4px">Advice</h4><div class="journal">${report.advice.map((a) => `<div class="e">${a}</div>`).join('')}</div>` : ''}${report.rx.length ? `<p>Prescribed: ${report.rx.join(', ')} (available in Health).</p>` : ''}<button class="primary" style="width:100%;margin-top:10px">Thanks, doctor</button></div>`;
  overlay.appendChild(el); el.querySelector('button').onclick = () => el.remove();
  void G;
}

async function uiAction(G, what) {
  const v = store.view;
  if (what === 'play') {
    const toys = v.baby.ageToys.map((t) => ({ label: t.replace(/_/g, ' '), id: t }));
    const pick = await chooserModal(overlay, 'Play with…', toys.length ? toys : [{ label: 'No age-appropriate toys — buy some', id: null }]);
    if (pick && pick.id) runAction(G, 'play', { toy: pick.id }, { anim: 'item', item: pick.id.includes('book') ? 'book' : 'toy', dur: 8, look: true });
  } else if (what === 'play2') return choosePlayActivity(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'learn') return chooseLearn(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'allergen') return chooseAllergen(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'discipline') return chooseDiscipline(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'chores') return chooseChores(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'care') return chooseCare(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'word') return chooseWord(G, (id, p, o) => runAction(G, id, p, o));
  else if (what === 'contacts') G.phone.open('contacts');
  else if (what === 'choice') { const c = (v.pendingChoices || [])[0]; if (c) showChoice(G, c); }
  else if (what === 'lesson') G.phone.open('school');
  else if (what === 'wardrobe') G.phone.open('wardrobe');
  else if (what === 'medicine') G.phone.open('health');
  else if (what === 'thermostat') G.phone.open('home');
  else if (what === 'temper') {
    const pick = await chooserModal(overlay, 'Lose your temper?', [
      { label: '😠 Yell at the baby', id: 'yell', cls: 'danger', sub: 'trust −8, big stress' },
      { label: '🤬 Scream in their face', id: 'scream', cls: 'danger', sub: 'trust −15, terror' },
      { label: '🚪 Walk out and shut the door (30 min)', id: 'leave', cls: 'danger', sub: 'trust −10 and falling' },
    ], { text: `You're exhausted (energy ${Math.round(v.parent.energy)}, stress ${Math.round(v.parent.stress)}). Real parents feel this. What you do with it is the whole test. There is no undo.` });
    if (pick) { if (pick.id === 'leave') { runAction(G, 'leave', { minutes: 30 }, { anim: 'none', remote: true }); } else runAction(G, pick.id, {}, { anim: 'none', dur: 2, look: true }); }
  }
}

function onEvent(G, e) {
  const sev = e.sev || 'info';
  if (['doorbell'].includes(e.type)) { if (G.audio.ctx) G.audio.doorbell(); store.toast(e.text, 'good', 6000); return; }
  if (['cry_start'].includes(e.type)) { store.toast(e.text, 'warn', 3500); return; }
  if (['tick', 'cry_stop', 'woke', 'slept', 'feed', 'diaper', 'hold', 'rock', 'cuddle', 'sing', 'play', 'read', 'burp', 'tummy'].includes(e.type)) return; // quiet routine
  if (sev === 'danger' || e.type === 'milestone' || sev === 'warn' || e.type === 'nurse' || e.type === 'package' || e.type === 'recovered') {
    store.toast(e.text, sev === 'danger' ? 'danger' : e.type === 'milestone' || e.type === 'recovered' ? 'good' : sev, sev === 'danger' ? 8000 : 5000);
    if (G.audio.ctx) G.audio.notify(sev === 'danger' ? 'danger' : e.type === 'milestone' ? 'good' : 'info');
  }
}

function onView(G, v, prev) {
  if (G.alerts) G.alerts.update(v, store.lastEvents || []);
  if (!prev) return;
  if (v.status === 'dead' && prev.status !== 'dead') { G.audio.setCrying(false); deathModal(overlay, v, () => restart()); }
  if (v.status === 'won' && prev.status !== 'won') winModal(overlay, v, () => restart());
  const held = v.baby.state.held;
  if (held !== prev.baby.state.held && !G.action) G.arms.set(held ? 'hold' : G.holding ? 'item' : 'none', G.holding || null);
  G.hud.badge(v.house.doorPackages.length + (v.house.nurseHere ? 1 : 0) + (v.baby.schedule.vaccinesDue.filter((x) => x.overdue).length));
}

// ----- playdates -----
async function playdate(G, kind, arg) {
  try {
    if (kind === 'host') { const r = await api.playdateCreate(store.gameId); store.playdate = { code: r.code, host: true }; G.socket.send({ type: 'join_room', code: r.code }); store.toast(`Invite code ${r.code} — share it with a friend.`, 'good', 8000); }
    else if (kind === 'join') { if (!arg || arg.length < 4) return store.toast('Enter a 6-letter code.', 'warn'); const r = await api.playdateJoin(arg, store.gameId); store.playdate = { code: arg, host: false, guest: r.host }; G.socket.send({ type: 'join_room', code: arg }); spawnGuest(G, r.host); store.toast(`You're at ${r.host.name}'s house — well, they're at yours. Playdate started!`, 'good'); }
    else if (kind === 'end') { if (store.playdate) await api.playdateEnd(store.playdate.code); G.socket.send({ type: 'leave_room' }); store.playdate = null; removeGuest(G); }
    else if (kind === 'chat') { G.socket.send({ type: 'room_chat', text: arg }); }
    G.phone.render();
  } catch (e) { store.toast(e.message, 'danger'); }
}
function handlePlaydate(G, m) {
  if (m.event === 'joined') { const other = m.babies.find((b) => b.gameId !== store.gameId); if (other) { store.playdate = { ...(store.playdate || {}), guest: other }; spawnGuest(G, other); store.toast(`${other.name} arrived for the playdate!`, 'good'); } }
  else if (m.event === 'ended') { store.toast('The playdate ended.', 'info'); store.playdate = null; removeGuest(G); }
  else if (m.event === 'chat') { G.phone.roomChat.push({ from: m.from, text: m.text, mine: m.baby === store.view.baby.name }); store.toast(`${m.from}: ${m.text}`, 'info', 5000); }
  G.phone.render();
}
function spawnGuest(G, snap) {
  removeGuest(G);
  G.guest = new Baby(G.R.scene, null, { guest: true });
  G.guestView = { sim: { days: snap.days }, baby: { name: snap.name, sex: snap.sex, appearance: snap.appearance, needs: { health: 90 }, emo: {}, phys: { heightCm: snap.heightCm, tempC: 36.8, jaundice: 0 }, wear: { ...snap.wear, outfit: snap.wear.outfit || 'mint' }, state: { activity: 'awake', location: 'floor', position: snap.days > 200 ? 'sitting' : 'back', held: false, crying: false, cryIntensity: 0, mobile: false, hospitalized: false, pacifier: false, whiteNoise: false }, mood: snap.sick ? 'sick' : 'playing', milestones: { sits: snap.days > 200, walks: snap.days > 400 }, illness: snap.sick ? { severity: 40 } : null } };
  SPOTS.floor_guest = { pos: [0.6, 0.03, -1.4], rot: 0.9, kind: 'floor' };
  G.guestView.baby.state.location = 'floor_guest';
}
function removeGuest(G) { if (G.guest) { G.R.scene.remove(G.guest.root); G.guest = null; } }

// An interactive story choice: a real decision with a deadline, resolved on the server.
function showChoice(G, choice) {
  if (G.choiceOpen) return;
  G.choiceOpen = true;
  const el = document.createElement('div'); el.className = 'modal choice';
  const secsLeft = () => Math.max(0, Math.round((choice.deadline - store.view.sim.time) / 60));
  el.innerHTML = `<div class="card"><h2>${escapeText(choice.title)}</h2>
    ${choice.lead ? `<p style="color:var(--muted)">${escapeText(choice.lead)}</p>` : ''}
    <p style="color:var(--text)">${escapeText(choice.text)}</p>
    <div class="games-list">${choice.options.map((o, i) => `<button data-i="${i}">${escapeText(o.label)}${o.hint ? `<span class="tag">${escapeText(o.hint)}</span>` : ''}</button>`).join('')}</div>
    <p style="text-align:center;color:var(--muted);font-size:12px" id="ch-timer">${secsLeft()} baby-minutes to decide</p></div>`;
  overlay.appendChild(el);
  const timer = setInterval(() => { const t = el.querySelector('#ch-timer'); if (!t) return; const s = secsLeft(); t.textContent = s > 0 ? `${s} baby-minutes to decide` : 'Too slow — the moment is passing…'; if (s <= 0) close(); }, 700);
  const close = () => { clearInterval(timer); el.remove(); G.choiceOpen = false; };
  el.querySelectorAll('[data-i]').forEach((b) => {
    b.onclick = async () => {
      const opt = choice.options[Number(b.dataset.i)];
      close();
      const r = await G.socket.action('choice', { choiceId: choice.id, option: opt.id });
      if (r && r.message) store.toast(r.message, (r.outcome && r.outcome.sev === 'danger') ? 'danger' : (r.outcome && r.outcome.sev) || 'info', 7000);
    };
  });
}
function escapeText(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function tutorial(G) {
  const steps = [
    `Welcome home. ${store.view.baby.name} is asleep in the crib (to your right, by the window). Walk with the left thumb / WASD, look with the right thumb / mouse.`,
    'Newborns feed every 2–3 hours, day and night. When crying starts, check: hungry? wet? tired? needs a burp? lonely?',
    'Bottles are prepared at the kitchen counter (far left). Diapers and baths happen at the changing table. The phone (📱) is for everything remote: doctor, shop, school, friends.',
    'Time runs 24× while you play and keeps going (slower) while you are away. The baby remembers how you treat them.',
  ];
  let i = 0; const next = () => { if (i < steps.length) { store.toast(steps[i++], 'info', 9000); setTimeout(next, 9500); } };
  setTimeout(next, 1200); void G;
}

main().catch((e) => { console.error(e); status(`Error: ${e.message}`); $boot.classList.remove('out'); });
