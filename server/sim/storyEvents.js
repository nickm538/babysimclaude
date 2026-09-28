// Story event catalog, part 1: good moments, small flavour beats and neutral social hints.
// Pure data (no imports) so the catalog can be indexed once at module load and reused forever.
// Conditions are evaluated by server/sim/story.js. Text tokens: {n} name, {they}/{They}, {their}/{Their}, {them}.
//
// Condition keys (all optional): minDays, maxDays, awake (bool), night (bool), supervised (bool),
// mobile (bool), locations[], needToys[], needMilestones[], noMilestones[], needProofing[], noProofing[],
// inventory{key:min}, minDev{domain:value}, seasons[], weather[], temperaments[], traits[], noIllness,
// minTrust, maxStress, minNeeds{key:value}, hasPackage, once (fires at most once per game).
//
// Effects: needs{}, emo{}, dev{}, health, rash, celebrate, wake, sleep, cry, milestone, memory{text,weight},
// trait (nudges a trait counter), inv{key:delta}, illness{id,severity,known}, injury{kind,dmg,severe,what},
// notify{kind,title,cta}, hint (routes the journal entry through log type 'social_hint').

export const GOOD_EVENTS = [
  {
    id: 'grips_finger', weight: 5, cooldownH: 30, sev: 'good', maxDays: 120, awake: true, supervised: true,
    text: [
      '{n} closes a whole fist around your finger and holds on, staring up at you.',
      'You offer a finger and {n} grabs it hard, tiny knuckles white, refusing to let go.',
    ],
    effects: { needs: { affection: 6 }, emo: { trust: 0.4 }, celebrate: 4, dev: { social: 0.05 } },
  },
  {
    id: 'milk_drunk', weight: 6, cooldownH: 14, sev: 'good', maxDays: 200, awake: true, supervised: true,
    minNeeds: { fullness: 70 },
    text: [
      '{n} goes soft and heavy in your arms after the feed, milk on {their} chin, eyes rolling shut — completely, blissfully full.',
      'Full to the ears, {n} lets out a long sigh and gives you a lopsided, milk-drunk almost-smile.',
    ],
    effects: { needs: { comfort: 6, affection: 4 }, emo: { happiness: 3 }, celebrate: 5 },
  },
  {
    id: 'discovers_feet', weight: 7, cooldownH: 24 * 40, once: true, sev: 'good', minDays: 70, maxDays: 260,
    awake: true, supervised: true, locations: ['play_mat', 'floor', 'crib', 'held'],
    text: [
      '{n} catches sight of {their} own feet, grabs one, and looks utterly astonished that it is attached.',
      'Both feet in both hands, rocking side to side — {n} has discovered {they} has feet, and they are the best thing in the world.',
      '{n} pulls a foot to {their} mouth, gums it thoughtfully, and beams at you like {they} invented it.',
    ],
    effects: { celebrate: 10, dev: { cognitive: 0.25, motor: 0.2 }, needs: { stimulation: 12 }, memory: { text: 'the day {they} found {their} feet', weight: 55 } },
  },
  {
    id: 'laughs_mobile', weight: 7, cooldownH: 20, sev: 'good', minDays: 50, maxDays: 220, awake: true,
    needToys: ['mobile'], locations: ['crib', 'play_mat'],
    text: [
      'The mobile turns and {n} lets out a startled, delighted shriek at it.',
      '{n} watches the mobile spin and laughs — a real, surprised laugh that surprises {them} too.',
      'Kicking hard under the mobile, {n} giggles every time the little bird comes round again.',
    ],
    effects: { celebrate: 8, needs: { stimulation: 18, comfort: 4 }, dev: { cognitive: 0.2, social: 0.15 }, trait: 'giggler' },
  },
  {
    id: 'belly_laugh', weight: 6, cooldownH: 18, sev: 'good', minDays: 110, awake: true, supervised: true,
    maxStress: 55,
    text: [
      'Something you did — you are honestly not sure what — sets {n} off into a full belly laugh that goes on and on.',
      '{n} laughs so hard {they} gets the hiccups, then laughs at the hiccups.',
      'A proper laugh from the bottom of {their} stomach, head back, all gums showing.',
    ],
    effects: { celebrate: 9, needs: { stimulation: 14, affection: 6 }, emo: { happiness: 5, stress: -6 }, dev: { social: 0.2 }, trait: 'giggler' },
  },
  {
    id: 'rolls_first', weight: 8, cooldownH: 24 * 60, once: true, sev: 'good', minDays: 95, maxDays: 300,
    awake: true, supervised: true, locations: ['play_mat', 'floor'], noMilestones: ['rolls'], minDev: { motor: 5 },
    text: [
      'You look up just in time: {n} tips onto {their} side, hesitates, and rolls all the way over — then looks stunned at the new view.',
      '{n} arches, kicks, and flips from tummy to back for the very first time, right in front of you.',
      'One good push of the arm and {n} rolls clean over, then bursts into surprised tears at {their} own achievement.',
    ],
    effects: { celebrate: 14, milestone: 'rolls', dev: { motor: 0.6 }, memory: { text: 'the first roll — and you were watching', weight: 82 } },
  },
  {
    id: 'peekaboo_alone', weight: 6, cooldownH: 30, sev: 'good', minDays: 230, awake: true,
    locations: ['play_mat', 'floor', 'crib', 'playpen'],
    text: [
      '{n} pulls a muslin over {their} face, freezes, then yanks it down and cackles at nobody in particular.',
      'Blanket up, blanket down: {n} is playing peekaboo entirely alone and finds {them}self hilarious.',
    ],
    effects: { celebrate: 7, needs: { stimulation: 16 }, dev: { cognitive: 0.35, social: 0.15 }, trait: 'giggler' },
  },
  {
    id: 'stacks_cups', weight: 6, cooldownH: 24 * 20, once: true, sev: 'good', minDays: 360, awake: true,
    needToys: ['stacking_cups'], minDev: { motor: 15 },
    text: [
      '{n} balances one cup on top of another, lets go slowly, and looks up at you for applause when it stays.',
      'Two cups, stacked, by {them}self. {n} knocks them down immediately and starts again.',
    ],
    effects: { celebrate: 10, dev: { cognitive: 0.5, motor: 0.4 }, needs: { stimulation: 14 }, memory: { text: 'stacked two cups alone for the first time', weight: 58 } },
  },
  {
    id: 'new_word', weight: 7, cooldownH: 24 * 6, sev: 'good', minDays: 330, awake: true, supervised: true,
    minDev: { language: 14 },
    text: [
      '{n} says a brand-new word, clear as day, and then says it eleven more times to make sure you heard.',
      'Out of nowhere {n} tries a word {they} has never said before — mangled, but unmistakable.',
      'A new word arrives mid-play. {n} repeats it to the wall, to a sock, and finally to you.',
    ],
    effects: { celebrate: 9, dev: { language: 0.7, social: 0.1 }, needs: { stimulation: 8 }, trait: 'chatterbox', memory: { text: 'a brand-new word, said over and over', weight: 52 } },
  },
  {
    id: 'slept_through', weight: 7, cooldownH: 20, sev: 'good', minDays: 100, awake: false, night: true,
    minNeeds: { rest: 72 },
    text: [
      '{n} has slept straight through the small hours without a sound. The house has never been so quiet.',
      'No cries, no stirring: {n} slept the whole night through for once, and so, almost, did you.',
    ],
    effects: { celebrate: 8, emo: { security: 2, stress: -4 }, needs: { comfort: 6 } },
  },
  {
    id: 'feeds_self_meal', weight: 6, cooldownH: 24 * 5, sev: 'good', minDays: 300, awake: true,
    locations: ['high_chair'], minNeeds: { fullness: 30 },
    text: [
      '{n} works through a whole meal alone — fistfuls, mostly on target — and finishes with a triumphant bang of the tray.',
      'Spoon in {their} own hand, {n} eats the entire bowl without help. Half of it even goes in {their} mouth.',
    ],
    effects: { celebrate: 8, needs: { fullness: 14, clean: -8 }, dev: { motor: 0.5, emotional: 0.2 } },
  },
  {
    id: 'puts_toy_away', weight: 5, cooldownH: 24 * 4, sev: 'good', minDays: 520, awake: true, supervised: true,
    text: [
      'Unasked, {n} carries a block to the basket, drops it in, and looks around for more.',
      '{n} tidies one toy away entirely on {their} own initiative, then stands back to admire the empty patch of floor.',
    ],
    effects: { celebrate: 8, dev: { emotional: 0.4, social: 0.3 }, emo: { happiness: 3 } },
  },
  {
    id: 'hug_spontaneous', weight: 7, cooldownH: 24 * 2, sev: 'good', minDays: 380, awake: true, supervised: true,
    minTrust: 45,
    text: [
      '{n} crosses the room for no reason at all, wraps both arms round your leg, and squeezes.',
      'Out of nowhere {n} climbs into your lap, presses {their} forehead to your chest, and stays there.',
      '{n} pats your face, says something unintelligible and fond, and hugs you until {they} gets bored.',
    ],
    effects: { celebrate: 11, needs: { affection: 22 }, emo: { trust: 0.8, happiness: 5, stress: -6 }, trait: 'cuddly' },
  },
  {
    id: 'first_scribble', weight: 6, cooldownH: 24 * 30, once: true, sev: 'good', minDays: 560, awake: true,
    needToys: ['crayons'],
    text: [
      '{n} drags a crayon across the paper, leaves one wobbling line, and stares at it like magic.',
      'A first scribble: violent, purple, and covering most of the page and part of the table.',
    ],
    effects: { celebrate: 10, dev: { motor: 0.5, cognitive: 0.3 }, memory: { text: 'the first scribble on paper', weight: 60 } },
  },
  {
    id: 'puzzle_alone', weight: 6, cooldownH: 24 * 6, sev: 'good', minDays: 720, awake: true, needToys: ['puzzle'],
    minDev: { cognitive: 30 },
    text: [
      'Every piece in the right hole, alone, without help. {n} tips the puzzle out and does it again.',
      '{n} frowns at the last puzzle piece, turns it round twice, and clicks it home. Then applauds {them}self.',
    ],
    effects: { celebrate: 9, dev: { cognitive: 0.6, motor: 0.3 }, needs: { stimulation: 16 } },
  },
  {
    id: 'mirror_baby', weight: 5, cooldownH: 26, sev: 'good', minDays: 140, maxDays: 700, awake: true,
    text: [
      '{n} finds {their} reflection and has a long, serious conversation with the other baby.',
      'Nose pressed to the mirror, {n} pats the glass and laughs at the baby who copies everything.',
    ],
    effects: { celebrate: 5, needs: { stimulation: 12 }, dev: { cognitive: 0.25, social: 0.15 } },
  },
  {
    id: 'dance_music', weight: 5, cooldownH: 24, sev: 'good', minDays: 380, awake: true,
    text: [
      'A tune starts somewhere and {n} bends {their} knees and bounces, absolutely on the beat by accident.',
      '{n} spins in a slow circle to the music, arms out, until {they} falls over laughing.',
    ],
    effects: { celebrate: 6, needs: { stimulation: 14 }, dev: { motor: 0.3, emotional: 0.2 } },
  },
  {
    id: 'shares_snack', weight: 5, cooldownH: 24 * 3, sev: 'good', minDays: 500, awake: true, supervised: true,
    text: [
      '{n} holds out a soggy half-eaten cracker to you with enormous solemnity. Refusing is not an option.',
      'Without being asked, {n} offers you the biggest piece of {their} snack.',
    ],
    effects: { celebrate: 7, dev: { social: 0.5, emotional: 0.3 }, needs: { affection: 8 } },
  },
  {
    id: 'names_you', weight: 7, cooldownH: 24 * 30, once: true, sev: 'good', minDays: 360, awake: true,
    supervised: true, minDev: { language: 16 },
    text: [
      '{n} looks straight at you and calls you by name — not babble, not an accident. You. By name.',
      'Across the room, {n} points at you and says your name, then grins as if {they} has won something.',
    ],
    effects: { celebrate: 14, emo: { trust: 1.2, happiness: 6 }, dev: { language: 0.6 }, memory: { text: 'the first time {they} called you by name', weight: 90 } },
  },
  {
    id: 'comforts_toy', weight: 5, cooldownH: 24 * 3, sev: 'good', minDays: 680, awake: true, needToys: ['dolls'],
    text: [
      '{n} tucks a doll under a muslin, pats it firmly, and shushes it exactly the way you do.',
      'A doll is being rocked, fed, burped and told off, all in a language of {n}’s own invention.',
    ],
    effects: { celebrate: 7, dev: { social: 0.5, emotional: 0.4, language: 0.2 } },
  },
  {
    id: 'sings_along', weight: 5, cooldownH: 24 * 2, sev: 'good', minDays: 560, awake: true,
    text: [
      '{n} hums back the last three notes of the song you sing, roughly in tune, and waits for you to do it again.',
      'You start a song and {n} joins in on the words {they} knows, shouting them slightly too early.',
    ],
    effects: { celebrate: 6, dev: { language: 0.4, emotional: 0.2 }, needs: { stimulation: 10 } },
  },
  {
    id: 'climbs_sofa_proud', weight: 5, cooldownH: 20, sev: 'good', minDays: 320, awake: true, mobile: true,
    text: [
      '{n} hauls {them}self onto the sofa, stands up on the cushions, and beams at you from {their} new summit.',
      'Grunting with effort, {n} climbs onto the sofa unaided and immediately looks for applause.',
    ],
    effects: { celebrate: 6, dev: { motor: 0.4 }, emo: { happiness: 3 }, trait: 'daredevil' },
  },
  {
    id: 'deep_nap', weight: 5, cooldownH: 10, sev: 'good', awake: false, minNeeds: { comfort: 55 },
    text: [
      '{n} sinks into a deep, boneless nap — arms flung out, mouth open, entirely at peace.',
      'A perfect nap: slow breathing, warm cheeks, one hand curled under {their} chin.',
    ],
    effects: { celebrate: 3, needs: { comfort: 5 }, emo: { stress: -5 } },
  },
  {
    id: 'waves_window', weight: 4, cooldownH: 24, sev: 'good', minDays: 250, awake: true,
    text: [
      'Someone walks past the window and {n} waves at them with the whole arm, delighted by the reply.',
      '{n} waves at a passing neighbour and then waves at the window for another ten minutes.',
    ],
    effects: { celebrate: 5, dev: { social: 0.35 }, needs: { stimulation: 8 } },
  },
  {
    id: 'kisses_book', weight: 4, cooldownH: 24 * 2, sev: 'good', minDays: 380, awake: true, needToys: ['board_books', 'picture_books'], anyToy: true,
    text: [
      '{n} finds {their} favourite page, kisses the picture, and closes the book with great satisfaction.',
      '{n} carries a book to you, backwards and upside down, and pats the cover until you read it.',
    ],
    effects: { celebrate: 5, dev: { language: 0.35, cognitive: 0.2 }, needs: { stimulation: 10 } },
  },
  {
    id: 'self_soothes', weight: 5, cooldownH: 24, sev: 'good', minDays: 160, awake: true, minDev: { emotional: 10 },
    text: [
      '{n} starts to grizzle, finds {their} own thumb, and settles back down without you.',
      'A wobble, a shaky breath, and then {n} calms {them}self — you can see {them} doing it.',
    ],
    effects: { celebrate: 6, dev: { emotional: 0.5 }, emo: { stress: -8 }, needs: { comfort: 8 } },
  },
];

export const INFO_EVENTS = [
  {
    id: 'hiccups', weight: 5, cooldownH: 8, sev: 'info', maxDays: 500, awake: true,
    text: ['{n} gets a fit of hiccups and looks personally offended by each one.', 'Hiccups. {n} jumps at every single one and glares at you as if you did it.'],
    effects: { needs: { comfort: -3 } },
  },
  {
    id: 'sneeze_fit', weight: 4, cooldownH: 12, sev: 'info', awake: true,
    text: ['Three enormous sneezes in a row, and {n} looks astonished at {them}self.', '{n} sneezes so hard {they} startles {them}self and needs a moment.'],
    effects: {},
  },
  {
    id: 'stares_ceiling', weight: 4, cooldownH: 10, sev: 'info', maxDays: 300, awake: true,
    text: ['{n} has found a shadow on the ceiling and is watching it with total scientific commitment.', 'Nothing exists for {n} right now except a patch of light on the ceiling.'],
    effects: { needs: { stimulation: 6 } },
  },
  {
    id: 'socks_off', weight: 4, cooldownH: 9, sev: 'info', awake: true, maxDays: 900,
    text: ['{n} has removed both socks again and hidden one of them.', 'Socks off. Somehow. Again. One is under the sofa.'],
    effects: {},
  },
  {
    id: 'birds_window', weight: 3, cooldownH: 14, sev: 'info', awake: true, night: false, minDays: 60,
    text: ['Birds are loud in the garden and {n} turns {their} head to listen to every one.', 'A bird lands on the sill; {n} goes completely still and stares.'],
    effects: { needs: { stimulation: 7 } },
  },
  {
    id: 'blows_raspberry', weight: 4, cooldownH: 11, sev: 'info', minDays: 120, maxDays: 800, awake: true,
    text: ['{n} discovers a new noise and blows raspberries at the wall for a solid five minutes.', 'Raspberries. Wet ones. Everywhere.'],
    effects: { needs: { stimulation: 8, clean: -3 }, dev: { language: 0.1 } },
  },
  {
    id: 'sleep_talk', weight: 3, cooldownH: 16, sev: 'info', minDays: 400, awake: false,
    text: ['{n} says something urgent and entirely incomprehensible in {their} sleep, then rolls over.', 'A whole sentence of sleep-babble from the cot, then silence.'],
    effects: {},
  },
  {
    id: 'growth_spurt', weight: 4, cooldownH: 24 * 10, sev: 'info', minDays: 20,
    text: ['{n} is suddenly ravenous and clingy — the trousers that fit last week are already short. A growth spurt.', 'Everything is a bit harder today: {n} wants feeding constantly and sleeping badly. Growth spurt.'],
    effects: { needs: { fullness: -14, rest: -8 } },
  },
];

// Neutral hooks other systems listen for. No effects — they only ever nudge the player.
export const SOCIAL_HINTS = [
  { id: 'hint_grandma', weight: 4, cooldownH: 24 * 3, minDays: 5, text: ['Grandma called twice today. She would love a photo of {n}.', 'Your mother has left a message: any new pictures of {n}?'] },
  { id: 'hint_photo', weight: 3, cooldownH: 24 * 4, minDays: 30, text: ['Your phone reminds you it has been a while since you took a picture of {n}.', 'Someone at the door asked how big {n} is now. You realise you have no recent photo.'] },
  { id: 'hint_playdate', weight: 4, cooldownH: 24 * 5, minDays: 240, text: ['The family two doors down have a baby about {n}’s age. They keep suggesting a playdate.', 'A neighbour mentions a toddler group on Thursdays; {n} would have someone to crawl at.'] },
  { id: 'hint_call_family', weight: 3, cooldownH: 24 * 6, minDays: 60, text: ['Three unread messages from family, all asking how {n} is doing.', 'Your sister texts: "send me a video of {them} doing the thing".'] },
  { id: 'hint_park', weight: 3, cooldownH: 24 * 3, minDays: 90, text: ['It is a beautiful afternoon. The park is five minutes away and {n} has never seen a duck.', 'The weather is perfect for a walk. {n} sleeps better on days {they} gets outside.'] },
  { id: 'hint_group', weight: 3, cooldownH: 24 * 8, minDays: 120, text: ['A leaflet comes through the door for a parent-and-baby group at the library.', 'The health visitor left a card about a local baby group. Free coffee, apparently.'] },
  { id: 'hint_share_milestone', weight: 3, cooldownH: 24 * 5, minDays: 150, text: ['You keep meaning to tell someone what {n} did this week.', 'Someone asks what {n} is up to now, and you realise how much has changed.'] },
];
