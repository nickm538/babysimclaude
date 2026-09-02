// Postgres store. Written for Railway: the database container often is not accepting connections yet
// when the web service boots, so connecting retries with backoff; idle-client errors are trapped so a
// dropped connection never takes the process down; and the events table is pruned so a five-year game
// cannot grow without bound.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONNECT_RETRIES = Number(process.env.PG_CONNECT_RETRIES || 10);
const STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000);
const EVENTS_PER_GAME = Number(process.env.PG_EVENTS_PER_GAME || 4000);
const WARN_STATE_BYTES = 2 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function createPostgresStore(url) {
  // SSL only when asked for: Railway's private network (postgres.railway.internal) does not use TLS.
  const useSsl = process.env.PGSSL === '1' || /sslmode=require/i.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 8),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    application_name: 'cradle',
  });
  // An idle client that errors (network blip, database restart) emits on the pool. Without a listener
  // Node treats it as an unhandled error event and exits.
  pool.on('error', (e) => console.error('[db] idle client error:', e.message));

  // Wait for the database to accept connections, then apply the schema (idempotent).
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  let lastErr = null;
  for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      await pool.query(schema);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const wait = Math.min(8000, 500 * Math.pow(2, attempt));
      console.warn(`[db] not ready (${e.message}); retrying in ${wait}ms (${attempt + 1}/${CONNECT_RETRIES})`);
      await sleep(wait);
    }
  }
  if (lastErr) { await pool.end().catch(() => {}); throw lastErr; }

  const q = (text, params) => pool.query(text, params);
  let pruneCounter = 0;

  return {
    kind: 'postgres',
    pool,

    async createUser(u) { await q('INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)', [u.id, u.username, u.passwordHash]); return u; },
    async getUserByName(username) { const r = await q('SELECT id, username, password_hash FROM users WHERE lower(username)=lower($1)', [username]); return r.rows[0] ? { id: r.rows[0].id, username: r.rows[0].username, passwordHash: r.rows[0].password_hash } : null; },
    async getUser(id) { const r = await q('SELECT id, username FROM users WHERE id=$1', [id]); return r.rows[0] || null; },

    async saveGame(g) {
      const state = JSON.stringify(g);
      if (state.length > WARN_STATE_BYTES && !g._sizeWarned) {
        g._sizeWarned = true;
        console.warn(`[db] game ${g.id} state is ${(state.length / 1048576).toFixed(2)} MB — check the journal/story/notification caps`);
      }
      await q(
        `INSERT INTO games (id, user_id, status, baby_name, sim_time, last_tick_at, state, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, baby_name=EXCLUDED.baby_name,
           sim_time=EXCLUDED.sim_time, last_tick_at=EXCLUDED.last_tick_at, state=EXCLUDED.state, updated_at=now()`,
        [g.id, g.userId, g.status, g.baby.name, g.sim.time, g.lastTickAt, state],
      );
    },
    async getGame(id) { const r = await q('SELECT state FROM games WHERE id=$1', [id]); return r.rows[0] ? r.rows[0].state : null; },
    async listGames(userId) {
      const r = await q('SELECT id, status, baby_name, sim_time, last_tick_at, created_at FROM games WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId]);
      return r.rows.map((x) => ({ id: x.id, status: x.status, babyName: x.baby_name, simTime: Number(x.sim_time), lastTickAt: Number(x.last_tick_at), createdAt: x.created_at }));
    },
    async listActiveGames() { const r = await q("SELECT id FROM games WHERE status='active'"); return r.rows.map((x) => x.id); },
    async deleteGame(id) { await q('DELETE FROM games WHERE id=$1', [id]); },

    async appendEvents(gameId, events) {
      if (!events.length) return;
      const vals = [], params = [];
      events.slice(0, 500).forEach((e, i) => {
        params.push(gameId, e.t, String(e.type).slice(0, 64), e.sev || 'info', JSON.stringify(e));
        vals.push(`($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`);
      });
      await q(`INSERT INTO events (game_id, sim_time, type, severity, payload) VALUES ${vals.join(',')}`, params);
      // Amortised pruning: every ~50 batches, trim this game's history to the newest EVENTS_PER_GAME rows.
      if (++pruneCounter % 50 === 0) {
        await q(
          `DELETE FROM events WHERE game_id=$1 AND id < (
             SELECT MIN(id) FROM (SELECT id FROM events WHERE game_id=$1 ORDER BY id DESC LIMIT $2) keep)`,
          [gameId, EVENTS_PER_GAME],
        ).catch((e) => console.warn('[db] event prune failed:', e.message));
      }
    },
    async listEvents(gameId, limit = 200) {
      const r = await q('SELECT payload FROM events WHERE game_id=$1 ORDER BY id DESC LIMIT $2', [gameId, Math.min(1000, limit)]);
      return r.rows.map((x) => x.payload).reverse();
    },

    async appendChat(gameId, m) { await q('INSERT INTO chat_messages (game_id, role, content, tone, sim_time) VALUES ($1,$2,$3,$4,$5)', [gameId, m.role, String(m.content).slice(0, 4000), m.tone || null, m.t]); },
    async listChat(gameId, limit = 40) { const r = await q('SELECT role, content, tone, sim_time AS t FROM chat_messages WHERE game_id=$1 ORDER BY id DESC LIMIT $2', [gameId, Math.min(200, limit)]); return r.rows.reverse(); },

    async createPlaydate(code, hostGameId) { await q('INSERT INTO playdates (code, host_game_id) VALUES ($1,$2)', [code, hostGameId]); },
    async getPlaydate(code) { const r = await q('SELECT * FROM playdates WHERE code=$1', [code]); return r.rows[0] || null; },
    async updatePlaydate(code, fields) {
      const ALLOWED = new Set(['guest_game_id', 'status', 'ended_at']);
      const sets = [], params = []; let i = 1;
      for (const [k, v] of Object.entries(fields)) { if (!ALLOWED.has(k)) continue; sets.push(`${k}=$${i++}`); params.push(v); }
      if (!sets.length) return;
      params.push(code);
      await q(`UPDATE playdates SET ${sets.join(',')} WHERE code=$${i}`, params);
    },

    async close() { await pool.end().catch(() => {}); },
  };
}
