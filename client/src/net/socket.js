// Live game socket with auto-reconnect. Emits 'state', 'events', 'playdate', 'status'.
export class GameSocket {
  constructor(token, gameId, handlers) {
    this.token = token; this.gameId = gameId; this.h = handlers; this.ws = null; this.closed = false; this.retry = 0; this.reqId = 0; this.pending = new Map();
    this.connect();
  }
  connect() {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}&game=${encodeURIComponent(this.gameId)}`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.h.status?.('online'); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'state') { this.h.state?.(m.view, m.events || [], m); }
      else if (m.type === 'action_result') { const p = this.pending.get(m.reqId); if (p) { this.pending.delete(m.reqId); p(m); } }
      else if (m.type === 'playdate') this.h.playdate?.(m);
    };
    ws.onclose = () => { this.h.status?.('offline'); if (!this.closed) { const d = Math.min(8000, 500 * Math.pow(2, this.retry++)); setTimeout(() => this.connect(), d); } };
    ws.onerror = () => { /* onclose handles */ };
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; } return false; }
  action(id, params) {
    return new Promise((resolve) => {
      const reqId = ++this.reqId;
      if (!this.send({ type: 'action', id, params, reqId })) return resolve({ ok: false, message: 'Offline — reconnecting…' });
      this.pending.set(reqId, resolve);
      setTimeout(() => { if (this.pending.has(reqId)) { this.pending.delete(reqId); resolve({ ok: false, message: 'No response from the server.' }); } }, 8000);
    });
  }
  close() { this.closed = true; if (this.ws) this.ws.close(); }
}
