# Cradle — project notes for Claude Code

Real-time, first-person newborn raising simulation. Node/Express + WebSocket server (authoritative sim, Postgres or JSON file store), Three.js client (procedural 3D, no bundler, PWA for iOS Safari).

## Layout
- `shared/constants.js` — data shared by server and client (needs, schedules, shop, milestones, growth curves).
- `server/sim/` — the simulation:
  - `state.js` (new game; pass `id` to reproduce one exactly), `engine.js` (tick, journal, death), `view.js` (client-safe view).
  - `actions.js` (parent actions) + `actions2.js`/`actions3.js` (the 43 nuanced interactions, merged in as `EXTRA_HANDLERS`).
  - `health.js` (illness, fever, telehealth doctor), `events.js` (roaming, hazards, babysitter).
  - `story.js` (the one per-step entry point: `rollStoryEvents`) with `mood.js` (the agony→elated spectrum), `storyChapters.js` (chapters, memories, traits) and `storyEvents.js`/`storyEvents2.js` (the declarative 76-event catalog).
  - `social.js` + `socialData.js` (contacts, calls, visits, advice, the contact sitter, the playgroup).
- `server/game_manager.js` — in-memory game runtime, real-time ticks for connected players, offline catch-up on load, persistence.
- `server/routes/` — `games.js` (REST + debug advance), `social.js` (the Family tab's actions), auth, playdates.
- `server/ai/babyChat.js` — baby chat via the Anthropic SDK with a rule-based fallback.
- `server/db/` — `postgres.js` (DATABASE_URL) or `filestore.js` (dev), `schema.sql`.
- `client/src/` — `engine/` (renderer, controls, textures, particle effects), `world/` (house, furniture, generative wall art), `characters/` (marching-cubes baby body, face rig, animator, skin shader, parent arms), `audio/` (procedural Web Audio), `ui/` (HUD, actions, phone app, chat, screens, notifications, mood meter, story tab, contacts, interaction choosers, `styles.css`), `main.js`.

## Commands
```bash
npm install
npm test            # 57 unit tests (node:test): sim, story, social, actions2, persistence, manager
npm run dev         # server with file store on :3000
npm run smoke       # boots server, drives REST + WS, loads the client in Chromium if playwright is importable
node scripts/soak.mjs --years 5   # long-run invariant + outcome checks across four care profiles
```

## Rules
- Keep the server authoritative: every state change goes through `applyAction` or the tick; the client only renders and requests.
- Any new need/stat must be added to `shared/constants.js` labels, `view.js`, and the HUD/phone UI.
- Never load external assets at runtime (textures, models, audio are procedural) — the app must work offline as a PWA.
- Keep files under ~500 lines; split by domain.
- Tests must be deterministic: pass a fixed `id` to `createGame` unless the test is specifically about variation between babies.
- Every class a UI module writes must exist in `client/src/ui/styles.css` — there is no CSS framework and no bundler to warn you.
- New story events are data, not code: add them to `storyEvents*.js` and make sure every condition key you use is handled in `matches()` and every effect key in `applyEffects()`.
- Do not commit `.env` or `data/`.
