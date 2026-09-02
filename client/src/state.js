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
