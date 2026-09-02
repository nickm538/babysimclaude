# 🍼 Cradle — First Days Home

A real-time, first-person, 3D newborn raising simulation for iPhone/iPad (as a home-screen web app) and desktop browsers.
You bring a newborn home and raise them, in near real time, to age five. Every need, milestone, illness, purchase, doctor visit,
tantrum and mistake is simulated on the server and saved to a database, so the baby keeps living between sessions.

## What's in the box
- **Authoritative simulation** (`server/sim`): eight needs (fed, rested, dry, clean, comfort, engaged, loved, health), four emotional
  scores (happiness, trust, security, stress), five development domains (cognitive, motor, language, social, self-regulation),
  WHO-based growth curves, clothing/diaper sizes that get outgrown, 35 milestones with typical windows and delays, 16 illnesses with
  courses, fever, prescriptions, hospitalization, vaccines and well-child checkups on the real schedule, teething, colic, jaundice,
  diaper rash, choking/food-safety rules (honey, cow's milk, water, solids too early), medicine dosing/overdose rules, safe-sleep
  risk, household hazards mitigated by baby-proofing, a babysitter, deliveries to the front door, homeschool lessons, potty training,
  playdates, and losing your temper (yell / scream / walk out) with the consequences those have in real life.
- **Death and success**: the baby can die (starvation, untreated illness, unsafe sleep, accidents, poisoning, failure to thrive). It
  takes a lot, but it is possible. The game is won when the child turns five; the outcome is graded on health, happiness, trust and
  development.
- **A story that keeps building** (`server/sim/story.js` + `mood.js`, `storyChapters.js`, `storyEvents*.js`): a 76-entry catalog of
  unpredictable events gated on age, mobility, supervision, season, weather, temperament, traits, inventory and baby-proofing — from
  the first belly laugh and a tower built alone to a blowout, a night terror, a stolen porch delivery and the rat poison in the
  unlocked cupboard, which starts a countdown that a telehealth visit can beat and silence cannot. Some events open a **timed choice**
  that expires into its default if you dither. A 10-point **mood spectrum** runs from *agony* to *elated*. Every week of life is
  written up as a **chapter**, and the moments that mattered become **memories** the baby chat actually remembers between sessions.
- **The people around you** (`server/sim/social.js`): a generated circle of grandparents, an aunt, friends, a neighbour and a health
  visitor, each with a personality, availability, distance, a closeness score that decays if you never call, and advice that is
  sometimes decades out of date. Calls, video calls, photos, visits, gifts, a contact babysitter and a weekly playgroup.
- **Real time**: 24× while you play (1 real hour = 1 baby day), with optional ×4 fast-forward while the baby sleeps peacefully, and
  2× real time while you're away. The first 24 baby-hours of an absence run with **nobody in the house** — that is where a baby left
  alone roams, gets into things, and can die. A longer absence is not thrown away: the rest (up to 10 baby-days) is covered by a
  stand-in carer who feeds and changes **from your supplies** and runs out if you left none, but gives none of the affection. When you
  come back you get a summary and the chapter written while you were gone: the baby may have napped, played, filled a diaper, crawled
  to the stairs, eaten something off the floor, or got sick.
- **Live chat with the baby**: age-aware responses (newborn body language → babble → toddler sentences → preschooler stories) from the
  Anthropic API with a rule-based fallback, fed the story summary so the baby's replies reflect the life it has actually had. Your
  tone is classified — harsh messages count as yelling.
- **43 further interactions** (`server/sim/actions2.js`, `actions3.js`): teaching words that build a real vocabulary, naming body
  parts, dialogic reading, introducing allergens one at a time (with real reactions and real tolerance), praise vs. gentle correction
  vs. time-in, peekaboo, massage, skin-to-skin, sensory play, night checks, dream feeds, nail trims, first haircut, sunscreen, chores
  done together, and simply watching for a minute — which changes nothing except that you were there.
- **3D client** (`client/`): Three.js first-person house (living room, nursery nook, kitchen corner, stairs, front door), procedural PBR
  textures, day/night lighting, and a fully procedural baby: a metaball/marching-cubes body with a skeleton, expression morph targets,
  eyes that track you and blink, hair strands, a subsurface-scattering skin shader, growth-based proportions, crawling/walking
  between spots, first-person arms holding bottles/diapers/books. No downloaded assets.
- **Procedural audio**: synthesized cries (formant-filtered, intensity-driven), coos, giggles, babble, breathing, room tone, birds by
  day, crickets at night, doorbell, footsteps, music-box mobile, white noise, and optional speech synthesis for toddler talk.
- **Multiplayer playdates**: share a 6-letter code; the other baby appears in your living room and both children gain social skills
  (and germs). Parent-to-parent chat over WebSocket.
- **PWA**: installable on iOS (Add to Home Screen), safe-area aware touch controls (left thumb walks, right thumb looks, tap to interact).

## Run locally
```bash
npm install
cp .env.example .env      # optional; without DATABASE_URL a JSON file store in ./data is used
npm run dev               # http://localhost:3000
npm test                  # 57 tests: simulation, story, social, interactions, persistence
npm run smoke             # boots the server, drives REST + WS, loads the client in Chromium
node scripts/soak.mjs --years 5   # five simulated years per care profile, with invariant checks
```

`scripts/soak.mjs` is the long-run safety net: it plays five sim-years four ways (attentive, minimal, total neglect, random
fuzzing), asserts the invariants hold the whole way, and checks the outcomes — attentive care must reach the fifth birthday
thriving, total neglect must be fatal but must take more than a day, and the same seed must always give the same life.

## Deploy on Railway
1. Create a new Railway project from this repo (the repo root has `railway.json` and a `Dockerfile`; either builder works).
2. Add a **PostgreSQL** database to the project and reference its connection string as `DATABASE_URL` on the web service
   (`${{Postgres.DATABASE_URL}}`). The schema is created automatically on boot.
3. Set `SESSION_SECRET` to a long random string.
4. Optional but recommended: set `ANTHROPIC_API_KEY` for the live baby chat. Default model is `claude-opus-5`; set
   `BABY_LLM_MODEL=claude-haiku-4-5` if you prefer a cheaper/faster responder. Without a key the chat still works with rules.
5. Generate a public domain. The health check is `/api/health`.

The service must run as a single instance (games are ticked in memory by the process that holds the WebSocket); Railway's default
single replica is correct.

## Controls
- **Phone/tablet**: left thumb = virtual joystick to walk, right thumb = drag to look, tap objects/baby to interact. Bottom-right
  buttons are context actions, grouped into categories (Care, Play, Learn, Temper…); 📱 opens the phone (Baby, Health, Shop, Wardrobe,
  School, Home, Family, Friends, Story, Settings), 🔔 opens the alert history, 💬 talks to the baby, 🍼 walks you to the baby.
- **Desktop**: WASD/arrows walk, mouse drag looks, click interacts, Shift hurries.

## How the day works
- Newborns feed every 2–3 hours and sleep 16 hours in short stretches. Prepare bottles at the kitchen counter, change diapers at the
  changing table, bathe there too. Wash bottles. Order supplies before they run out; deliveries arrive at the front door.
- Crying always has a cause (hungry, tired, wet, uncomfortable, bored, lonely, in pain, colicky, scared). Fast, gentle responses build
  trust and a secure attachment; ignoring cries or losing your temper does the opposite.
- Telehealth doctor: well-child checkups on schedule, sick visits for diagnosis and prescriptions, a visiting nurse for vaccines.
- Time and safety rules are real: back to sleep, no honey before one, no water before six months, no solids before four months,
  medicine only when needed and dosed correctly, baby-proof before the baby crawls.

## Testing later ages
Set `CRADLE_DEBUG=1` on the server to enable `POST /api/games/:id/debug/advance` with `{ "days": 730 }` — it simulates a
cared-for baby (babysitter, stocked supplies, health upkeep) day by day so you can inspect the toddler/preschooler stages quickly.
Never enable this in production.

`npm run smoke` needs Playwright to be importable: either `npm i -D playwright` (downloads Chromium) or point it at an existing install
with `SMOKE_PW_PATH=/path/to/playwright/index.mjs` and `SMOKE_CHROME=/path/to/chrome`. `SMOKE_SHOTS=1` writes extra screenshots
to `scripts/`. Without Playwright the REST/WebSocket half still runs and the browser half is skipped.

To reproduce one specific baby exactly — same seed, appearance, temperament and circle of people — pass an `id` to `createGame`:
`createGame({ userId, babyName: 'Wren', id: 'repro-1' })`. Everything random about a newborn derives from it.

## Tech
Node 20+, Express, `ws`, `pg`, `bcryptjs`, Three.js 0.170 (served from `node_modules`, ES modules + import map, no bundler),
`@anthropic-ai/sdk`. Tests use `node:test`.
