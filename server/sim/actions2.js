// Extended interactions, part 1: play & bonding, care routines, outings, screen time,
// observation and chores. Part 2 (language, feeding depth, discipline) lives in actions3.js.
//
// Every handler is `id(game, params, rng) -> { ok, message, ...extra }` and is merged into the
// HANDLERS table of actions.js via EXTRA_HANDLERS, so applyAction() validates and journals them
// exactly like the built-in actions. All new state lives under baby.state.x (see ext()) or on
// guarded optional fields, so games saved before this module existed keep loading unchanged.
import {
  HOUR, MIN, DAY, clamp, SENSORY, INSTRUMENTS, ROUTINE_STEPS, ROUTINE_WINDOW_MIN,
  CALL_FAMILY, SEASON_TEMP,
} from '../../shared/constants.js';
import { log, ageDays, isNight } from './engine.js';
import { mk } from './health.js';
import {
  MORE_HANDLERS, fail, ok, he, He, his, ext, today, count, diminish, touch, bond,
  answerCry, wakeIfSleeping, sleeping, needAwake, needAge, gain, effort, memory,
  fallAsleep, startCry,
} from './actions3.js';

const him = (b) => (b.sex === 'girl' ? 'her' : 'him');
const herself = (b) => (b.sex === 'girl' ? 'herself' : 'himself');
const owns = (game, toy) => Array.isArray(game.inventory.toys) && game.inventory.toys.includes(toy);
const stock = (game, key) => Number(game.inventory[key] || 0);

// Every extended handler runs behind this: game over / parent away / hospitalised are all refused.
export function needHome(game) {
  if (!game || game.status !== 'active') return fail('This game is over.');
  if (game.parent.awayUntil > game.sim.time) return fail('You walked out. Come back to the baby first.');
  if (game.baby.state.hospitalizedUntil > game.sim.time) return fail(`${game.baby.name} is in the hospital right now.`);
  return null;
}

// Per-action cooldown stored in baby.state.x.cd. Stamps only when it passes, so call it last.
export function coolDown(game, key, seconds, what) {
  const x = ext(game); if (!x.cd || typeof x.cd !== 'object') x.cd = {};
  const t = game.sim.time, last = x.cd[key];
  if (typeof last === 'number' && t - last < seconds) {
    return fail(`${what} again so soon won't land — wait about ${Math.max(1, Math.round((seconds - (t - last)) / MIN))} more minutes.`);
  }
  x.cd[key] = t;
  return null;
}

export const outdoorTempC = (game) => (SEASON_TEMP[game.house.season] != null ? SEASON_TEMP[game.house.season] : 14) - (isNight(game) ? 5 : 0);

const LOCAL_HANDLERS = {
  // ------------------------------------------------------------------ play & bonding
  peekaboo(game, _, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 60, 'peekaboo') || needAwake(game); if (gate) return gate;
    const k = count(game, 'peekaboo'), eff = diminish(k, 4) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 12 * eff); n.affection = clamp(n.affection + 4);
    b.emo.happiness = clamp(b.emo.happiness + 4 * eff); b.emo.stress = clamp(b.emo.stress - 4);
    gain(game, { social: 0.012, cognitive: days >= 200 ? 0.012 : 0.006, emotional: 0.003 }, eff);
    if (b.state.cryingSince && ['bored', 'lonely'].includes(b.state.cryCause)) answerCry(game, 0.7);
    const searches = days >= 200 && rng.chance(0.3 + b.dev.cognitive / 200);
    log(game, 'play', searches
      ? `"Where's ${b.name}? …There you are!" ${He(b)} yanked the cloth off ${his(b)} own face and shrieked — that is object permanence.`
      : `Peekaboo with ${b.name}. ${He(b)} ${days >= 90 ? 'laughed every single time' : 'stared hard, then broke into a gummy smile'}.`, 'good');
    return ok(k > 8 ? 'Peekaboo (the joke is wearing thin).' : 'Peekaboo!');
  },

  tickle(game, _, rng) {
    const b = game.baby, n = b.needs;
    const gate = needAge(game, 120, 'tickling') || needAwake(game); if (gate) return gate;
    const k = count(game, 'tickle');
    touch(game);
    const overtired = n.rest < 25 || b.emo.stress > 55 || !!b.state.cryingSince;
    if (overtired || k > 3) {
      b.emo.stress = clamp(b.emo.stress + (overtired ? 12 : 6)); n.comfort = clamp(n.comfort - 8);
      startCry(game, overtired ? 'tired' : 'uncomfortable', 0.55);
      log(game, 'play', overtired
        ? `Tickling an over-tired baby tipped ${b.name} straight over the edge — the laughing turned into crying in seconds.`
        : `${He(b)} has had enough tickling for one day and squirmed away, cross.`, 'warn');
      return ok('That backfired.');
    }
    const eff = diminish(k, 2) * effort(game);
    n.stimulation = clamp(n.stimulation + 10 * eff); n.affection = clamp(n.affection + 5);
    b.emo.happiness = clamp(b.emo.happiness + 5 * eff); b.emo.stress = clamp(b.emo.stress - 5);
    gain(game, { social: 0.01, emotional: 0.006, motor: 0.004 }, eff);
    log(game, 'play', `Belly raspberries and toe tickles — ${b.name} ${rng.chance(0.5) ? 'let out a proper belly laugh' : 'squealed and grabbed your hands for more'}.`, 'good');
    return ok('Giggles.');
  },

  massage(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, inv = game.inventory;
    const gate = needAwake(game); if (gate) return gate;
    const cd = coolDown(game, 'massage', 2 * HOUR, 'A massage'); if (cd) return cd;
    touch(game);
    const lotion = stock(game, 'baby_wash') > 0; if (lotion) inv.baby_wash--;
    n.comfort = clamp(n.comfort + (lotion ? 16 : 12)); n.affection = clamp(n.affection + 8);
    b.emo.stress = clamp(b.emo.stress - 12); bond(game, 0.05);
    gain(game, { emotional: 0.008, motor: 0.005, social: 0.004 });
    let msg = `Warm hands, slow strokes down the legs and clockwise circles on ${b.name}'s tummy${lotion ? ' with a little lotion' : ''}.`;
    if (s.needsBurp && rng.chance(0.6)) { s.needsBurp = false; n.comfort = clamp(n.comfort + 8); msg += ` A trapped bubble came up and ${he(b)} went limp with relief.`; }
    if (s.colicUntil > game.sim.time && rng.chance(0.5)) { s.colicUntil = game.sim.time + 10 * MIN; msg += ' Even the colicky screaming eased off.'; }
    if (s.cryingSince) answerCry(game, 0.8);
    if (n.rest < 40 && rng.chance(0.45)) { log(game, 'massage', msg, 'good'); fallAsleep(game, 'on the towel, mid-massage'); return ok(`${b.name} fell asleep during the massage.`); }
    log(game, 'massage', msg, 'good');
    return ok('Massaged.');
  },

  skin_to_skin(game) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    if (!s.held) return fail(`Pick ${b.name} up first — skin-to-skin means chest to chest.`);
    const cd = coolDown(game, 'skin', 90 * MIN, 'Skin-to-skin'); if (cd) return cd;
    touch(game);
    const young = days < 120;
    n.affection = clamp(n.affection + (young ? 22 : 14)); n.comfort = clamp(n.comfort + (young ? 14 : 8));
    b.emo.stress = clamp(b.emo.stress - (young ? 18 : 10)); b.emo.security = clamp(b.emo.security + (young ? 1.2 : 0.6));
    bond(game, young ? 0.12 : 0.07); gain(game, { emotional: young ? 0.012 : 0.006, social: 0.006 });
    if (s.cryingSince) answerCry(game, 1);
    log(game, 'skin_to_skin', young
      ? `Vest off, ${b.name} curled bare-chested against you under a blanket. ${He(b)} settled into your breathing and ${his(b)} hands unclenched.`
      : `${He(b)} is far too big for this now, but climbed onto your chest anyway and lay still for a whole minute.`, 'good');
    return ok('Skin-to-skin.');
  },

  mirror_play(game, _, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game), x = ext(game);
    const gate = needAge(game, 90, 'mirror play') || needAwake(game); if (gate) return gate;
    if (!owns(game, 'mirror')) return fail('You do not own a baby mirror. Order one from the toy shop.');
    const k = count(game, 'mirror'), eff = diminish(k, 3) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 11 * eff); n.affection = clamp(n.affection + 3);
    gain(game, { social: 0.012, cognitive: 0.008, emotional: 0.004 }, eff);
    if (days >= 540 && !x.selfRecognised && rng.chance(0.4)) {
      x.selfRecognised = game.sim.time;
      memory(game, `${b.name} touched ${his(b)} own cheek in the mirror instead of the glass — ${he(b)} knows that baby is ${him(b)}.`);
      return ok('Self-recognition!');
    }
    log(game, 'play', days < 540
      ? `${b.name} beamed at "the other baby" in the mirror and patted the glass.`
      : `Pulling faces in the mirror together — ${b.name} copied every one.`, 'good');
    return ok('Mirror play.');
  },

  dance(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 120, 'dancing') || needAwake(game); if (gate) return gate;
    const k = count(game, 'dance'), eff = diminish(k, 3) * effort(game);
    touch(game);
    if (n.rest < 22) {
      b.emo.stress = clamp(b.emo.stress + 8); n.comfort = clamp(n.comfort - 6);
      log(game, 'play', `Music and spinning on an empty tank — ${b.name} went from wired to wailing.`, 'warn');
      startCry(game, 'tired', 0.5);
      return ok('Too tired to dance.');
    }
    const walking = !!b.milestones.walks || days >= 500;
    n.stimulation = clamp(n.stimulation + 14 * eff); n.affection = clamp(n.affection + 5);
    b.emo.happiness = clamp(b.emo.happiness + 5 * eff); b.emo.stress = clamp(b.emo.stress - 6);
    if (walking && !s.held) { n.rest = clamp(n.rest - 4); b.counters.floorTimeMin = (b.counters.floorTimeMin || 0) + 6; }
    gain(game, { motor: walking ? 0.014 : 0.008, emotional: 0.008, social: 0.008, language: 0.004 }, eff);
    if (s.cryingSince && ['bored', 'lonely'].includes(s.cryCause)) answerCry(game, 0.6);
    log(game, 'play', s.held
      ? `You swayed and spun slowly with ${b.name} on your shoulder until ${he(b)} stopped fussing and started humming.`
      : `${He(b)} bounced at the knees, stamped, and fell over laughing. ${walking ? 'Actual dancing.' : 'Enthusiastic wobbling.'}`, 'good');
    return ok('Danced together.');
  },

  music_time(game, { instrument } = {}, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 180, 'instruments') || needAwake(game); if (gate) return gate;
    if (!owns(game, 'instruments')) return fail('You have no instruments. Order the shakers, bells and drum set.');
    const id = String(instrument || 'shaker');
    const def = INSTRUMENTS.find((i) => i.id === id); if (!def) return fail('Pick an instrument.');
    const k = count(game, 'music'), eff = diminish(k, 3) * effort(game);
    touch(game); game.stats.plays++; b.counters.plays = (b.counters.plays || 0) + 1;
    n.stimulation = clamp(n.stimulation + 13 * eff); n.affection = clamp(n.affection + 3);
    gain(game, { motor: 0.01, language: 0.01, emotional: 0.008, cognitive: 0.004 }, eff);
    if (days >= 500) b.counters.lessons.music = (b.counters.lessons.music || 0) + 0.34;
    const banged = rng.chance(0.5);
    log(game, 'music', `${def.label.replace(/^\S+\s/, '')} time: ${banged ? `${b.name} hammered out a beat with no regard for yours` : `${b.name} shook along, roughly in time, and grinned at the noise`}.`, 'good');
    return ok(`Music with the ${id}.`);
  },

  sensory_play(game, { kind } = {}, rng) {
    const b = game.baby, n = b.needs, x = ext(game), days = ageDays(game);
    const def = SENSORY.find((s) => s.id === String(kind || 'water')); if (!def) return fail('Pick a sensory activity.');
    const gate = needAge(game, def.minDays, def.label.replace(/^\S+\s/, '')) || needAwake(game); if (gate) return gate;
    if (def.bin && !owns(game, 'sensory_bin')) return fail('You need the sensory bin (rice and scoops) for that.');
    const k = count(game, 'sensory'), eff = diminish(k, 2) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 18 * eff); n.clean = clamp(n.clean - (def.id === 'water' ? 6 : 10));
    x.floorMess = (x.floorMess || 0) + 1;
    gain(game, { cognitive: 0.016, motor: 0.014, emotional: 0.006, language: 0.006 }, eff);
    b.counters.floorTimeMin = (b.counters.floorTimeMin || 0) + 10;
    // Supervised the whole time, so mouthing a scoop of rice is a scare rather than a disaster.
    if (def.id !== 'water' && days < 700 && rng.chance(0.12)) {
      n.comfort = clamp(n.comfort - 6); b.emo.stress = clamp(b.emo.stress + 6);
      log(game, 'hazard', `${b.name} shovelled a fistful of ${def.id === 'rice' ? 'rice' : 'dough'} straight into ${his(b)} mouth. You hooked it out with a finger — this is why sensory play is never left alone.`, 'warn');
      return ok('Caught a mouthful in time.');
    }
    log(game, 'play', `${def.label.replace(/^\S+\s/, '')}: scooping, pouring, tipping it all out again. ${b.name} was completely absorbed${def.id === 'water' ? ' and soaked' : ' and there is a lot on the floor'}.`, 'good');
    return ok('Sensory play.');
  },

  blocks_together(game, _, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 240, 'building together') || needAwake(game); if (gate) return gate;
    if (!['blocks', 'soft_blocks', 'stacking_cups'].some((t) => owns(game, t))) return fail('You have no blocks or stacking cups.');
    const k = count(game, 'blocks'), eff = diminish(k, 3) * effort(game);
    touch(game); game.stats.plays++; b.counters.plays = (b.counters.plays || 0) + 1;
    n.stimulation = clamp(n.stimulation + 15 * eff); n.affection = clamp(n.affection + 4);
    gain(game, { cognitive: 0.016, motor: 0.014, social: 0.01, language: 0.006 }, eff);
    b.counters.floorTimeMin = (b.counters.floorTimeMin || 0) + 8;
    const tower = Math.max(1, Math.min(9, Math.round(1 + b.dev.motor / 12 + (days - 240) / 220)));
    log(game, 'play', `You handed blocks up one at a time; ${b.name} balanced ${tower} before ${rng.chance(0.7) ? 'knocking the lot down with enormous satisfaction' : 'carefully placing one more and looking at you for the cheer'}.`, 'good');
    return ok(`A tower of ${tower}.`, { tower });
  },

  bath_toys(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, t = game.sim.time;
    const gate = needAge(game, 90, 'bath toys') || needAwake(game); if (gate) return gate;
    if (!owns(game, 'bath_toys')) return fail('You own no bath toys.');
    if (t - (s.lastBathAt || 0) > 25 * MIN && s.location !== 'changing_table' && s.location !== 'bath') return fail('Run the bath first — these are for in the water.');
    const k = count(game, 'bathtoys'), eff = diminish(k, 2) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 12 * eff); n.comfort = clamp(n.comfort + 8); b.emo.stress = clamp(b.emo.stress - 8);
    gain(game, { cognitive: 0.01, motor: 0.008, emotional: 0.006 }, eff);
    if (s.cryingSince) answerCry(game, 0.6);
    log(game, 'bath', `Cups, a squirty duck and a lot of splashing. ${b.name} ${rng.chance(0.5) ? 'poured water over ${his} own head and laughed'.replace('${his}', his(b)) : 'stopped protesting about the bath entirely'}.`, 'good');
    return ok('Bath play.');
  },

  // ------------------------------------------------------------------ care routines
  // bath -> book -> song -> down, all inside ROUTINE_WINDOW_MIN sim minutes, in order.
  bedtime_routine(game, { step } = {}, rng) {
    const b = game.baby, s = b.state, n = b.needs, t = game.sim.time, days = ageDays(game);
    const def = ROUTINE_STEPS.find((r) => r.id === String(step || 'bath')); if (!def) return fail('Unknown bedtime step.');
    const gate = needAge(game, 60, 'a bedtime routine'); if (gate) return gate;
    if (def.id !== 'down' && sleeping(game)) return fail(`${b.name} is already asleep.`);
    if (!s.routine || typeof s.routine !== 'object') s.routine = {};
    const r = s.routine, fresh = (k) => typeof r[k] === 'number' && t - r[k] <= ROUTINE_WINDOW_MIN * MIN;
    touch(game);
    if (def.id === 'bath') {
      if (game.inventory.baby_wash > 0) game.inventory.baby_wash--;
      n.clean = 100; b.phys.rash = clamp(b.phys.rash - 10); n.comfort = clamp(n.comfort + 6);
      s.lastBathAt = t; s.location = s.held ? s.location : 'changing_table'; game.stats.baths++;
      r.bath = t; r.startedAt = t;
      log(game, 'routine', `Bedtime routine, step 1: a warm, unhurried bath. Lights already low.`, 'good');
      return ok('Bath done — book next.', { routine: r });
    }
    if (def.id === 'book') {
      if (!Array.isArray(game.inventory.toys) || !game.inventory.toys.some((x) => x.includes('book'))) return fail('No books to read at bedtime. Order board books.');
      n.stimulation = clamp(n.stimulation + 8); n.affection = clamp(n.affection + 5);
      gain(game, { language: 0.012, cognitive: 0.006 }, effort(game));
      game.stats.reads++; b.counters.reads = (b.counters.reads || 0) + 1;
      r.book = t;
      log(game, 'routine', `Step 2: the same book you have read ninety times, in the same voice. ${b.name} ${days > 300 ? 'turned the pages' : 'watched your mouth'}.`, 'good');
      return ok('Book done — song next.', { routine: r });
    }
    if (def.id === 'song') {
      n.affection = clamp(n.affection + 6); b.emo.stress = clamp(b.emo.stress - 8);
      gain(game, { language: 0.008, emotional: 0.004 }, effort(game));
      r.song = t;
      log(game, 'routine', `Step 3: the same lullaby, sung low, rocking on the spot.`, 'good');
      return ok('Song done — into bed now.', { routine: r });
    }
    // step 'down'
    const steps = ['bath', 'book', 'song'].filter(fresh);
    const inOrder = steps.length === 3 && r.bath <= r.book && r.book <= r.song;
    const bed = stock(game, 'toddler_bed') > 0 && days >= 540 ? 'toddler_bed' : 'crib';
    s.held = false; s.location = bed; s.position = 'back';
    const freshAir = typeof ext(game).freshAirUntil === 'number' && ext(game).freshAirUntil > t;
    let p = (n.rest < 45 ? 0.6 : 0.3) + steps.length * 0.09 + (inOrder ? 0.12 : 0) + (freshAir ? 0.08 : 0)
      + (s.whiteNoise ? 0.05 : 0) - (s.cryingSince ? 0.2 : 0) - (n.fullness < 35 ? 0.25 : 0) - (n.diaper < 35 ? 0.2 : 0);
    const asleep = rng.chance(clamp(p, 0.05, 0.95));
    const x = ext(game);
    if (inOrder) {
      b.emo.security = clamp(b.emo.security + 1.2); bond(game, 0.06); gain(game, { emotional: 0.008 });
      const dayIdx = Math.floor(days);
      if (x.routineDay !== dayIdx) { x.routineDay = dayIdx; x.routineDays = (x.routineDays || 0) + 1; }
      if (x.routineDays === 5) memory(game, `Five nights of the same bath-book-song-bed routine and ${b.name} now yawns at the first bar of the lullaby. Predictability is doing the work for you.`);
    }
    r.down = t;
    if (asleep) fallAsleep(game, `in the ${bed.replace('_', ' ')}, drowsy but awake when you put ${him(b)} down`);
    else log(game, 'routine', `Down in the ${bed.replace('_', ' ')}${inOrder ? ' after the full routine' : ''}, but ${b.name} is still wide awake${steps.length < 3 ? ' — the routine was rushed or out of order' : ''}.`, 'info');
    return ok(asleep ? `${b.name} went down asleep.` : 'Down, but not asleep yet.', { routine: r, steps: steps.length, inOrder });
  },

  night_check(game) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game), t = game.sim.time;
    touch(game);
    const worries = [];
    if (s.position === 'tummy' && days < 180 && sleeping(game)) worries.push(`${He(b)} has rolled onto ${his(b)} tummy — under 6 months, put ${him(b)} back on ${his(b)} back.`);
    if (game.house.roomTempC > 24) worries.push(`The room is ${game.house.roomTempC.toFixed(1)}°C — too warm for sleep, and overheating raises the SIDS risk.`);
    if (game.house.roomTempC < 18) worries.push(`The room is only ${game.house.roomTempC.toFixed(1)}°C — cold hands are normal, but check the layers.`);
    if (b.wear.swaddled && days >= 75) worries.push('Still swaddled past the rolling age — that is a suffocation risk now.');
    if (b.phys.tempC >= 38) worries.push(`${He(b)} feels hot: ${b.phys.tempC.toFixed(1)}°C.`);
    if (n.diaper < 25) worries.push('The diaper is soaked and will wake ${him} soon.'.replace('${him}', him(b)));
    const detail = {
      lines: [
        sleeping(game) ? `${b.name} is asleep on ${his(b)} ${s.position}, breathing slow and even.` : `${b.name} is awake in the dark, quiet, watching the ceiling.`,
        `Room ${game.house.roomTempC.toFixed(1)}°C · ${isNight(game) ? 'night' : 'daytime'} · ${s.whiteNoise ? 'white noise on' : 'quiet'}.`,
        worries.length ? worries.join(' ') : 'Nothing to fix. Back out slowly and do not touch anything.',
      ],
      worries, asleep: sleeping(game),
    };
    if (worries.length) log(game, 'night_check', `Night check: ${worries[0]}`, 'warn');
    void t;
    return ok(worries.length ? worries[0] : `${b.name} is fine. You did not wake ${him(b)}.`, { detail });
  },

  dream_feed(game, _, rng) {
    const b = game.baby, s = b.state, n = b.needs, inv = game.inventory, days = ageDays(game), t = game.sim.time;
    if (!sleeping(game)) return fail(`${b.name} is awake — this is just a feed.`);
    if (days >= 365) return fail('Dream feeds are for babies; a toddler does not need a night bottle.');
    if (stock(game, 'formula') <= 0) return fail("You're out of formula. Order more from the shop.");
    if (inv.bottlesClean <= 0) return fail('No clean bottles. Wash the bottles first.');
    if (n.fullness > 82) return fail(`${b.name} is not hungry enough to take a dream feed.`);
    const cd = coolDown(game, 'dreamfeed', 3 * HOUR, 'A dream feed'); if (cd) return cd;
    inv.formula--; inv.bottlesClean--;
    touch(game); game.stats.feeds++; b.counters.feeds = (b.counters.feeds || 0) + 1;
    n.fullness = clamp(n.fullness + 42); s.lastFedAt = t; s.mealsToday = (s.mealsToday || 0) + 1;
    s.needsBurp = rng.chance(0.5);
    const woke = rng.chance(0.22);
    if (woke) wakeIfSleeping(game, 'the dream feed', true);
    log(game, 'feed', woke
      ? `You lifted ${b.name} half-asleep for a dream feed and ${he(b)} surfaced completely. Now you have a wide-awake baby at ${isNight(game) ? 'this hour' : 'nap time'}.`
      : `A dream feed: ${b.name} took most of the bottle without ever really waking, then went straight back down.`, woke ? 'info' : 'good');
    return ok(woke ? 'Fed, but fully awake now.' : 'Dream feed done.', { woke });
  },

  comfort_nightmare(game, { wake } = {}, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 540, 'night terrors'); if (gate) return gate;
    const upset = !!s.cryingSince || b.emo.stress > 45 || (sleeping(game) && rng.chance(0.35));
    touch(game);
    if (!upset) { log(game, 'night_check', `You went in expecting a nightmare; ${b.name} is fast asleep and fine.`, 'info'); return ok('All quiet.'); }
    const terror = sleeping(game) && rng.chance(0.5); // night terror: eyes open, not awake, will not be comforted
    if (terror && wake === true) {
      wakeIfSleeping(game, 'shaken out of a night terror', false);
      b.emo.stress = clamp(b.emo.stress + 12); startCry(game, 'scared', 0.8);
      log(game, 'nightmare', `You woke ${b.name} out of a night terror. ${He(b)} came round confused, frightened and inconsolable — with terrors you keep ${him(b)} safe and wait, you do not wake ${him(b)}.`, 'warn');
      return ok('Waking a night terror made it worse.');
    }
    if (terror) {
      b.emo.stress = clamp(b.emo.stress - 6); n.comfort = clamp(n.comfort + 6);
      log(game, 'nightmare', `A night terror: sitting bolt upright, eyes open, screaming at nothing, not really awake. You stayed close, kept ${him(b)} from falling out of bed, and it passed in a few minutes.`, 'info');
      return ok('You waited it out safely.');
    }
    wakeIfSleeping(game, 'a bad dream', true);
    b.emo.stress = clamp(b.emo.stress - 18); b.emo.security = clamp(b.emo.security + 1);
    n.affection = clamp(n.affection + 10); n.comfort = clamp(n.comfort + 8);
    bond(game, 0.07); gain(game, { emotional: 0.01, language: days >= 900 ? 0.006 : 0 });
    if (s.cryingSince) answerCry(game, 1);
    log(game, 'nightmare', `A nightmare. You sat on the edge of the bed until ${b.name} could tell you about ${days >= 900 ? 'the dog with the big teeth' : 'something with no words yet'}, then left the door open a crack.`, 'good');
    return ok('Comforted after the nightmare.');
  },

  nail_trim(game, _, rng) {
    const b = game.baby, n = b.needs, x = ext(game), t = game.sim.time;
    if (stock(game, 'grooming_kit') <= 0) return fail('You need the grooming kit (nail clippers).');
    const cd = coolDown(game, 'nails', 3 * DAY, 'Trimming nails'); if (cd) return cd;
    const asleep = sleeping(game);
    touch(game);
    x.nailsAt = t;
    const nick = rng.chance(asleep ? 0.06 : 0.16);
    if (nick) {
      n.comfort = clamp(n.comfort - 12); b.emo.stress = clamp(b.emo.stress + 10);
      b.injuries.push({ kind: 'nicked_finger', severe: false, pain: 5, healAt: t + 8 * HOUR });
      if (asleep) wakeIfSleeping(game, 'a nicked fingertip', false);
      startCry(game, 'in pain', 0.7);
      log(game, 'nails', `You caught the very edge of ${b.name}'s fingertip. A bead of blood, a shocked pause, then furious screaming. Pressure with a clean cloth; it will be forgotten by morning.`, 'warn');
      return ok('You nicked a finger.');
    }
    n.comfort = clamp(n.comfort + 3); n.clean = clamp(n.clean + 2);
    log(game, 'nails', asleep
      ? `Ten tiny nails clipped while ${b.name} slept — the only sane way to do it. No more scratched cheeks.`
      : `Ten nails, one finger at a time, singing the whole way through. ${b.name} pulled ${his(b)} hand back after every single one.`, 'good');
    return ok('Nails trimmed.');
  },

  haircut(game, _, rng) {
    const b = game.baby, n = b.needs, x = ext(game), t = game.sim.time;
    const gate = needAge(game, 300, 'a haircut') || needAwake(game); if (gate) return gate;
    if (stock(game, 'grooming_kit') <= 0) return fail('You need the grooming kit (safety scissors).');
    const cd = coolDown(game, 'haircut', 60 * DAY, 'A haircut'); if (cd) return cd;
    const first = !x.haircuts;
    x.haircuts = (x.haircuts || 0) + 1; x.haircutAt = t;
    touch(game); n.clean = clamp(n.clean + 4);
    const squirmed = rng.chance(0.55);
    if (squirmed) { b.emo.stress = clamp(b.emo.stress + 8); n.comfort = clamp(n.comfort - 5); }
    else { b.emo.happiness = clamp(b.emo.happiness + 2); }
    if (first) memory(game, `${b.name}'s first haircut: a wonky fringe, a snack in one hand, and a curl kept in an envelope. ${He(b)} looks like a whole child now, not a baby.`);
    else log(game, 'haircut', squirmed ? `A trim, mostly achieved while ${b.name} twisted away from the scissors.` : `A quick tidy-up of the fringe. ${He(b)} sat surprisingly still.`, 'good');
    return ok(first ? 'First haircut!' : 'Hair trimmed.', { first });
  },

  stroller_walk(game, { minutes } = {}, rng) {
    const b = game.baby, s = b.state, n = b.needs, x = ext(game), t = game.sim.time, days = ageDays(game);
    const gate = needAge(game, 7, 'going out'); if (gate) return gate;
    const inCarrier = s.location === 'carrier';
    if (stock(game, 'stroller') <= 0 && !inCarrier) return fail('You have no stroller. Order one, or put the carrier on.');
    minutes = Math.round(Number(minutes));
    if (!Number.isFinite(minutes)) minutes = 30;
    minutes = Math.max(20, Math.min(40, minutes));
    const cd = coolDown(game, 'walk', 3 * HOUR, 'Another walk'); if (cd) return cd;
    const outside = outdoorTempC(game), layers = b.wear.layers, k = count(game, 'walk');
    touch(game);
    const notes = [];
    let sev = 'good';
    const cold = outside < 8 && layers !== 'warm';
    const hot = outside > 25 && (layers === 'warm' || b.wear.swaddled);
    const sunny = ['spring', 'summer'].includes(game.house.season) && !isNight(game);
    const screened = typeof x.sunscreenAt === 'number' && t - x.sunscreenAt < 2 * HOUR;
    if (cold) {
      n.comfort = clamp(n.comfort - 22); b.emo.stress = clamp(b.emo.stress + 10);
      notes.push(`${outside}°C outside and ${b.name} is in ${layers} layers. ${He(b)} was rigid and red-cheeked by the corner.`);
      sev = 'warn';
      if (!b.illness && rng.chance(0.12)) { b.illness = mk('cold', game, 14, rng); notes.push('By the evening the sniffles had started.'); }
    } else if (hot) {
      n.comfort = clamp(n.comfort - 20); n.health = clamp(n.health - 2); b.emo.stress = clamp(b.emo.stress + 8);
      notes.push(`${outside}°C and wrapped up warm — ${b.name} came home damp, flushed and furious. Overheating is dangerous, not just uncomfortable.`);
      sev = 'warn';
    } else {
      n.comfort = clamp(n.comfort + 8);
    }
    if (sunny && days >= 180 && !screened) {
      n.health = clamp(n.health - 1); n.comfort = clamp(n.comfort - 6);
      notes.push(`${His(b)} cheeks and the tops of ${his(b)} ears are pink — sunscreen next time, or stay in the shade.`);
      sev = sev === 'good' ? 'warn' : sev;
    } else if (sunny && days < 180) {
      notes.push('Under 6 months the answer is shade and a hat, never sunscreen — you kept the hood up.');
    }
    const eff = diminish(k, 1);
    n.stimulation = clamp(n.stimulation + 16 * eff);
    gain(game, { social: 0.008, cognitive: 0.008, language: 0.004 }, eff);
    if (!cold && !hot) { b.phys.nutrition = clamp(b.phys.nutrition + 0.004, 0.7, 1.08); x.freshAirUntil = t + 10 * HOUR; }
    let asleepMsg = '';
    if (!sleeping(game) && n.rest < 55 && rng.chance(0.55)) { fallAsleep(game, 'in the stroller, three minutes from the front door'); asleepMsg = ` ${He(b)} was asleep before the end of the street.`; }
    s.held = true; s.location = 'held'; s.position = 'held';
    log(game, 'outing', `${minutes} minutes out in the ${game.house.season} air (${outside}°C).${notes.length ? ' ' + notes.join(' ') : ` ${b.name} watched trees, dogs and strangers the whole way.`}${asleepMsg}`, sev);
    return ok(`Back from a ${minutes}-minute walk.`, { outside, season: game.house.season });
  },

  carrier(game, { on } = {}, rng) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game);
    if (stock(game, 'carrier') <= 0) return fail('You do not own a baby carrier.');
    const wearing = s.location === 'carrier';
    const want = typeof on === 'boolean' ? on : !wearing;
    touch(game);
    if (!want) {
      if (!wearing) return ok('The carrier is already off.');
      s.held = false; s.location = sleeping(game) ? 'crib' : 'play_mat'; s.position = sleeping(game) ? 'back' : days >= 200 ? 'sitting' : 'back';
      log(game, 'carrier', `You unclipped the carrier and slid ${b.name} out onto the ${s.location.replace('_', ' ')}${sleeping(game) ? ' without waking ${him}'.replace('${him}', him(b)) : ''}.`, 'info');
      return ok('Carrier off.');
    }
    const wasSleeping = sleeping(game);
    s.held = true; s.location = 'carrier'; s.position = 'held';
    n.affection = clamp(n.affection + 12); n.comfort = clamp(n.comfort + 8); b.emo.stress = clamp(b.emo.stress - 10);
    bond(game, 0.06);
    if (s.cryingSince) answerCry(game, 0.9);
    if (wasSleeping && rng.chance(0.25)) wakeIfSleeping(game, 'being clipped into the carrier', true);
    log(game, 'carrier', days < 120
      ? `${b.name} is in the carrier, curled high and tight on your chest with ${his(b)} chin off ${his(b)} own chest, face visible. Your hands are free for the first time today.`
      : `${b.name} is up in the carrier, facing in, legs in an M and arms hooked over the top.`, 'good');
    return ok('Baby-wearing.');
  },

  // ------------------------------------------------------------------ screens
  screen_time(game, { minutes, on } = {}) {
    const b = game.baby, n = b.needs, x = ext(game), t = game.sim.time, days = ageDays(game);
    if (on === false) {
      if (!(x.screenUntil > t)) return ok('The screen is already off.');
      x.screenUntil = 0; b.emo.stress = clamp(b.emo.stress + 4); n.stimulation = clamp(n.stimulation - 4);
      log(game, 'screen', `Screen off. ${He(b)} protested — they always do — and then found something else within a minute.`, 'info');
      return ok('Screen off.');
    }
    minutes = Math.round(Number(minutes));
    if (!Number.isFinite(minutes)) minutes = 20;
    minutes = Math.max(5, Math.min(120, minutes));
    const gate = needAwake(game); if (gate) return gate;
    touch(game);
    const totalBefore = today(game).screenMin || 0;
    count(game, 'screenMin', minutes);
    const total = totalBefore + minutes;
    x.screenUntil = t + minutes * MIN;
    n.stimulation = clamp(n.stimulation + 10); b.emo.stress = clamp(b.emo.stress - 8);
    if (b.state.cryingSince) { b.state.cryingSince = null; b.state.cryIntensity = 0; } // it stops the crying; it does not answer it
    let sev = 'info', note;
    if (days < 548) {
      b.dev.language = clamp(b.dev.language - 0.02 * (minutes / 30));
      b.dev.social = clamp(b.dev.social - 0.01 * (minutes / 30));
      note = `Under 18 months, screens are the one thing that reliably replaces the back-and-forth ${b.name} actually learns language from. ${minutes} minutes of instant quiet, paid for later.`;
      sev = 'warn';
    } else if (days < 730) {
      b.dev.language = clamp(b.dev.language - 0.012 * (minutes / 30));
      note = `Between 18 and 24 months, only short co-viewed video is worth it — you sat and named things on screen, which softens it.`;
      sev = total > 45 ? 'warn' : 'info';
    } else if (total > 60) {
      b.dev.language = clamp(b.dev.language - 0.008 * (minutes / 30)); n.stimulation = clamp(n.stimulation - 6);
      note = `${total} minutes of screen today, past the one-hour guideline for this age. ${He(b)} is glassy-eyed and will be hard to switch off.`;
      sev = 'warn';
    } else {
      note = `${minutes} minutes of a slow, gentle show while you got something done. ${total} minutes today, inside the guideline.`;
    }
    log(game, 'screen', note, sev);
    return ok(`Screen on for ${minutes} minutes (${total} today).`, { screenMinutesToday: total });
  },

  video_call(game, { who } = {}, rng) {
    const b = game.baby, n = b.needs, days = ageDays(game);
    const gate = needAge(game, 120, 'video calls') || needAwake(game); if (gate) return gate;
    const person = CALL_FAMILY.includes(String(who || '')) ? String(who) : 'grandma';
    const k = count(game, 'call'), eff = diminish(k, 2) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 10 * eff); n.affection = clamp(n.affection + 4);
    gain(game, { social: 0.012, language: 0.01, emotional: 0.004 }, eff);
    log(game, 'social_hint', days < 365
      ? `A video call with ${person}. ${He(b)} mostly tried to eat the phone, but lit up at the voice — live video chat is the one screen the guidelines carve out, because someone is really answering.`
      : `A video call with ${person}: ${b.name} showed ${him(b) === 'her' ? 'her' : 'his'} whole toy shelf, one item at a time, and demanded a song at the end.`, 'good');
    if (rng.chance(0.3)) log(game, 'social_hint', `${person} asks when you are next bringing ${b.name} round. Children with more warm adults in their life do better on every measure — consider a playdate too.`, 'info');
    return ok(`Called ${person}.`);
  },

  // ------------------------------------------------------------------ health-adjacent
  observe(game) {
    const b = game.baby, s = b.state, n = b.needs, days = ageDays(game), t = game.sim.time;
    s.lastInteractionAt = t; // the only state change: you were there
    const tc = b.phys.tempC, lines = [], flags = [];
    lines.push(`Forehead against your lips: ${tc >= 38.5 ? 'hot and damp' : tc >= 38 ? 'noticeably warm' : tc < 36.2 ? 'cool, almost chilly' : 'warm and dry — just right'}.`);
    const rate = days < 60 ? '40-odd' : days < 365 ? '30-odd' : '22-odd';
    const chesty = b.illness && ['rsv', 'croup', 'pertussis', 'cold', 'flu'].includes(b.illness.id);
    lines.push(`Breathing: ${chesty ? `fast, with a ${b.illness.id === 'croup' ? 'barking, seal-like cough' : 'wet rattle'} and the skin sucking in under the ribs` : `${rate} soft breaths a minute, even, silent`}.`);
    lines.push(`Diaper: ${n.diaper > 80 ? 'dry and light' : n.diaper > 45 ? 'damp at the front' : n.diaper > 20 ? 'heavy and sagging' : 'soaked through into the vest'}${b.phys.rash > 30 ? '; the skin underneath is red and angry' : ''}.`);
    lines.push(`Smell: ${n.clean < 35 ? 'sour milk and old diaper' : n.diaper < 30 ? 'sharp ammonia' : days < 120 ? 'warm bread and milk — that newborn smell' : 'clean skin and shampoo'}.`);
    lines.push(`Eyes: ${sleeping(game) ? 'shut, flickering — dreaming' : b.emo.stress > 60 ? 'wide, scanning, hard to catch' : n.rest < 30 ? 'heavy, with red rims' : 'clear and locked onto your face'}.`);
    lines.push(`Body: ${s.held ? 'heavy and loose in your arms' : b.emo.stress > 60 ? 'stiff, fists closed' : 'relaxed, hands open'}${s.teething ? ', chin soaked with drool and one cheek flushed' : ''}.`);
    lines.push(`Mood reads as: ${b.emo.happiness > 65 ? 'genuinely content' : b.emo.happiness > 40 ? 'okay, a bit flat' : b.emo.happiness > 22 ? 'low and unbothered by you' : 'withdrawn — the thing that should worry you most'}.`);
    if (b.phys.jaundice > 30) { flags.push('A yellow cast to the whites of the eyes and the skin over the nose.'); }
    if (tc >= 38 && days < 90) flags.push('A fever under 3 months is an emergency — call the doctor now.');
    else if (tc >= 38) flags.push('That is a fever. Watch the feeding and the breathing.');
    if (chesty && b.illness.severity > 55) flags.push('Working hard to breathe — this needs a doctor today.');
    if (s.position === 'tummy' && days < 180 && sleeping(game)) flags.push('Asleep on the tummy under 6 months — turn ${him} onto ${his} back.'.replace('${him}', him(b)).replace('${his}', his(b)));
    if (b.needs.health < 45) flags.push(`${He(b)} simply does not look well.`);
    if (flags.length) log(game, 'observe', `Looking closely at ${b.name}: ${flags[0]}`, 'warn');
    return ok(flags.length ? flags[0] : `${b.name} looks well.`, { detail: { lines, flags, tempC: tc, mood: b.emo.happiness > 40 ? 'settled' : 'flat' } });
  },

  sunscreen(game) {
    const b = game.baby, n = b.needs, x = ext(game), t = game.sim.time;
    const gate = needAge(game, 180, 'sunscreen (use shade and clothing instead)') || needAwake(game); if (gate) return gate;
    if (stock(game, 'sunscreen') <= 0) return fail('No sunscreen. Order baby SPF 30 from the shop.');
    if (typeof x.sunscreenAt === 'number' && t - x.sunscreenAt < 90 * MIN) return ok('Already on — reapply after about two hours or after water.');
    game.inventory.sunscreen--; x.sunscreenAt = t;
    touch(game); n.clean = clamp(n.clean - 2);
    log(game, 'sunscreen', `A thin white layer on cheeks, ears, neck and the backs of the hands, twenty minutes before you go out. ${b.name} objected to every second of it.`, 'good');
    return ok('Sunscreen on.');
  },

  // ------------------------------------------------------------------ chores together (2y+)
  water_plants(game, _, rng) {
    const b = game.baby, n = b.needs, x = ext(game);
    const gate = needAge(game, 730, 'helping with the plants') || needAwake(game); if (gate) return gate;
    const k = count(game, 'chore'), eff = diminish(k, 3) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 10 * eff); b.emo.happiness = clamp(b.emo.happiness + 3 * eff);
    gain(game, { motor: 0.012, cognitive: 0.008, emotional: 0.008, language: 0.004 }, eff);
    const spilled = rng.chance(0.5);
    if (spilled) { x.floorMess = (x.floorMess || 0) + 1; n.clean = clamp(n.clean - 4); }
    log(game, 'chore', `${b.name} carried the little watering can to every plant${spilled ? ' and gave the rug most of it' : ' and only drowned one of them'}. ${He(b)} was extremely proud.`, 'good');
    return ok(spilled ? 'Plants watered, floor too.' : 'Plants watered.');
  },

  sweep(game) {
    const b = game.baby, n = b.needs, x = ext(game);
    const gate = needAge(game, 730, 'sweeping') || needAwake(game); if (gate) return gate;
    const k = count(game, 'chore'), eff = diminish(k, 3) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 9 * eff);
    gain(game, { motor: 0.014, emotional: 0.008, social: 0.006 }, eff);
    if (x.floorMess > 0) { x.floorMess = Math.max(0, x.floorMess - 1); n.clean = clamp(n.clean + 4); }
    log(game, 'chore', `Two brooms, one of them a toy, mostly moving crumbs from one place to another. ${b.name} takes it extremely seriously.`, 'good');
    return ok('Swept together.');
  },

  tidy_toys(game) {
    const b = game.baby, n = b.needs, x = ext(game), days = ageDays(game);
    const gate = needAge(game, 730, 'tidying up') || needAwake(game); if (gate) return gate;
    const k = count(game, 'tidy'), eff = diminish(k, 2) * effort(game);
    touch(game);
    n.stimulation = clamp(n.stimulation + 7 * eff); n.clean = clamp(n.clean + 3);
    if (x.floorMess > 0) x.floorMess = 0;
    gain(game, { emotional: 0.016, cognitive: 0.008, motor: 0.006, language: 0.004 }, eff);
    const dayIdx = Math.floor(days);
    if (x.tidyDay !== dayIdx) { x.tidyDay = dayIdx; x.tidyDays = (x.tidyDays || 0) + 1; }
    if (x.tidyDays === 7) memory(game, `A week of the tidy-up song and ${b.name} now starts putting blocks in the basket before you have finished singing it. This is what self-regulation looks like at two.`);
    else log(game, 'chore', `The tidy-up song, one block at a time into the basket. ${b.name} put four away and took six out, which is still progress.`, 'good');
    return ok('Toys away.');
  },

  cook_together(game, _, rng) {
    const b = game.baby, n = b.needs, inv = game.inventory, t = game.sim.time;
    const gate = needAge(game, 1095, 'cooking together') || needAwake(game); if (gate) return gate;
    const key = stock(game, 'toddler_meals') > 0 ? 'toddler_meals' : stock(game, 'snacks') > 0 ? 'snacks' : null;
    if (!key) return fail('Nothing in the cupboard to cook with. Order toddler meals or snacks.');
    const cd = coolDown(game, 'cook', 6 * HOUR, 'Cooking together'); if (cd) return cd;
    inv[key]--;
    touch(game); game.stats.feeds++; b.counters.feeds = (b.counters.feeds || 0) + 1;
    n.fullness = clamp(n.fullness + (key === 'toddler_meals' ? 55 : 24)); n.clean = clamp(n.clean - 10);
    b.state.lastFedAt = t; b.state.lastSolidsAt = t; b.state.mealsToday = (b.state.mealsToday || 0) + 1;
    gain(game, { cognitive: 0.016, motor: 0.014, language: 0.012, emotional: 0.008, social: 0.006 }, effort(game));
    // Children eat what they helped make; picky eating is largely fixed at the counter, not the table.
    b.emo.happiness = clamp(b.emo.happiness + 4);
    const burn = !game.house.proofing.cabinet_locks && rng.chance(0.06);
    if (burn) {
      b.injuries.push({ kind: 'small_burn', severe: false, pain: 12, healAt: t + 2 * DAY });
      n.comfort = clamp(n.comfort - 18); b.emo.stress = clamp(b.emo.stress + 15); startCry(game, 'in pain', 0.8);
      log(game, 'hazard', `${b.name} reached past you for the pan handle and caught the back of ${his(b)} hand on it. Cold running water for ten minutes. Turn the handles inward.`, 'danger');
      return ok('A small burn — cold water, ten minutes.');
    }
    log(game, 'cook', `Standing on a chair at the counter: stirring, pouring, tasting, and — because ${he(b)} made it — actually eating it.`, 'good');
    return ok('Cooked and ate together.');
  },
};

const His = (b) => (b.sex === 'girl' ? 'Her' : 'His');

// Wrap every extended handler so game-over / away / hospitalised are refused consistently,
// and so a handler called with no params object still works.
const guard = (h) => function extended(game, params, rng) {
  const stop = needHome(game); if (stop) return stop;
  return h(game, params && typeof params === 'object' ? params : {}, rng);
};

export const EXTRA_HANDLERS = Object.fromEntries(
  Object.entries({ ...MORE_HANDLERS, ...LOCAL_HANDLERS }).map(([id, h]) => [id, guard(h)]),
);

export const EXTRA_ACTION_IDS = Object.keys(EXTRA_HANDLERS);
