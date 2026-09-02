// Authoritative game runtime: in-memory cache of games, real-time ticking for connected players,
// offline catch-up on load, persistence and event fan-out.
import { TIME } from '../shared/constants.js';
import { createGame } from './sim/state.js';
import { advance, collect, log } from './sim/engine.js';
import { applyAction, placeOrder } from './sim/actions.js';
import { gameView } from './sim/view.js';
import { writeChapterNow, ensureStory } from './sim/story.js';

export class GameManager {
  constructor(store) {
    this.store = store;
    this.games = new Map(); // id -> { game, subscribers:Set<ws>, lastSave, lastTouch }
    this.timer = setInterval(() => this.tick().catch((e) => console.error('[tick]', e)), TIME.SERVER_TICK_MS);
  }

  async create(userId, opts) {
    const game = createGame({ userId, ...opts });
    ensureStory(game);
    log(game, 'home', `You brought ${game.baby.name} home. ${game.baby.sex === 'girl' ? 'She' : 'He'} is asleep in the crib. Everything starts now.`, 'good');
    await this.store.saveGame(game);
    this.games.set(game.id, { game, subscribers: new Set(), lastSave: Date.now(), lastTouch: Date.now() });
    return game;
  }

  async load(id) {
    let entry = this.games.get(id);
    if (entry) { entry.lastTouch = Date.now(); return entry.game; }
    const game = await this.store.getGame(id);
    if (!game) return null;
    entry = { game, subscribers: new Set(), lastSave: Date.now(), lastTouch: Date.now() };
    this.games.set(id, entry);
    await this.catchUp(entry);
    return game;
  }

  // Simulate the time the player was away (real time * OFFLINE_SCALE).
  //
  // The first OFFLINE_CAP of it runs with nobody in the house: that is the window where a baby left
  // alone roams, gets into things and can die. A longer absence is not thrown away — the rest runs
  // with a stand-in carer who feeds and changes from your supplies (and runs out if you left none),
  // but gives none of the affection, so the arc keeps building and coming home still costs you.
  async catchUp(entry) {
    const g = entry.game;
    const now = Date.now();
    const realElapsed = Math.max(0, now - (g.lastTickAt || now)) / 1000;
    const wanted = realElapsed * TIME.OFFLINE_SCALE;
    const alone = Math.min(wanted, TIME.OFFLINE_CAP);
    const covered = Math.min(Math.max(0, wanted - alone), TIME.OFFLINE_CARE_CAP);
    g.lastTickAt = now;
    if (g.status !== 'active' || alone < 30) { await this.store.saveGame(g); return []; }
    const before = g.sim.time;
    let carerName = null;
    const events = collect(() => {
      advance(g, alone, { offline: true });
      if (covered >= 30 && g.status === 'active') {
        const carer = pickCarer(g);
        carerName = carer;
        log(g, 'sitter', `You were gone long enough that ${carer} stepped in to keep ${g.baby.name} fed and dry.`, 'warn');
        const wasSitting = g.parent.babysitterUntil;
        g.parent.babysitterUntil = g.sim.time + covered;
        advance(g, covered, { offline: true });
        g.parent.babysitterUntil = Math.max(0, Math.min(wasSitting, g.sim.time));
      }
    });
    const hours = (g.sim.time - before) / 3600;
    const span = hours >= 48 ? `${(hours / 24).toFixed(1)} days` : hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.round(hours * 60)} minutes`;
    log(g, 'return_home', `You were away for ${span} of ${g.baby.name}'s life.`, 'info');
    const chapter = writeChapterNow(g, 'away', 0.25);
    g.awaySummary = summarizeAway(g, events, hours);
    if (carerName) g.awaySummary.carer = carerName;
    if (chapter) { g.awaySummary.chapter = chapter.summary; g.awaySummary.chapterTitle = `Chapter ${chapter.index}: ${chapter.title}`; }
    await this.persist(entry, events, true);
    return events;
  }

  async tick() {
    const now = Date.now();
    for (const [id, entry] of this.games) {
      const g = entry.game;
      if (entry.subscribers.size === 0) {
        if (now - entry.lastTouch > 5 * 60 * 1000) { await this.persist(entry, [], true); this.games.delete(id); }
        continue;
      }
      if (g.status !== 'active') { g.lastTickAt = now; continue; }
      const realDt = Math.min(30, (now - g.lastTickAt) / 1000);
      g.lastTickAt = now;
      const b = g.baby;
      let scale = g.settings.timeScale || TIME.ONLINE_SCALE_DEFAULT;
      if (g.settings.sleepBoost && b.state.activity === 'sleeping' && !b.state.cryingSince && b.state.hospitalizedUntil <= g.sim.time) scale *= TIME.SLEEP_BOOST;
      if (b.state.hospitalizedUntil > g.sim.time) scale *= 4;
      const events = advance(g, realDt * scale, { offline: false });
      this.broadcast(entry, events);
      const important = events.some((e) => e.sev === 'danger' || e.sev === 'good');
      await this.persist(entry, events, important || now - entry.lastSave > 15000);
    }
  }

  async persist(entry, events, force) {
    if (events.length) { try { await this.store.appendEvents(entry.game.id, events); } catch (e) { console.error('[events]', e.message); } }
    if (force) { entry.lastSave = Date.now(); await this.store.saveGame(entry.game); }
  }

  async act(id, actionId, params) {
    const entry = this.games.get(id) || (await this.load(id), this.games.get(id));
    if (!entry) return { ok: false, message: 'Game not found' };
    const g = entry.game;
    let result;
    const events = collect(() => { result = applyAction(g, actionId, params); });
    // an action might end the game (e.g. sids roll) — run one zero-length check
    if (g.status === 'active' && g.baby.needs.health <= 0) advance(g, 1);
    this.broadcast(entry, events);
    await this.persist(entry, events, true);
    return result;
  }

  async order(id, items) {
    const entry = this.games.get(id) || (await this.load(id), this.games.get(id));
    if (!entry) return { ok: false, message: 'Game not found' };
    let r;
    const events = collect(() => { r = placeOrder(entry.game, items); });
    this.broadcast(entry, events);
    await this.persist(entry, events, true);
    return r;
  }

  async updateSettings(id, patch) {
    const g = await this.load(id); if (!g) return null;
    if (patch.timeScale && TIME.ONLINE_SCALES.includes(Number(patch.timeScale))) g.settings.timeScale = Number(patch.timeScale);
    if (typeof patch.sleepBoost === 'boolean') g.settings.sleepBoost = patch.sleepBoost;
    if (typeof patch.sound === 'boolean') g.settings.sound = patch.sound;
    const entry = this.games.get(id); await this.persist(entry, [], true); this.broadcast(entry, []);
    return g.settings;
  }

  subscribe(id, ws) { const e = this.games.get(id); if (e) { e.subscribers.add(ws); e.lastTouch = Date.now(); } }
  unsubscribe(id, ws) { const e = this.games.get(id); if (e) { e.subscribers.delete(ws); e.lastTouch = Date.now(); } }

  view(id) { const e = this.games.get(id); return e ? gameView(e.game) : null; }

  broadcast(entry, events) {
    if (!entry || entry.subscribers.size === 0) return;
    const msg = JSON.stringify({ type: 'state', view: gameView(entry.game), events });
    for (const ws of entry.subscribers) { if (ws.readyState === 1) ws.send(msg); }
  }

  async shutdown() {
    clearInterval(this.timer);
    for (const entry of this.games.values()) await this.persist(entry, [], true);
  }
}

// Who covered a long absence. Uses a real contact when the social layer has one, so the name in the
// journal is someone the player knows rather than an anonymous agency sitter.
function pickCarer(g) {
  const list = (g.social && Array.isArray(g.social.contacts)) ? g.social.contacts : [];
  const best = list
    .filter((c) => c && c.skills && c.skills.babysitting >= 0.3 && (c.relationship || 0) >= 35)
    .sort((a, b) => b.relationship * b.skills.babysitting - a.relationship * a.skills.babysitting)[0];
  return best ? best.name : 'a stand-in sitter';
}

function summarizeAway(g, events, hours) {
  const b = g.baby;
  const danger = events.filter((e) => e.sev === 'danger').map((e) => e.text);
  const notable = events.filter((e) => ['roam', 'milestone', 'illness', 'injury', 'hazard', 'doorbell', 'poop', 'cry_long', 'slept', 'woke', 'sitter'].includes(e.type)).slice(-8).map((e) => e.text);
  let now;
  if (g.status === 'dead') now = g.death.text;
  else if (b.state.activity === 'sleeping') now = `${b.name} is asleep in the ${b.state.location.replace('_', ' ')}.`;
  else if (b.state.cryingSince) now = `${b.name} is crying (${b.state.cryCause}) — for ${Math.round((g.sim.time - b.state.cryingSince) / 60)} minutes.`;
  else if (b.state.selfPlayUntil > g.sim.time) now = `${b.name} is playing with toys on the ${b.state.location.replace('_', ' ')}.`;
  else now = `${b.name} is awake on the ${b.state.location.replace('_', ' ')}.`;
  return { hours: +hours.toFixed(1), now, danger, notable, at: Date.now() };
}
