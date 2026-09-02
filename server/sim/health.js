// Illness onset/progression, fever, hospitalization and the telehealth doctor.
import { ILLNESSES, VACCINES, CHECKUPS, MILESTONES, DAY, HOUR, clamp, medianGrowth } from '../../shared/constants.js';
import { log, expectedDev, ageDays } from './engine.js';

export function vaccineOverdue(game, days) {
  return VACCINES.filter((v) => !game.baby.vaccines[v.id] && days > v.dueDays + v.windowDays);
}

export function protectedAgainst(game, key) {
  return VACCINES.some((v) => game.baby.vaccines[v.id] && v.protects.includes(key));
}

export function rollIllnessOnset(game, dtH, rng, days) {
  const b = game.baby;
  if (b.illness) return;
  if (b.phys.jaundice > 0) {
    // newborn jaundice: bilirubin rises for a few days, falls with frequent feeding
    const fedWell = b.needs.fullness > 45;
    b.phys.jaundice = clamp(b.phys.jaundice + dtH * (days < 3.5 ? (fedWell ? 0.45 : 0.7) : fedWell ? -1.2 : 0.5), 0, 100);
    if (b.phys.jaundice > 75 && !b.illness) {
      b.illness = mk('jaundice', game, 40, rng); b.illness.known = false;
      log(game, 'illness', `${b.name}'s skin and eyes look yellow. Very sleepy and feeding poorly.`, 'warn');
    }
    return;
  }
  let p = 0.0016; // per hour baseline (~4%/day)
  if (b.needs.clean < 40) p *= 1.8;
  if (b.needs.health < 60) p *= 1.8;
  if (b.phys.nutrition < 0.9) p *= 1.5;
  if (game.house.season === 'winter') p *= 1.4;
  if (b.state.exposureUntil > game.sim.time) p *= 3;
  if (days < 60) p *= 0.6; // maternal antibodies... but also more dangerous
  if (!rng.chance(p * dtH)) return;
  const options = Object.entries(ILLNESSES).filter(([id, d]) => {
    if (['jaundice', 'ate_object', 'poisoning', 'botulism', 'failure_to_thrive'].includes(id)) return false;
    if (days < d.minDays || (d.maxDays && days > d.maxDays)) return false;
    return true;
  });
  const weights = options.map(([id, d]) => {
    let w = 1 / d.danger;
    if (d.preventedBy && protectedAgainst(game, d.preventedBy)) w *= 0.08;
    if (d.preventedBy && !protectedAgainst(game, d.preventedBy) && vaccineOverdue(game, days).length) w *= 2.5;
    if (id === 'cold') w *= 3;
    return w;
  });
  const total = weights.reduce((a, x) => a + x, 0);
  let r = rng.next() * total;
  let picked = options[0][0];
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) { picked = options[i][0]; break; } }
  b.illness = mk(picked, game, rng.range(12, 28), rng);
  log(game, 'illness', `${b.name} seems off — ${symptomsFor(picked)}.`, 'warn');
}

export function mk(id, game, severity, rng) {
  return { id, severity, startedAt: game.sim.time, treated: false, known: false, medsAt: [], peak: rng ? rng.range(45, 95) : 70 };
}

export function symptomsFor(id) {
  return {
    cold: 'runny nose, sneezing and a little cough', fever: 'warm forehead, flushed cheeks, fussy', ear_infection: 'tugging at the ear, crying when lying down',
    stomach_bug: 'vomiting and loose diapers', rsv: 'wheezy, fast breathing and a wet cough', croup: 'a barking cough and hoarse cry',
    hfm: 'small blisters on hands, feet and mouth, refusing food', chickenpox: 'itchy red spots spreading over the body', flu: 'high fever, aches, not eating',
    pertussis: 'coughing fits ending in a whoop, turning red', jaundice: 'yellow skin and eyes, very sleepy', ate_object: 'drooling, gagging and belly pain',
    poisoning: 'vomiting, drowsiness, chemical smell on the breath', botulism: 'weak cry, floppy body, constipation, poor feeding',
    failure_to_thrive: 'listless, not gaining weight, no interest in anything',
  }[id] || 'not quite right';
}

export function updateIllness(game, dtH, rng, days) {
  const b = game.baby, ill = b.illness;
  if (!ill) { b.phys.tempC = 36.6 + (b.wear.layers === 'warm' && game.house.roomTempC > 23 ? 0.5 : 0) + 0.2 * Math.sin(game.sim.time / 9000); return; }
  const def = ILLNESSES[ill.id];
  const elapsedD = (game.sim.time - ill.startedAt) / DAY;
  const recentMeds = ill.medsAt.some((m) => game.sim.time - m < 6 * HOUR);
  const supported = b.needs.fullness > 40 && b.needs.rest > 30;
  let rate;
  if (elapsedD < def.courseDays * 0.4) rate = ill.treated ? 1.0 : 2.4;
  else if (elapsedD < def.courseDays) rate = ill.treated ? -3.2 : (def.danger < 1 ? -1.4 : 0.4);
  else rate = ill.treated ? -4 : -1.6 * (def.danger < 1 ? 1.5 : 0.5);
  if (ill.id === 'failure_to_thrive') rate = b.emo.happiness > 35 && b.phys.nutrition > 0.95 ? -2 : 1.2;
  if (ill.id === 'jaundice') rate = b.needs.fullness > 45 ? -2.5 : 0.8;
  if (recentMeds) rate -= 0.8;
  if (!supported) rate += 0.8;
  if (b.emo.stress > 70) rate += 0.3;
  ill.severity = clamp(ill.severity + rate * dtH * (rate > 0 && ill.severity > ill.peak ? 0.2 : 1), 0, 100);
  const feverish = ['fever', 'flu', 'ear_infection', 'rsv', 'hfm', 'chickenpox', 'pertussis', 'croup'].includes(ill.id);
  b.phys.tempC = +(36.7 + (feverish ? ill.severity * 0.033 : ill.severity * 0.006) - (recentMeds ? 0.8 : 0)).toFixed(1);
  if (ill.severity <= 0) {
    log(game, 'recovered', `${b.name} has recovered from ${def.label.toLowerCase()}.`, 'good');
    b.illness = null; b.phys.tempC = 36.7;
    return;
  }
  if (b.phys.tempC >= 38 && days < 90 && !ill.flaggedFever) { ill.flaggedFever = true; log(game, 'fever_alert', `${b.name} has a fever of ${b.phys.tempC.toFixed(1)}°C. Under 3 months this is an emergency — call the doctor now.`, 'danger'); }
  if (ill.severity >= 92 && def.danger >= 0.9 && !b.state.hospitalizedUntil) {
    if (rng.chance(0.3 * dtH)) hospitalize(game, `severe ${def.label.toLowerCase()}`);
  }
}

export function hospitalize(game, reason) {
  const b = game.baby;
  b.state.hospitalizedUntil = game.sim.time + 24 * HOUR;
  b.state.location = 'hospital'; b.state.held = false; b.state.cryingSince = null; b.state.activity = 'sleeping';
  if (b.illness) { b.illness.treated = true; b.illness.known = true; }
  b.emo.trust = clamp(b.emo.trust - 4); b.emo.stress = clamp(b.emo.stress + 20);
  game.stats.doctorVisits++;
  log(game, 'hospital', `${b.name} was rushed to the hospital for ${reason}. ${b.sex === 'girl' ? 'She' : 'He'} will be back in about a day.`, 'danger');
}

export function growthPercentile(game) {
  const b = game.baby; const med = medianGrowth(ageDays(game), b.sex);
  const z = (b.phys.weightKg / med.weight - 1) / 0.12;
  const pct = Math.round(100 / (1 + Math.exp(-1.7 * z)));
  return clamp(pct, 1, 99);
}

// Telehealth visit. Returns a structured report and mutates game (checkups, prescriptions, nurse scheduling).
export function doctorVisit(game, kind = 'checkup') {
  const b = game.baby, days = ageDays(game), t = game.sim.time;
  const notes = [], advice = [], rx = [];
  let severity = 'ok';
  game.stats.doctorVisits++;
  const pct = growthPercentile(game);
  notes.push(`Weight ${b.phys.weightKg.toFixed(2)} kg (${pct}th percentile), length ${b.phys.heightCm.toFixed(1)} cm.`);
  if (pct < 10) { advice.push('Weight is low. Feed on demand, at least every 3 hours, and offer solids appropriate for age.'); severity = 'warn'; }
  if (b.phys.nutrition < 0.9) advice.push('Nutrition looks poor. Do not skip feeds; introduce iron-rich solids after 6 months.');
  const due = CHECKUPS.find((c) => !b.checkups[c.id] && days >= c.dueDays - 3 && days <= c.dueDays + c.windowDays);
  if (kind === 'checkup') {
    if (due) { b.checkups[due.id] = days; notes.push(`${due.label} completed.`); }
    else notes.push('No scheduled checkup is due right now; consider this a general visit.');
    const missed = CHECKUPS.filter((c) => !b.checkups[c.id] && days > c.dueDays + c.windowDays);
    if (missed.length) { notes.push(`Missed checkups: ${missed.map((m) => m.label).join(', ')}.`); severity = 'warn'; }
  }
  // development
  const delayed = MILESTONES.filter((m) => !b.milestones[m.id] && days > m.maxDays);
  if (delayed.length) { notes.push(`Developmental delays noted: ${delayed.map((m) => m.label).join(', ')}.`); advice.push('More floor time, talking, reading and face-to-face play every day.'); severity = 'warn'; }
  else notes.push('Development is on track for age.');
  for (const k of ['cognitive', 'motor', 'language', 'social', 'emotional']) {
    if (b.dev[k] < expectedDev(days) * 0.7 && days > 60) advice.push(`${k[0].toUpperCase() + k.slice(1)} skills are behind; add daily ${k === 'motor' ? 'tummy/floor time' : k === 'language' ? 'reading and singing' : 'interactive play'}.`);
  }
  // emotional
  if (b.emo.stress > 60) { notes.push('The baby appears stressed and hypervigilant.'); advice.push('Respond quickly and gently to crying; never shout at or leave a crying baby.'); severity = 'warn'; }
  if (b.attachment === 'disorganized' || b.attachment === 'avoidant') { notes.push(`Attachment pattern looks ${b.attachment}.`); severity = 'warn'; }
  // illness
  if (b.illness) {
    const def = ILLNESSES[b.illness.id];
    b.illness.known = true; b.illness.treated = true;
    notes.push(`Diagnosis: ${def.label} (severity ${Math.round(b.illness.severity)}/100).`);
    for (const m of def.meds) {
      if (['antibiotics', 'antivirals', 'steroids'].includes(m)) { b.prescriptions[m] = t; rx.push(m); }
    }
    if (def.meds.includes('acetaminophen') && days >= 61) advice.push('Infant acetaminophen every 4–6 hours for fever or pain (max 5 doses/day).');
    if (def.meds.includes('acetaminophen') && days < 61) { b.doctorApprovedMeds = true; advice.push('Under 2 months: one weight-based dose of acetaminophen is approved by me only for this illness. Call back if fever persists.'); }
    if (def.meds.includes('ibuprofen') && days >= 183) advice.push('Ibuprofen may be used every 6–8 hours after 6 months.');
    if (def.meds.includes('saline')) advice.push('Saline drops and suction before feeds and sleep.');
    if (def.meds.includes('electrolytes')) advice.push('Small frequent sips of oral electrolytes; keep feeding.');
    if (b.illness.id === 'jaundice') advice.push('Feed every 2–3 hours around the clock; daylight near a window helps. Recheck in 2 days.');
    severity = b.illness.severity > 60 ? 'danger' : 'warn';
    if (b.illness.severity >= 75 && def.danger >= 0.9) { hospitalize(game, def.label.toLowerCase()); notes.push('This is serious — I am sending an ambulance. Hospital admission for monitoring.'); }
    else if (b.phys.tempC >= 38 && days < 90) { hospitalize(game, 'fever under 3 months'); notes.push('Fever under 3 months requires an emergency evaluation. Ambulance dispatched.'); }
  } else notes.push('No acute illness found today.');
  if (b.phys.rash > 40) advice.push('Diaper rash: change more often, air time, and barrier cream at every change.');
  if (b.injuries.length) { notes.push('Recent injuries noted. Baby-proof the home now.'); severity = 'warn'; }
  // vaccines
  const dueVx = VACCINES.filter((v) => !b.vaccines[v.id] && days >= v.dueDays - 5);
  if (dueVx.length) {
    if (!game.house.nurseAtDoor) {
      game.house.nurseAtDoor = { arrivesAt: t + 4 * HOUR, vaccines: dueVx.map((v) => v.id) };
      notes.push(`Vaccines due: ${dueVx.map((v) => v.label).join('; ')}. A visiting nurse will arrive in about 4 hours.`);
    } else notes.push('A nurse visit is already scheduled for vaccines.');
    if (vaccineOverdue(game, days).length) severity = 'warn';
  }
  // safe sleep & general advice by age
  if (days < 365) advice.push('Safe sleep: always on the back, alone, in a crib on a firm surface; no loose blankets; room 20–22°C.');
  if (days >= 120 && days < 200 && b.state.lastSolidsAt == null) advice.push('Between 4–6 months you can begin single-ingredient purees or cereal.');
  if (days >= 365 && b.state.lastSolidsAt == null) advice.push('After 12 months, whole milk and table foods; formula can stop.');
  if (days < 365) advice.push('Never honey before 12 months. No water before 6 months.');
  if (days >= 180 && b.counters.floorTimeMin < 300) advice.push('More supervised floor time to encourage crawling.');
  if (days >= 540 && b.counters.pottyProgress < 10) advice.push('You can start gentle potty introduction from 18 months.');
  if (days >= 700 && Object.keys(b.counters.lessons).length === 0) advice.push('Short daily lessons — colors, songs, stories — build cognitive and language skills.');
  const report = { at: t, kind, severity, notes, advice, rx, percentile: pct };
  b.doctorNotes.push(report);
  if (b.doctorNotes.length > 30) b.doctorNotes.shift();
  log(game, 'doctor', `Telehealth visit: ${notes[1] || notes[0]}`, severity === 'ok' ? 'good' : severity);
  return report;
}
