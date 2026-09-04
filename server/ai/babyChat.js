// Live chat with the baby. Uses the Anthropic API when credentials are available, otherwise a
// rule-based responder so the game always works. The parent's tone has real consequences.
import Anthropic from '@anthropic-ai/sdk';
import { ageDays, clockSeconds } from '../sim/engine.js';
import { moodOf } from '../sim/view.js';
import { distressOf } from '../sim/engine.js';
import { stageFor, ageLabel } from '../../shared/constants.js';
import { storySummaryForLLM } from '../sim/storyChapters.js';
import { COMMANDS } from './chatIntent.js';

const MODEL = process.env.BABY_LLM_MODEL || 'claude-opus-5';
let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client = new Anthropic({ timeout: 15000, maxRetries: 1 });
  return client;
}
export function llmAvailable() { return !!getClient(); }

const HARSH = /\b(shut up|stop crying|stupid|idiot|hate you|dumb|brat|useless|worthless|shut it|screw you|damn you|i can'?t stand you|leave me alone)\b/i;
const CURSE = /\b(fuck|shit|bitch|asshole|bastard|crap)\b/i;
const WARM = /\b(love|sweet|good (boy|girl)|there there|it'?s ok|okay|mama|dada|daddy|mommy|kiss|hug|cuddle|beautiful|precious|shh+|proud|brave|hello|hi |hey )\b/i;

export function classifyTone(text) {
  const t = text.trim();
  const letters = t.replace(/[^a-zA-Z]/g, '');
  const capsRatio = letters.length > 4 ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
  const bangs = (t.match(/!/g) || []).length;
  if (HARSH.test(t) || (CURSE.test(t) && (capsRatio > 0.5 || bangs > 1))) return 'harsh';
  if (capsRatio > 0.7 && letters.length > 8 && bangs > 0) return 'harsh';
  if (CURSE.test(t)) return 'cold';
  if (WARM.test(t)) return 'gentle';
  if (capsRatio > 0.7 && letters.length > 8) return 'cold';
  return 'neutral';
}

function speechLevel(days) {
  if (days < 60) return 'A newborn: cannot speak or understand words. Communicates only with cries, grunts, hiccups, gazes, yawns, rooting, startles and tiny hand movements.';
  if (days < 150) return 'A young infant: coos ("oooh", "aaah"), gurgles, social smiles, kicks and squeals. No words, no understanding of words, responds to tone of voice and faces.';
  if (days < 300) return 'An older infant: babbles ("ba-ba", "da-da-da", "mamama"), laughs, squeals, blows raspberries, reaches, shows stranger awareness. Understands tone and a few words like their name and "no".';
  if (days < 480) return 'A one-year-old: 1-5 single words used loosely ("mama", "dada", "ba" for ball, "uh-oh", "no"), points, waves, mixes words with babble. Understands simple phrases.';
  if (days < 730) return 'A toddler (18-24 months): 20-50 words, two-word phrases ("more milk", "no bed", "mama up"), toddler grammar, big feelings, says "mine". Mispronounces words.';
  if (days < 1095) return 'A two-year-old: short 3-4 word sentences with toddler grammar ("me want juice", "where doggy go?"), asks "what dat?", tantrums, pretend play, some mispronunciations.';
  if (days < 1461) return 'A three-year-old: full simple sentences, endless "why?" questions, imaginative, talks about feelings and friends, occasional grammar slips ("I goed").';
  return 'A four-to-five-year-old: fluent, curious, tells little stories, jokes, negotiates, expresses opinions, knows letters/colors/numbers if taught.';
}

function context(game) {
  const b = game.baby, days = ageDays(game), d = distressOf(game, days);
  const mood = moodOf(game, d);
  const hour = Math.floor(clockSeconds(game) / 3600);
  return {
    days, mood, d, hour,
    summary: `Name: ${b.name} (${b.sex}). Age: ${ageLabel(days)} (${stageFor(days).label}). Time: ${hour}:00. Mood: ${mood}. Activity: ${b.state.activity}, ${b.state.held ? 'being held by the parent' : `on the ${b.state.location.replace('_', ' ')}`}. Needs (0-100): fed ${Math.round(b.needs.fullness)}, rested ${Math.round(b.needs.rest)}, dry ${Math.round(b.needs.diaper)}, comfort ${Math.round(b.needs.comfort)}, engaged ${Math.round(b.needs.stimulation)}, loved ${Math.round(b.needs.affection)}, health ${Math.round(b.needs.health)}. Trust in parent ${Math.round(b.emo.trust)}/100, stress ${Math.round(b.emo.stress)}/100, happiness ${Math.round(b.emo.happiness)}/100, attachment: ${b.attachment}. ${b.state.cryingSince ? `Currently crying because: ${b.state.cryCause}.` : ''} ${b.illness ? `Sick: ${b.illness.id} (severity ${Math.round(b.illness.severity)}).` : ''} ${b.state.teething ? 'Teething.' : ''} Words known: ~${Math.round(Math.max(0, (b.dev.language - 15) * 12))}. Language score ${b.dev.language.toFixed(0)}/100, social ${b.dev.social.toFixed(0)}/100. Parent temper history: ${game.parent.tempers.yells} yells, ${game.parent.tempers.screams} screams, ${game.parent.tempers.leaves} times left alone. ${storySummaryForLLM(game)}`,
  };
}

const SCHEMA = {
  type: 'object',
  properties: {
    tone: { type: 'string', enum: ['gentle', 'neutral', 'cold', 'harsh'] },
    reply: { type: 'string', description: 'What the baby does/says, written for the parent to read. Vocalizations in quotes, body language in *asterisks*. 1-3 short sentences.' },
    effects: {
      type: 'object',
      properties: { affection: { type: 'integer' }, stimulation: { type: 'integer' }, stress: { type: 'integer' } },
      required: ['affection', 'stimulation', 'stress'], additionalProperties: false,
    },
    // The model reads the message for a request the pattern matcher may have missed — "could you
    // give the plants a drink for me?" is the same ask as "water the plants". It only ever NAMES a
    // request; whether the child understands it, is willing, and can actually do it is decided by
    // the simulation, never by the model.
    request: { type: 'string', enum: ['none', ...COMMANDS.map((c) => c.id)] },
    word: { type: 'string', description: 'If request is "word", the single word the parent asked the child to say. Otherwise an empty string.' },
  },
  required: ['tone', 'reply', 'effects', 'request', 'word'], additionalProperties: false,
};

export async function babyReply(game, text, history = []) {
  const heuristic = classifyTone(text);
  const ctx = context(game);
  const c = getClient();
  if (c) {
    try {
      const system = `You are the simulation voice of a real baby/child in a realistic parenting game. Respond ONLY as the child would actually behave, strictly limited by developmental stage. Never break character, never explain, never be a chatbot. Preverbal babies do not understand words — they respond to tone, touch, and their own needs.
Developmental capability: ${speechLevel(ctx.days)}
Current state: ${ctx.summary}
Rules: Reflect the current needs (a hungry crying newborn keeps crying no matter how sweet the words; a scared child with low trust is wary; a secure happy toddler is chatty). Harsh, shouted, or cruel parent messages frighten the child — show fear, crying, freezing, or withdrawal. Gentle talk soothes a little but does not replace feeding/changing. Keep replies under 45 words. Also classify the parent's tone: gentle, neutral, cold, or harsh. Effects are small integers from -8 to 8 describing how this exchange changed the child's affection, stimulation and stress.
Requests: if the parent is asking the child to DO something, set "request" to the matching id, otherwise "none". Ids: ${COMMANDS.map((c) => c.id).join(', ')}. Only name the request — do NOT decide whether the child obeys, and do NOT describe them doing it in the reply unless they are plainly capable and willing; the simulation decides that separately and will narrate the outcome itself. Write the reply as the child's immediate reaction to being asked.`;
      const messages = [];
      for (const h of history.slice(-8)) messages.push({ role: h.role === 'baby' ? 'assistant' : 'user', content: h.content });
      messages.push({ role: 'user', content: text });
      const res = await c.beta.messages.create({
        model: MODEL,
        max_tokens: 400,
        system,
        messages,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (res.stop_reason !== 'refusal') {
        const block = res.content.find((x) => x.type === 'text');
        if (block) {
          const parsed = JSON.parse(block.text);
          const tone = heuristic === 'harsh' ? 'harsh' : parsed.tone;
          const request = parsed.request && parsed.request !== 'none' ? parsed.request : null;
          return { reply: parsed.reply, tone, effects: clampEffects(parsed.effects), request, word: String(parsed.word || '').slice(0, 24), source: 'llm' };
        }
      }
    } catch (e) {
      console.warn('[babyChat] LLM failed, using rules:', e.message);
    }
  }
  return { ...rulesReply(game, text, heuristic, ctx), source: 'rules' };
}

function clampEffects(e) {
  const c = (v) => Math.max(-8, Math.min(8, Math.round(Number(v) || 0)));
  return { affection: c(e.affection), stimulation: c(e.stimulation), stress: c(e.stress) };
}

function pick(arr, seed) { return arr[Math.abs(seed) % arr.length]; }

function rulesReply(game, text, tone, ctx) {
  const b = game.baby, days = ctx.days, mood = ctx.mood, name = b.name;
  const seed = text.length * 31 + Math.floor(game.sim.time / 60);
  const cause = b.state.cryCause;
  let reply;
  if (tone === 'harsh') {
    reply = days < 300 ? pick([`*flinches hard, arms flying out* A shrill, frightened wail — ${name} doesn't understand the words, only the fear.`, `*eyes go wide, lip trembles* Then a broken, breathless scream.`], seed)
      : days < 730 ? pick([`*freezes, then bursts into sobs* "No… no…" *reaches out and then pulls back*`, `*covers face with hands and cries* "Mama… no."`], seed)
      : pick([`*shrinks back, eyes filling* "I'm sorry… I'm sorry…" *starts to cry quietly*`, `*goes very still and looks at the floor* "…okay." *a tear rolls down*`], seed);
  } else if (b.state.cryingSince) {
    reply = days < 150 ? pick([`*keeps crying — ${cause}* Your voice makes ${name} pause for a breath, then the wail returns.`, `*red-faced, fists clenched, crying* Words don't help here; ${name} needs ${cause === 'hungry' ? 'a feed' : cause === 'wet diaper' ? 'a change' : 'comfort'}.`], seed)
      : days < 730 ? pick([`*sobbing* "Mamaaa…" *reaches up with both arms* ${name} is ${cause}.`, `*hiccupping cries, tugs at your leg* ${name} clearly wants help — ${cause}.`], seed)
      : pick([`*crying* "I'm ${cause === 'hungry' ? 'hungry' : cause === 'tired' ? 'not tired!' : cause === 'in pain' ? 'hurting' : 'sad'}!" *wipes nose on sleeve*`], seed);
  } else if (b.state.activity === 'sleeping') {
    reply = pick([`*asleep* A soft sigh. ${name}'s eyelids flutter but ${b.sex === 'girl' ? 'she' : 'he'} stays asleep.`, `*deep, slow breathing* A tiny hand twitches. Dreaming.`], seed);
  } else if (days < 60) {
    reply = pick([`*stares at your face with unfocused dark eyes* A small grunt. Mouth opens and closes.`, `*rooting toward your voice* "Nngh." A hiccup. Tiny fingers curl around yours.`, `*yawns enormously* Blinks slowly, gaze drifting to the light from the window.`], seed);
  } else if (days < 150) {
    reply = mood === 'happy' || mood === 'content' ? pick([`"Ooooh… aaah!" *big gummy smile, legs kicking*`, `*locks eyes with you and squeals* "Aaah-goo!"`], seed) : pick([`*watches your mouth intently* A soft "ehh." Then a frown.`, `*turns head away, rubbing eyes* Fussing a little.`], seed);
  } else if (days < 365) {
    reply = mood === 'happy' || mood === 'playing' ? pick([`"Ba-ba-ba-BA!" *bounces, slaps the floor, grins showing ${b.phys.teeth} teeth*`, `*blows a raspberry at you and laughs* "Dadadada!"`], seed) : mood === 'scared' || b.emo.trust < 40 ? pick([`*watches you warily, thumb in mouth* A quiet "mmm."`], seed) : pick([`"Mamama…" *reaches toward you, then gets distracted by ${b.sex === 'girl' ? 'her' : 'his'} own foot*`], seed);
  } else if (days < 730) {
    const w = b.dev.language > 28 ? 'two' : 'one';
    reply = mood === 'happy' || mood === 'playing' ? pick([w === 'two' ? `"Mama play!" *holds up a block* "Dis!"` : `"Ba!" *points at the ball, then at you* "Ba ba!"`, `*toddles over and hugs your leg* "Up! Up!"`], seed) : b.emo.trust < 40 ? pick([`*hangs back near the sofa* "…no." *looks unsure whether to come closer*`], seed) : pick([`"Uh-oh." *drops a toy on purpose and looks at you*`, `"Milk? Milk!" *points at the kitchen*`], seed);
  } else if (days < 1095) {
    reply = mood === 'happy' ? pick([`"Me want play wif you! Come!" *grabs your hand*`, `"Look! Big tower!" *knocks it over* "Uh-oh! Again!"`], seed) : b.emo.trust < 40 ? pick([`*quietly* "No yell?" *watches your face carefully*`], seed) : pick([`"Where doggy go?" *there is no doggy*`, `"I do it MYSELF." *struggles with the sock*`], seed);
  } else if (days < 1461) {
    reply = pick([`"Why is the sky up? Why? But why?" *spins in a circle*`, `"I'm a dragon and you're the castle! ROAR!"`, b.emo.trust < 40 ? `*sits at a distance* "Are you mad at me?"` : `"I love you this much!" *arms out wide*`], seed);
  } else {
    reply = pick([`"Guess what? A ${b.milestones.letters ? 'B is for baby' : 'butterfly is a bug'}! I know because you telled — told — me."`, b.emo.trust < 40 ? `"You promise you won't yell?" *looks up seriously*` : `"Can we have a playdate? I want to show my friend my ${game.inventory.toys.includes('trike') ? 'trike' : 'blocks'}!"`, `"When I'm big I'll be a doctor AND a dinosaur."`], seed);
  }
  const effects = tone === 'harsh' ? { affection: -5, stimulation: 2, stress: 8 } : tone === 'cold' ? { affection: -1, stimulation: 1, stress: 2 } : tone === 'gentle' ? { affection: 3, stimulation: 3, stress: -3 } : { affection: 1, stimulation: 2, stress: -1 };
  return { reply, tone, effects };
}
