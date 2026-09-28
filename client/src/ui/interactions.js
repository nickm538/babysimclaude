// Choosers and context entries for the nuanced interactions (server/sim/actions2.js + actions3.js).
// Everything here only builds UI and delegates to runAction — the server stays authoritative.
import { chooserModal } from './screens.js';
import { store } from '../state.js';
import { WORDS_BY_AGE, ALLERGENS, FEELINGS } from '/shared/constants.js';

const dur = { teach_word: 6, body_parts: 6, sing_abcs: 6, count_together: 6, read_dialogic: 10, introduce_allergen: 8,
  offer_water: 3, self_feed: 10, table_manners: 8, praise: 2, gentle_correction: 3, name_feeling: 4, time_in: 8, time_out: 6,
  peekaboo: 5, tickle: 4, massage: 8, skin_to_skin: 10, mirror_play: 6, dance: 7, music_time: 8, sensory_play: 10,
  blocks_together: 9, bath_toys: 6, night_check: 2, dream_feed: 8, comfort_nightmare: 7, nail_trim: 6, haircut: 10,
  stroller_walk: 25, carrier: 4, screen_time: 3, observe: 3, sunscreen: 4, water_plants: 6, sweep: 6, tidy_toys: 7,
  cook_together: 14, allergy_call: 2, clean_drops: 4, video_call: 6, bedtime_routine: 2, harsh: 2 };

export const ACTION_DUR = dur;

// ---- choosers -------------------------------------------------------------------------------

export async function chooseWord(G, run) {
  const days = store.view.sim.days;
  const bands = WORDS_BY_AGE.filter((b) => days >= b.minDays);
  if (!bands.length) return store.toast('Too young for word practice — try singing and talking instead.', 'info');
  const band = bands[bands.length - 1];
  const known = new Set((store.view.baby.vocabulary || []).filter((w) => w.known).map((w) => w.word));
  const opts = band.words.slice(0, 12).map((w) => ({ label: known.has(w) ? `${w} ✓` : w, id: w, sub: known.has(w) ? 'knows it' : '' }));
  const pick = await chooserModal(document.getElementById('overlay'), `Teach a word — ${band.label}`, opts, { text: 'Say it, point at it, wait. Repetition is what makes it stick.' });
  if (pick) run('teach_word', { word: pick.id }, { anim: 'none', dur: dur.teach_word, look: true, near: true });
  void G;
}

export async function chooseAllergen(G, run) {
  const introduced = store.view.baby.allergens || {};
  const opts = ALLERGENS.map((a) => ({ label: a.label, id: a.id, sub: introduced[a.id] ? `given ${introduced[a.id].times || 1}×` : 'new' }));
  const pick = await chooserModal(document.getElementById('overlay'), 'Introduce an allergen', opts, {
    text: 'Early, regular, small amounts lower the risk of a real allergy. Offer it at home, in the morning, never when the baby is unwell.',
  });
  if (pick) run('introduce_allergen', { id: pick.id }, { anim: 'item', item: 'spoon', dur: dur.introduce_allergen, near: true });
  void G;
}

export async function chooseFeeling(G, run) {
  const opts = FEELINGS.map((f) => ({ label: `"You're feeling ${f}"`, id: f }));
  const pick = await chooserModal(document.getElementById('overlay'), 'Name the feeling', opts, {
    text: 'Naming a big feeling out loud is how a toddler learns to survive one.',
  });
  if (pick) run('name_feeling', { feeling: pick.id }, { anim: 'none', dur: dur.name_feeling, look: true, near: true });
  void G;
}

export async function chooseDiscipline(G, run) {
  const pick = await chooserModal(document.getElementById('overlay'), 'They just did something they should not', [
    { label: '👏 Praise what they did right instead', id: 'praise', sub: 'builds the behaviour you want' },
    { label: '✋ Gentle correction', id: 'gentle_correction', sub: 'calm, short, and immediate' },
    { label: '💬 Name the feeling', id: 'name_feeling', sub: 'emotional coaching' },
    { label: '🫂 Time-in — sit together', id: 'time_in', sub: 'co-regulate, no shame' },
  ], { text: 'Discipline means teaching. What actually changes behaviour at this age is calm, boring consistency.' });
  if (!pick) return;
  if (pick.id === 'name_feeling') return chooseFeeling(G, run);
  run(pick.id, {}, { anim: 'none', dur: dur[pick.id] || 4, look: true, near: true });
}

export async function choosePlayActivity(G, run) {
  const days = store.view.sim.days;
  const all = [
    { id: 'peekaboo', label: '🙈 Peekaboo', min: 60 },
    { id: 'tickle', label: '🤗 Tickle', min: 120 },
    { id: 'mirror_play', label: '🪞 Mirror play', min: 90 },
    { id: 'dance', label: '💃 Dance together', min: 120 },
    { id: 'music_time', label: '🥁 Music time', min: 180 },
    { id: 'blocks_together', label: '🧱 Build together', min: 240 },
    { id: 'sensory_play', label: '🌾 Sensory play', min: 240 },
    { id: 'massage', label: '💆 Baby massage', min: 0 },
    { id: 'skin_to_skin', label: '🤱 Skin to skin', min: 0, max: 180 },
  ].filter((a) => days >= a.min && (a.max == null || days <= a.max));
  const pick = await chooserModal(document.getElementById('overlay'), 'Play together', all.map((a) => ({ label: a.label, id: a.id })));
  if (pick) run(pick.id, {}, { anim: pick.id === 'skin_to_skin' || pick.id === 'massage' ? 'hold' : 'none', dur: dur[pick.id] || 6, look: true, near: true });
  void G;
}

export async function chooseLearn(G, run) {
  const days = store.view.sim.days;
  const all = [
    { id: 'teach_word', label: '🗣️ Teach a word', min: 150 },
    { id: 'body_parts', label: '👃 Name body parts', min: 200 },
    { id: 'sing_abcs', label: '🔤 Sing the ABCs', min: 300 },
    { id: 'count_together', label: '🔢 Count together', min: 500 },
    { id: 'read_dialogic', label: '📖 Read with questions', min: 400 },
  ].filter((a) => days >= a.min);
  if (!all.length) return store.toast('Too young for lessons — talk, sing and make faces instead. That is the lesson.', 'info');
  const pick = await chooserModal(document.getElementById('overlay'), 'Learning together', all.map((a) => ({ label: a.label, id: a.id })));
  if (!pick) return;
  if (pick.id === 'teach_word') return chooseWord(G, run);
  run(pick.id, {}, { anim: pick.id === 'read_dialogic' ? 'item' : 'none', item: 'book', dur: dur[pick.id] || 6, look: true, near: true });
}

export async function chooseCare(G, run) {
  const days = store.view.sim.days;
  const sleeping = store.view.baby.state.activity === 'sleeping';
  const all = [
    { id: 'night_check', label: '🔦 Quiet night check', when: sleeping },
    { id: 'dream_feed', label: '🍼 Dream feed', when: sleeping && days < 300 },
    { id: 'comfort_nightmare', label: '🌙 Comfort after a nightmare', when: days > 540 },
    { id: 'bedtime_routine', label: '🛁 Start the bedtime routine', when: !sleeping },
    { id: 'nail_trim', label: '✂️ Trim nails', when: true },
    { id: 'haircut', label: '💇 First haircut', when: days > 300 },
    { id: 'sunscreen', label: '🧴 Sunscreen', when: days > 180 },
    { id: 'carrier', label: '🎒 Carrier on/off', when: !sleeping },
  ].filter((a) => a.when);
  const pick = await chooserModal(document.getElementById('overlay'), 'Care', all.map((a) => ({ label: a.label, id: a.id })));
  if (pick) run(pick.id, {}, { anim: pick.id === 'dream_feed' ? 'item' : 'none', item: 'bottle', dur: dur[pick.id] || 5, near: true });
  void G;
}

export async function chooseChores(G, run) {
  const days = store.view.sim.days;
  const all = [
    { id: 'tidy_toys', label: '🧸 Put the toys away together', min: 600 },
    { id: 'water_plants', label: '🪴 Water the plants together', min: 700 },
    { id: 'sweep', label: '🧹 Sweep together', min: 800 },
    { id: 'cook_together', label: '🥣 Cook together', min: 1095 },
  ].filter((a) => days >= a.min);
  if (!all.length) return store.toast('Still too little to help — but they love watching you do it.', 'info');
  const pick = await chooserModal(document.getElementById('overlay'), 'Do it together', all.map((a) => ({ label: a.label, id: a.id })));
  if (pick) run(pick.id, {}, { anim: 'none', dur: dur[pick.id] || 8, look: true, near: true });
  void G;
}

export function showObservation(text) {
  const el = document.createElement('div'); el.className = 'modal';
  el.innerHTML = `<div class="card"><h2>👀 You watch for a moment</h2><p style="color:var(--text);line-height:1.6">${String(text).replace(/[<>&]/g, '')}</p><button class="primary" style="width:100%">Close</button></div>`;
  document.getElementById('overlay').appendChild(el);
  el.querySelector('button').onclick = () => el.remove();
}
