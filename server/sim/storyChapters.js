// Story arc bookkeeping that survives sessions: emergent traits, weighted memories, the chapter
// log, and the compact summary handed to the chat LLM so the child remembers across sessions.
// Imports nothing from the engine (keeps the module cycle-free); everything comes off `game`.
import { DAY, clamp, ageLabel, MILESTONES, ILLNESSES, TRAITS, TEMPERAMENTS, MOOD_LABELS } from '../../shared/constants.js';
import { fillText } from './mood.js';

const MILESTONE_INDEX = Object.fromEntries(MILESTONES.map((m) => [m.id, m]));

// --- memories --------------------------------------------------------------------------------

export function addMemory(game, text, weight = 40, kind = 'moment') {
  const st = game.story;
  if (!st) return null;
  const day = Math.floor(game.sim.time / DAY);
  const filled = fillText(text, game);
  if (st.memories.some((m) => m.text === filled && day - m.day < 3)) return null;
  const mem = { t: game.sim.time, day, text: filled, weight: Math.round(weight), kind };
  st.memories.push(mem);
  if (st.memories.length > 60) {
    st.memories.sort((a, b) => b.weight - a.weight || b.t - a.t);
    st.memories.length = 40;
    st.memories.sort((a, b) => a.t - b.t);
  }
  return mem;
}

export function topMemories(game, n = 20) {
  const st = game.story;
  if (!st || !st.memories.length) return [];
  return st.memories.slice().sort((a, b) => b.weight - a.weight || b.t - a.t).slice(0, n);
}

// --- emergent traits -------------------------------------------------------------------------

const per = (v, days) => v / Math.max(1, days);

// Each rule: [traitId, minDays, test(game, st, days)]
const TRAIT_RULES = [
  ['giggler', 120, (g, st) => st.counters.giggler >= 3 && g.baby.emo.happiness > 50],
  ['night_owl', 90, (g, st, d) => per(st.stats.nightWakes, d) > 1.7],
  ['early_riser', 90, (g, st, d) => per(st.stats.earlyWakes, d) > 0.55],
  ['sensitive_sleeper', 70, (g, st, d) => st.counters.sensitive_sleeper >= 3 || per(st.stats.wakes, d) > 7.5],
  ['cuddly', 60, (g, st, d) => per(st.stats.heldH, d) > 2.4 || st.counters.cuddly >= 3],
  ['picky_eater', 240, (g, st) => st.counters.picky_eater >= 3],
  ['foodie', 300, (g, st, d) => per(g.baby.counters.feeds, d) > 4.5 && st.counters.picky_eater < 2],
  ['explorer', 230, (g, st, d) => per(st.stats.roams, d) > 1.1 || st.counters.explorer >= 2],
  ['daredevil', 300, (g, st) => st.counters.daredevil >= 3],
  ['wary', 210, (g, st) => st.counters.wary >= 2 || (g.story.temperament === 'slow-to-warm' && g.baby.emo.trust < 52)],
  ['chatterbox', 380, (g, st, d) => st.counters.chatterbox >= 3 || g.baby.dev.language > expectedish(d) * 1.08],
  ['bookworm', 200, (g, st, d) => per(g.baby.counters.reads, d) > 0.75],
  ['gentle_soul', 400, (g) => g.baby.emo.stress < 28 && g.baby.dev.emotional > expectedish(g.sim.time / DAY) && g.story.temperament === 'easy'],
  ['stubborn', 430, (g, st) => g.story.temperament === 'spirited' && st.stats.badEvents >= 6 && g.baby.emo.trust > 40],
];

function expectedish(days) { return clamp(100 * Math.pow(days / 1825, 0.9), 0.5, 100); }

export const MAX_TRAITS = 6;

// Runs once per baby-day. Adds at most one trait a day so they emerge gradually.
export function evaluateTraits(game, days) {
  const st = game.story;
  if (st.traits.length >= MAX_TRAITS) return null;
  for (const [id, minDays, test] of TRAIT_RULES) {
    if (days < minDays) continue;
    if (st.traits.some((t) => t.id === id)) continue;
    let hit = false;
    try { hit = !!test(game, st, days); } catch { hit = false; }
    if (!hit) continue;
    const def = TRAITS[id] || { label: id };
    const trait = { id, label: def.label, day: Math.floor(days) };
    st.traits.push(trait);
    addMemory(game, `${game.baby.name} turned out to be ${def.article || 'a'} ${def.label.toLowerCase()} — ${def.blurb}`, 46, 'trait');
    return trait;
  }
  return null;
}

export function hasTrait(game, id) {
  return !!(game.story && game.story.traits.some((t) => t.id === id));
}

// --- chapters --------------------------------------------------------------------------------

export function newChapterAccumulator(days) {
  return {
    dayStart: days, moodSum: 0, moodN: 0, moodFirst: null, moodLast: null,
    milestones: [], illnesses: [], highlights: [], tempers: 0, doctorVisits: 0,
    goodEvents: 0, badEvents: 0, criesTotal: 0, criesAnswered: 0, hospital: 0,
  };
}

export function sampleChapterMood(game, value) {
  const c = game.story.chapter;
  if (!c) return;
  c.moodSum += value; c.moodN++;
  if (c.moodFirst === null) c.moodFirst = value;
  c.moodLast = value;
}

function moodLabelOf(v) {
  for (let i = MOOD_LABELS.length - 1; i >= 0; i--) if (v >= MOOD_LABELS[i].min) return MOOD_LABELS[i].label.toLowerCase();
  return MOOD_LABELS[0].label.toLowerCase();
}

function trendOf(c) {
  if (!c.moodN) return 'steady';
  const delta = (c.moodLast || 0) - (c.moodFirst || 0);
  if (delta > 14) return 'rising';
  if (delta < -14) return 'falling';
  return 'steady';
}

const TITLES = {
  rising: ['The Week It Got Easier', 'Finding the Rhythm', 'Small Victories', 'Coming Up for Air'],
  falling: ['A Hard Stretch', 'The Week Everything Slipped', 'Running on Empty', 'Long Nights'],
  steady: ['Days Like This', 'The Ordinary Days', 'Seven Quiet Days', 'One Foot, Then the Other'],
};

export function writeChapter(game, mode = 'online', minDays = 0.2) {
  const st = game.story, b = game.baby;
  const days = game.sim.time / DAY;
  const c = st.chapter || newChapterAccumulator(days);
  const span = days - c.dayStart;
  if (span < minDays) return null;
  const index = st.chapters.length + 1;
  const avg = c.moodN ? c.moodSum / c.moodN : 0;
  const trend = trendOf(c);
  const title = pickTitle(game, c, trend, index);
  const summary = summarize(game, c, trend, avg, span, mode);
  const chapter = {
    index, dayStart: +c.dayStart.toFixed(2), dayEnd: +days.toFixed(2), title, summary,
    highlights: c.highlights.slice(-6), moodTrend: trend, moodAvg: Math.round(avg),
    moodLabel: moodLabelOf(avg), written: mode, at: game.sim.time,
  };
  st.chapters.push(chapter);
  if (st.chapters.length > 40) st.chapters.splice(0, st.chapters.length - 40);
  st.chapter = newChapterAccumulator(days);
  st.chapter.criesTotal = b.history.criesTotal || 0;
  st.chapter.criesAnswered = b.history.criesAnswered || 0;
  return chapter;
}

function pickTitle(game, c, trend, index) {
  if (c.milestones.length) {
    const m = MILESTONE_INDEX[c.milestones[c.milestones.length - 1]];
    if (m) return `The Week of ${m.label}`;
  }
  if (c.hospital) return 'The Hospital Night';
  if (c.illnesses.length > 1) return 'Fevers and Small Mercies';
  if (c.illnesses.length === 1) {
    const def = ILLNESSES[c.illnesses[0]];
    if (def) return `The ${def.label} Week`;
  }
  if (c.tempers > 1) return 'The Week You Lost It';
  const bank = TITLES[trend];
  return bank[index % bank.length];
}

function summarize(game, c, trend, avg, span, mode) {
  const b = game.baby, st = game.story;
  const days = game.sim.time / DAY;
  const he = b.sex === 'girl' ? 'she' : 'he', his = b.sex === 'girl' ? 'her' : 'his', him = b.sex === 'girl' ? 'her' : 'him';
  const S = [];
  const lengthWord = span < 1 ? `${Math.max(1, Math.round(span * 24))} hours` : `${span.toFixed(1)} days`;
  S.push(`${lengthWord} of ${b.name}'s life, from day ${Math.floor(c.dayStart)} to day ${Math.floor(days)}, ${ageLabel(days)}.`);
  const moodWord = moodLabelOf(avg);
  S.push(trend === 'rising'
    ? `${b.name} started the stretch unsettled and ended it ${moodWord}; the mood was climbing by the end.`
    : trend === 'falling'
      ? `${b.name} slid from steadier days into something harder — mostly ${moodWord} by the close.`
      : `${b.name} was mostly ${moodWord} throughout, without much drama either way.`);
  if (c.milestones.length) {
    const labels = c.milestones.map((id) => (MILESTONE_INDEX[id] || { label: id }).label.toLowerCase());
    S.push(`${cap(he)} reached ${list(labels)} in this chapter.`);
  } else if (span > 3) {
    S.push(`No new milestones this time — ${he} was consolidating what ${he} already knew.`);
  }
  if (c.illnesses.length) {
    const labels = c.illnesses.map((id) => (ILLNESSES[id] || { label: id }).label.toLowerCase());
    S.push(c.hospital
      ? `${cap(he)} was ill with ${list(labels)} and ended up in hospital — the worst night so far.`
      : `${cap(he)} was ill with ${list(labels)}, and got through it.`);
  }
  if (c.goodEvents + c.badEvents > 0) {
    S.push(c.badEvents > c.goodEvents
      ? `There were ${c.badEvents} scares or setbacks against ${c.goodEvents} good moments; it was not a gentle stretch.`
      : `${c.goodEvents} small good moments against ${c.badEvents} setbacks — the balance was on the right side.`);
  }
  const answered = (b.history.criesAnswered || 0) - (c.criesAnswered || 0);
  const total = (b.history.criesTotal || 0) - (c.criesTotal || 0);
  const rate = total > 0 ? answered / total : null;
  if (rate !== null) {
    S.push(rate > 0.75 ? `You came almost every time ${he} cried, and ${he} has started to expect that.`
      : rate > 0.45 ? `You got to ${him} most times ${he} cried, though not always quickly.`
        : `A lot of ${his} crying went unanswered this stretch, and ${he} is learning from that.`);
  }
  if (c.tempers) {
    S.push(c.tempers === 1
      ? `You lost your temper once. ${cap(he)} flinched, and it stayed with both of you.`
      : `You lost your temper ${c.tempers} times. That is the part of this chapter ${he} will carry.`);
  }
  if (mode === 'away') S.push(`This chapter was written while you were gone; ${b.name} lived it without you.`);
  else if (st.traits.length) S.push(`${cap(he)} is becoming ${list(st.traits.slice(-2).map((t) => t.label.toLowerCase()))}.`);
  return S.slice(0, 6).join(' ');
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function list(arr) {
  if (arr.length === 0) return 'nothing';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
}

// --- LLM context -----------------------------------------------------------------------------

// ~600 characters of who this child has become, so the chat model stays consistent across sessions.
export function storySummaryForLLM(game) {
  const st = game.story;
  if (!st) return '';
  const b = game.baby;
  const temp = TEMPERAMENTS[st.temperament] || { label: st.temperament };
  const parts = [`Temperament: ${temp.label}${temp.blurb ? ` (${temp.blurb})` : ''}.`];
  if (st.traits.length) parts.push(`Traits: ${st.traits.map((t) => t.label.toLowerCase()).join(', ')}.`);
  const c = st.chapter;
  if (c && c.moodN) parts.push(`This chapter ${b.name} has mostly been ${moodLabelOf(c.moodSum / c.moodN)}.`);
  const last = st.chapters[st.chapters.length - 1];
  if (last) parts.push(`Last chapter "${last.title}" (${last.moodTrend}).`);
  const mems = topMemories(game, 8);
  if (mems.length) parts.push(`Remembers: ${mems.map((m) => `${m.text} (day ${m.day})`).join('; ')}.`);
  let out = parts.join(' ');
  if (out.length > 640) out = `${out.slice(0, 637)}...`;
  return out;
}

export function storyView(game) {
  const st = game.story;
  if (!st) return null;
  const temp = TEMPERAMENTS[st.temperament] || { label: st.temperament };
  return {
    temperament: st.temperament,
    temperamentLabel: temp.label,
    temperamentBlurb: temp.blurb || '',
    traits: st.traits.map((t) => ({ id: t.id, label: t.label, day: t.day, blurb: (TRAITS[t.id] || {}).blurb || '' })),
    chapters: st.chapters.slice(-12),
    memories: topMemories(game, 20),
    currentChapterDay: st.chapter ? +st.chapter.dayStart.toFixed(2) : 0,
    chapterCount: st.chapters.length,
    weather: st.weather || 'clear',
    stats: st.stats,
  };
}
