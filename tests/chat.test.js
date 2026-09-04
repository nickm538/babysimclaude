// Talking to your child is gameplay, not decoration: what you type moves real stats, and a request
// the child understands and is willing to do actually happens in the world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../server/sim/state.js';
import { advance, ageDays } from '../server/sim/engine.js';
import { applyAction } from '../server/sim/actions.js';
import { gameView } from '../server/sim/view.js';
import { makeRng } from '../server/sim/rng.js';
import { ensureStory } from '../server/sim/story.js';
import { parseIntent, applyWords, resolveCommand, obedience, COMMANDS } from '../server/ai/chatIntent.js';
import { classifyTone } from '../server/ai/babyChat.js';
import { DAY, EMOTION_KEYS } from '../shared/constants.js';

function child(days, tweak, id = 'chat-fixture') {
  const g = createGame({ userId: 'u', babyName: 'Robin', sex: 'girl', id });
  ensureStory(g);
  g.sim.time = days * DAY;
  Object.assign(g.baby.state, { activity: 'awake', awakeSince: g.sim.time, sleepSince: null, cryingSince: null });
  for (const k of Object.keys(g.baby.needs)) g.baby.needs[k] = 75;
  for (const k of Object.keys(g.baby.dev)) g.baby.dev[k] = Math.min(92, 8 + days / 18);
  Object.assign(g.baby.emo, { happiness: 65, trust: 70, security: 65, esteem: 60, stress: 15 });
  if (tweak) tweak(g);
  return g;
}
const say = (g, text, seed = 3) => {
  const parsed = parseIntent(text);
  const words = applyWords(g, parsed, classifyTone(text));
  const outcome = parsed.command ? resolveCommand(g, parsed, makeRng(seed), applyAction) : null;
  return { parsed, words, outcome };
};

test('self-esteem is a real tracked stat the UI knows about', () => {
  const g = child(400);
  assert.ok(EMOTION_KEYS.includes('esteem'), 'the phone renders every key in EMOTION_KEYS');
  assert.equal(typeof g.baby.emo.esteem, 'number');
  const v = gameView(g);
  assert.equal(typeof v.baby.emo.esteem, 'number', 'and the client can see it');
});

test('a game saved before self-esteem existed still loads, with a plausible value', () => {
  const g = child(300);
  delete g.baby.emo.esteem;
  delete g.parent.tempers.smacks;
  const v = gameView(g);   // gameView migrates on the way through
  assert.equal(typeof v.baby.emo.esteem, 'number');
  assert.ok(v.baby.emo.esteem > 0 && v.baby.emo.esteem <= 100, `reconstructed, got ${v.baby.emo.esteem}`);
  assert.equal(g.parent.tempers.smacks, 0);
  assert.doesNotThrow(() => advance(g, 3600));
});

test('telling a child you hate them wounds them; telling them you love them helps', () => {
  const cruel = child(500), kind = child(500);
  const before = cruel.baby.emo.esteem;
  say(cruel, 'i hate you, you are a horrible child');
  say(kind, 'i love you so much, you are wonderful');
  assert.ok(cruel.baby.emo.esteem < before - 5, `cruelty must cost self-esteem, got ${cruel.baby.emo.esteem}`);
  assert.ok(cruel.baby.emo.trust < 70, 'and trust');
  assert.ok(cruel.baby.emo.happiness < 65, 'and happiness');
  assert.ok(cruel.baby.emo.stress > 15, 'and it is frightening');
  assert.ok(kind.baby.emo.esteem > before, `praise must build self-esteem, got ${kind.baby.emo.esteem}`);
  assert.ok(kind.baby.emo.happiness > 65);
  // Deliberately asymmetric: one cruel sentence outweighs one kind one.
  assert.ok((before - cruel.baby.emo.esteem) > (kind.baby.emo.esteem - before), 'harm outweighs praise, as it does in life');
});

test('a newborn feels the tone of cruelty even though it cannot understand the words', () => {
  const baby = child(20), toddler = child(900);
  const b0 = baby.baby.emo.esteem, t0 = toddler.baby.emo.esteem;
  say(baby, 'i hate you');
  say(toddler, 'i hate you');
  const babyHit = b0 - baby.baby.emo.esteem, toddlerHit = t0 - toddler.baby.emo.esteem;
  assert.ok(babyHit > 0, 'a newborn is still hurt by it — tone carries');
  assert.ok(toddlerHit > babyHit, 'but a child who understands the words is hurt more');
});

test('apologising after losing your temper repairs some of it', () => {
  const g = child(700);
  applyAction(g, 'yell', {});
  const low = { trust: g.baby.emo.trust, stress: g.baby.emo.stress };
  say(g, "i'm sorry, that was my fault");
  assert.ok(g.baby.emo.trust > low.trust, 'repair rebuilds some trust');
  assert.ok(g.baby.emo.stress < low.stress, 'and calms them');
  // But it does not undo it.
  assert.ok(g.baby.emo.trust < 70, 'the yell still cost more than the apology returned');
});

test('an apology means nothing if there was nothing to apologise for', () => {
  const g = child(700);
  const before = g.baby.emo.trust;
  say(g, "i'm sorry");
  assert.equal(g.baby.emo.trust, before, 'no temper history, no repair bonus');
});

test('asking a child to do something they are too young for is refused, kindly and without effect', () => {
  const g = child(60);
  const before = JSON.stringify({ n: g.baby.needs, d: g.baby.dev });
  const r = say(g, 'go wash the dishes');
  assert.ok(r.outcome, 'the request was understood as a request');
  assert.equal(r.outcome.kind, 'too_young');
  assert.match(r.outcome.text, /old enough|safe/i);
  assert.equal(JSON.stringify({ n: g.baby.needs, d: g.baby.dev }), before, 'and nothing happened');
});

test('"go wash the dishes" to a capable, willing child actually washes the dishes', () => {
  let obeyed = null;
  for (let seed = 1; seed <= 40 && !obeyed; seed++) {
    const g = child(1500, (x) => {
      Object.assign(x.baby.emo, { trust: 95, happiness: 85, stress: 5, esteem: 70 });
      x.inventory.bottles = 4; x.inventory.bottlesClean = 0;
    }, `dishes-${seed}`);
    const r = say(g, 'can you go wash the dishes please', seed);
    if (r.outcome && r.outcome.kind === 'obeyed') obeyed = { g, r };
  }
  assert.ok(obeyed, 'a trusting, capable, happy child does it at least sometimes');
  assert.equal(obeyed.r.outcome.action, 'chore_dishes', 'through the real action, not a canned message');
  assert.ok(obeyed.g.journal.some((e) => e.type === 'chore'), 'and it is journalled like any other action');
  assert.equal(obeyed.g.inventory.bottlesClean, obeyed.g.inventory.bottles, 'the dishes are actually clean now');
  assert.ok(obeyed.g.baby.emo.esteem > 70, 'doing something useful builds self-esteem');
});

test('a toddler refuses a lot, and refusing is not a failure of the game', () => {
  let refusals = 0, obeys = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = child(800, (x) => { Object.assign(x.baby.emo, { trust: 55, stress: 40 }); x.baby.needs.rest = 25; }, `toddler-${seed}`);
    const r = say(g, 'tidy up your toys', seed);
    if (!r.outcome) continue;
    if (r.outcome.kind === 'refused') refusals++;
    if (r.outcome.kind === 'obeyed') obeys++;
  }
  assert.ok(refusals > 0, 'a tired, stressed two-year-old says no');
  assert.ok(refusals > obeys, `and says no more often than yes (${refusals} vs ${obeys})`);
});

test('trust changes whether a child does what you ask', () => {
  const trusting = child(1200, (x) => { x.baby.emo.trust = 95; }, 'ob-hi');
  const wary = child(1200, (x) => { x.baby.emo.trust = 10; }, 'ob-lo');
  const cmd = COMMANDS.find((c) => c.id === 'tidy');
  const a = obedience(trusting, cmd).p, b = obedience(wary, cmd).p;
  assert.ok(a > b * 1.5, `a trusted parent is listened to (${a.toFixed(2)} vs ${b.toFixed(2)})`);
});

test('a sleeping child does not take orders', () => {
  const g = child(1200, (x) => { Object.assign(x.baby.state, { activity: 'sleeping', sleepSince: x.sim.time }); });
  const cmd = COMMANDS.find((c) => c.id === 'tidy');
  assert.ok(obedience(g, cmd).p < 0.06, 'asleep is asleep');
  const r = say(g, 'tidy up');
  assert.ok(r.outcome && r.outcome.kind !== 'obeyed');
});

test('every command in the catalog maps to a real action and never throws', () => {
  for (const c of COMMANDS) {
    const g = child(Math.max(1600, c.fluentDays + 200), (x) => {
      Object.assign(x.baby.emo, { trust: 100, happiness: 90, stress: 0 });
      Object.assign(x.inventory, { formula: 9, bottlesClean: 4, bottles: 4, wipes: 99, purees: 9, snacks: 9, whole_milk: 9, toddler_meals: 9, plants: 1, broom: 1 });
      x.inventory.toys = ['rattle', 'board_books', 'blocks', 'shape_sorter', 'stacking_cups'];
    }, `cmd-${c.id}`);
    const parsed = { command: c, match: [null, 'mama'] };
    let out;
    assert.doesNotThrow(() => { out = resolveCommand(g, parsed, makeRng(7), applyAction); }, `${c.id} threw`);
    assert.ok(out && typeof out.text === 'string' && out.text.length > 5, `${c.id} must narrate what happened`);
    assert.ok(['obeyed', 'refused', 'blocked', 'too_young'].includes(out.kind), `${c.id} gave ${out.kind}`);
  }
});

test('a question is read as a question, and plain talk is not a command', () => {
  assert.equal(parseIntent('shall we read a book?').asked, true);
  assert.equal(parseIntent('go to bed').asked, false);
  assert.equal(parseIntent('you had a lovely day today').command, null, 'ordinary conversation is not an order');
  assert.equal(parseIntent('what a beautiful morning').command, null);
});

test('the model can name a request the patterns missed, but never decides the outcome', () => {
  const viaPattern = parseIntent('water the plants');
  assert.equal(viaPattern.command.id, 'plants');
  const viaModel = parseIntent('could you give the pot plant a drink for me', 'plants');
  assert.equal(viaModel.command.id, 'plants', 'the model can spot a paraphrase');
  assert.equal(viaModel.viaModel, true);
  // A hint for a request the child cannot possibly do is still refused by the simulation.
  const g = child(30);
  const r = resolveCommand(g, viaModel, makeRng(1), applyAction);
  assert.equal(r.kind, 'too_young', 'the simulation decides, not the model');
});

// ---- physical punishment -------------------------------------------------------------------
// It is in the game because the game is about consequences. These tests pin those consequences:
// it must always be the worst option available, it must never be a shortcut to compliance, and it
// must accumulate rather than wash out.

test('hitting a child is the most damaging action in the game', () => {
  const mk = () => child(800, (x) => Object.assign(x.baby.emo, { happiness: 65, trust: 70, security: 65, esteem: 60, stress: 15 }));
  const hit = mk(), yelled = mk(), screamed = mk();
  applyAction(hit, 'smack', {});
  applyAction(yelled, 'yell', {});
  applyAction(screamed, 'scream', {});
  const damage = (g) => (70 - g.baby.emo.trust) + (65 - g.baby.emo.security) + (65 - g.baby.emo.happiness);
  assert.ok(damage(hit) > damage(screamed), `hitting must be worse than screaming (${damage(hit).toFixed(0)} vs ${damage(screamed).toFixed(0)})`);
  assert.ok(damage(screamed) > damage(yelled), 'and screaming worse than yelling');
  assert.ok(hit.baby.emo.esteem < 60, 'it costs self-esteem, which shouting alone does not touch as hard');
});

test('hitting hurts: it leaves an injury and costs health', () => {
  const g = child(800);
  const before = g.baby.needs.health;
  applyAction(g, 'smack', {});
  assert.ok(g.baby.injuries.some((i) => i.kind === 'smack'), 'it is recorded as a physical injury');
  assert.ok(g.baby.needs.health < before, 'and it costs health');
  assert.ok(g.baby.state.cryingSince, 'and the child is crying');
  assert.equal(g.baby.state.cryCause, 'scared');
  assert.ok(g.baby.history.firstSmackAt > 0, 'the first time is remembered');
});

test('hitting an infant is treated as categorically worse than hitting a toddler', () => {
  const infant = child(120), toddler = child(1100);
  applyAction(infant, 'smack', {});
  applyAction(toddler, 'smack', {});
  assert.ok(infant.baby.emo.trust < toddler.baby.emo.trust, 'a baby cannot connect the pain to anything at all');
  assert.ok(infant.baby.needs.health < toddler.baby.needs.health);
});

test('hitting makes self-regulation worse, not better — it never buys compliance', () => {
  const g = child(900, (x) => { x.baby.dev.emotional = 60; });
  const before = g.baby.dev.emotional;
  applyAction(g, 'smack', {});
  assert.ok(g.baby.dev.emotional < before, 'the child gets worse at handling big feelings, not better');
  // And a frightened, hurt child is less likely to do what they are told, not more.
  const cmd = COMMANDS.find((c) => c.id === 'tidy');
  assert.ok(obedience(g, cmd).p < 0.3, 'compliance drops');
});

test('a pattern of hitting gets noticed', () => {
  const g = child(900);
  for (let i = 0; i < 3; i++) { applyAction(g, 'smack', {}); g.baby.state.cryingSince = null; }
  assert.equal(g.parent.tempers.smacks, 3);
  assert.ok(g.parent.safeguarding > 0, 'a concern is raised');
  assert.ok(g.notifications.some((n) => /hit|concern|visit/i.test(n.title + n.text)), 'and the player is told');
});

test('it is journalled and remembered in the story, permanently', () => {
  const g = child(900);
  applyAction(g, 'smack', {});
  assert.ok(g.journal.some((e) => e.type === 'temper' && e.sev === 'danger'));
  assert.ok(g.story.memories.some((m) => /hit/i.test(m.text)), 'the child remembers it');
  const heavy = g.story.memories.find((m) => /hit/i.test(m.text));
  assert.ok(heavy.weight >= 90, 'and it is one of the heaviest memories there is');
});

// ---- character rigging ---------------------------------------------------------------------
// Anatomy the eye notices instantly and code notices never, unless it is measured.

test('a standing visitor has their arms down, not over their head', async () => {
  const THREE = await import('three');
  const { adultLayout } = await import('../client/src/characters/adult.js');
  const { makeBones } = await import('../client/src/characters/babyMesh.js');
  const L = adultLayout({ h: 1.7, build: 0.5, female: true });
  const { bones, byName } = makeBones(L);
  const root = new THREE.Group(); root.add(bones[0]);
  // the same pose the idle applies at rest
  for (const [s, sx] of [['L', -1], ['R', 1]]) {
    byName['upperArm' + s].rotation.z = -sx * (Math.PI * 0.46 - 0.05);
    byName['foreArm' + s].rotation.z = -sx * 0.2;
  }
  root.updateMatrixWorld(true);
  const at = (n) => new THREE.Vector3().setFromMatrixPosition(byName[n].matrixWorld);
  for (const s of ['L', 'R']) {
    const shoulder = at('upperArm' + s), wrist = at('hand' + s);
    assert.ok(wrist.y < shoulder.y - 0.3, `${s} wrist must hang well below the shoulder (${wrist.y.toFixed(2)} vs ${shoulder.y.toFixed(2)})`);
    assert.ok(Math.abs(wrist.x) < Math.abs(at('shoulder' in L.J ? 'upperArm' + s : 'upperArm' + s).x) + 0.15, 'and stay beside the body');
    assert.ok(wrist.y > 0.4, 'but not dangle past the knees');
  }
});

test('a visitor is exactly as tall as they were designed to be', async () => {
  const { adultLayout } = await import('../client/src/characters/adult.js');
  for (const h of [1.52, 1.68, 1.83]) {
    const L = adultLayout({ h, build: 0.5, female: false });
    assert.ok(Math.abs(L.totalH - h) < 0.005, `asked for ${h}m, laid out ${L.totalH.toFixed(3)}m`);
    assert.ok(L.J.hips.y > h * 0.4 && L.J.hips.y < h * 0.56, 'with hips at a human fraction of the height');
    assert.ok(L.headCenter.y > h * 0.88, 'and the head on top');
  }
});

test('every character has exactly the limbs it should — no extras, none missing', async () => {
  const { adultLayout } = await import('../client/src/characters/adult.js');
  const { skeletonLayout } = await import('../client/src/characters/babyMesh.js');
  for (const [what, L] of [['adult', adultLayout({})], ['baby', skeletonLayout(0)], ['child', skeletonLayout(1500)]]) {
    const names = L.bones.map((b) => b[0]);
    assert.equal(new Set(names).size, names.length, `${what}: no duplicate bones`);
    for (const side of ['L', 'R']) for (const part of ['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot']) {
      assert.equal(names.filter((n) => n === part + side).length, 1, `${what}: exactly one ${part}${side}`);
    }
    assert.equal(names.filter((n) => n === 'head').length, 1, `${what}: one head`);
    assert.equal(names.length, 17, `${what}: 17 bones — one spine chain, two arms, two legs`);
  }
});

// ---- the child speaking first ----------------------------------------------------------------

test('the child talks to you unprompted, in an age-appropriate way, without repeating itself', async () => {
  const { rollSpeech } = await import('../server/sim/speech.js');
  for (const [days, want] of [[30, /\*/], [250, /"/], [800, /"/], [1500, /"/]]) {
    const g = child(days, (x) => { x.baby.needs.stimulation = 30; x.baby.needs.affection = 30; });
    const r = makeRng(days);
    const said = [];
    for (let i = 0; i < 4000 && said.length < 12; i++) {
      g.sim.time += 300;
      const line = rollSpeech(g, 300 / 3600, r);
      if (line) said.push(line);
    }
    assert.ok(said.length >= 4, `a ${days}-day-old should pipe up sometimes, got ${said.length}`);
    assert.ok(said.every((l) => want.test(l)), `${days}d lines should be age-appropriate: ${said[0]}`);
    // No line should follow itself, and the recent window should stop tight loops.
    for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1], 'never twice in a row');
    assert.ok(new Set(said).size >= Math.min(4, said.length), `and should vary: ${new Set(said).size} distinct of ${said.length}`);
  }
});

test('a sleeping or crying child does not chat', async () => {
  const { rollSpeech } = await import('../server/sim/speech.js');
  for (const state of [{ activity: 'sleeping' }, { cryingSince: 1 }]) {
    const g = child(900, (x) => Object.assign(x.baby.state, state));
    const r = makeRng(5);
    let said = 0;
    for (let i = 0; i < 3000; i++) { g.sim.time += 300; if (rollSpeech(g, 300 / 3600, r)) said++; }
    assert.equal(said, 0, `no chatter while ${JSON.stringify(state)}`);
  }
});

test('unprompted speech reaches the journal as its own event type', () => {
  const g = child(900, (x) => { x.baby.needs.affection = 25; x.baby.needs.stimulation = 25; });
  for (let i = 0; i < 200 && !g.journal.some((e) => e.type === 'says'); i++) advance(g, 900);
  assert.ok(g.journal.some((e) => e.type === 'says'), 'the client picks these up by type to put them in the chat thread');
});

test('adversarial chat input never throws and never corrupts a stat', () => {
  const inputs = ['', '   ', 'I HATE YOU!!!', 'say ' + 'x'.repeat(300), '<script>alert(1)</script>',
    'tidy up and go to bed and eat your dinner', '你好宝宝', '?'.repeat(200), 'sorry sorry sorry',
    'go wash the dishes come here water the plants', 'say', 'drink', 'COME HERE RIGHT NOW'];
  for (const days of [0, 400, 1200]) {
    for (const text of inputs) {
      const g = child(days, null, `fuzz-${days}`);
      assert.doesNotThrow(() => {
        const parsed = parseIntent(text, 'plants', 'mama');
        applyWords(g, parsed, classifyTone(text));
        if (parsed.command) resolveCommand(g, parsed, makeRng(2), applyAction);
      }, `threw on ${JSON.stringify(text).slice(0, 40)} at ${days}d`);
      for (const [k, v] of Object.entries(g.baby.emo)) {
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${k} went to ${v} on ${JSON.stringify(text).slice(0, 30)}`);
      }
      for (const [k, v] of Object.entries(g.baby.needs)) assert.ok(Number.isFinite(v), `${k} is ${v}`);
    }
  }
});

test('every action still works on a game that never met the story or social layers', async () => {
  const { createGame: bare } = await import('../server/sim/state.js');
  const { EXTRA_ACTION_IDS } = await import('../server/sim/actions2.js');
  const ids = ['smack', 'yell', 'scream', 'leave', 'chore_dishes', 'talk', 'hold', 'feed', 'choice', ...EXTRA_ACTION_IDS];
  for (const days of [0, 800, 1500]) {
    for (const id of ids) {
      const g = bare({ userId: 'u', babyName: 'Bare', sex: 'girl', id: `bare-${days}` });
      g.sim.time = days * DAY;
      let r;
      assert.doesNotThrow(() => { r = applyAction(g, id, { word: 'mama', tone: 'harsh', minutes: 5 }, makeRng(3)); }, `${id} threw at ${days}d on a bare game`);
      assert.equal(typeof r.ok, 'boolean', `${id} must return { ok }`);
      assert.doesNotThrow(() => advance(g, 600), `advancing after ${id} threw`);
    }
  }
});
