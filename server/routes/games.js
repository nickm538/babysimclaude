import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { babyReply, llmAvailable } from '../ai/babyChat.js';
import { applyAction } from '../sim/actions.js';
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

  r.post('/:id/chat', async (req, res) => {
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
    const result = await gm.act(g.id, 'talk', { tone: out.tone });
    const b = g.baby;
    b.needs.affection = clampN(b.needs.affection + out.effects.affection);
    b.needs.stimulation = clampN(b.needs.stimulation + out.effects.stimulation);
    b.emo.stress = clampN(b.emo.stress + out.effects.stress);
    res.json({ reply: out.reply, tone: out.tone, source: out.source, action: result, game: gm.view(g.id) });
  });

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
void applyAction;
