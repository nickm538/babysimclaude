// Context-sensitive action list: what the parent can do right now given proximity, what they hold, and the baby's state.
import { ACTIONS } from '/shared/constants.js';

// ctx: { view, near: {baby, kitchen, changing_table, crib, sofa, play_mat, high_chair, playpen, door, potty, toddler_bed}, holding, held, run(id, params, opts) }
export function contextActions(ctx) {
  const { view, near, holding, run } = ctx;
  if (!view || view.status !== 'active') return [];
  const b = view.baby, st = b.state, inv = view.inventory, days = view.sim.days;
  const held = st.held;
  const out = [];
  const add = (label, id, params = {}, opts = {}) => out.push({ label, cls: opts.cls, disabled: opts.disabled, run: () => run(id, params, opts) });
  const dur = (id) => (ACTIONS[id] ? ACTIONS[id].dur : 3);

  if (view.parent.away) { add('Come back to the baby', 'return', {}, { anim: 'none' }); return out; }
  if (st.hospitalized) { out.push({ hint: `${b.name} is in the hospital.` }); return out; }

  // door / packages / nurse
  if (near.door) {
    if (view.house.doorPackages.length) add(`📦 Bring in package`, 'collect_package', { orderId: view.house.doorPackages[0] }, { anim: 'none', dur: 2 });
    if (view.house.nurseHere) add(`💉 Let the nurse in (vaccines)`, 'nurse_visit', {}, { anim: 'item', item: 'medicine', dur: dur('nurse_visit') });
  }
  // kitchen: prepare food to carry
  if (near.kitchen && !held) {
    if (holding === 'bottle') out.push({ hint: 'You have a warm bottle. Take it to the baby.' });
    else {
      add('🍼 Prepare bottle', 'prepare', { item: 'bottle' }, { anim: 'item', item: 'bottle', dur: 6, local: true, disabled: inv.formula <= 0 || inv.bottlesClean <= 0 });
      if (days >= 100 && (inv.purees > 0 || inv.cereal > 0)) add('🥣 Prepare puree/cereal', 'prepare', { item: 'bowl', food: inv.purees > 0 ? 'puree' : 'cereal' }, { anim: 'item', item: 'bowl', dur: 5, local: true });
      if (days >= 220 && inv.finger_foods > 0) add('🍌 Finger foods', 'prepare', { item: 'bowl', food: 'finger' }, { anim: 'item', item: 'bowl', dur: 4, local: true });
      if (days >= 340 && inv.toddler_meals > 0) add('🍽️ Toddler meal', 'prepare', { item: 'bowl', food: 'toddler_meal' }, { anim: 'item', item: 'bowl', dur: 6, local: true });
      if (days >= 340 && inv.whole_milk > 0) add('🥛 Cup of milk', 'prepare', { item: 'bottle', food: 'milk' }, { anim: 'item', item: 'bottle', dur: 2, local: true });
      if (days >= 160) add('💧 Water', 'prepare', { item: 'bottle', food: 'water' }, { anim: 'item', item: 'bottle', dur: 1, local: true });
      if (days >= 280 && inv.snacks > 0) add('🍪 Snack', 'prepare', { item: 'bowl', food: 'snack' }, { anim: 'item', item: 'bowl', dur: 2, local: true });
      if (inv.honey > 0) add('🍯 Honey', 'prepare', { item: 'spoon', food: 'honey' }, { anim: 'item', item: 'spoon', dur: 2, local: true, cls: 'warn' });
      if (inv.bottlesClean < inv.bottles) add('🧼 Wash bottles', 'wash_bottles', {}, { anim: 'item', item: 'cloth', dur: dur('wash_bottles') });
    }
  }
  if (near.thermostat) add('🌡️ Thermostat', 'ui:thermostat', {}, { anim: 'none' });

  const canReach = near.baby || held;
  if (!canReach) {
    if (holding) out.push({ hint: `Carrying ${holding}. Walk over to ${b.name}.` });
    else if (!near.kitchen && !near.door) out.push({ hint: `Walk closer to ${b.name} to interact.` });
    return out;
  }
  // --- with the baby ---
  const sleeping = st.activity === 'sleeping';
  if (holding === 'bottle' || holding === 'bowl' || holding === 'spoon') {
    const food = ctx.holdingFood || 'formula';
    add(`🍼 Feed ${b.name} (${food.replace('_', ' ')})`, 'feed', { type: food }, { cls: 'primary', anim: 'item', item: holding === 'bottle' ? 'bottle' : 'spoon', dur: dur('feed'), consumes: true });
  }
  if (!held) add(sleeping ? '🤲 Pick up (may wake)' : '🤲 Pick up', 'hold', {}, { cls: st.crying ? 'primary' : '', anim: 'hold', dur: 1.2 });
  else {
    const spot = near.crib ? 'crib' : near.changing_table ? 'changing_table' : near.play_mat ? 'play_mat' : near.sofa ? 'sofa' : near.high_chair ? 'high_chair' : near.playpen ? 'playpen' : near.toddler_bed ? 'toddler_bed' : 'floor';
    const label = { crib: 'in the crib', changing_table: 'on the changing table', play_mat: 'on the play mat', sofa: 'on the sofa', high_chair: 'in the high chair', playpen: 'in the playpen', toddler_bed: 'in the toddler bed', floor: 'on the floor' }[spot];
    add(`⬇️ Put down ${label} (on back)`, 'put_down', { location: spot, position: 'back' }, { anim: 'hold', dur: dur('put_down') });
    if (spot !== 'high_chair' && days < 365 && !sleeping) add(`⬇️ Put down ${label} (tummy)`, 'put_down', { location: spot, position: 'tummy' }, { anim: 'hold', dur: dur('put_down'), cls: 'warn' });
    if ((b.milestones.sits || days > 200) && !sleeping && spot !== 'crib') add(`⬇️ Sit ${label}`, 'put_down', { location: spot, position: 'sitting' }, { anim: 'hold', dur: dur('put_down') });
    if (!sleeping) add('🫂 Rock & shush', 'rock', {}, { cls: st.crying ? 'primary' : '', anim: 'hold', dur: dur('rock') });
    add('💞 Cuddle', 'cuddle', {}, { anim: 'hold', dur: dur('cuddle') });
    if (st.needsBurp) add('🫧 Burp', 'burp', {}, { cls: 'primary', anim: 'hold', dur: dur('burp') });
    if (!sleeping && b.needs.rest < 60) add('😴 Rock to sleep', 'put_to_sleep', { location: 'held' }, { anim: 'hold', dur: dur('put_to_sleep') });
  }
  if (near.changing_table || held || near.baby) {
    add(b.needs.diaper < 60 ? '🧷 Change diaper' : '🧷 Change diaper (still clean)', 'change_diaper', { cream: b.phys.rash > 15 && inv.diaper_cream > 0 }, { cls: b.needs.diaper < 40 ? 'primary' : '', anim: 'item', item: 'diaper', dur: dur('change_diaper') });
  }
  if (near.changing_table && !sleeping) add('🛁 Bath (warm)', 'bathe', { temp: 'warm' }, { anim: 'item', item: 'cloth', dur: dur('bathe'), bath: true });
  if (near.changing_table && !sleeping) add('👕 Dress / change outfit', 'ui:wardrobe', {}, { anim: 'none' });
  if (!sleeping) {
    add('🎵 Sing', 'sing', {}, { anim: held ? 'hold' : 'none', dur: dur('sing'), look: true });
    add('👀 Watch them', 'observe', {}, { anim: 'none', dur: 3, look: true });
    add('🙈 Play together…', 'ui:play2', {}, { anim: 'none' });
    if (days >= 150) add('🗣️ Learn together…', 'ui:learn', {}, { anim: 'none' });
    if (days >= 180) add('🥑 Introduce an allergen…', 'ui:allergen', {}, { anim: 'none' });
    if (days >= 420) add('🧭 Guide behaviour…', 'ui:discipline', {}, { anim: 'none' });
    if (days >= 600) add('🧹 Chores together…', 'ui:chores', {}, { anim: 'none' });
    if (near.door && days >= 30) add('🚼 Stroller walk', 'stroller_walk', {}, { anim: 'none', dur: 25 });
    if (b.ageToys.length) add('🧸 Play', 'ui:play', {}, { anim: 'none' });
    if (inv.toys.some((t) => t.includes('book'))) add('📖 Read', 'read', {}, { anim: 'item', item: 'book', dur: dur('read'), look: true });
    if (days < 365 && !held) add('🐢 Tummy time', 'tummy_time', {}, { anim: 'none', dur: dur('tummy_time'), look: true });
    if (!held && b.needs.rest < 45) add('😴 Put to sleep (crib, on back)', 'put_to_sleep', { location: near.toddler_bed && inv.toddler_bed ? 'toddler_bed' : 'crib', position: 'back' }, { anim: 'hold', dur: dur('put_to_sleep'), disabled: !(near.crib || near.toddler_bed) });
    if (days >= 500 && inv.potty > 0 && near.potty) add('🚽 Potty time', 'potty', {}, { anim: 'none', dur: dur('potty'), look: true });
    if (b.schedule.lessons.length && days >= 180) add('🎓 Lesson', 'ui:lesson', {}, { anim: 'none' });
  }
  if (inv.pacifiers > 0 || st.pacifier) add(st.pacifier ? '🍭 Remove pacifier' : '🍭 Pacifier', 'pacifier', {}, { anim: 'item', item: 'toy', dur: dur('pacifier') });
  if (days < 90 || b.wear.swaddled) add(b.wear.swaddled ? '🧣 Unswaddle' : '🧣 Swaddle', 'swaddle', {}, { anim: 'item', item: 'cloth', dur: dur('swaddle') });
  if (inv.white_noise > 0 || st.whiteNoise) add(st.whiteNoise ? '🔇 White noise off' : '🔊 White noise', 'white_noise', {}, { anim: 'none' });
  if (inv.thermometer > 0) add('🌡️ Temperature', 'check_temp', {}, { anim: 'item', item: 'thermometer', dur: dur('check_temp') });
  add('🧺 Care…', 'ui:care', {}, { anim: 'none' });
  add('💊 Medicine…', 'ui:medicine', {}, { anim: 'none' });
  add('😤 Lose your temper…', 'ui:temper', {}, { anim: 'none', cls: 'danger' });
  return out;
}
