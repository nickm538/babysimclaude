// Client-safe view of a game (no seeds/internal counters), plus the per-tick delta the socket sends.
import { ageDays, clockSeconds, isNight, distressOf, expectedDev, ageToys } from './engine.js';
import { neededSizes } from './state.js';
import { stageFor, MILESTONES, CHECKUPS, VACCINES, LESSONS, TOYS, ILLNESSES, TIME, DAY, HOUR } from '../../shared/constants.js';
import { growthPercentile } from './health.js';
import { computeMood } from './mood.js';
import { ensureStory } from './story.js';
import { storyView } from './storyChapters.js';
import { ensureSocial, socialView } from './social.js';
import { isMobile } from './events.js';

export function gameView(game) {
  ensureStory(game); ensureSocial(game);
  const b = game.baby, days = ageDays(game), t = game.sim.time;
  const mood = computeMood(game);
  const sizes = neededSizes(b);
  const d = distressOf(game, days);
  const exp = expectedDev(days);
  const moodWord = moodOf(game, d);
  return {
    id: game.id, status: game.status, createdAt: game.createdAt, settings: game.settings,
    sim: { time: t, days, clock: clockSeconds(game), night: isNight(game), stage: stageFor(days).id, season: game.house.season },
    baby: {
      name: b.name, sex: b.sex, appearance: b.appearance,
      needs: round(b.needs), emo: round(b.emo), dev: round(b.dev, 1), devExpected: +exp.toFixed(1),
      phys: { weightKg: +b.phys.weightKg.toFixed(2), heightCm: +b.phys.heightCm.toFixed(1), tempC: b.phys.tempC, teeth: b.phys.teeth, percentile: growthPercentile(game), rash: Math.round(b.phys.rash), jaundice: Math.round(b.phys.jaundice || 0) },
      wear: { ...b.wear, neededSize: sizes.clothing, neededDiaper: sizes.diaper },
      state: {
        activity: b.state.activity, location: b.state.location, position: b.state.position, held: b.state.held,
        crying: !!b.state.cryingSince, cryIntensity: b.state.cryIntensity, cryCause: b.state.cryCause, cryMinutes: b.state.cryingSince ? (t - b.state.cryingSince) / 60 : 0,
        needsBurp: b.state.needsBurp, pacifier: b.state.pacifier, whiteNoise: b.state.whiteNoise, teething: !!b.state.teething,
        hospitalized: b.state.hospitalizedUntil > t, hospitalizedUntil: b.state.hospitalizedUntil, selfPlaying: b.state.selfPlayUntil > t,
        sinceFedMin: (t - b.state.lastFedAt) / 60, sinceDiaperMin: (t - b.state.lastDiaperAt) / 60, sinceBathH: (t - b.state.lastBathAt) / 3600,
        colic: b.state.colicUntil > t, postVaccine: b.state.postVaccineUntil > t, mobile: isMobile(game),
      },
      mood: moodWord, moodValue: mood.value, moodLabel: mood.label, moodText: mood.text, distress: { value: Math.round(d.value), cause: d.cause },
      illness: b.illness ? { id: b.illness.id, label: b.illness.known ? ILLNESSES[b.illness.id].label : 'Unwell (undiagnosed)', severity: Math.round(b.illness.severity), known: b.illness.known, treated: b.illness.treated, days: +((t - b.illness.startedAt) / DAY).toFixed(1) } : null,
      injuries: b.injuries.filter((i) => i.healAt > t).map((i) => ({ kind: i.kind, severe: i.severe, healsInH: Math.round((i.healAt - t) / HOUR) })),
      milestones: b.milestones, delays: b.delays, attachment: b.attachment, responsiveness: +b.responsiveness.toFixed(2),
      vaccines: b.vaccines, checkups: b.checkups, prescriptions: Object.keys(b.prescriptions),
      counters: b.counters, history: round(b.history), doctorNotes: b.doctorNotes.slice(-5), doctorApprovedMeds: b.doctorApprovedMeds,
      schedule: scheduleFor(game, days),
      ageToys: ageToys(game),
      vocabulary: b.vocabulary || [],
      allergens: b.allergens || {},
    },
    parent: { ...game.parent, away: game.parent.awayUntil > t, awayMinutesLeft: Math.max(0, (game.parent.awayUntil - t) / 60), sitter: game.parent.babysitterUntil > t, sitterHoursLeft: Math.max(0, (game.parent.babysitterUntil - t) / 3600) },
    house: { ...game.house, nurseHere: !!(game.house.nurseAtDoor && game.house.nurseAtDoor.arrivesAt <= t), nurseEtaMin: game.house.nurseAtDoor ? Math.max(0, (game.house.nurseAtDoor.arrivesAt - t) / 60) : null },
    inventory: game.inventory,
    social: socialView(game),
    story: storyView(game),
    notifications: (game.notifications || []).slice(0, 30),
    pendingChoices: (game.pendingChoices || []).map((c) => ({ id: c.id, t: c.t, deadline: c.deadline, title: c.title, text: c.text, lead: c.lead, options: c.options })),
    weather: (game.story && game.story.weather) || 'clear',
    orders: game.orders.filter((o) => o.status !== 'collected').map((o) => ({ ...o, etaMin: Math.max(0, (o.arrivesAt - t) / 60) })),
    journal: game.journal.slice(-80),
    stats: game.stats,
    death: game.death, win: game.win,
    chat: game.chat.slice(-30),
  };
}

function round(o, digits = 0) {
  const out = {}; const m = Math.pow(10, digits);
  for (const k of Object.keys(o)) out[k] = typeof o[k] === 'number' ? Math.round(o[k] * m) / m : o[k];
  return out;
}

export function moodOf(game, d) {
  const b = game.baby, s = b.state, e = b.emo;
  if (game.status === 'dead') return 'gone';
  if (s.hospitalizedUntil > game.sim.time) return 'hospital';
  if (s.activity === 'sleeping') return b.illness && b.illness.severity > 50 ? 'sick_sleep' : 'sleeping';
  if (s.cryingSince) return s.cryIntensity > 0.7 ? 'screaming' : 'crying';
  if (b.illness && b.illness.severity > 45) return 'sick';
  if (e.stress > 65) return 'scared';
  if (d.value > 40) return 'fussy';
  if (s.selfPlayUntil > game.sim.time) return 'playing';
  if (e.happiness > 70 && b.needs.stimulation > 50) return 'happy';
  if (e.happiness > 45) return 'content';
  if (e.happiness < 25) return 'withdrawn';
  return 'calm';
}

function scheduleFor(game, days) {
  const b = game.baby;
  return {
    nextCheckup: CHECKUPS.find((c) => !b.checkups[c.id] && days <= c.dueDays + c.windowDays) || null,
    overdueCheckups: CHECKUPS.filter((c) => !b.checkups[c.id] && days > c.dueDays + c.windowDays).map((c) => c.id),
    vaccinesDue: VACCINES.filter((v) => !b.vaccines[v.id] && days >= v.dueDays - 5).map((v) => ({ id: v.id, label: v.label, overdue: days > v.dueDays + v.windowDays })),
    upcomingMilestones: MILESTONES.filter((m) => !b.milestones[m.id] && days >= m.minDays - 20 && days <= m.maxDays + 60).slice(0, 6).map((m) => ({ id: m.id, label: m.label, domain: m.domain, late: days > m.maxDays })),
    lessons: LESSONS.filter((l) => days >= l.minDays).map((l) => l.id),
    toys: TOYS.map((t) => ({ id: t.id, label: t.label, owned: game.inventory.toys.includes(t.id), fits: days >= t.minDays && days <= t.maxDays })),
    winAgeDays: TIME.WIN_AGE_DAYS,
  };
}
