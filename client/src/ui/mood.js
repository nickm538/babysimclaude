// Mood spectrum: a single gradient bar from agony to elated with a needle at the baby's current mood.
// Consumes view.baby.moodValue / moodLabel / moodText when the server provides them, and falls back to
// deriving a reasonable value from the legacy mood string + emotions so the widget is never blank.
import { icon, MOOD_ICON } from './icons.js';
import { escapeHtml, reduceMotion } from '../state.js';

export const MOOD_GRADIENT = 'linear-gradient(90deg,#2a0a0a 0%,#8a1d1d 18%,#c2622b 36%,#6c6f78 50%,#7fc8e8 66%,#f6b26b 84%,#ffd97a 100%)';
const STOPS = [[0, 0x2a, 0x0a, 0x0a], [18, 0x8a, 0x1d, 0x1d], [36, 0xc2, 0x62, 0x2b], [50, 0x6c, 0x6f, 0x78], [66, 0x7f, 0xc8, 0xe8], [84, 0xf6, 0xb2, 0x6b], [100, 0xff, 0xd9, 0x7a]];

export const MOOD_LABELS = ['agony', 'misery', 'distress', 'unhappy', 'low', 'neutral', 'content', 'happy', 'joyful', 'elated'];

// Legacy mood strings (server `baby.mood`) mapped onto the −100..100 spectrum.
const LEGACY = { gone: -100, screaming: -85, crying: -62, scared: -58, hospital: -50, sick: -46, withdrawn: -34, fussy: -28, sick_sleep: -18, sleeping: 12, calm: 34, content: 44, playing: 62, happy: 70 };

export function clampMood(v) { return Math.max(-100, Math.min(100, v)); }

/** Colour of the spectrum at a mood value (−100..100). */
export function moodColor(value) {
  const p = (clampMood(Number(value) || 0) + 100) / 2; // 0..100
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) if (p >= STOPS[i][0] && p <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  const t = b[0] === a[0] ? 0 : (p - a[0]) / (b[0] - a[0]);
  const c = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(1)},${c(2)},${c(3)})`;
}

export function labelForMood(value) { return MOOD_LABELS[Math.min(9, Math.max(0, Math.floor((clampMood(value) + 100) / 20)))]; }

/** Normalised mood for a view: { value, label, text, known }. Tolerates a server that has none of it yet. */
export function moodOf(view) {
  const b = view && view.baby; if (!b) return { value: 0, label: 'neutral', text: '', known: false };
  const raw = b.moodValue;
  let value = raw == null || Number.isNaN(Number(raw)) ? null : clampMood(Number(raw));
  const known = value != null;
  if (value == null) {
    value = LEGACY[b.mood] != null ? LEGACY[b.mood] : 0;
    const e = b.emo || {};
    if (typeof e.happiness === 'number') value = clampMood(value * 0.6 + ((e.happiness - 50) * 0.8) * 0.4);
    if (b.state && b.state.crying) value = clampMood(Math.min(value, -35 - (b.state.cryIntensity || 0) * 35));
  }
  const label = b.moodLabel || labelForMood(value);
  let text = b.moodText || '';
  if (!text) {
    const st = b.state || {}, name = b.name || 'The baby';
    text = st.crying ? `${name} is crying — ${st.cryCause || 'unsettled'}.`
      : st.hospitalized ? `${name} is in hospital.`
        : st.activity === 'sleeping' ? `${name} is asleep and breathing steadily.`
          : value > 45 ? `${name} is bright-eyed and enjoying your company.`
            : value > 10 ? `${name} is settled and taking the room in.`
              : value > -20 ? `${name} is a bit unsettled — a cuddle would help.`
                : `${name} is not okay right now.`;
  }
  return { value, label, text, known };
}

/** The spectrum widget. Mounts into `host`; call update(view) each frame/view change. */
export class MoodMeter {
  constructor(host, { onOpen } = {}) {
    this.host = host; this.value = null;
    host.classList.add('mood');
    host.setAttribute('role', 'button');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', 'Mood — open the baby profile');
    host.innerHTML = `<div class="mood-top"><span class="mood-lbl" id="mood-lbl">${icon('faceNeutral')}<span>—</span></span><span class="mood-val" id="mood-val">—</span></div>
      <div class="mood-bar" id="mood-bar" style="background:${MOOD_GRADIENT}"><div class="mood-needle" id="mood-needle" style="left:50%"></div></div>
      <div class="mood-text" id="mood-text"></div>`;
    this.$lbl = host.querySelector('#mood-lbl'); this.$val = host.querySelector('#mood-val');
    this.$needle = host.querySelector('#mood-needle'); this.$text = host.querySelector('#mood-text');
    if (onOpen) {
      const go = (e) => { e.stopPropagation(); onOpen(); };
      host.addEventListener('click', go);
      host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
  }

  update(view) {
    const m = moodOf(view); if (!m) return;
    const pct = (clampMood(m.value) + 100) / 2;
    this.$needle.style.transition = reduceMotion() ? 'none' : '';
    this.$needle.style.left = `${pct}%`;
    this.$val.textContent = `${m.value > 0 ? '+' : ''}${Math.round(m.value)}`;
    this.$val.style.color = moodColor(m.value);
    this.$lbl.innerHTML = `${icon(MOOD_ICON[m.label] || 'faceNeutral')}<span>${escapeHtml(m.label)}</span>`;
    this.$text.textContent = m.text;
    this.host.classList.toggle('grim', m.value <= -60);
    this.value = m.value;
    return m;
  }
}
