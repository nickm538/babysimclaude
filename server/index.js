import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from './db/index.js';
import { GameManager } from './game_manager.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/games.js';
import { playdateRoutes } from './routes/playdates.js';
import { socialRoutes } from './routes/social.js';
import { createHub } from './ws.js';
import { llmAvailable } from './ai/babyChat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const store = await createStore();
  const gm = new GameManager(store);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  app.get('/api/health', (req, res) => res.json({ ok: true, db: store.kind, llm: llmAvailable(), uptime: process.uptime() }));
  app.use('/api/auth', authRoutes(store));
  app.use('/api/games', gameRoutes(store, gm));
  const server = http.createServer(app);
  const hub = createHub(server, store, gm);
  app.use('/api/playdates', playdateRoutes(store, gm, hub));
  app.use('/api/social', socialRoutes(store, gm));

  // static: client, shared code and the three.js build (served straight from node_modules — no bundler)
  const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, etag: true };
  app.use('/shared', express.static(path.join(root, 'shared'), staticOpts));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three'), staticOpts));
  app.use(express.static(path.join(root, 'client'), staticOpts));
  app.get(/^\/(?!api|ws|vendor|shared).*/, (req, res) => res.sendFile(path.join(root, 'client/index.html')));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); void next; });

  server.listen(PORT, () => console.log(`[cradle] listening on :${PORT}  db=${store.kind}  llm=${llmAvailable() ? 'anthropic' : 'rules-only (set ANTHROPIC_API_KEY)'}`));
  // Railway sends SIGTERM on every redeploy, so this is the normal way the process ends: flush every
  // in-memory game before going away. It must be idempotent (a second signal must not start a second
  // flush) and must still exit if the database is the thing that is unwell.
  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[cradle] ${signal} — saving ${gm.games.size} in-memory game(s) and shutting down`);
    const hardExit = setTimeout(() => { console.error('[cradle] shutdown timed out — exiting anyway'); process.exit(1); }, 10000);
    hardExit.unref();
    try { await gm.shutdown(); } catch (e) { console.error('[cradle] shutdown save failed:', e.message); }
    try { await store.close(); } catch (e) { console.error('[cradle] store close failed:', e.message); }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  // A rejection nobody handled should be loud in the logs, not a silent process death on Node 22.
  process.on('unhandledRejection', (e) => console.error('[cradle] unhandled rejection:', e && e.message ? e.message : e));
}
main().catch((e) => { console.error(e); process.exit(1); });
