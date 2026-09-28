// Session-to-session continuity: the baby must keep living across restarts, the story must not reset,
// and everything the simulation accumulated must survive a JSON round trip through the store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from '../server/db/filestore.js';
import { GameManager } from '../server/game_manager.js';
import { advance } from '../server/sim/engine.js';
import { applyAction } from '../server/sim/actions.js';
import { gameView } from '../server/sim/view.js';
import { DAY, HOUR, TIME } from '../shared/constants.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cradle-persist-'));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('a game survives a full serialise/deserialise round trip with no loss', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Nova', sex: 'girl' });
    advance(g, 2 * DAY);
    applyAction(g, 'hold', {});
    applyAction(g, 'cuddle', {});
    await store.saveGame(g);
    const back = await store.getGame(g.id);
    // Every own key must come back, and the values must be structurally identical.
    assert.deepEqual(Object.keys(back).sort(), Object.keys(JSON.parse(JSON.stringify(g))).sort());
    assert.deepEqual(back, JSON.parse(JSON.stringify(g)));
    // And the view must still build from the reloaded object (no class instances or functions lost).
    const v = gameView(back);
    assert.equal(v.baby.name, 'Nova');
    assert.ok(v.sim.days > 1.9);
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('three separate sessions accumulate one continuous life', async () => {
  const { dir, cleanup } = tmpStore();
  let store = await createFileStore(dir);
  let gm = new GameManager(store);
  let id, ageAfterFirst, journalAfterFirst;
  try {
    const g = await gm.create('u1', { babyName: 'Kai', sex: 'boy' });
    id = g.id;
    advance(g, 6 * HOUR);
    applyAction(g, 'feed', { type: 'formula' });
    ageAfterFirst = g.sim.time;
    journalAfterFirst = g.journal.length;
    await store.saveGame(g);
  } finally { await gm.shutdown(); await store.close(); }

  // Session 2: a fresh process reopens the same data directory after 3 real hours away.
  store = await createFileStore(dir);
  gm = new GameManager(store);
  let ageAfterSecond;
  try {
    const raw = await store.getGame(id);
    raw.lastTickAt = Date.now() - 3 * 3600 * 1000;
    await store.saveGame(raw);
    const g = await gm.load(id);
    assert.ok(g, 'the game reloads in a new process');
    assert.ok(g.sim.time > ageAfterFirst, 'time advanced while the player was away');
    assert.ok(g.journal.length >= journalAfterFirst, 'the journal was not reset');
    assert.ok(g.awaySummary, 'an away summary was produced');
    ageAfterSecond = g.sim.time;
    await store.saveGame(g);
  } finally { await gm.shutdown(); await store.close(); }

  // Session 3: continuity again, and identity is preserved.
  store = await createFileStore(dir);
  gm = new GameManager(store);
  try {
    const g = await gm.load(id);
    assert.equal(g.baby.name, 'Kai');
    assert.ok(g.sim.time >= ageAfterSecond, 'age never goes backwards across sessions');
    assert.equal(g.id, id);
    const games = await store.listGames('u1');
    assert.equal(games.length, 1);
    assert.equal(games[0].id, id);
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('the saved state stays a reasonable size after a long life', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Iris', sex: 'girl' });
    // Simulate 120 baby-days of a cared-for child so the journal, story and notifications all fill up.
    for (let d = 0; d < 120 && g.status === 'active'; d++) {
      const inv = g.inventory;
      g.parent.babysitterUntil = g.sim.time + 2 * DAY;
      Object.assign(inv, { formula: 99, bottles: 6, bottlesClean: 6, wipes: 999, purees: 99 });
      inv.diapers[g.baby.wear.neededDiaper || 'N'] = 99;
      g.baby.needs.health = Math.max(g.baby.needs.health, 85);
      advance(g, DAY);
    }
    await store.saveGame(g);
    const bytes = JSON.stringify(await store.getGame(g.id)).length;
    assert.ok(bytes < 1_500_000, `state should stay under 1.5 MB, got ${(bytes / 1024).toFixed(0)} KB`);
    // The journal compacts in batches (400 kept + 60 slack) rather than on every single entry.
    assert.ok(g.journal.length <= 460, `the journal stays capped, got ${g.journal.length}`);
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('event and chat history persist per game and are isolated between games', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const a = await gm.create('u1', { babyName: 'A', sex: 'girl' });
    const b = await gm.create('u1', { babyName: 'B', sex: 'boy' });
    await store.appendEvents(a.id, [{ t: 1, type: 'feed', sev: 'good', text: 'fed A' }]);
    await store.appendEvents(b.id, [{ t: 2, type: 'cry_start', sev: 'warn', text: 'B cried' }]);
    await store.appendChat(a.id, { role: 'parent', content: 'hello A', tone: 'gentle', t: 1 });
    const ea = await store.listEvents(a.id), eb = await store.listEvents(b.id);
    assert.equal(ea.length, 1); assert.equal(eb.length, 1);
    assert.equal(ea[0].text, 'fed A');
    assert.equal((await store.listChat(a.id)).length, 1);
    assert.equal((await store.listChat(b.id)).length, 0);
    await store.deleteGame(b.id);
    assert.equal(await store.getGame(b.id), null);
    assert.ok(await store.getGame(a.id), 'deleting one game leaves the other intact');
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('a long absence is covered by a carer instead of being thrown away', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Odell', sex: 'boy', id: 'carer-absence' });
    // Give the carer something to work with — they feed and change from the player's own supplies.
    Object.assign(g.inventory, { formula: 400, bottles: 6, bottlesClean: 6, wipes: 2000, purees: 200 });
    g.inventory.diapers.N = 400; g.inventory.diapers['1'] = 400; g.inventory.diapers['2'] = 400;
    advance(g, 6 * HOUR);
    const before = g.sim.time;
    await store.saveGame(g);
    gm.games.delete(g.id);

    // Pretend the player vanished for four real days (8 sim days at OFFLINE_SCALE 2).
    const stored = await store.getGame(g.id);
    stored.lastTickAt = Date.now() - 4 * 24 * 3600 * 1000;
    await store.saveGame(stored);

    const back = await gm.load(g.id);
    const grew = (back.sim.time - before) / DAY;
    assert.ok(grew > 3, `the arc keeps building while away, only advanced ${grew.toFixed(2)} days`);
    assert.ok(grew <= (TIME.OFFLINE_CAP + TIME.OFFLINE_CARE_CAP) / DAY + 0.01, `capped per absence, got ${grew.toFixed(2)} days`);
    assert.ok(back.awaySummary.carer, 'the player is told who covered for them');
    assert.ok(back.journal.some((e) => e.type === 'sitter'), 'the stand-in is journalled');
    assert.ok(back.story.chapters.length >= 1, 'chapters were written while the player was gone');
    // Eight days is long enough that a stand-in who only feeds and changes can still lose a baby —
    // that is the mechanic, not a bug — so only demand the rest of it from one who survived.
    if (back.status === 'active') {
      // Fed and dry, but nobody held him: affection is the thing a carer cannot supply.
      assert.ok(back.baby.needs.affection < 45, `affection should suffer while away, got ${back.baby.needs.affection.toFixed(0)}`);
    } else {
      assert.ok(back.death && back.death.text, 'and if it ends badly, the game says exactly how');
    }
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('a short absence still runs with nobody in the house', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Wren', sex: 'girl' });
    await store.saveGame(g);
    gm.games.delete(g.id);
    const stored = await store.getGame(g.id);
    stored.lastTickAt = Date.now() - 3 * 3600 * 1000; // 3 real hours -> 6 sim hours, under the cap
    await store.saveGame(stored);
    const back = await gm.load(g.id);
    assert.ok(back.sim.time / HOUR > 5 && back.sim.time / HOUR < 7, `6 sim hours, got ${(back.sim.time / HOUR).toFixed(1)}`);
    assert.ok(!back.journal.some((e) => e.type === 'sitter'), 'nobody steps in for a short absence');
    assert.ok(!back.awaySummary.carer);
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('a failed save is retried, never recorded as success, and never loses the game', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Flaky', sex: 'girl', id: 'flaky-1' });
    const entry = gm.games.get(g.id);
    const realSave = store.saveGame.bind(store);
    let fails = 0;
    store.saveGame = async (game) => { fails++; throw new Error('database is down'); };

    await gm.act(g.id, 'hold', {});
    assert.ok(fails > 0, 'a save was attempted');
    assert.equal(entry.dirty, true, 'the game is still marked unsaved');
    assert.ok(entry.saveFails >= 1, 'the failure is counted');
    const savedAt = entry.lastSave;

    await gm.act(g.id, 'cuddle', {});
    assert.equal(entry.lastSave, savedAt, 'a failed write never advances lastSave');
    assert.equal(entry.dirty, true);

    // Eviction must not drop a game that has not been written yet.
    entry.subscribers.clear();
    entry.lastTouch = Date.now() - 10 * 60 * 1000;
    await gm.tick();
    assert.ok(gm.games.has(g.id), 'an unsaved game is kept in memory rather than discarded');

    // Once the database comes back, the next save lands and the flags clear.
    store.saveGame = realSave;
    await gm.persist(entry, [], true);
    assert.equal(entry.dirty, false, 'the retry succeeded');
    assert.equal(entry.saveFails, 0, 'the failure counter resets');
    assert.ok(entry.lastSave > 0);
    const back = await store.getGame(g.id);
    assert.ok(back && back.baby.name === 'Flaky', 'and everything that happened while it was down is in the save');
    assert.ok(back.journal.some((e) => e.type === 'cuddle' || e.type === 'hold'), 'including the actions taken during the outage');
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});

test('one game failing to save does not stop the others from ticking', async () => {
  const { dir, cleanup } = tmpStore();
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const bad = await gm.create('u1', { babyName: 'Bad', sex: 'girl', id: 'bad-1' });
    const good = await gm.create('u1', { babyName: 'Good', sex: 'boy', id: 'good-1' });
    // Both need a subscriber for tickOne to advance them.
    const fakeWs = { readyState: 1, send() {} };
    for (const id of [bad.id, good.id]) {
      const e = gm.games.get(id);
      e.subscribers.add(fakeWs);
      e.game.lastTickAt = Date.now() - 5000;
      e.lastSave = Date.now() - 60000; // past the 15s save interval, so the tick will try to write
    }
    store.saveGame = async (g) => { if (g.id === bad.id) throw new Error('only this one is broken'); };
    const before = good.sim.time;
    await gm.tick();
    assert.ok(good.sim.time > before, 'the healthy game still advanced');
    assert.ok(gm.games.get(bad.id).saveFails >= 1, 'and the broken one recorded its failure');
    assert.equal(gm.games.get(bad.id).dirty, true, 'the broken one is still marked unsaved');
    assert.equal(gm.games.get(good.id).dirty, false, 'the healthy one saved cleanly');
  } finally { await gm.shutdown(); await store.close(); cleanup(); }
});
