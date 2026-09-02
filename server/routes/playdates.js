import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { ageDays, log } from '../sim/engine.js';
import { gameView } from '../sim/view.js';

function code6() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

export function playdateRoutes(store, gm, hub) {
  const r = Router();
  r.use(authMiddleware(store));

  r.post('/', async (req, res) => {
    const g = await gm.load(String(req.body?.gameId || ''));
    if (!g || g.userId !== req.user.id) return res.status(404).json({ error: 'Game not found' });
    if (g.status !== 'active') return res.status(400).json({ error: 'Game is over' });
    const code = code6();
    await store.createPlaydate(code, g.id);
    hub.rooms.set(code, { code, host: g.id, guest: null, startedAt: Date.now() });
    log(g, 'playdate', `You invited a friend over. Share code ${code}.`, 'info');
    res.json({ code });
  });

  r.post('/:code/join', async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const pd = await store.getPlaydate(code);
    if (!pd || pd.status !== 'open') return res.status(404).json({ error: 'No open playdate with that code' });
    const g = await gm.load(String(req.body?.gameId || ''));
    if (!g || g.userId !== req.user.id) return res.status(404).json({ error: 'Game not found' });
    if (g.id === pd.host_game_id) return res.status(400).json({ error: 'That is your own invite' });
    const host = await gm.load(pd.host_game_id);
    if (!host) return res.status(404).json({ error: 'Host game missing' });
    await store.updatePlaydate(code, { guest_game_id: g.id, status: 'active' });
    const room = hub.rooms.get(code) || { code, host: host.id, startedAt: Date.now() };
    room.guest = g.id; hub.rooms.set(code, room);
    startPlaydate(host, g); startPlaydate(g, host);
    hub.roomBroadcast(code, { type: 'playdate', event: 'joined', code, babies: [babySnapshot(host), babySnapshot(g)] });
    res.json({ ok: true, code, host: babySnapshot(host), guest: babySnapshot(g) });
  });

  r.get('/:code', async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const room = hub.rooms.get(code);
    if (!room) return res.status(404).json({ error: 'Not active' });
    const host = await gm.load(room.host), guest = room.guest ? await gm.load(room.guest) : null;
    res.json({ code, host: host && babySnapshot(host), guest: guest && babySnapshot(guest), minutes: (Date.now() - room.startedAt) / 60000 });
  });

  r.post('/:code/end', async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const room = hub.rooms.get(code);
    await store.updatePlaydate(code, { status: 'ended', ended_at: new Date().toISOString() });
    if (room) {
      const mins = (Date.now() - room.startedAt) / 60000;
      for (const id of [room.host, room.guest]) { if (!id) continue; const g = await gm.load(id); if (g) endPlaydate(g, mins); }
      hub.roomBroadcast(code, { type: 'playdate', event: 'ended', code });
      hub.rooms.delete(code);
    }
    res.json({ ok: true });
  });
  return r;
}

export function babySnapshot(g) {
  const v = gameView(g);
  return { gameId: g.id, name: v.baby.name, sex: v.baby.sex, appearance: v.baby.appearance, days: v.sim.days, mood: v.baby.mood, activity: v.baby.state.activity, weightKg: v.baby.phys.weightKg, heightCm: v.baby.phys.heightCm, sick: !!(g.baby.illness && g.baby.illness.severity > 25 && ILL_CONTAGIOUS(g.baby.illness.id)), wear: v.baby.wear, dev: v.baby.dev, milestones: Object.keys(v.baby.milestones).length };
}
import { ILLNESSES } from '../../shared/constants.js';
const ILL_CONTAGIOUS = (id) => !!(ILLNESSES[id] && ILLNESSES[id].contagious);

function startPlaydate(g, other) {
  const b = g.baby;
  b.state.playdateWith = other.baby.name;
  b.counters.playdates++; g.stats.playdates++;
  b.state.lastInteractionAt = g.sim.time;
  if (other.baby.illness && ILL_CONTAGIOUS(other.baby.illness.id) && other.baby.illness.severity > 25) { b.state.exposureUntil = g.sim.time + 48 * 3600; log(g, 'playdate', `${other.baby.name} arrived sniffling — ${b.name} may catch something.`, 'warn'); }
  log(g, 'playdate', `${other.baby.name} (${Math.round(ageDays(other))} days old) came over to play with ${b.name}!`, 'good');
  b.needs.stimulation = Math.min(100, b.needs.stimulation + 25);
  b.dev.social = Math.min(100, b.dev.social + 0.05);
  b.dev.emotional = Math.min(100, b.dev.emotional + 0.02);
}
function endPlaydate(g, mins) {
  const b = g.baby;
  b.state.playdateWith = null;
  const bonus = Math.min(0.2, mins * 0.004);
  b.dev.social = Math.min(100, b.dev.social + bonus); b.dev.language = Math.min(100, b.dev.language + bonus * 0.4);
  b.emo.happiness = Math.min(100, b.emo.happiness + 3);
  log(g, 'playdate', `The playdate ended after ${Math.round(mins)} minutes. ${b.name} is ${mins > 20 ? 'worn out and happy' : 'a little disappointed it was short'}.`, 'good');
}
