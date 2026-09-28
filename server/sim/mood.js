// The mood spectrum: one signed number (-100..100), a label from MOOD_LABELS, and a sensory
// one-sentence description of how the child seems right now.
//
// Deliberately imports nothing from the engine so it can be called from anywhere (view, chat,
// story, tests) without import cycles. Everything it needs is on the game object.
import { DAY, HOUR, clamp, ILLNESSES, MOOD_LABELS } from '../../shared/constants.js';
import { hashSeed } from './rng.js';

// Illnesses that read as an emergency rather than "under the weather".
const DANGEROUS = new Set(['poisoning', 'botulism', 'pertussis', 'rsv', 'flu', 'failure_to_thrive', 'ate_object']);

export function celebrationOf(game) {
  const c = game.story && typeof game.story.celebration === 'number' ? game.story.celebration : 0;
  return Math.min(28, Math.max(0, c) * 0.3);
}

// Decay the celebration pool (called once per engine step from story.js).
export function decayCelebration(game, dtH) {
  const st = game.story;
  if (!st) return;
  const c = typeof st.celebration === 'number' ? st.celebration : 0;
  // ~4 sim-day half life, so a good fortnight of care keeps the number high.
  st.celebration = Math.max(0, c * Math.pow(0.5, dtH / 96));
}

export function addCelebration(game, amount) {
  const st = game.story;
  if (!st || !amount) return;
  st.celebration = Math.min(120, (typeof st.celebration === 'number' ? st.celebration : 0) + amount);
}

export function moodValue(game) {
  const b = game.baby, n = b.needs, e = b.emo, s = b.state, t = game.sim.time;
  if (game.status === 'dead') return -100;

  // Core: how well the body's needs are met, centred on 55 = "getting by".
  const needScore = n.fullness * 0.18 + n.rest * 0.12 + n.diaper * 0.10 + n.clean * 0.06
    + n.comfort * 0.20 + n.stimulation * 0.12 + n.affection * 0.16 + n.health * 0.06;
  let v = (needScore - 55) * 2.0;

  // Emotional weather.
  v += (e.happiness - 50) * 0.45;
  v += (e.trust - 50) * 0.20;
  v += (e.security - 50) * 0.10;
  v -= Math.max(0, e.stress - 25) * 0.75;

  // Illness and pain.
  const ill = b.illness;
  if (ill) {
    const def = ILLNESSES[ill.id] || { danger: 1 };
    v -= ill.severity * (0.22 + def.danger * 0.14);
    if (!ill.treated && (def.danger >= 1.2 || DANGEROUS.has(ill.id))) v -= 22;
  }
  if (n.health < 40) v -= (40 - n.health) * 1.1;
  if (s.cryingSince) v -= 12 + 30 * (s.cryIntensity || 0);
  if (Array.isArray(b.injuries) && b.injuries.some((i) => i.healAt > t)) v -= 12;
  if (s.teething) v -= 6;
  if (s.colicUntil > t) v -= 14;
  if (s.hospitalizedUntil > t) v -= 22;

  // Sleep flattens the extremes: a peacefully sleeping baby reads calm, not ecstatic.
  if (s.activity === 'sleeping') v = v * 0.55 + 12;
  else if (s.selfPlayUntil > t) v += 6;
  if (s.held && !s.cryingSince) v += 4;

  // Recent good news — milestones, praise, playdates, self-play — earns real joy.
  v += celebrationOf(game);

  // Hard floors: a body in real trouble cannot be "content", whatever the other numbers say.
  if (n.health < 15) v = Math.min(v, -72);
  if (ill && !ill.treated && (DANGEROUS.has(ill.id) || (ILLNESSES[ill.id] || {}).danger >= 1.2) && ill.severity > 45) v = Math.min(v, -64);
  if (b.attachment === 'disorganized') v = Math.min(v, 30);
  return clamp(v, -100, 100);
}

export function labelFor(value) {
  for (let i = MOOD_LABELS.length - 1; i >= 0; i--) if (value >= MOOD_LABELS[i].min) return MOOD_LABELS[i].id;
  return MOOD_LABELS[0].id;
}

export function computeMood(game) {
  const value = moodValue(game);
  const label = labelFor(value);
  return { value: Math.round(value), label, text: moodText(game, label) };
}

// --- description -----------------------------------------------------------------------------

const BANDS = ['newborn', 'infant', 'toddler', 'child'];
function bandFor(days) { return days < 90 ? 0 : days < 365 ? 1 : days < 1095 ? 2 : 3; }

function pronouns(b) {
  const girl = b.sex === 'girl';
  return { they: girl ? 'she' : 'he', They: girl ? 'She' : 'He', their: girl ? 'her' : 'his', Their: girl ? 'Her' : 'His', them: girl ? 'her' : 'him' };
}

export function fillText(text, game) {
  const b = game.baby, p = pronouns(b);
  return text
    .replace(/\{n\}/g, b.name).replace(/\{name\}/g, b.name)
    .replace(/\{They\}/g, p.They).replace(/\{they\}/g, p.they)
    .replace(/\{Their\}/g, p.Their).replace(/\{their\}/g, p.their)
    .replace(/\{them\}/g, p.them);
}

export function moodText(game, label) {
  const days = game.sim.time / DAY;
  const bi = bandFor(days);
  const bank = MOOD_TEXT[label] || MOOD_TEXT.neutral;
  const arr = bank[BANDS[bi]] || bank.infant;
  // Seeded pick that drifts every couple of sim-hours so the wording changes with time.
  const k = (hashSeed(game.baby.name + label) ^ Math.floor(game.sim.time / (2 * HOUR)) ^ (bi * 7919)) >>> 0;
  return fillText(arr[k % arr.length], game);
}

// Three variants per label per age band. Sensory, present-tense, one sentence.
const MOOD_TEXT = {
  agony: {
    newborn: ['{n} is rigid and purple-faced, screaming past the point of breath, and nothing in the world is reaching {them}.',
      'The cry has gone hoarse and inhuman; {n}’s whole body is clenched around whatever is wrong.',
      '{n} has stopped fighting and gone limp and grey, too spent even to cry properly.'],
    infant: ['{n} arches away from every touch, screaming until {they} chokes, sweat plastering {their} hair down.',
      'There is nothing behind {n}’s eyes but pain; the sound {they} is making does not stop for breath.',
      '{n} has gone quiet in the worst way — floppy, glassy-eyed, past crying.'],
    toddler: ['{n} is on the floor screaming with {their} face wet and {their} fists knotted, inconsolable and beyond reason.',
      '{n} shakes, cries, pushes you away and reaches for you in the same second, wretched.',
      '{n} has curled up small and gone silent, and the silence is far worse than the screaming was.'],
    child: ['{n} sobs in gulps that {they} cannot stop, and will not say what is wrong because {they} does not have the words for it.',
      '{n} has gone somewhere you cannot follow — hunched, rocking, refusing to be touched.',
      '{n} looks at you with an exhausted, hollowed-out face and says nothing at all.'],
  },
  misery: {
    newborn: ['{n} cries in long ragged waves, going red then white, chin shaking between each one.',
      '{n} will not settle at any angle, in any arms; the crying just keeps coming back.',
      'Every few seconds {n} startles {them}self and starts crying all over again.'],
    infant: ['{n} is miserable — hot-faced, fists in {their} eyes, crying with real despair.',
      '{n} pushes {their} face into your shoulder and howls, and pulls away, and howls again.',
      'Nothing works: {n} cries through the bottle, through the rocking, through the singing.'],
    toddler: ['{n} is inconsolably upset, hiccupping between sobs, refusing everything you offer.',
      '{n} trails after you crying, wanting up and then wanting down, wretched either way.',
      '{n}’s face is blotchy and streaming and {they} has forgotten what started it.'],
    child: ['{n} is properly miserable — red-eyed, sniffing, insisting {they} is fine when {they} plainly is not.',
      '{n} sits with {their} back to the room and will not be talked round.',
      '{n} cries the tired, hopeless way children cry when they have run out of other ideas.'],
  },
  distress: {
    newborn: ['{n} is squirming and grizzling, knees pulled up, working {them}self toward a real cry.',
      '{n} keeps grunting and thrashing, unable to get comfortable in any position.',
      '{n}’s face is screwed up and {their} breathing is quick and cross.'],
    infant: ['{n} is distressed — whimpering, kicking, batting away the pacifier and then wanting it back.',
      '{n} clings and complains in equal measure, hot and unhappy and hard to hold.',
      'A steady, unhappy grizzle from {n} that keeps threatening to become a proper cry.'],
    toddler: ['{n} is close to tears over everything, dragging a toy behind {them} and whining at the walls.',
      '{n} throws {them}self at your legs, then away, cross and sad and unable to explain it.',
      'Everything is wrong: the cup, the sock, the light, the day. {n} is distressed and furious about it.'],
    child: ['{n} is upset and prickly, snapping at questions and going quiet when you push.',
      '{n} keeps starting sentences and abandoning them, near tears.',
      '{n} is scowling at the floor with {their} arms crossed, radiating misery.'],
  },
  unhappy: {
    newborn: ['{n} is fretful and squirmy, sighing and grumbling at nothing in particular.',
      '{n} keeps making small unhappy noises and turning {their} head away from everything.',
      '{n} is uncomfortable somewhere and cannot tell you where.'],
    infant: ['{n} is out of sorts — chewing {their} fist, frowning, easily upset by small noises.',
      '{n} fusses, settles, and fusses again; nothing is quite right today.',
      '{n} keeps rubbing {their} eyes and complaining under {their} breath.'],
    toddler: ['{n} is grumpy and clingy, saying no to things {they} usually loves.',
      '{n} is dragging around the house looking for something to be cross about.',
      '{n} whines at your knee and then refuses the thing {they} asked for.'],
    child: ['{n} is in a mood — short answers, heavy sighs, and a determined scowl.',
      '{n} is unhappy about something and would rather sulk than say so.',
      '{n} keeps saying "nothing" in a tone that clearly means something.'],
  },
  low: {
    newborn: ['{n} is quiet and a little flat, blinking slowly at the ceiling.',
      '{n} is awake but subdued, not interested in your face today.',
      '{n} lies still with {their} mouth turned down, saving {their} energy.'],
    infant: ['{n} is subdued — watching the room without joining in with it.',
      '{n} is a bit low, half-heartedly mouthing a toy and letting it drop.',
      '{n} sits and looks at nothing, easily bored and slow to smile.'],
    toddler: ['{n} is flat today, mooching from room to room without settling to anything.',
      '{n} is not really playing, just moving things from one pile to another.',
      '{n} leans against the sofa and watches you work, unimpressed by the world.'],
    child: ['{n} is quiet and a bit deflated, answering in single words.',
      '{n} keeps starting games and losing interest halfway through.',
      '{n} is fine, {they} says, from behind a cushion.'],
  },
  neutral: {
    newborn: ['{n} is awake and even-tempered, taking the room in with unfocused dark eyes.',
      '{n} lies calmly, one hand opening and closing, entirely unbothered.',
      '{n} is doing the main work of being new: breathing, looking, existing.'],
    infant: ['{n} is settled and level, watching the light move across the wall.',
      '{n} is neither happy nor sad — just busy being awake.',
      '{n} kicks steadily and studies {their} own hands with mild interest.'],
    toddler: ['{n} is pottering about steadily, neither delighted nor cross.',
      '{n} is absorbed in moving small objects between two containers.',
      '{n} is calm and self-contained, narrating quietly to {them}self.'],
    child: ['{n} is level and chatty enough, getting on with {their} own business.',
      '{n} is fine — mildly interested in everything, gripped by nothing.',
      '{n} is talking to a toy in a low, steady voice.'],
  },
  content: {
    newborn: ['{n} is warm, dry, full and calm — the whole body loose in your hands.',
      '{n} makes small satisfied noises and settles heavier against you.',
      '{n} is content: eyes half shut, one fist curled under {their} chin.'],
    infant: ['{n} is contentedly busy, chewing a toy and cooing between bites.',
      '{n} looks comfortable and pleased, kicking gently at nothing.',
      '{n} keeps glancing up at you and going back to {their} own quiet game.'],
    toddler: ['{n} is happily occupied, murmuring a running commentary to {their} toys.',
      '{n} is comfortable and easy company today, drifting between games.',
      '{n} is content — a little sticky, a little tired, entirely at home.'],
    child: ['{n} is comfortable and talkative, telling you a story with a very loose plot.',
      '{n} is contentedly pottering, asking questions {they} does not wait to have answered.',
      '{n} is in a good, easy mood and keeps coming back to check you are still there.'],
  },
  happy: {
    newborn: ['{n} is bright-eyed and calm, mouth working into something very close to a smile.',
      '{n} coos at your face and waves both arms at once, thoroughly pleased.',
      '{n} is warm and happy against your chest, making tiny satisfied grunts.'],
    infant: ['{n} squeals when {they} catches your eye and kicks both legs in delight.',
      '{n} is genuinely happy — babbling loudly, grabbing at everything within reach.',
      '{n} beams a wet gummy grin at you and goes back to shouting at a toy.'],
    toddler: ['{n} is bouncing between games and shouting the names of things {they} recognises.',
      '{n} is happy and busy, dragging you by one finger toward whatever is next.',
      '{n} keeps laughing at {their} own jokes and looking to see whether you got them.'],
    child: ['{n} is talking nineteen to the dozen about something complicated and imaginary.',
      '{n} is happy and full of plans, most of which involve you.',
      '{n} is grinning, filthy, and in the middle of an excellent day.'],
  },
  joyful: {
    newborn: ['{n} is lit up — arms and legs cycling, eyes locked on your face, making a tiny sound of pure joy.',
      '{n} is milk-drunk and radiant, smiling at the ceiling for no reason at all.',
      'There is a lightness to {n} today; every touch gets a wriggle of delight.'],
    infant: ['{n} is joyful — belly-laughing, squealing, absolutely thrilled with everything you do.',
      '{n} shrieks with laughter and does it again to make it happen twice.',
      '{n} is bursting with it, batting at toys and grinning at anyone who looks.'],
    toddler: ['{n} is thrilled with the world, running in circles and laughing at {their} own feet.',
      '{n} is joyful and loud, showing you the same block eleven times in a row.',
      '{n} hugs you around the knees, roars, and runs off to fetch something else.'],
    child: ['{n} is glowing — bursting with things to tell you and stopping halfway to hug you.',
      '{n} is joyful, silly and unstoppable, inventing games faster than {they} can play them.',
      '{n} laughs until {they} has to sit down, then starts telling you why.'],
  },
  elated: {
    newborn: ['{n} is utterly, wordlessly happy — every part of {them} soft and open and turned toward you.',
      '{n} is glowing with contentment, gazing at your face as if there is nothing else worth seeing.',
      'This is the very best {n} has ever felt, and {they} tells you with {their} whole small body.'],
    infant: ['{n} is beside {them}self with joy, laughing until {they} hiccups and starting again.',
      '{n} cannot contain it — squealing, kicking, reaching for you with both hands and a whole-face grin.',
      'Everything is wonderful and {n} wants you to know it, at volume.'],
    toddler: ['{n} is elated: running, shrieking, hugging the furniture, entirely in love with being alive.',
      '{n} is having the best day of {their} life so far and keeps stopping to tell you so.',
      '{n} is so happy {they} has forgotten to be shy about any of it.'],
    child: ['{n} is radiant — talking, laughing, hugging you mid-sentence and forgetting what {they} was saying.',
      '{n} is completely, uncomplicatedly happy, and says so, twice, and then draws you a picture about it.',
      '{n} is elated, secure and certain of you, and it shows in everything {they} does.'],
  },
};
