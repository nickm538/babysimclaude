// Vector icon set: inline SVG (24px viewBox, stroke = currentColor) so the HUD stays crisp on retina iOS.
// Usage: icon('heart') -> '<svg class="ic" …>' ; icon('bell', 'ic-lg') adds a class. Unknown names fall back to a dot.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  // needs
  bottle: '<path d="M10 2h4v2h-4z"/><path d="M9 4h6l1 4H8z"/><rect x="8" y="8" width="8" height="13" rx="2"/><path d="M8 14h8"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  pin: '<path d="M5 19 19 5"/><circle cx="5.5" cy="18.5" r="2.5"/><path d="m17 3 4 4-2 2-4-4z"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  teddy: '<circle cx="12" cy="13" r="6"/><circle cx="6.5" cy="7.5" r="2.5"/><circle cx="17.5" cy="7.5" r="2.5"/><path d="M10 11.5h.01M14 11.5h.01"/><path d="M10.5 15.5c1 .8 2 .8 3 0"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 17 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  heart: '<path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.1-8 11-8 11z"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  // tabs / fabs
  baby: '<circle cx="12" cy="13" r="8"/><path d="M12 5c0-2 1.5-3 3-3"/><path d="M9 12h.01M15 12h.01"/><path d="M9.5 16c1.5 1.3 3.5 1.3 5 0"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M2 3h3l2.5 11h11l2-7H6.5"/>',
  shirt: '<path d="m8 3 4 2 4-2 5 4-2.5 3L16 8.5V21H8V8.5L5.5 10 3 7z"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  house: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M10 21v-6h4v6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 5.5 2.2 5.5 5.5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M9 7h7"/>',
  bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  locate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  // action categories
  hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6"/><path d="M16 11.5V9a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L3.4 15a1.5 1.5 0 0 1 2.4-1.8L7 14.5"/>',
  blocks: '<rect x="3" y="12" width="8" height="8" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1"/><rect x="8" y="3" width="8" height="8" rx="1"/>',
  flame: '<path d="M12 22c-4.4 0-7-2.8-7-6.5 0-3 2-5.2 3.5-7 .3 1.8 1.2 2.8 2.5 3.5C11.5 8 12 5 14 2c2 3 5 6.5 5 11.5 0 4.5-2.6 8.5-7 8.5z"/>',
  // alert kinds
  thermometer: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>',
  warning: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  feather: '<path d="M20 4c-5 0-11 4-13 10l-3 6 6-3c6-2 10-8 10-13z"/><path d="M4 20 15 9"/>',
  fork: '<path d="M12 3v18"/><path d="M12 7h7l2 2-2 2h-7"/><path d="M12 13H5l-2 2 2 2h7"/>',
  package: '<path d="m3 8 9-5 9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  // misc
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunset: '<path d="M4 17h16"/><path d="M6 14a6 6 0 0 1 12 0"/><path d="M12 3v3M4 11h2M18 11h2M6.3 5.5l1.4 1.4M17.7 5.5l-1.4 1.4"/><path d="M8 21h8"/>',
  person: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
  door: '<path d="M4 21V3h11v18"/><path d="M15 12h5"/><path d="M12 12h.01"/>',
  zzz: '<path d="M4 6h6l-6 7h6"/><path d="M14 11h6l-6 7h6"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  joystick: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  faceSad: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M9 16c1.5-1.5 4.5-1.5 6 0"/>',
  faceHappy: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M8.5 14c1.5 2 5.5 2 7 0"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  trendFlat: '<path d="M3 12h18"/><path d="m16 8 4 4-4 4"/>',
  faceNeutral: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M9 15h6"/>',
  tap: '<path d="M12 3v9"/><path d="M9 6.5 12 3l3 3.5"/><path d="M7 12v3a6 6 0 0 0 6 6h1a5 5 0 0 0 5-5v-3a1.5 1.5 0 0 0-3 0"/><path d="M16 13v-2a1.5 1.5 0 0 0-3 0"/><path d="M13 11.5V6a1.5 1.5 0 0 0-3 0v7"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/><circle cx="12" cy="18" r="1.4"/>',
  pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.5 9.5 5 5"/>',
  syringe: '<path d="m14 4 6 6"/><path d="m17.5 6.5-9 9L4 21l1.5-5 9-9z"/><path d="m10 10 2 2M12.5 7.5l2 2"/>',
  bath: '<path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 12V5.5A1.5 1.5 0 0 1 9 5"/><path d="M6 19l-1 2M18 19l1 2"/>',
  grip: '<path d="M6 10h12M6 14h12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  quote: '<path d="M9 7c-2.5 1-4 3-4 6h3v5H4V13c0-3.5 1.7-5.6 5-6z"/><path d="M19 7c-2.5 1-4 3-4 6h3v5h-4V13c0-3.5 1.7-5.6 5-6z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M12 14v4M9 21h6"/>',
  hourglass: '<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 6 5 9s-5 4-5 9"/><path d="M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1 1 1.6h5c.1-.6.4-1.1 1-1.6A6 6 0 0 0 12 3z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
};

export function icon(name, cls = '') {
  const p = PATHS[name] || PATHS.dot;
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" ${S}>${p}</svg>`;
}
export function hasIcon(name) { return !!PATHS[name]; }

// Semantic lookups shared by the HUD, the phone tabs, the action bar and the notification center.
export const NEED_ICON = { fullness: 'bottle', rest: 'moon', diaper: 'pin', clean: 'droplet', comfort: 'teddy', stimulation: 'spark', affection: 'heart', health: 'pulse' };
export const TAB_ICON = { baby: 'baby', health: 'cross', shop: 'cart', wardrobe: 'shirt', school: 'cap', home: 'house', friends: 'people', journal: 'book', story: 'book', alerts: 'bell', settings: 'gear', contacts: 'phone' };
export const KIND_ICON = { illness: 'thermometer', danger: 'warning', milestone: 'star', story: 'feather', choice: 'fork', social: 'phone', package: 'package', info: 'dot' };
export const CAT_ICON = { care: 'hand', play: 'blocks', learn: 'cap', family: 'people', temper: 'flame' };
export const TREND_ICON = { up: 'trendUp', rising: 'trendUp', improving: 'trendUp', down: 'trendDown', falling: 'trendDown', declining: 'trendDown', flat: 'trendFlat', steady: 'trendFlat', stable: 'trendFlat' };
export const MOOD_ICON = { agony: 'faceSad', misery: 'faceSad', distress: 'faceSad', unhappy: 'faceSad', low: 'faceNeutral', neutral: 'faceNeutral', content: 'faceHappy', happy: 'faceHappy', joyful: 'faceHappy', elated: 'faceHappy' };
export const ACTIVITY_ICON = { sleeping: 'zzz', sick_sleep: 'zzz', crying: 'faceSad', screaming: 'faceSad', sick: 'thermometer', scared: 'warning', fussy: 'faceSad', playing: 'blocks', happy: 'faceHappy', content: 'faceHappy', calm: 'faceHappy', withdrawn: 'faceNeutral', hospital: 'cross', gone: 'feather' };
export const SEV_ICON = { danger: 'warning', warn: 'warning', good: 'check', info: 'bulb' };
