// The story journal — a keepsake book of who this child is turning into: temperament and traits,
// life chapters on a vertical timeline, remembered moments, and the raw journal underneath.
// Every field is optional: the server fills view.story in over time.
import { escapeHtml } from '../state.js';
import { icon } from './icons.js';
import { moodColor, moodOf, labelForMood } from './mood.js';
import { fmtSimTime } from './notifications.js';

const TREND_WORDS = { up: 55, rising: 55, improving: 55, better: 45, good: 55, positive: 55, happy: 65, calm: 35, steady: 0, stable: 0, flat: 0, neutral: 0, mixed: -5, hard: -45, rough: -45, down: -55, falling: -55, declining: -55, worse: -55, bad: -55, dark: -75, sad: -50 };

function trendValue(trend) {
  if (trend == null) return null;
  if (typeof trend === 'number') return Math.max(-100, Math.min(100, trend));
  const key = String(trend).toLowerCase().trim();
  if (key in TREND_WORDS) return TREND_WORDS[key];
  const n = Number(key); if (!Number.isNaN(n)) return Math.max(-100, Math.min(100, n));
  return null;
}

function dayRange(c) {
  const a = c.dayStart != null ? Math.round(c.dayStart) + 1 : null;
  const b = c.dayEnd != null ? Math.round(c.dayEnd) + 1 : null;
  if (a == null && b == null) return '';
  if (b == null || b === a) return `Day ${a}`;
  return `Days ${a}–${b}`;
}

function chapterRow(c, i) {
  const v = trendValue(c.moodTrend);
  const col = v == null ? 'var(--muted)' : moodColor(v);
  const highlights = Array.isArray(c.highlights) ? c.highlights : [];
  return `<div class="chap${c.written === false ? ' draft' : ''}">
    <span class="chap-dot" style="background:${col};box-shadow:0 0 0 3px rgba(0,0,0,0.45)"></span>
    <div class="chap-body">
      <div class="chap-head"><b>${escapeHtml(c.title || `Chapter ${c.index != null ? c.index + 1 : i + 1}`)}</b><small>${escapeHtml(dayRange(c))}${v != null ? ` · ${escapeHtml(labelForMood(v))}` : ''}</small></div>
      <p>${escapeHtml(c.summary || (c.written === false ? 'Still being written…' : ''))}</p>
      ${highlights.length ? `<div class="chips">${highlights.slice(0, 6).map((h) => `<span class="chip">${escapeHtml(typeof h === 'string' ? h : h.text || h.label || '')}</span>`).join('')}</div>` : ''}
    </div></div>`;
}

/** Full HTML for the phone's Story tab. `view` is the current server view. */
export function storyHtml(view) {
  const b = view.baby || {};
  const s = view.story || {};
  const traits = Array.isArray(s.traits) ? s.traits : [];
  const chapters = (Array.isArray(s.chapters) ? s.chapters : []).slice().sort((x, y) => (x.index ?? x.dayStart ?? 0) - (y.index ?? y.dayStart ?? 0));
  const memories = Array.isArray(s.memories) ? s.memories.slice().sort((x, y) => (y.t || 0) - (x.t || 0)) : [];
  const journal = Array.isArray(view.journal) ? view.journal.slice().reverse() : [];
  const mood = moodOf(view);

  const who = `<div class="section keepsake">
    <h3>${icon('book')} The book of ${escapeHtml(b.name || 'the baby')}</h3>
    <p class="lede">${escapeHtml(mood.text || '')}</p>
    <div class="kv"><span>Temperament</span><b>${escapeHtml(s.temperament || b.temperament || 'still emerging')}</b></div>
    <div class="kv"><span>Attachment</span><b>${escapeHtml(b.attachment || '—')}</b></div>
    <div class="kv"><span>Mood today</span><b style="color:${moodColor(mood.value)}">${escapeHtml(mood.label)}</b></div>
    ${traits.length ? `<h4>Traits</h4><div class="chips">${traits.map((t) => `<span class="chip good">${escapeHtml(t.label || t.id || '')}${t.day != null ? ` · day ${Math.round(t.day) + 1}` : ''}</span>`).join('')}</div>`
    : '<p>No settled traits yet. They form from how days actually go — how fast you come, how often it is gentle.</p>'}
  </div>`;

  const chaptersHtml = `<div class="section"><h3>Chapters</h3>
    ${chapters.length ? `<div class="timeline">${chapters.map(chapterRow).join('')}</div>`
    : `<p>Chapter one is still being lived${s.currentChapterDay != null ? ` (day ${Math.round(s.currentChapterDay) + 1})` : ''}. Each stretch of ${escapeHtml(b.name || 'the baby')}'s life gets written up here once it ends.</p>`}
  </div>`;

  const memHtml = `<div class="section"><h3>Moments remembered</h3>
    ${memories.length ? `<div class="memories">${memories.slice(0, 40).map((m) => `<div class="mem${(m.weight || 0) >= 2 ? ' big' : ''}"><span class="q">${icon('quote')}</span><div><p>${escapeHtml(m.text || '')}</p><small>${escapeHtml(fmtSimTime(m.t))}${m.kind ? ` · ${escapeHtml(m.kind)}` : ''}</small></div></div>`).join('')}</div>`
    : '<p>Nothing has stuck yet. First smiles, first words, the frightening nights — they all end up on this page.</p>'}
  </div>`;

  const recent = `<div class="section journal"><h3>Recent</h3>
    ${journal.length ? journal.slice(0, 80).map((e) => `<div class="e ${escapeHtml(e.sev || '')}"><small>${escapeHtml(fmtSimTime(e.t))}</small>${escapeHtml(e.text || '')}</div>`).join('') : '<p>Nothing logged yet.</p>'}
  </div>`;

  return who + chaptersHtml + memHtml + recent;
}

/** Short chapter/summary block reused by the "welcome back" modal. */
export function chapterCardHtml(text) {
  if (!text) return '';
  return `<div class="chapter-card">${icon('feather')}<div><h4>While you were gone</h4><p>${escapeHtml(text)}</p></div></div>`;
}
