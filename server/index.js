import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from './db/index.js';
import { GameManager } from './game_manager.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/games.js';
import { playdateRoutes } from './routes/playdates.js';
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

  // static: client, shared code and the three.js build (served straight from node_modules — no bundler)
  const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, etag: true };
  app.use('/shared', express.static(path.join(root, 'shared'), staticOpts));
  app.use('/vendor/three', express.static(path.join(root, 'node_modules/three'), staticOpts));
  app.use(express.static(path.join(root, 'client'), staticOpts));
  app.get(/^\/(?!api|ws|vendor|shared).*/, (req, res) => res.sendFile(path.join(root, 'client/index.html')));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); void next; });

  server.listen(PORT, () => console.log(`[cradle] listening on :${PORT}  db=${store.kind}  llm=${llmAvailable() ? 'anthropic' : 'rules-only (set ANTHROPIC_API_KEY)'}`));
  const stop = async () => { console.log('[cradle] shutting down'); await gm.shutdown(); await store.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
