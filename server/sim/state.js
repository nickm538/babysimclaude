import { randomUUID } from 'node:crypto';
import { medianGrowth, clothingSizeFor, diaperSizeFor, TIME } from '../../shared/constants.js';
import { hashSeed } from './rng.js';

const SKIN_TONES = ['#f6d3c1', '#eec3a8', '#d9a982', '#b97a52', '#8c5a3c', '#5b3a29'];
const HAIR_COLORS = ['#1a1210', '#3b2417', '#6b4423', '#a56a35', '#d9b36b', '#c74b2a'];
const EYE_COLORS = ['#3b2413', '#5b3a1e', '#2f6c5b', '#3d6ea8', '#6b8ea9', '#7a7a4a'];

export function defaultAppearance(seedStr) {
  const h = hashSeed(seedStr);
  return {
    skinTone: SKIN_TONES[h % SKIN_TONES.length],
    hairColor: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
    eyeColor: EYE_COLORS[(h >>> 6) % EYE_COLORS.length],
    hairAmount: 0.2 + ((h >>> 9) % 100) / 160, // 0.2..0.8
    cheekiness: 0.8 + ((h >>> 12) % 100) / 250,
  };
}

export function createGame({ userId, babyName, sex = 'boy', parentName = 'You', appearance, settings } = {}) {
  const id = randomUUID();
  const now = Date.now();
  const g = medianGrowth(0, sex);
  const w = g.weight * (0.92 + (hashSeed(id) % 100) / 600);
  const h = g.height * (0.97 + (hashSeed(id + 'h') % 100) / 1600);
  const seed = hashSeed(id);
  const teethStart = 150 + (seed % 90);
  return {
    id,
    userId,
    status: 'active',
    createdAt: now,
    lastTickAt: now,
    version: 1,
    settings: { timeScale: TIME.ONLINE_SCALE_DEFAULT, sleepBoost: true, ...(settings || {}) },
    sim: { time: 0, seed, steps: 0 },
    baby: {
      name: babyName || (sex === 'girl' ? 'Ava' : 'Leo'),
      sex,
      appearance: { ...defaultAppearance(id), ...(appearance || {}) },
      needs: { fullness: 78, rest: 72, diaper: 100, clean: 92, comfort: 80, stimulation: 60, affection: 70, health: 96 },
      emo: { happiness: 62, trust: 50, security: 50, stress: 18 },
      dev: { cognitive: 0.6, motor: 0.6, language: 0.6, social: 0.6, emotional: 0.6 },
      phys: {
        weightKg: +w.toFixed(2), heightCm: +h.toFixed(1), tempC: 36.8, teeth: 0, teethStart,
        nutrition: 1.0, rash: 0, jaundice: (seed % 10) < 3 ? 25 : 0,
      },
      wear: { outfitSize: 'NB', outfit: 'white', layers: 'normal', diaperSize: 'N', swaddled: false, sleepSack: false },
      state: {
        activity: 'sleeping', location: 'crib', position: 'back', cryingSince: null, cryIntensity: 0, cryCause: null,
        sleepSince: 0, awakeSince: null, lastFedAt: -1800, lastDiaperAt: 0, lastBathAt: 0, lastSolidsAt: null,
        needsBurp: false, pacifier: false, whiteNoise: false, held: false, teething: 0, colicUntil: 0,
        lastInteractionAt: 0, lastTalkAt: 0, hazardDwell: 0, postVaccineUntil: 0, hospitalizedUntil: 0,
        lastAnsweredCryAt: 0, selfPlayUntil: 0, mealsToday: 0, dayIndex: 0, lessonsToday: 0,
        medsLog: [], lastVitaminAt: -DAY_S,
      },
      illness: null,
      injuries: [],
      vaccines: {},
      checkups: {},
      milestones: {},
      delays: [],
      prescriptions: {},
      counters: { tummyTimeMin: 0, floorTimeMin: 0, pottyProgress: 0, playdates: 0, lessons: {}, reads: 0, plays: 0, feeds: 0, diapers: 0 },
      responsiveness: 0.6,
      attachment: 'forming',
      history: { toxicStressH: 0, unansweredCryMin: 0, cryMin: 0, criesAnswered: 0, criesTotal: 0, hungerH: 0, wetH: 0 },
      doctorNotes: [],
      doctorApprovedMeds: false,
    },
    parent: {
      name: parentName,
      energy: 80,
      stress: 20,
      awayUntil: 0,
      awayReason: null,
      babysitterUntil: 0,
      tempers: { yells: 0, screams: 0, leaves: 0 },
    },
    house: {
      proofing: {},
      thermostatC: 21,
      roomTempC: 21,
      mobileOn: false,
      doorPackages: [],
      nurseAtDoor: null,
      season: 'autumn',
    },
    inventory: {
      formula: 24, bottles: 4, bottlesClean: 4, diapers: { N: 32 }, wipes: 120, diaper_cream: 5, baby_wash: 8,
      pacifiers: 1, swaddle: 2, sleep_sack: 0, white_noise: 0, thermometer: 1, acetaminophen: 0, ibuprofen: 0,
      saline: 0, electrolytes: 0, vitamin_d: 0, honey: 0, purees: 0, cereal: 0, finger_foods: 0, toddler_meals: 0,
      whole_milk: 0, snacks: 0, clothes: { NB: 3, '0-3M': 1 }, toys: ['mobile', 'board_books'], playpen: 0, high_chair: 0,
      potty: 0, toddler_bed: 0, antibiotics: 0, antivirals: 0, steroids: 0,
    },
    orders: [],
    journal: [],
    stats: { feeds: 0, diapers: 0, baths: 0, plays: 0, reads: 0, lessons: 0, doctorVisits: 0, yells: 0, screams: 0, leaves: 0, playdates: 0, cries: 0, hazards: 0 },
    flags: { warnedTummySleep: false, warnedSwaddle: false, tutorial: true },
    chat: [],
    death: null,
    win: null,
  };
}
const DAY_S = 86400;

export function neededSizes(baby) {
  return {
    clothing: clothingSizeFor(baby.phys.weightKg, baby.phys.heightCm),
    diaper: diaperSizeFor(baby.phys.weightKg),
  };
}
