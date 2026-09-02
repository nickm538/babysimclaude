// The second gameplay layer: the 43 nuanced interactions in actions2.js. These all route through
// applyAction, so the contract under test is the same one the client and the WebSocket use —
// validate, mutate, journal, return { ok, message }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../server/sim/state.js';
import { advance, ageDays } from '../server/sim/engine.js';
import { applyAction } from '../server/sim/actions.js';
import { gameView } from '../server/sim/view.js';
import { makeRng } from '../server/sim/rng.js';
import { ensureStory } from '../server/sim/story.js';
import { EXTRA_ACTION_IDS } from '../server/sim/actions2.js';
import { DAY, HOUR, WORDS_BY_AGE, ALLERGENS, FEELINGS } from '../shared/constants.js';

const rng = () => makeRng(4);
function baby(days = 0, tweak, id = 'actions2-fixture') {
  const g = createGame({ userId: 'u', babyName: 'Sol', sex: 'boy', ...(id ? { id } : {}) });
  ensureStory(g);
  if (days > 0) { g.sim.time = days * DAY; g.baby.state.dayIndex = Math.floor(days); }
  // wake and settle so age gates rather than sleep gates decide the outcome
  Object.assign(g.baby.state, { activity: 'awake', awakeSince: g.sim.time, sleepSince: null, cryingSince: null });
  for (const k of Object.keys(g.baby.needs)) g.baby.needs[k] = 70;
  for (const k of Object.keys(g.baby.dev)) g.baby.dev[k] = Math.min(95, 5 + days / 20);
  if (tweak) tweak(g);
  return g;
}

test('every extra action is reachable through applyAction and never throws', () => {
  const ages = [0, 120, 260, 400, 700, 1100, 1500];
  let okCount = 0;
  for (const id of EXTRA_ACTION_IDS) {
    for (const days of ages) {
      const g = baby(days, (x) => {
        Object.assign(x.inventory, { formula: 9, bottlesClean: 4, wipes: 99, purees: 9, snacks: 9, whole_milk: 9, toddler_meals: 9, sunscreen: 2, nail_clippers: 1, stroller: 1, carrier: 1, plants: 1, broom: 1 });
        x.inventory.toys = ['rattle', 'board_books', 'blocks', 'shape_sorter', 'bath_toys', 'stacking_cups'];
      });
      let r;
      assert.doesNotThrow(() => { r = applyAction(g, id, { word: 'mama', id: ALLERGENS[0].id, feeling: FEELINGS[0], minutes: 10 }, rng()); }, `${id} @ ${days}d threw`);
      assert.equal(typeof r.ok, 'boolean', `${id} must return { ok }`);
      assert.equal(typeof r.message, 'string', `${id} must return a message`);
      assert.ok(r.message.length > 0, `${id} message must not be empty`);
      if (r.ok) okCount++;
    }
  }
  assert.ok(okCount > EXTRA_ACTION_IDS.length, `most actions should succeed at some age, only ${okCount} did`);
});

test('age gates refuse politely instead of corrupting state', () => {
  const g = baby(3);
  const snapshot = JSON.stringify(g.baby.dev);
  for (const id of ['count_together', 'sing_abcs', 'read_dialogic', 'cook_together', 'sweep', 'table_manners']) {
    const r = applyAction(g, id, {}, rng());
    assert.equal(r.ok, false, `${id} must be refused for a 3-day-old`);
    assert.match(r.message, /young|wait|month|year/i, `${id} should explain why: ${r.message}`);
  }
  assert.equal(JSON.stringify(g.baby.dev), snapshot, 'a refused action changes nothing');
});

test('teaching a word builds a real vocabulary that the view exposes', () => {
  // Words only become "known" from about ten months, and only from the tiers the child has reached.
  const word = WORDS_BY_AGE[0].words[0];
  const g = baby(400);
  let learned = false;
  for (let i = 0; i < 60 && !learned; i++) {
    const r = applyAction(g, 'teach_word', { word }, makeRng(i + 1));
    assert.ok(r.ok || /advanced|young|asleep/i.test(r.message), `unexpected refusal: ${r.message}`);
    advance(g, 40 * 60);
    Object.assign(g.baby.state, { activity: 'awake', cryingSince: null });
    learned = (g.baby.vocabulary || []).some((w) => w.word === word && w.known);
  }
  assert.ok((g.baby.vocabulary || []).length > 0, 'repetition records the word');
  assert.ok(learned, 'enough repetition makes a word stick');
  const v = gameView(g);
  assert.ok(Array.isArray(v.baby.vocabulary) && v.baby.vocabulary.some((w) => w.word === word), 'the view exposes vocabulary');
});

test('a word above the child\'s tier is refused until they are old enough', () => {
  const advanced = WORDS_BY_AGE[WORDS_BY_AGE.length - 1].words[0];
  const young = baby(400);
  assert.equal(applyAction(young, 'teach_word', { word: advanced }, rng()).ok, false, 'too advanced for a one-year-old');
  const older = baby(1000);
  assert.equal(applyAction(older, 'teach_word', { word: advanced }, rng()).ok, true, 'fine once they are nearly three');
});

test('an unknown word or allergen is rejected, not invented', () => {
  const g = baby(400);
  assert.equal(applyAction(g, 'teach_word', { word: 'xyzzy' }, rng()).ok, false);
  assert.equal(applyAction(g, 'introduce_allergen', { id: 'plutonium' }, rng()).ok, false);
  assert.equal(applyAction(g, 'name_feeling', { feeling: 'quantum' }, rng()).ok, false);
});

test('allergen introduction needs solids first, then spacing, and can reveal a real allergy', () => {
  const a = ALLERGENS[0];
  const noSolids = baby(220, (x) => { x.inventory.purees = 20; x.baby.state.lastSolidsAt = null; });
  const r0 = applyAction(noSolids, 'introduce_allergen', { id: a.id }, rng());
  assert.equal(r0.ok, false, 'allergens come after regular solids, not before');
  assert.match(r0.message, /solids/i);

  const spaced = baby(220, (x) => { x.inventory.purees = 20; x.baby.state.lastSolidsAt = x.sim.time - HOUR; });
  assert.equal(applyAction(spaced, 'introduce_allergen', { id: a.id }, rng()).ok, true);
  assert.equal(applyAction(spaced, 'introduce_allergen', { id: a.id }, rng()).ok, false, 'two in a row is refused — go gradually');

  let sawReaction = false, sawTolerance = false;
  for (let seed = 1; seed <= 60 && !(sawReaction && sawTolerance); seed++) {
    const g = baby(500, (x) => { x.inventory.purees = 20; x.baby.state.lastSolidsAt = x.sim.time - HOUR; }, `allergy-${seed}`);
    for (let i = 0; i < 5; i++) {
      applyAction(g, 'introduce_allergen', { id: a.id }, makeRng(seed * 31 + i));
      g.sim.time += 3 * DAY;
      Object.assign(g.baby.state, { activity: 'awake', cryingSince: null });
      g.baby.illness = null; g.baby.state.x.reaction = null;
    }
    const rec = (g.baby.allergens || {})[a.id];
    assert.ok(rec && rec.exposures > 0, 'every introduction is recorded');
    if (rec.status === 'allergic') sawReaction = true;
    if (rec.status === 'tolerated') sawTolerance = true;
  }
  assert.ok(sawReaction, 'over many babies at least one is actually allergic');
  assert.ok(sawTolerance, 'and most build tolerance through repeated safe exposure');
});

test('gentle discipline and harsh discipline pull trust in opposite directions', () => {
  const kind = baby(700), cruel = baby(700);
  for (const g of [kind, cruel]) g.baby.emo.trust = 60;
  applyAction(kind, 'praise', {}, rng());
  applyAction(kind, 'gentle_correction', {}, rng());
  applyAction(kind, 'time_in', {}, rng());
  applyAction(cruel, 'harsh', {}, rng());
  assert.ok(kind.baby.emo.trust >= 60, `calm discipline must not cost trust, got ${kind.baby.emo.trust}`);
  assert.ok(cruel.baby.emo.trust < 60, `harsh discipline must cost trust, got ${cruel.baby.emo.trust}`);
  assert.ok(cruel.baby.emo.stress > kind.baby.emo.stress, 'harshness is the more stressful of the two');
});

test('repeating the same interaction all day gives less and less', () => {
  const g = baby(300);
  const first = [];
  for (let i = 0; i < 10; i++) {
    g.baby.needs.stimulation = 40;
    const before = g.baby.dev.social;
    applyAction(g, 'peekaboo', {}, makeRng(i + 1));
    first.push(g.baby.dev.social - before);
  }
  const early = first.slice(0, 2).reduce((a, x) => a + x, 0);
  const late = first.slice(-2).reduce((a, x) => a + x, 0);
  assert.ok(early > 0, 'the first rounds of play teach something');
  assert.ok(late < early, `the tenth round of the same game must be worth less (${early} -> ${late})`);
});

test('care actions respect sleep: some are for a sleeping baby, some are not', () => {
  const g = baby(200);
  Object.assign(g.baby.state, { activity: 'sleeping', sleepSince: g.sim.time });
  assert.equal(applyAction(g, 'night_check', {}, rng()).ok, true, 'a quiet night check is exactly for a sleeping baby');
  assert.equal(applyAction(g, 'blocks_together', {}, rng()).ok, false, 'you cannot build a tower with a sleeping baby');
  assert.equal(g.baby.state.activity, 'sleeping', 'a refused action must not wake them');
});

test('observing only reports — the one state change is that you were there', () => {
  const g = baby(500);
  g.baby.state.lastInteractionAt = -1;
  const before = JSON.stringify({ n: g.baby.needs, e: g.baby.emo, d: g.baby.dev });
  const r = applyAction(g, 'observe', {}, rng());
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.detail.lines) && r.detail.lines.length >= 5, 'watching produces a real head-to-toe description');
  assert.ok(r.detail.lines.every((l) => typeof l === 'string' && l.length > 10));
  assert.ok(Array.isArray(r.detail.flags), 'and a list of things that should worry you');
  const after = JSON.stringify({ n: g.baby.needs, e: g.baby.emo, d: g.baby.dev });
  assert.equal(after, before, 'needs, emotions and development are untouched');
  assert.equal(g.baby.state.lastInteractionAt, g.sim.time, 'being watched still counts as attention');
});

test('actions are refused once the game is over', () => {
  const g = baby(300);
  g.status = 'dead'; g.death = { text: 'test', ageDays: ageDays(g) };
  for (const id of ['peekaboo', 'teach_word', 'night_check', 'harsh']) {
    assert.equal(applyAction(g, id, { word: 'mama' }, rng()).ok, false, `${id} must be refused after death`);
  }
});
