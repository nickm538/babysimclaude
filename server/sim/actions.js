// Parent actions. applyAction(game, id, params, rng) validates, mutates and journals; returns { ok, message, report? }.
import { HOUR, MIN, DAY, clamp, LESSONS, TOYS, SHOP, BABYPROOFING, CLOTHING_SIZES, DIAPER_SIZES, VACCINES, clothingSizeFor } from '../../shared/constants.js';
import { log, ageDays, distressOf } from './engine.js';
import { mk, doctorVisit } from './health.js';
import { diaperCount, takeDiaper } from './events.js';
import { makeRng } from './rng.js';
import { EXTRA_HANDLERS } from './actions2.js';
import { resolveChoice } from './story.js';

const TOY_INDEX = Object.fromEntries(TOYS.map((t) => [t.id, t]));
const LESSON_INDEX = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

function fail(message) { return { ok: false, message }; }
function ok(message, extra = {}) { return { ok: true, message, ...extra }; }

function touch(game) { game.baby.state.lastInteractionAt = game.sim.time; }

// Bonding gives trust only about once an hour so spamming cuddles can't max it out.
function bond(game, amount) {
  const b = game.baby, t = game.sim.time;
  if (t - (b.state.lastBondAt || -1e9) < HOUR) return;
  b.state.lastBondAt = t;
  b.emo.trust = clamp(b.emo.trust + amount);
}

// Credit the parent for responding to a cry; updates responsiveness EMA and trust.
function answerCry(game, soothing = 1) {
  const b = game.baby, s = b.state, t = game.sim.time;
  if (!s.cryingSince) return;
  const waited = (t - s.cryingSince) / MIN;
  const quality = waited < 3 ? 1 : waited < 8 ? 0.85 : waited < 15 ? 0.6 : waited < 30 ? 0.35 : waited < 60 ? 0.15 : 0.05;
  b.responsiveness = clamp(b.responsiveness * 0.9 + quality * 0.1, 0, 1);
  b.emo.trust = clamp(b.emo.trust + (quality - 0.4) * 0.25 * soothing);
  b.emo.security = clamp(b.emo.security + (quality - 0.3) * 1.0);
  b.emo.stress = clamp(b.emo.stress - 8 * soothing);
  b.history.criesAnswered++;
  s.lastAnsweredCryAt = t;
}

function wakeIfSleeping(game, why, gentle) {
  const s = game.baby.state;
  if (s.activity !== 'sleeping') return false;
  s.activity = 'awake'; s.awakeSince = game.sim.time; s.sleepSince = null;
  if (!gentle) { game.baby.emo.stress = clamp(game.baby.emo.stress + 6); game.baby.needs.rest = clamp(game.baby.needs.rest - 5); }
  log(game, 'woke', `${game.baby.name} woke up (${why}).`, 'info');
  return true;
}

function requireHome(game) {
  if (game.parent.awayUntil > game.sim.time) return fail('You left the room. Come back first.');
  if (game.baby.state.hospitalizedUntil > game.sim.time) return fail(`${game.baby.name} is in the hospital right now.`);
  return null;
}

export function applyAction(game, id, params = {}, rngIn) {
  if (game.status !== 'active') return fail('This game is over.');
  const rng = rngIn || makeRng((game.sim.seed ^ (game.sim.steps * 7919) ^ (id.length * 104729)) >>> 0);
  const handler = HANDLERS[id];
  if (!handler) return fail(`Unknown action ${id}`);
  if (!['return', 'babysitter', 'thermostat', 'doctor', 'collect_package'].includes(id)) { const r = requireHome(game); if (r) return r; }
  return handler(game, params, rng);
}

const FOOD = {
  formula: { key: 'formula', minDays: 0, fill: 58, burp: true, bottle: true, label: 'a bottle of formula' },
  puree: { key: 'purees', minDays: 120, fill: 40, solids: true, label: 'puree' },
  cereal: { key: 'cereal', minDays: 120, fill: 35, solids: true, label: 'baby cereal' },
  finger: { key: 'finger_foods', minDays: 240, fill: 40, solids: true, label: 'finger foods' },
  toddler_meal: { key: 'toddler_meals', minDays: 365, fill: 62, solids: true, label: 'a toddler meal' },
  milk: { key: 'whole_milk', minDays: 365, fill: 28, burp: true, label: 'a cup of whole milk' },
  water: { key: null, minDays: 180, fill: 8, label: 'water' },
  snack: { key: 'snacks', minDays: 300, fill: 22, solids: true, label: 'a snack' },
  honey: { key: 'honey', minDays: 365, fill: 10, label: 'honey' },
};

const HANDLERS = {
  feed(game, { type = 'formula' }, rng) {
    const b = game.baby, s = b.state, n = b.needs, inv = game.inventory, days = ageDays(game), t = game.sim.time;
    const f = FOOD[type]; if (!f) return fail('Unknown food.');
    if (f.key && (inv[f.key] || 0) <= 0) return fail(`You're out of ${f.label}. Order more from the shop.`);
    if (f.bottle && inv.bottlesClean <= 0) return fail('No clean bottles. Wash the bottles first.');
    const wasCrying = !!s.cryingSince;
    wakeIfSleeping(game, 'feeding', true);
    if (f.key) inv[f.key]--;
    if (f.bottle) inv.bottlesClean--;
    touch(game);
    game.stats.feeds++; b.counters.feeds++; s.mealsToday++;
    // age-inappropriate foods have consequences
    if (type === 'honey' && days < 365) {
      if (rng.chance(0.3) && !b.illness) { b.illness = mk('botulism', game, 30, rng); log(game, 'illness', `${b.name} was given honey. Within a day ${b.sex === 'girl' ? 'she' : 'he'} is floppy, weak and constipated.`, 'danger'); }
      else log(game, 'warn', `Honey before 12 months risks infant botulism. Nothing happened this time.`, 'warn');
      return ok('You gave honey to an infant. This was dangerous.');
    }
    if (f.solids && days < f.minDays) {
      const choke = rng.chance(days < 120 ? 0.35 : 0.2);
      n.comfort = clamp(n.comfort - 25); b.emo.stress = clamp(b.emo.stress + 20);
      if (choke) { n.health = clamp(n.health - 6); log(game, 'choke', `${b.name} gagged and choked on ${f.label} — far too early for solids. Terrifying moments before it cleared.`, 'danger'); }
      else log(game, 'warn', `${b.name} spat out the ${f.label}; babies this age can't handle solids yet.`, 'warn');
      return ok(`Too early for ${f.label}.`);
    }
    if (type === 'milk' && days < 365) { n.comfort = clamp(n.comfort - 18); log(game, 'warn', `Cow's milk before 12 months upsets ${b.name}'s stomach.`, 'warn'); if (rng.chance(0.15) && !b.illness) b.illness = mk('stomach_bug', game, 20, rng); return ok('Whole milk is not for babies under one.'); }
    if (type === 'water' && days < 180) { n.health = clamp(n.health - 4); log(game, 'warn', `Water before 6 months can dangerously dilute a baby's sodium. ${b.name} seems sluggish.`, 'danger'); return ok('Babies under 6 months should not drink water.'); }
    if (type === 'formula' && days > 450) n.comfort = clamp(n.comfort - 4);
    if (n.fullness > 85) {
      n.fullness = clamp(n.fullness + f.fill * 0.5); n.clean = clamp(n.clean - 15); n.comfort = clamp(n.comfort - 10);
      log(game, 'spitup', `${b.name} was already full and spat up all over ${b.sex === 'girl' ? 'her' : 'his'} outfit.`, 'warn');
      return ok('Overfed — spit-up.');
    }
    let fill = f.fill * (days < 30 ? 0.9 : 1);
    if (b.illness && ['stomach_bug', 'hfm', 'flu'].includes(b.illness.id) && rng.chance(0.4)) { fill *= 0.4; log(game, 'refuse', `${b.name} only took a little; ${b.sex === 'girl' ? 'she' : 'he'} feels sick.`, 'info'); }
    n.fullness = clamp(n.fullness + fill);
    s.lastFedAt = t;
    if (f.solids) s.lastSolidsAt = t;
    if (f.burp) s.needsBurp = rng.chance(0.75);
    if (s.held || s.location === 'held') { n.affection = clamp(n.affection + 8); bond(game, 0.06); }
    if (s.location === 'high_chair' && f.solids) { b.dev.motor = clamp(b.dev.motor + 0.006); }
    if (wasCrying && s.cryCause === 'hungry') answerCry(game, 1);
    log(game, 'feed', `You fed ${b.name} ${f.label}.`, 'good');
    return ok(`${b.name} ${s.needsBurp ? 'ate well and needs a burp' : 'ate well'}.`);
  },

  burp(game) {
    const b = game.baby, s = b.state;
    touch(game);
    if (!s.needsBurp) return ok(`${b.name} didn't need to burp.`);
    s.needsBurp = false; b.needs.comfort = clamp(b.needs.comfort + 12);
    if (s.cryingSince && s.cryCause === 'in pain') answerCry(game, 0.8);
    log(game, 'burp', `A big burp from ${b.name}. Much more comfortable.`, 'good');
    return ok('Burped.');
  },

  change_diaper(game, { cream = false }) {
    const b = game.baby, s = b.state, n = b.needs, inv = game.inventory;
    if (diaperCount(inv) <= 0) return fail('No diapers left. Order more now.');
    if (inv.wipes < 2) return fail('Out of wipes. Order more.');
    const wasCrying = !!s.cryingSince && s.cryCause === 'wet diaper';
    const used = takeDiaper(inv, b.wear.neededDiaper || b.wear.diaperSize);
    inv.wipes -= 2;
    b.wear.diaperSize = used;
    n.diaper = 100; s.lastDiaperAt = game.sim.time; game.stats.diapers++; b.counters.diapers++;
    b.phys.rash = clamp(b.phys.rash - 8);
    if (cream && inv.diaper_cream > 0) { inv.diaper_cream--; b.phys.rash = clamp(b.phys.rash - 30); }
    touch(game);
    if (used !== (b.wear.neededDiaper || used)) log(game, 'diaper', `Changed ${b.name} into a size ${used} diaper (wrong size — expect leaks).`, 'warn');
    else log(game, 'diaper', `Fresh diaper for ${b.name}${cream ? ' with rash cream' : ''}.`, 'good');
    if (wasCrying) answerCry(game, 1);
    if (s.location !== 'held') s.location = 'changing_table';
    return ok('Diaper changed.');
  },

  bathe(game, { temp = 'warm' }) {
    const b = game.baby, n = b.needs, inv = game.inventory;
    if (b.state.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    touch(game); game.stats.baths++;
    if (temp === 'hot') { n.comfort = clamp(n.comfort - 30); n.health = clamp(n.health - 4); b.emo.stress = clamp(b.emo.stress + 15); log(game, 'bath', `The water was too hot — ${b.name} screamed and ${b.sex === 'girl' ? 'her' : 'his'} skin is red.`, 'danger'); return ok('Too hot!'); }
    if (temp === 'cold') { n.comfort = clamp(n.comfort - 20); b.emo.stress = clamp(b.emo.stress + 8); log(game, 'bath', `Cold bath — ${b.name} shivered and cried.`, 'warn'); }
    else { n.comfort = clamp(n.comfort + 6); n.affection = clamp(n.affection + 6); b.dev.social = clamp(b.dev.social + 0.004); }
    if (inv.baby_wash > 0) inv.baby_wash--;
    n.clean = 100; b.phys.rash = clamp(b.phys.rash - 10); b.state.lastBathAt = game.sim.time;
    b.state.location = 'changing_table'; b.state.held = false;
    log(game, 'bath', `Bath time for ${b.name}.`, 'good');
    return ok('Squeaky clean.');
  },

  dress(game, { size, outfit = 'white', layers = 'normal' }) {
    const b = game.baby, inv = game.inventory;
    size = size || b.wear.outfitSize;
    if (!CLOTHING_SIZES.includes(size)) return fail('Unknown size.');
    if ((inv.clothes[size] || 0) <= 0) return fail(`No ${size} clothes in the wardrobe. Order some.`);
    if (!['light', 'normal', 'warm'].includes(layers)) layers = 'normal';
    b.wear.outfitSize = size; b.wear.outfit = outfit; b.wear.layers = layers;
    touch(game);
    const needed = clothingSizeFor(b.phys.weightKg, b.phys.heightCm);
    log(game, 'dress', `Dressed ${b.name} in ${size} ${outfit} (${layers}).${size !== needed ? ` ${b.sex === 'girl' ? 'She' : 'He'} needs ${needed}.` : ''}`, size === needed ? 'good' : 'warn');
    return ok('Dressed.');
  },

  hold(game, _, rng) {
    const b = game.baby, s = b.state;
    if (s.held) return ok('Already holding.');
    const wasSleeping = s.activity === 'sleeping';
    s.held = true; s.prevLocation = s.location; s.location = 'held'; s.position = 'held';
    touch(game);
    if (wasSleeping && rng.chance(0.55)) wakeIfSleeping(game, 'picked up', true);
    b.needs.affection = clamp(b.needs.affection + 6);
    if (s.cryingSince) answerCry(game, 0.9);
    log(game, 'hold', `You picked up ${b.name}.`, 'info');
    return ok('Holding.');
  },

  put_down(game, { location = 'crib', position = 'back' }, rng) {
    const b = game.baby, s = b.state, days = ageDays(game), inv = game.inventory;
    if (location === 'playpen' && !inv.playpen) return fail('You do not own a playpen.');
    if (location === 'high_chair' && !inv.high_chair) return fail('You do not own a high chair.');
    if (location === 'high_chair' && days < 150) return fail('Too young to sit in a high chair.');
    if (location === 'toddler_bed' && !inv.toddler_bed) return fail('You do not own a toddler bed.');
    if (!['crib', 'changing_table', 'play_mat', 'floor', 'sofa', 'playpen', 'high_chair', 'toddler_bed'].includes(location)) return fail('Bad location.');
    if (!['back', 'tummy', 'side', 'sitting'].includes(position)) position = 'back';
    if (position === 'sitting' && !b.milestones.sits && days < 150) position = 'back';
    s.held = false; s.location = location; s.position = position;
    touch(game);
    let msg = `Put ${b.name} down on the ${location.replace('_', ' ')}${position !== 'back' ? ` (${position})` : ''}.`;
    let sev = 'info';
    if (position === 'tummy' && s.activity === 'sleeping' && days < 180) {
      sev = 'danger'; msg += ' Sleeping on the tummy is a serious SIDS risk — babies under 6 months sleep on their back.';
      sidsCheck(game, rng);
    } else if (position === 'tummy' && days < 365 && s.activity !== 'sleeping') { msg += ' Tummy time — stay close.'; }
    if (location === 'sofa' && days < 365) { msg += ' A sofa is not a safe place to leave a baby.'; sev = sev === 'danger' ? sev : 'warn'; }
    if (location === 'sofa' && s.activity === 'sleeping' && days < 365) { sev = 'danger'; msg += ' Never let a baby sleep on a sofa.'; sidsCheck(game, rng, 2); }
    if (location === 'crib' && s.activity === 'sleeping' && position === 'back') b.emo.security = clamp(b.emo.security + 0.3);
    log(game, 'put_down', msg, sev);
    return ok(msg);
  },

  rock(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs;
    touch(game);
    n.comfort = clamp(n.comfort + 9); b.emo.stress = clamp(b.emo.stress - 10); n.affection = clamp(n.affection + 5);
    if (s.cryingSince) { answerCry(game, 1); s.cryIntensity = clamp(s.cryIntensity - 0.4, 0, 1); }
    if (s.activity !== 'sleeping' && n.rest < 40 && rng.chance(0.45 + (s.held ? 0.2 : 0))) {
      s.activity = 'sleeping'; s.sleepSince = game.sim.time; s.cryingSince = null; s.cryIntensity = 0;
      log(game, 'slept', `Rocked to sleep. ${b.name} drifted off.`, 'good');
      return ok(`${b.name} fell asleep.`);
    }
    log(game, 'rock', `You rocked and shushed ${b.name}.`, 'good');
    return ok('Soothed.');
  },

  cuddle(game) {
    const b = game.baby, n = b.needs;
    touch(game);
    n.affection = clamp(n.affection + 14); bond(game, 0.08); b.emo.stress = clamp(b.emo.stress - 8); b.emo.security = clamp(b.emo.security + 0.5);
    b.dev.emotional = clamp(b.dev.emotional + 0.005); b.dev.social = clamp(b.dev.social + 0.003);
    if (b.state.cryingSince && ['lonely', 'scared'].includes(b.state.cryCause)) answerCry(game, 1);
    log(game, 'cuddle', `Skin-to-skin cuddles with ${b.name}.`, 'good');
    return ok('Cuddled.');
  },

  sing(game) {
    const b = game.baby, n = b.needs;
    touch(game);
    n.stimulation = clamp(n.stimulation + 9); n.affection = clamp(n.affection + 6); b.emo.stress = clamp(b.emo.stress - 7);
    b.dev.language = clamp(b.dev.language + 0.008); b.dev.emotional = clamp(b.dev.emotional + 0.003);
    if (b.state.cryingSince) answerCry(game, 0.6);
    log(game, 'sing', `You sang to ${b.name}.`, 'good');
    return ok('Sang.');
  },

  play(game, { toy }, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    if (s.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    const def = TOY_INDEX[toy]; if (!def) return fail('Pick a toy.');
    if (!game.inventory.toys.includes(toy)) return fail(`You don't own ${def.label}.`);
    touch(game); game.stats.plays++; b.counters.plays++;
    if (days < def.minDays) { n.stimulation = clamp(n.stimulation + 3); log(game, 'play', `${b.name} is too young for the ${def.label.toLowerCase()} and lost interest.`, 'info'); return ok('Too young for that toy.'); }
    if (days > def.maxDays) { n.stimulation = clamp(n.stimulation + 4); log(game, 'play', `${b.name} has outgrown the ${def.label.toLowerCase()}.`, 'info'); return ok('Outgrown.'); }
    const tired = n.rest < 25;
    const eff = (n.stimulation > 85 ? 0.35 : 1) * (tired ? 0.5 : 1) * (b.emo.stress > 60 ? 0.6 : 1);
    n.stimulation = clamp(n.stimulation + 22 * eff); n.affection = clamp(n.affection + 5); b.emo.happiness = clamp(b.emo.happiness + 2 * eff);
    for (const [k, v] of Object.entries(def.gains)) b.dev[k] = clamp(b.dev[k] + 0.012 * v * eff);
    b.dev.social = clamp(b.dev.social + 0.004 * eff);
    if (['play_mat', 'floor'].includes(s.location)) b.counters.floorTimeMin += 8;
    if (tired && rng.chance(0.4)) { b.emo.stress = clamp(b.emo.stress + 6); log(game, 'play', `${b.name} got overstimulated and fussy — too tired to play.`, 'warn'); }
    else log(game, 'play', `You played with ${b.name} and the ${def.label.toLowerCase()}.`, 'good');
    if (s.cryingSince && s.cryCause === 'bored') answerCry(game, 1);
    return ok('Played.');
  },

  tummy_time(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game), t = game.sim.time;
    if (s.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    if (days > 365) return fail('Tummy time is for babies under one; try floor play instead.');
    touch(game);
    if (t - s.lastFedAt < 20 * MIN && rng.chance(0.5)) { n.clean = clamp(n.clean - 12); log(game, 'spitup', `Tummy time right after a feed — ${b.name} spat up.`, 'warn'); }
    s.held = false; s.location = 'play_mat'; s.position = 'tummy';
    b.counters.tummyTimeMin += 10; b.dev.motor = clamp(b.dev.motor + 0.014); n.stimulation = clamp(n.stimulation + 10);
    log(game, 'tummy', `Tummy time on the play mat for ${b.name}.`, 'good');
    return ok('Tummy time.');
  },

  read(game) {
    const b = game.baby, s = b.state, n = b.needs;
    if (s.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    if (!game.inventory.toys.some((x) => x.includes('book'))) return fail('You have no books. Order board or picture books.');
    touch(game); game.stats.reads++; b.counters.reads++;
    const eff = n.stimulation > 85 ? 0.4 : 1;
    n.stimulation = clamp(n.stimulation + 14 * eff); n.affection = clamp(n.affection + 5);
    b.dev.language = clamp(b.dev.language + 0.016 * eff); b.dev.cognitive = clamp(b.dev.cognitive + 0.008 * eff);
    log(game, 'read', `Story time with ${b.name}.`, 'good');
    return ok('Read a book.');
  },

  put_to_sleep(game, { position = 'back', location = 'crib' }, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game), inv = game.inventory;
    if (s.activity === 'sleeping') return ok(`${b.name} is already asleep.`);
    if (location === 'toddler_bed' && !inv.toddler_bed) return fail('You do not own a toddler bed.');
    if (!['crib', 'toddler_bed', 'sofa', 'held'].includes(location)) location = 'crib';
    touch(game);
    if (n.rest > 72 && days > 60) { n.comfort = clamp(n.comfort - 6); log(game, 'sleep', `${b.name} isn't tired and protested being put down.`, 'info'); s.held = false; s.location = location; s.position = position; return ok('Not tired.'); }
    const p = (n.rest < 30 ? 0.75 : 0.4) + (s.whiteNoise ? 0.08 : 0) + (b.wear.swaddled && days < 60 ? 0.1 : 0) + (s.pacifier ? 0.05 : 0) - (s.cryingSince ? 0.25 : 0) - (n.fullness < 35 ? 0.3 : 0) - (n.diaper < 35 ? 0.2 : 0);
    s.held = location === 'held'; s.location = location; s.position = location === 'held' ? 'held' : position;
    let msg, sev = 'good';
    if (rng.chance(clamp(p, 0.05, 0.95))) {
      s.activity = 'sleeping'; s.sleepSince = game.sim.time; s.cryingSince = null; s.cryIntensity = 0; s.selfPlayUntil = 0;
      msg = `${b.name} is asleep in the ${location.replace('_', ' ')}.`;
    } else { msg = `${b.name} fussed and wouldn't settle. ${n.fullness < 35 ? 'Probably hungry.' : n.diaper < 35 ? 'Check the diaper.' : 'Try rocking, white noise or a swaddle.'}`; sev = 'info'; }
    if (position === 'tummy' && days < 180 && s.activity === 'sleeping') { sev = 'danger'; msg += ' Tummy sleeping under 6 months is a serious SIDS risk.'; sidsCheck(game, rng); }
    if (location === 'sofa' && days < 365) { sev = 'danger'; msg += ' Sofas are unsafe for infant sleep.'; if (s.activity === 'sleeping') sidsCheck(game, rng, 2); }
    log(game, 'sleep', msg, sev);
    return ok(msg);
  },

  pacifier(game) {
    const b = game.baby, s = b.state, days = ageDays(game);
    if (!s.pacifier && game.inventory.pacifiers <= 0) return fail('No pacifier. Order one.');
    s.pacifier = !s.pacifier; touch(game);
    if (s.pacifier) { b.needs.comfort = clamp(b.needs.comfort + 6); if (s.cryingSince && !['hungry', 'wet diaper'].includes(s.cryCause)) answerCry(game, 0.5); }
    log(game, 'pacifier', s.pacifier ? `Gave ${b.name} a pacifier.${days > 730 ? ' At this age it can affect teeth.' : ''}` : `Took the pacifier away.`, 'info');
    return ok(s.pacifier ? 'Pacifier in.' : 'Pacifier out.');
  },

  swaddle(game) {
    const b = game.baby, days = ageDays(game);
    if (!b.wear.swaddled && game.inventory.swaddle <= 0) return fail('No swaddle blankets.');
    b.wear.swaddled = !b.wear.swaddled; touch(game);
    let sev = 'good', msg = b.wear.swaddled ? `Swaddled ${b.name} snugly.` : `Unswaddled ${b.name}.`;
    if (b.wear.swaddled && days >= 60) { sev = 'warn'; msg += ' Stop swaddling once the baby can roll — it becomes a suffocation risk.'; }
    if (b.wear.swaddled) b.needs.comfort = clamp(b.needs.comfort + (days < 60 ? 10 : -4));
    log(game, 'swaddle', msg, sev);
    return ok(msg);
  },

  white_noise(game) {
    const s = game.baby.state;
    if (!s.whiteNoise && game.inventory.white_noise <= 0) return fail('You do not own a white noise machine.');
    s.whiteNoise = !s.whiteNoise;
    log(game, 'white_noise', s.whiteNoise ? 'White noise on.' : 'White noise off.', 'info');
    return ok(s.whiteNoise ? 'Shhhh…' : 'Quiet.');
  },

  check_temp(game) {
    const b = game.baby;
    if (game.inventory.thermometer <= 0) return fail('No thermometer.');
    touch(game);
    const tc = b.phys.tempC;
    const msg = `${b.name}'s temperature is ${tc.toFixed(1)}°C (${(tc * 9 / 5 + 32).toFixed(1)}°F). ${tc >= 38 ? 'That is a fever.' : tc < 36.2 ? 'That is low — warm the room.' : 'Normal.'}`;
    log(game, 'temp', msg, tc >= 38 ? 'warn' : 'info');
    return ok(msg, { tempC: tc });
  },

  medicine(game, { id }, rng) {
    const b = game.baby, s = b.state, inv = game.inventory, days = ageDays(game), t = game.sim.time;
    const allowed = ['acetaminophen', 'ibuprofen', 'saline', 'electrolytes', 'antibiotics', 'antivirals', 'steroids'];
    if (!allowed.includes(id)) return fail('Unknown medicine.');
    if (['antibiotics', 'antivirals', 'steroids'].includes(id) && !b.prescriptions[id]) return fail(`${id} needs a doctor's prescription.`);
    if ((inv[id] || 0) <= 0 && !['antibiotics', 'antivirals', 'steroids'].includes(id)) return fail(`You're out of ${id}. Order more.`);
    if ((inv[id] || 0) > 0) inv[id]--;
    touch(game);
    s.medsLog = s.medsLog.filter((m) => t - m.at < DAY);
    const dosesToday = s.medsLog.filter((m) => m.id === id).length;
    const last = s.medsLog.filter((m) => m.id === id).sort((a, c) => c.at - a.at)[0];
    s.medsLog.push({ id, at: t });
    if (id === 'acetaminophen' && days < 61 && !b.doctorApprovedMeds) { b.needs.health = clamp(b.needs.health - 6); log(game, 'meds', `Acetaminophen under 2 months without a doctor's dosing is dangerous. ${b.name} is drowsy.`, 'danger'); return ok('Dangerous dose.'); }
    if (id === 'ibuprofen' && days < 183) { b.needs.health = clamp(b.needs.health - 8); log(game, 'meds', `Ibuprofen is not safe under 6 months — it can harm the kidneys. ${b.name} is unwell.`, 'danger'); return ok('Dangerous dose.'); }
    if (['acetaminophen', 'ibuprofen'].includes(id)) {
      const minGap = id === 'acetaminophen' ? 4 : 6;
      if (last && (t - last.at) < minGap * HOUR) { b.needs.health = clamp(b.needs.health - 10); log(game, 'meds', `Doses too close together. ${b.name} vomited — this is an overdose risk.`, 'danger'); return ok('Too soon since the last dose.'); }
      if (dosesToday >= 5) { b.needs.health = clamp(b.needs.health - 25); b.emo.stress = clamp(b.emo.stress + 20); log(game, 'meds', `Overdose: more than five doses of ${id} in 24 hours. ${b.name} is lethargic and vomiting. Call the doctor.`, 'danger'); if (!b.illness) b.illness = mk('poisoning', game, 50, rng); return ok('OVERDOSE.'); }
      if (!b.illness) { log(game, 'meds', `You gave ${b.name} ${id} without any fever or pain. Medicine is not a comfort tool.`, 'warn'); return ok('Unnecessary medicine.'); }
    }
    if (b.illness) { b.illness.medsAt.push(t); b.illness.treated = true; b.needs.comfort = clamp(b.needs.comfort + 10); if (s.cryingSince && s.cryCause === 'in pain') answerCry(game, 0.7); }
    log(game, 'meds', `Gave ${b.name} ${id}.`, 'info');
    return ok('Medicine given.');
  },

  vitamin_d(game) {
    const b = game.baby, inv = game.inventory, t = game.sim.time;
    if (inv.vitamin_d <= 0) return fail('No vitamin D drops.');
    if (t - b.state.lastVitaminAt < 20 * HOUR) return fail('Already given today.');
    inv.vitamin_d--; b.state.lastVitaminAt = t; b.phys.nutrition = clamp(b.phys.nutrition + 0.004, 0.7, 1.08);
    return ok('Vitamin D given.');
  },

  doctor(game, { kind = 'checkup' }) {
    if (game.parent.awayUntil > game.sim.time) return fail('Come back to the baby first.');
    const report = doctorVisit(game, kind === 'sick' ? 'sick' : 'checkup');
    return ok('Telehealth visit complete.', { report });
  },

  lesson(game, { id }) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    const def = LESSON_INDEX[id]; if (!def) return fail('Pick a lesson.');
    if (s.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    if (days < def.minDays) return fail(`${b.name} is too young for ${def.label}.`);
    touch(game); game.stats.lessons++; s.lessonsToday++;
    b.counters.lessons[id] = (b.counters.lessons[id] || 0) + 1;
    const eff = (n.stimulation > 88 ? 0.35 : 1) * (n.rest < 25 ? 0.5 : 1) * (s.lessonsToday > 4 ? 0.3 : 1) * (b.emo.stress > 60 ? 0.6 : 1);
    for (const [k, v] of Object.entries(def.gains)) b.dev[k] = clamp(b.dev[k] + 0.02 * v * eff);
    n.stimulation = clamp(n.stimulation + 16 * eff); n.affection = clamp(n.affection + 3);
    if (s.lessonsToday > 4) { b.emo.stress = clamp(b.emo.stress + 8); log(game, 'lesson', `Too many lessons today — ${b.name} melted down. Kids this age learn through play.`, 'warn'); }
    else log(game, 'lesson', `Lesson: ${def.label} with ${b.name}.`, 'good');
    return ok('Lesson done.');
  },

  potty(game, _, rng) {
    const b = game.baby, days = ageDays(game), c = b.counters;
    if (game.inventory.potty <= 0) return fail('You need a potty seat.');
    if (b.state.activity === 'sleeping') return fail(`${b.name} is asleep.`);
    touch(game);
    if (days < 540) { log(game, 'potty', `${b.name} has no idea what the potty is for yet. Wait until at least 18 months.`, 'info'); return ok('Too early.'); }
    const success = rng.chance(0.15 + (c.pottyProgress / 100) * 0.6 + (days > 900 ? 0.15 : 0));
    c.pottyProgress = clamp(c.pottyProgress + (success ? 7 : 3));
    b.dev.emotional = clamp(b.dev.emotional + 0.006);
    if (success) { b.needs.diaper = clamp(b.needs.diaper + 20); log(game, 'potty', `${b.name} used the potty! Big cheers. (${Math.round(c.pottyProgress)}% trained)`, 'good'); }
    else log(game, 'potty', `Sat on the potty, nothing happened. Keep it relaxed. (${Math.round(c.pottyProgress)}% trained)`, 'info');
    return ok(success ? 'Success!' : 'Nothing yet.');
  },

  move(game, { location = 'crib' }, rng) { return HANDLERS.put_down(game, { location, position: game.baby.state.position === 'held' ? 'back' : game.baby.state.position }, rng); },

  yell(game) {
    const b = game.baby, e = b.emo, s = b.state, days = ageDays(game);
    game.parent.tempers.yells++; game.stats.yells++;
    e.trust = clamp(e.trust - 8); e.happiness = clamp(e.happiness - 12); e.stress = clamp(e.stress + 25); e.security = clamp(e.security - 8);
    b.dev.emotional = clamp(b.dev.emotional - 0.02);
    wakeIfSleeping(game, 'startled by yelling', false);
    if (!s.cryingSince) { s.cryingSince = game.sim.time; s.cryCause = 'scared'; s.cryIntensity = 1; game.stats.cries++; } else s.cryIntensity = 1;
    s.lastAnsweredCryAt = 0;
    log(game, 'temper', `You yelled at ${b.name}. ${days < 365 ? `${b.sex === 'girl' ? 'She' : 'He'} flinched and started screaming.` : `${b.sex === 'girl' ? 'She' : 'He'} froze, then burst into tears.`} Trust took a serious hit.`, 'danger');
    return ok('You lost your temper.');
  },

  scream(game) {
    const b = game.baby, e = b.emo, s = b.state;
    game.parent.tempers.screams++; game.stats.screams++;
    e.trust = clamp(e.trust - 15); e.happiness = clamp(e.happiness - 20); e.stress = clamp(e.stress + 40); e.security = clamp(e.security - 15);
    b.dev.emotional = clamp(b.dev.emotional - 0.04);
    wakeIfSleeping(game, 'terrified by screaming', false);
    s.cryingSince = s.cryingSince || game.sim.time; s.cryCause = 'scared'; s.cryIntensity = 1; s.lastAnsweredCryAt = 0;
    log(game, 'temper', `You screamed in ${b.name}'s face. ${b.sex === 'girl' ? 'She' : 'He'} is shaking and inconsolable. This is the kind of moment a child never forgets.`, 'danger');
    return ok('You screamed at your baby.');
  },

  leave(game, { minutes = 30 }) {
    const b = game.baby, e = b.emo, s = b.state;
    minutes = clamp(Number(minutes) || 30, 5, 240);
    game.parent.awayUntil = game.sim.time + minutes * MIN; game.parent.awayReason = 'punishment';
    game.parent.tempers.leaves++; game.stats.leaves++;
    e.trust = clamp(e.trust - 10); e.security = clamp(e.security - 10); e.stress = clamp(e.stress + 15);
    if (s.held) { s.held = false; s.location = 'crib'; }
    log(game, 'temper', `You walked out and shut the door on ${b.name} for ${minutes} minutes. ${b.sex === 'girl' ? 'Her' : 'His'} cries go unanswered.`, 'danger');
    return ok(`Left the baby alone for ${minutes} minutes.`);
  },

  return(game) {
    if (game.parent.awayUntil <= game.sim.time) return ok('You are already here.');
    game.parent.awayUntil = 0;
    log(game, 'return', `You came back to ${game.baby.name}.`, 'info');
    return ok('Back with the baby.');
  },

  babysitter(game, { hours = 8 }) {
    hours = clamp(Number(hours) || 8, 1, 24);
    game.parent.babysitterUntil = game.sim.time + hours * HOUR;
    log(game, 'sitter', `A babysitter is watching ${game.baby.name} for the next ${hours} hours. They cover basics, not bonding.`, 'info');
    return ok(`Babysitter booked for ${hours}h.`);
  },

  collect_package(game, { orderId }) {
    const o = game.orders.find((x) => x.id === orderId && x.status === 'delivered') || game.orders.find((x) => x.status === 'delivered');
    if (!o) return fail('No package at the door.');
    o.status = 'collected';
    game.house.doorPackages = game.house.doorPackages.filter((id) => id !== o.id);
    const inv = game.inventory;
    for (const it of o.items) {
      const def = SHOP.find((s) => s.id === it.id); if (!def) continue;
      if (def.sized === 'diaper') inv.diapers[it.size] = (inv.diapers[it.size] || 0) + def.qty;
      else if (def.sized === 'clothing') inv.clothes[it.size] = (inv.clothes[it.size] || 0) + def.qty;
      else if (def.sized === 'toy') { if (!inv.toys.includes(it.size)) inv.toys.push(it.size); }
      else if (def.sized === 'proofing') { game.house.proofing[it.size] = true; }
      else if (def.key === 'bottles') { inv.bottles += def.qty; inv.bottlesClean += def.qty; }
      else inv[def.key] = (inv[def.key] || 0) + def.qty;
    }
    log(game, 'package', `Brought in the delivery: ${o.items.map((i) => i.label).join(', ')}.`, 'good');
    return ok('Package collected.');
  },

  nurse_visit(game, _, rng) {
    const b = game.baby, nurse = game.house.nurseAtDoor, days = ageDays(game);
    if (!nurse || nurse.arrivesAt > game.sim.time) return fail('The nurse is not here yet.');
    const given = [];
    for (const id of nurse.vaccines) { const v = VACCINES.find((x) => x.id === id); if (v && !b.vaccines[id] && days >= v.dueDays - 5) { b.vaccines[id] = Math.floor(days); given.push(v.label); } }
    game.house.nurseAtDoor = null;
    if (!given.length) return ok('Nothing was due.');
    b.state.postVaccineUntil = game.sim.time + 24 * HOUR; b.needs.comfort = clamp(b.needs.comfort - 15); b.emo.stress = clamp(b.emo.stress + 10);
    if (rng.chance(0.25) && !b.illness) { b.illness = mk('fever', game, 15, rng); b.illness.known = true; b.illness.treated = true; }
    log(game, 'vaccine', `The nurse gave ${b.name}: ${given.join('; ')}. Expect a sore leg and fussiness for a day.`, 'good');
    return ok('Vaccines given.');
  },

  thermostat(game, { tempC }) {
    tempC = clamp(Number(tempC) || 21, 14, 30);
    game.house.thermostatC = tempC;
    log(game, 'thermostat', `Thermostat set to ${tempC}°C.`, tempC < 18 || tempC > 24 ? 'warn' : 'info');
    return ok(`Thermostat ${tempC}°C.`);
  },

  wash_bottles(game) {
    game.inventory.bottlesClean = game.inventory.bottles;
    return ok('All bottles washed and sterilized.');
  },

  choice(game, { choiceId, option }, rng) {
    if (typeof choiceId !== 'string' || typeof option !== 'string') return fail('Pick an option.');
    return resolveChoice(game, choiceId, option, rng);
  },

  talk(game, { tone = 'gentle' }) {
    const b = game.baby, n = b.needs;
    touch(game); b.state.lastTalkAt = game.sim.time;
    if (tone === 'harsh') return HANDLERS.yell(game, {});
    if (tone === 'cold') { b.emo.stress = clamp(b.emo.stress + 4); n.affection = clamp(n.affection - 2); return ok('Cold words.'); }
    n.stimulation = clamp(n.stimulation + 6); n.affection = clamp(n.affection + 4); b.emo.stress = clamp(b.emo.stress - 3);
    b.dev.language = clamp(b.dev.language + 0.006); b.dev.social = clamp(b.dev.social + 0.004);
    if (b.state.cryingSince && ['lonely', 'bored', 'scared'].includes(b.state.cryCause)) answerCry(game, 0.5);
    return ok('Talked.');
  },
};

Object.assign(HANDLERS, EXTRA_HANDLERS);

function sidsCheck(game, rng, mult = 1) {
  const b = game.baby;
  if (!game.flags.warnedTummySleep) { game.flags.warnedTummySleep = true; return; }
  const overheated = game.house.roomTempC + (b.wear.layers === 'warm' ? 2 : 0) > 24;
  if (rng.chance(0.004 * mult * (overheated ? 2 : 1))) { b.death = 'sids'; b.needs.health = 0; }
}

export function placeOrder(game, items) {
  const days = ageDays(game);
  const norm = [];
  for (const it of items || []) {
    const def = SHOP.find((s) => s.id === it.id); if (!def) continue;
    if (def.minDays != null && days < def.minDays - 30) continue;
    const size = it.size;
    if (def.sized === 'diaper' && !DIAPER_SIZES.includes(size)) continue;
    if (def.sized === 'clothing' && !CLOTHING_SIZES.includes(size)) continue;
    if (def.sized === 'toy' && !TOYS.some((t) => t.id === size)) continue;
    if (def.sized === 'proofing' && !BABYPROOFING.some((p) => p.id === size)) continue;
    norm.push({ id: def.id, size, label: def.sized ? `${def.label} (${sizeLabel(def.sized, size)})` : def.label, deliveryH: def.deliveryH });
  }
  if (!norm.length) return { ok: false, message: 'Nothing valid in the cart.' };
  const deliveryH = Math.max(...norm.map((n) => n.deliveryH));
  const order = { id: `o${game.sim.steps}_${game.orders.length}_${Date.now().toString(36)}`, items: norm, placedAt: game.sim.time, arrivesAt: game.sim.time + deliveryH * HOUR, status: 'shipping' };
  game.orders.push(order);
  log(game, 'order', `Ordered: ${norm.map((n) => n.label).join(', ')}. Arrives in about ${deliveryH} hours.`, 'info');
  return { ok: true, message: `Order placed. Delivery in ~${deliveryH}h.`, order };
}

function sizeLabel(kind, size) {
  if (kind === 'toy') return (TOYS.find((t) => t.id === size) || {}).label || size;
  if (kind === 'proofing') return (BABYPROOFING.find((t) => t.id === size) || {}).label || size;
  return `size ${size}`;
}

void distressOf;
