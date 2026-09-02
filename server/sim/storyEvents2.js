// Story event catalog, part 2: the things that go wrong, and the moments that ask you to decide.
// Pure data (no imports). See storyEvents.js for the condition/effect vocabulary.
// `fx` receives (game, rng, api) where api = { injure, mk, hospitalize, log, notify, addMemory, HOUR, DAY }.

export const BAD_EVENTS = [
  {
    // The one the brief demands: only reachable when the cabinet is unlocked and the baby can get there.
    id: 'rat_poison', weight: 14, cooldownH: 24 * 10, sev: 'danger', minDays: 200, mobile: true, awake: true,
    noProofing: ['cabinet_locks'], noIllness: true,
    anyOf: [{ locations: ['kitchen'] }, { supervised: false }],
    text: [
      'The cupboard under the sink is open. {n} is sitting in it with a torn blue sachet of rat poison in {their} fist and blue grains around {their} mouth.',
      'You find {n} in the cleaning cupboard, chewing. A packet of rat bait is split open on the floor and {their} tongue is stained blue.',
      '{n} got the childproof-less cabinet open, found the rat poison, and ate some of it. {They} is already unsteady and starting to retch.',
    ],
    effects: {
      illness: { id: 'poisoning', severity: 62, known: true },
      emo: { stress: 35 }, needs: { health: -6 }, cry: 'in pain',
      notify: { kind: 'danger', title: 'Poisoning — call the doctor NOW', cta: { action: 'doctor', params: { kind: 'sick' }, label: 'Sick visit' } },
      memory: { text: 'the day {they} got into the poison', weight: 96 },
    },
    fx: (game, rng, api) => {
      game.story.poisonDeadline = game.sim.time + api.HOUR * 5.5;
      game.stats.hazards = (game.stats.hazards || 0) + 1;
      void rng;
    },
  },
  {
    id: 'lamp_pull', weight: 7, cooldownH: 24 * 4, sev: 'danger', minDays: 250, mobile: true, awake: true,
    noProofing: ['cord_clips'], locations: ['floor', 'sofa', 'play_mat', 'kitchen'],
    text: [
      '{n} hauls on a lamp flex and the whole lamp comes down off the side table onto {their} shoulder.',
      'A crash: {n} pulled the standard lamp over. The bulb is broken and {they} is screaming.',
    ],
    effects: { injury: { kind: 'tipover', dmg: 16, severe: false, what: 'pulled a lamp down on top of {them}self' }, emo: { stress: 18 },
      notify: { kind: 'danger', title: 'Lamp pulled over' } },
  },
  {
    id: 'choke_object', weight: 8, cooldownH: 24 * 5, sev: 'danger', minDays: 220, awake: true,
    noProofing: ['small_objects'], noIllness: true,
    text: [
      '{n} finds a grape on the floor, swallows it whole, and goes silent and purple. Two hard back blows and it comes out.',
      'Something small and hard goes straight into {n}’s mouth. {They} gags, cannot breathe for four awful seconds, then coughs it clear.',
      'A button. {n} had a button. The silent, wide-eyed choking is far worse than any cry.',
    ],
    effects: { needs: { health: -7, comfort: -25 }, emo: { stress: 30 }, cry: 'in pain',
      notify: { kind: 'danger', title: 'Choking incident', cta: { action: 'doctor', params: { kind: 'sick' }, label: 'Sick visit' } },
      memory: { text: 'the time {they} choked and you got it out', weight: 84 } },
  },
  {
    id: 'bee_sting', weight: 5, cooldownH: 24 * 20, sev: 'warn', minDays: 150, awake: true,
    seasons: ['spring', 'summer'],
    text: [
      'A wasp got in through the open window and stung {n} on the back of the hand. The howl is instant and enormous.',
      'A bee sting on {n}’s ankle. The site swells into a hot red lump within minutes.',
    ],
    effects: { needs: { comfort: -30, health: -3 }, emo: { stress: 22 }, cry: 'in pain',
      notify: { kind: 'story', title: 'Bee sting' } },
  },
  {
    id: 'night_terror', weight: 6, cooldownH: 24 * 6, sev: 'warn', minDays: 400, awake: false, night: true,
    text: [
      '{n} sits bolt upright screaming with {their} eyes open, not awake, not seeing you. It lasts four minutes and then {they} lies down as if nothing happened.',
      'A night terror: rigid, thrashing, inconsolable, and completely asleep the whole time.',
    ],
    effects: { emo: { stress: 20 }, needs: { rest: -12, comfort: -20 }, wake: false, trait: 'sensitive_sleeper',
      notify: { kind: 'story', title: 'Night terror' } },
  },
  {
    id: 'fever_spike', weight: 7, cooldownH: 24 * 8, sev: 'warn', minDays: 70, noIllness: true, night: true,
    text: [
      'You put a hand on {n}’s back and {they} is burning. The fever came out of nowhere in the small hours.',
      '{n} wakes flushed, damp and shivering at 3am — a fever has spiked overnight.',
    ],
    effects: { illness: { id: 'fever', severity: 26, known: false }, needs: { comfort: -18, rest: -8 }, wake: true,
      notify: { kind: 'illness', title: 'Fever overnight', cta: { action: 'check_temp', params: {}, label: 'Take temperature' } } },
  },
  {
    id: 'food_allergy', weight: 6, cooldownH: 24 * 25, sev: 'danger', minDays: 160, awake: true, noIllness: true,
    inventory: { purees: 1 },
    text: [
      'Twenty minutes after a new food, {n}’s lips and cheeks bloom into raised red welts and {they} starts scratching at {their} face.',
      'Hives spread across {n}’s chest after the new jar — an allergic reaction, and {their} breathing sounds thick.',
    ],
    effects: { needs: { health: -8, comfort: -30 }, emo: { stress: 25 }, rash: 20, cry: 'in pain',
      notify: { kind: 'illness', title: 'Allergic reaction to a new food', cta: { action: 'doctor', params: { kind: 'sick' }, label: 'Sick visit' } },
      memory: { text: 'the allergic reaction to a new food', weight: 70 } },
  },
  {
    id: 'blowout', weight: 8, cooldownH: 9, sev: 'warn', maxDays: 800,
    text: [
      'A diaper blowout of genuinely impressive scale. It is up {their} back and into {their} hair.',
      '{n} has managed a blowout that has escaped the diaper entirely, the vest, and most of the changing mat.',
      'The noise was memorable. The result is worse: everything {n} is wearing needs to come off.',
    ],
    effects: { needs: { diaper: -70, clean: -18, comfort: -10 }, notify: { kind: 'story', title: 'Diaper blowout', cta: { action: 'change_diaper', params: {}, label: 'Change diaper' } } },
  },
  {
    id: 'spitup_outfit', weight: 7, cooldownH: 7, sev: 'info', maxDays: 400, awake: true,
    minNeeds: { fullness: 55 },
    text: [
      'Thirty seconds into the clean outfit, {n} brings up half the feed down the front of it.',
      'A warm, sour cascade of spit-up all over the fresh clothes and your shoulder.',
    ],
    effects: { needs: { clean: -14, fullness: -6, comfort: -4 } },
  },
  {
    id: 'porch_theft', weight: 5, cooldownH: 24 * 12, sev: 'warn', hasPackage: true,
    text: [
      'The delivery notification says the package was left at the door. There is nothing at the door.',
      'Someone has taken the box off the porch. You watch the empty step for a while, uselessly.',
    ],
    effects: { notify: { kind: 'story', title: 'Package taken from the porch' } },
    fx: (game, rng, api) => {
      const o = game.orders.find((x) => x.status === 'delivered');
      if (o) {
        o.status = 'stolen';
        game.house.doorPackages = game.house.doorPackages.filter((id) => id !== o.id);
        api.log(game, 'theft', `The delivery (${o.items.map((i) => i.label).join(', ')}) was taken off the porch before you got to it.`, 'warn');
      }
      void rng;
    },
  },
  {
    id: 'power_cut', weight: 5, cooldownH: 24 * 9, sev: 'warn',
    text: [
      'The lights go out and the heating stops with them. The house begins to cool almost at once.',
      'A power cut. No white noise, no heating, and the fridge ticking as it dies.',
    ],
    effects: { notify: { kind: 'story', title: 'Power cut', cta: { action: 'thermostat', params: {}, label: 'Thermostat' } } },
    fx: (game, rng) => {
      const drift = game.house.season === 'winter' ? -5 : game.house.season === 'summer' ? 4 : -3;
      game.house.thermostatC = Math.max(12, Math.min(30, game.house.thermostatC + drift));
      game.baby.state.whiteNoise = false;
      void rng;
    },
  },
  {
    id: 'heatwave', weight: 6, cooldownH: 24 * 8, sev: 'warn', seasons: ['summer'],
    text: [
      'The house will not cool down. {n} is sticky, red-cheeked and cross, and the nursery is well over 26°C.',
      'A heatwave day: every window open and still {n} is damp with sweat in nothing but a diaper.',
    ],
    effects: { needs: { comfort: -14 }, notify: { kind: 'story', title: 'Heatwave', cta: { action: 'thermostat', params: {}, label: 'Thermostat' } } },
    fx: (game) => { game.house.thermostatC = Math.min(30, game.house.thermostatC + 4); },
  },
  {
    id: 'cold_snap', weight: 6, cooldownH: 24 * 8, sev: 'warn', seasons: ['winter', 'autumn'],
    text: [
      'A hard frost overnight. The nursery is cold enough to see your breath and {n}’s hands are icy.',
      'A cold snap has got into the house. {n} keeps waking with cold cheeks and cold feet.',
    ],
    effects: { needs: { comfort: -12 }, notify: { kind: 'story', title: 'Cold snap', cta: { action: 'thermostat', params: {}, label: 'Thermostat' } } },
    fx: (game) => { game.house.thermostatC = Math.max(12, game.house.thermostatC - 4); },
  },
  {
    id: 'dog_bark', weight: 7, cooldownH: 16, sev: 'warn', awake: false,
    text: [
      'A dog starts barking two gardens over and does not stop. {n} wakes with a jolt and a wail.',
      'Next door’s dog goes off at something in the dark. {n} is awake and furious about it.',
    ],
    effects: { wake: true, needs: { rest: -6 }, emo: { stress: 8 }, trait: 'sensitive_sleeper' },
  },
  {
    id: 'detergent_rash', weight: 5, cooldownH: 24 * 15, sev: 'warn', minDays: 20,
    text: [
      'A red, bumpy rash has come up everywhere the new detergent touched {n}’s skin — under the arms, round the neck.',
      '{n}’s skin has reacted to something in the wash: dry, angry patches wherever the seams sit.',
    ],
    effects: { rash: 18, needs: { comfort: -14 }, notify: { kind: 'illness', title: 'Rash from a new detergent' } },
  },
  {
    id: 'head_bump_table', weight: 7, cooldownH: 20, sev: 'warn', minDays: 250, mobile: true, awake: true,
    noProofing: ['corner_guards'],
    text: [
      '{n} stands up straight into the corner of the coffee table. The bump comes up blue almost immediately.',
      'A dull thunk and a two-second silence before the scream: {n} caught {their} forehead on the table edge.',
    ],
    effects: { injury: { kind: 'head_bump', dmg: 6, severe: false, what: 'banged {their} head on the table corner' } },
  },
  {
    id: 'finger_pinch', weight: 6, cooldownH: 22, sev: 'warn', minDays: 300, mobile: true, awake: true,
    text: [
      '{n} shuts a drawer on {their} own fingers and the noise {they} makes is one you will hear in your sleep.',
      'Fingers in the hinge of the cupboard door. {n} screams until {their} face goes purple.',
    ],
    effects: { needs: { comfort: -22, health: -2 }, emo: { stress: 16 }, cry: 'in pain' },
  },
  {
    id: 'bath_slip', weight: 5, cooldownH: 24 * 3, sev: 'warn', minDays: 150, locations: ['bath'], awake: true,
    text: [
      '{n} slips sideways in the bath and gets a mouthful of water before you catch {them}. Coughing, spluttering, terrified.',
      'One slippery moment in the bath and {n} goes under for a second. You have {them} out instantly, but {they} is shaking.',
    ],
    effects: { needs: { comfort: -25 }, emo: { stress: 24, security: -3 }, cry: 'scared',
      notify: { kind: 'danger', title: 'Slipped under in the bath' } },
  },
  {
    id: 'stuck_under_sofa', weight: 5, cooldownH: 24 * 2, sev: 'warn', minDays: 230, mobile: true, awake: true,
    text: [
      '{n} has wedged {them}self half under the sofa going after something and cannot reverse out.',
      'Stuck. {n} crawled under the sofa and is now shouting about it, unable to work out the way back.',
    ],
    effects: { needs: { comfort: -12 }, emo: { stress: 10 } },
  },
  {
    id: 'tantrum_floor', weight: 8, cooldownH: 14, sev: 'warn', minDays: 430, awake: true,
    text: [
      'Over nothing at all — the wrong cup — {n} goes rigid, then boneless, and screams face-down on the floor.',
      'A full meltdown: {n} is on {their} back on the kitchen floor, kicking, purple, unreachable.',
      'The banana broke in half. {n} has never known grief like it.',
    ],
    effects: { emo: { stress: 18 }, needs: { comfort: -18 }, cry: 'scared', dev: { emotional: 0.1 },
      notify: { kind: 'story', title: 'Meltdown' } },
  },
  {
    id: 'stair_climb', weight: 8, cooldownH: 24 * 2, sev: 'danger', minDays: 260, mobile: true, awake: true,
    noProofing: ['stair_gate'],
    text: [
      'You turn around and {n} is four steps up the stairs, wobbling, with nothing behind {them} but a drop.',
      '{n} has got onto the stairs again and is climbing with terrible confidence and no plan for coming down.',
    ],
    effects: { emo: { stress: 8 }, trait: 'daredevil',
      notify: { kind: 'danger', title: 'On the stairs with no gate' } },
    fx: (game) => { game.baby.state.location = 'stairs'; },
  },
  {
    id: 'storm_wakes', weight: 5, cooldownH: 24 * 4, sev: 'warn', weather: ['storm'], awake: false,
    text: [
      'Thunder cracks right over the house and {n} is awake and screaming before the sound has finished.',
      'A storm rattles the windows. {n} wakes terrified and will not settle in the dark.',
    ],
    effects: { wake: true, emo: { stress: 16 }, needs: { rest: -8 }, cry: 'scared' },
  },
  {
    id: 'mosquito_night', weight: 4, cooldownH: 24 * 10, sev: 'info', seasons: ['summer'], awake: false,
    text: ['Mosquito bites all over {n}’s arms in the morning — the window was open all night.', 'Something bit {n} in the night; there are four itchy welts along {their} shin.'],
    effects: { needs: { comfort: -10 }, rash: 6 },
  },
  {
    id: 'lost_pacifier', weight: 5, cooldownH: 20, sev: 'info', maxDays: 900, inventory: { pacifiers: 1 },
    text: ['The pacifier has gone. It is under the crib, at the exact point where an adult arm stops reaching.', '{n}’s pacifier has vanished again mid-cry. It always vanishes mid-cry.'],
    effects: { needs: { comfort: -8 } },
    fx: (game) => { game.baby.state.pacifier = false; },
  },
  {
    id: 'refuses_bottle', weight: 6, cooldownH: 18, sev: 'warn', minDays: 90, maxDays: 700, awake: true,
    text: ['{n} turns {their} head away from the bottle, arches {their} back, and will not take a drop of it.', 'Bottle refused, loudly, three times running. {n} is hungry and still saying no.'],
    effects: { needs: { fullness: -6 }, emo: { stress: 8 }, trait: 'picky_eater' },
  },
  {
    id: 'teething_night', weight: 7, cooldownH: 24 * 3, sev: 'warn', minDays: 130, awake: false, night: true,
    text: ['A tooth is coming through and {n} is awake every forty minutes, chewing {their} own fist and howling.', 'Teething pain has ruined the night. {n}’s cheek is scarlet and {their} gums are swollen.'],
    effects: { wake: true, needs: { comfort: -20, rest: -10 }, emo: { stress: 12 }, cry: 'in pain' },
    fx: (game, rng, api) => { game.baby.state.teething = 1; game.baby.state.teethingUntil = game.sim.time + 2 * api.DAY; void rng; },
  },
  {
    id: 'sunburn', weight: 4, cooldownH: 24 * 20, sev: 'warn', seasons: ['summer'], minDays: 60, awake: true,
    text: ['A short time by the window in the afternoon sun and {n}’s cheeks and forearms have gone pink and hot.', '{n} has caught the sun through the glass — nothing serious, but sore and cross with it.'],
    effects: { needs: { comfort: -12 }, rash: 8 },
  },
  {
    id: 'cat_scratch', weight: 4, cooldownH: 24 * 14, sev: 'warn', minDays: 300, mobile: true, awake: true,
    text: ['{n} grabbed a fistful of next door’s cat and now has three neat red lines down {their} forearm.', 'The cat had enough. {n} has a scratch across the back of {their} hand and a very shocked expression.'],
    effects: { injury: { kind: 'scratch', dmg: 4, severe: false, what: 'was scratched by the neighbour’s cat' } },
  },
  {
    id: 'sleep_regression', weight: 5, cooldownH: 24 * 20, sev: 'warn', minDays: 100,
    text: ['Everything that worked last week has stopped working. {n} fights every nap and wakes hourly all night.', 'A sleep regression has arrived. {n} is overtired, furious, and impossible to settle.'],
    effects: { needs: { rest: -14 }, emo: { stress: 10 }, trait: 'sensitive_sleeper',
      notify: { kind: 'story', title: 'Sleep regression' } },
  },
];

export const CHOICE_EVENTS = [
  {
    id: 'dog_bowl', weight: 9, cooldownH: 24 * 3, sev: 'warn', minDays: 240, mobile: true, awake: true, supervised: true,
    text: ['{n} has crawled to the dog bowl by the back door and has one hand in the water.'],
    choice: {
      title: 'The dog bowl',
      text: '{n} is reaching for the dog bowl of water, watching your face the whole time. What do you do?',
      deadlineH: 0.75, defaultOption: 'let',
      options: [
        { id: 'grab', label: 'Grab {them} away', hint: 'Safe and instant — and {they} will be furious about it' },
        { id: 'let', label: 'Let {them} explore', hint: 'Wet, filthy, and not clean water' },
        { id: 'toy', label: 'Distract with a toy', hint: 'Slower, but nobody has to lose' },
      ],
      outcomes: {
        grab: { sev: 'info', text: 'You scoop {n} up mid-reach. {They} screams with outrage for a full minute, then forgets it entirely.',
          effects: { emo: { stress: 10 }, needs: { comfort: -8 }, cry: 'scared' } },
        let: { sev: 'warn', text: '{n} gets both hands in, then {their} face, then most of the floor. Some of it goes in {their} mouth.',
          effects: { needs: { clean: -20, health: -2 }, emo: { happiness: 3 }, dev: { cognitive: 0.15 }, trait: 'explorer' } },
        toy: { sev: 'good', text: 'You rattle a toy from the other side of the room and {n} abandons the bowl instantly for the better offer.',
          effects: { needs: { stimulation: 12 }, dev: { emotional: 0.3, cognitive: 0.2 }, celebrate: 5 } },
      },
    },
  },
  {
    id: 'spoon_thrown', weight: 9, cooldownH: 24 * 2, sev: 'warn', minDays: 330, awake: true, supervised: true,
    locations: ['high_chair'],
    text: ['{n} clamps {their} mouth shut, takes the spoon out of your hand, and throws it across the kitchen.'],
    choice: {
      title: 'The spoon on the floor',
      text: '{n} refuses the spoon and has thrown it. {They} is watching to see what happens next.',
      deadlineH: 0.5, defaultOption: 'give_up',
      options: [
        { id: 'patient', label: 'Stay patient — offer it again', hint: 'Costs you time and calm' },
        { id: 'give_up', label: 'Give up on the meal', hint: '{They} stays hungry' },
        { id: 'firm', label: 'Be firm about finishing', hint: 'A battle you may not win' },
      ],
      outcomes: {
        patient: { sev: 'good', text: 'You pick the spoon up, say nothing about it, and offer again. On the fourth try {n} eats.',
          effects: { needs: { fullness: 22 }, emo: { trust: 0.5, stress: -4 }, dev: { emotional: 0.35 }, celebrate: 4 } },
        give_up: { sev: 'warn', text: 'You take the bowl away. {n} is hungry an hour later and lets everyone know.',
          effects: { needs: { fullness: -4 }, trait: 'picky_eater' } },
        firm: { sev: 'warn', text: 'You hold the line. {n} eats three spoonfuls under protest and the whole meal becomes a fight.',
          effects: { needs: { fullness: 10 }, emo: { stress: 14, trust: -0.4 }, cry: 'scared' } },
      },
    },
  },
  {
    id: 'toddler_bites', weight: 8, cooldownH: 24 * 3, sev: 'warn', minDays: 420, awake: true, supervised: true,
    text: ['{n} leans in as if for a cuddle and bites down hard on your forearm.'],
    choice: {
      title: '{n} bit you',
      text: 'It hurts, and there are teeth marks. {n} is watching your face very carefully.',
      deadlineH: 0.4, defaultOption: 'ignore',
      options: [
        { id: 'calm_no', label: 'Calm, firm "no biting"', hint: 'Boring, and it works' },
        { id: 'yell', label: 'Yell at {them}', hint: 'You are allowed to be angry. {They} will remember it.' },
        { id: 'ignore', label: 'Say nothing and move away', hint: 'No lesson either way' },
      ],
      outcomes: {
        calm_no: { sev: 'good', text: 'You put {them} down, level and unexcited: "No biting. Biting hurts." {n} looks disappointed by how boring that was.',
          effects: { dev: { emotional: 0.5, social: 0.3 }, emo: { trust: 0.4 }, celebrate: 4 } },
        yell: { sev: 'danger', temper: 'yell', text: 'It comes out louder than you meant.' },
        ignore: { sev: 'info', text: 'You move {them} off your lap without a word. {n} tries it again ten minutes later to see if the answer has changed.',
          effects: { dev: { emotional: 0.05 } } },
      },
    },
  },
  {
    id: 'neighbor_casserole', weight: 7, cooldownH: 24 * 12, sev: 'info', minDays: 3,
    text: ['The doorbell goes. It is the neighbour, holding a covered dish and looking hopeful.'],
    choice: {
      title: 'A neighbour at the door',
      text: 'A neighbour has knocked with a casserole and clearly wants to meet {n}. You have not brushed your hair in two days.',
      deadlineH: 1, defaultOption: 'decline',
      options: [
        { id: 'invite', label: 'Invite them in', hint: 'Company, food, and a stranger for {n}' },
        { id: 'decline', label: 'Thank them at the door', hint: 'Quiet, safe, a little lonelier' },
      ],
      outcomes: {
        invite: { sev: 'good', text: 'They stay an hour, hold {n} while you eat something hot for the first time in days, and leave the dish.',
          effects: { needs: { stimulation: 14, affection: 6 }, dev: { social: 0.5 }, emo: { stress: -6 }, celebrate: 7, parentEnergy: 12,
            memory: { text: 'the neighbour who brought food when you were sinking', weight: 62 } },
          strangerWary: true },
        decline: { sev: 'info', text: 'You take the dish at the door, say thank you twice, and close it. The house is very quiet afterwards.',
          effects: { emo: { stress: 2 }, parentEnergy: 4 } },
      },
    },
  },
  {
    id: 'park_walk', weight: 6, cooldownH: 24 * 4, sev: 'info', minDays: 60, awake: true, supervised: true, night: false,
    seasons: ['spring', 'summer', 'autumn'],
    text: ['The afternoon is unexpectedly beautiful and the pram is by the door.'],
    choice: {
      title: 'Out, or stay in?',
      text: 'It is a good afternoon and {n} has not been outside in a while. Going out means the whole production: bag, bottle, spare clothes.',
      deadlineH: 1.5, defaultOption: 'stay',
      options: [
        { id: 'go', label: 'Go out for a walk', hint: 'Fresh air, sleep, and effort' },
        { id: 'stay', label: 'Stay in', hint: 'Easier. Nothing changes.' },
      ],
      outcomes: {
        go: { sev: 'good', text: 'Ducks, dogs, wind in {their} face. {n} is asleep before you reach the corner on the way back.',
          effects: { needs: { stimulation: 22, rest: 10, comfort: 6 }, dev: { social: 0.3, cognitive: 0.3 }, emo: { stress: -8 }, celebrate: 8, parentEnergy: -8 } },
        stay: { sev: 'info', text: 'You stay in. It gets dark early and the walls feel closer than they did this morning.',
          effects: { emo: { stress: 3 }, needs: { stimulation: -4 } } },
      },
    },
  },
  {
    id: 'stranger_coos', weight: 6, cooldownH: 24 * 6, sev: 'info', minDays: 200, awake: true, supervised: true,
    text: ['Someone leans right into the pram to coo at {n} without asking.'],
    choice: {
      title: 'A stranger reaches in',
      text: 'A friendly stranger has their hands out for {n}, who has gone very still and is gripping your sleeve.',
      deadlineH: 0.5, defaultOption: 'hand_over',
      options: [
        { id: 'shield', label: 'Turn {them} away from the stranger', hint: 'Respect the wariness' },
        { id: 'hand_over', label: 'Let them hold {n}', hint: '{They} may not forgive you quickly' },
      ],
      outcomes: {
        shield: { sev: 'good', text: 'You angle {n} into your shoulder and make polite noises. {They} relaxes against you the moment the stranger steps back.',
          effects: { emo: { trust: 0.6, security: 2, stress: -5 }, dev: { emotional: 0.25 }, celebrate: 4 } },
        hand_over: { sev: 'warn', text: '{n} goes rigid, then wails, and does not stop until {they} is back in your arms.',
          effects: { emo: { stress: 18, security: -2 }, needs: { comfort: -12 }, cry: 'scared', trait: 'wary' } },
      },
    },
  },
];
