import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileStore } from '../server/db/filestore.js';
import { GameManager } from '../server/game_manager.js';
import { TIME } from '../shared/constants.js';

test('offline catch-up simulates 2x real time, capped, and reports a summary', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cradle-test-'));
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Mia', sex: 'girl' });
    // pretend the player left 4 hours ago
    g.lastTickAt = Date.now() - 4 * 3600 * 1000;
    await store.saveGame(g);
    gm.games.delete(g.id);
    const loaded = await gm.load(g.id);
    assert.ok(Math.abs(loaded.sim.time - 8 * 3600) < 60, `expected ~8h of sim time, got ${loaded.sim.time}`);
    assert.ok(loaded.awaySummary && loaded.awaySummary.hours > 7.9);
    assert.ok(loaded.baby.needs.fullness < 40, 'baby should be hungry after 8 unattended hours');
    // a 3-day absence is capped
    loaded.lastTickAt = Date.now() - 72 * 3600 * 1000; loaded.sim.time = 0;
    await store.saveGame(loaded); gm.games.delete(g.id);
    const again = await gm.load(g.id);
    assert.ok(again.sim.time <= TIME.OFFLINE_CAP + 1);
  } finally {
    await gm.shutdown(); await store.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('actions through the manager persist and reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cradle-test-'));
  const store = await createFileStore(dir);
  const gm = new GameManager(store);
  try {
    const g = await gm.create('u1', { babyName: 'Sam', sex: 'boy' });
    const r = await gm.act(g.id, 'hold', {});
    assert.ok(r.ok);
    gm.games.delete(g.id);
    const loaded = await gm.load(g.id);
    assert.equal(loaded.baby.state.held, true);
    const o = await gm.order(g.id, [{ id: 'formula' }]);
    assert.ok(o.ok);
  } finally { await gm.shutdown(); await store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
