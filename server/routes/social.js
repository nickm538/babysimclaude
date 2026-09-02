// Social contacts API: calls, video calls, photos, invitations, visits, babysitting and the playgroup.
// Everything routes through the simulation's applySocialAction so the server stays authoritative.
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { applySocialAction } from '../sim/social.js';
import { rateLimit } from '../ratelimit.js';

const ACTIONS = new Set(['call', 'video', 'photo', 'invite', 'babysit', 'respond', 'playgroup']);

export function socialRoutes(store, gm) {
  const r = Router();
  r.use(authMiddleware(store));
  const limit = rateLimit({ windowMs: 60000, max: 60, key: (req) => req.user.id });

  r.post('/:gameId/:action', limit, async (req, res) => {
    const action = String(req.params.action);
    if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unknown action' });
    const g = await gm.load(String(req.params.gameId));
    if (!g || g.userId !== req.user.id) return res.status(404).json({ error: 'Game not found' });
    if (g.status !== 'active') return res.status(400).json({ error: 'This game is over' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const params = {
      contactId: typeof body.contactId === 'string' ? body.contactId.slice(0, 64) : undefined,
      invitationId: typeof body.invitationId === 'string' ? body.invitationId.slice(0, 64) : undefined,
      hours: Number.isFinite(Number(body.hours)) ? Math.max(1, Math.min(24, Number(body.hours))) : undefined,
      accept: body.accept !== false,
      enrolled: body.enrolled !== false,
    };

    const before = g.journal.length;
    let result;
    try { result = applySocialAction(g, action, params); } catch (e) { console.error('[social]', e); return res.status(500).json({ error: 'Server error' }); }

    const entry = gm.games.get(g.id);
    const events = g.journal.slice(before);
    if (entry) { gm.broadcast(entry, events); await gm.persist(entry, events, true); }
    res.json({ ...result, game: gm.view(g.id) });
  });

  return r;
}
