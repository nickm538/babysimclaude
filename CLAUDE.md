# Cradle — project notes for Claude Code

Real-time, first-person newborn raising simulation. Node/Express + WebSocket server (authoritative sim, Postgres or JSON file store), Three.js client (procedural 3D, no bundler, PWA for iOS Safari).

## Layout
- `shared/constants.js` — data shared by server and client (needs, schedules, shop, milestones, growth curves).
- `server/sim/` — the simulation: `state.js` (new game), `engine.js` (tick), `actions.js` (parent actions), `health.js` (illness + telehealth doctor), `events.js` (roaming, hazards, babysitter), `view.js` (client-safe view).
- `server/game_manager.js` — in-memory game runtime, real-time ticks for connected players, offline catch-up on load, persistence.
- `server/ai/babyChat.js` — baby chat via the Anthropic SDK with a rule-based fallback.
- `server/db/` — `postgres.js` (DATABASE_URL) or `filestore.js` (dev), `schema.sql`.
- `client/src/` — `engine/` (renderer, controls, textures), `world/` (house, furniture), `characters/` (marching-cubes baby body, face rig, animator, skin shader, parent arms), `audio/` (procedural Web Audio), `ui/` (HUD, actions, phone app, chat, screens), `main.js`.

## Commands
```bash
npm install
npm test            # simulation unit tests (node:test)
npm run dev         # server with file store on :3000
npm run smoke       # boots server, drives REST + WS, loads the client in Chromium if playwright is importable
```

## Rules
- Keep the server authoritative: every state change goes through `applyAction` or the tick; the client only renders and requests.
- Any new need/stat must be added to `shared/constants.js` labels, `view.js`, and the HUD/phone UI.
- Never load external assets at runtime (textures, models, audio are procedural) — the app must work offline as a PWA.
- Keep files under ~500 lines; split by domain.
- Do not commit `.env` or `data/`.
