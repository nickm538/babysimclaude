import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function createPostgresStore(url) {
  const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1|railway\.internal/.test(url) ? false : { rejectUnauthorized: false }, max: 8 });
  await pool.query(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  const q = (text, params) => pool.query(text, params);
  return {
    kind: 'postgres',
    async createUser(u) { await q('INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)', [u.id, u.username, u.passwordHash]); return u; },
    async getUserByName(username) { const r = await q('SELECT id, username, password_hash FROM users WHERE lower(username)=lower($1)', [username]); return r.rows[0] ? { id: r.rows[0].id, username: r.rows[0].username, passwordHash: r.rows[0].password_hash } : null; },
    async getUser(id) { const r = await q('SELECT id, username FROM users WHERE id=$1', [id]); return r.rows[0] || null; },
    async saveGame(g) {
      await q(`INSERT INTO games (id, user_id, status, baby_name, sim_time, last_tick_at, state, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
        ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, baby_name=EXCLUDED.baby_name, sim_time=EXCLUDED.sim_time, last_tick_at=EXCLUDED.last_tick_at, state=EXCLUDED.state, updated_at=now()`,
        [g.id, g.userId, g.status, g.baby.name, g.sim.time, g.lastTickAt, JSON.stringify(g)]);
    },
    async getGame(id) { const r = await q('SELECT state FROM games WHERE id=$1', [id]); return r.rows[0] ? r.rows[0].state : null; },
    async listGames(userId) { const r = await q('SELECT id, status, baby_name, sim_time, last_tick_at, created_at FROM games WHERE user_id=$1 ORDER BY created_at DESC', [userId]); return r.rows.map((x) => ({ id: x.id, status: x.status, babyName: x.baby_name, simTime: Number(x.sim_time), lastTickAt: Number(x.last_tick_at), createdAt: x.created_at })); },
    async listActiveGames() { const r = await q("SELECT id FROM games WHERE status='active'"); return r.rows.map((x) => x.id); },
    async appendEvents(gameId, events) {
      if (!events.length) return;
      const vals = [], params = [];
      events.forEach((e, i) => { params.push(gameId, e.t, e.type, e.sev || 'info', JSON.stringify(e)); vals.push(`($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`); });
      await q(`INSERT INTO events (game_id, sim_time, type, severity, payload) VALUES ${vals.join(',')}`, params);
    },
    async listEvents(gameId, limit = 200) { const r = await q('SELECT payload FROM events WHERE game_id=$1 ORDER BY id DESC LIMIT $2', [gameId, limit]); return r.rows.map((x) => x.payload).reverse(); },
    async appendChat(gameId, m) { await q('INSERT INTO chat_messages (game_id, role, content, tone, sim_time) VALUES ($1,$2,$3,$4,$5)', [gameId, m.role, m.content, m.tone || null, m.t]); },
    async listChat(gameId, limit = 40) { const r = await q('SELECT role, content, tone, sim_time AS t FROM chat_messages WHERE game_id=$1 ORDER BY id DESC LIMIT $2', [gameId, limit]); return r.rows.reverse(); },
    async createPlaydate(code, hostGameId) { await q('INSERT INTO playdates (code, host_game_id) VALUES ($1,$2)', [code, hostGameId]); },
    async getPlaydate(code) { const r = await q('SELECT * FROM playdates WHERE code=$1', [code]); return r.rows[0] || null; },
    async updatePlaydate(code, fields) {
      const sets = [], params = []; let i = 1;
      for (const [k, v] of Object.entries(fields)) { sets.push(`${k}=$${i++}`); params.push(v); }
      params.push(code);
      await q(`UPDATE playdates SET ${sets.join(',')} WHERE code=$${i}`, params);
    },
    async close() { await pool.end(); },
  };
}
