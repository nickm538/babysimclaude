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
- **Real time**: 24× while you play (1 real hour = 1 baby day), with optional ×4 fast-forward while the baby sleeps peacefully, and
  2× real time while you're away (capped at 24 baby-hours per absence). When you come back you get a summary: the baby may have
  napped, played, filled a diaper, crawled to the stairs, eaten something off the floor, or got sick.
- **Live chat with the baby**: age-aware responses (newborn body language → babble → toddler sentences → preschooler stories) from the
  Anthropic API with a rule-based fallback. Your tone is classified — harsh messages count as yelling.
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
npm test                  # simulation tests
```

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
  buttons are context actions; 📱 opens the phone (Baby, Health, Shop, Wardrobe, School, Home, Friends, Journal, Settings), 💬 talks
  to the baby, 🍼 walks you to the baby.
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
to `scripts/`.

## Tech
Node 20+, Express, `ws`, `pg`, `bcryptjs`, Three.js 0.170 (served from `node_modules`, ES modules + import map, no bundler),
`@anthropic-ai/sdk`. Tests use `node:test`.
