// The story layer: unpredictable life events, notifications, interactive choices, emergent traits
// and the chaptered arc that survives between sessions.
//
// One entry point per engine step (rollStoryEvents) keeps this cheap: the catalog is indexed once at
// module load, a single probability decides whether anything happens at all, and only then are
// conditions evaluated.
import { DAY, HOUR, MIN, clamp, TEMPERAMENT_IDS, WEATHERS, ILLNESSES } from '../../shared/constants.js';
import { hashSeed } from './rng.js';
import { log, ageDays, isNight } from './engine.js';
import { mk } from './health.js';
import { addCelebration, decayCelebration, computeMood, fillText } from './mood.js';
import { addMemory, evaluateTraits, newChapterAccumulator, sampleChapterMood, writeChapter, hasTrait } from './storyChapters.js';
import { GOOD_EVENTS, INFO_EVENTS, SOCIAL_HINTS } from './storyEvents.js';
import { BAD_EVENTS, CHOICE_EVENTS } from './storyEvents2.js';

const CATALOG = [...GOOD_EVENTS, ...INFO_EVENTS, ...SOCIAL_HINTS, ...BAD_EVENTS, ...CHOICE_EVENTS];
const BY_ID = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
const BAD_IDS = new Set(BAD_EVENTS.map((e) => e.id));

// Roughly how many notable beats a baby-day should contain before conditions thin the field.
const EVENTS_PER_DAY = 4.5;
const MAX_NOTIFICATIONS = 40;
const MAX_PENDING_CHOICES = 3;

// ---------------------------------------------------------------- state

export function ensureStory(game) {
  let st = game.story;
  if (!st || typeof st !== 'object') st = game.story = {};
  if (!st.temperament || !TEMPERAMENT_IDS.includes(st.temperament)) {
    st.temperament = TEMPERAMENT_IDS[hashSeed(String(game.id || 'cradle') + ':temperament') % TEMPERAMENT_IDS.length];
  }
  if (!Array.isArray(st.traits)) st.traits = [];
  if (!Array.isArray(st.chapters)) st.chapters = [];
  if (!Array.isArray(st.memories)) st.memories = [];
  if (typeof st.celebration !== 'number' || !Number.isFinite(st.celebration)) st.celebration = 0;
  if (!st.counters || typeof st.counters !== 'object') st.counters = {};
  for (const k of ['giggler', 'sensitive_sleeper', 'cuddly', 'picky_eater', 'explorer', 'daredevil', 'wary', 'chatterbox', 'bookworm', 'gentle_soul', 'foodie', 'feeds', 'reads']) {
    if (typeof st.counters[k] !== 'number') st.counters[k] = 0;
  }
  if (!st.stats || typeof st.stats !== 'object') st.stats = {};
  for (const k of ['wakes', 'nightWakes', 'earlyWakes', 'heldH', 'roams', 'badEvents', 'goodEvents']) {
    if (typeof st.stats[k] !== 'number') st.stats[k] = 0;
  }
  if (!st.cooldowns || typeof st.cooldowns !== 'object') st.cooldowns = {};
  if (!Array.isArray(st.fired)) st.fired = [];
  if (!st.chapter) st.chapter = newChapterAccumulator(ageDays(game));
  if (!st.weather || !WEATHERS.includes(st.weather)) st.weather = 'clear';
  if (typeof st.weatherUntil !== 'number') st.weatherUntil = 0;
  if (typeof st.lastIllnessId === 'undefined') st.lastIllnessId = game.baby.illness ? game.baby.illness.id : null;
  if (typeof st.lastDayEvaluated !== 'number') st.lastDayEvaluated = Math.floor(ageDays(game));
  if (typeof st.lastMoodSample !== 'number') st.lastMoodSample = 0;
  if (!Array.isArray(game.notifications)) game.notifications = [];
  if (!Array.isArray(game.pendingChoices)) game.pendingChoices = [];
  return st;
}

export function notify(game, { kind = 'story', sev = 'info', title, text, cta = null }) {
  if (!Array.isArray(game.notifications)) game.notifications = [];
  const n = { id: `n${game.sim.steps}_${game.notifications.length}_${Math.floor(game.sim.time)}`, t: game.sim.time, kind, sev, title, text, cta };
  game.notifications.unshift(n);
  if (game.notifications.length > MAX_NOTIFICATIONS) game.notifications.length = MAX_NOTIFICATIONS;
  return n;
}

// ---------------------------------------------------------------- conditions

function contextOf(game, opts) {
  const b = game.baby, s = b.state, st = game.story, t = game.sim.time;
  const days = ageDays(game);
  const parentAway = game.parent.awayUntil > t;
  const sitter = game.parent.babysitterUntil > t;
  return {
    days, t, b, s, st,
    awake: s.activity !== 'sleeping',
    night: isNight(game),
    // "supervised" means the player is present and watching — offline catch-up is unsupervised.
    supervised: !parentAway && !(opts && opts.offline) && !s.hospitalized,
    mobile: !!(b.milestones.crawls || b.milestones.walks || b.milestones.pulls_stand),
    location: s.held ? 'held' : s.location,
    sitter,
  };
}

function matches(e, game, cx) {
  if (e.minDays != null && cx.days < e.minDays) return false;
  if (e.maxDays != null && cx.days > e.maxDays) return false;
  if (e.awake != null && cx.awake !== e.awake) return false;
  if (e.night != null && cx.night !== e.night) return false;
  if (e.supervised != null && cx.supervised !== e.supervised) return false;
  if (e.mobile != null && cx.mobile !== e.mobile) return false;
  if (e.locations && !e.locations.includes(cx.location)) return false;
  if (e.noIllness && cx.b.illness) return false;
  if (e.minTrust != null && cx.b.emo.trust < e.minTrust) return false;
  if (e.maxStress != null && cx.b.emo.stress > e.maxStress) return false;
  if (e.seasons && !e.seasons.includes(game.house.season)) return false;
  if (e.weather && !e.weather.includes(cx.st.weather)) return false;
  if (e.temperaments && !e.temperaments.includes(cx.st.temperament)) return false;
  if (e.traits && !e.traits.every((id) => hasTrait(game, id))) return false;
  if (e.hasPackage != null && (game.house.doorPackages.length > 0) !== e.hasPackage) return false;
  if (e.needToys && !e.needToys.every((id) => game.inventory.toys.includes(id))) return false;
  if (e.needMilestones && !e.needMilestones.every((id) => cx.b.milestones[id])) return false;
  if (e.noMilestones && e.noMilestones.some((id) => cx.b.milestones[id])) return false;
  if (e.needProofing && !e.needProofing.every((id) => game.house.proofing[id])) return false;
  if (e.noProofing && e.noProofing.some((id) => game.house.proofing[id])) return false;
  if (e.inventory) for (const [k, min] of Object.entries(e.inventory)) if ((game.inventory[k] || 0) < min) return false;
  if (e.minDev) for (const [k, v] of Object.entries(e.minDev)) if ((cx.b.dev[k] || 0) < v) return false;
  if (e.minNeeds) for (const [k, v] of Object.entries(e.minNeeds)) if ((cx.b.needs[k] || 0) < v) return false;
  if (e.maxNeeds) for (const [k, v] of Object.entries(e.maxNeeds)) if ((cx.b.needs[k] || 0) > v) return false;
  return true;
}

// ---------------------------------------------------------------- effects

export function applyEffects(game, fx, rng, sourceId = 'story') {
  if (!fx) return;
  const b = game.baby, n = b.needs, e = b.emo, s = b.state, st = game.story;
  if (fx.needs) for (const [k, v] of Object.entries(fx.needs)) if (typeof n[k] === 'number') n[k] = clamp(n[k] + v);
  if (fx.emo) for (const [k, v] of Object.entries(fx.emo)) if (typeof e[k] === 'number') e[k] = clamp(e[k] + v);
  if (fx.dev) for (const [k, v] of Object.entries(fx.dev)) if (typeof b.dev[k] === 'number') b.dev[k] = clamp(b.dev[k] + v);
  if (typeof fx.health === 'number') n.health = clamp(n.health + fx.health);
  if (typeof fx.rash === 'number') b.phys.rash = clamp(b.phys.rash + fx.rash);
  if (fx.celebrate) addCelebration(game, fx.celebrate);
  if (fx.inv) {
    for (const [k, v] of Object.entries(fx.inv)) {
      if (k === 'toys') { if (typeof v === 'string' && !game.inventory.toys.includes(v)) game.inventory.toys.push(v); continue; }
      if (typeof game.inventory[k] === 'number') game.inventory[k] = Math.max(0, game.inventory[k] + v);
    }
  }
  if (fx.wake && s.activity === 'sleeping') { s.activity = 'awake'; s.awakeSince = game.sim.time; s.sleepSince = null; }
  if (fx.sleep && s.activity !== 'sleeping') { s.activity = 'sleeping'; s.sleepSince = game.sim.time; s.cryingSince = null; s.cryIntensity = 0; }
  if (fx.cry && !s.cryingSince) {
    s.cryingSince = game.sim.time; s.cryCause = typeof fx.cry === 'string' ? fx.cry : 'uncomfortable';
    s.cryIntensity = 0.85; game.stats.cries++; b.history.criesTotal++;
  }
  if (fx.milestone && !b.milestones[fx.milestone]) b.milestones[fx.milestone] = Math.floor(ageDays(game));
  if (fx.trait && st && st.counters) st.counters[fx.trait] = (st.counters[fx.trait] || 0) + 1;
  if (fx.memory) addMemory(game, fillText(fx.memory.text, game), fx.memory.weight || 40, fx.memory.kind || 'moment');
  if (fx.illness && !b.illness) {
    const def = ILLNESSES[fx.illness.id];
    if (def) {
      b.illness = mk(fx.illness.id, game, fx.illness.severity || 30, rng);
      b.illness.known = !!fx.illness.known;
      if (fx.illness.peak) b.illness.peak = fx.illness.peak;
    }
  }
  if (fx.injury) {
    const t = game.sim.time, severe = !!fx.injury.severe;
    n.health = clamp(n.health - (fx.injury.dmg || 8));
    e.stress = clamp(e.stress + (fx.injury.dmg || 8) * 0.9);
    b.injuries.push({ kind: fx.injury.kind || 'bump', at: t, healAt: t + (severe ? 4 : 1) * DAY, pain: severe ? 14 : 6, severe });
    game.stats.hazards++;
  }
  void sourceId;
}

// ---------------------------------------------------------------- firing

function fire(game, e, rng, cx) {
  const st = game.story;
  const text = fillText(e.text[rng.int(0, e.text.length - 1)], game);
  const sev = e.sev || 'info';
  st.cooldowns[e.id] = game.sim.time + (e.cooldownH || 6) * HOUR;
  if (e.once && !st.fired.includes(e.id)) st.fired.push(e.id);
  applyEffects(game, e.effects, rng, e.id);

  const type = e.effects && e.effects.hint ? 'social_hint' : 'story';
  log(game, type, text, sev);

  if (sev === 'good') { st.stats.goodEvents++; if (st.chapter) { st.chapter.goodEvents++; if (st.chapter.highlights.length < 6) st.chapter.highlights.push(text); } }
  if (BAD_IDS.has(e.id) || sev === 'danger') { st.stats.badEvents++; if (st.chapter) { st.chapter.badEvents++; if (sev === 'danger' && st.chapter.highlights.length < 6) st.chapter.highlights.push(text); } }
  if (e.effects && e.effects.milestone && st.chapter) st.chapter.milestones.push(e.effects.milestone);

  // notifications: always for danger, plus anything the catalog asks for explicitly
  const ndef = e.effects && e.effects.notify;
  if (ndef || sev === 'danger') {
    notify(game, {
      kind: (ndef && ndef.kind) || (sev === 'danger' ? 'danger' : 'story'),
      sev,
      title: fillText((ndef && ndef.title) || (sev === 'danger' ? 'Emergency' : 'Something happened'), game),
      text,
      cta: (ndef && ndef.cta) || (sev === 'danger' ? { action: 'doctor', params: { kind: 'sick' }, label: 'Call the doctor' } : null),
    });
  }
  if (e.choice) openChoice(game, e, text, rng);
  void cx;
  return e;
}

function openChoice(game, e, text, rng) {
  if (game.pendingChoices.length >= MAX_PENDING_CHOICES) return;
  if (game.pendingChoices.some((c) => c.eventId === e.id)) return;
  const c = e.choice;
  const choice = {
    id: `c${game.sim.steps}_${e.id}`,
    eventId: e.id,
    t: game.sim.time,
    deadline: game.sim.time + (c.deadlineH || 0.5) * HOUR,
    title: fillText(c.title, game),
    text: fillText(c.text, game),
    lead: text,
    defaultOption: c.defaultOption,
    options: c.options.map((o) => ({ id: o.id, label: fillText(o.label, game), hint: fillText(o.hint || '', game) })),
  };
  game.pendingChoices.push(choice);
  notify(game, { kind: 'choice', sev: e.sev || 'warn', title: choice.title, text: choice.text, cta: { action: 'ui:choice', params: { choiceId: choice.id }, label: 'Decide' } });
  void rng;
}

// ---------------------------------------------------------------- choices

export function resolveChoice(game, choiceId, optionId, rng, { timedOut = false } = {}) {
  ensureStory(game);
  const idx = game.pendingChoices.findIndex((c) => c.id === choiceId);
  if (idx < 0) return { ok: false, message: 'That moment has already passed.' };
  const choice = game.pendingChoices[idx];
  const def = BY_ID[choice.eventId];
  const outcomes = def && def.choice ? def.choice.outcomes : null;
  const pick = (outcomes && outcomes[optionId]) ? optionId : choice.defaultOption;
  const outcome = outcomes ? outcomes[pick] : null;
  game.pendingChoices.splice(idx, 1);
  if (!outcome) return { ok: true, message: 'The moment passed.' };

  // An option may route straight into the existing temper consequences.
  if (outcome.temper) {
    applyTemper(game, outcome.temper, fillText(outcome.text || '', game));
    return { ok: true, message: 'You lost your temper.', outcome: { sev: 'danger', text: fillText(outcome.text || '', game) } };
  }
  applyEffects(game, outcome.effects, rng, choice.eventId);
  const text = fillText(outcome.text, game);
  log(game, 'choice', `${timedOut ? '(You hesitated) ' : ''}${text}`, outcome.sev || 'info');
  if (outcome.effects && outcome.effects.memory) { /* already added by applyEffects */ }
  if ((outcome.sev || 'info') === 'good' && game.story.chapter && game.story.chapter.highlights.length < 6) game.story.chapter.highlights.push(text);
  return { ok: true, message: text, outcome: { sev: outcome.sev || 'info', text } };
}

// Mirrors the numeric consequences of the `yell` handler without importing actions.js (cycle).
function applyTemper(game, kind, lead) {
  const b = game.baby, e = b.emo, s = b.state;
  const hard = kind === 'scream';
  game.parent.tempers[hard ? 'screams' : 'yells']++;
  game.stats[hard ? 'screams' : 'yells']++;
  e.trust = clamp(e.trust - (hard ? 15 : 8));
  e.happiness = clamp(e.happiness - (hard ? 20 : 12));
  e.stress = clamp(e.stress + (hard ? 40 : 25));
  e.security = clamp(e.security - (hard ? 15 : 8));
  b.dev.emotional = clamp(b.dev.emotional - (hard ? 0.04 : 0.02));
  if (s.activity === 'sleeping') { s.activity = 'awake'; s.awakeSince = game.sim.time; s.sleepSince = null; }
  s.cryingSince = s.cryingSince || game.sim.time; s.cryCause = 'scared'; s.cryIntensity = 1; s.lastAnsweredCryAt = 0;
  const text = `${lead ? lead + ' ' : ''}You ${hard ? 'screamed at' : 'yelled at'} ${b.name}. ${b.sex === 'girl' ? 'She' : 'He'} froze, then dissolved into frightened tears. Trust took a serious hit.`;
  log(game, 'temper', text, 'danger');
  addMemory(game, `the day you ${hard ? 'screamed' : 'shouted'} and ${b.name} could not stop crying`, 78, 'hard');
  if (game.story.chapter) game.story.chapter.tempers++;
  notify(game, { kind: 'danger', sev: 'danger', title: 'You lost your temper', text });
}

function expireChoices(game, rng) {
  for (const c of game.pendingChoices.slice()) {
    if (c.deadline <= game.sim.time) resolveChoice(game, c.id, c.defaultOption, rng, { timedOut: true });
  }
}

// ---------------------------------------------------------------- per-step

export function rollStoryEvents(game, dtH, rng, opts = {}) {
  const st = ensureStory(game);
  const b = game.baby, t = game.sim.time;
  const days = ageDays(game);

  decayCelebration(game, dtH);
  expireChoices(game, rng);

  // weather drifts every few days and feeds event conditions
  if (t >= st.weatherUntil) {
    const season = game.house.season;
    const pool = season === 'winter' ? ['clear', 'cloudy', 'snow', 'cold_snap', 'rain']
      : season === 'summer' ? ['clear', 'clear', 'cloudy', 'heatwave', 'storm']
        : ['clear', 'cloudy', 'rain', 'cloudy', 'storm'];
    st.weather = pool[rng.int(0, pool.length - 1)];
    st.weatherUntil = t + rng.range(8, 30) * HOUR;
  }

  // ambient counters that traits are derived from
  if (b.state.held) st.stats.heldH += dtH;

  // mood sampling for the chapter arc (every ~30 sim minutes)
  if (t - st.lastMoodSample > 30 * MIN) {
    st.lastMoodSample = t;
    sampleChapterMood(game, computeMood(game).value);
  }

  // illness onset detection -> unmistakable alert
  const curIll = b.illness ? b.illness.id : null;
  if (curIll !== st.lastIllnessId) {
    if (curIll) {
      const def = ILLNESSES[curIll];
      const dangerous = def && def.danger >= 1.0;
      notify(game, {
        kind: 'illness', sev: dangerous ? 'danger' : 'warn',
        title: `${b.name} is unwell`,
        text: b.illness.known ? `Diagnosed: ${def.label}.` : `${b.name} is off — ${symptomHint(curIll)}. A doctor can say what it is.`,
        cta: { action: 'doctor', params: { kind: 'sick' }, label: 'Telehealth sick visit' },
      });
      if (st.chapter) st.chapter.illnesses.push(curIll);
    }
    st.lastIllnessId = curIll;
  }

  // once-a-day bookkeeping: traits and the chapter cadence
  const dayIdx = Math.floor(days);
  if (dayIdx !== st.lastDayEvaluated) {
    st.lastDayEvaluated = dayIdx;
    const trait = evaluateTraits(game, days);
    if (trait) {
      log(game, 'trait', `${b.name} is turning into ${trait.label.toLowerCase()}.`, 'good');
      notify(game, { kind: 'story', sev: 'good', title: 'Who they are becoming', text: `${b.name} is turning into ${trait.label.toLowerCase()}.` });
    }
    if (st.chapter && days - st.chapter.dayStart >= 7) writeChapterNow(game, 'online');
  }

  // the roll itself
  const cx = contextOf(game, opts);
  let rate = EVENTS_PER_DAY / 24; // per hour
  if (!cx.awake) rate *= 0.25;
  if (!cx.supervised && cx.mobile) rate *= 1.6;
  if (opts.offline) rate *= 1.15;
  if (!rng.chance(Math.min(0.6, rate * dtH))) return null;

  const pool = [];
  let total = 0;
  for (const e of CATALOG) {
    if (e.once && st.fired.includes(e.id)) continue;
    if ((st.cooldowns[e.id] || 0) > t) continue;
    if (!matches(e, game, cx)) continue;
    const w = Math.max(0.1, e.weight || 1);
    total += w; pool.push([e, total]);
  }
  if (!pool.length) return null;
  const r = rng.next() * total;
  const chosen = (pool.find(([, acc]) => r <= acc) || pool[pool.length - 1])[0];
  return fire(game, chosen, rng, cx);
}

function symptomHint(id) {
  return {
    cold: 'snuffly and coughing', fever: 'hot and flushed', ear_infection: 'tugging at one ear',
    stomach_bug: 'vomiting and off feeds', rsv: 'wheezing and breathing fast', croup: 'barking like a seal',
    hfm: 'covered in small blisters', chickenpox: 'breaking out in spots', flu: 'burning up and floppy',
    pertussis: 'coughing in fits until {they} goes red', jaundice: 'yellow around the eyes',
    poisoning: 'drowsy and vomiting', botulism: 'weak and floppy', ate_object: 'gagging and clutching {their} belly',
    failure_to_thrive: 'listless and not growing',
  }[id] || 'not right';
}

// Writes a chapter and returns it (used by the day cadence and by offline catch-up).
export function writeChapterNow(game, mode = 'online', minDays = 0.2) {
  ensureStory(game);
  const ch = writeChapter(game, mode, minDays);
  if (ch) {
    log(game, 'chapter', `Chapter ${ch.index}: ${ch.title}`, 'info');
    notify(game, { kind: 'story', sev: 'info', title: `Chapter ${ch.index}: ${ch.title}`, text: ch.summary });
  }
  return ch;
}

export { computeMood, hasTrait };
