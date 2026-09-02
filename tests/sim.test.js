import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../server/sim/state.js';
import { advance, ageDays } from '../server/sim/engine.js';
import { applyAction, placeOrder } from '../server/sim/actions.js';
import { gameView } from '../server/sim/view.js';
import { makeRng } from '../server/sim/rng.js';
import { classifyTone } from '../server/ai/babyChat.js';
import { DAY, HOUR } from '../shared/constants.js';

const rng = () => makeRng(7);

test('new game starts with a sleeping newborn and sane needs', () => {
  const g = createGame({ userId: 'u', babyName: 'Zoe', sex: 'girl' });
  assert.equal(g.status, 'active');
  assert.equal(g.baby.state.activity, 'sleeping');
  for (const v of Object.values(g.baby.needs)) assert.ok(v >= 0 && v <= 100);
  assert.ok(g.baby.phys.weightKg > 2.5 && g.baby.phys.weightKg < 4.5);
});

test('needs decay over time and hunger causes crying', () => {
  const g = createGame({ userId: 'u' });
  advance(g, 6 * HOUR);
  assert.ok(g.baby.needs.fullness < 40, 'fullness should have dropped');
  assert.ok(g.stats.cries >= 1, 'baby should have cried');
});

test('feeding restores fullness and consumes formula + a clean bottle', () => {
  const g = createGame({ userId: 'u' });
  advance(g, 4 * HOUR);
  const before = g.inventory.formula;
  const r = applyAction(g, 'feed', { type: 'formula' }, rng());
  assert.ok(r.ok, r.message);
  assert.equal(g.inventory.formula, before - 1);
  assert.equal(g.inventory.bottlesClean, 3);
  assert.ok(g.baby.needs.fullness > 60);
});

test('solids before 4 months are rejected with consequences', () => {
  const g = createGame({ userId: 'u' });
  g.inventory.purees = 3;
  advance(g, 2 * HOUR);
  const comfort = g.baby.needs.comfort;
  const r = applyAction(g, 'feed', { type: 'puree' }, rng());
  assert.ok(r.ok);
  assert.ok(g.baby.needs.comfort < comfort);
  assert.ok(g.journal.some((e) => e.sev === 'warn' || e.sev === 'danger'));
});

test('yelling drops trust and happiness sharply', () => {
  const g = createGame({ userId: 'u' });
  const t = g.baby.emo.trust, h = g.baby.emo.happiness;
  applyAction(g, 'yell', {}, rng());
  assert.ok(g.baby.emo.trust <= t - 7);
  assert.ok(g.baby.emo.happiness <= h - 10);
  assert.ok(g.baby.state.cryingSince != null);
});

test('total neglect eventually kills the baby but takes more than a day', () => {
  const g = createGame({ userId: 'u' });
  advance(g, 1 * DAY);
  assert.equal(g.status, 'active', 'should survive a single day');
  advance(g, 6 * DAY);
  assert.equal(g.status, 'dead');
  assert.ok(g.death && g.death.text.length > 10);
});

function careLoop(g, seconds) {
  const r = rng();
  for (let t = 0; t < seconds; t += 300) {
    advance(g, 300);
    const b = g.baby, n = b.needs, s = b.state;
    for (const o of g.orders) if (o.status === 'delivered') applyAction(g, 'collect_package', { orderId: o.id }, r);
    if (g.inventory.formula < 6 && !g.orders.some((o) => o.status === 'shipping')) placeOrder(g, [{ id: 'formula' }, { id: 'diapers', size: 'N' }]);
    if (g.inventory.bottlesClean === 0) applyAction(g, 'wash_bottles', {}, r);
    if (n.fullness < 45) applyAction(g, 'feed', { type: 'formula' }, r);
    if (s.needsBurp) applyAction(g, 'burp', {}, r);
    if (n.diaper < 55) applyAction(g, 'change_diaper', {}, r);
    if (s.cryingSince) { if (!s.held) applyAction(g, 'hold', {}, r); applyAction(g, 'rock', {}, r); }
    if (s.activity !== 'sleeping' && n.rest < 30 && !s.cryingSince) applyAction(g, 'put_to_sleep', { location: 'crib', position: 'back' }, r);
    if (s.held && s.activity === 'sleeping') applyAction(g, 'put_down', { location: 'crib', position: 'back' }, r);
    if (s.activity !== 'sleeping' && n.stimulation < 50) applyAction(g, 'play', { toy: 'mobile' }, r);
    if (n.clean < 50) applyAction(g, 'bathe', { temp: 'warm' }, r);
  }
}

test('attentive care keeps the baby healthy for a week and builds trust', () => {
  const g = createGame({ userId: 'u' });
  const w0 = g.baby.phys.weightKg;
  careLoop(g, 7 * DAY);
  assert.equal(g.status, 'active');
  assert.ok(g.baby.needs.health > 80, `health ${g.baby.needs.health}`);
  assert.ok(g.baby.emo.trust > 60, `trust ${g.baby.emo.trust}`);
  assert.ok(g.baby.phys.weightKg >= w0 - 0.05, `weight ${g.baby.phys.weightKg} vs ${w0}`);
});

test('orders arrive and can be collected into inventory', () => {
  const g = createGame({ userId: 'u' });
  const r = placeOrder(g, [{ id: 'diapers', size: '1' }, { id: 'clothes', size: '0-3M' }, { id: 'toy', size: 'rattle' }, { id: 'babyproof', size: 'stair_gate' }]);
  assert.ok(r.ok);
  advance(g, 7 * HOUR);
  assert.equal(g.orders[0].status, 'delivered');
  const c = applyAction(g, 'collect_package', {}, rng());
  assert.ok(c.ok);
  assert.equal(g.inventory.diapers['1'], 40);
  assert.equal(g.inventory.clothes['0-3M'], 4);
  assert.ok(g.inventory.toys.includes('rattle'));
  assert.equal(g.house.proofing.stair_gate, true);
});

test('doctor visit produces a report and schedules the nurse for vaccines', () => {
  const g = createGame({ userId: 'u' });
  careLoop(g, 4 * DAY);
  const r = applyAction(g, 'doctor', { kind: 'checkup' }, rng());
  assert.ok(r.ok && r.report && r.report.notes.length > 0);
  assert.ok(g.baby.checkups.cu_newborn);
  assert.ok(g.house.nurseAtDoor, 'nurse should be scheduled for HepB');
});

test('game view is serialisable and hides nothing important', () => {
  const g = createGame({ userId: 'u' });
  advance(g, HOUR);
  const v = gameView(g);
  JSON.stringify(v);
  assert.equal(v.baby.name, g.baby.name);
  assert.ok(v.baby.schedule.nextCheckup);
  assert.ok(typeof v.baby.mood === 'string');
});

test('tone classifier flags harsh language', () => {
  assert.equal(classifyTone('SHUT UP AND STOP CRYING!!!'), 'harsh');
  assert.equal(classifyTone('shhh it is okay sweet girl, mama is here'), 'gentle');
  assert.equal(classifyTone('what do you want'), 'neutral');
});

test('deterministic: same seed and actions give the same outcome', () => {
  const a = createGame({ userId: 'u' }), b = createGame({ userId: 'u' });
  b.sim.seed = a.sim.seed; b.baby.phys = { ...a.baby.phys }; b.baby.appearance = { ...a.baby.appearance };
  advance(a, 12 * HOUR); advance(b, 12 * HOUR);
  assert.deepEqual(a.baby.needs, b.baby.needs);
  assert.equal(ageDays(a), 0.5);
});
