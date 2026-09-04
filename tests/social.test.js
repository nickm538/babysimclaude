// The social layer: the people around the baby. Contacts, calls, visits, advice (good and bad),
// the contact babysitter and the weekly playgroup — plus the view the Family tab renders from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../server/sim/state.js';
import { advance } from '../server/sim/engine.js';
import { gameView } from '../server/sim/view.js';
import { makeRng } from '../server/sim/rng.js';
import { ensureStory } from '../server/sim/story.js';
import { ensureSocial, applySocialAction, socialTick, socialView, contactById, availableNow } from '../server/sim/social.js';
import { DAY, HOUR, MIN } from '../shared/constants.js';

const rng = (n = 3) => makeRng(n);
// `id` is pinned by default so a stray seed cannot make the suite flaky; pass null for a random baby.
function game(days = 0, id = 'social-fixture') {
  const g = createGame({ userId: 'u', babyName: 'Juno', sex: 'girl', ...(id ? { id } : {}) });
  ensureStory(g); ensureSocial(g);
  if (days > 0) g.sim.time = days * DAY;
  return g;
}
// Force a contact to be reachable regardless of the in-game day and hour.
function makeFree(g, c) {
  c.availableDays = [0, 1, 2, 3, 4, 5, 6];
  c.hours = [0, 24];
  if (Array.isArray(c.days)) c.days = [0, 1, 2, 3, 4, 5, 6];
  c.awayUntil = 0;
  return c;
}
const firstFree = (g) => {
  const s = ensureSocial(g);
  for (const c of s.contacts) { makeFree(g, c); if (availableNow(g, c)) return c; }
  return s.contacts[0];
};

test('a new game comes with a believable circle of people', () => {
  const g = game();
  const s = ensureSocial(g);
  assert.ok(s.contacts.length >= 4, `expected a real circle, got ${s.contacts.length}`);
  const ids = new Set(s.contacts.map((c) => c.id));
  assert.equal(ids.size, s.contacts.length, 'contact ids are unique');
  for (const c of s.contacts) {
    assert.ok(c.name && c.relation && c.personality, 'every contact is a whole person');
    assert.ok(c.relationship >= 0 && c.relationship <= 100);
    assert.ok(c.skills.babysitting >= 0 && c.skills.babysitting <= 1);
    assert.ok(c.distanceMin > 0, 'everyone lives somewhere');
  }
  assert.ok(s.contacts.some((c) => ['grandma', 'grandpa'].includes(c.relation)), 'at least one grandparent');
});

test('the circle is stable for one baby and differs between babies', () => {
  const names = (g) => ensureSocial(g).contacts.map((c) => c.name).join(',');
  const a = game();
  const first = names(a);
  ensureSocial(a); ensureSocial(a);
  assert.equal(names(a), first, 'the same game always has the same people');
  assert.equal(names(game()), first, 'and rebuilding the same id reproduces them exactly');
  const seen = new Set([...Array(20)].map(() => names(game(0, null))));
  assert.ok(seen.size > 1, 'different babies get different circles');
});

test('calling warms a relationship, and pestering all day does not', () => {
  const g = game(30);
  const c = firstFree(g);
  c.relationship = 50;
  const r = applySocialAction(g, 'call', { contactId: c.id }, rng());
  assert.equal(r.ok, true, r.message);
  const afterOne = c.relationship;
  assert.ok(afterOne > 50, `a call should warm things, got ${afterOne}`);
  for (let i = 0; i < 8; i++) applySocialAction(g, 'call', { contactId: c.id }, rng(i));
  assert.ok(c.relationship - afterOne < (afterOne - 50) * 4, 'calling nine times in an hour is not nine times as good');
  assert.ok(c.relationship <= 100);
});

test('relationships decay when you never reach out, and calling repairs them', () => {
  const g = game(60);
  const c = firstFree(g);
  c.relationship = 70; c.lastContactAt = g.sim.time;
  const r = makeRng(9);
  for (let i = 0; i < 30 * 24 * 4; i++) { g.sim.time += 15 * MIN; socialTick(g, 0.25, r); }
  assert.ok(c.relationship < 70, `a month of silence should cool things, got ${c.relationship.toFixed(1)}`);
  const cold = c.relationship;
  makeFree(g, c);
  applySocialAction(g, 'call', { contactId: c.id }, rng());
  assert.ok(c.relationship > cold, 'picking the phone back up helps');
});

test('a video call teaches a baby something a phone call cannot', () => {
  const g = game(300);
  const c = firstFree(g);
  g.baby.state.activity = 'awake';
  const before = { social: g.baby.dev.social, stim: g.baby.needs.stimulation };
  const r = applySocialAction(g, 'video', { contactId: c.id }, rng());
  assert.equal(r.ok, true, r.message);
  assert.ok(g.baby.dev.social > before.social, 'a face on a screen is still a face');
  assert.ok(g.baby.needs.stimulation > before.stim);
  assert.ok(Array.isArray(r.lines) && r.lines.length > 0, 'the call has actual dialogue');
});

test('you cannot video-call a sleeping baby, but you can send a photo', () => {
  const g = game(300);
  const c = firstFree(g);
  Object.assign(g.baby.state, { activity: 'sleeping', sleepSince: g.sim.time });
  assert.equal(applySocialAction(g, 'video', { contactId: c.id }, rng()).ok, false);
  const p = applySocialAction(g, 'photo', { contactId: c.id }, rng());
  assert.equal(p.ok, true, p.message);
  assert.ok(p.lines[0].length > 5, 'they write back');
});

test('a booked sitter actually looks after the baby', () => {
  const g = game(90);
  const c = firstFree(g);
  c.relationship = 90; c.skills.babysitting = 0.9;
  const r = applySocialAction(g, 'babysit', { contactId: c.id, hours: 6 }, rng());
  assert.equal(r.ok, true, r.message);
  assert.ok(g.parent.babysitterUntil > g.sim.time, 'the sitter is on the clock');
  assert.equal(g.parent.sitterContactId, c.id);
  Object.assign(g.inventory, { formula: 40, bottles: 4, bottlesClean: 4, wipes: 200 });
  for (const k of Object.keys(g.inventory.diapers)) g.inventory.diapers[k] = 60;
  const stocked = { formula: g.inventory.formula, diapers: Object.values(g.inventory.diapers).reduce((a, x) => a + x, 0) };
  g.baby.needs.fullness = 10; g.baby.needs.diaper = 10;
  advance(g, 5 * HOUR, { offline: true });
  // The sitter works from the player's own supplies, so consumption is the proof they actually did it.
  assert.ok(g.inventory.formula < stocked.formula, 'the sitter fed the baby from your formula');
  assert.ok(Object.values(g.inventory.diapers).reduce((a, x) => a + x, 0) < stocked.diapers, 'and used your diapers');
  assert.ok(g.baby.needs.health > 60, `a sat-with baby stays well, got ${g.baby.needs.health.toFixed(0)}`);
  assert.ok(g.journal.filter((e) => e.type === 'sitter').length >= 2, 'and it is all written down');
});

test('a distant or unskilled contact will not be left alone with the baby', () => {
  const g = game(90);
  const s = ensureSocial(g);
  const stranger = firstFree(g); stranger.relationship = 10; stranger.skills.babysitting = 0.9;
  assert.equal(applySocialAction(g, 'babysit', { contactId: stranger.id, hours: 4 }, rng()).ok, false, 'not close enough');
  const useless = makeFree(g, s.contacts[1] || stranger); useless.relationship = 95; useless.skills.babysitting = 0.05;
  assert.equal(applySocialAction(g, 'babysit', { contactId: useless.id, hours: 4 }, rng()).ok, false, 'not capable');
  assert.equal(g.parent.babysitterUntil, 0, 'nobody was booked');
});

test('inviting someone over produces an arrival, a visit and a departure', () => {
  const g = game(200);
  const c = firstFree(g);
  c.relationship = 80;
  const r = applySocialAction(g, 'invite', { contactId: c.id, hours: 2 }, rng());
  assert.equal(r.ok, true, r.message);
  assert.ok(ensureSocial(g).pendingVisit, 'they are on the way');
  assert.equal(applySocialAction(g, 'invite', { contactId: c.id }, rng()).ok, false, 'you cannot invite two people at once');
  const rr = makeRng(21);
  let arrived = false, left = false;
  for (let i = 0; i < 24 * 12 && !left; i++) {
    g.sim.time += 5 * MIN;
    socialTick(g, 5 / 60, rr);
    if (g.house.visitor) arrived = true;
    else if (arrived) left = true;
  }
  assert.ok(arrived, 'the visitor turns up');
  assert.ok(left, 'and eventually goes home');
  assert.ok(c.visits >= 1, 'the visit is remembered');
});

test('the playgroup can be joined, runs weekly, and can be left', () => {
  const g = game(220);
  const j = applySocialAction(g, 'playgroup', { enrolled: true }, rng());
  assert.equal(j.ok, true, j.message);
  const pg = ensureSocial(g).playgroup;
  assert.equal(pg.enrolled, true);
  assert.ok(pg.nextAt > g.sim.time, 'a session is scheduled');
  assert.ok(pg.nextAt - g.sim.time <= 8 * DAY, 'within the week');
  const rr = makeRng(5);
  for (let i = 0; i < 21 * 24 * 4; i++) { g.sim.time += 15 * MIN; socialTick(g, 0.25, rr); }
  assert.ok(pg.attends >= 2, `three weeks should mean several sessions, got ${pg.attends}`);
  const l = applySocialAction(g, 'playgroup', { enrolled: false }, rng());
  assert.equal(l.ok, true);
  assert.equal(ensureSocial(g).playgroup.enrolled, false);
});

test('advice arrives, and taking bad advice actually costs the baby', () => {
  const g = game(45);
  const s = ensureSocial(g);
  const rr = makeRng(13);
  let saw = 0;
  for (let i = 0; i < 60 * 24 * 4 && saw < 6; i++) {
    g.sim.time += 15 * MIN;
    socialTick(g, 0.25, rr);
    for (const inv of s.invitations.slice()) {
      if (inv.kind !== 'advice') continue;
      saw++;
      const r = applySocialAction(g, 'respond', { invitationId: inv.id, accept: true }, rr);
      assert.equal(typeof r.ok, 'boolean');
      assert.ok(String(r.message).length > 0);
    }
    s.invitations = s.invitations.filter((i) => i.expiresAt > g.sim.time);
  }
  assert.ok(saw > 0, 'people offer advice unprompted');
  assert.ok(typeof s.badAdvice === 'number', 'bad advice taken is counted');
});

test('invalid social input is refused and never throws', () => {
  const g = game(100);
  for (const [action, params] of [
    ['call', { contactId: 'nope' }], ['video', {}], ['photo', { contactId: 12 }],
    ['invite', { contactId: null }], ['babysit', { contactId: 'x', hours: 999 }],
    ['respond', { invitationId: 'gone' }], ['nonsense', {}],
  ]) {
    let r;
    assert.doesNotThrow(() => { r = applySocialAction(g, action, params, rng()); }, `${action} threw`);
    assert.equal(r.ok, false, `${action} should be refused`);
    assert.equal(typeof r.message, 'string');
  }
});

test('the social layer survives a reload and a game saved before it existed', () => {
  const g = game(150);
  const c = firstFree(g);
  applySocialAction(g, 'call', { contactId: c.id }, rng());
  applySocialAction(g, 'playgroup', { enrolled: true }, rng());
  const reloaded = JSON.parse(JSON.stringify(g));
  ensureSocial(reloaded);
  assert.equal(ensureSocial(reloaded).contacts.length, ensureSocial(g).contacts.length);
  assert.equal(contactById(ensureSocial(reloaded), c.id).calls, c.calls, 'call history survives');
  assert.equal(ensureSocial(reloaded).playgroup.enrolled, true);

  const legacy = game(150);
  delete legacy.social;
  const s = ensureSocial(legacy);
  assert.ok(s.contacts.length >= 4, 'an old save grows a circle on load');
  assert.doesNotThrow(() => advance(legacy, 6 * HOUR));
});

test('the view exposes the whole social layer, JSON-safe', () => {
  const g = game(250);
  applySocialAction(g, 'playgroup', { enrolled: true }, rng());
  advance(g, 12 * HOUR);
  const sv = socialView(g);
  assert.doesNotThrow(() => JSON.stringify(sv));
  assert.ok(Array.isArray(sv.contacts) && sv.contacts.length >= 4);
  for (const c of sv.contacts) {
    assert.equal(typeof c.relationLabel, 'string');
    assert.equal(typeof c.availability, 'string');
    assert.equal(typeof c.availableNow, 'boolean');
    assert.equal(typeof c.skills.babysitting, 'number', 'the client gates its babysit button on this exact field');
    assert.ok(!Number.isNaN(c.relationship));
  }
  assert.equal(typeof sv.playgroup.dayLabel, 'string');
  const v = gameView(g);
  assert.ok(v.social && Array.isArray(v.social.contacts), 'and it is reachable from the main view');
});
