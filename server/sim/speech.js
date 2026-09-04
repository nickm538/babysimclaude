// The child talks to you without being spoken to first.
//
// A simulation where the baby only ever reacts feels like a vending machine. Real children interrupt
// you: they announce things, ask for things, narrate what they are doing, and say your name for no
// reason at all. This picks those moments — gated on being awake, verbal enough, and having
// something to say — and pushes them into the same chat thread the parent types into.
//
// Everything is drawn from live state and shuffled against recent history, so the child does not
// repeat themselves and two games never produce the same script.
import { ageDays, isNight } from './engine.js';
import { clamp } from '../../shared/constants.js';

const MIN_GAP_MIN = 7;          // never more than one unprompted line every few sim minutes

// Lines are built from the child's actual situation, not from a fixed script. Each entry says when
// it applies and produces the line; `weight` biases which of the applicable ones is chosen.
const LINES = [
  // --- first words (roughly 10-18 months) -------------------------------------------------
  { min: 300, max: 620, weight: 3, when: (c) => c.awake, say: (c) => `"${c.pick(['Mama', 'Dada', 'Ba', 'Uh-oh', 'Dis', 'Da'])}!" *${c.pick(['points at you', 'points at nothing', 'holds up a hand', 'bangs the floor'])}*` },
  { min: 300, max: 620, weight: 2, when: (c) => c.hungry, say: () => `"Mm-mm!" *smacks lips and leans toward the kitchen*` },
  { min: 320, max: 700, weight: 2, when: (c) => c.toys, say: (c) => `*holds out a ${c.toy}* "Dis? Dis!"` },
  // --- two-word stage --------------------------------------------------------------------
  { min: 560, max: 1000, weight: 3, when: (c) => c.awake, say: (c) => `"${c.pick(['Mama up', 'More', 'My turn', 'Look dat', 'All gone', 'Me do it'])}!"` },
  { min: 560, max: 1100, weight: 3, when: (c) => c.hungry, say: (c) => `"${c.pick(['Hungry', 'Want snack', 'More milk', 'Eat now'])}!"` },
  { min: 560, max: 1100, weight: 2, when: (c) => c.tired, say: () => `*rubs eyes* "No bed. No bed!" *yawns enormously*` },
  { min: 560, max: 1200, weight: 2, when: (c) => c.lonely, say: () => `"Mama? Mama. Mama!" *tugs at you until you look*` },
  // --- sentences ---------------------------------------------------------------------------
  { min: 900, weight: 3, when: (c) => c.awake && c.toys, say: (c) => `"Look what I made!" *shows you a ${c.toy} balanced on another ${c.toy}*` },
  { min: 900, weight: 2, when: (c) => c.hungry, say: (c) => `"I'm hungry. Can I have ${c.pick(['a snack', 'some milk', 'toast', 'the orange one'])}?"` },
  { min: 900, weight: 2, when: (c) => c.tired && c.night, say: () => `"I'm not tired." *says this while lying down on the rug*` },
  { min: 900, weight: 3, when: (c) => c.happy && c.close, say: (c) => `"I love you ${c.pick(['this much', 'more than the moon', 'forever'])}!" *arms out wide*` },
  { min: 1000, weight: 2, when: (c) => c.sick, say: (c) => `"I don't feel good." *${c.pick(['leans on you heavily', 'holds their tummy', 'goes very quiet'])}*` },
  { min: 1000, weight: 2, when: (c) => c.wary, say: (c) => `*from across the room* "${c.pick(['Are you cross with me?', 'You not yell?', "I'll be good."])}"` },
  { min: 1100, weight: 3, when: (c) => c.awake, say: (c) => `"Why is ${c.pick(['the sky up there', 'the floor hard', 'water wet', 'night dark', 'the cat next door so fat'])}?"` },
  { min: 1200, weight: 2, when: (c) => c.bored, say: (c) => `"I'm bored. Can we ${c.pick(['play a game', 'go outside', 'read the dinosaur book', 'do painting'])}?"` },
  { min: 1300, weight: 2, when: (c) => c.awake, say: (c) => `"When I'm big I'm going to be a ${c.pick(['doctor', 'dinosaur', 'bus driver', 'doctor AND a dinosaur', 'baker'])}."` },
  { min: 1400, weight: 2, when: (c) => c.happy, say: (c) => `"Guess what?" *waits* "${c.pick(['I can hop on ONE leg.', 'I know all the letters. Nearly.', 'I did a really big jump.'])}"` },
  { min: 1400, weight: 2, when: (c) => c.friends, say: () => `"Can my friend come and play? Please please please?"` },
];

// Preverbal children do not talk, but they do make themselves heard — and the parent should feel
// addressed by it, so it lands in the same thread.
const SOUNDS = [
  { max: 90, weight: 3, when: (c) => c.awake, say: (c) => `*${c.pick(['a long, creaky yawn', 'grunts and stretches', 'stares at your face, unblinking', 'roots toward your voice'])}*` },
  { max: 200, min: 60, weight: 3, when: (c) => c.awake && c.happy, say: (c) => `"${c.pick(['Ooooh', 'Aaah-goo', 'Ehh… ehh', 'Nnnah'])}!" *${c.pick(['kicks both legs', 'a gummy smile', 'squeals at the ceiling'])}*` },
  { max: 330, min: 150, weight: 3, when: (c) => c.awake, say: (c) => `"${c.pick(['Ba-ba-ba', 'Da-da-da-da', 'Mamama', 'Bff-bff'])}!" *${c.pick(['blows a raspberry', 'slaps the floor', 'laughs at their own noise'])}*` },
];

export function ensureSpeech(game) {
  if (!game.speech || typeof game.speech !== 'object') game.speech = { lastAt: -1e9, recent: [] };
  if (!Array.isArray(game.speech.recent)) game.speech.recent = [];
  return game.speech;
}

// Per-step chance that the child pipes up. Deliberately low: a child who talks constantly is as
// unrealistic as one who never does, and the parent should be able to look away.
function chanceFor(c) {
  if (!c.awake) return 0;
  let p = c.days < 300 ? 0.9 : c.days < 900 ? 1.6 : 2.2;   // per hour
  if (c.happy) p *= 1.3;
  if (c.lonely || c.bored) p *= 1.6;
  if (c.hungry || c.tired) p *= 1.3;
  if (c.wary) p *= 0.5;
  if (c.night) p *= 0.35;
  return p;
}

function contextFor(game, rng) {
  const b = game.baby, n = b.needs, e = b.emo, days = ageDays(game);
  const toys = Array.isArray(game.inventory.toys) ? game.inventory.toys : [];
  const pick = (arr) => arr[rng.int(0, arr.length - 1)];
  return {
    days, name: b.name, pick,
    awake: b.state.activity !== 'sleeping' && !b.state.cryingSince && !b.state.hospitalized,
    happy: e.happiness > 62 && e.stress < 45,
    wary: e.trust < 42 || e.stress > 65,
    close: e.trust > 60,
    hungry: n.fullness < 42,
    tired: n.rest < 38,
    lonely: n.affection < 45,
    bored: n.stimulation < 40,
    sick: !!b.illness,
    night: isNight(game),
    toys: toys.length > 0,
    toy: (toys.length ? pick(toys) : 'block').replace(/_/g, ' '),
    friends: (game.social && game.social.contacts && game.social.contacts.length > 0),
  };
}

// Called once per engine step. Returns the line it spoke, or null.
export function rollSpeech(game, dtH, rng) {
  const s = ensureSpeech(game);
  const t = game.sim.time;
  if (t - s.lastAt < MIN_GAP_MIN * 60) return null;
  const c = contextFor(game, rng);
  const p = chanceFor(c) * dtH;
  if (p <= 0 || !rng.chance(Math.min(0.4, p))) return null;

  const pool = [];
  let total = 0;
  for (const l of [...LINES, ...SOUNDS]) {
    if (l.min != null && c.days < l.min) continue;
    if (l.max != null && c.days > l.max) continue;
    if (l.when && !l.when(c)) continue;
    const w = Math.max(0.2, l.weight || 1);
    total += w; pool.push([l, total]);
  }
  if (!pool.length) return null;
  const r = rng.next() * total;
  const chosen = (pool.find(([, acc]) => r <= acc) || pool[pool.length - 1])[0];
  let text;
  try { text = chosen.say(c); } catch { return null; }
  if (!text || s.recent.includes(text)) return null;   // never the same line twice in a row

  s.lastAt = t;
  s.recent.push(text);
  if (s.recent.length > 8) s.recent.shift();
  // A child who speaks and is heard is a child getting something out of it.
  game.baby.needs.stimulation = clamp(game.baby.needs.stimulation + 1.5, 0, 100);
  return text;
}
