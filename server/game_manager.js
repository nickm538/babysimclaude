// Authoritative game runtime: in-memory cache of games, real-time ticking for connected players,
// offline catch-up on load, persistence and event fan-out.
import { TIME, clamp } from '../shared/constants.js';
import { createGame, ensureGameShape } from './sim/state.js';
import { advance, collect, log } from './sim/engine.js';
import { makeRng } from './sim/rng.js';
import { parseIntent, applyWords, resolveCommand } from './ai/chatIntent.js';
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
    const game = ensureGameShape(await this.store.getGame(id));
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
      // One game throwing must never stop the others from ticking.
      try { await this.tickOne(id, entry, now); } catch (e) { console.error(`[tick] game ${id}:`, e.message); }
    }
  }

  async tickOne(id, entry, now) {
    const g = entry.game;
    if (entry.subscribers.size === 0) {
      // Only evict once the last write actually landed, or an unsaved game would vanish with it.
      if (now - entry.lastTouch > 5 * 60 * 1000) {
        await this.persist(entry, [], true);
        if (!entry.dirty) this.games.delete(id);
      }
      return;
    }
    if (g.status !== 'active') { g.lastTickAt = now; return; }
    const realDt = Math.min(30, (now - g.lastTickAt) / 1000);
    g.lastTickAt = now;
    const b = g.baby;
    let scale = g.settings.timeScale || TIME.ONLINE_SCALE_DEFAULT;
    if (g.settings.sleepBoost && b.state.activity === 'sleeping' && !b.state.cryingSince && b.state.hospitalizedUntil <= g.sim.time) scale *= TIME.SLEEP_BOOST;
    if (b.state.hospitalizedUntil > g.sim.time) scale *= 4;
    const events = advance(g, realDt * scale, { offline: false });
    this.broadcast(entry, events);
    const important = events.some((e) => e.sev === 'danger' || e.sev === 'good');
    await this.persist(entry, events, important || entry.dirty || now - entry.lastSave > 15000);
  }

  // Saving is the whole point of a game that runs in real time, so a failed write must not be
  // silently dropped, must not be recorded as a success, and must not take the other games down with
  // it. Saves for one game are serialised behind entry.saving so a slow write cannot interleave with
  // the next one.
  async persist(entry, events, force) {
    if (events.length) {
      // The event log is history, not state: losing a batch costs a line in the journal, not progress.
      try { await this.store.appendEvents(entry.game.id, events); } catch (e) { console.error('[events]', e.message); }
    }
    if (!force) return;
    entry.dirty = true;
    entry.saving = (entry.saving || Promise.resolve()).then(async () => {
      if (!entry.dirty) return;
      try {
        await this.store.saveGame(entry.game);
        entry.dirty = false;
        entry.lastSave = Date.now();
        if (entry.saveFails) {
          console.log(`[db] game ${entry.game.id} saved again after ${entry.saveFails} failure(s)`);
          entry.saveFails = 0;
          this.broadcast(entry, [], { save: 'ok' });
        }
      } catch (e) {
        entry.saveFails = (entry.saveFails || 0) + 1;
        console.error(`[db] save failed for game ${entry.game.id} (${entry.saveFails}):`, e.message);
        // Tell the player rather than letting them play on believing it is being written down.
        if (entry.saveFails === 1 || entry.saveFails % 10 === 0) this.broadcast(entry, [], { save: 'failing', attempts: entry.saveFails });
      }
    });
    await entry.saving;
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

  // Everything a typed message does to the world, in one authoritative place: the tone lands as the
  // existing `talk` action, the words themselves move trust/esteem/happiness, and a request the child
  // understands and is willing to do is executed as a real action.
  async chat(id, text, tone, effects, hint = null, hintWord = '') {
    const entry = this.games.get(id) || (await this.load(id), this.games.get(id));
    if (!entry) return { talk: { ok: false, message: 'Game not found' } };
    const g = entry.game;
    const rng = makeRng((g.sim.seed ^ (g.sim.steps * 2654435761) ^ (text.length * 40503)) >>> 0);
    let talk, words = [], outcome = null;
    const events = collect(() => {
      talk = applyAction(g, 'talk', { tone });
      const b = g.baby, n = b.needs, e = b.emo;
      if (effects) {
        n.affection = clamp(n.affection + effects.affection, 0, 100);
        n.stimulation = clamp(n.stimulation + effects.stimulation, 0, 100);
        e.stress = clamp(e.stress + effects.stress, 0, 100);
      }
      const parsed = parseIntent(text, hint, hintWord);
      words = applyWords(g, parsed, tone);
      if (words.includes('cruel')) {
        log(g, 'temper', `You told ${b.name} you hate ${b.sex === 'girl' ? 'her' : 'him'}. ${b.sex === 'girl' ? 'She' : 'He'} may not follow every word, but ${b.sex === 'girl' ? 'she' : 'he'} understands exactly what it means.`, 'danger');
        if (!b.state.cryingSince) { b.state.cryingSince = g.sim.time; b.state.cryCause = 'scared'; b.state.cryIntensity = 0.95; g.stats.cries++; }
        else b.state.cryIntensity = 1;
        b.state.lastAnsweredCryAt = 0;
      } else if (words.includes('praise')) {
        log(g, 'coach', `You told ${b.name} you love ${b.sex === 'girl' ? 'her' : 'him'}. ${b.sex === 'girl' ? 'She' : 'He'} lights up.`, 'good');
      }
      if (parsed.command) {
        outcome = resolveCommand(g, parsed, rng, applyAction);
        if (outcome) log(g, outcome.kind === 'obeyed' ? 'chore' : 'observe', outcome.text, outcome.sev || 'info');
      }
      if (g.status === 'active' && g.baby.needs.health <= 0) advance(g, 1);
    });
    this.broadcast(entry, events);
    await this.persist(entry, events, true);
    return { talk, words, outcome };
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

  // `extra` rides along on the state frame; it currently carries save health so the client can tell
  // the player when their progress has stopped being written.
  broadcast(entry, events, extra) {
    if (!entry || entry.subscribers.size === 0) return;
    const msg = JSON.stringify({ type: 'state', view: gameView(entry.game), events, ...(extra || {}) });
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
