// JSON file store used when DATABASE_URL is not set (local dev / demo). Same interface as the Postgres store.
import fs from 'node:fs';
import path from 'node:path';

export async function createFileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'cradle.json');
  let data = { users: [], games: {}, events: {}, chat: {}, playdates: {} };
  if (fs.existsSync(file)) { try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* start fresh */ } }
  let dirty = false, timer = null;
  const flush = () => { if (!dirty) return; dirty = false; fs.writeFileSync(file, JSON.stringify(data)); };
  const mark = () => { dirty = true; if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 500); };
  return {
    kind: 'file',
    async createUser(u) { data.users.push(u); mark(); return u; },
    async getUserByName(username) { return data.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null; },
    async getUser(id) { const u = data.users.find((x) => x.id === id); return u ? { id: u.id, username: u.username } : null; },
    async saveGame(g) { data.games[g.id] = JSON.parse(JSON.stringify(g)); mark(); },
    async getGame(id) { return data.games[id] ? JSON.parse(JSON.stringify(data.games[id])) : null; },
    async listGames(userId) { return Object.values(data.games).filter((g) => g.userId === userId).sort((a, b) => b.createdAt - a.createdAt).map((g) => ({ id: g.id, status: g.status, babyName: g.baby.name, simTime: g.sim.time, lastTickAt: g.lastTickAt, createdAt: new Date(g.createdAt).toISOString() })); },
    async listActiveGames() { return Object.values(data.games).filter((g) => g.status === 'active').map((g) => g.id); },
    async appendEvents(gameId, events) { if (!events.length) return; const arr = (data.events[gameId] ||= []); arr.push(...events); if (arr.length > 2000) arr.splice(0, arr.length - 2000); mark(); },
    async listEvents(gameId, limit = 200) { return (data.events[gameId] || []).slice(-limit); },
    async appendChat(gameId, m) { const arr = (data.chat[gameId] ||= []); arr.push(m); if (arr.length > 500) arr.splice(0, arr.length - 500); mark(); },
    async listChat(gameId, limit = 40) { return (data.chat[gameId] || []).slice(-limit); },
    async createPlaydate(code, hostGameId) { data.playdates[code] = { code, host_game_id: hostGameId, guest_game_id: null, status: 'open', created_at: new Date().toISOString() }; mark(); },
    async getPlaydate(code) { return data.playdates[code] || null; },
    async updatePlaydate(code, fields) { if (data.playdates[code]) Object.assign(data.playdates[code], fields); mark(); },
    async close() { flush(); },
  };
}
