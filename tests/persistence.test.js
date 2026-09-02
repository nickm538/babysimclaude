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
import { DAY, HOUR } from '../shared/constants.js';

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
    assert.ok(g.journal.length <= 400, 'the journal stays capped');
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
