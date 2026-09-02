// Heads-up display: top bar, vitals strip + mood spectrum, in-world baby label, alert banners,
// toasts, progress ring, hints and the categorised action bar.
import { store, escapeHtml } from '../state.js';
import { NEED_LABELS, ageLabel, TIME } from '/shared/constants.js';
import { icon, NEED_ICON, CAT_ICON, ACTIVITY_ICON, SEV_ICON } from './icons.js';
import { MoodMeter, moodColor, moodOf } from './mood.js';

const NEEDS = ['fullness', 'rest', 'diaper', 'clean', 'comfort', 'stimulation', 'affection', 'health'];
const MOOD_TEXT = { sleeping: 'Sleeping', sick_sleep: 'Sleeping (sick)', crying: 'Crying', screaming: 'Screaming', sick: 'Feeling sick', scared: 'Scared', fussy: 'Fussy', playing: 'Playing', happy: 'Happy', content: 'Content', calm: 'Calm', withdrawn: 'Withdrawn', hospital: 'In hospital', gone: 'Gone' };

// Bottom-bar categories. `contextActions` tags each action with a `cat`; anything untagged is guessed.
const CATS = [['care', 'Care'], ['play', 'Play'], ['learn', 'Learn'], ['family', 'Family'], ['temper', 'Temper']];
function guessCat(label = '') {
  const s = String(label).toLowerCase();
  if (/temper|yell|scream|walk out|shut the door/.test(s)) return 'temper';
  if (/lesson|teach|read|book|word|letter|potty|school|count/.test(s)) return 'learn';
  if (/play|sing|toy|tummy|peekaboo|dance|game|music/.test(s)) return 'play';
  if (/playdate|friend|visit|grandma|grandpa|call |video|family|sitter|partner/.test(s)) return 'family';
  return 'care';
}

export class HUD {
  constructor(ui, { onSpeed, onPhone, onChat, onGoTo, onAlerts, onMood }) {
    this.ui = ui; this.onSpeed = onSpeed;
    ui.insertAdjacentHTML('beforeend', `
      <div class="topbar">
        <div class="pill"><span class="dot" id="conn"></span><span class="name" id="hud-name">—</span><span id="hud-age" style="color:var(--muted)"></span></div>
        <div class="pill" id="hud-clock">${icon('sun')}<span id="hud-clock-t">10:00 · Day 1</span></div>
        <div class="spacer"></div>
        <div class="pill speed" id="hud-speed"></div>
      </div>
      <div class="vitals" id="vitals">
        <div class="head"><span class="mood-head" id="hud-mood">—</span><span class="chev" id="hud-toggle">${icon('down')}</span></div>
        <div id="mood-meter"></div>
        <div class="bars" id="bars"></div>
      </div>
      <div class="hintbox" id="hint"></div>
      <div class="alerts" id="alerts"></div>
      <div class="baby-label" id="baby-label" style="opacity:0"></div>
      <div class="toasts" id="toasts"></div>
      <div class="progress hidden" id="progress"><div id="progress-label"></div><div class="track"><div class="fill" id="progress-fill" style="width:0%"></div></div></div>
      <div class="crosshair" id="crosshair"></div>
      <div class="bottombar">
        <div class="fabs">
          <button class="fab" id="fab-phone" title="Phone" aria-label="Phone">${icon('device')}<span class="badge hidden" id="fab-badge"></span></button>
          <button class="fab" id="fab-alerts" title="Alerts" aria-label="Alerts">${icon('bell')}</button>
          <button class="fab" id="fab-chat" title="Talk to baby" aria-label="Talk to baby">${icon('chat')}</button>
          <button class="fab" id="fab-goto" title="Go to baby" aria-label="Go to baby">${icon('baby')}</button>
        </div>
        <div class="actionwrap">
          <div class="cats hidden" id="act-cats"></div>
          <div class="actions" id="actions"></div>
        </div>
      </div>`);
    this.$ = (id) => ui.querySelector('#' + id);
    this.bars = this.$('bars'); this.buildBars();
    this.$('vitals').querySelector('.head').onclick = () => this.$('vitals').classList.toggle('collapsed');
    this.mood = new MoodMeter(this.$('mood-meter'), { onOpen: () => onMood && onMood() });
    this.$('fab-phone').onclick = onPhone; this.$('fab-chat').onclick = onChat; this.$('fab-goto').onclick = onGoTo;
    if (onAlerts) this.$('fab-alerts').onclick = onAlerts;
    this.alertHost = this.$('alerts');
    this.speedEl = this.$('hud-speed');
    for (const s of TIME.ONLINE_SCALES) { const b = document.createElement('button'); b.textContent = `${s}×`; b.dataset.s = s; b.onclick = () => onSpeed(s); this.speedEl.appendChild(b); }
    store.on('toast', () => this.renderToasts());
    store.on('view', ({ view }) => this.render(view));
    this.unread = 0; this.cat = 'care'; this.groups = new Map();
    if (!('ontouchstart' in window)) this.$('crosshair').style.display = 'block'; else this.$('crosshair').style.display = 'none';
  }

  buildBars() {
    this.bars.innerHTML = '';
    for (const k of NEEDS) this.bars.insertAdjacentHTML('beforeend', `<div class="bar" title="${NEED_LABELS[k]}"><span class="bi">${icon(NEED_ICON[k] || 'dot')}</span><div class="track"><div class="fill" id="bar-${k}"></div></div><span class="v" id="val-${k}">–</span></div>`);
  }

  render(view) {
    if (!view) return;
    const b = view.baby;
    this.$('hud-name').textContent = b.name;
    this.$('hud-age').textContent = ageLabel(view.sim.days);
    const h = Math.floor(view.sim.clock / 3600), m = Math.floor((view.sim.clock % 3600) / 60);
    const tod = view.sim.night ? 'moon' : h < 8 || h > 17 ? 'sunset' : 'sun';
    const clock = this.$('hud-clock');
    clock.innerHTML = `${icon(tod)}<span id="hud-clock-t">${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · Day ${Math.floor(view.sim.days) + 1}</span>${view.parent.sitter ? `<span class="mini">${icon('person')}sitter</span>` : ''}${view.parent.away ? `<span class="mini warn">${icon('door')}away</span>` : ''}`;
    for (const k of NEEDS) {
      const v = b.needs[k]; const f = this.$('bar-' + k); if (!f) continue;
      f.style.width = `${v}%`; f.className = 'fill ' + (v < 30 ? 'low' : v < 55 ? 'mid' : '');
      this.$('val-' + k).textContent = Math.round(v);
    }
    const mood = b.mood;
    const cause = b.state.crying && b.state.cryCause ? ` · ${b.state.cryCause}` : '';
    this.$('hud-mood').innerHTML = `${icon(ACTIVITY_ICON[mood] || 'faceNeutral')}<span>${escapeHtml((MOOD_TEXT[mood] || mood) + cause)}</span>`;
    this.mood.update(view);
    for (const btn of this.speedEl.children) btn.classList.toggle('on', Number(btn.dataset.s) === view.settings.timeScale);
    this.$('conn').classList.toggle('on', store.status === 'online');
    this.renderHint(view);
  }

  renderHint(view) {
    const b = view.baby, el = this.$('hint');
    const tips = [];
    if (view.status !== 'active') { el.classList.add('hidden'); return; }
    if (b.state.hospitalized) tips.push(`<b>${b.name} is in hospital.</b> Time passes faster until ${b.sex === 'girl' ? 'she' : 'he'} is home.`);
    else if (view.parent.away) tips.push(`<b>You walked out.</b> ${b.name} is alone. Come back from the Home tab.`);
    else if (b.state.crying) tips.push(`<b>${b.name} is crying — ${b.state.cryCause}.</b> Walk over, pick ${b.sex === 'girl' ? 'her' : 'him'} up and fix the cause. Fast responses build trust.`);
    else if (b.needs.fullness < 40) tips.push(`<b>Getting hungry.</b> Prepare a bottle at the kitchen counter, then feed.`);
    else if (b.needs.diaper < 45) tips.push(`<b>Diaper is filling up.</b> Change it at the changing table before it causes a rash.`);
    else if (b.state.needsBurp) tips.push(`<b>Needs a burp</b> after that feed.`);
    else if (b.state.activity !== 'sleeping' && b.needs.rest < 30) tips.push(`<b>Overtired.</b> Rock ${b.name} and put ${b.sex === 'girl' ? 'her' : 'him'} down on ${b.sex === 'girl' ? 'her' : 'his'} back in the crib.`);
    else if (b.state.activity !== 'sleeping' && b.needs.stimulation < 40) tips.push(`<b>Bored.</b> Talk, sing, read or play with an age-appropriate toy.`);
    else if (view.house.doorPackages.length) tips.push(`<b>Delivery at the door.</b> Go collect it.`);
    else if (view.house.nurseHere) tips.push(`<b>The nurse is at the door</b> for vaccines.`);
    else if (b.schedule.nextCheckup && view.sim.days >= b.schedule.nextCheckup.dueDays - 1) tips.push(`<b>${b.schedule.nextCheckup.label} is due.</b> Call the doctor from the phone (Health tab).`);
    else if (b.state.activity === 'sleeping') tips.push(`<b>${b.name} is asleep.</b> Time moves faster. Keep an ear out — wash bottles, order supplies, rest.`);
    else tips.push(`<b>All good.</b> Cuddle, talk and play — this is where trust and development grow.`);
    if (view.inventory.formula < 5 && view.sim.days < 400) tips.push(`Formula is running low — order more.`);
    el.innerHTML = tips.join('<br>'); el.classList.remove('hidden');
  }

  renderToasts() {
    const el = this.$('toasts'); el.innerHTML = '';
    for (const t of store.toasts.slice(-4)) {
      const d = document.createElement('div'); d.className = `toast ${t.sev}`;
      d.innerHTML = `${icon(SEV_ICON[t.sev] || 'bulb')}<span>${escapeHtml(t.text)}</span>`;
      el.appendChild(d);
    }
  }

  // ---- action bar -----------------------------------------------------------
  // Every action stays in the DOM (grouped by category) so nothing is lost when switching tabs;
  // only the selected group is visible.
  setActions(list) {
    const el = this.$('actions'), cats = this.$('act-cats');
    el.innerHTML = ''; cats.innerHTML = ''; this.groups = new Map();
    if (!list || !list.length) { cats.classList.add('hidden'); return; }
    const hints = [];
    const byCat = new Map(CATS.map(([id]) => [id, []]));
    for (const a of list) {
      if (a.hint) { hints.push(a.hint); continue; }
      const cat = byCat.has(a.cat) ? a.cat : guessCat(a.label);
      byCat.get(cat).push(a);
    }
    for (const h of hints) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = h; el.appendChild(d); }
    const live = CATS.filter(([id]) => byCat.get(id).length);
    if (!live.length) { cats.classList.add('hidden'); return; }
    if (!live.some(([id]) => id === this.cat)) this.cat = live[0][0];
    for (const [id, label] of live) {
      const items = byCat.get(id);
      const b = document.createElement('button');
      b.className = `cat${id === this.cat ? ' on' : ''}${id === 'temper' ? ' danger' : ''}`;
      b.dataset.cat = id;
      b.innerHTML = `${icon(CAT_ICON[id] || 'dot')}<span>${label}</span><i class="n">${items.length}</i>`;
      b.onclick = () => this.selectCat(id);
      cats.appendChild(b);
      const g = document.createElement('div');
      g.className = `catgroup${id === this.cat ? ' on' : ''}`; g.dataset.cat = id;
      for (const a of items) {
        const btn = document.createElement('button');
        btn.textContent = a.label; btn.className = a.cls || ''; btn.disabled = !!a.disabled; btn.onclick = a.run;
        g.appendChild(btn);
      }
      el.appendChild(g); this.groups.set(id, g);
    }
    cats.classList.toggle('hidden', live.length < 2);
  }

  selectCat(id) {
    this.cat = id;
    for (const b of this.$('act-cats').children) b.classList.toggle('on', b.dataset.cat === id);
    for (const [cid, g] of this.groups) g.classList.toggle('on', cid === id);
  }

  /**
   * In-world label above the baby.
   * `opts` may be a legacy boolean (crying) or { cry, mood, icon }.
   */
  setBabyLabel(screenPos, text, opts = {}) {
    const el = this.$('baby-label');
    if (!screenPos) { el.style.opacity = 0; return; }
    const o = typeof opts === 'boolean' ? { cry: opts } : (opts || {});
    el.style.opacity = 1; el.style.left = `${screenPos.x}px`; el.style.top = `${screenPos.y}px`;
    const col = o.mood == null ? null : moodColor(o.mood);
    el.innerHTML = `${o.icon ? icon(o.icon) : ''}<span>${escapeHtml(text)}</span>`;
    el.style.borderColor = o.cry ? 'rgba(235,87,87,0.6)' : col || '';
    el.style.setProperty('--mood', col || 'var(--muted)');
    el.classList.toggle('cry', !!o.cry);
    el.classList.toggle('tinted', !!col);
  }

  progress(label, frac) {
    const el = this.$('progress');
    if (label == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); this.$('progress-label').textContent = label; this.$('progress-fill').style.width = `${Math.round(frac * 100)}%`;
  }

  badge(n) { const b = this.$('fab-badge'); if (n > 0) { b.textContent = n; b.classList.remove('hidden'); } else b.classList.add('hidden'); }

  /** Current mood snapshot (used for the in-world label tint). */
  moodOf(view) { return moodOf(view); }
}
