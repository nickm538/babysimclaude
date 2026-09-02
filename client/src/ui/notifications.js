// Notification centre: slide-in banners for anything that must not be missed, a bell with an unread
// count, and the history list rendered inside the phone's Alerts tab.
// Feeds on view.notifications when the server supplies it, and falls back to the live event stream.
import { store, escapeHtml, haptic, reduceMotion } from '../state.js';
import { icon, KIND_ICON } from './icons.js';

const SEEN_MAX = 300;
const KIND_TITLE = { illness: 'Illness', danger: 'Danger', milestone: 'Milestone', story: 'Story', choice: 'A decision', social: 'Message', package: 'Delivery', info: 'Note' };
const KIND_SEV = { illness: 'danger', danger: 'danger', milestone: 'good', story: 'info', choice: 'warn', social: 'info', package: 'info', info: 'info' };

export function fmtSimTime(t) {
  const s = Math.max(0, Number(t) || 0);
  const d = Math.floor(s / 86400) + 1, h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `Day ${d} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function kindOfEvent(e) {
  const t = String(e.type || '');
  if (/milestone|first_/.test(t)) return 'milestone';
  if (/ill|sick|fever|injur|rash|dehydr|hospital/.test(t)) return 'illness';
  if (/package|delivery|order/.test(t)) return 'package';
  if (/nurse|doorbell|visit|call|friend|playdate/.test(t)) return 'social';
  if (/story|chapter|memory|trait|temperament/.test(t)) return 'story';
  if (/choice|decision/.test(t)) return 'choice';
  if (e.sev === 'danger') return 'danger';
  return 'info';
}

// Turn raw sim events into notification-shaped records (only while the server has no notifications yet).
function fromEvents(events, view) {
  const out = [];
  for (const e of events || []) {
    const sev = e.sev || 'info';
    const kind = kindOfEvent(e);
    const worth = sev === 'danger' || sev === 'warn' || kind === 'milestone' || kind === 'illness' || kind === 'story';
    if (!worth) continue;
    const t = e.t != null ? e.t : (view && view.sim ? view.sim.time : 0);
    out.push({ id: e.id || `${e.type || kind}:${Math.round(t)}`, t, kind, sev, title: KIND_TITLE[kind] || 'Note', text: e.text || '', cta: null, derived: true });
  }
  return out.reverse();
}

export class NotificationCenter {
  constructor(host, ctx = {}) {
    this.host = host; this.ctx = ctx;
    this.items = []; this.byId = new Map();
    this.seen = new Set(); this.dismissed = new Set();
    this.gameId = null; this.bell = null; this.banners = new Map();
    this.host.className = 'alerts';
  }

  // ---- persistence ----
  bindGame(gameId) {
    this.gameId = gameId; this.seen = new Set();
    try { const raw = localStorage.getItem(this.key); if (raw) for (const id of JSON.parse(raw)) this.seen.add(id); } catch { /* first run */ }
  }
  get key() { return `cradle.alerts.${this.gameId || 'anon'}`; }
  persist() { try { localStorage.setItem(this.key, JSON.stringify([...this.seen].slice(-SEEN_MAX))); } catch { /* private mode */ } }

  attachBell(btn) {
    this.bell = btn;
    if (btn) btn.onclick = () => { this.ctx.onOpen?.(); };
    this.renderBell();
  }

  get unread() { return this.items.filter((n) => !this.seen.has(n.id)).length; }

  markAllSeen() {
    for (const n of this.items) this.seen.add(n.id);
    this.persist(); this.renderBell(); this.renderBanners();
  }

  renderBell() {
    if (!this.bell) return;
    const n = this.unread;
    let b = this.bell.querySelector('.badge');
    if (!b) { b = document.createElement('span'); b.className = 'badge'; this.bell.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hidden', n === 0);
    this.bell.classList.toggle('urgent', this.items.some((x) => !this.seen.has(x.id) && (x.kind === 'illness' || x.sev === 'danger')));
  }

  /** Called on every view update. `events` is the raw event batch for the same tick. */
  update(view, events = []) {
    if (!view) return;
    const server = Array.isArray(view.notifications) ? view.notifications : null;
    const list = (server && server.length ? server : fromEvents(events, view)).filter((n) => n && n.id != null);
    const fresh = [];
    for (const n of list) {
      const id = String(n.id);
      if (this.byId.has(id)) { Object.assign(this.byId.get(id), n, { id }); continue; }
      const rec = { t: view.sim ? view.sim.time : 0, kind: 'info', sev: 'info', title: '', text: '', ...n, id };
      rec.sev = rec.sev || KIND_SEV[rec.kind] || 'info';
      rec.title = rec.title || KIND_TITLE[rec.kind] || 'Note';
      this.byId.set(id, rec); this.items.unshift(rec); fresh.push(rec);
    }
    if (this.items.length > 400) this.items.length = 400;
    for (const rec of fresh.reverse()) if (!this.seen.has(rec.id)) this.announce(rec);
    this.renderBell();
    this.renderBanners();
  }

  // sound + haptics + world effects for a brand new notification
  announce(n) {
    const a = this.ctx.audio;
    try {
      const play = (name, fallback) => { if (a && typeof a[name] === 'function') a[name](); else a?.notify?.(fallback); };
      if (n.kind === 'illness') { play('illnessAlert', 'danger'); haptic([40, 70, 40, 70, 160]); }
      else if (n.sev === 'danger') { a?.notify?.('danger'); haptic([30, 60, 30]); }
      else if (n.kind === 'milestone') { play('celebrate', 'good'); haptic(24); }
      else if (n.kind === 'social') { play('callRing', 'info'); haptic([16, 40, 16]); }
      else if (n.kind === 'story') { play('storyChime', 'info'); }
      else if (n.kind === 'choice') { a?.notify?.('info'); haptic(20); }
      else if (n.sev === 'good') a?.notify?.('good');
    } catch { /* audio not unlocked yet */ }
    if (n.kind === 'milestone') this.ctx.onBurst?.('confetti', n);
    else if (n.sev === 'good' || n.kind === 'social') this.ctx.onBurst?.('hearts', n);
  }

  // ---- banners ----
  visibleBanners() {
    return this.items.filter((n) => !this.seen.has(n.id) && !this.dismissed.has(n.id)).slice(0, 3).reverse();
  }

  renderBanners() {
    const want = this.visibleBanners();
    const wantIds = new Set(want.map((n) => n.id));
    for (const [id, el] of this.banners) if (!wantIds.has(id)) { el.remove(); this.banners.delete(id); }
    for (const n of want) {
      if (this.banners.has(n.id)) continue;
      const el = document.createElement('div');
      el.className = `alert ${n.sev || 'info'}${n.kind === 'illness' ? ' illness' : ''}${reduceMotion() ? ' nomotion' : ''}`;
      el.dataset.id = n.id;
      const cta = n.cta && n.cta.action ? `<button class="primary" data-cta>${escapeHtml(n.cta.label || 'Do it')}</button>` : '';
      el.innerHTML = `<span class="ai">${icon(KIND_ICON[n.kind] || 'dot')}</span>
        <div class="ab"><div class="at">${escapeHtml(n.title)}</div><div class="as">${escapeHtml(n.text)}</div></div>
        ${cta}<button class="ax" data-x aria-label="Dismiss">${icon('close')}</button>`;
      el.querySelector('[data-x]').onclick = () => this.dismiss(n.id);
      const c = el.querySelector('[data-cta]');
      if (c) c.onclick = () => { this.dismiss(n.id); this.ctx.onCta?.(n.cta, n); };
      this.host.appendChild(el);
      this.banners.set(n.id, el);
      const sticky = n.sev === 'danger' || n.kind === 'choice';
      if (!sticky) setTimeout(() => this.dismiss(n.id), 9000);
    }
  }

  dismiss(id) {
    this.seen.add(id); this.persist();
    const el = this.banners.get(id);
    if (el) { el.classList.add('out'); const kill = () => { el.remove(); }; setTimeout(kill, reduceMotion() ? 0 : 260); this.banners.delete(id); }
    this.renderBell();
    this.renderBanners();
  }

  // ---- phone history ----
  historyHtml(view) {
    const items = this.items;
    if (!items.length) {
      return `<div class="section"><h3>Alerts</h3><p>Nothing needs your attention. Illnesses, dangers, milestones and messages all land here — and the bell in the corner counts what you haven't read.</p></div>`;
    }
    const unread = this.unread;
    const rows = items.slice(0, 60).map((n) => `<div class="alert-row ${n.sev || 'info'}${this.seen.has(n.id) ? '' : ' new'}">
      <span class="ai">${icon(KIND_ICON[n.kind] || 'dot')}</span>
      <div class="ab"><div class="at">${escapeHtml(n.title)}<small>${fmtSimTime(n.t)}</small></div><div class="as">${escapeHtml(n.text)}</div>
      ${n.cta && n.cta.action ? `<button class="primary sm" data-alert-cta="${escapeHtml(n.id)}">${escapeHtml(n.cta.label || 'Do it')}</button>` : ''}</div></div>`).join('');
    return `<div class="section"><h3>Alerts${unread ? ` · ${unread} new` : ''}</h3>
      ${unread ? '<button class="ghost sm" data-alerts-read style="margin-bottom:8px">Mark all read</button>' : ''}
      <div class="alert-list">${rows}</div></div>`;
  }

  bindHistory(body) {
    if (!body) return;
    const r = body.querySelector('[data-alerts-read]');
    if (r) r.onclick = () => { this.markAllSeen(); store.emit('alerts', null); };
    body.querySelectorAll('[data-alert-cta]').forEach((b) => {
      b.onclick = () => { const n = this.byId.get(b.dataset.alertCta); if (n && n.cta) { this.seen.add(n.id); this.persist(); this.renderBell(); this.ctx.onCta?.(n.cta, n); } };
    });
  }
}
