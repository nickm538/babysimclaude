// Quick dynamics check: a "good parent" script vs neglect over several sim days.
import { createGame } from '../server/sim/state.js';
import { advance } from '../server/sim/engine.js';
import { applyAction } from '../server/sim/actions.js';
import { makeRng } from '../server/sim/rng.js';

function run(policy, days, label) {
  const g = createGame({ userId: 'u', babyName: 'Test', sex: 'boy' });
  const rng = makeRng(42);
  const step = 300;
  for (let t = 0; t < days * 86400; t += step) {
    advance(g, step);
    if (g.status !== 'active') break;
    policy(g, rng);
  }
  const b = g.baby;
  console.log(label, g.status, 'age', (g.sim.time / 86400).toFixed(1), 'needs', JSON.stringify(Object.fromEntries(Object.entries(b.needs).map(([k, v]) => [k, Math.round(v)]))), 'emo', JSON.stringify(Object.fromEntries(Object.entries(b.emo).map(([k, v]) => [k, Math.round(v)]))), 'dev', b.dev.motor.toFixed(2), 'w', b.phys.weightKg, 'ill', b.illness && b.illness.id, 'cries', g.stats.cries, 'unansweredMin', Math.round(b.history.unansweredCryMin), 'attach', b.attachment, 'ms', Object.keys(b.milestones).length);
  return g;
}

const good = (g, rng) => {
  const b = g.baby, s = b.state, n = b.needs, inv = g.inventory;
  if (inv.formula < 6 && !g.orders.some((o) => o.status === 'shipping')) applyAction(g, 'collect_package', {}), (await0(g));
  for (const o of g.orders) if (o.status === 'delivered') applyAction(g, 'collect_package', { orderId: o.id });
  if (inv.bottlesClean === 0) applyAction(g, 'wash_bottles', {});
  if (s.cryingSince || n.fullness < 40 || n.diaper < 40) {
    if (n.fullness < 45) applyAction(g, 'feed', { type: 'formula' }, rng);
    if (s.needsBurp) applyAction(g, 'burp', {}, rng);
    if (n.diaper < 60) applyAction(g, 'change_diaper', { cream: b.phys.rash > 20 }, rng);
    if (s.cryingSince) { if (!s.held) applyAction(g, 'hold', {}, rng); applyAction(g, 'rock', {}, rng); }
  }
  if (s.activity !== 'sleeping' && n.rest < 30 && !s.cryingSince) applyAction(g, 'put_to_sleep', { location: 'crib', position: 'back' }, rng);
  if (s.activity !== 'sleeping' && n.stimulation < 55 && rng.chance(0.3)) applyAction(g, 'play', { toy: 'mobile' }, rng);
  if (s.activity !== 'sleeping' && rng.chance(0.1)) applyAction(g, 'cuddle', {}, rng);
  if (s.activity !== 'sleeping' && rng.chance(0.08)) applyAction(g, 'read', {}, rng);
  if (s.held && s.activity === 'sleeping') applyAction(g, 'put_down', { location: 'crib', position: 'back' }, rng);
  if (n.clean < 50) applyAction(g, 'bathe', { temp: 'warm' }, rng);
};
function await0(g) { const { placeOrder } = ordersMod; placeOrder(g, [{ id: 'formula' }, { id: 'diapers', size: 'N' }, { id: 'wipes' }]); }
import * as ordersMod from '../server/sim/actions.js';

run(good, 5, 'GOOD  ');
run(() => {}, 3, 'NEGLECT');
run((g, rng) => { if (g.sim.time % 7200 < 300) { applyAction(g, 'feed', { type: 'formula' }, rng); if (g.inventory.bottlesClean === 0) applyAction(g, 'wash_bottles', {}); } }, 5, 'FEEDONLY');
