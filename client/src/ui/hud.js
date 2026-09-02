// Heads-up display: top bar, vitals strip, in-world baby label, toasts, progress ring, hints.
import { store } from '../state.js';
import { NEED_LABELS, ageLabel, TIME } from '/shared/constants.js';

const ICONS = { fullness: '🍼', rest: '😴', diaper: '🧷', clean: '🛁', comfort: '🧸', stimulation: '🎈', affection: '❤️', health: '🩺' };
const MOOD_TEXT = { sleeping: 'Sleeping', sick_sleep: 'Sleeping (sick)', crying: 'Crying', screaming: 'Screaming', sick: 'Feeling sick', scared: 'Scared', fussy: 'Fussy', playing: 'Playing', happy: 'Happy', content: 'Content', calm: 'Calm', withdrawn: 'Withdrawn', hospital: 'In hospital', gone: 'Gone' };
const MOOD_ICON = { sleeping: '😴', sick_sleep: '🤒', crying: '😢', screaming: '😭', sick: '🤒', scared: '😨', fussy: '😖', playing: '🧸', happy: '😊', content: '🙂', calm: '😌', withdrawn: '😶', hospital: '🏥', gone: '🕊️' };

export class HUD {
  constructor(ui, { onSpeed, onPhone, onChat, onGoTo }) {
    this.ui = ui; this.onSpeed = onSpeed;
    ui.insertAdjacentHTML('beforeend', `
      <div class="topbar">
        <div class="pill"><span class="dot" id="conn"></span><span class="name" id="hud-name">—</span><span id="hud-age" style="color:var(--muted)"></span></div>
        <div class="pill" id="hud-clock">☀️ 10:00 · Day 1</div>
        <div class="spacer"></div>
        <div class="pill speed" id="hud-speed"></div>
      </div>
      <div class="vitals" id="vitals"><div class="head"><span class="mood" id="hud-mood">—</span><span id="hud-toggle">▾</span></div><div class="bars" id="bars"></div></div>
      <div class="hintbox" id="hint"></div>
      <div class="baby-label" id="baby-label" style="opacity:0"></div>
      <div class="toasts" id="toasts"></div>
      <div class="progress hidden" id="progress"><div id="progress-label"></div><div class="track"><div class="fill" id="progress-fill" style="width:0%"></div></div></div>
      <div class="crosshair" id="crosshair"></div>
      <div class="bottombar">
        <div class="fabs">
          <button class="fab" id="fab-phone" title="Phone">📱<span class="badge hidden" id="fab-badge"></span></button>
          <button class="fab" id="fab-chat" title="Talk to baby">💬</button>
          <button class="fab" id="fab-goto" title="Go to baby">🍼</button>
        </div>
        <div class="actions" id="actions"></div>
      </div>`);
    this.$ = (id) => ui.querySelector('#' + id);
    this.bars = this.$('bars'); this.buildBars();
    this.$('vitals').querySelector('.head').onclick = () => this.$('vitals').classList.toggle('collapsed');
    this.$('fab-phone').onclick = onPhone; this.$('fab-chat').onclick = onChat; this.$('fab-goto').onclick = onGoTo;
    this.speedEl = this.$('hud-speed');
    for (const s of TIME.ONLINE_SCALES) { const b = document.createElement('button'); b.textContent = `${s}×`; b.dataset.s = s; b.onclick = () => onSpeed(s); this.speedEl.appendChild(b); }
    store.on('toast', () => this.renderToasts());
    store.on('view', ({ view }) => this.render(view));
    this.unread = 0;
    if (!('ontouchstart' in window)) this.$('crosshair').style.display = 'block'; else this.$('crosshair').style.display = 'none';
  }

  buildBars() {
    this.bars.innerHTML = '';
    for (const k of Object.keys(ICONS)) this.bars.insertAdjacentHTML('beforeend', `<div class="bar" title="${NEED_LABELS[k]}"><span>${ICONS[k]}</span><div class="track"><div class="fill" id="bar-${k}"></div></div><span class="v" id="val-${k}">–</span></div>`);
  }

  render(view) {
    if (!view) return;
    const b = view.baby;
    this.$('hud-name').textContent = b.name;
    this.$('hud-age').textContent = ageLabel(view.sim.days);
    const h = Math.floor(view.sim.clock / 3600), m = Math.floor((view.sim.clock % 3600) / 60);
    const icon = view.sim.night ? '🌙' : h < 8 || h > 17 ? '🌇' : '☀️';
    this.$('hud-clock').textContent = `${icon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · Day ${Math.floor(view.sim.days) + 1}${view.parent.sitter ? ' · 👩‍🍼 sitter' : ''}${view.parent.away ? ' · 🚪 away' : ''}`;
    for (const k of Object.keys(ICONS)) {
      const v = b.needs[k]; const f = this.$('bar-' + k); f.style.width = `${v}%`; f.className = 'fill ' + (v < 30 ? 'low' : v < 55 ? 'mid' : '');
      this.$('val-' + k).textContent = Math.round(v);
    }
    const mood = b.mood;
    let moodText = `${MOOD_ICON[mood] || '🙂'} ${MOOD_TEXT[mood] || mood}`;
    if (b.state.crying) moodText += ` · ${b.state.cryCause}`;
    this.$('hud-mood').textContent = moodText;
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
    for (const t of store.toasts.slice(-4)) { const d = document.createElement('div'); d.className = `toast ${t.sev}`; d.textContent = t.text; el.appendChild(d); }
  }

  setActions(list) {
    const el = this.$('actions'); el.innerHTML = '';
    if (!list.length) return;
    for (const a of list) {
      if (a.hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = a.hint; el.appendChild(h); continue; }
      const b = document.createElement('button'); b.textContent = a.label; b.className = a.cls || ''; b.disabled = !!a.disabled; b.onclick = a.run; el.appendChild(b);
    }
  }

  setBabyLabel(screenPos, text, cry) {
    const el = this.$('baby-label');
    if (!screenPos) { el.style.opacity = 0; return; }
    el.style.opacity = 1; el.style.left = `${screenPos.x}px`; el.style.top = `${screenPos.y}px`; el.textContent = text; el.classList.toggle('cry', !!cry);
  }

  progress(label, frac) {
    const el = this.$('progress');
    if (label == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); this.$('progress-label').textContent = label; this.$('progress-fill').style.width = `${Math.round(frac * 100)}%`;
  }

  badge(n) { const b = this.$('fab-badge'); if (n > 0) { b.textContent = n; b.classList.remove('hidden'); } else b.classList.add('hidden'); }
}
