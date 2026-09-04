// Extended interactions, part 2: helpers shared with actions2.js (mirrors of the private helpers in actions.js),
// language teaching, feeding depth (allergens, cups, self-feeding, manners) and emotional coaching / discipline.
// Every new state field is optional and guarded, so games saved before this module existed keep loading.
import { HOUR, DAY, clamp, WORDS_BY_AGE, BODY_PARTS, ALLERGENS, FEELINGS } from '../../shared/constants.js';
import { log, ageDays } from './engine.js';
import { hospitalize } from './health.js';

export const fail = (message) => ({ ok: false, message });
export const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
export const he = (b) => (b.sex === 'girl' ? 'she' : 'he');
export const He = (b) => (b.sex === 'girl' ? 'She' : 'He');
export const his = (b) => (b.sex === 'girl' ? 'her' : 'his');

// Extension namespace on baby.state (old saves have no `x`; everything inside is optional).
export function ext(game) { const s = game.baby.state; if (!s.x || typeof s.x !== 'object') s.x = {}; return s.x; }
export function today(game) { const x = ext(game), d = Math.floor(ageDays(game)); if (x.day !== d || !x.today) { x.day = d; x.today = {}; } return x.today; }
export function count(game, key, by = 1) { const t = today(game); t[key] = (t[key] || 0) + by; return t[key]; }
export function diminish(n, free = 2) { return n <= free ? 1 : n <= free * 2 ? 0.6 : n <= free * 3 ? 0.3 : 0.1; }
export function touch(game) { game.baby.state.lastInteractionAt = game.sim.time; }
export function bond(game, amount) { const b = game.baby, t = game.sim.time; if (t - (b.state.lastBondAt || -1e9) < HOUR) return; b.state.lastBondAt = t; b.emo.trust = clamp(b.emo.trust + amount); }
export function answerCry(game, soothing = 1) {
  const b = game.baby, s = b.state, t = game.sim.time;
  if (!s.cryingSince) return;
  const waited = (t - s.cryingSince) / 60;
  const quality = waited < 3 ? 1 : waited < 8 ? 0.85 : waited < 15 ? 0.6 : waited < 30 ? 0.35 : waited < 60 ? 0.15 : 0.05;
  b.responsiveness = clamp(b.responsiveness * 0.9 + quality * 0.1, 0, 1);
  b.emo.trust = clamp(b.emo.trust + (quality - 0.4) * 0.25 * soothing);
  b.emo.security = clamp(b.emo.security + (quality - 0.3) * 1.0);
  b.emo.stress = clamp(b.emo.stress - 8 * soothing);
  b.history.criesAnswered = (b.history.criesAnswered || 0) + 1;
  s.lastAnsweredCryAt = t;
}
export function wakeIfSleeping(game, why, gentle) {
  const s = game.baby.state;
  if (s.activity !== 'sleeping') return false;
  s.activity = 'awake'; s.awakeSince = game.sim.time; s.sleepSince = null;
  if (!gentle) { game.baby.emo.stress = clamp(game.baby.emo.stress + 6); game.baby.needs.rest = clamp(game.baby.needs.rest - 5); }
  log(game, 'woke', `${game.baby.name} woke up (${why}).`, 'info');
  return true;
}
export const sleeping = (game) => game.baby.state.activity === 'sleeping';
export function needAwake(game) { return sleeping(game) ? fail(`${game.baby.name} is asleep.`) : null; }
export function needAge(game, minDays, what) { return ageDays(game) >= minDays ? null : fail(`${game.baby.name} is too young for ${what} — wait until about ${Math.round(minDays / 30.44)} months.`); }
export function gain(game, table, mult = 1) { const d = game.baby.dev; for (const k of Object.keys(table)) d[k] = clamp(d[k] + table[k] * mult); }
export function effort(game) { const n = game.baby.needs, e = game.baby.emo; return (n.stimulation > 88 ? 0.4 : 1) * (n.rest < 25 ? 0.5 : 1) * (e.stress > 60 ? 0.6 : 1); }
export function memory(game, text) { const x = ext(game); x.memories = (Array.isArray(x.memories) ? x.memories : []).concat([{ t: game.sim.time, text }]).slice(-24); log(game, 'memory', text, 'good'); }
export function fallAsleep(game, where) { const s = game.baby.state; s.activity = 'sleeping'; s.sleepSince = game.sim.time; s.cryingSince = null; s.cryIntensity = 0; s.selfPlayUntil = 0; log(game, 'slept', `${game.baby.name} fell asleep ${where}.`, 'good'); }
export function startCry(game, cause, intensity = 0.7) { const s = game.baby.state; if (!s.cryingSince) { s.cryingSince = game.sim.time; game.stats.cries++; game.baby.history.criesTotal = (game.baby.history.criesTotal || 0) + 1; } s.cryCause = cause; s.cryIntensity = Math.max(s.cryIntensity || 0, intensity); }
export function pointsOf(game) { const inv = game.inventory; return Array.isArray(inv.toys) ? inv.toys : []; }

// Same numeric consequences as the yell / scream handlers in actions.js (kept in sync by tests).
export function temper(game, kind) {
  const b = game.baby, e = b.emo, s = b.state, scream = kind === 'scream';
  if (scream) { game.parent.tempers.screams++; game.stats.screams++; } else { game.parent.tempers.yells++; game.stats.yells++; }
  e.trust = clamp(e.trust - (scream ? 15 : 8)); e.happiness = clamp(e.happiness - (scream ? 20 : 12)); e.stress = clamp(e.stress + (scream ? 40 : 25)); e.security = clamp(e.security - (scream ? 15 : 8));
  b.dev.emotional = clamp(b.dev.emotional - (scream ? 0.04 : 0.02));
  wakeIfSleeping(game, scream ? 'terrified by screaming' : 'startled by yelling', false);
  startCry(game, 'scared', 1); s.lastAnsweredCryAt = 0;
}

export function vocabulary(b) { if (!Array.isArray(b.vocabulary)) b.vocabulary = []; return b.vocabulary; }
export const knownWords = (b) => vocabulary(b).filter((w) => w.known).length;
// Repetitions make a word "known"; babies do not say words before ~10 months no matter how often they hear them.
export function addWord(game, word, reps = 1) {
  const b = game.baby, days = ageDays(game), list = vocabulary(b);
  let w = list.find((v) => v.word === word);
  if (!w) { w = { word, reps: 0, known: false, firstAt: game.sim.time, knownAt: null }; list.push(w); }
  w.reps += reps;
  const need = days < 365 ? 8 : days < 730 ? 5 : 3;
  if (!w.known && w.reps >= need && days >= 300) {
    w.known = true; w.knownAt = game.sim.time; b.dev.language = clamp(b.dev.language + 0.03);
    log(game, 'word', `${b.name} said "${word}" — a new word! (${knownWords(b)} known)`, 'good', { word });
  }
  return w;
}

const wordPool = (days) => WORDS_BY_AGE.filter((tier) => days >= tier.minDays).flatMap((tier) => tier.words);
const ALLERGEN = Object.fromEntries(ALLERGENS.map((a) => [a.id, a]));
const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export const MORE_HANDLERS = {
  // ---------------- learning / language ----------------
  teach_word(game, { word }) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    word = String(word || '').trim().toLowerCase().slice(0, 24);
    if (!word) return fail('Pick a word.');
    const gate = needAge(game, 150, 'word teaching') || needAwake(game); if (gate) return gate;
    if (!WORDS_BY_AGE.some((t) => t.words.includes(word))) return fail('That word is not on the list.');
    if (!wordPool(days).includes(word)) return fail(`"${word}" is too advanced for ${b.name} right now.`);
    const k = count(game, 'words'), eff = diminish(k, 6) * effort(game);
    touch(game); gain(game, { language: 0.008, cognitive: 0.002 }, eff); n.stimulation = clamp(n.stimulation + 6 * eff); n.affection = clamp(n.affection + 2);
    const w = addWord(game, word, 1);
    if (k > 18) { b.emo.stress = clamp(b.emo.stress + 3); log(game, 'teach', `Enough drilling — ${b.name} turned away. Words stick through play, not repetition marathons.`, 'warn'); }
    else log(game, 'teach', `You pointed and said "${word}" to ${b.name}${w.known ? ` — ${he(b)} said it back!` : ` (${w.reps}×)`}.`, 'good');
    return ok(w.known ? `"${word}" — known!` : `"${word}" ×${w.reps}`, { word: w });
  },
  body_parts(game, _, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 240, 'naming body parts') || needAwake(game); if (gate) return gate;
    const k = count(game, 'body'), eff = diminish(k, 3) * effort(game), part = rng.pick(BODY_PARTS);
    touch(game); gain(game, { language: 0.008, cognitive: 0.006, social: 0.002 }, eff); n.stimulation = clamp(n.stimulation + 8 * eff); n.affection = clamp(n.affection + 3);
    const w = addWord(game, part, 1);
    const points = days >= 365 && rng.chance(0.25 + b.dev.cognitive / 200);
    log(game, 'teach', points ? `"Where's your ${part}?" — ${b.name} pointed straight at it!` : `"This is your ${part}…" ${b.name} watched your hands with interest.`, 'good');
    return ok(points ? `${b.name} found ${his(b)} ${part}!` : `Named the ${part}.`, { word: w });
  },
  sing_abcs(game) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 365, 'the alphabet song') || needAwake(game); if (gate) return gate;
    const k = count(game, 'abcs'), eff = diminish(k, 3) * effort(game);
    touch(game); gain(game, { language: 0.01, cognitive: 0.006, emotional: 0.002 }, eff); n.stimulation = clamp(n.stimulation + 8 * eff); n.affection = clamp(n.affection + 4); b.emo.stress = clamp(b.emo.stress - 5);
    if (days >= 1095) b.counters.lessons.letters = (b.counters.lessons.letters || 0) + 0.34;
    log(game, 'abcs', `A-B-C-D… ${days >= 900 ? `${b.name} sang along, mostly in the right order.` : `${b.name} bounced to the tune.`}`, 'good');
    return ok('Sang the ABCs.');
  },
  count_together(game, { upTo = 5 }) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    upTo = Math.round(Number(upTo)); if (!Number.isFinite(upTo) || upTo < 3 || upTo > 20) upTo = 5;
    const gate = needAge(game, 540, 'counting together') || needAwake(game); if (gate) return gate;
    const k = count(game, 'count'), eff = diminish(k, 3) * effort(game) * (upTo > 10 && days < 1000 ? 0.5 : 1);
    touch(game); gain(game, { cognitive: 0.012, language: 0.004 }, eff); n.stimulation = clamp(n.stimulation + 10 * eff);
    if (days >= 800) b.counters.lessons.numbers = (b.counters.lessons.numbers || 0) + 0.34;
    log(game, 'count', `One, two, three… you counted ${upTo} blocks with ${b.name}${upTo > 10 && days < 1000 ? ' — too many for now, attention drifted' : ''}.`, 'good');
    return ok(`Counted to ${upTo}.`);
  },
  read_dialogic(game) {
    const b = game.baby, n = b.needs;
    const gate = needAge(game, 540, 'reading with questions') || needAwake(game); if (gate) return gate;
    if (!pointsOf(game).some((x) => x.includes('book'))) return fail('You have no books. Order picture books.');
    const k = count(game, 'readq'), eff = diminish(k, 3) * effort(game);
    touch(game); game.stats.reads++; b.counters.reads++;
    gain(game, { language: 0.024, cognitive: 0.012, emotional: 0.003 }, eff); n.stimulation = clamp(n.stimulation + 14 * eff); n.affection = clamp(n.affection + 5);
    log(game, 'read_q', `"What do you think the bear will do next?" Story time with questions for ${b.name}.`, 'good');
    return ok('Read and talked about the story.');
  },

  // ---------------- feeding depth ----------------
  introduce_allergen(game, { id }, rng) {
    const b = game.baby, s = b.state, x = ext(game), t = game.sim.time, days = ageDays(game);
    const def = ALLERGEN[String(id || '')]; if (!def) return fail('Pick an allergen food.');
    const gate = needAge(game, 180, 'allergen introduction') || needAwake(game); if (gate) return gate;
    if (b.illness) return fail(`Wait until ${b.name} is well — a reaction would be hard to tell apart from the illness.`);
    if (x.reaction && x.reaction.until > t) return fail(`${b.name} is still reacting to ${x.reaction.allergen}. Call the doctor.`);
    if (s.lastSolidsAt == null) return fail('Start regular solids (purees or cereal) first, then add allergens one at a time.');
    if (!b.allergens || typeof b.allergens !== 'object') b.allergens = {};
    const a = b.allergens[def.id] || (b.allergens[def.id] = { introducedAt: t, exposures: 0, reactions: 0, lastAt: -1e9, status: 'introducing' });
    if (a.status === 'allergic') return fail(`${b.name} is allergic to ${def.id}. Only re-try under the doctor's guidance.`);
    if (a.exposures > 0 && t - a.lastAt < 2 * DAY) return fail('Go gradually: leave a couple of days between exposures and introduce one new food at a time.');
    const p = def.risk * (days < 300 ? 0.5 : days < 365 ? 0.8 : days < 540 ? 1.2 : 1.6) * (a.status === 'tolerated' ? 0.03 : a.exposures >= 3 ? 0.15 : a.exposures > 0 ? 0.6 : 1);
    a.exposures++; a.lastAt = t; touch(game); b.needs.fullness = clamp(b.needs.fullness + 6); s.lastSolidsAt = t;
    if (rng.chance(p)) {
      const severe = rng.chance(0.25);
      a.reactions++; a.status = 'allergic';
      x.reaction = { allergen: def.id, kind: severe ? 'vomiting' : 'hives', since: t, until: t + (severe ? 8 : 4) * HOUR, severe, treated: false };
      b.needs.comfort = clamp(b.needs.comfort - (severe ? 35 : 22)); b.emo.stress = clamp(b.emo.stress + 25); b.needs.health = clamp(b.needs.health - (severe ? 12 : 4));
      startCry(game, 'in pain', 0.8);
      log(game, 'allergy', `Within minutes of the ${def.id}, ${b.name} ${severe ? `vomited and ${his(b)} lips began to swell` : 'broke out in red hives around the mouth and chest'}. This is an allergic reaction — call the doctor now.`, 'danger');
      return ok(`Allergic reaction to ${def.id}!`, { reaction: x.reaction });
    }
    if (a.exposures >= 3 && a.status !== 'tolerated') { a.status = 'tolerated'; log(game, 'allergen', `${b.name} has now had ${def.id} three times without any reaction. Keep it in the regular rotation to maintain tolerance.`, 'good'); }
    else log(game, 'allergen', `${b.name} tried ${def.label.toLowerCase()} (${ordinal(a.exposures)} exposure). No reaction so far — watch for hives or vomiting over the next hour.`, 'info');
    return ok(`${def.id}: no reaction (${a.exposures}×).`, { allergen: a });
  },
  allergy_call(game) {
    const b = game.baby, x = ext(game), t = game.sim.time, r = x.reaction;
    if (!r || r.until <= t) return fail('There is no reaction to report right now.');
    if (r.treated) return fail('The doctor has already advised on this reaction.');
    r.treated = true; r.until = Math.min(r.until, t + 2 * HOUR); b.needs.comfort = clamp(b.needs.comfort + 10);
    game.stats.doctorVisits++;
    const notes = [`Allergic reaction to ${r.allergen}: ${r.kind === 'hives' ? 'hives, no breathing trouble' : 'vomiting with lip swelling'}.`, `${b.name} is now flagged as allergic to ${r.allergen}. Avoid it until an allergist evaluates.`];
    const advice = r.severe ? ['This could progress to anaphylaxis — an ambulance is on its way for observation.', 'Ask about an epinephrine auto-injector before trying any other new allergen.'] : ["A dose of children's antihistamine; the hives should fade within a couple of hours.", 'Keep introducing the other allergens one at a time, on well days, early in the day.'];
    if (r.severe) hospitalize(game, 'a severe allergic reaction');
    const report = { at: t, kind: 'allergy', severity: r.severe ? 'danger' : 'warn', notes, advice, rx: [], percentile: null };
    b.doctorNotes.push(report); if (b.doctorNotes.length > 30) b.doctorNotes.shift();
    log(game, 'doctor', `Telehealth: ${notes[0]}`, report.severity);
    return ok('Doctor called.', { report });
  },
  offer_water(game) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAwake(game); if (gate) return gate;
    touch(game);
    if (days < 180) { n.health = clamp(n.health - 4); log(game, 'warn', `Water before 6 months can dangerously dilute a baby's sodium. ${b.name} seems sluggish.`, 'danger'); return ok('Babies under 6 months should not drink water.'); }
    const k = count(game, 'water');
    if (k > 4) { n.fullness = clamp(n.fullness - 4); log(game, 'water', `More water — that is the ${ordinal(k)} cup today. It fills a small tummy without any nutrition.`, 'warn'); return ok('Too much water today.'); }
    n.fullness = clamp(n.fullness + 5); gain(game, { motor: 0.004, emotional: days >= 365 ? 0.002 : 0 });
    log(game, 'water', `${b.name} sipped water from a cup${days < 300 ? ', most of it down the chin' : ''}.`, 'info');
    return ok('Offered water.');
  },
  self_feed(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, inv = game.inventory, x = ext(game);
    const gate = needAge(game, 240, 'self-feeding') || needAwake(game); if (gate) return gate;
    if (s.location !== 'high_chair') return fail(`Sit ${b.name} in the high chair first.`);
    if ((inv.finger_foods || 0) <= 0) return fail("You're out of finger foods. Order more.");
    inv.finger_foods--; touch(game); game.stats.feeds++; b.counters.feeds++; s.mealsToday = (s.mealsToday || 0) + 1;
    const drops = rng.int(0, 3); x.floorMess = (x.floorMess || 0) + drops;
    n.fullness = clamp(n.fullness + 26); s.lastFedAt = game.sim.time; s.lastSolidsAt = game.sim.time; n.clean = clamp(n.clean - 14);
    gain(game, { motor: 0.018, emotional: 0.004, cognitive: 0.002 });
    log(game, 'self_feed', `${b.name} fed ${he(b) === 'she' ? 'herself' : 'himself'} finger foods — pincer grasp practice, banana in the hair, ${drops ? `${drops} pieces on the floor` : 'nothing dropped'}.`, 'good');
    return ok(drops ? `Messy but proud. ${drops} bits on the floor.` : 'Ate it all, no mess!', { drops });
  },
  clean_drops(game) {
    const x = ext(game);
    if (!(x.floorMess > 0)) return ok('The floor is already clean.');
    x.floorMess = 0; log(game, 'clean', 'You wiped up the dropped food before anyone could eat it off the floor.', 'info');
    return ok('Floor cleaned.');
  },
  table_manners(game) {
    const b = game.baby, s = b.state, n = b.needs;
    const gate = needAge(game, 365, 'table manners') || needAwake(game); if (gate) return gate;
    if (s.location !== 'high_chair') return fail(`Manners are taught at the table — sit ${b.name} in the high chair.`);
    touch(game);
    if (n.fullness < 30) { b.emo.stress = clamp(b.emo.stress + 5); log(game, 'manners', `${b.name} is too hungry to hear about spoons. Feed first, teach later.`, 'warn'); return ok('Too hungry for a lesson.'); }
    const k = count(game, 'manners'), eff = diminish(k, 2) * effort(game);
    gain(game, { emotional: 0.008, motor: 0.006, social: 0.006 }, eff); n.stimulation = clamp(n.stimulation + 6 * eff);
    log(game, 'manners', `Spoon in the hand, napkin on the lap, "all done" instead of throwing. ${b.name} managed ${k > 4 ? 'about ten seconds' : 'most of the meal'}.`, 'good');
    return ok('Practised table manners.');
  },

  // ---------------- discipline / emotional coaching (toddler+) ----------------
  praise(game) {
    const gate = needAge(game, 365, 'praise that lands') || needAwake(game); if (gate) return gate;
    const b = game.baby, k = count(game, 'praise'), eff = diminish(k, 5);
    touch(game); b.emo.happiness = clamp(b.emo.happiness + 3 * eff); b.needs.affection = clamp(b.needs.affection + 4); bond(game, 0.05);
    gain(game, { emotional: 0.006, social: 0.003 }, eff);
    log(game, 'praise', k > 10 ? `Praise number ${k} today — ${b.name} has stopped hearing it.` : `"You put the cup on the table all by yourself!" ${b.name} beamed.`, k > 10 ? 'info' : 'good');
    return ok('Praised.');
  },
  gentle_correction(game) {
    const gate = needAge(game, 365, 'gentle correction') || needAwake(game); if (gate) return gate;
    const b = game.baby, s = b.state, k = count(game, 'correct'), eff = diminish(k, 4);
    touch(game); b.emo.stress = clamp(b.emo.stress + 2); gain(game, { emotional: 0.01, social: 0.004 }, eff);
    if (s.cryingSince) answerCry(game, 0.6);
    log(game, 'discipline', `"Gentle hands. Hitting hurts. Show me soft." You held ${b.name}'s hand and showed ${he(b) === 'she' ? 'her' : 'him'} how.`, 'good');
    return ok('Gentle correction.');
  },
  name_feeling(game, { feeling }) {
    const gate = needAge(game, 365, 'naming feelings') || needAwake(game); if (gate) return gate;
    feeling = String(feeling || '').toLowerCase(); if (!FEELINGS.includes(feeling)) return fail('Pick a feeling.');
    const b = game.baby, s = b.state, upset = !!s.cryingSince || b.emo.stress > 40;
    touch(game); addWord(game, feeling, 1);
    if (upset) { b.emo.stress = clamp(b.emo.stress - 10); gain(game, { emotional: 0.012, language: 0.006 }); answerCry(game, 0.8); }
    else gain(game, { emotional: 0.004, language: 0.004 });
    log(game, 'coach', `"You're ${feeling}. That's okay. I'm here." ${upset ? `${b.name}'s shoulders came down a little.` : `${b.name} repeated the word and moved on.`}`, 'good');
    return ok(`Named the feeling: ${feeling}.`);
  },
  time_in(game) {
    const gate = needAge(game, 365, 'time-in') || needAwake(game); if (gate) return gate;
    const b = game.baby, n = b.needs;
    touch(game); b.emo.stress = clamp(b.emo.stress - 15); b.emo.security = clamp(b.emo.security + 1); n.affection = clamp(n.affection + 8); gain(game, { emotional: 0.01 }); bond(game, 0.06);
    if (b.state.cryingSince) { answerCry(game, 1); b.state.cryIntensity = clamp(b.state.cryIntensity - 0.5, 0, 1); }
    log(game, 'coach', `You sat down on the floor with ${b.name} and waited out the storm together.`, 'good');
    return ok('Time-in.');
  },
  time_out(game, { minutes }) {
    const gate = needAge(game, 730, 'a time-out (they cannot understand it yet)') || needAwake(game); if (gate) return gate;
    const b = game.baby, years = ageDays(game) / 365;
    minutes = Math.round(Number(minutes)); if (!Number.isFinite(minutes) || minutes < 1 || minutes > 5) minutes = Math.max(1, Math.min(5, Math.round(years)));
    touch(game);
    const tooLong = minutes > years + 1;
    b.emo.trust = clamp(b.emo.trust - (tooLong ? 3 : 1)); b.emo.stress = clamp(b.emo.stress + (tooLong ? 12 : 6));
    if (!tooLong) gain(game, { emotional: 0.006 });
    log(game, 'discipline', tooLong ? `${minutes} minutes is too long for a ${Math.floor(years)}-year-old — ${b.name} forgot why ${he(b)} was there and just felt abandoned.` : `A brief ${minutes}-minute time-out on the step, then a hug and a do-over.`, tooLong ? 'warn' : 'info');
    return ok(`Time-out (${minutes} min).`);
  },
  harsh(game, { kind = 'shout' }) {
    const b = game.baby;
    kind = String(kind); if (!['shout', 'scream'].includes(kind)) return fail('Unknown punishment.');
    temper(game, kind === 'scream' ? 'scream' : 'yell');
    log(game, 'temper', kind === 'scream' ? `You screamed at ${b.name} as punishment. ${He(b)} is shaking. Punishment that terrifies teaches fear, not behaviour.` : `You shouted at ${b.name} as punishment. ${He(b)} flinched and burst into tears. Harsh punishment works exactly like yelling: trust takes a serious hit.`, 'danger');
    return ok('Harsh punishment.');
  },
};
