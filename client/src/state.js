// Tiny observable store shared by the 3D scene and the UI.
export const store = {
  view: null, catalog: null, user: null, gameId: null, status: 'offline', llm: false,
  toasts: [], listeners: new Map(), lastEvents: [], awaySummary: null, playdate: null, holding: null, nearBaby: false,
  on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, new Set()); this.listeners.get(evt).add(fn); return () => this.listeners.get(evt).delete(fn); },
  emit(evt, data) { const s = this.listeners.get(evt); if (s) for (const fn of s) { try { fn(data); } catch (e) { console.error(e); } } },
  setView(view, events = []) {
    const prev = this.view; this.view = view; this.lastEvents = events;
    this.emit('view', { view, prev, events });
    for (const e of events) this.emit('event', e);
  },
  toast(text, sev = 'info', ms = 4200) {
    const t = { id: Math.random().toString(36).slice(2), text, sev, until: Date.now() + ms };
    this.toasts.push(t); this.emit('toast', t);
    setTimeout(() => { this.toasts = this.toasts.filter((x) => x !== t); this.emit('toast', null); }, ms);
  },
};

// ---- small shared UI helpers (used by the HUD, sheets, alerts and modals) ----
export function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export function reduceMotion() { return !!(RM && RM.matches); }

// Short haptic pulse on phones that support it; silently ignored elsewhere and when motion is reduced.
export function haptic(pattern = 12) { try { if (!reduceMotion() && navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ } }

// Drag/swipe a bottom sheet downward to dismiss it. Returns a teardown function.
export function enableSwipeDown(panel, onClose, handleSel = null) {
  if (!panel) return () => {};
  let y0 = null, dy = 0, active = false;
  const target = handleSel ? panel.querySelector(handleSel) || panel : panel;
  const start = (e) => {
    const t = e.touches ? e.touches[0] : e; const el = e.target;
    // never hijack a scrolling list, an input or a button press
    if (el.closest && el.closest('input,textarea,select,button,[data-noswipe]')) return;
    const scroller = el.closest && el.closest('.body, .msgs, .games-list');
    if (scroller && scroller.scrollTop > 2) return;
    y0 = t.clientY; dy = 0; active = true; panel.style.transition = 'none';
  };
  const move = (e) => {
    if (!active) return; const t = e.touches ? e.touches[0] : e;
    dy = t.clientY - y0;
    if (dy <= 0) { panel.style.transform = ''; return; }
    panel.style.transform = `translateY(${dy}px)`;
    if (e.cancelable && dy > 8) e.preventDefault();
  };
  const end = () => {
    if (!active) return; active = false; panel.style.transition = '';
    if (dy > 90) { panel.style.transform = ''; haptic(8); onClose(); } else panel.style.transform = '';
  };
  target.addEventListener('touchstart', start, { passive: true });
  target.addEventListener('touchmove', move, { passive: false });
  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);
  return () => { target.removeEventListener('touchstart', start); target.removeEventListener('touchmove', move); target.removeEventListener('touchend', end); target.removeEventListener('touchcancel', end); };
}
