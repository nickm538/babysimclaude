import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { babyReply, llmAvailable } from '../ai/babyChat.js';
import { applyAction } from '../sim/actions.js';
import { advance, collect } from '../sim/engine.js';
import { rateLimit } from '../ratelimit.js';
import { ensureSocial } from '../sim/social.js';
import { SHOP, TOYS, LESSONS, BABYPROOFING, CLOTHING_SIZES, DIAPER_SIZES, MILESTONES, CHECKUPS, VACCINES, ILLNESSES, TIME } from '../../shared/constants.js';

export function gameRoutes(store, gm) {
  const r = Router();
  r.use(authMiddleware(store));

  r.get('/catalog', (req, res) => res.json({ shop: SHOP, toys: TOYS, lessons: LESSONS, proofing: BABYPROOFING, clothingSizes: CLOTHING_SIZES, diaperSizes: DIAPER_SIZES, milestones: MILESTONES, checkups: CHECKUPS, vaccines: VACCINES, illnesses: ILLNESSES, time: TIME, llm: llmAvailable() }));

  r.get('/', async (req, res) => res.json({ games: await store.listGames(req.user.id) }));

  r.post('/', async (req, res) => {
    const { babyName, sex, parentName, appearance } = req.body || {};
    const name = String(babyName || '').trim().slice(0, 24) || undefined;
    const g = await gm.create(req.user.id, { babyName: name, sex: sex === 'girl' ? 'girl' : 'boy', parentName: String(parentName || 'You').slice(0, 24), appearance: sanitizeAppearance(appearance) });
    res.json({ game: gm.view(g.id) });
  });

  async function own(req, res) {
    const g = await gm.load(req.params.id);
    if (!g || g.userId !== req.user.id) { res.status(404).json({ error: 'Game not found' }); return null; }
    return g;
  }

  r.get('/:id', async (req, res) => { const g = await own(req, res); if (!g) return; const view = gm.view(g.id); res.json({ game: view, awaySummary: g.awaySummary || null, llm: llmAvailable() }); g.awaySummary = null; });

  r.post('/:id/actions', async (req, res) => {
    const g = await own(req, res); if (!g) return;
    const { id, params } = req.body || {};
    if (typeof id !== 'string') return res.status(400).json({ error: 'Missing action id' });
    const result = await gm.act(g.id, id, params && typeof params === 'object' ? params : {});
    res.json({ ...result, game: gm.view(g.id) });
  });

  r.post('/:id/orders', async (req, res) => {
    const g = await own(req, res); if (!g) return;
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    const result = await gm.order(g.id, items);
    res.json({ ...result, game: gm.view(g.id) });
  });

  r.post('/:id/settings', async (req, res) => {
    const g = await own(req, res); if (!g) return;
    res.json({ settings: await gm.updateSettings(g.id, req.body || {}) });
  });

  r.get('/:id/events', async (req, res) => {
    const g = await own(req, res); if (!g) return;
    res.json({ events: await store.listEvents(g.id, Math.min(500, Number(req.query.limit) || 200)) });
  });

  r.get('/:id/chat', async (req, res) => { const g = await own(req, res); if (!g) return; res.json({ messages: await store.listChat(g.id, 60) }); });

  const chatLimit = rateLimit({ windowMs: 60000, max: 20, key: (req) => req.user.id });
  r.post('/:id/chat', chatLimit, async (req, res) => {
    const g = await own(req, res); if (!g) return;
    const text = String(req.body?.text || '').trim().slice(0, 400);
    if (!text) return res.status(400).json({ error: 'Say something' });
    if (g.status !== 'active') return res.status(400).json({ error: 'This game is over' });
    if (g.parent.awayUntil > g.sim.time) return res.status(400).json({ error: 'You left the room — come back first.' });
    const history = await store.listChat(g.id, 8);
    const out = await babyReply(g, text, history);
    const t = g.sim.time;
    await store.appendChat(g.id, { role: 'parent', content: text, tone: out.tone, t });
    await store.appendChat(g.id, { role: 'baby', content: out.reply, tone: null, t });
    g.chat.push({ role: 'parent', content: text, tone: out.tone, t }, { role: 'baby', content: out.reply, t });
    if (g.chat.length > 40) g.chat.splice(0, g.chat.length - 40);

    // What was said lands on the child, and if it was a request, the child may actually do it. Both
    // run through the manager so the change is authoritative, journalled, broadcast and saved like
    // any other action — talking is not a special case that bypasses the simulation.
    const said = await gm.chat(g.id, text, out.tone, out.effects, out.request || null, out.word || '');
    res.json({
      reply: out.reply, tone: out.tone, source: out.source,
      action: said.talk, words: said.words, outcome: said.outcome,
      game: gm.view(g.id),
    });
  });

  // Debug/testing only: jump the baby forward in time (CRADLE_DEBUG=1). Runs the normal simulation.
  if (process.env.CRADLE_DEBUG === '1') {
    // Put a visitor in the living room right now, so the NPC rendering path can be exercised without
    // waiting for the social layer to schedule a visit. Debug builds only.
    r.post('/:id/debug/visitor', async (req, res) => {
      const g = await own(req, res); if (!g) return;
      const s = ensureSocial(g);
      const c = s.contacts[Math.max(0, Math.min(s.contacts.length - 1, Number(req.body?.index) || 0))];
      if (!c) return res.status(400).json({ error: 'No contacts' });
      g.house.visitor = {
        contactId: c.id, name: c.name, relation: c.relation,
        relationLabel: c.relation, personality: c.personality,
        since: g.sim.time, until: g.sim.time + 3 * 3600,
        activity: String(req.body?.activity || 'holding the baby').slice(0, 40),
      };
      const entry = gm.games.get(g.id); await gm.persist(entry, [], true); gm.broadcast(entry, []);
      res.json({ ok: true, visitor: g.house.visitor, game: gm.view(g.id) });
    });

    r.post('/:id/debug/advance', async (req, res) => {
      const g = await own(req, res); if (!g) return;
      const days = Math.max(0, Math.min(2000, Number(req.body?.days) || 0));
      const care = req.body?.care !== false;
      const events = [];
      const run = (fn) => events.push(...collect(fn));
      // day by day, with a babysitter, stocked supplies and basic health upkeep so the baby reaches the target age alive
      for (let d = 0; d < days && g.status === 'active'; d++) {
        if (care) {
          const inv = g.inventory; g.parent.babysitterUntil = g.sim.time + 2 * 86400;
          Object.assign(inv, { formula: 99, bottles: 6, bottlesClean: 6, wipes: 999, purees: 99, toddler_meals: 99, whole_milk: 99, snacks: 99 });
          inv.diapers[g.baby.wear.neededDiaper || 'N'] = 99;
          if (g.baby.illness) g.baby.illness = null;
          g.baby.needs.health = Math.max(g.baby.needs.health, 85); g.baby.needs.stimulation = Math.max(g.baby.needs.stimulation, 60); g.baby.needs.affection = Math.max(g.baby.needs.affection, 60);
          g.baby.state.lastSolidsAt = g.sim.time;
        }
        run(() => advance(g, 86400, { offline: false }));
      }
      if (care && g.status === 'active') { g.parent.babysitterUntil = 0; const sz = g.baby.wear.neededSize; g.inventory.clothes[sz] = (g.inventory.clothes[sz] || 0) + 3; run(() => applyAction(g, 'dress', { size: sz, outfit: g.baby.wear.outfit })); }
      const entry = gm.games.get(g.id); await gm.persist(entry, events, true); gm.broadcast(entry, []);
      res.json({ ok: true, game: gm.view(g.id) });
    });
  }
  return r;
}
const clampN = (v) => Math.max(0, Math.min(100, v));

function sanitizeAppearance(a) {
  if (!a || typeof a !== 'object') return undefined;
  const out = {};
  for (const k of ['skinTone', 'hairColor', 'eyeColor']) if (typeof a[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(a[k])) out[k] = a[k];
  if (typeof a.hairAmount === 'number') out.hairAmount = Math.max(0, Math.min(1, a.hairAmount));
  return out;
}
