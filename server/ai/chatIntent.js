// What you say to your child actually does something.
//
// Two separate things happen to every message. First, its *emotional content* lands: telling a child
// you love them, or that you hate them, moves trust, happiness and self-esteem for real, and a young
// child who is shouted at will cry whether or not they understood a word of it. Second, if the
// message was a *request*, the child may actually do it — or refuse, or try and make a mess of it,
// depending on how old they are, whether they understand, how much they trust you, and what kind of
// day they are having. Nothing here is on rails: the same sentence to the same child on a different
// day gets a different answer.
import { ageDays } from '../sim/engine.js';
import { clamp } from '../../shared/constants.js';

// ---------------------------------------------------------------- what can be asked

// `minDays` is when a child can first understand the request at all. `fluentDays` is when they can
// do it properly — in between they try, and the attempt is its own kind of endearing failure.
// `action` is a real handler in the action layer, so an obeyed request goes through exactly the same
// authoritative path as pressing the button would.
export const COMMANDS = [
  {
    id: 'come', minDays: 210, fluentDays: 330, effort: 0.2,
    re: /\b(come here|come to (me|mama|mummy|mommy|daddy|dada)|come on then|over here|crawl (to|over)|walk (to|over)|come)\b/i,
    action: 'move', params: () => ({ location: 'floor' }),
    say: (n) => `${n} makes their way over to you.`,
    tooYoung: (n) => `${n} looks at you, then at nothing in particular. Far too little to come when called.`,
  },
  {
    id: 'sleep', minDays: 120, fluentDays: 540, effort: 0.5,
    re: /\b(go to (sleep|bed)|bed ?time|nap time|have a nap|time for bed|lie down and sleep|go night night)\b/i,
    action: 'put_to_sleep', params: () => ({}),
    say: (n) => `${n} settles down without a fight. That does not always happen.`,
    tooYoung: (n) => `${n} cannot be talked into sleeping. Babies sleep when their bodies say so.`,
  },
  {
    id: 'tidy', minDays: 600, fluentDays: 900, effort: 0.7,
    re: /\b(tidy( up)?|clean up|put (the |your )?toys? away|pick up (the |your )?toys?|clear up)\b/i,
    action: 'tidy_toys', params: () => ({}),
    say: (n) => `${n} puts the toys in the box, one at a time, narrating each one.`,
    clumsy: (n) => `${n} picks up one block, carries it across the room, and puts it down somewhere new.`,
    tooYoung: (n) => `${n} does not know what tidying is yet, and would only take things back out.`,
  },
  {
    id: 'dishes', minDays: 1095, fluentDays: 1600, effort: 1.0,
    re: /\b(wash|do|clean)\b.{0,12}\b(the )?(dish|dishes|plate|plates|washing up)\b|\bwashing up\b/i,
    action: 'chore_dishes', params: () => ({}),
    say: (n) => `${n} drags the stool to the sink and washes up beside you, very seriously, mostly moving bubbles around.`,
    clumsy: (n) => `${n} gets as far as the sink, soaks both sleeves and half the floor, and beams at you.`,
    tooYoung: (n) => `${n} is nowhere near old enough to wash dishes — and a sink is not a safe place for a small child alone.`,
  },
  {
    id: 'sweep', minDays: 800, fluentDays: 1200, effort: 0.7,
    re: /\b(sweep|hoover|vacuum|clean the floor)\b/i,
    action: 'sweep', params: () => ({}),
    say: (n) => `${n} pushes the little brush around, mostly moving crumbs from one place to another.`,
    tooYoung: (n) => `${n} cannot sweep — but they do love watching you do it.`,
  },
  {
    id: 'plants', minDays: 700, fluentDays: 1000, effort: 0.6,
    re: /\b(water the plants?|feed the plants?)\b/i,
    action: 'water_plants', params: () => ({}),
    say: (n) => `${n} tips the little watering can, mostly onto the floor, and checks your face for approval.`,
    tooYoung: (n) => `${n} is too small to be trusted with a watering can.`,
  },
  {
    id: 'potty', minDays: 540, fluentDays: 900, effort: 0.6,
    re: /\b(use the (potty|toilet|loo)|go (to the )?(potty|toilet|loo)|do a wee|potty time)\b/i,
    action: 'potty', params: () => ({}),
    say: (n) => `${n} trots to the potty and sits, with enormous ceremony.`,
    tooYoung: (n) => `${n}'s body cannot do this yet. Pushing potty training early makes it take longer.`,
  },
  {
    id: 'eat', minDays: 180, fluentDays: 500, effort: 0.4,
    re: /\b(eat (your|some|up)( food| dinner| lunch| breakfast)?|eat your \w+|finish your (food|dinner|plate|lunch)|have (some|a) (food|dinner|snack))\b/i,
    action: 'self_feed', params: () => ({}),
    say: (n) => `${n} sets about the food with both hands.`,
    tooYoung: (n) => `${n} cannot feed themselves yet — that is still your job.`,
  },
  {
    id: 'drink', minDays: 180, fluentDays: 400, effort: 0.3,
    re: /\b(drink (your|some) (water|milk|juice)|drink up|have a drink|take a sip)\b/i,
    action: 'offer_water', params: () => ({}),
    say: (n) => `${n} takes the cup in both hands and drinks.`,
    tooYoung: (n) => `Water is not safe for a baby this young — milk only.`,
  },
  {
    id: 'play', minDays: 150, fluentDays: 400, effort: 0.2,
    re: /\b(go (and )?play|play with your (toys?|blocks?)|play by yourself|go play)\b/i,
    action: 'blocks_together', params: () => ({}),
    say: (n) => `${n} settles in with the blocks.`,
    tooYoung: (n) => `${n} cannot play alone yet — at this age you are the toy.`,
  },
  {
    id: 'read', minDays: 200, fluentDays: 700, effort: 0.3,
    re: /\b(read (a )?(book|story)|story time|shall we read|look at a book)\b/i,
    action: 'read', params: () => ({}),
    say: (n) => `${n} plants themselves in your lap and opens the book upside down.`,
    tooYoung: (n) => `${n} is very small, but will still stare at the pictures if you read aloud.`,
  },
  {
    id: 'sing', minDays: 0, fluentDays: 0, effort: 0.1,
    re: /\b(sing|sing (me|a) song|lullaby|sing to (me|you))\b/i,
    action: 'sing', params: () => ({}),
    say: (n) => `You sing, and ${n} goes still to listen.`,
  },
  {
    id: 'cuddle', minDays: 0, fluentDays: 0, effort: 0.1,
    re: /\b(give me a (cuddle|hug)|come for a (cuddle|hug)|cuddle|hug me|hug)\b/i,
    action: 'cuddle', params: () => ({}),
    say: (n) => `${n} folds into you.`,
  },
  {
    id: 'word', minDays: 150, fluentDays: 400, effort: 0.5,
    re: /\bsay\s+["']?([a-z]{2,12})["']?/i,
    action: 'teach_word', params: (m) => ({ word: (m[1] || '').toLowerCase() }),
    say: (n) => `${n} watches your mouth and has a go.`,
    tooYoung: (n) => `${n} cannot make words yet — but hearing them is how it starts.`,
  },
  {
    id: 'stop_crying', minDays: 0, fluentDays: 1600, effort: 0.4,
    re: /\b(stop crying|calm down|hush|shh+|settle down|no more crying|quiet down)\b/i,
    action: 'rock', params: () => ({}),
    say: (n) => `You rock ${n} and the crying loses its edge.`,
  },
];

// Direct praise and criticism, which land on a child of any age because tone carries them.
const PRAISE = /\b(i love you|love you|good (boy|girl|job)|well done|clever|so proud|proud of you|you'?re (amazing|wonderful|brilliant|perfect|the best|so good|lovely|beautiful)|thank you|that'?s (great|lovely|brilliant)|my (darling|angel|sweetheart)|you did it)\b/i;
const CRUEL = /\b(i hate you|hate you|you'?re (stupid|useless|worthless|horrible|bad|a mistake|an accident|disgusting|pathetic)|shut up|i wish you (were never born|hadn'?t been born)|you ruin(ed)? everything|i don'?t (love|want) you|you'?re nothing|no one likes you|you'?re a (brat|monster|nightmare))\b/i;
const REASSURE = /\b(i'?m here|you'?re safe|it'?s (ok|okay|alright)|mama'?s here|daddy'?s here|i'?ve got you|don'?t be (scared|afraid)|you'?re (safe|ok|okay)|nothing to be (scared|afraid) of)\b/i;
const APOLOGY = /\b(i'?m sorry|sorry (baby|darling|sweetheart)?|forgive me|that was my fault|i shouldn'?t have)\b/i;

// ---------------------------------------------------------------- reading a message

// `hint` is an optional command id named by the language model, used only when the patterns above
// found nothing. The model can spot a paraphrase; it never decides the outcome.
export function parseIntent(text, hint = null, hintWord = '') {
  const t = String(text || '').slice(0, 400);
  const out = { command: null, match: null, praise: PRAISE.test(t), cruel: CRUEL.test(t), reassure: REASSURE.test(t), apology: APOLOGY.test(t) };
  // A question is not an order: "shall we read a book?" still counts, "do you want to sleep?" does not
  // become a command to sleep — but the difference is only whether the child treats it as a choice.
  out.asked = /\?\s*$/.test(t.trim()) || /^\s*(shall|can|could|would|will|do you want|want to|how about|let'?s)\b/i.test(t);
  // Several patterns can match one sentence — "give the plants a drink" is both `plants` and
  // `drink`. First-match-wins picks whichever happens to be earlier in the list, which is arbitrary.
  // Take the most specific reading instead: the pattern that consumed the most of the sentence.
  let best = null;
  for (const c of COMMANDS) {
    const m = t.match(c.re);
    if (!m) continue;
    const span = m[0].length;
    if (!best || span > best.span) best = { c, m, span };
  }
  if (best) { out.command = best.c; out.match = best.m; }
  if (!out.command && hint) {
    const c = COMMANDS.find((x) => x.id === hint);
    if (c) { out.command = c; out.match = [t, String(hintWord || '').toLowerCase()]; out.viaModel = true; }
  }
  return out;
}

// ---------------------------------------------------------------- doing what was asked

// Whether a child does what they are asked. Understanding comes first (they must be old enough and
// have the language for it), then willingness — which is trust, mood, tiredness and how demanding
// the thing is. A tired two-year-old with low trust refuses most of the time, and should.
export function obedience(game, cmd) {
  const b = game.baby, days = ageDays(game);
  if (days < cmd.minDays) return { understands: false, p: 0, why: 'too young' };
  const language = clamp(b.dev.language, 0, 100) / 100;
  const regulation = clamp(b.dev.emotional, 0, 100) / 100;
  const understanding = Math.min(1, 0.35 + language * 0.8);
  let p = understanding * (0.3 + regulation * 0.5);
  p *= 0.55 + (b.emo.trust / 100) * 0.7;                       // a child does things for someone they trust
  p *= 1 - cmd.effort * 0.35;                                   // dishes are a bigger ask than a cuddle
  if (b.state.activity === 'sleeping') p *= 0.05;
  if (b.state.cryingSince) p *= 0.25;
  if (b.needs.rest < 30) p *= 0.45;                             // nobody cooperates when they are that tired
  if (b.needs.fullness < 30) p *= 0.6;
  if (b.emo.stress > 65) p *= 0.5;
  if (b.emo.happiness > 70) p *= 1.2;
  if (days > cmd.fluentDays) p *= 1.15;
  // The famous middle: eighteen months to three years, "no" is the whole personality.
  if (days > 480 && days < 1100) p *= 0.7;
  return { understands: true, p: clamp(p, 0.02, 0.95), why: null };
}

// Resolve a request into something that actually happens in the world. `applyAction` is passed in so
// this module never imports the action layer directly (which imports the story layer, which imports
// the engine — the cycle is not worth it).
export function resolveCommand(game, parsed, rng, applyAction) {
  const cmd = parsed.command;
  if (!cmd) return null;
  const b = game.baby, n = b.name, days = ageDays(game);
  const o = obedience(game, cmd);

  if (!o.understands) {
    return { kind: 'too_young', text: cmd.tooYoung ? cmd.tooYoung(n) : `${n} is too little to understand that.`, sev: 'info' };
  }
  const roll = rng.next();
  if (roll > o.p) {
    // A refusal is not nothing: being asked and saying no is how a child finds out they are a person.
    const defiant = days > 480 && days < 1400 && rng.chance(0.6);
    b.emo.esteem = clamp(b.emo.esteem + (defiant ? 0.6 : 0), 0, 100);
    const lines = b.state.activity === 'sleeping' ? [`${n} is fast asleep and hears none of it.`]
      : b.state.cryingSince ? [`${n} is crying too hard to take anything in.`]
      : days < 700 ? [`${n} looks straight at you and carries on with what they were doing.`, `${n} hears you, considers it, and wanders off in the other direction.`]
      : [`"No," says ${n}, with great conviction.`, `${n} says "no" and folds their arms. This is the age for it.`, `"Don't want to." ${n} does not move.`];
    return { kind: 'refused', text: lines[rng.int(0, lines.length - 1)], sev: 'info' };
  }

  // They are going to try. Whether it goes well depends on whether they can actually do it yet.
  const clumsy = days < cmd.fluentDays && rng.chance(0.55);
  const params = cmd.params(parsed.match || []);
  const res = applyAction(game, cmd.action, params, rng);
  if (!res || res.ok === false) {
    // The world said no — no clean bottle, wrong place, too soon. That is a real answer, not a bug.
    return { kind: 'blocked', text: `${n} sets off to do it, but ${String(res && res.message ? res.message : 'it cannot happen right now').replace(/^./, (c) => c.toLowerCase())}`, sev: 'info' };
  }
  const text = clumsy && cmd.clumsy ? cmd.clumsy(n) : cmd.say(n);
  // Being asked to do something and managing it is one of the few things that builds real self-esteem.
  b.emo.esteem = clamp(b.emo.esteem + (clumsy ? 1.2 : 2.4), 0, 100);
  b.emo.happiness = clamp(b.emo.happiness + 1.5, 0, 100);
  b.dev.emotional = clamp(b.dev.emotional + 0.02, 0, 100);
  return { kind: 'obeyed', action: cmd.action, clumsy, text, sev: 'good', result: res };
}

// ---------------------------------------------------------------- what words do on their own

// Praise, cruelty, reassurance and apology, applied directly. These are deliberately asymmetric: a
// kind word nudges, a cruel one wounds, and it takes many of the first to undo one of the second —
// which is exactly how it works with real children.
export function applyWords(game, parsed, tone) {
  const b = game.baby, e = b.emo, days = ageDays(game);
  // Under about four months a baby reads tone and face, not meaning. It still lands — just as tone.
  const comprehension = days < 120 ? 0.35 : days < 300 ? 0.6 : days < 700 ? 0.85 : 1;
  const notes = [];
  const bump = (k, v) => { e[k] = clamp(e[k] + v * comprehension, 0, 100); };

  if (parsed.cruel || tone === 'harsh') {
    const hard = parsed.cruel;
    bump('esteem', hard ? -9 : -4);
    bump('trust', hard ? -7 : -3.5);
    bump('happiness', hard ? -12 : -6);
    bump('security', hard ? -6 : -3);
    bump('stress', hard ? 22 : 12);
    b.dev.emotional = clamp(b.dev.emotional - 0.05 * comprehension, 0, 100);
    notes.push(hard ? 'cruel' : 'harsh');
  } else if (parsed.praise) {
    bump('esteem', 4.5);
    bump('happiness', 5);
    bump('trust', 2);
    bump('stress', -5);
    notes.push('praise');
  }
  if (parsed.reassure) { bump('security', 4); bump('stress', -6); notes.push('reassurance'); }
  if (parsed.apology && (game.parent.tempers.yells + game.parent.tempers.screams + (game.parent.tempers.smacks || 0)) > 0) {
    // Repair matters. It does not erase what happened, but a child who is apologised to recovers
    // faster than one who is not — and it teaches them that this is what people do.
    bump('trust', 3); bump('security', 3); bump('stress', -8); bump('esteem', 1.5);
    notes.push('repair');
  }
  return notes;
}
