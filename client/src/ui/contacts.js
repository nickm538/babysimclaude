// The Family tab: the people around you and the baby — grandparents, friends, neighbours, the
// playgroup — plus whoever is currently standing in your living room.
import { store, escapeHtml } from '../state.js';
import { api } from '../net/api.js';

const REL_ICON = {
  grandma: '👵', grandpa: '👴', aunt: '👩', uncle: '👨', friend: '🧑', neighbor: '🏠',
  nurse: '👩‍⚕️', coworker: '🧑‍💼', parent_friend: '👨‍👦',
};

const bar = (v, cls = '') => `<div class="track"><div class="fill ${cls}" style="width:${Math.max(0, Math.min(100, v))}%"></div></div>`;
// Mirrors the server's gates in applySocialAction('babysit') so the button never lies about what it will do.
const canSit = (c, s) => c.availableNow && !s.visitor && c.relationship >= 35 && !!c.skills && c.skills.babysitting >= 0.3;
function sitBlocker(c, s) {
  if (s.visitor) return `${s.visitor.name} is already here`;
  if (!c.availableNow) return `${c.name} is not free right now`;
  if (c.relationship < 35) return `${c.name} is not close enough yet — call, visit, send photos`;
  if (!c.skills || c.skills.babysitting < 0.3) return `${c.name} would not know what to do with a baby`;
  return '';
}
const ago = (min) => (min == null ? 'never' : min < 60 ? `${Math.round(min)} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`);

export function renderContacts(view) {
  const s = view.social;
  if (!s) return '<div class="section"><p>Loading your contacts…</p></div>';
  const days = view.sim.days;
  let html = '';

  if (s.visitor) {
    html += `<div class="section" style="border-color:rgba(111,207,151,0.5)"><h3>Right now</h3>
      <p><b>${escapeHtml(s.visitor.name)}</b> (${escapeHtml(s.visitor.relation)}) is here — ${escapeHtml(s.visitor.activity || 'visiting')}. Leaving in about ${s.visitor.minutesLeft} min.</p></div>`;
  } else if (s.pendingVisit) {
    html += `<div class="section"><h3>On the way</h3><p><b>${escapeHtml(s.pendingVisit.name || 'A visitor')}</b> arrives in about ${s.pendingVisit.etaMin} min.</p></div>`;
  }

  if (s.invitations.length) {
    html += `<div class="section"><h3>Messages</h3>${s.invitations.map((i) => `
      <div class="item" style="margin-bottom:8px">
        <div class="t">${escapeHtml(i.name)} · ${escapeHtml(i.kind.replace('_', ' '))}</div>
        <div class="s">${escapeHtml(i.text)}</div>
        <div class="s" style="opacity:.7">expires in ${i.expiresInMin} min</div>
        <div style="display:flex;gap:6px">
          <button class="primary" data-inv="${i.id}" data-accept="1">Accept</button>
          <button class="ghost" data-inv="${i.id}" data-accept="0">Decline</button>
        </div>
      </div>`).join('')}</div>`;
  }

  html += `<div class="section"><h3>Playgroup</h3>
    <p>${s.playgroup.enrolled
      ? `Enrolled — ${escapeHtml(s.playgroup.dayLabel)}s at ${s.playgroup.hour}:00. ${s.playgroup.active ? '<b>Happening now.</b>' : s.playgroup.nextInMin != null ? `Next session in ${Math.round(s.playgroup.nextInMin / 60)} h.` : ''} Attended ${s.playgroup.attends}×.`
      : `A weekly group of parents and babies. Great for social skills — and for catching every cold going round.`}</p>
    <button class="${s.playgroup.enrolled ? 'ghost' : 'primary'}" data-playgroup="${s.playgroup.enrolled ? '0' : '1'}">${s.playgroup.enrolled ? 'Leave the playgroup' : 'Join the weekly playgroup'}</button></div>`;

  html += `<div class="section"><h3>People</h3><p>Relationships fade if you never call. Grandparents love photos; some advice is decades out of date — judge it yourself.</p>`;
  for (const c of s.contacts) {
    const tags = [];
    if (c.here) tags.push('<span class="chip good">here now</span>');
    if (c.sitting) tags.push('<span class="chip good">babysitting</span>');
    if (c.onTheWay) tags.push('<span class="chip">on the way</span>');
    if (c.sniffle) tags.push('<span class="chip warn">has a sniffle</span>');
    if (c.strangerRisk) tags.push('<span class="chip warn">a stranger to ' + escapeHtml(view.baby.name) + '</span>');
    if (!c.availableNow) tags.push('<span class="chip">unavailable</span>');
    html += `<div class="item" style="margin-bottom:8px" data-contact="${c.id}">
      <div class="t">${REL_ICON[c.relation] || '🧑'} ${escapeHtml(c.name)} <span style="color:var(--muted);font-weight:400">· ${escapeHtml(c.relationLabel)} · ${escapeHtml(c.personality)}</span></div>
      <div class="s">${escapeHtml(c.availability)} · ${c.distanceMin} min away · last contact ${ago(c.lastContactMin)}</div>
      <div class="devbar"><span>closeness</span>${bar(c.relationship, c.relationship < 30 ? 'low' : c.relationship < 60 ? 'mid' : '')}<span>${c.relationship}</span></div>
      ${tags.length ? `<div class="chips">${tags.join('')}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button data-act="call">Call</button>
        <button data-act="video" ${days < 60 ? 'disabled title="Too young to get much from a screen"' : ''}>Video call</button>
        <button data-act="photo">Send a photo</button>
        <button data-act="invite" ${c.availableNow && !s.visitor && !s.pendingVisit ? '' : 'disabled'}>Invite over</button>
        <button data-act="babysit" ${canSit(c, s) ? '' : `disabled title="${escapeHtml(sitBlocker(c, s))}"`}>Ask to babysit</button>
      </div>
    </div>`;
  }
  html += '</div>';

  if (s.log && s.log.length) {
    html += `<div class="section journal"><h3>Recent</h3>${s.log.slice().reverse().map((l) => `<div class="e ${l.sev || 'info'}">${escapeHtml(l.text || String(l))}</div>`).join('')}</div>`;
  }
  return html;
}

export function bindContacts(body, view, ctx) {
  const send = async (action, payload) => {
    try {
      const r = await api.socialAction(store.gameId, action, payload);
      if (r.game) store.setView(r.game);
      if (r.message) store.toast(r.message, r.ok === false ? 'warn' : 'good', 6000);
      if (Array.isArray(r.lines)) for (const [i, line] of r.lines.entries()) setTimeout(() => store.toast(line, 'info', 7000), i * 900);
      if (r.advice) store.toast(`💬 ${r.advice}`, 'info', 9000);
      ctx?.refresh?.();
    } catch (e) { store.toast(e.message, 'danger'); }
  };

  body.querySelectorAll('[data-contact]').forEach((card) => {
    const contactId = card.dataset.contact;
    card.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => {
        const action = btn.dataset.act;
        if (action === 'babysit') {
          const hours = Number(prompt('For how many hours?', '4'));
          if (!Number.isFinite(hours) || hours <= 0) return;
          return send('babysit', { contactId, hours });
        }
        send(action, { contactId });
      };
    });
  });
  body.querySelectorAll('[data-inv]').forEach((btn) => {
    btn.onclick = () => send('respond', { invitationId: btn.dataset.inv, accept: btn.dataset.accept === '1' });
  });
  const pg = body.querySelector('[data-playgroup]');
  if (pg) pg.onclick = () => send('playgroup', { enrolled: pg.dataset.playgroup === '1' });
  void view;
}
