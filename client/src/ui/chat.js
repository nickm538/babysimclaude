// Live text chat with the baby (server-side AI with rule-based fallback). Tone has consequences.
import { store } from '../state.js';
import { api } from '../net/api.js';

export class Chat {
  constructor(overlay, ctx) { this.overlay = overlay; this.ctx = ctx; this.el = null; this.msgs = []; this.busy = false; }
  async open() {
    if (this.el) return;
    this.el = document.createElement('div'); this.el.className = 'chat';
    this.el.innerHTML = `<div class="llm" id="chat-llm"></div><div class="msgs" id="chat-msgs"></div><form id="chat-form"><input id="chat-input" placeholder="Talk to ${store.view?.baby.name || 'the baby'}…" autocomplete="off" maxlength="400"><button class="primary" type="submit">Say</button><button type="button" class="ghost" id="chat-close">✕</button></form>`;
    this.overlay.appendChild(this.el);
    this.el.querySelector('#chat-close').onclick = () => this.close();
    this.el.querySelector('#chat-form').onsubmit = (e) => { e.preventDefault(); this.send(); };
    this.el.querySelector('#chat-llm').textContent = store.llm ? 'Live AI (Claude) — the baby responds to what you say and how you say it.' : 'Rule-based responses (add ANTHROPIC_API_KEY on the server for live AI). Tone still matters.';
    try { const r = await api.chatHistory(store.gameId); this.msgs = (r.messages || []).map((m) => ({ role: m.role, content: m.content, tone: m.tone })); } catch { /* ignore */ }
    this.render();
    if (!('ontouchstart' in window)) this.el.querySelector('#chat-input').focus();
  }
  close() { if (this.el) { this.el.remove(); this.el = null; } this.ctx.onClose?.(); }
  toggle() { if (this.el) this.close(); else this.open(); }
  render() {
    if (!this.el) return;
    const box = this.el.querySelector('#chat-msgs');
    box.innerHTML = this.msgs.slice(-40).map((m) => (m.role === 'event'
      ? `<div class="msg event ${escapeHtml(m.kind || '')}">${escapeHtml(m.content)}</div>`
      : `<div class="msg ${m.role}">${escapeHtml(m.content)}${m.role === 'parent' && m.tone ? `<div class="tone ${m.tone}">${m.tone}</div>` : ''}</div>`)).join('') || `<div class="msg baby">${store.view?.baby.name || 'The baby'} looks at you.</div>`;
    if (this.busy) box.insertAdjacentHTML('beforeend', '<div class="msg baby">…</div>');
    box.scrollTop = box.scrollHeight;
  }
  async send() {
    const input = this.el.querySelector('#chat-input'); const text = input.value.trim(); if (!text || this.busy) return;
    input.value = '';
    if (!this.ctx.nearBaby()) { store.toast(`Walk closer to ${store.view.baby.name} so ${store.view.baby.sex === 'girl' ? 'she' : 'he'} can hear you.`, 'warn'); input.value = text; return; }
    this.msgs.push({ role: 'parent', content: text }); this.busy = true; this.render();
    this.ctx.onSpeak?.(text);
    try {
      const r = await api.chat(store.gameId, text);
      this.msgs[this.msgs.length - 1].tone = r.tone;
      this.msgs.push({ role: 'baby', content: r.reply });
      if (r.game) store.setView(r.game);
      if (r.tone === 'harsh') store.toast('That was harsh. Trust and happiness took a hit.', 'danger');
      // What the words themselves did, and whether a request was actually carried out. These are
      // shown in the thread rather than as toasts, because they are part of the conversation.
      const words = Array.isArray(r.words) ? r.words : [];
      if (words.includes('cruel')) store.toast(`${store.view.baby.name} understood that. Self-esteem and trust dropped hard.`, 'danger', 8000);
      else if (words.includes('praise')) store.toast('Praise lands. Self-esteem up.', 'good');
      else if (words.includes('repair')) store.toast('Apologising after losing your temper genuinely helps.', 'good', 6000);
      if (r.outcome && r.outcome.text) {
        this.msgs.push({ role: 'event', content: r.outcome.text, kind: r.outcome.kind });
        if (r.outcome.kind === 'obeyed') this.ctx.onDid?.(r.outcome);
      }
      this.ctx.onReply?.(r.reply, r.tone);
    } catch (e) { this.msgs.push({ role: 'baby', content: `(${e.message})` }); }
    this.busy = false; this.render();
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
