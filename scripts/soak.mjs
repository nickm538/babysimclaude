// Soak test: run whole childhoods under several play styles and assert the simulation never breaks.
// This is the pass-3 robustness harness — it exercises the engine far harder than the unit tests and
// catches NaNs, out-of-range scores, unbounded growth, dead-end states and non-determinism.
//
//   node scripts/soak.mjs              # default: every profile, 5 sim-years each
//   node scripts/soak.mjs --years 2 --profiles good,neglect
import { createGame } from '../server/sim/state.js';
import { advance, ageDays } from '../server/sim/engine.js';
import { applyAction, placeOrder } from '../server/sim/actions.js';
import { gameView } from '../server/sim/view.js';
import { makeRng } from '../server/sim/rng.js';
import { DAY, HOUR, MIN } from '../shared/constants.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const YEARS = Number(arg('years', 5));
const TRACE = args.includes('--trace');
const STEP = 5 * MIN;

let failures = 0;
const fail = (msg) => { failures++; console.error('  FAIL  ' + msg); };
const ok = (msg) => console.log('  ok    ' + msg);

// ---------------------------------------------------------------- invariants
const NUM_PATHS = [
  ['needs', ['fullness', 'rest', 'diaper', 'clean', 'comfort', 'stimulation', 'affection', 'health']],
  ['emo', ['happiness', 'trust', 'security', 'stress']],
  ['dev', ['cognitive', 'motor', 'language', 'social', 'emotional']],
];

function checkInvariants(g, where) {
  const b = g.baby;
  for (const [group, keys] of NUM_PATHS) {
    for (const k of keys) {
      const v = b[group][k];
      if (!Number.isFinite(v)) return `${where}: baby.${group}.${k} is ${v}`;
      if (v < -0.001 || v > 100.001) return `${where}: baby.${group}.${k} out of range (${v})`;
    }
  }
  for (const k of ['weightKg', 'heightCm', 'tempC', 'nutrition']) {
    if (!Number.isFinite(b.phys[k])) return `${where}: phys.${k} is ${b.phys[k]}`;
  }
  if (b.phys.weightKg <= 0 || b.phys.weightKg > 40) return `${where}: implausible weight ${b.phys.weightKg}`;
  if (b.phys.heightCm <= 0 || b.phys.heightCm > 140) return `${where}: implausible height ${b.phys.heightCm}`;
  if (b.phys.tempC < 30 || b.phys.tempC > 45) return `${where}: implausible temperature ${b.phys.tempC}`;
  if (!Number.isFinite(g.sim.time) || g.sim.time < 0) return `${where}: sim.time is ${g.sim.time}`;
  if (g.journal.length > 500) return `${where}: journal grew to ${g.journal.length}`;
  if (Array.isArray(g.notifications) && g.notifications.length > 60) return `${where}: notifications grew to ${g.notifications.length}`;
  if (g.orders.length > 200) return `${where}: orders grew to ${g.orders.length}`;
  if (!['active', 'dead', 'won'].includes(g.status)) return `${where}: bad status ${g.status}`;
  return null;
}

// ---------------------------------------------------------------- play styles
const attentive = (g, rng) => {
  const b = g.baby, s = b.state, n = b.needs, inv = g.inventory, days = ageDays(g);
  for (const o of g.orders) if (o.status === 'delivered') applyAction(g, 'collect_package', { orderId: o.id }, rng);
  // Keep the house stocked at every age — running out of diapers or wipes silently blocks care.
  const shipping = g.orders.some((o) => o.status === 'shipping');
  const diapersLeft = Object.values(inv.diapers).reduce((a, x) => a + x, 0);
  if (!shipping && (diapersLeft < 8 || inv.wipes < 20 || (days < 400 && inv.formula < 8))) {
    const cart = [{ id: 'diapers', size: b.wear.neededDiaper || 'N' }, { id: 'wipes' }];
    if (days < 400) cart.push({ id: 'formula' });
    if ((inv.clothes[b.wear.neededSize] || 0) === 0) cart.push({ id: 'clothes', size: b.wear.neededSize || 'NB' });
    placeOrder(g, cart);
  }
  if (days > 110 && days < 420 && inv.purees < 6 && !shipping) placeOrder(g, [{ id: 'purees' }, { id: 'cereal' }]);
  if (days > 350 && inv.toddler_meals < 6 && !shipping) placeOrder(g, [{ id: 'toddler_meals' }, { id: 'whole_milk' }, { id: 'snacks' }]);
  if (inv.bottlesClean === 0) applyAction(g, 'wash_bottles', {}, rng);
  if (b.wear.outfitSize !== b.wear.neededSize && (inv.clothes[b.wear.neededSize] || 0) > 0) applyAction(g, 'dress', { size: b.wear.neededSize }, rng);
  if (n.fullness < 45) {
    const type = days > 365 && inv.toddler_meals > 0 ? 'toddler_meal' : days > 130 && inv.purees > 0 ? 'puree' : 'formula';
    applyAction(g, 'feed', { type }, rng);
  }
  if (s.needsBurp) applyAction(g, 'burp', {}, rng);
  if (n.diaper < 55) applyAction(g, 'change_diaper', { cream: b.phys.rash > 15 }, rng);
  if (s.cryingSince) { if (!s.held) applyAction(g, 'hold', {}, rng); applyAction(g, 'rock', {}, rng); }
  if (s.activity !== 'sleeping' && n.rest < 32) applyAction(g, 'put_to_sleep', { location: days > 540 && inv.toddler_bed ? 'toddler_bed' : 'crib', position: 'back' }, rng);
  // Safe sleep: a tired baby is never left on its tummy, and a sleeping one always ends up on its back.
  if (s.position === 'tummy' && (n.rest < 45 || s.activity === 'sleeping')) applyAction(g, 'put_down', { location: 'crib', position: 'back' }, rng);
  if (s.held && s.activity === 'sleeping') applyAction(g, 'put_down', { location: 'crib', position: 'back' }, rng);
  if (s.activity !== 'sleeping' && n.stimulation < 55) {
    const toys = gameView(g).baby.ageToys;
    if (toys.length) applyAction(g, 'play', { toy: toys[0] }, rng); else applyAction(g, 'sing', {}, rng);
  }
  if (n.clean < 50) applyAction(g, 'bathe', { temp: 'warm' }, rng);
  if (s.activity !== 'sleeping' && rng.chance(0.05)) applyAction(g, 'cuddle', {}, rng);
  if (s.activity !== 'sleeping' && rng.chance(0.04)) applyAction(g, 'read', {}, rng);
  // Supervised tummy time only while well rested, then straight back onto the back.
  if (days < 365 && s.activity !== 'sleeping' && n.rest > 55 && rng.chance(0.004)) applyAction(g, 'tummy_time', {}, rng);
  // health upkeep: a stocked medicine cabinet, checkups, the nurse, and the doctor when something is wrong
  if ((inv.saline < 3 || inv.electrolytes < 3 || (days > 61 && inv.acetaminophen < 3)) && !shipping) {
    placeOrder(g, [{ id: 'saline' }, { id: 'electrolytes' }, { id: 'acetaminophen' }, { id: 'diaper_cream' }]);
  }
  // Medicine, dosed like a careful parent: only for a real fever, and never closer than six hours apart.
  if (b.illness && b.illness.known && b.phys.tempC >= 38 && days >= 61 && (inv.acetaminophen || 0) > 0) {
    const last = (b.state.medsLog || []).filter((m) => m.id === 'acetaminophen').reduce((a, m) => Math.max(a, m.at), -1e9);
    if (g.sim.time - last > 6 * HOUR) applyAction(g, 'medicine', { id: 'acetaminophen' }, rng);
  }
  if (b.illness && b.illness.known && b.illness.id === 'cold' && (inv.saline || 0) > 0 && rng.chance(0.004)) applyAction(g, 'medicine', { id: 'saline' }, rng);
  if (b.illness && b.illness.known && b.illness.id === 'stomach_bug' && (inv.electrolytes || 0) > 0 && rng.chance(0.01)) applyAction(g, 'medicine', { id: 'electrolytes' }, rng);
  if (g.house.nurseAtDoor && g.house.nurseAtDoor.arrivesAt <= g.sim.time) applyAction(g, 'nurse_visit', {}, rng);
  const sched = gameView(g).baby.schedule;
  if (sched.nextCheckup && days >= sched.nextCheckup.dueDays) applyAction(g, 'doctor', { kind: 'checkup' }, rng);
  if (b.illness && !b.illness.known) applyAction(g, 'doctor', { kind: 'sick' }, rng);
  // safety
  for (const p of ['cabinet_locks', 'stair_gate', 'outlet_covers', 'small_objects', 'corner_guards', 'anchors', 'cord_clips']) {
    if (!g.house.proofing[p] && days > 100 && !g.orders.some((o) => o.items.some((i) => i.size === p))) { placeOrder(g, [{ id: 'babyproof', size: p }]); break; }
  }
  if (days > 180 && rng.chance(0.01)) { const l = gameView(g).baby.schedule.lessons; if (l.length) applyAction(g, 'lesson', { id: l[rng.int(0, l.length - 1)] }, rng); }
};

const minimal = (g, rng) => {
  const n = g.baby.needs, inv = g.inventory;
  for (const o of g.orders) if (o.status === 'delivered') applyAction(g, 'collect_package', { orderId: o.id }, rng);
  if (inv.formula < 5 && !g.orders.some((o) => o.status === 'shipping')) placeOrder(g, [{ id: 'formula' }, { id: 'diapers', size: g.baby.wear.neededDiaper || 'N' }, { id: 'wipes' }]);
  if (inv.bottlesClean === 0) applyAction(g, 'wash_bottles', {}, rng);
  if (n.fullness < 25) applyAction(g, 'feed', { type: 'formula' }, rng);
  if (n.diaper < 25) applyAction(g, 'change_diaper', {}, rng);
};

const chaotic = (g, rng) => {
  // Fuzz: fire random valid-and-invalid actions to prove nothing throws and nothing corrupts state.
  const ids = ['feed', 'burp', 'change_diaper', 'bathe', 'dress', 'hold', 'put_down', 'rock', 'sing', 'play', 'tummy_time',
    'read', 'put_to_sleep', 'pacifier', 'swaddle', 'white_noise', 'check_temp', 'medicine', 'vitamin_d', 'doctor', 'lesson',
    'potty', 'move', 'yell', 'scream', 'leave', 'return', 'babysitter', 'collect_package', 'nurse_visit', 'thermostat',
    'cuddle', 'talk', 'wash_bottles', 'choice', 'nonexistent_action'];
  const id = ids[rng.int(0, ids.length - 1)];
  const params = { type: ['formula', 'puree', 'honey', 'milk', 'water', 'bogus'][rng.int(0, 5)],
    location: ['crib', 'sofa', 'floor', 'play_mat', 'bogus'][rng.int(0, 4)],
    position: ['back', 'tummy', 'sitting'][rng.int(0, 2)],
    toy: ['mobile', 'rattle', 'bogus'][rng.int(0, 2)], id: ['acetaminophen', 'songs', 'bogus'][rng.int(0, 2)],
    minutes: rng.int(-100, 1000), tempC: rng.range(-50, 90), hours: rng.int(-5, 100), temp: ['warm', 'hot', 'cold'][rng.int(0, 2)],
    size: 'NB', choiceId: 'nope', option: 'nope' };
  applyAction(g, id, params, rng);
  if (rng.chance(0.02)) placeOrder(g, [{ id: ['formula', 'diapers', 'toy', 'bogus'][rng.int(0, 3)], size: 'N' }]);
  if (g.parent.awayUntil > g.sim.time && rng.chance(0.3)) applyAction(g, 'return', {}, rng);
};

const PROFILES = { good: attentive, minimal, neglect: () => {}, chaotic };

// ---------------------------------------------------------------- runner
function run(name, policy, years) {
  const g = createGame({ userId: 'soak', babyName: 'Soak', sex: name.length % 2 ? 'girl' : 'boy' });
  const rng = makeRng(1234 + name.length);
  const t0 = Date.now();
  let steps = 0, worst = null, viewErrors = 0;
  const total = years * 365 * DAY;
  for (let t = 0; t < total; t += STEP) {
    advance(g, STEP);
    steps++;
    if (g.status !== 'active') break;
    try { policy(g, rng); } catch (e) { fail(`${name}: policy threw at day ${ageDays(g).toFixed(1)}: ${e.message}\n${e.stack}`); break; }
    if (TRACE && steps % 12 === 0) {
      const b = g.baby;
      const ill = b.illness ? `${b.illness.id}@${Math.round(b.illness.severity)}${b.illness.treated ? 'T' : ''}` : '-';
      if (b.needs.health < 60 || ill !== '-') console.log(`    t=${ageDays(g).toFixed(2)}d health=${b.needs.health.toFixed(1)} ill=${ill} nutri=${b.phys.nutrition.toFixed(2)} full=${Math.round(b.needs.fullness)} rest=${Math.round(b.needs.rest)} clean=${Math.round(b.needs.clean)} hosp=${b.state.hospitalizedUntil > g.sim.time ? 'Y' : 'n'} inj=${b.injuries.length}`);
    }
    if (steps % 288 === 0) { // once per sim-day
      const bad = checkInvariants(g, `${name} day ${Math.floor(ageDays(g))}`);
      if (bad && !worst) { worst = bad; fail(bad); }
      try { JSON.stringify(gameView(g)); } catch (e) { if (!viewErrors++) fail(`${name}: gameView failed at day ${ageDays(g).toFixed(0)}: ${e.message}`); }
    }
  }
  const bad = checkInvariants(g, `${name} final`);
  if (bad) fail(bad);
  const v = (() => { try { return gameView(g); } catch (e) { fail(`${name}: final gameView failed: ${e.message}`); return null; } })();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const b = g.baby;
  console.log(`\n[${name}] ${g.status} at ${ageDays(g).toFixed(0)} days · ${steps} steps in ${secs}s`);
  console.log(`  weight ${b.phys.weightKg.toFixed(2)}kg  height ${b.phys.heightCm.toFixed(1)}cm  health ${Math.round(b.needs.health)}  happiness ${Math.round(b.emo.happiness)}  trust ${Math.round(b.emo.trust)}`);
  console.log(`  milestones ${Object.keys(b.milestones).length}  delays ${b.delays.length}  attachment ${b.attachment}  illnesses seen ${g.stats.doctorVisits} visits`);
  if (v && v.baby.moodLabel) console.log(`  mood ${v.baby.moodLabel} (${v.baby.moodValue})`);
  if (g.story) console.log(`  story: ${g.story.temperament || '—'}, ${(g.story.traits || []).length} traits, ${(g.story.chapters || []).length} chapters, ${(g.story.memories || []).length} memories`);
  if (g.social) console.log(`  social: ${(g.social.contacts || []).length} contacts, ${(g.social.invitations || []).length} open invitations`);
  if (g.death) console.log(`  death: ${g.death.cause} — ${g.death.text}`);
  if (g.win) console.log(`  win: ${g.win.grade} (${g.win.score}/100)`);
  const stateBytes = JSON.stringify(g).length;
  console.log(`  saved state ${(stateBytes / 1024).toFixed(0)} KB`);
  if (stateBytes > 2_000_000) fail(`${name}: state ballooned to ${(stateBytes / 1048576).toFixed(2)} MB`);
  return g;
}

console.log(`Cradle soak — ${YEARS} sim-year(s) per profile\n${'='.repeat(56)}`);
const wanted = String(arg('profiles', Object.keys(PROFILES).join(','))).split(',');
const results = {};
for (const name of wanted) {
  const policy = PROFILES[name];
  if (!policy) { console.error(`unknown profile ${name}`); continue; }
  results[name] = run(name, policy, YEARS);
}

// ---------------------------------------------------------------- outcome expectations
console.log(`\n${'='.repeat(56)}\nOutcome checks`);
const good = results.good, neglect = results.neglect, chaotic_ = results.chaotic;
if (good) {
  if (YEARS >= 5) {
    if (good.status === 'won') ok('attentive care reaches the fifth birthday'); else fail(`attentive care ended as "${good.status}" at ${ageDays(good).toFixed(0)} days — a careful player must be able to win`);
  } else if (good.status !== 'active') fail(`attentive care ended early as "${good.status}" at ${ageDays(good).toFixed(0)} days`);
  else ok('attentive care survives the whole run');
  if (good.baby.needs.health > 60) ok(`attentive care keeps health high (${Math.round(good.baby.needs.health)})`); else fail(`attentive care let health fall to ${Math.round(good.baby.needs.health)}`);
  if (good.baby.emo.trust > 50) ok(`attentive care builds trust (${Math.round(good.baby.emo.trust)})`); else fail(`attentive care only reached trust ${Math.round(good.baby.emo.trust)}`);
  const ms = Object.keys(good.baby.milestones).length;
  if (ms >= Math.min(8, YEARS * 6)) ok(`attentive care hits milestones (${ms})`); else fail(`attentive care only hit ${ms} milestones`);
}
if (neglect) {
  if (neglect.status === 'dead') ok(`total neglect is fatal (${neglect.death.cause} at ${ageDays(neglect).toFixed(1)} days)`);
  else fail('total neglect did not kill the baby — neglect must have real consequences');
  if (ageDays(neglect) > 1) ok('death takes more than a day of neglect'); else fail('the baby died within a single day — too punishing');
}
if (chaotic_) ok(`fuzzing survived without throwing (${chaotic_.status} at ${ageDays(chaotic_).toFixed(0)} days)`);

// determinism
const a = run('determinism-a', minimal, Math.min(1, YEARS));
const b2 = createGame({ userId: 'soak', babyName: 'Soak', sex: 'girl' });
b2.sim.seed = a.sim.seed; b2.baby.phys = { ...b2.baby.phys, ...JSON.parse(JSON.stringify(a.baby.phys)) };
console.log('');
{
  const g = createGame({ userId: 'soak', babyName: 'D', sex: 'girl' });
  const h = createGame({ userId: 'soak', babyName: 'D', sex: 'girl' });
  h.id = g.id; h.sim.seed = g.sim.seed; h.baby.phys = JSON.parse(JSON.stringify(g.baby.phys)); h.baby.appearance = JSON.parse(JSON.stringify(g.baby.appearance));
  h.story = g.story ? JSON.parse(JSON.stringify(g.story)) : h.story;
  h.social = g.social ? JSON.parse(JSON.stringify(g.social)) : h.social;
  advance(g, 3 * DAY); advance(h, 3 * DAY);
  const same = JSON.stringify(g.baby.needs) === JSON.stringify(h.baby.needs) && JSON.stringify(g.baby.emo) === JSON.stringify(h.baby.emo);
  if (same) ok('the simulation is deterministic for a given seed'); else fail('same-seed runs diverged — the simulation is not deterministic');
}

console.log(`\n${'='.repeat(56)}`);
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('all soak checks passed');
