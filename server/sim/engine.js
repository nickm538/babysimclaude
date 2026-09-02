// Core simulation tick. advance(game, simSeconds, opts) integrates the baby's life in TICK_STEP chunks.
import {
  TIME, DAY, HOUR, MIN, clamp, lerp, feedIntervalHours, wakeWindowHours, medianGrowth,
  clothingSizeFor, clothingFit, diaperSizeFor, MILESTONES, DEV_KEYS, TOYS, ILLNESSES,
} from '../../shared/constants.js';
import { makeRng } from './rng.js';
import { updateIllness, rollIllnessOnset } from './health.js';
import { roamAndHazards, runBabysitter } from './events.js';

export function ageDays(game) { return game.sim.time / DAY; }
export function clockSeconds(game) { return (TIME.BIRTH_CLOCK + game.sim.time) % DAY; }
export function isNight(game) { const c = clockSeconds(game) / HOUR; return c < 6.5 || c >= 19.5; }

export function log(game, type, text, sev = 'info', extra = {}) {
  const e = { t: game.sim.time, type, text, sev, ...extra };
  game.journal.push(e);
  if (game.journal.length > 400) game.journal.splice(0, game.journal.length - 400);
  return e;
}

export function advance(game, simSeconds, opts = {}) {
  const events = [];
  if (game.status !== 'active' || simSeconds <= 0) return events;
  const rng = makeRng(game.sim.seed ^ (game.sim.steps * 2654435761));
  let remaining = simSeconds;
  const before = game.journal.length;
  while (remaining > 0 && game.status === 'active') {
    const dt = Math.min(TIME.TICK_STEP, remaining);
    step(game, dt, opts, rng);
    remaining -= dt;
    game.sim.steps++;
  }
  events.push(...game.journal.slice(before));
  return events;
}

function step(game, dt, opts, rng) {
  const b = game.baby, s = b.state, n = b.needs, e = b.emo;
  const t0 = game.sim.time;
  game.sim.time += dt;
  const t = game.sim.time;
  const dtH = dt / HOUR, dtMin = dt / MIN, dtDays = dt / DAY;
  const days = ageDays(game);
  const dayIdx = Math.floor(days);
  if (dayIdx !== s.dayIndex) { s.dayIndex = dayIdx; s.mealsToday = 0; s.lessonsToday = 0; }
  const parentAway = game.parent.awayUntil > t;
  const sitter = game.parent.babysitterUntil > t;
  const supervised = !parentAway && (!opts.offline || sitter);
  if (game.parent.awayUntil && game.parent.awayUntil <= t && game.parent.awayUntil > t0) {
    game.parent.awayUntil = 0; log(game, 'return', `You came back to ${b.name}.`, 'info');
  }
  if (s.hospitalizedUntil > t) { hospitalTick(game, dtH); return; }
  if (s.hospitalizedUntil && s.hospitalizedUntil <= t && s.hospitalizedUntil > t0) {
    s.hospitalizedUntil = 0; s.location = 'crib'; s.held = false;
    log(game, 'hospital_return', `${b.name} is home from the hospital. Health partly restored, but the ordeal was frightening.`, 'warn');
  }

  // --- environment ---
  const room = game.house.thermostatC + (isNight(game) ? -1 : 0.5);
  game.house.roomTempC = room;

  // --- sleep / wake ---
  updateSleep(game, dt, rng, days, supervised);
  const sleeping = s.activity === 'sleeping';

  // --- needs ---
  const fi = feedIntervalHours(days);
  n.fullness = clamp(n.fullness - dtH * (45 / fi) * (sleeping ? 0.75 : 1));
  const diaperHours = days < 180 ? 3.2 : days < 365 ? 4 : 5.5;
  const pottyTrained = b.counters.pottyProgress >= 80;
  if (!(pottyTrained && !sleeping && rng.chance(0.9))) n.diaper = clamp(n.diaper - dtH * (100 / diaperHours) * (sleeping ? 0.6 : 1));
  const poopP = days < 30 ? 0.17 : days < 180 ? 0.1 : days < 730 ? 0.06 : 0.05;
  if (!sleeping && rng.chance(poopP * dtH)) {
    if (pottyTrained && rng.chance(0.85)) log(game, 'potty_used', `${b.name} used the potty on ${b.sex === 'girl' ? 'her' : 'his'} own.`, 'good');
    else { n.diaper = clamp(n.diaper - 45); log(game, 'poop', `${b.name} filled ${b.sex === 'girl' ? 'her' : 'his'} diaper.`, 'info'); }
  }
  n.clean = clamp(n.clean - dtH * (100 / 72));
  if (n.diaper < 25) b.phys.rash = clamp(b.phys.rash + dtH * 6); else b.phys.rash = clamp(b.phys.rash - dtH * 1.2);
  if (n.diaper < 30) b.history.wetH += dtH;
  if (n.fullness < 25) b.history.hungerH += dtH;

  const hasToys = ageToys(game).length > 0;
  const inPlayArea = ['play_mat', 'playpen', 'floor'].includes(s.location);
  if (!sleeping) {
    if (s.selfPlayUntil > t && days >= 150) { n.stimulation = clamp(n.stimulation + dtH * 9, 0, 85); s.activity = 'playing'; }
    else {
      if (s.activity === 'playing') s.activity = 'awake';
      n.stimulation = clamp(n.stimulation - dtH * (100 / (hasToys && inPlayArea ? 6 : 3)));
      if (days >= 150 && hasToys && inPlayArea && rng.chance(0.25 * dtH) && n.stimulation < 60) s.selfPlayUntil = t + 30 * MIN;
    }
    if (s.location === 'play_mat' || s.location === 'floor') b.counters.floorTimeMin += dtMin * (days >= 150 ? 1 : 0.3);
    if (s.position === 'tummy' && days < 365) { b.counters.tummyTimeMin += dtMin; if (t - s.lastInteractionAt > 15 * MIN) n.comfort -= dtMin * 0.6; }
  }
  n.affection = clamp(n.affection - dtH * (100 / (sleeping ? 22 : 9)) + (s.held ? dtH * 30 : 0));
  if (s.held) { s.lastInteractionAt = t; }

  // comfort
  const comfortTarget = comfortTargetFor(game, days, room);
  n.comfort = clamp(n.comfort + (comfortTarget - n.comfort) * Math.min(1, dtH * 3));

  // nutrition EMA (2-day time constant), solids after 6mo matter
  let nutriTarget = n.fullness > 35 ? 1 : n.fullness > 15 ? 0.93 : 0.84;
  if (days >= 200 && (s.lastSolidsAt == null || t - s.lastSolidsAt > 3 * DAY)) nutriTarget -= 0.05;
  if (days >= 400 && b.counters.feeds > 0 && s.lastSolidsAt != null && t - s.lastSolidsAt > 2 * DAY) nutriTarget -= 0.06;
  b.phys.nutrition = clamp(b.phys.nutrition + (nutriTarget - b.phys.nutrition) * (dtH / 48), 0.7, 1.08);

  // --- crying ---
  updateCrying(game, dt, rng, days, parentAway, supervised);

  // --- emotions ---
  updateEmotions(game, dtH, dtMin, parentAway);

  // --- development & growth ---
  updateDevelopment(game, dtDays, rng, days);
  updateGrowth(game, dtDays, days, rng);

  // --- illness ---
  rollIllnessOnset(game, dtH, rng, days);
  updateIllness(game, dtH, rng, days);

  // --- health ---
  updateHealth(game, dtH, sleeping, days);

  // --- parent ---
  const p = game.parent;
  p.energy = clamp(p.energy + (sleeping ? 9 : -3) * dtH);
  p.stress = clamp(p.stress + (s.cryingSince ? 7 * s.cryIntensity : -4) * dtH);

  // --- babysitter, roaming, hazards, orders ---
  if (sitter) runBabysitter(game, dtH, rng);
  roamAndHazards(game, dt, rng, days, supervised && !sitter, opts.offline);
  updateOrders(game, t0, t);

  // --- outcome ---
  if (n.health <= 0 && game.status === 'active') die(game, deathCause(game));
  if (game.status === 'active' && days >= TIME.WIN_AGE_DAYS) finish(game);
}

function hospitalTick(game, dtH) {
  const b = game.baby;
  b.needs.health = clamp(b.needs.health + dtH * 1.6);
  b.needs.fullness = clamp(b.needs.fullness + dtH * 20);
  b.needs.diaper = 90; b.needs.clean = 90;
  b.emo.stress = clamp(b.emo.stress + dtH * 0.8);
  b.emo.trust = clamp(b.emo.trust - dtH * 0.05);
  if (b.illness) { b.illness.severity = clamp(b.illness.severity - dtH * 5); if (b.illness.severity <= 0) b.illness = null; }
}

export function ageToys(game) {
  const days = ageDays(game);
  return game.inventory.toys.filter((id) => {
    const t = TOY_INDEX[id]; return t && days >= t.minDays && days <= t.maxDays;
  });
}
const TOY_INDEX = Object.fromEntries(TOYS.map((t) => [t.id, t]));

function comfortTargetFor(game, days, room) {
  const b = game.baby, s = b.state, n = b.needs;
  let c = 100;
  const layers = b.wear.layers === 'warm' ? 2 : b.wear.layers === 'light' ? -2 : 0;
  const effTemp = room + layers + (b.wear.swaddled || b.wear.sleepSack ? 1.5 : 0);
  const ideal = 21;
  const tempDelta = Math.abs(effTemp - ideal);
  if (tempDelta > 2) c -= Math.min(35, (tempDelta - 2) * 7);
  const needed = clothingSizeFor(b.phys.weightKg, b.phys.heightCm);
  const fit = clothingFit(b.wear.outfitSize, needed);
  if (fit < 60) c -= (60 - fit) * 0.5;
  if (n.diaper < 45) c -= (45 - n.diaper) * 0.5;
  if (s.needsBurp) c -= 14;
  if (s.teething) c -= 12;
  if (b.phys.rash > 20) c -= b.phys.rash * 0.25;
  if (b.illness) c -= b.illness.severity * 0.3;
  if (b.injuries.length) c -= Math.min(20, b.injuries.reduce((a, i) => a + (i.healAt > game.sim.time ? i.pain : 0), 0));
  if (s.postVaccineUntil > game.sim.time) c -= 12;
  if (s.held) c += 8;
  if (s.pacifier && days < 730) c += 4;
  if (b.wear.swaddled && days < 60 && s.activity === 'sleeping') c += 6;
  if (b.wear.swaddled && days >= 75) c -= 6;
  if (s.location === 'high_chair' && game.sim.time - s.lastInteractionAt > 40 * MIN) c -= 15;
  if (n.clean < 35) c -= (35 - n.clean) * 0.3;
  return clamp(c);
}

function updateSleep(game, dt, rng, days, supervised) {
  const b = game.baby, s = b.state, n = b.needs;
  const t = game.sim.time, dtH = dt / HOUR;
  const ww = wakeWindowHours(days);
  if (s.activity === 'sleeping') {
    const gain = 100 / (days < 365 ? 2.5 : 3.5) * (s.whiteNoise ? 1.08 : 1);
    n.rest = clamp(n.rest + dtH * gain);
    const distress = distressOf(game, days).value;
    let wake = false, why = '';
    if (n.rest >= 96) { wake = true; why = 'rested'; }
    else if (n.fullness < 28) { wake = true; why = 'hungry'; }
    else if (distress > 72) { wake = true; why = 'uncomfortable'; }
    else if (n.rest > 55 && rng.chance((days < 120 ? 0.05 : 0.02) * (distress > 40 ? 3 : 1))) { wake = true; why = 'stirred'; }
    else if (days >= 365 && !isNight(game) && n.rest > 80 && rng.chance(0.15)) { wake = true; why = 'nap over'; }
    if (wake) {
      s.activity = 'awake'; s.awakeSince = t; s.sleepSince = null; b.wear.swaddled = false;
      log(game, 'woke', `${b.name} woke up (${why}).`, 'info');
    }
    return;
  }
  n.rest = clamp(n.rest - dtH * (100 / (ww * 1.6)));
  const calm = !s.cryingSince && n.fullness > 35 && n.diaper > 30 && n.comfort > 45;
  let p = 0;
  if (n.rest < 28 && calm) p = 0.22 + (s.held ? 0.2 : 0) + (s.whiteNoise ? 0.05 : 0) + (b.wear.swaddled && days < 60 ? 0.08 : 0);
  else if (n.rest < 12) p = s.held ? 0.18 : 0.06;
  else if (n.rest < 45 && isNight(game) && days >= 365 && calm) p = 0.08;
  if (s.location === 'high_chair' || s.location === 'bath' || s.location === 'changing_table') p *= 0.2;
  if (p > 0 && rng.chance(p)) {
    s.activity = 'sleeping'; s.sleepSince = t; s.cryingSince = null; s.cryIntensity = 0; s.selfPlayUntil = 0;
    if (s.location === 'held') log(game, 'slept', `${b.name} fell asleep in your arms.`, 'good');
    else log(game, 'slept', `${b.name} fell asleep on the ${s.location.replace('_', ' ')}.`, 'info');
    if (s.position === 'tummy' && days < 180) sidsRoll(game, rng);
  }
}

function sidsRoll(game, rng) {
  const b = game.baby;
  const overheated = game.house.roomTempC + (b.wear.layers === 'warm' ? 2 : 0) > 24;
  const p = 0.003 * (overheated ? 2 : 1) * (b.state.pacifier ? 0.6 : 1) * (b.state.location === 'sofa' ? 2 : 1);
  if (rng.chance(p)) { b.needs.health = 0; game.baby.death = 'sids'; }
}

export function distressOf(game, days) {
  const b = game.baby, s = b.state, n = b.needs, t = game.sim.time;
  const causes = [
    ['hungry', (100 - n.fullness) * 1.0],
    ['tired', (100 - n.rest) * 0.7],
    ['wet diaper', (100 - n.diaper) * 0.8],
    ['uncomfortable', (100 - n.comfort) * 1.0],
    ['bored', days > 90 ? (100 - n.stimulation) * 0.5 : 0],
    ['lonely', (100 - n.affection) * 0.6],
    ['in pain', (b.illness ? b.illness.severity * 0.7 : 0) + (s.teething ? 30 : 0) + (s.needsBurp ? 25 : 0) + (b.phys.rash > 40 ? b.phys.rash * 0.4 : 0) + (b.injuries.some((i) => i.healAt > t) ? 35 : 0)],
    ['colicky', s.colicUntil > t ? 60 : 0],
    ['scared', b.emo.stress > 70 ? (b.emo.stress - 70) : 0],
  ];
  let best = causes[0];
  for (const c of causes) if (c[1] > best[1]) best = c;
  return { value: best[1], cause: best[0] };
}

function updateCrying(game, dt, rng, days, parentAway, supervised) {
  const b = game.baby, s = b.state, e = b.emo, t = game.sim.time, dtMin = dt / MIN, dtH = dt / HOUR;
  if (s.activity === 'sleeping') return;
  if (days >= 14 && days < 100 && !isNight(game) && clockSeconds(game) / HOUR >= 17 && s.colicUntil < t && rng.chance(0.08 * dtH)) {
    s.colicUntil = t + rng.range(45, 120) * MIN;
    log(game, 'colic', `${b.name} is having a colicky evening — inconsolable crying for no clear reason.`, 'warn');
  }
  const d = distressOf(game, days);
  const threshold = days < 180 ? 52 : days < 730 ? 60 : 66;
  if (!s.cryingSince) {
    if (d.value > threshold) {
      s.cryingSince = t; s.cryCause = d.cause; s.cryIntensity = clamp((d.value - threshold) / 40, 0.25, 1);
      game.stats.cries++; b.history.criesTotal++;
      log(game, 'cry_start', `${b.name} started crying — ${d.cause}.`, 'warn', { cause: d.cause });
    }
    return;
  }
  s.cryIntensity = clamp((d.value - threshold + 20) / 45, 0.2, 1);
  s.cryCause = d.cause;
  b.history.cryMin += dtMin;
  const selfSoothe = days >= 120 ? (b.dev.emotional / 100) * 0.08 : 0;
  if (d.value < threshold - 12 || (rng.chance(selfSoothe) && !['hungry', 'in pain'].includes(d.cause))) {
    s.cryingSince = null; s.cryIntensity = 0;
    log(game, 'cry_stop', `${b.name} settled down.`, 'info');
    return;
  }
  const cryMin = (t - s.cryingSince) / MIN;
  const answeredRecently = t - s.lastAnsweredCryAt < 10 * MIN;
  if (!answeredRecently) {
    b.history.unansweredCryMin += dtMin;
    e.stress = clamp(e.stress + dtMin * 0.5 * s.cryIntensity * (parentAway ? 2 : 1));
    if (cryMin > 10) {
      const rate = days < 180 ? 0.012 : days < 730 ? 0.009 : 0.006;
      e.trust = clamp(e.trust - dtMin * rate * (parentAway ? 2.5 : 1));
      e.security = clamp(e.security - dtMin * rate * 0.8);
    }
    if (cryMin > 45 && Math.floor(cryMin / 30) !== Math.floor((cryMin - dtMin) / 30)) {
      log(game, 'cry_long', `${b.name} has been crying for ${Math.round(cryMin)} minutes without comfort.`, 'danger');
    }
  } else {
    e.stress = clamp(e.stress - dtMin * 0.4);
  }
}

function updateEmotions(game, dtH, dtMin, parentAway) {
  const b = game.baby, e = b.emo, n = b.needs, s = b.state;
  const needMean = n.fullness * 0.2 + n.rest * 0.15 + n.comfort * 0.2 + n.stimulation * 0.15 + n.affection * 0.2 + n.health * 0.1;
  const target = clamp(needMean * 0.6 + e.trust * 0.3 + e.security * 0.1 - e.stress * 0.35 + (s.held ? 5 : 0));
  e.happiness = clamp(e.happiness + (target - e.happiness) * Math.min(1, dtH * 0.6));
  e.stress = clamp(e.stress - dtH * (s.held && !s.cryingSince ? 12 : 4) * (parentAway ? 0 : 1));
  if (parentAway) { e.stress = clamp(e.stress + dtMin * 1.2); e.security = clamp(e.security - dtMin * 0.05); }
  const wellCared = n.fullness > 45 && n.diaper > 40 && n.comfort > 50 && n.affection > 45;
  if (wellCared && !s.cryingSince) {
    e.trust = clamp(e.trust + dtH * 0.03 * (0.5 + b.responsiveness));
    e.security = clamp(e.security + dtH * 0.12 * (0.5 + b.responsiveness));
  }
  if (e.stress > 70) b.history.toxicStressH += dtH;
  // attachment classification
  const r = b.responsiveness;
  b.attachment = e.trust > 65 && r > 0.55 ? 'secure' : e.trust < 35 && b.history.toxicStressH > 48 ? 'disorganized' : r < 0.4 ? 'avoidant' : e.trust < 50 ? 'anxious' : 'forming';
  // failure to thrive
  const ftt = e.happiness < 18 && e.trust < 22 && b.phys.nutrition < 0.9;
  if (ftt && !b.illness && game.sim.time > 7 * DAY) {
    b.illness = { id: 'failure_to_thrive', severity: 30, startedAt: game.sim.time, treated: false, known: false, medsAt: [] };
    log(game, 'ftt', `${b.name} has become withdrawn, listless and is losing weight. Something is deeply wrong.`, 'danger');
  }
}

export function expectedDev(days) { return clamp(100 * Math.pow(days / TIME.WIN_AGE_DAYS, 0.9), 0.5, 100); }

function updateDevelopment(game, dtDays, rng, days) {
  const b = game.baby, e = b.emo, n = b.needs;
  const dailyInc = 100 / TIME.WIN_AGE_DAYS;
  const healthF = n.health < 40 ? 0.5 : n.health < 70 ? 0.8 : 1;
  const stressF = e.stress > 70 ? 0.45 : e.stress > 45 ? 0.75 : 1;
  const nutriF = b.phys.nutrition < 0.9 ? 0.7 : 1;
  const passive = dailyInc * 0.42 * dtDays * healthF * stressF * nutriF;
  for (const k of DEV_KEYS) b.dev[k] = clamp(b.dev[k] + passive);
  const t = game.sim.time;
  for (const m of MILESTONES) {
    if (b.milestones[m.id]) continue;
    if (days < m.minDays) continue;
    const need = expectedDev(m.minDays) * 0.8;
    let ok = b.dev[m.domain] >= need;
    if (m.needs) {
      if (m.needs.tummyTimeMin && b.counters.tummyTimeMin < m.needs.tummyTimeMin) ok = false;
      if (m.needs.floorTimeMin && b.counters.floorTimeMin < m.needs.floorTimeMin) ok = false;
      if (m.needs.pottyProgress && b.counters.pottyProgress < m.needs.pottyProgress) ok = false;
      if (m.needs.lesson && (b.counters.lessons[m.needs.lesson] || 0) < 3) ok = false;
      if (m.needs.playdates && b.counters.playdates < m.needs.playdates) ok = false;
    }
    if (ok && rng.chance(0.35)) {
      b.milestones[m.id] = days;
      const late = days > m.maxDays;
      log(game, 'milestone', `Milestone: ${b.name} — ${m.label}${late ? ' (late)' : ''}!`, 'good', { milestone: m.id });
      if (late) b.delays = b.delays.filter((d) => d !== m.id);
    } else if (!ok && days > m.maxDays && !b.delays.includes(m.id)) {
      b.delays.push(m.id);
      log(game, 'delay', `${b.name} hasn't reached "${m.label}" yet — this is later than typical.`, 'warn');
    }
  }
  void t;
}

function updateGrowth(game, dtDays, days, rng) {
  const b = game.baby, p = b.phys;
  const med = medianGrowth(days, b.sex);
  const wf = lerp(0.82, 1.08, clamp((p.nutrition - 0.84) / 0.24, 0, 1));
  const targetW = med.weight * wf * (0.97 + (game.sim.seed % 9) / 100);
  p.weightKg = +(p.weightKg + (targetW - p.weightKg) * Math.min(1, dtDays / 6)).toFixed(3);
  const hf = lerp(0.965, 1.02, clamp((p.nutrition - 0.84) / 0.24, 0, 1));
  const targetH = med.height * hf * (0.98 + (game.sim.seed % 5) / 100);
  p.heightCm = +Math.max(p.heightCm, p.heightCm + (targetH - p.heightCm) * Math.min(1, dtDays / 10)).toFixed(2);
  // teeth
  const teethTarget = days < p.teethStart ? 0 : Math.min(20, 1 + Math.floor((days - p.teethStart) / 36));
  if (teethTarget > p.teeth) {
    p.teeth = teethTarget; b.state.teething = 1; b.state.teethingUntil = game.sim.time + 5 * DAY;
    log(game, 'tooth', `A new tooth is coming in for ${b.name} (${p.teeth} total). Expect drool and fussiness.`, 'info');
  }
  if (b.state.teething && b.state.teethingUntil < game.sim.time) b.state.teething = 0;
  // clothing
  const needed = clothingSizeFor(p.weightKg, p.heightCm);
  if (needed !== b.wear.neededSize) {
    b.wear.neededSize = needed;
    if (clothingFit(b.wear.outfitSize, needed) < 60) log(game, 'outgrown', `${b.name} has outgrown ${b.sex === 'girl' ? 'her' : 'his'} ${b.wear.outfitSize} clothes — time to buy ${needed}.`, 'warn');
  }
  const dsize = diaperSizeFor(p.weightKg);
  if (dsize !== b.wear.neededDiaper) { b.wear.neededDiaper = dsize; if (dsize !== b.wear.diaperSize) log(game, 'diaper_size', `${b.name} now needs size ${dsize} diapers.`, 'info'); }
  void rng;
}

function updateHealth(game, dtH, sleeping, days) {
  const b = game.baby, n = b.needs, e = b.emo;
  const okNeeds = n.fullness > 40 && n.rest > 30 && n.diaper > 30 && n.clean > 40;
  let delta = 0;
  if (okNeeds && !b.illness) delta += 0.6;
  else if (!b.illness && n.fullness > 25) delta += 0.15;
  if (n.fullness < 10) delta -= (10 - n.fullness) * 0.12;
  if (n.fullness < 25 && days < 60) delta -= 0.15;
  if (n.rest < 5) delta -= 0.15;
  if (b.phys.rash > 60) delta -= 0.15;
  if (b.phys.nutrition < 0.88) delta -= 0.35;
  if (b.illness && b.illness.severity > 50) delta -= (b.illness.severity / 100) * 1.2 * (ILL_DANGER(b.illness.id));
  if (e.stress > 70) delta -= 0.1;
  if (b.injuries.some((i) => i.healAt > game.sim.time && i.severe)) delta -= 0.25;
  n.health = clamp(n.health + delta * dtH);
  b.injuries = b.injuries.filter((i) => i.healAt > game.sim.time);
  void sleeping;
}
const ILL_DANGER = (id) => (ILLNESSES[id] ? ILLNESSES[id].danger : 1);

function updateOrders(game, t0, t) {
  for (const o of game.orders) {
    if (o.status === 'shipping' && o.arrivesAt <= t) {
      o.status = 'delivered';
      game.house.doorPackages.push(o.id);
      log(game, 'doorbell', `Delivery at the door: ${o.items.map((i) => i.label).join(', ')}.`, 'good', { orderId: o.id });
    }
  }
  if (game.house.nurseAtDoor && game.house.nurseAtDoor.arrivesAt <= t && game.house.nurseAtDoor.arrivesAt > t0) {
    log(game, 'nurse', `The visiting nurse is at the door for ${game.baby.name}'s vaccines.`, 'good');
  }
  if (game.orders.length > 60) game.orders = game.orders.filter((o) => o.status !== 'collected').slice(-40);
}

export function deathCause(game) {
  const b = game.baby;
  if (b.death) return b.death;
  if (b.illness && b.illness.id === 'poisoning') return 'poisoning';
  if (b.illness && b.illness.severity > 60) return b.illness.id;
  if (b.needs.fullness < 10) return 'starvation';
  if (b.injuries.length) return 'injury';
  return 'neglect';
}

const CAUSE_TEXT = {
  sids: 'died in their sleep. Sleeping on the tummy, on soft surfaces, or overheated raises this risk enormously.',
  starvation: 'died of starvation and dehydration.',
  poisoning: 'died after swallowing a household chemical that was within reach.',
  injury: 'died from injuries sustained while unsupervised.',
  neglect: 'died from prolonged neglect.',
  failure_to_thrive: 'stopped growing and died of failure to thrive — a body giving up without care and love.',
};

function die(game, cause) {
  game.status = 'dead';
  const b = game.baby;
  const text = CAUSE_TEXT[cause] || `died of untreated ${(ILLNESSES[cause] || { label: cause }).label.toLowerCase()}.`;
  game.death = { cause, at: game.sim.time, ageDays: ageDays(game), text: `${b.name} ${text}` };
  b.state.cryingSince = null; b.state.cryIntensity = 0; b.state.activity = 'sleeping';
  log(game, 'death', game.death.text, 'danger');
}

function finish(game) {
  game.status = 'won';
  const b = game.baby, d = b.dev, e = b.emo, n = b.needs;
  const devAvg = DEV_KEYS.reduce((a, k) => a + d[k], 0) / DEV_KEYS.length;
  const score = Math.round(n.health * 0.25 + e.happiness * 0.25 + e.trust * 0.2 + devAvg * 0.3);
  const grade = score >= 88 ? 'thriving' : score >= 72 ? 'healthy & happy' : score >= 55 ? 'semi-healthy' : 'struggling';
  game.win = { at: game.sim.time, score, grade, devAvg: +devAvg.toFixed(1), attachment: b.attachment };
  log(game, 'win', `${b.name} turned five: ${grade} (score ${score}/100).`, 'good');
}
