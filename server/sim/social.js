// Social life: the people around the baby. Contacts, calls, visits, gifts, advice (good and bad),
// a contact babysitter and the weekly playgroup. State lives on game.social; visitors on game.house.visitor.
// Everything is lazily created so games saved before this module existed keep loading.
import { DAY, HOUR, MIN, TIME, clamp, clothingSizeFor, diaperSizeFor, TOYS } from '../../shared/constants.js';
import { log, ageDays, clockSeconds } from './engine.js';
import { makeRng, hashSeed } from './rng.js';
import { RELATIONS, PERSONALITIES, CONTACT_TEMPLATES, CALL, VIDEO, MILESTONE_DELIGHT, PHOTO_REPLIES, ARRIVE, DEPART, VISIT_ACTIVITIES, INCOMING, PLAYGROUP_MOMENTS, GIFTS, ADVICE, ADVICE_INDEX } from './socialData.js';

const fail = (message) => ({ ok: false, message });
const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length)];
function weighted(rng, arr, wf) {
  const w = arr.map(wf); const total = w.reduce((a, x) => a + x, 0);
  if (total <= 0) return arr[0];
  let r = rng.next() * total;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

export function fill(text, game, c) {
  const b = game.baby, girl = b.sex === 'girl';
  return String(text)
    .replace(/\{baby\}/g, b.name).replace(/\{parent\}/g, game.parent.name || 'You')
    .replace(/\{me\}/g, c ? c.name : 'They')
    .replace(/\{He\}/g, girl ? 'She' : 'He').replace(/\{he\}/g, girl ? 'she' : 'he')
    .replace(/\{him\}/g, girl ? 'her' : 'him').replace(/\{his\}/g, girl ? 'her' : 'his');
}

// --- generation -------------------------------------------------------------
function makeContacts(game) {
  const rng = makeRng((game.sim.seed ^ 0x50c1a1) >>> 0);
  const core = CONTACT_TEMPLATES.filter((t) => t.core);
  const rest = CONTACT_TEMPLATES.filter((t) => !t.core).slice();
  for (let i = rest.length - 1; i > 0; i--) { const j = rng.int(0, i); const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp; }
  const count = rng.int(7, Math.min(9, CONTACT_TEMPLATES.length));
  const chosen = core.concat(rest).slice(0, count);
  const used = new Set();
  return chosen.map((t, i) => {
    let name = pick(rng, t.names);
    for (let k = 0; used.has(name) && k < t.names.length; k++) name = t.names[(t.names.indexOf(name) + 1) % t.names.length];
    used.add(name);
    const sk = t.skills;
    return {
      id: 'c' + (i + 1), name, relation: t.relation, personality: pick(rng, t.personalities),
      skills: {
        babysitting: +rng.range(sk.babysitting[0], sk.babysitting[1]).toFixed(2),
        cooking: +rng.range(sk.cooking[0], sk.cooking[1]).toFixed(2),
        advice: +rng.range(sk.advice[0], sk.advice[1]).toFixed(2),
      },
      availability: { days: t.days.slice().sort((a, b) => a - b), from: t.hours[0], to: t.hours[1] },
      distanceMin: rng.int(t.distance[0], t.distance[1]),
      initiative: t.initiative,
      relationship: +rng.range(t.warmth[0], t.warmth[1]).toFixed(1),
      lastContactAt: null, gifts: 0, visits: 0, calls: 0, declines: 0,
    };
  });
}

export function ensureSocial(game) {
  const s = (game.social && typeof game.social === 'object') ? game.social : {};
  if (!Array.isArray(s.contacts) || !s.contacts.length) s.contacts = makeContacts(game);
  if (!Array.isArray(s.invitations)) s.invitations = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!s.playgroup || typeof s.playgroup !== 'object') s.playgroup = { enrolled: false, weekday: 3, hour: 10, nextAt: null, activeUntil: 0, attends: 0 };
  if (typeof s.seq !== 'number') s.seq = 1;
  if (typeof s.visitsToday !== 'number') s.visitsToday = 0;
  if (typeof s.dayIndex !== 'number') s.dayIndex = Math.floor(ageDays(game));
  if (typeof s.mCount !== 'number') { s.mCount = Object.keys(game.baby.milestones || {}).length; s.mAt = -DAY; }
  if (typeof s.badAdvice !== 'number') s.badAdvice = 0;
  if (game.house && game.house.visitor === undefined) game.house.visitor = null;
  game.social = s;
  return s;
}

export const contactById = (s, id) => s.contacts.find((c) => c.id === id) || null;
export function weekday(game) { return (Math.floor((game.sim.time + TIME.BIRTH_CLOCK) / DAY) + 5) % 7; }
export function availableNow(game, c) {
  const h = clockSeconds(game) / HOUR;
  return c.availability.days.includes(weekday(game)) && h >= c.availability.from && h < c.availability.to;
}
// Whether a contact is under the weather this week — deterministic, visible in the view, 15% chance to pass a cold on.
export function hasSniffle(game, c) { return (hashSeed(c.id + ':' + c.name + ':' + Math.floor(game.sim.time / (7 * DAY))) % 100) < 22; }
const faceScale = (days) => (days < 60 ? 0.3 : days < 180 ? 0.65 : days < 365 ? 1 : 1.15);
const strangerWindow = (days) => days >= 210 && days <= 426;

function slog(game, s, text, sev = 'info', notify = false, title = 'Family') {
  log(game, 'social', text, sev);
  s.log.push({ t: game.sim.time, text, sev });
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
  if (notify && Array.isArray(game.notifications)) {
    game.notifications.unshift({ id: 'sn' + s.seq++, t: game.sim.time, kind: 'social', sev: sev === 'good' ? 'info' : sev, title, text });
  }
}

// Warmth from contact, with diminishing returns for pestering someone all day.
function warm(game, c, amount) {
  const t = game.sim.time;
  const since = c.lastContactAt == null ? Infinity : (t - c.lastContactAt) / HOUR;
  const f = since > 12 ? 1 : since > 4 ? 0.6 : since > 1 ? 0.3 : 0.1;
  c.relationship = clamp(c.relationship + amount * f, 0, 100);
  c.lastContactAt = t;
}

// --- gifts ------------------------------------------------------------------
function giveGift(game, c, rng, days) {
  const inv = game.inventory, b = game.baby;
  const pool = GIFTS.filter((g) => (g.minDays == null || days >= g.minDays) && (g.maxDays == null || days <= g.maxDays) && (!g.cook || c.skills.cooking > 0.55));
  const g = weighted(rng, pool, (x) => x.w);
  let what = g.label;
  if (g.kind === 'clothes') {
    const size = clothingSizeFor(b.phys.weightKg, b.phys.heightCm);
    inv.clothes[size] = (inv.clothes[size] || 0) + g.qty;
    what = `${g.qty} outfits in size ${size}`;
  } else if (g.kind === 'diapers') {
    const size = diaperSizeFor(b.phys.weightKg);
    inv.diapers[size] = (inv.diapers[size] || 0) + g.qty;
    what = `${g.qty} size ${size} diapers`;
  } else if (g.kind === 'stock') {
    inv[g.key] = (inv[g.key] || 0) + g.qty;
  } else if (g.kind === 'toy') {
    const fits = TOYS.filter((t) => days >= t.minDays && days <= t.maxDays && !inv.toys.includes(t.id));
    if (g.toy && !inv.toys.includes(g.toy)) { inv.toys.push(g.toy); what = 'board books'; }
    else if (fits.length) { const t = pick(rng, fits); inv.toys.push(t.id); what = t.label.toLowerCase(); }
    else { inv.wipes = (inv.wipes || 0) + 60; what = 'more wipes, because you have every toy already'; }
  } else if (g.kind === 'casserole') {
    game.parent.energy = clamp(game.parent.energy + 12);
    game.parent.stress = clamp(game.parent.stress - 10);
    what = 'a casserole big enough for three days';
  }
  c.gifts++;
  return what;
}

// --- visitors ---------------------------------------------------------------
function arrive(game, s, rng, days) {
  const pv = s.pendingVisit, c = contactById(s, pv.contactId);
  s.pendingVisit = null;
  if (!c) return;
  const t = game.sim.time;
  game.house.visitor = { contactId: c.id, name: c.name, relation: c.relation, relationLabel: RELATIONS[c.relation].label, personality: c.personality, since: t, until: t + pv.stayH * HOUR, activity: 'settling in' };
  s.visitsToday = (s.visitsToday || 0) + 1;
  slog(game, s, fill(pick(rng, ARRIVE[c.personality]), game, c), 'good', true, `${c.name} is here`);
  const giftP = RELATIONS[c.relation].family ? 0.7 : 0.35;
  if (pv.gift || rng.chance(giftP)) {
    const what = giveGift(game, c, rng, days);
    slog(game, s, `${c.name} brought ${what}.`, 'good', true, 'A gift arrived');
  }
  if (hasSniffle(game, c) && rng.chance(0.15)) {
    game.baby.state.exposureUntil = t + 48 * HOUR;
    slog(game, s, `${c.name} has been fighting a cold all week and kissed ${game.baby.name} on the head anyway. ${game.baby.name} may catch it.`, 'warn', true, 'Germs in the house');
  }
  if (strangerWindow(days) && c.relationship <= 60) {
    slog(game, s, `${game.baby.name} stared at ${c.name}, then buried ${game.baby.sex === 'girl' ? 'her' : 'his'} face in your shoulder. Stranger anxiety is normal at this age.`, 'warn');
  }
}

function visitorTick(game, s, dtH, rng, days) {
  const v = game.house.visitor;
  if (!v) return;
  const t = game.sim.time, b = game.baby, n = b.needs;
  if (t >= v.until) { depart(game, s, rng, days); return; }
  const c = contactById(s, v.contactId);
  v.activity = fill(VISIT_ACTIVITIES[Math.floor((t - v.since) / (25 * MIN)) % VISIT_ACTIVITIES.length], game, c);
  const awake = b.state.activity !== 'sleeping';
  const crowded = (s.visitsToday || 0) > 2;
  const scared = strangerWindow(days) && c && c.relationship <= 60;
  if (awake) {
    const sc = faceScale(days);
    n.stimulation = clamp(n.stimulation + dtH * (crowded ? 4 : 11));
    n.affection = clamp(n.affection + dtH * 7);
    b.dev.social = clamp(b.dev.social + dtH * 0.07 * sc);
    b.dev.language = clamp(b.dev.language + dtH * 0.035 * sc);
    if (scared) { b.emo.stress = clamp(b.emo.stress + dtH * 9); n.comfort = clamp(n.comfort - dtH * 7); }
    else { b.emo.happiness = clamp(b.emo.happiness + dtH * 3); b.emo.stress = clamp(b.emo.stress - dtH * 2); }
    if (crowded) { b.emo.stress = clamp(b.emo.stress + dtH * 7); n.rest = clamp(n.rest - dtH * 4); }
  }
  const relief = c ? PERSONALITIES[c.personality].relief * (RELATIONS[c.relation].calming ? 1.5 : 1) : 1;
  game.parent.stress = clamp(game.parent.stress - dtH * 7 * relief);
  game.parent.energy = clamp(game.parent.energy + dtH * 2.5 * relief);
}

function depart(game, s, rng, days) {
  const v = game.house.visitor, c = contactById(s, v.contactId);
  game.house.visitor = null;
  if (!c) return;
  const hours = (v.until - v.since) / HOUR;
  const scared = strangerWindow(days) && c.relationship <= 60;
  c.visits++;
  warm(game, c, 8 + hours * 2);
  slog(game, s, fill(pick(rng, DEPART[c.personality]), game, c), 'info', true, `${c.name} went home`);
  if (scared) slog(game, s, `${game.baby.name} relaxed the moment the door closed.`, 'info');
}

// --- playgroup --------------------------------------------------------------
function scheduleNext(game, pg) {
  const t = game.sim.time;
  const dayDelta = (pg.weekday - weekday(game) + 7) % 7;
  const hourNow = clockSeconds(game) / HOUR;
  let wait = dayDelta * DAY + (pg.hour - hourNow) * HOUR;
  if (wait <= 0) wait += 7 * DAY;
  pg.nextAt = t + wait;
}

function playgroupTick(game, s, dtH, rng, days) {
  const pg = s.playgroup, t = game.sim.time, b = game.baby;
  if (!pg.enrolled) return;
  if (pg.activeUntil > t) {
    const sc = faceScale(days);
    b.dev.social = clamp(b.dev.social + dtH * 0.16 * sc);
    b.dev.language = clamp(b.dev.language + dtH * 0.07 * sc);
    b.dev.emotional = clamp(b.dev.emotional + dtH * 0.04 * sc);
    b.needs.stimulation = clamp(b.needs.stimulation + dtH * 16);
    b.emo.stress = clamp(b.emo.stress + dtH * (strangerWindow(days) ? 3 : -1));
    return;
  }
  if (pg.activeUntil && pg.activeUntil <= t && pg.activeUntil > t - dtH * HOUR) {
    pg.activeUntil = 0;
    slog(game, s, fill(pick(rng, PLAYGROUP_MOMENTS), game, null), 'good', true, 'Playgroup');
    return;
  }
  if (pg.nextAt == null) { scheduleNext(game, pg); return; }
  if (t < pg.nextAt) return;
  pg.nextAt += 7 * DAY;
  if (game.parent.awayUntil > t || b.state.hospitalizedUntil > t) {
    slog(game, s, `You missed this week's playgroup.`, 'warn');
    return;
  }
  pg.activeUntil = t + 90 * MIN;
  pg.attends++;
  b.counters.playdates = (b.counters.playdates || 0) + 1;
  b.state.activity = b.state.activity === 'sleeping' ? 'awake' : b.state.activity;
  slog(game, s, `You took ${b.name} to playgroup — 90 minutes of other babies, songs and sticky hands.`, 'good', true, 'Playgroup');
  if (rng.chance(0.3)) {
    b.state.exposureUntil = t + 48 * HOUR;
    slog(game, s, `Half the playgroup was snuffling. ${b.name} was breathed on generously.`, 'warn');
  }
}

// --- contacts initiate ------------------------------------------------------
function incomingTick(game, s, dtH, rng, days) {
  const t = game.sim.time;
  if (game.parent.awayUntil > t || game.house.visitor || game.baby.state.hospitalizedUntil > t) return;
  if (s.invitations.length >= 4) return;
  const mCount = Object.keys(game.baby.milestones).length;
  if (mCount !== s.mCount) { s.mCount = mCount; s.mAt = t; }
  const fresh = t - (s.mAt == null ? -DAY : s.mAt) < DAY;
  let rate = 0.05 * (days < 21 ? 1.8 : 1) * (fresh ? 2 : 1);
  if (!rng.chance(rate * dtH)) return;
  const cands = s.contacts.filter((c) => availableNow(game, c) && c.relationship > 12 && !s.invitations.some((i) => i.contactId === c.id));
  if (!cands.length) return;
  const c = weighted(rng, cands, (x) => x.initiative * (0.4 + x.relationship / 100) * (RELATIONS[x.relation].family && (days < 21 || fresh) ? 2.5 : 1));
  const kinds = [
    ['call', 1],
    ['advice', c.personality === 'old_school' || c.personality === 'blunt' ? 1.1 : 0.5],
    ['visit_offer', c.relationship > 35 && !s.pendingVisit ? 0.9 : 0],
    ['gift', c.relationship > 45 ? 0.45 : 0],
  ];
  const kind = weighted(rng, kinds, (k) => k[1])[0];
  const inv = {
    id: 'iv' + s.seq++, contactId: c.id, name: c.name, kind,
    text: fill(pick(rng, INCOMING[kind]), game, c),
    createdAt: t, expiresAt: t + (kind === 'gift' ? 24 : kind === 'advice' ? 12 : kind === 'call' ? 3 : 2) * HOUR,
  };
  if (kind === 'advice') { const a = pickAdvice(game, c, rng, days); inv.adviceId = a.id; inv.text += ` "${fill(a.text, game, c)}"`; }
  s.invitations.push(inv);
  slog(game, s, inv.text, 'info', true, `${c.name} got in touch`);
}

function pickAdvice(game, c, rng, days) {
  const pool = ADVICE.filter((a) => (a.minDays == null || days >= a.minDays) && (a.maxDays == null || days <= a.maxDays));
  const acc = clamp(c.skills.advice + PERSONALITIES[c.personality].adviceBias, 0, 1);
  const wantSafe = rng.next() < acc;
  const sub = pool.filter((a) => a.safe === wantSafe);
  return pick(rng, sub.length ? sub : pool);
}

// --- the tick ---------------------------------------------------------------
export function socialTick(game, dtH, rng) {
  if (game.status !== 'active') return;
  const s = ensureSocial(game), t = game.sim.time, days = ageDays(game);
  const dayIdx = Math.floor(days);
  if (s.dayIndex !== dayIdx) { s.dayIndex = dayIdx; s.visitsToday = 0; }
  for (const c of s.contacts) {
    const idleDays = c.lastContactAt == null ? days : (t - c.lastContactAt) / DAY;
    const drift = idleDays > 6 ? -0.9 : idleDays > 2 ? -0.45 : idleDays > 0.5 ? -0.1 : 0.25;
    c.relationship = clamp(c.relationship + drift * (dtH / 24), 2, 100);
  }
  if (s.invitations.length) s.invitations = s.invitations.filter((i) => i.expiresAt > t);
  // a contact who is babysitting is better than the agency sitter: they bond a little instead of just coping
  const sitterId = game.parent.sitterContactId;
  if (sitterId && game.parent.babysitterUntil > t) {
    const c = contactById(s, sitterId);
    if (c) {
      const q = c.skills.babysitting, b = game.baby;
      b.emo.trust = clamp(b.emo.trust + dtH * 0.032 * q);
      if (b.state.activity !== 'sleeping') {
        b.needs.affection = clamp(b.needs.affection + dtH * 6 * q);
        b.needs.stimulation = clamp(b.needs.stimulation + dtH * 4 * q);
        b.needs.comfort = clamp(b.needs.comfort + dtH * 3 * q);
      }
    }
  } else if (sitterId && game.parent.babysitterUntil <= t) {
    const c = contactById(s, sitterId);
    game.parent.sitterContactId = null;
    if (c) { c.visits++; warm(game, c, 6); slog(game, s, `${c.name} handed ${game.baby.name} back and let themselves out.`, 'info', true, `${c.name} left`); }
  }
  if (s.pendingVisit) {
    if (game.parent.awayUntil > t) s.pendingVisit.arrivesAt = Math.max(s.pendingVisit.arrivesAt, game.parent.awayUntil + 5 * MIN);
    else if (s.pendingVisit.arrivesAt <= t && !game.house.visitor) arrive(game, s, rng, days);
  }
  visitorTick(game, s, dtH, rng, days);
  playgroupTick(game, s, dtH, rng, days);
  incomingTick(game, s, dtH, rng, days);
}

// --- player actions ---------------------------------------------------------
function applyAdvice(game, s, c, a, accepted) {
  const b = game.baby;
  if (!accepted) {
    if (PERSONALITIES[c.personality].huffy > 0.9) { c.relationship = clamp(c.relationship - 2, 0, 100); c.declines++; }
    slog(game, s, `You thanked ${c.name} for the advice and did it your way.`, 'info');
    return ok('You let it pass.', { lines: [fill(a.text, game, c)], advice: adviceOut(game, c, a) });
  }
  warm(game, c, 3);
  const e = a.effect || {};
  if (a.safe) {
    game.parent.stress = clamp(game.parent.stress + (e.parentStress || 0));
    game.parent.energy = clamp(game.parent.energy + (e.parentEnergy || 0));
    if (e.trust) b.emo.trust = clamp(b.emo.trust + e.trust);
    if (e.dev) for (const k of Object.keys(e.dev)) b.dev[k] = clamp(b.dev[k] + e.dev[k]);
    slog(game, s, `You took ${c.name}'s advice: "${fill(a.text, game, c)}" — good advice, as it happens.`, 'good');
    return ok('Good advice, taken.', { lines: [fill(a.text, game, c)], advice: adviceOut(game, c, a) });
  }
  s.badAdvice++;
  if (e.comfort) b.needs.comfort = clamp(b.needs.comfort + e.comfort);
  if (e.health) b.needs.health = clamp(b.needs.health + e.health);
  if (e.stress) b.emo.stress = clamp(b.emo.stress + e.stress);
  if (e.trust) b.emo.trust = clamp(b.emo.trust + e.trust);
  if (e.risky === 'sleep') b.state.unsafeSleepAdvice = game.sim.time;
  slog(game, s, `You followed ${c.name}'s advice: "${fill(a.text, game, c)}" — ${a.truth}`, 'danger', true, 'That was bad advice');
  return ok('You followed it. It did not go well.', { lines: [fill(a.text, game, c)], advice: adviceOut(game, c, a), warning: a.truth });
}

const adviceOut = (game, c, a) => ({ id: a.id, from: c.name, text: fill(a.text, game, c), safe: !!a.safe, truth: a.truth || null });

function stageKey(days) { return days < 120 ? 'newborn' : days < 365 ? 'infant' : days < 1095 ? 'toddler' : 'preschooler'; }

function recentMilestone(game) {
  for (let i = game.journal.length - 1, n = 0; i >= 0 && n < 60; i--, n++) {
    const e = game.journal[i];
    if (e.type === 'milestone' && game.sim.time - e.t < 3 * DAY) return e.text.replace(/^Milestone: /, '');
  }
  return null;
}

export function applySocialAction(game, action, params = {}, rngIn) {
  if (game.status !== 'active') return fail('This game is over.');
  const s = ensureSocial(game);
  const rng = rngIn || makeRng((game.sim.seed ^ (game.sim.steps * 40503) ^ (action.length * 7919)) >>> 0);
  const t = game.sim.time, days = ageDays(game), b = game.baby;
  const need = () => contactById(s, String(params.contactId || ''));

  if (action === 'playgroup') {
    const pg = s.playgroup;
    const want = params.enrolled !== false;
    if (want === pg.enrolled) return ok(want ? 'Already enrolled.' : 'Not enrolled.');
    pg.enrolled = want;
    if (want) {
      scheduleNext(game, pg);
      slog(game, s, `You signed ${b.name} up for the weekly playgroup — ${DAY_NAMES[pg.weekday]}s at ${pg.hour}:00.`, 'good');
      return ok('Enrolled in the weekly playgroup.');
    }
    pg.activeUntil = 0; pg.nextAt = null;
    slog(game, s, `You dropped out of the playgroup.`, 'info');
    return ok('Left the playgroup.');
  }

  if (action === 'respond') {
    const inv = s.invitations.find((i) => i.id === String(params.invitationId || ''));
    if (!inv) return fail('That message has already gone.');
    const c = contactById(s, inv.contactId);
    s.invitations = s.invitations.filter((i) => i !== inv);
    if (!c) return fail('You cannot reach them.');
    const accept = params.accept !== false;
    if (inv.kind === 'advice') return applyAdvice(game, s, c, ADVICE_INDEX[inv.adviceId] || ADVICE[0], accept);
    if (!accept) {
      c.declines++;
      c.relationship = clamp(c.relationship - (PERSONALITIES[c.personality].huffy > 0.9 ? 3 : 1.5), 0, 100);
      slog(game, s, `You told ${c.name} not today.`, 'info');
      return ok('Declined.');
    }
    if (inv.kind === 'call') return applySocialAction(game, 'call', { contactId: c.id }, rng);
    if (inv.kind === 'gift') {
      const what = giveGift(game, c, rng, days);
      warm(game, c, 4);
      slog(game, s, `${c.name} sent over ${what}.`, 'good', true, 'A gift arrived');
      return ok(`${c.name} sent ${what}.`);
    }
    if (inv.kind === 'visit_offer') return startVisit(game, s, c, params.hours, rng, true);
    return ok('Answered.');
  }

  const c = need();
  if (!c) return fail('No such contact.');

  if (action === 'call' || action === 'video') {
    const video = action === 'video';
    if (!availableNow(game, c) && !rng.chance(0.25)) {
      c.relationship = clamp(c.relationship - 0.2, 0, 100);
      return ok(`${c.name} didn't pick up. You left a message.`, { lines: [`${c.name}'s voicemail: "You've reached ${c.name}. Leave it after the beep."`] });
    }
    if (video && b.state.activity === 'sleeping') return fail(`${b.name} is asleep — send a photo instead.`);
    c.calls++;
    const lines = (video ? pick(rng, VIDEO[stageKey(days)]) : pick(rng, CALL[c.personality])).map((l) => fill(l, game, c));
    const ms = recentMilestone(game);
    if (ms) lines.push(fill(pick(rng, MILESTONE_DELIGHT), game, c) + ` (${ms})`);
    let advice = null;
    if (!video && rng.chance(0.5)) { const a = pickAdvice(game, c, rng, days); advice = adviceOut(game, c, a); lines.push(`${c.name}: "${advice.text}"`); }
    const relief = PERSONALITIES[c.personality].relief;
    game.parent.stress = clamp(game.parent.stress - (video ? 7 : 9) * relief);
    game.parent.energy = clamp(game.parent.energy + 2 * relief);
    warm(game, c, video ? 6 : 4);
    if (video) {
      const sc = faceScale(days);
      b.dev.social = clamp(b.dev.social + 0.09 * sc);
      b.dev.language = clamp(b.dev.language + 0.06 * sc);
      b.needs.stimulation = clamp(b.needs.stimulation + 12 * sc);
      b.needs.affection = clamp(b.needs.affection + 6 * sc);
      b.state.lastInteractionAt = t;
      if (days < 60) lines.push(`(${b.name} is too young to make much of a screen, but ${b.sex === 'girl' ? 'she' : 'he'} turned towards the voice.)`);
    }
    slog(game, s, video ? `You video-called ${c.name}. ${b.name} got to see a familiar face.` : `You called ${c.name}.`, 'info');
    return ok(video ? `Video call with ${c.name}.` : `You spoke to ${c.name}.`, { lines, advice });
  }

  if (action === 'photo') {
    warm(game, c, 3);
    game.parent.stress = clamp(game.parent.stress - 2);
    const reply = fill(pick(rng, PHOTO_REPLIES[c.personality]), game, c);
    slog(game, s, `You sent ${c.name} a photo of ${b.name}.`, 'info');
    return ok(`Sent to ${c.name}.`, { lines: [reply] });
  }

  if (action === 'invite') return startVisit(game, s, c, params.hours, rng, false);

  if (action === 'babysit') {
    const hours = clamp(Number(params.hours) || 4, 1, 12);
    if (game.house.visitor) return fail('Someone is already here.');
    if (!availableNow(game, c)) return fail(`${c.name} isn't free right now (${availabilityLabel(c)}).`);
    if (c.relationship < 35) return fail(`${c.name} doesn't feel close enough to be left alone with ${b.name}.`);
    if (c.skills.babysitting < 0.3) return fail(`${c.name} is honest about it: they wouldn't know what to do with a baby.`);
    game.parent.babysitterUntil = t + hours * HOUR;
    game.parent.sitterContactId = c.id;
    warm(game, c, 5);
    slog(game, s, `${c.name} is watching ${b.name} for the next ${hours} hour${hours === 1 ? '' : 's'}. ${c.skills.babysitting > 0.75 ? 'They have done this a hundred times.' : 'They are willing, if a little rusty.'}`, 'good', true, 'Sitter booked');
    return ok(`${c.name} is sitting for ${hours}h.`);
  }
  return fail(`Unknown social action ${action}`);
}

function startVisit(game, s, c, hoursIn, rng, offered) {
  const t = game.sim.time, b = game.baby;
  if (game.house.visitor) return fail(`${game.house.visitor.name} is already here.`);
  if (s.pendingVisit) return fail(`${contactById(s, s.pendingVisit.contactId)?.name || 'Someone'} is already on the way.`);
  if (!offered && !availableNow(game, c)) return fail(`${c.name} can't come now (${availabilityLabel(c)}).`);
  if (!offered && c.relationship < 20) return fail(`${c.name} makes an excuse. You have not spoken in a long time.`);
  const stayH = clamp(Number(hoursIn) || rng.range(1, 3), 1, 3);
  const eta = offered ? Math.round(c.distanceMin * 0.5) : c.distanceMin;
  s.pendingVisit = { contactId: c.id, arrivesAt: t + eta * MIN, stayH: +stayH.toFixed(2), gift: offered && rng.chance(0.5) };
  slog(game, s, `${c.name} is coming over — about ${eta} minutes away, staying ${stayH.toFixed(1)}h.`, 'info');
  void b;
  return ok(`${c.name} is on the way (~${eta} min).`, { etaMin: eta });
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function availabilityLabel(c) {
  const d = c.availability.days;
  const all = d.length === 7;
  const week = d.length === 5 && d.every((x) => x >= 1 && x <= 5);
  const when = all ? 'most days' : week ? 'weekdays' : d.map((x) => DAY_NAMES[x].slice(0, 3)).join(', ');
  return `${when} ${c.availability.from}:00–${c.availability.to}:00`;
}

// --- view -------------------------------------------------------------------
export function socialView(game) {
  const s = ensureSocial(game), t = game.sim.time, days = ageDays(game);
  const pg = s.playgroup;
  return {
    contacts: s.contacts.map((c) => ({
      id: c.id, name: c.name, relation: c.relation, relationLabel: RELATIONS[c.relation].label,
      personality: PERSONALITIES[c.personality].label, personalityId: c.personality,
      relationship: Math.round(c.relationship), availableNow: availableNow(game, c), availability: availabilityLabel(c),
      lastContactMin: c.lastContactAt == null ? null : Math.round((t - c.lastContactAt) / 60),
      visits: c.visits, calls: c.calls, gifts: c.gifts, distanceMin: c.distanceMin, sniffle: hasSniffle(game, c),
      skills: c.skills, family: !!RELATIONS[c.relation].family,
      here: !!(game.house.visitor && game.house.visitor.contactId === c.id),
      sitting: game.parent.sitterContactId === c.id && game.parent.babysitterUntil > t,
      onTheWay: !!(s.pendingVisit && s.pendingVisit.contactId === c.id),
      strangerRisk: strangerWindow(days) && c.relationship <= 60,
    })),
    invitations: s.invitations.filter((i) => i.expiresAt > t).map((i) => ({ id: i.id, contactId: i.contactId, name: i.name, kind: i.kind, text: i.text, expiresInMin: Math.round((i.expiresAt - t) / 60) })),
    visitor: game.house.visitor ? { ...game.house.visitor, minutesLeft: Math.max(0, Math.round((game.house.visitor.until - t) / 60)) } : null,
    pendingVisit: s.pendingVisit ? { contactId: s.pendingVisit.contactId, name: (contactById(s, s.pendingVisit.contactId) || {}).name, etaMin: Math.max(0, Math.round((s.pendingVisit.arrivesAt - t) / 60)) } : null,
    playgroup: {
      enrolled: !!pg.enrolled, active: pg.activeUntil > t, attends: pg.attends || 0,
      dayLabel: DAY_NAMES[pg.weekday], hour: pg.hour,
      nextInMin: pg.enrolled && pg.nextAt != null ? Math.max(0, Math.round((pg.nextAt - t) / 60)) : null,
    },
    visitsToday: s.visitsToday || 0,
    badAdvice: s.badAdvice || 0,
    log: s.log.slice(-10),
  };
}
