// Full-screen flows: sign in, choose/create a baby, welcome-back summary, death and win screens.
import { store } from '../state.js';
import { api } from '../net/api.js';
import { ageLabel } from '/shared/constants.js';

const SKIN = ['#f6d3c1', '#eec3a8', '#d9a982', '#b97a52', '#8c5a3c', '#5b3a29'];
const HAIR = ['#1a1210', '#3b2417', '#6b4423', '#a56a35', '#d9b36b', '#c74b2a'];
const EYES = ['#3b2413', '#5b3a1e', '#2f6c5b', '#3d6ea8', '#6b8ea9', '#7a7a4a'];

function screen(overlay, html) { const el = document.createElement('div'); el.className = 'screen'; el.innerHTML = `<div class="card">${html}</div>`; overlay.appendChild(el); return el; }

export function authScreen(overlay) {
  return new Promise((resolve) => {
    const el = screen(overlay, `<h1>🍼 Cradle</h1><p>A real-time simulation of bringing a newborn home and raising them to five. Your choices are the whole game.</p>
      <label>Name</label><input id="au-user" placeholder="3–20 letters or numbers" autocomplete="username">
      <label>Password</label><input id="au-pass" type="password" placeholder="at least 4 characters" autocomplete="current-password">
      <div class="err" id="au-err"></div>
      <div class="row"><button class="primary" id="au-login">Sign in</button><button id="au-register">Create account</button></div>
      <p style="margin-top:12px;font-size:12px">Progress is saved on the server. The baby keeps living at 2× real time while you're away — the first 24 baby-hours with nobody there, and anything longer covered by a stand-in carer who feeds and changes but never cuddles.</p>`);
    const err = el.querySelector('#au-err');
    const go = async (fn) => {
      const u = el.querySelector('#au-user').value.trim(), p = el.querySelector('#au-pass').value;
      err.textContent = '';
      try { const r = await fn(u, p); api.setToken(r.token); store.user = r.user; el.remove(); resolve(r.user); } catch (e) { err.textContent = e.message; }
    };
    el.querySelector('#au-login').onclick = () => go(api.login);
    el.querySelector('#au-register').onclick = () => go(api.register);
    el.querySelector('#au-pass').onkeydown = (e) => { if (e.key === 'Enter') go(api.login); };
  });
}

export function gameSelectScreen(overlay, games) {
  return new Promise((resolve) => {
    const active = games.filter((g) => g.status === 'active');
    const list = games.slice(0, 8).map((g) => `<button data-id="${g.id}"><span>${g.babyName} · ${ageLabel(g.simTime / 86400)}</span><span class="tag ${g.status}">${g.status}</span></button>`).join('');
    const el = screen(overlay, `<h1>Welcome${store.user ? ', ' + store.user.username : ''}</h1><p>${active.length ? 'Continue with your baby or start a new one.' : 'Start your first day home.'}</p>
      <div class="games-list">${list}</div>
      <h2 style="margin-top:14px">New baby</h2>
      <label>Baby's name</label><input id="ng-name" placeholder="e.g. Ava, Leo, Sam" maxlength="24">
      <label>Sex</label><div class="seg" id="ng-sex"><button class="on" data-v="girl">Girl</button><button data-v="boy">Boy</button></div>
      <label>Skin</label><div class="swatches" id="ng-skin">${SKIN.map((c, i) => `<div class="swatch ${i === 1 ? 'on' : ''}" style="background:${c}" data-v="${c}"></div>`).join('')}</div>
      <label>Hair</label><div class="swatches" id="ng-hair">${HAIR.map((c, i) => `<div class="swatch ${i === 1 ? 'on' : ''}" style="background:${c}" data-v="${c}"></div>`).join('')}</div>
      <label>Eyes</label><div class="swatches" id="ng-eyes">${EYES.map((c, i) => `<div class="swatch ${i === 0 ? 'on' : ''}" style="background:${c}" data-v="${c}"></div>`).join('')}</div>
      <label>Your name (the parent)</label><input id="ng-parent" placeholder="What the baby will call you" maxlength="24" value="Mama">
      <div class="err" id="ng-err"></div>
      <button class="primary" id="ng-go" style="width:100%;margin-top:10px">Bring the baby home</button>
      <button class="ghost" id="ng-signout" style="width:100%;margin-top:8px">Sign out</button>`);
    for (const b of el.querySelectorAll('.games-list button')) b.onclick = () => { el.remove(); resolve({ id: b.dataset.id }); };
    const pickers = ['ng-sex', 'ng-skin', 'ng-hair', 'ng-eyes'];
    for (const id of pickers) { const box = el.querySelector('#' + id); box.onclick = (e) => { const t = e.target.closest('[data-v]'); if (!t) return; for (const c of box.children) c.classList.remove('on'); t.classList.add('on'); }; }
    const val = (id) => el.querySelector(`#${id} .on`).dataset.v;
    el.querySelector('#ng-go').onclick = async () => {
      try {
        const r = await api.createGame({ babyName: el.querySelector('#ng-name').value.trim(), sex: val('ng-sex'), parentName: el.querySelector('#ng-parent').value.trim() || 'Mama', appearance: { skinTone: val('ng-skin'), hairColor: val('ng-hair'), eyeColor: val('ng-eyes') } });
        el.remove(); resolve({ id: r.game.id, fresh: true });
      } catch (e) { el.querySelector('#ng-err').textContent = e.message; }
    };
    el.querySelector('#ng-signout').onclick = () => { api.setToken(null); location.reload(); };
  });
}

export function awayModal(overlay, summary, view) {
  return new Promise((resolve) => {
    const el = document.createElement('div'); el.className = 'modal';
    const span = summary.hours >= 48 ? `${(summary.hours / 24).toFixed(1)} days` : `${summary.hours} hours`;
    el.innerHTML = `<div class="card"><h1>Welcome back</h1><p>You were away for <b>${span}</b> of ${view.baby.name}'s life.</p>
      ${summary.carer ? `<p style="color:var(--warn)">You were gone long enough that <b>${summary.carer}</b> had to step in. ${view.baby.name} was kept fed and dry — but not held, not played with, and not by you.</p>` : ''}
      ${summary.chapterTitle ? `<p style="color:var(--muted)"><b>${summary.chapterTitle}</b></p>` : ''}
      ${summary.chapter ? `<p style="color:var(--text);font-style:italic">${summary.chapter}</p>` : ''}
      <p style="color:var(--text)"><b>Right now:</b> ${summary.now}</p>
      ${summary.danger.length ? `<div class="journal">${summary.danger.map((d) => `<div class="e danger">${d}</div>`).join('')}</div>` : ''}
      ${summary.notable.length ? `<div class="journal">${summary.notable.map((d) => `<div class="e">${d}</div>`).join('')}</div>` : ''}
      <button class="primary" style="width:100%;margin-top:10px">Go to ${view.baby.name}</button></div>`;
    overlay.appendChild(el);
    el.querySelector('button').onclick = () => { el.remove(); resolve(); };
  });
}

export function deathModal(overlay, view, onRestart) {
  const el = document.createElement('div'); el.className = 'modal death';
  const d = view.death;
  el.innerHTML = `<div class="card"><h1>🕊️ ${view.baby.name} has died</h1><p style="color:var(--text)">${d.text}</p><p>${ageLabel(d.ageDays)}.</p>
    <div class="bigstat"><div><b>${Math.round(view.baby.emo.trust)}</b><span>trust</span></div><div><b>${view.baby.history.criesAnswered}/${view.baby.history.criesTotal}</b><span>cries answered</span></div><div><b>${Math.round(view.baby.history.unansweredCryMin / 60)}h</b><span>crying alone</span></div></div>
    <p>Hunger hours ${view.baby.history.hungerH.toFixed(1)} · wet hours ${view.baby.history.wetH.toFixed(1)} · yells ${view.stats.yells} · screams ${view.stats.screams} · left alone ${view.stats.leaves} · doctor visits ${view.stats.doctorVisits}.</p>
    <p>Babies die from starvation, untreated illness, unsafe sleep, accidents in an unsafe home, poisoning, or the slow collapse of neglect. Every one of those was preventable.</p>
    <button class="primary" style="width:100%">Start over with a new baby</button></div>`;
  overlay.appendChild(el);
  el.querySelector('button').onclick = () => { el.remove(); onRestart(); };
  return el;
}

export function winModal(overlay, view, onRestart) {
  const el = document.createElement('div'); el.className = 'modal win';
  const w = view.win;
  el.innerHTML = `<div class="card"><h1>🎉 ${view.baby.name} is five!</h1><p style="color:var(--text)">Outcome: <b>${w.grade}</b> — score ${w.score}/100.</p>
    <div class="bigstat"><div><b>${Math.round(view.baby.needs.health)}</b><span>health</span></div><div><b>${Math.round(view.baby.emo.happiness)}</b><span>happiness</span></div><div><b>${Math.round(view.baby.emo.trust)}</b><span>trust</span></div><div><b>${w.devAvg}</b><span>development</span></div></div>
    <p>Attachment: <b>${w.attachment}</b>. Milestones: ${Object.keys(view.baby.milestones).length}. Playdates: ${view.stats.playdates}. Lessons: ${view.stats.lessons}. Doctor visits: ${view.stats.doctorVisits}.</p>
    <p>${w.score >= 88 ? 'A thriving, secure, curious kid. You did the hard, unglamorous things on time, every time.' : w.score >= 72 ? 'A healthy, happy child. Some rough patches, but love and consistency won.' : w.score >= 55 ? 'Your child made it, but carries the marks of the hard days: less trust, slower skills. Still, they are here.' : 'Your child survived. That is not the same as being okay.'}</p>
    <button class="primary" style="width:100%">Raise another baby</button><button class="ghost" style="width:100%;margin-top:8px" id="win-stay">Keep visiting ${view.baby.name}</button></div>`;
  overlay.appendChild(el);
  el.querySelector('.primary').onclick = () => { el.remove(); onRestart(); };
  el.querySelector('#win-stay').onclick = () => el.remove();
  return el;
}

export function chooserModal(overlay, title, options, opts = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div'); el.className = 'modal';
    el.innerHTML = `<div class="card"><h2>${title}</h2>${opts.text ? `<p>${opts.text}</p>` : ''}<div class="games-list">${options.map((o, i) => `<button data-i="${i}" class="${o.cls || ''}">${o.label}${o.sub ? `<span class="tag">${o.sub}</span>` : ''}</button>`).join('')}</div><button class="ghost" id="ch-cancel" style="width:100%">Cancel</button></div>`;
    overlay.appendChild(el);
    el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { el.remove(); resolve(options[Number(b.dataset.i)]); });
    el.querySelector('#ch-cancel').onclick = () => { el.remove(); resolve(null); };
  });
}
