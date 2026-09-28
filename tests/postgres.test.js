// The Postgres store, against a real database. This is the path Railway uses, so it is worth
// exercising for real rather than trusting that it matches the file store by inspection.
//
// Skipped unless TEST_DATABASE_URL points at a Postgres the test may create and drop tables in:
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cradle npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresStore } from '../server/db/postgres.js';
import { createFileStore } from '../server/db/filestore.js';
import { GameManager } from '../server/game_manager.js';
import { createGame } from '../server/sim/state.js';
import { advance } from '../server/sim/engine.js';
import { applyAction } from '../server/sim/actions.js';
import { DAY, HOUR } from '../shared/constants.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.env.TEST_DATABASE_URL;
const skip = URL ? false : 'set TEST_DATABASE_URL to run the Postgres store tests';

async function withStore(fn) {
  const store = await createPostgresStore(URL);
  const made = [];
  const user = { id: randomUUID(), username: `t_${randomUUID().slice(0, 8)}`, passwordHash: 'x' };
  await store.createUser(user);
  try {
    return await fn(store, user, made);
  } finally {
    for (const id of made) await store.deleteGame(id).catch(() => {});
    await store.pool.query('DELETE FROM users WHERE id=$1', [user.id]).catch(() => {});
    await store.close();
  }
}

test('the schema applies and a user round-trips', { skip }, async () => {
  await withStore(async (store, user) => {
    const back = await store.getUserByName(user.username.toUpperCase());
    assert.ok(back, 'usernames are matched case-insensitively');
    assert.equal(back.id, user.id);
    assert.equal(back.passwordHash, 'x');
    assert.equal((await store.getUser(user.id)).username, user.username);
    assert.equal(await store.getUserByName('definitely-nobody'), null);
  });
});

test('a whole game round-trips through JSONB with no loss', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Pg', sex: 'girl' });
    made.push(g.id);
    advance(g, 3 * DAY);
    applyAction(g, 'hold', {});
    await store.saveGame(g);
    const back = await store.getGame(g.id);
    // JSONB is not a string round trip: key order and number formatting can change, so compare the
    // parsed structures rather than the serialised text.
    assert.deepEqual(back, JSON.parse(JSON.stringify(g)), 'nothing is lost or coerced by JSONB');
    assert.ok(back.story && back.social, 'the story and social layers survive');
    assert.equal(typeof back.sim.time, 'number');
    assert.ok(back.journal.length > 0);
  });
});

test('saving the same game twice updates in place', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Twice', sex: 'boy' });
    made.push(g.id);
    await store.saveGame(g);
    advance(g, 6 * HOUR);
    g.status = 'active';
    await store.saveGame(g);
    const r = await store.pool.query('SELECT count(*)::int AS n, max(sim_time) AS t FROM games WHERE id=$1', [g.id]);
    assert.equal(r.rows[0].n, 1, 'one row per game, not one per save');
    assert.ok(Math.abs(Number(r.rows[0].t) - g.sim.time) < 1, 'the indexed columns track the state');
  });
});

test('listing games is scoped to the user and ordered newest first', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const a = createGame({ userId: user.id, babyName: 'A', sex: 'girl' });
    const b = createGame({ userId: user.id, babyName: 'B', sex: 'boy' });
    const other = { id: randomUUID(), username: `t_${randomUUID().slice(0, 8)}`, passwordHash: 'x' };
    await store.createUser(other);
    const c = createGame({ userId: other.id, babyName: 'C', sex: 'girl' });
    made.push(a.id, b.id, c.id);
    a.createdAt = Date.now() - 60000;
    for (const g of [a, b, c]) await store.saveGame(g);
    const mine = await store.listGames(user.id);
    assert.deepEqual(mine.map((x) => x.babyName).sort(), ['A', 'B'], 'only my babies');
    assert.ok(mine.every((x) => typeof x.simTime === 'number' && typeof x.lastTickAt === 'number'), 'numeric columns come back as numbers, not strings');
    const active = await store.listActiveGames();
    assert.ok(active.includes(a.id) && active.includes(b.id));
    await store.pool.query('DELETE FROM users WHERE id=$1', [other.id]);
  });
});

test('deleting a game cascades to its events and chat', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Gone', sex: 'boy' });
    made.push(g.id);
    await store.saveGame(g);
    await store.appendEvents(g.id, [{ t: 1, type: 'feed', sev: 'info', text: 'fed' }]);
    await store.appendChat(g.id, { role: 'parent', content: 'hi', tone: 'gentle', t: 1 });
    await store.deleteGame(g.id);
    assert.equal(await store.getGame(g.id), null);
    const ev = await store.pool.query('SELECT count(*)::int AS n FROM events WHERE game_id=$1', [g.id]);
    const ch = await store.pool.query('SELECT count(*)::int AS n FROM chat_messages WHERE game_id=$1', [g.id]);
    assert.equal(ev.rows[0].n, 0, 'events cascade');
    assert.equal(ch.rows[0].n, 0, 'chat cascades');
  });
});

test('events append in batches, come back in order, and are pruned', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Ev', sex: 'girl' });
    made.push(g.id);
    await store.saveGame(g);
    const batch = [...Array(120)].map((_, i) => ({ t: i, type: 'story', sev: i % 7 === 0 ? 'good' : 'info', text: `beat ${i}` }));
    await store.appendEvents(g.id, batch);
    const back = await store.listEvents(g.id, 500);
    assert.equal(back.length, 120);
    assert.equal(back[0].text, 'beat 0', 'oldest first');
    assert.equal(back[119].text, 'beat 119', 'newest last');
    assert.equal(back[7].sev, 'good', 'severity survives');
    // The prune runs every 50 batches; drive it and check the cap is enforced for this game only.
    for (let i = 0; i < 50; i++) await store.appendEvents(g.id, [{ t: 1000 + i, type: 'feed', sev: 'info', text: `f${i}` }]);
    const n = await store.pool.query('SELECT count(*)::int AS n FROM events WHERE game_id=$1', [g.id]);
    assert.ok(n.rows[0].n <= Number(process.env.PG_EVENTS_PER_GAME || 4000), 'history stays bounded');
    assert.ok(n.rows[0].n > 0, 'but is not wiped');
  });
});

test('a long type or an oversized chat message is truncated, not rejected', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Big', sex: 'boy' });
    made.push(g.id);
    await store.saveGame(g);
    await store.appendEvents(g.id, [{ t: 1, type: 'x'.repeat(400), sev: 'info', text: 'long type' }]);
    await store.appendChat(g.id, { role: 'parent', content: 'y'.repeat(9000), tone: 'gentle', t: 1 });
    const chat = await store.listChat(g.id);
    assert.equal(chat.length, 1);
    assert.ok(chat[0].content.length <= 4000, 'chat is clamped before it reaches the database');
  });
});

test('chat history round-trips per game in order', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const g = createGame({ userId: user.id, babyName: 'Chat', sex: 'girl' });
    const h = createGame({ userId: user.id, babyName: 'Other', sex: 'boy' });
    made.push(g.id, h.id);
    await store.saveGame(g); await store.saveGame(h);
    await store.appendChat(g.id, { role: 'parent', content: 'hello little one', tone: 'gentle', t: 1 });
    await store.appendChat(g.id, { role: 'baby', content: '*coos*', tone: null, t: 2 });
    await store.appendChat(h.id, { role: 'parent', content: 'different baby', tone: 'neutral', t: 1 });
    const mine = await store.listChat(g.id);
    assert.deepEqual(mine.map((m) => m.role), ['parent', 'baby'], 'oldest first');
    assert.equal(mine[0].content, 'hello little one');
    assert.equal(mine[1].tone, null, 'a missing tone stays null rather than becoming "null"');
    assert.equal((await store.listChat(h.id)).length, 1, 'histories do not leak between games');
  });
});

test('playdate updates only touch allow-listed columns', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const host = createGame({ userId: user.id, babyName: 'Host', sex: 'girl' });
    const guest = createGame({ userId: user.id, babyName: 'Guest', sex: 'boy' });
    made.push(host.id, guest.id);
    await store.saveGame(host); await store.saveGame(guest);
    const code = randomUUID().slice(0, 6).toUpperCase();
    await store.createPlaydate(code, host.id);
    await store.updatePlaydate(code, { guest_game_id: guest.id, status: 'joined', host_game_id: 'hacked', nonsense: 1 });
    const pd = await store.getPlaydate(code);
    assert.equal(pd.guest_game_id, guest.id);
    assert.equal(pd.status, 'joined');
    assert.equal(pd.host_game_id, host.id, 'a column outside the allow-list is ignored');
    await store.updatePlaydate(code, { nonsense: 1 });
    assert.equal((await store.getPlaydate(code)).status, 'joined', 'an all-ignored update is a no-op, not an error');
  });
});

test('the game manager runs end to end on Postgres, including offline catch-up', { skip }, async () => {
  await withStore(async (store, user, made) => {
    const gm = new GameManager(store);
    try {
      const g = await gm.create(user.id, { babyName: 'Railway', sex: 'girl' });
      made.push(g.id);
      const r = await gm.act(g.id, 'hold', {});
      assert.equal(r.ok, true, r.message);
      await gm.persist(gm.games.get(g.id), [], true);

      // Drop it from memory the way a restart or a redeploy would, then load it back.
      gm.games.delete(g.id);
      const stored = await store.getGame(g.id);
      stored.lastTickAt = Date.now() - 5 * 3600 * 1000;
      await store.saveGame(stored);
      const back = await gm.load(g.id);
      assert.ok(back.sim.time / HOUR > 9, `10 sim hours after 5 real hours away, got ${(back.sim.time / HOUR).toFixed(1)}`);
      assert.ok(back.awaySummary, 'the welcome-back summary is built');
      assert.ok((await store.listEvents(g.id, 500)).length > 0, 'events were written along the way');
    } finally { await gm.shutdown(); }
  });
});

test('the Postgres and file stores present the same interface', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cradle-parity-'));
  const file = await createFileStore(dir);
  await withStore(async (store) => {
    const skipKeys = new Set(['kind', 'pool']);
    const pgKeys = Object.keys(store).filter((k) => !skipKeys.has(k)).sort();
    const fileKeys = Object.keys(file).filter((k) => !skipKeys.has(k)).sort();
    assert.deepEqual(pgKeys, fileKeys, 'the two stores must stay swappable');
    for (const k of pgKeys) assert.equal(typeof store[k], typeof file[k], `${k} differs in type`);
  });
  await file.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
