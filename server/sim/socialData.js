// Static data for the social/family system: who exists, what they say, what they bring and what they tell you to do.
// Pure data + tiny helpers. Text uses tokens filled in by social.js: {baby} {he} {him} {his} {He} {me} {parent}.

export const RELATIONS = {
  grandma: { label: 'Grandma', family: true, calming: true },
  grandpa: { label: 'Grandpa', family: true, calming: true },
  aunt: { label: 'Aunt', family: true },
  uncle: { label: 'Uncle', family: true },
  best_friend: { label: 'Best friend' },
  neighbor: { label: 'Neighbor' },
  nurse: { label: 'Pediatric nurse' },
  coworker: { label: 'Coworker' },
  playgroup_parent: { label: 'Playgroup parent' },
};

export const PERSONALITIES = {
  warm: { label: 'warm', relief: 1.25, adviceBias: 0.12, huffy: 0.3 },
  anxious: { label: 'anxious', relief: 0.6, adviceBias: -0.12, huffy: 0.8 },
  blunt: { label: 'blunt', relief: 0.85, adviceBias: 0.06, huffy: 1.2 },
  fun: { label: 'fun', relief: 1.15, adviceBias: -0.06, huffy: 0.4 },
  old_school: { label: 'old-school', relief: 0.9, adviceBias: -0.5, huffy: 1.0 },
};

// core: always generated. The rest fill out a cast of 7–9.
export const CONTACT_TEMPLATES = [
  { relation: 'grandma', core: true, names: ['Rosa', 'Nana June', 'Marta', 'Gigi', 'Ellen', 'Bibi'], personalities: ['old_school', 'warm', 'warm'],
    skills: { babysitting: [0.72, 0.95], cooking: [0.8, 1], advice: [0.3, 0.7] }, distance: [8, 40], days: [0, 1, 2, 3, 4, 5, 6], hours: [8, 21], initiative: 2.2, warmth: [70, 86] },
  { relation: 'grandpa', core: true, names: ['Bill', 'Papa Sam', 'Hank', 'Nonno Vito', 'Ray', 'Dede'], personalities: ['old_school', 'fun', 'blunt'],
    skills: { babysitting: [0.5, 0.82], cooking: [0.3, 0.75], advice: [0.3, 0.65] }, distance: [8, 40], days: [0, 1, 2, 3, 4, 5, 6], hours: [8, 20], initiative: 1.5, warmth: [64, 82] },
  { relation: 'best_friend', core: true, names: ['Priya', 'Dani', 'Maya', 'Tomas', 'Noor', 'Kellan'], personalities: ['warm', 'fun', 'blunt'],
    skills: { babysitting: [0.45, 0.8], cooking: [0.3, 0.8], advice: [0.5, 0.8] }, distance: [15, 55], days: [0, 5, 6, 3], hours: [10, 23], initiative: 1.3, warmth: [60, 80] },
  { relation: 'nurse', core: true, names: ['Nurse Adeyemi', 'Nurse Kowalski', 'Nurse Petra', 'Nurse Idris', 'Nurse Halloran'], personalities: ['blunt', 'warm'],
    skills: { babysitting: [0.6, 0.85], cooking: [0.2, 0.6], advice: [0.9, 1] }, distance: [25, 70], days: [1, 2, 3, 4, 5], hours: [9, 17], initiative: 0.7, warmth: [42, 58] },
  { relation: 'aunt', names: ['Val', 'Auntie Bea', 'Nadia', 'Cleo', 'Simone'], personalities: ['fun', 'blunt', 'warm'],
    skills: { babysitting: [0.4, 0.8], cooking: [0.4, 0.9], advice: [0.4, 0.75] }, distance: [20, 70], days: [0, 4, 5, 6], hours: [10, 22], initiative: 1.1, warmth: [56, 76] },
  { relation: 'uncle', names: ['Marco', 'Uncle Dev', 'Jonah', 'Otis', 'Bram'], personalities: ['fun', 'blunt'],
    skills: { babysitting: [0.25, 0.65], cooking: [0.2, 0.7], advice: [0.3, 0.6] }, distance: [20, 80], days: [0, 5, 6], hours: [11, 22], initiative: 0.8, warmth: [50, 70] },
  { relation: 'neighbor', names: ['Mrs. Okafor', 'Yusuf next door', 'Deb from 4B', 'Old Mr. Linden', 'Ines downstairs'], personalities: ['blunt', 'warm', 'anxious', 'old_school'],
    skills: { babysitting: [0.3, 0.7], cooking: [0.4, 0.95], advice: [0.35, 0.7] }, distance: [1, 5], days: [0, 1, 2, 3, 4, 5, 6], hours: [8, 20], initiative: 1.0, warmth: [35, 55] },
  { relation: 'coworker', names: ['Sunil', 'Bea from work', 'Karsten', 'Lin', 'Aggie'], personalities: ['anxious', 'fun', 'blunt'],
    skills: { babysitting: [0.15, 0.5], cooking: [0.2, 0.6], advice: [0.35, 0.65] }, distance: [30, 90], days: [1, 2, 3, 4, 5], hours: [12, 21], initiative: 0.6, warmth: [28, 46] },
  { relation: 'playgroup_parent', names: ['Hana (Rui’s mum)', 'Greg (Otto’s dad)', 'Beth (twins)', 'Amara (Zuzu’s mum)', 'Pip (Sol’s dad)'], personalities: ['warm', 'anxious', 'fun'],
    skills: { babysitting: [0.35, 0.75], cooking: [0.3, 0.7], advice: [0.45, 0.75] }, distance: [10, 40], days: [1, 2, 3, 4, 5, 6], hours: [9, 19], initiative: 0.9, warmth: [30, 50] },
];

// --- dialogue: each entry is one short exchange (2–3 lines) ---
export const CALL = {
  warm: [
    ['{me}: "There you are. How are you holding up — really?"', 'You: "Tired. The good kind, mostly."', '{me}: "That’s the whole job right now. You’re doing it."'],
    ['{me}: "I’m not calling to ask for anything. Just wanted to hear your voice."', 'You: "It’s been a long night."', '{me}: "Then put the phone on the pillow and let me talk while {baby} sleeps."'],
  ],
  anxious: [
    ['{me}: "Is {baby} okay? I had a feeling."', 'You: "{He}’s fine. Asleep."', '{me}: "Okay. Okay. Send me a photo later so I can breathe."'],
    ['{me}: "Sorry, quick question — is that cough normal? I read a thing."', 'You: "There’s no cough."', '{me}: "Right. Good. Ignore me. I love you both."'],
  ],
  blunt: [
    ['{me}: "You sound wrecked."', 'You: "Thanks."', '{me}: "I’m not being mean. Eat something and sit down for ten minutes."'],
    ['{me}: "How’s the baby. How are you. In that order, because you’ll lie about the second one."', 'You: "Both alive."', '{me}: "Good enough. Call me when it isn’t."'],
  ],
  fun: [
    ['{me}: "Put {baby} on. I want to do the voice."', 'You: "{He}’s three months old."', '{me}: "And already my favourite audience."'],
    ['{me}: "Rate the night out of ten."', 'You: "Four."', '{me}: "Four! We can work with four. I’m bringing snacks."'],
  ],
  old_school: [
    ['{me}: "We never had half this equipment and you all turned out fine."', 'You: "Mostly."', '{me}: "Mostly is what parenting gets you. Now, listen —"'],
    ['{me}: "Is {baby} sleeping through yet?"', 'You: "{He}’s a newborn."', '{me}: "In my day they slept through at six weeks. Anyway —"'],
  ],
};

export const VIDEO = {
  newborn: [
    ['{me}: "Oh — oh, look at that face. Tip the phone down a bit."', 'You: "{He} can’t really see you yet."', '{me}: "{He} can hear me. That’s enough. Hello, tiny person."'],
    ['{me}: "Those eyebrows are your father’s, no argument."', 'You: "It’s mostly squinting."', '{me}: "It’s heritage. Hold {him} up again."'],
  ],
  infant: [
    ['{me}: "{He} looked at me! Did you see that, {He} looked right at the screen."', 'You: "{He} likes faces."', '{me}: "{He} likes MY face. Say hi. Hiiiii."'],
    ['{me}: "Do the thing. Do the raspberry."', 'You: "{He} does it back now."', '{me}: "Pffffft. — Did you hear that? We’re having a conversation."'],
  ],
  toddler: [
    ['{me}: "Who’s that? Who is THAT?"', 'You: "Say hello."', '{me}: "Was that a hello? That was a hello. I’m going to be thinking about that all week."'],
    ['{me}: "Show me the toy. The one with the — yes! That one!"', 'You: "{He} carries it everywhere."', '{me}: "Quite right. Everyone needs a thing."'],
  ],
  preschooler: [
    ['{me}: "Tell me everything. Start at the beginning."', 'You: "{He} has a lot of beginning."', '{me}: "I’ve got nowhere to be. Go on, love."'],
    ['{me}: "You did WHAT at the park?"', 'You: "Ask about the worm."', '{me}: "Tell me about the worm. Every detail."'],
  ],
};

export const MILESTONE_DELIGHT = [
  '{me}: "Wait — {baby} did what? Say it again. I’m telling everyone."',
  '{me} goes quiet for a second, then: "I wish I could be there for that one."',
  '{me}: "That’s my {baby}. Write the date down, you’ll forget it otherwise."',
  '{me}: "Do it again while I’m watching! Please, one more time."',
];

export const PHOTO_REPLIES = {
  warm: ['{me}: "Saved it. That’s my lock screen now."', '{me}: "Look at those cheeks. Thank you for this."'],
  anxious: ['{me}: "Beautiful. Is that a rash on {his} chin or the light?"', '{me}: "Perfect. Sleeping on {his} back, good, good."'],
  blunt: ['{me}: "Nice. Now go lie down."', '{me}: "Good photo. You look like you haven’t eaten. Have you eaten?"'],
  fun: ['{me}: "Absolute unit. Ten out of ten."', '{me}: "I’ve added a hat to it and sent it to seven people."'],
  old_school: ['{me}: "Spitting image of you at that age. I’ll dig out the album."', '{me}: "Print these. Screens disappear, paper doesn’t."'],
};

export const ARRIVE = {
  warm: ['{me} is at the door with both arms out. "Go and sit down. I’ve got {him}."'],
  anxious: ['{me} arrives, shoes off, hands washed twice. "Am I too early? I can wait in the car."'],
  blunt: ['{me} walks in, looks around, and starts stacking the dishes. "You look terrible. Sit."'],
  fun: ['{me} arrives loudly. "Where is the small one? I have brought CHAOS."'],
  old_school: ['{me} arrives and immediately checks whether {baby} is warm enough. "Where’s {his} hat?"'],
};

export const DEPART = {
  warm: ['{me} kisses {baby}’s head and slips out. "Call me at 3am if you need to. I mean it."'],
  anxious: ['{me} leaves, then texts from the car: "Locked the gate. Is {he} okay? Okay. Love you."'],
  blunt: ['{me} leaves with your bins taken out and no comment about it.'],
  fun: ['{me} leaves mid-song, promising to teach {baby} the rude version when {he}’s older.'],
  old_school: ['{me} leaves with three pieces of advice, two of them wrong, and a lot of love.'],
};

export const VISIT_ACTIVITIES = [
  'holding {baby}', 'making tea in your kitchen', 'folding a mountain of laundry', 'telling the story about you as a baby',
  'rocking {baby} by the window', 'washing bottles without being asked', 'reading a board book out loud',
  'dozing on the sofa with {baby} on {his} chest', 'taking photographs of everything', 'pacing the hall with {baby}',
];

export const INCOMING = {
  call: ['{me} is calling.', '{me} rang twice and left a voicemail.', 'Missed call from {me}.'],
  visit_offer: [
    '{me}: "I’m nearby. Want me to come and hold {baby} for an hour?"',
    '{me}: "Say the word and I’ll be over. I’ll bring food."',
    '{me}: "I can come and sit with {baby} while you shower and eat something hot."',
  ],
  gift: [
    '{me}: "I’ve got a bag of things for {baby}. Can I send it over?"',
    '{me} found something in a shop window and cannot be talked out of it.',
    '{me}: "Don’t argue. It’s already wrapped."',
  ],
  advice: ['{me} has thoughts about {baby}’s sleep.', '{me}: "Can I say one thing? Just one."', '{me} wants to tell you how it was done in their day.'],
};

export const PLAYGROUP_MOMENTS = [
  '{baby} spent the whole session studying one other baby’s face like a difficult book.',
  'A bigger toddler took {baby}’s toy. {baby} watched it go, then found a better one.',
  '{baby} sat in the middle of the mat and got sung to by six strangers.',
  'Someone else’s toddler shared a rice cake with {baby}. Unprompted. The parents nearly cried.',
  '{baby} crawled after the group and joined the circle without looking back at you.',
  '{baby} fell asleep on the way home, sticky and content.',
];

// Gifts a visitor can bring. `kind` is applied by social.js.
export const GIFTS = [
  { id: 'clothes', kind: 'clothes', qty: 3, w: 3, label: 'a bag of clothes in the next size up' },
  { id: 'diapers', kind: 'diapers', qty: 40, w: 2, label: 'a box of diapers' },
  { id: 'wipes', kind: 'stock', key: 'wipes', qty: 120, w: 2, label: 'an enormous pack of wipes' },
  { id: 'toy', kind: 'toy', w: 3, label: 'a toy' },
  { id: 'books', kind: 'toy', toy: 'board_books', w: 1, label: 'board books' },
  { id: 'formula', kind: 'stock', key: 'formula', qty: 24, w: 2, maxDays: 400, label: 'tins of formula' },
  { id: 'purees', kind: 'stock', key: 'purees', qty: 12, w: 2, minDays: 150, label: 'a crate of purees' },
  { id: 'meals', kind: 'stock', key: 'toddler_meals', qty: 12, w: 2, minDays: 360, label: 'a freezer’s worth of toddler meals' },
  { id: 'snacks', kind: 'stock', key: 'snacks', qty: 12, w: 1, minDays: 300, label: 'snacks for the nappy bag' },
  { id: 'casserole', kind: 'casserole', w: 3, cook: true, label: 'a casserole big enough for three days' },
  { id: 'cream', kind: 'stock', key: 'diaper_cream', qty: 10, w: 1, label: 'nappy cream' },
  { id: 'swaddle', kind: 'stock', key: 'swaddle', qty: 2, w: 1, maxDays: 90, label: 'hand-sewn swaddles' },
];

// Advice. Unsafe lines are the ones real families really say. The player has to judge.
export const ADVICE = [
  { id: 'cereal_bottle', safe: false, maxDays: 400, text: 'Put a spoonful of rice cereal in the night bottle — {baby} will sleep right through.',
    truth: 'Cereal in a bottle is a choking and overfeeding risk, and it does not improve sleep.', effect: { comfort: -12, health: -2, stress: 8 } },
  { id: 'tummy_sleep', safe: false, maxDays: 365, text: 'Babies sleep so much better on their tummies. You all did, and you’re fine.',
    truth: 'Back to sleep, every sleep. Tummy sleeping is the single biggest SIDS risk.', effect: { comfort: -6, stress: 10, risky: 'sleep' } },
  { id: 'whiskey_gums', safe: false, minDays: 120, text: 'A drop of whiskey on the gums for teething. Works every time.',
    truth: 'Alcohol is dangerous for infants at any dose. Cold teether, clean finger, or ask the doctor.', effect: { health: -4, comfort: -8, stress: 10 } },
  { id: 'water_early', safe: false, maxDays: 180, text: 'It’s warm out — give {baby} a bottle of water to top {him} up.',
    truth: 'Water before six months can cause dangerous salt imbalance and displaces milk.', effect: { health: -3, comfort: -6 } },
  { id: 'honey_dummy', safe: false, maxDays: 365, text: 'Honey on the dummy settles a cough beautifully.',
    truth: 'No honey before twelve months — infant botulism.', effect: { health: -4, stress: 6 } },
  { id: 'cry_it_out_newborn', safe: false, maxDays: 150, text: 'You’re holding {him} too much. You’ll spoil {him}. Let {him} cry a while.',
    truth: 'You cannot spoil a newborn. Responding is how trust is built.', effect: { stress: 12, trust: -1.5 } },
  { id: 'crib_bumpers', safe: false, maxDays: 365, text: 'That crib looks bare. Put a bumper and a nice blanket in there.',
    truth: 'A bare crib is the safe crib. Soft bedding is a suffocation risk.', effect: { comfort: -4, stress: 6, risky: 'sleep' } },
  { id: 'solids_early', safe: false, maxDays: 110, text: '{He}’s a big one — start {him} on solids now, don’t wait.',
    truth: 'Solids belong at around six months, when the baby can sit and hold their head steady.', effect: { comfort: -10, health: -2 } },
  { id: 'walker', safe: false, minDays: 200, maxDays: 500, text: 'Get a walker, it’ll have {him} walking months earlier.',
    truth: 'Walkers delay walking and cause the worst stair injuries in infancy.', effect: { health: -2, stress: 4 } },
  { id: 'sleep_back', safe: true, maxDays: 400, text: 'Back to sleep, every sleep. Bare crib, no blankets, no bumpers, feet to the foot of the cot.',
    effect: { parentStress: -5, dev: { emotional: 0.04 } } },
  { id: 'feed_on_demand', safe: true, maxDays: 200, text: 'Feed on demand. A newborn stomach is the size of a marble — the clock is not the boss.',
    effect: { parentStress: -6 } },
  { id: 'tummy_time', safe: true, minDays: 14, maxDays: 400, text: 'Tummy time while {he}’s awake and you’re watching. A few minutes, a few times a day, that’s all.',
    effect: { parentStress: -4, dev: { motor: 0.05 } } },
  { id: 'no_spoiling', safe: true, maxDays: 250, text: 'You cannot spoil a newborn. Every time you answer {him}, {he} learns the world comes when {he} calls.',
    effect: { parentStress: -6, trust: 0.5 } },
  { id: 'fever_call', safe: true, maxDays: 120, text: 'Any fever under three months is a phone call, not a wait-and-see. Ring them, day or night.',
    effect: { parentStress: -3 } },
  { id: 'narrate', safe: true, minDays: 30, text: 'Talk to {him} all day long. Narrate the washing-up. That’s how language gets in.',
    effect: { parentStress: -3, dev: { language: 0.05 } } },
  { id: 'sleep_when', safe: true, text: 'Sleep when {baby} sleeps. Let the dishes rot. I mean it — leave them.',
    effect: { parentStress: -9, parentEnergy: 5 } },
  { id: 'one_new_food', safe: true, minDays: 170, text: 'One new food at a time, a few days apart, so you can spot a reaction.',
    effect: { parentStress: -3 } },
  { id: 'sixmo_water', safe: true, minDays: 150, text: 'Sips of water in an open cup from about six months. Not before, and not instead of milk.',
    effect: { parentStress: -2 } },
];

export const ADVICE_INDEX = Object.fromEntries(ADVICE.map((a) => [a.id, a]));
