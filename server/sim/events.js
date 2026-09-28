// Roaming, household hazards (mitigated by baby-proofing) and the babysitter's automatic care.
import { HOUR, MIN, clamp, ILLNESSES } from '../../shared/constants.js';
import { log } from './engine.js';
import { mk } from './health.js';

export function isMobile(game) {
  const m = game.baby.milestones;
  return !!(m.crawls || m.walks || m.pulls_stand);
}

const HAZARD_SPOTS = ['floor', 'kitchen', 'stairs', 'sofa', 'play_mat'];

export function roamAndHazards(game, dt, rng, days, supervised, offline) {
  const b = game.baby, s = b.state, t = game.sim.time, dtH = dt / HOUR;
  if (s.activity === 'sleeping' || s.held || s.hospitalizedUntil > t) { s.hazardDwell = 0; return; }
  const contained = ['crib', 'playpen', 'high_chair', 'changing_table', 'toddler_bed', 'bath'].includes(s.location);
  const mobile = isMobile(game);
  if (!mobile) {
    if (s.location === 'sofa' && !supervised && rng.chance(0.06 * dtH)) injure(game, 'rolled off the sofa', 14, false, 'head_bump');
    if (s.location === 'changing_table' && !supervised && days > 90 && rng.chance(0.1 * dtH)) injure(game, 'rolled off the changing table', 22, true, 'fall');
    return;
  }
  if (contained) { s.hazardDwell = 0; return; }
  // roam
  const roamP = (supervised ? 0.25 : 0.45) * dtH * (b.milestones.walks ? 1.4 : 1);
  if (rng.chance(roamP)) {
    const next = rng.pick(HAZARD_SPOTS.filter((x) => x !== s.location));
    s.location = next; s.hazardDwell = 0;
    if (next === 'stairs') log(game, 'roam', `${b.name} ${b.milestones.walks ? 'toddled' : 'crawled'} over to the stairs.`, game.house.proofing.stair_gate ? 'info' : 'warn');
    else if (next === 'kitchen') log(game, 'roam', `${b.name} is exploring the kitchen cabinets.`, game.house.proofing.cabinet_locks ? 'info' : 'warn');
    else if (next === 'sofa') log(game, 'roam', `${b.name} climbed onto the sofa.`, 'info');
    else if (rng.chance(0.5)) log(game, 'roam', `${b.name} is crawling around the living room.`, 'info');
    if (next === 'play_mat' && rng.chance(0.6)) { s.selfPlayUntil = t + 30 * MIN; log(game, 'roam', `${b.name} found the toys and is playing.`, 'good'); }
  }
  s.hazardDwell += dt;
  const dwellOk = supervised ? s.hazardDwell > 12 * MIN : true;
  if (!dwellOk) return;
  const pr = game.house.proofing;
  const mult = (supervised ? 0.35 : 1) * dtH;
  if (s.location === 'stairs' && !pr.stair_gate && rng.chance(0.18 * mult)) injure(game, 'tumbled down the stairs', 30, true, 'fall');
  if (s.location === 'kitchen' && !pr.cabinet_locks && rng.chance(0.09 * mult)) {
    if (!b.illness) { b.illness = mk('poisoning', game, 55, rng); b.illness.known = true; }
    b.emo.stress = clamp(b.emo.stress + 30);
    game.stats.hazards++;
    log(game, 'hazard', `${b.name} got into the cleaning cabinet and swallowed something. ${b.sex === 'girl' ? 'She' : 'He'} is vomiting and drowsy — call the doctor immediately.`, 'danger');
  }
  if (!pr.small_objects && rng.chance(0.06 * mult)) {
    if (!b.illness) { b.illness = mk('ate_object', game, 35, rng); b.illness.known = true; }
    game.stats.hazards++;
    log(game, 'hazard', `${b.name} found something small on the floor and ate it. Now gagging and holding ${b.sex === 'girl' ? 'her' : 'his'} tummy.`, 'danger');
  }
  if (!pr.outlet_covers && rng.chance(0.03 * mult)) injure(game, 'touched an uncovered outlet and got a shock', 16, true, 'shock');
  if (!pr.cord_clips && rng.chance(0.012 * mult)) injure(game, 'got tangled in the blind cord', 24, true, 'cord');
  if (!pr.corner_guards && rng.chance(0.07 * mult)) injure(game, 'bumped into a sharp table corner', 6, false, 'head_bump');
  if (!pr.anchors && s.location === 'floor' && b.milestones.pulls_stand && rng.chance(0.015 * mult)) injure(game, 'pulled the bookshelf over', 35, true, 'tipover');
  void offline;
}

export function injure(game, what, dmg, severe, kind) {
  const b = game.baby, t = game.sim.time;
  b.needs.health = clamp(b.needs.health - dmg);
  b.emo.stress = clamp(b.emo.stress + dmg * 0.9);
  b.emo.security = clamp(b.emo.security - dmg * 0.3);
  b.injuries.push({ kind, at: t, healAt: t + (severe ? 4 : 1) * 86400, pain: severe ? 14 : 6, severe });
  game.stats.hazards++;
  if (!b.state.cryingSince) { b.state.cryingSince = t; b.state.cryIntensity = 1; b.state.cryCause = 'in pain'; }
  log(game, 'injury', `${b.name} ${what}!${severe ? ' This is a serious injury.' : ''}`, 'danger');
}

export function runBabysitter(game, dtH, rng) {
  const b = game.baby, s = b.state, n = b.needs, inv = game.inventory, t = game.sim.time;
  if (s.hospitalizedUntil > t) return;
  b.emo.trust = clamp(b.emo.trust - dtH * 0.03);
  if (s.activity === 'sleeping') return;
  if (n.fullness < 40 && inv.formula > 0 && inv.bottlesClean > 0) {
    inv.formula--; inv.bottlesClean--; n.fullness = clamp(n.fullness + 50); s.lastFedAt = t; s.needsBurp = rng.chance(0.3);
    game.stats.feeds++; b.counters.feeds++; log(game, 'sitter', `The babysitter fed ${b.name}.`, 'info');
  } else if (n.fullness < 40 && (inv.toddler_meals > 0 || inv.purees > 0)) {
    if (inv.toddler_meals > 0) inv.toddler_meals--; else inv.purees--;
    n.fullness = clamp(n.fullness + 45); s.lastFedAt = t; s.lastSolidsAt = t; log(game, 'sitter', `The babysitter fed ${b.name}.`, 'info');
  }
  if (n.diaper < 40 && diaperCount(inv) > 0 && inv.wipes >= 2) {
    takeDiaper(inv, b.wear.diaperSize); inv.wipes -= 2; n.diaper = 100; s.lastDiaperAt = t; game.stats.diapers++;
    log(game, 'sitter', `The babysitter changed ${b.name}'s diaper.`, 'info');
  }
  if (s.cryingSince && t - s.cryingSince > 4 * MIN) { s.lastAnsweredCryAt = t; b.emo.stress = clamp(b.emo.stress - dtH * 6); n.comfort = clamp(n.comfort + dtH * 8); }
  if (inv.bottlesClean === 0 && inv.bottles > 0) inv.bottlesClean = inv.bottles;
  if (!['crib', 'playpen', 'play_mat'].includes(s.location) && !s.held) s.location = inv.playpen ? 'playpen' : 'crib';
}

export function diaperCount(inv) { return Object.values(inv.diapers).reduce((a, x) => a + x, 0); }
export function takeDiaper(inv, preferred) {
  if (inv.diapers[preferred] > 0) { inv.diapers[preferred]--; return preferred; }
  for (const k of Object.keys(inv.diapers)) if (inv.diapers[k] > 0) { inv.diapers[k]--; return k; }
  return null;
}
void ILLNESSES;
