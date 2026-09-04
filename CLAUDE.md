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
- `server/ai/babyChat.js` — baby chat via the Anthropic SDK with a rule-based fallback; `chatIntent.js` turns what the player types into real effects (praise/cruelty/reassurance/apology move trust, esteem, happiness) and into real actions (`COMMANDS` → `obedience()` → `resolveCommand()` → `applyAction`). `GameManager.chat()` is the one authoritative entry point.
- `server/db/` — `postgres.js` (DATABASE_URL) or `filestore.js` (dev), `schema.sql`.
- `client/src/` — `engine/` (renderer + adaptive quality, `post.js` GTAO/SMAA pipeline, controls, procedural textures incl. `matte()`/`clothMaterial()`, particle effects), `world/` (house with profiled trim, furniture, generative wall art), `characters/` (`babyMesh.js` shared metaball→marching-cubes→Taubin→skinning pipeline plus `offsetShell`/`clipGeometry` for garments, face rig, animator, skin shader, `adult.js` visitor NPCs + `visitors.js` sync, `armMesh.js` + `parentArms.js` first-person arms, `handProps.js` the objects a hand holds), `audio/` (procedural Web Audio), `ui/` (HUD, actions, phone app, chat, screens, notifications, mood meter, story tab, contacts, interaction choosers, `styles.css`), `main.js`.

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
- Chat must never bypass the simulation: a typed request names an action, and `obedience()` decides whether it happens. The LLM may only *name* a request id from `COMMANDS`; it never decides outcomes.
- New emotional/derived stats need adding to `EMOTION_KEYS` in `shared/constants.js` AND to `ensureGameShape()` in `state.js`, or older saves will read `undefined`.
- New story events are data, not code: add them to `storyEvents*.js` and make sure every condition key you use is handled in `matches()` and every effect key in `applyEffects()`.
- Graphics rules, all enforced by `npm run smoke` against the live scene rather than by review: no transparent/`opacity` materials except the window glass (tag any new one `material.userData.glass = true`); no bare flat colours — every material needs a map, normal map, roughness map, sheen, clearcoat or transmission, so use `matte()`, `clothMaterial()` or a textured `stdMaterial()`; nothing zero-thickness (a rug, a mat, a screen and a sheet of paper all have depth); every skin mesh must be a closed surface (the smoke counts boundary edges and they must be 0); garments are cut from a whole-body shell with `clipGeometry`, never built from a subset of metaballs.
- Metaball fields accumulate `val^4` and take a fourth root — a soft maximum. Summing them makes limbs balloon to two or three times their radius, which is what "blob" looks like.
- Character rigs are a T-pose: the right arm points along +X, so lowering it is a NEGATIVE rotation about Z. Measure where a wrist actually lands rather than eyeballing Euler angles.
- Mesh density, hair counts, shadow maps and the post chain scale off `renderer.software` / `isMobile`; `?quality=high|low` overrides. Anything expensive added to the scene needs a place in that ladder.
- Garments are never a second ball field: `offsetShell(bodyGeo, thickness)` pushes the body's own vertices along their normals so cloth inherits the body's topology *and* its skin weights, then `clipGeometry(shell, f)` cuts the hem along a signed field (`above`/`below`/`all`/`any`). A re-polygonised shell gets its own weights, drifts through the skin under a pose, and looks like torn clothing.
- A face cannot be resolved on the body's grid. One marching-cubes grid over a 1.5 m adult samples every ~17 mm; a nostril is 4 mm. `Adult.buildFaceMesh()` polygonises the head again on its own box (`adultHeadBalls`, radii slightly grown so it encloses the body's own head) and parents it rigidly to the head bone.
- Negative-strength metaballs carve. `polygonise` accumulates positive and negative balls in separate p-norm sums; one shared accumulator makes `val^4` positive and turns every carve into a bulge.
- Skin-shader zones (`uHeadY`, `uHeadR`) must be set by whoever builds the character, and every facial zone is sized in head radii — absolute distances tuned for a newborn skull cover an adult's whole face. Detail normals are for breaking up a highlight, not reshaping a surface: at high strength the triplanar blend seams read as coloured streaks down a face.
- `client/charview.html` is a standalone turntable for the character meshes (`?who=adult|baby`, `head=1`, `az=…`, plus `nosss`/`nohair`/`nodetail`/`plain` to bisect a shading problem). Use it rather than fighting the live sim for a portrait.
- `npm run smoke` needs `SMOKE_CHROME=/path/to/chrome` on machines without a matching Playwright browser; `SMOKE_DATABASE_URL=postgresql://…` runs it against real Postgres. `TEST_DATABASE_URL` enables `tests/postgres.test.js`.
- Do not commit `.env` or `data/`.
