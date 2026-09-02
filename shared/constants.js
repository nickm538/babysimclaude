// Shared between server (Node ESM) and client (browser ESM). Pure data + tiny helpers only.

export const DAY = 86400;
export const HOUR = 3600;
export const MIN = 60;

export const TIME = {
  ONLINE_SCALE_DEFAULT: 24, // 1 real hour = 1 sim day while connected
  ONLINE_SCALES: [1, 6, 24, 60],
  SLEEP_BOOST: 4, // extra multiplier while baby sleeps calmly (if enabled)
  OFFLINE_SCALE: 2, // 1 real hour away = 2 sim hours for the baby
  OFFLINE_CAP: 24 * HOUR, // max sim time simulated for one absence
  TICK_STEP: 5 * MIN, // integration step
  SERVER_TICK_MS: 2000,
  BIRTH_CLOCK: 10 * HOUR, // baby comes home at 10:00
  WIN_AGE_DAYS: 365 * 5,
};

export const NEED_KEYS = ['fullness', 'rest', 'diaper', 'clean', 'comfort', 'stimulation', 'affection', 'health'];
export const EMOTION_KEYS = ['happiness', 'trust', 'security', 'stress'];
export const DEV_KEYS = ['cognitive', 'motor', 'language', 'social', 'emotional'];

export const NEED_LABELS = {
  fullness: 'Fed', rest: 'Rested', diaper: 'Dry diaper', clean: 'Clean', comfort: 'Comfort',
  stimulation: 'Engaged', affection: 'Loved', health: 'Health',
  happiness: 'Happiness', trust: 'Trust', security: 'Security', stress: 'Stress',
  cognitive: 'Cognitive', motor: 'Motor', language: 'Language', social: 'Social', emotional: 'Self-regulation',
};

export const STAGES = [
  { id: 'newborn', label: 'Newborn', minDays: 0 },
  { id: 'infant', label: 'Infant', minDays: 90 },
  { id: 'older_infant', label: 'Older infant', minDays: 180 },
  { id: 'toddler', label: 'Toddler', minDays: 365 },
  { id: 'preschooler', label: 'Preschooler', minDays: 365 * 3 },
];

export function stageFor(days) {
  let s = STAGES[0];
  for (const st of STAGES) if (days >= st.minDays) s = st;
  return s;
}

// hours between feeds by age
export function feedIntervalHours(days) {
  if (days < 14) return 2.5;
  if (days < 60) return 3;
  if (days < 120) return 3.5;
  if (days < 365) return 4;
  if (days < 730) return 4;
  return 4.5;
}

export function wakeWindowHours(days) {
  if (days < 30) return 1.0;
  if (days < 90) return 1.5;
  if (days < 180) return 2.25;
  if (days < 365) return 3.0;
  if (days < 540) return 4.0;
  if (days < 730) return 5.0;
  if (days < 1095) return 6.0;
  return 7.0;
}

export function sleepHoursNeeded(days) {
  if (days < 90) return 16;
  if (days < 365) return 14;
  if (days < 730) return 13;
  if (days < 1095) return 12;
  return 11;
}

// WHO-ish median weight (kg) / height (cm) by age in days, interpolated
const GROWTH_M = [
  [0, 3.3, 49.9], [30, 4.5, 54.7], [61, 5.6, 58.4], [91, 6.4, 61.4], [122, 7.0, 63.9], [183, 7.9, 67.6],
  [274, 8.9, 72.0], [365, 9.6, 75.7], [548, 10.9, 82.3], [730, 12.2, 87.1], [1095, 14.3, 96.1],
  [1461, 16.3, 103.3], [1826, 18.3, 110.0],
];
const GROWTH_F = [
  [0, 3.2, 49.1], [30, 4.2, 53.7], [61, 5.1, 57.1], [91, 5.8, 59.8], [122, 6.4, 62.1], [183, 7.3, 65.7],
  [274, 8.2, 70.1], [365, 8.9, 74.0], [548, 10.2, 80.7], [730, 11.5, 86.4], [1095, 13.9, 95.1],
  [1461, 16.1, 102.7], [1826, 18.2, 109.4],
];
export function medianGrowth(days, sex) {
  const t = sex === 'girl' ? GROWTH_F : GROWTH_M;
  if (days <= 0) return { weight: t[0][1], height: t[0][2] };
  for (let i = 1; i < t.length; i++) {
    if (days <= t[i][0]) {
      const a = t[i - 1], b = t[i];
      const f = (days - a[0]) / (b[0] - a[0]);
      return { weight: a[1] + (b[1] - a[1]) * f, height: a[2] + (b[2] - a[2]) * f };
    }
  }
  const l = t[t.length - 1];
  return { weight: l[1], height: l[2] };
}

export const CLOTHING_SIZES = ['NB', '0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M', '2T', '3T', '4T', '5T'];
export function clothingSizeFor(weightKg, heightCm) {
  if (weightKg < 4 && heightCm < 56) return 'NB';
  if (weightKg < 6 || heightCm < 62) return '0-3M';
  if (weightKg < 7.5 || heightCm < 67) return '3-6M';
  if (weightKg < 8.5 || heightCm < 72) return '6-9M';
  if (weightKg < 9.5 || heightCm < 76) return '9-12M';
  if (weightKg < 11 || heightCm < 83) return '12-18M';
  if (weightKg < 12.5 || heightCm < 88) return '18-24M';
  if (weightKg < 14.5 || heightCm < 96) return '2T';
  if (weightKg < 16.5 || heightCm < 104) return '3T';
  if (weightKg < 18.5 || heightCm < 110) return '4T';
  return '5T';
}
export function clothingFit(currentSize, neededSize) {
  const a = CLOTHING_SIZES.indexOf(currentSize), b = CLOTHING_SIZES.indexOf(neededSize);
  const d = a - b; // negative = too small
  if (d === 0) return 100;
  if (d === -1) return 55;
  if (d <= -2) return 15;
  if (d === 1) return 80;
  return 40;
}

export const DIAPER_SIZES = ['N', '1', '2', '3', '4', '5', '6'];
export function diaperSizeFor(weightKg) {
  if (weightKg < 4.5) return 'N';
  if (weightKg < 6.3) return '1';
  if (weightKg < 8.2) return '2';
  if (weightKg < 11.3) return '3';
  if (weightKg < 15.9) return '4';
  if (weightKg < 18) return '5';
  return '6';
}

export const CHECKUPS = [
  { id: 'cu_newborn', label: 'Newborn visit', dueDays: 4, windowDays: 6 },
  { id: 'cu_1m', label: '1-month checkup', dueDays: 30, windowDays: 14 },
  { id: 'cu_2m', label: '2-month checkup', dueDays: 61, windowDays: 21 },
  { id: 'cu_4m', label: '4-month checkup', dueDays: 122, windowDays: 21 },
  { id: 'cu_6m', label: '6-month checkup', dueDays: 183, windowDays: 30 },
  { id: 'cu_9m', label: '9-month checkup', dueDays: 274, windowDays: 30 },
  { id: 'cu_12m', label: '12-month checkup', dueDays: 365, windowDays: 30 },
  { id: 'cu_15m', label: '15-month checkup', dueDays: 456, windowDays: 30 },
  { id: 'cu_18m', label: '18-month checkup', dueDays: 548, windowDays: 45 },
  { id: 'cu_24m', label: '2-year checkup', dueDays: 730, windowDays: 60 },
  { id: 'cu_30m', label: '30-month checkup', dueDays: 913, windowDays: 60 },
  { id: 'cu_3y', label: '3-year checkup', dueDays: 1095, windowDays: 90 },
  { id: 'cu_4y', label: '4-year checkup', dueDays: 1461, windowDays: 90 },
  { id: 'cu_5y', label: '5-year checkup', dueDays: 1800, windowDays: 60 },
];

export const VACCINES = [
  { id: 'vx_birth', label: 'HepB (birth dose)', dueDays: 0, windowDays: 30, protects: [] },
  { id: 'vx_2m', label: '2-month shots (DTaP, IPV, Hib, PCV, RV, HepB)', dueDays: 61, windowDays: 45, protects: ['pertussis', 'rsv_severe'] },
  { id: 'vx_4m', label: '4-month shots (DTaP, IPV, Hib, PCV, RV)', dueDays: 122, windowDays: 45, protects: ['pertussis'] },
  { id: 'vx_6m', label: '6-month shots (DTaP, Hib, PCV, HepB, RV, flu)', dueDays: 183, windowDays: 60, protects: ['pertussis', 'flu'] },
  { id: 'vx_12m', label: '12-month shots (MMR, Varicella, HepA, PCV, Hib)', dueDays: 365, windowDays: 60, protects: ['chickenpox', 'measles'] },
  { id: 'vx_15m', label: '15-month shots (DTaP)', dueDays: 456, windowDays: 60, protects: ['pertussis'] },
  { id: 'vx_18m', label: '18-month shots (HepA)', dueDays: 548, windowDays: 90, protects: [] },
  { id: 'vx_flu2', label: 'Flu shot (year 2)', dueDays: 548, windowDays: 120, protects: ['flu'] },
  { id: 'vx_flu3', label: 'Flu shot (year 3)', dueDays: 913, windowDays: 120, protects: ['flu'] },
  { id: 'vx_flu4', label: 'Flu shot (year 4)', dueDays: 1278, windowDays: 120, protects: ['flu'] },
  { id: 'vx_4y', label: '4-year shots (DTaP, IPV, MMR, Varicella)', dueDays: 1461, windowDays: 120, protects: ['pertussis', 'chickenpox', 'measles'] },
];

export const ILLNESSES = {
  cold: { label: 'Common cold', minDays: 0, courseDays: 7, danger: 0.4, contagious: true, meds: ['saline'] },
  fever: { label: 'Viral fever', minDays: 0, courseDays: 4, danger: 0.8, contagious: true, meds: ['acetaminophen', 'ibuprofen'] },
  ear_infection: { label: 'Ear infection', minDays: 90, courseDays: 8, danger: 0.6, contagious: false, meds: ['antibiotics', 'acetaminophen'] },
  stomach_bug: { label: 'Stomach bug', minDays: 0, courseDays: 4, danger: 1.0, contagious: true, meds: ['electrolytes'] },
  rsv: { label: 'RSV (bronchiolitis)', minDays: 0, maxDays: 730, courseDays: 10, danger: 1.4, contagious: true, meds: ['saline'] },
  croup: { label: 'Croup', minDays: 180, maxDays: 1095, courseDays: 5, danger: 0.9, contagious: true, meds: ['steroids'] },
  hfm: { label: 'Hand, foot & mouth', minDays: 365, courseDays: 8, danger: 0.5, contagious: true, meds: ['acetaminophen'] },
  chickenpox: { label: 'Chickenpox', minDays: 365, courseDays: 10, danger: 0.7, contagious: true, meds: ['acetaminophen'], preventedBy: 'chickenpox' },
  flu: { label: 'Influenza', minDays: 180, courseDays: 7, danger: 1.3, contagious: true, meds: ['antivirals', 'acetaminophen'], preventedBy: 'flu' },
  pertussis: { label: 'Whooping cough', minDays: 0, courseDays: 21, danger: 2.0, contagious: true, meds: ['antibiotics'], preventedBy: 'pertussis' },
  jaundice: { label: 'Newborn jaundice', minDays: 0, maxDays: 21, courseDays: 10, danger: 0.9, contagious: false, meds: [] },
  ate_object: { label: 'Swallowed something (stomach pain)', minDays: 150, courseDays: 3, danger: 1.2, contagious: false, meds: ['electrolytes'] },
  poisoning: { label: 'Ingested household chemical', minDays: 150, courseDays: 3, danger: 2.5, contagious: false, meds: [] },
  botulism: { label: 'Infant botulism (honey)', minDays: 0, maxDays: 365, courseDays: 14, danger: 2.2, contagious: false, meds: [] },
  failure_to_thrive: { label: 'Failure to thrive', minDays: 0, courseDays: 30, danger: 1.5, contagious: false, meds: [] },
};

export const MILESTONES = [
  { id: 'social_smile', label: 'First social smile', domain: 'social', minDays: 35, maxDays: 90 },
  { id: 'coos', label: 'Coos and gurgles', domain: 'language', minDays: 40, maxDays: 100 },
  { id: 'head_control', label: 'Holds head steady', domain: 'motor', minDays: 60, maxDays: 130 },
  { id: 'tracks', label: 'Tracks faces and objects', domain: 'cognitive', minDays: 45, maxDays: 100 },
  { id: 'laughs', label: 'First laugh', domain: 'social', minDays: 90, maxDays: 160 },
  { id: 'rolls', label: 'Rolls over', domain: 'motor', minDays: 110, maxDays: 200, needs: { tummyTimeMin: 300 } },
  { id: 'reaches', label: 'Reaches and grabs', domain: 'motor', minDays: 100, maxDays: 170 },
  { id: 'babbles', label: 'Babbles (ba-ba, da-da)', domain: 'language', minDays: 150, maxDays: 270 },
  { id: 'sits', label: 'Sits without support', domain: 'motor', minDays: 170, maxDays: 280 },
  { id: 'object_perm', label: 'Looks for hidden toy', domain: 'cognitive', minDays: 200, maxDays: 330 },
  { id: 'stranger_anx', label: 'Stranger awareness', domain: 'emotional', minDays: 210, maxDays: 330 },
  { id: 'crawls', label: 'Crawls', domain: 'motor', minDays: 210, maxDays: 330, needs: { floorTimeMin: 900 } },
  { id: 'pincer', label: 'Pincer grasp', domain: 'motor', minDays: 250, maxDays: 360 },
  { id: 'waves', label: 'Waves bye-bye', domain: 'social', minDays: 260, maxDays: 400 },
  { id: 'pulls_stand', label: 'Pulls to stand', domain: 'motor', minDays: 260, maxDays: 380 },
  { id: 'first_word', label: 'First real word', domain: 'language', minDays: 320, maxDays: 480 },
  { id: 'walks', label: 'Walks alone', domain: 'motor', minDays: 350, maxDays: 540, needs: { floorTimeMin: 2400 } },
  { id: 'points', label: 'Points to show you things', domain: 'social', minDays: 330, maxDays: 480 },
  { id: 'stacks2', label: 'Stacks two blocks', domain: 'cognitive', minDays: 400, maxDays: 560 },
  { id: 'words_10', label: 'Says 10+ words', domain: 'language', minDays: 450, maxDays: 640 },
  { id: 'runs', label: 'Runs', domain: 'motor', minDays: 540, maxDays: 760 },
  { id: 'two_words', label: 'Two-word phrases', domain: 'language', minDays: 600, maxDays: 850 },
  { id: 'pretend', label: 'Pretend play', domain: 'cognitive', minDays: 600, maxDays: 900 },
  { id: 'kicks_ball', label: 'Kicks a ball', domain: 'motor', minDays: 640, maxDays: 900 },
  { id: 'potty', label: 'Uses the potty', domain: 'emotional', minDays: 700, maxDays: 1300, needs: { pottyProgress: 80 } },
  { id: 'sentences', label: 'Speaks in sentences', domain: 'language', minDays: 900, maxDays: 1250 },
  { id: 'colors', label: 'Names colors', domain: 'cognitive', minDays: 950, maxDays: 1350, needs: { lesson: 'colors' } },
  { id: 'jumps', label: 'Jumps with both feet', domain: 'motor', minDays: 850, maxDays: 1200 },
  { id: 'takes_turns', label: 'Takes turns with others', domain: 'social', minDays: 1000, maxDays: 1500 },
  { id: 'counts_10', label: 'Counts to 10', domain: 'cognitive', minDays: 1250, maxDays: 1700, needs: { lesson: 'numbers' } },
  { id: 'letters', label: 'Recognizes letters', domain: 'cognitive', minDays: 1300, maxDays: 1750, needs: { lesson: 'letters' } },
  { id: 'dresses', label: 'Dresses self', domain: 'motor', minDays: 1300, maxDays: 1750 },
  { id: 'story', label: 'Tells a simple story', domain: 'language', minDays: 1400, maxDays: 1800 },
  { id: 'friends', label: 'Has a real friend', domain: 'social', minDays: 1300, maxDays: 1800, needs: { playdates: 5 } },
  { id: 'hops', label: 'Hops on one foot', domain: 'motor', minDays: 1500, maxDays: 1826 },
];

export const LESSONS = [
  { id: 'songs', label: 'Songs & rhymes', minDays: 180, gains: { language: 1.2, social: 0.6 } },
  { id: 'stories', label: 'Story time', minDays: 180, gains: { language: 1.4, cognitive: 0.5 } },
  { id: 'colors', label: 'Colors', minDays: 600, gains: { cognitive: 1.2, language: 0.5 } },
  { id: 'shapes', label: 'Shapes', minDays: 650, gains: { cognitive: 1.2, motor: 0.3 } },
  { id: 'numbers', label: 'Numbers & counting', minDays: 800, gains: { cognitive: 1.4 } },
  { id: 'letters', label: 'Letters & sounds', minDays: 900, gains: { cognitive: 1.0, language: 1.0 } },
  { id: 'art', label: 'Art & drawing', minDays: 700, gains: { motor: 1.0, cognitive: 0.5, emotional: 0.4 } },
  { id: 'music', label: 'Music & rhythm', minDays: 500, gains: { motor: 0.5, language: 0.6, emotional: 0.5 } },
  { id: 'nature', label: 'Nature & science', minDays: 900, gains: { cognitive: 1.2, language: 0.4 } },
  { id: 'feelings', label: 'Feelings & manners', minDays: 800, gains: { emotional: 1.4, social: 1.0 } },
  { id: 'movement', label: 'Movement & dance', minDays: 500, gains: { motor: 1.4, emotional: 0.3 } },
  { id: 'reading', label: 'Early reading', minDays: 1300, gains: { language: 1.5, cognitive: 1.0 } },
];

export const TOYS = [
  { id: 'mobile', label: 'Crib mobile', minDays: 0, maxDays: 150, gains: { cognitive: 0.6 } },
  { id: 'rattle', label: 'Rattle', minDays: 30, maxDays: 365, gains: { motor: 0.6, cognitive: 0.4 } },
  { id: 'play_gym', label: 'Play gym', minDays: 30, maxDays: 270, gains: { motor: 0.8, cognitive: 0.5 } },
  { id: 'board_books', label: 'Board books', minDays: 0, maxDays: 1200, gains: { language: 1.2, cognitive: 0.4 } },
  { id: 'soft_blocks', label: 'Soft blocks', minDays: 150, maxDays: 800, gains: { motor: 0.7, cognitive: 0.7 } },
  { id: 'stacking_cups', label: 'Stacking cups', minDays: 240, maxDays: 900, gains: { cognitive: 0.9, motor: 0.6 } },
  { id: 'push_walker', label: 'Push walker', minDays: 270, maxDays: 600, gains: { motor: 1.2 } },
  { id: 'shape_sorter', label: 'Shape sorter', minDays: 360, maxDays: 1000, gains: { cognitive: 1.1, motor: 0.5 } },
  { id: 'ball', label: 'Soft ball', minDays: 240, maxDays: 1826, gains: { motor: 0.9, social: 0.5 } },
  { id: 'picture_books', label: 'Picture books', minDays: 540, maxDays: 1826, gains: { language: 1.4, cognitive: 0.6 } },
  { id: 'puzzle', label: 'Wooden puzzle', minDays: 700, maxDays: 1826, gains: { cognitive: 1.3, motor: 0.6 } },
  { id: 'crayons', label: 'Crayons & paper', minDays: 600, maxDays: 1826, gains: { motor: 1.0, cognitive: 0.5 } },
  { id: 'play_kitchen', label: 'Play kitchen', minDays: 700, maxDays: 1826, gains: { social: 1.0, cognitive: 0.7 } },
  { id: 'trike', label: 'Tricycle', minDays: 1000, maxDays: 1826, gains: { motor: 1.4 } },
  { id: 'dolls', label: 'Dolls & figures', minDays: 600, maxDays: 1826, gains: { social: 1.1, emotional: 0.8 } },
];

export const BABYPROOFING = [
  { id: 'outlet_covers', label: 'Outlet covers', prevents: ['shock'] },
  { id: 'stair_gate', label: 'Stair gates', prevents: ['stairs_fall'] },
  { id: 'cabinet_locks', label: 'Cabinet locks', prevents: ['poisoning'] },
  { id: 'corner_guards', label: 'Corner guards', prevents: ['head_bump'] },
  { id: 'anchors', label: 'Furniture anchors', prevents: ['tipover'] },
  { id: 'cord_clips', label: 'Blind-cord clips', prevents: ['cord'] },
  { id: 'small_objects', label: 'Small objects cleared', prevents: ['choking', 'ate_object'] },
];

export const SHOP = [
  { id: 'formula', label: 'Infant formula (24 servings)', cat: 'food', qty: 24, key: 'formula', deliveryH: 1.5, minDays: 0, maxDays: 400 },
  { id: 'purees', label: 'Purees (12 jars)', cat: 'food', qty: 12, key: 'purees', deliveryH: 1.5, minDays: 120 },
  { id: 'cereal', label: 'Baby cereal (10 servings)', cat: 'food', qty: 10, key: 'cereal', deliveryH: 1.5, minDays: 120 },
  { id: 'finger_foods', label: 'Finger foods (12 servings)', cat: 'food', qty: 12, key: 'finger_foods', deliveryH: 1.5, minDays: 240 },
  { id: 'toddler_meals', label: 'Toddler meals (12)', cat: 'food', qty: 12, key: 'toddler_meals', deliveryH: 1.5, minDays: 365 },
  { id: 'whole_milk', label: 'Whole milk (12 cups)', cat: 'food', qty: 12, key: 'whole_milk', deliveryH: 1.5, minDays: 365 },
  { id: 'snacks', label: 'Healthy snacks (12)', cat: 'food', qty: 12, key: 'snacks', deliveryH: 1.5, minDays: 300 },
  { id: 'honey', label: 'Honey (jar)', cat: 'food', qty: 6, key: 'honey', deliveryH: 1.5, minDays: 0, warn: 'Never give honey to a baby under 12 months.' },
  { id: 'diapers', label: 'Diapers (40)', cat: 'care', qty: 40, key: 'diapers', deliveryH: 1.5, sized: 'diaper' },
  { id: 'wipes', label: 'Wipes (120)', cat: 'care', qty: 120, key: 'wipes', deliveryH: 1.5 },
  { id: 'diaper_cream', label: 'Diaper rash cream', cat: 'care', qty: 20, key: 'diaper_cream', deliveryH: 1.5 },
  { id: 'baby_wash', label: 'Baby wash & lotion', cat: 'care', qty: 15, key: 'baby_wash', deliveryH: 1.5 },
  { id: 'bottles', label: 'Bottle set', cat: 'care', qty: 4, key: 'bottles', deliveryH: 3 },
  { id: 'pacifiers', label: 'Pacifiers (2)', cat: 'care', qty: 2, key: 'pacifiers', deliveryH: 1.5 },
  { id: 'swaddle', label: 'Swaddle blankets', cat: 'care', qty: 2, key: 'swaddle', deliveryH: 3 },
  { id: 'sleep_sack', label: 'Sleep sack', cat: 'care', qty: 1, key: 'sleep_sack', deliveryH: 3 },
  { id: 'white_noise', label: 'White noise machine', cat: 'care', qty: 1, key: 'white_noise', deliveryH: 3 },
  { id: 'thermometer', label: 'Infant thermometer', cat: 'health', qty: 1, key: 'thermometer', deliveryH: 1.5 },
  { id: 'acetaminophen', label: 'Infant acetaminophen (10 doses)', cat: 'health', qty: 10, key: 'acetaminophen', deliveryH: 1.5, warn: 'Only with doctor guidance under 3 months.' },
  { id: 'ibuprofen', label: 'Infant ibuprofen (10 doses)', cat: 'health', qty: 10, key: 'ibuprofen', deliveryH: 1.5, warn: 'Not under 6 months.' },
  { id: 'saline', label: 'Saline drops & nasal aspirator', cat: 'health', qty: 20, key: 'saline', deliveryH: 1.5 },
  { id: 'electrolytes', label: 'Oral electrolytes (8)', cat: 'health', qty: 8, key: 'electrolytes', deliveryH: 1.5 },
  { id: 'vitamin_d', label: 'Vitamin D drops (30)', cat: 'health', qty: 30, key: 'vitamin_d', deliveryH: 1.5 },
  { id: 'clothes', label: 'Outfit set (3)', cat: 'clothes', qty: 3, key: 'clothes', deliveryH: 4, sized: 'clothing' },
  { id: 'toy', label: 'Toy', cat: 'toys', qty: 1, key: 'toys', deliveryH: 4, sized: 'toy' },
  { id: 'playpen', label: 'Playpen', cat: 'home', qty: 1, key: 'playpen', deliveryH: 6 },
  { id: 'high_chair', label: 'High chair', cat: 'home', qty: 1, key: 'high_chair', deliveryH: 6 },
  { id: 'potty', label: 'Potty seat', cat: 'home', qty: 1, key: 'potty', deliveryH: 4 },
  { id: 'toddler_bed', label: 'Toddler bed', cat: 'home', qty: 1, key: 'toddler_bed', deliveryH: 8 },
  { id: 'babyproof', label: 'Baby-proofing kit', cat: 'home', qty: 1, key: 'babyproof', deliveryH: 4, sized: 'proofing' },
];

export const ACTIONS = {
  feed: { label: 'Feed', dur: 12 },
  burp: { label: 'Burp', dur: 4 },
  change_diaper: { label: 'Change diaper', dur: 6 },
  bathe: { label: 'Bath', dur: 10 },
  dress: { label: 'Dress', dur: 5 },
  hold: { label: 'Hold', dur: 0 },
  put_down: { label: 'Put down', dur: 2 },
  rock: { label: 'Rock & soothe', dur: 6 },
  sing: { label: 'Sing', dur: 6 },
  play: { label: 'Play', dur: 8 },
  tummy_time: { label: 'Tummy time', dur: 8 },
  read: { label: 'Read a book', dur: 8 },
  put_to_sleep: { label: 'Put to sleep', dur: 5 },
  pacifier: { label: 'Pacifier', dur: 2 },
  swaddle: { label: 'Swaddle', dur: 3 },
  white_noise: { label: 'White noise', dur: 1 },
  check_temp: { label: 'Take temperature', dur: 3 },
  medicine: { label: 'Give medicine', dur: 3 },
  vitamin_d: { label: 'Vitamin D drops', dur: 2 },
  doctor: { label: 'Telehealth doctor', dur: 0 },
  lesson: { label: 'Lesson', dur: 10 },
  potty: { label: 'Potty time', dur: 5 },
  move: { label: 'Move baby', dur: 3 },
  yell: { label: 'Yell', dur: 2 },
  scream: { label: 'Scream', dur: 2 },
  leave: { label: 'Leave baby alone', dur: 0 },
  return: { label: 'Come back', dur: 0 },
  babysitter: { label: 'Hire babysitter', dur: 0 },
  collect_package: { label: 'Collect package', dur: 2 },
  nurse_visit: { label: 'Nurse: give vaccines', dur: 5 },
  thermostat: { label: 'Thermostat', dur: 0 },
  cuddle: { label: 'Cuddle', dur: 5 },
  talk: { label: 'Talk', dur: 0 },
  wash_bottles: { label: 'Wash bottles', dur: 5 },
};

export const LOCATIONS = ['crib', 'changing_table', 'play_mat', 'floor', 'sofa', 'high_chair', 'held', 'playpen', 'bath', 'kitchen', 'stairs', 'toddler_bed'];

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

export function clamp(v, lo = 0, hi = 100) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

export function ageLabel(days) {
  if (days < 14) return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} old`;
  if (days < 60) return `${Math.floor(days / 7)} weeks old`;
  if (days < 730) {
    const m = Math.floor(days / 30.44);
    return `${m} month${m === 1 ? '' : 's'} old`;
  }
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days - y * 365.25) / 30.44);
  return `${y} year${y === 1 ? '' : 's'}${m ? `, ${m} mo` : ''} old`;
}
