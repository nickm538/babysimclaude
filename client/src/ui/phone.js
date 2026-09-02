// The "phone": a tabbed sheet for everything done remotely — stats, health & doctor, shop, wardrobe, school, home, friends, journal, settings.
import { store } from '../state.js';
import { api } from '../net/api.js';
import { NEED_LABELS, EMOTION_KEYS, DEV_KEYS, ageLabel, CLOTHING_SIZES, DIAPER_SIZES } from '/shared/constants.js';

const OUTFITS = ['white', 'mint', 'sky', 'peach', 'lilac', 'lemon', 'grey', 'navy', 'rose'];

export class Phone {
  constructor(overlay, ctx) {
    this.overlay = overlay; this.ctx = ctx; this.tab = 'baby'; this.cart = []; this.el = null; this.roomChat = [];
    store.on('view', () => { if (this.el) this.render(); });
  }
  open(tab) { if (tab) this.tab = tab; if (!this.el) { this.el = document.createElement('div'); this.el.className = 'sheet'; this.overlay.appendChild(this.el); this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); }); } this.render(); }
  close() { if (this.el) { this.el.remove(); this.el = null; } this.ctx.onClose?.(); }
  toggle(tab) { if (this.el && (!tab || tab === this.tab)) this.close(); else this.open(tab); }

  render() {
    const v = store.view; if (!v || !this.el) return;
    const tabs = [['baby', '👶 Baby'], ['health', '🩺 Health'], ['shop', '🛒 Shop'], ['wardrobe', '👕 Wardrobe'], ['school', '🎓 School'], ['home', '🏠 Home'], ['friends', '👯 Friends'], ['journal', '📓 Journal'], ['settings', '⚙️']];
    this.el.innerHTML = `<div class="panel"><div class="tabs">${tabs.map(([id, l]) => `<button class="${id === this.tab ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('')}</div><button class="close" id="ph-close">✕</button><div class="body" id="ph-body"></div></div>`;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    this.el.querySelector('#ph-close').onclick = () => this.close();
    const body = this.el.querySelector('#ph-body');
    body.innerHTML = this['tab_' + this.tab](v);
    this.bind(body, v);
  }

  bar(label, val, exp) { const cls = val < 30 ? 'low' : val < 55 ? 'mid' : ''; return `<div class="devbar"><span>${label}</span><div class="track"><div class="fill ${cls}" style="width:${val}%"></div>${exp != null ? `<div class="exp" style="left:${exp}%"></div>` : ''}</div><span>${Math.round(val)}</span></div>`; }

  tab_baby(v) {
    const b = v.baby;
    const pct = b.phys.percentile;
    return `<div class="section"><h3>${b.name} · ${ageLabel(v.sim.days)}</h3>
      <div class="bigstat"><div><b>${b.phys.weightKg.toFixed(2)} kg</b><span>weight · ${pct}th pct</span></div><div><b>${b.phys.heightCm.toFixed(1)} cm</b><span>length</span></div><div><b>${b.phys.teeth}</b><span>teeth</span></div></div>
      <div class="chips"><span class="chip">${b.mood}</span><span class="chip ${b.attachment === 'secure' ? 'good' : b.attachment === 'forming' ? '' : 'danger'}">attachment: ${b.attachment}</span><span class="chip">responsiveness ${Math.round(b.responsiveness * 100)}%</span><span class="chip">${b.state.activity}${b.state.held ? ' · in your arms' : ' · ' + b.state.location.replace('_', ' ')}</span></div></div>
      <div class="section"><h3>Needs (0–100)</h3>${Object.keys(b.needs).map((k) => this.bar(NEED_LABELS[k], b.needs[k])).join('')}</div>
      <div class="section"><h3>Emotional life</h3>${EMOTION_KEYS.map((k) => this.bar(NEED_LABELS[k], b.emo[k])).join('')}<p>Trust and security grow slowly with consistent, fast, gentle responses. Yelling, screaming or leaving ${b.name} alone cause the biggest drops.</p></div>
      <div class="section"><h3>Development (marker = typical for age)</h3>${DEV_KEYS.map((k) => this.bar(NEED_LABELS[k], b.dev[k], b.devExpected)).join('')}
      <h4>Milestones reached (${Object.keys(b.milestones).length})</h4><div class="chips">${Object.entries(b.milestones).map(([id, d]) => `<span class="chip good">${id.replace(/_/g, ' ')} · day ${Math.round(d)}</span>`).join('') || '<span class="chip">none yet</span>'}</div>
      <h4>Coming up</h4><div class="chips">${b.schedule.upcomingMilestones.map((m) => `<span class="chip ${m.late ? 'warn' : ''}">${m.label}${m.late ? ' (late)' : ''}</span>`).join('') || '—'}</div>
      ${b.delays.length ? `<h4>Delays noted</h4><div class="chips">${b.delays.map((d) => `<span class="chip danger">${d.replace(/_/g, ' ')}</span>`).join('')}</div>` : ''}</div>
      <div class="section"><h3>History</h3><div class="kv"><span>Feeds</span><b>${v.stats.feeds}</b></div><div class="kv"><span>Diapers</span><b>${v.stats.diapers}</b></div><div class="kv"><span>Cries · answered</span><b>${b.history.criesTotal} · ${b.history.criesAnswered}</b></div><div class="kv"><span>Unanswered crying</span><b>${Math.round(b.history.unansweredCryMin)} min</b></div><div class="kv"><span>Hours hungry / wet</span><b>${b.history.hungerH.toFixed(1)} / ${b.history.wetH.toFixed(1)}</b></div><div class="kv"><span>Toxic-stress hours</span><b>${b.history.toxicStressH.toFixed(1)}</b></div><div class="kv"><span>Yells / screams / left alone</span><b>${v.stats.yells} / ${v.stats.screams} / ${v.stats.leaves}</b></div><div class="kv"><span>Doctor visits · hazards</span><b>${v.stats.doctorVisits} · ${v.stats.hazards}</b></div></div>`;
  }

  tab_health(v) {
    const b = v.baby, inv = v.inventory;
    const ill = b.illness;
    const meds = ['acetaminophen', 'ibuprofen', 'saline', 'electrolytes'].map((m) => `<div class="item"><div class="t">${m}</div><div class="s">${inv[m] || 0} doses</div><button data-act="medicine" data-id="${m}" ${(inv[m] || 0) <= 0 ? 'disabled' : ''}>Give</button></div>`).join('')
      + b.prescriptions.map((m) => `<div class="item"><div class="t">${m} (Rx)</div><div class="s">prescribed</div><button data-act="medicine" data-id="${m}">Give</button></div>`).join('');
    return `<div class="section"><h3>Right now</h3>
      <div class="bigstat"><div><b>${b.phys.tempC.toFixed(1)}°C</b><span>last temp</span></div><div><b>${Math.round(b.needs.health)}</b><span>health</span></div><div><b>${b.phys.rash > 20 ? 'rash ' + Math.round(b.phys.rash) : 'skin ok'}</b><span>diaper area</span></div></div>
      ${ill ? `<p><b>${ill.label}</b> — severity ${ill.severity}/100, day ${ill.days}. ${ill.known ? (ill.treated ? 'Under treatment.' : 'Diagnosed.') : 'Not yet diagnosed — call the doctor.'}</p>` : '<p>No illness detected. Watch for fever, poor feeding, unusual crying.</p>'}
      ${b.phys.jaundice > 30 ? `<p class="chip warn">Skin looks yellowish (jaundice ${b.phys.jaundice}). Feed often; ask the doctor.</p>` : ''}
      ${b.injuries.length ? `<p>Injuries: ${b.injuries.map((i) => `${i.kind.replace('_', ' ')}${i.severe ? ' (serious)' : ''}, heals in ${i.healsInH}h`).join('; ')}</p>` : ''}
      <div class="row" style="display:flex;gap:8px;margin-top:8px"><button class="primary" data-act="doctor" data-kind="checkup">📞 Telehealth: checkup</button><button data-act="doctor" data-kind="sick">🤒 Telehealth: sick visit</button></div></div>
      <div class="section"><h3>Schedule</h3>
      <p>Next checkup: <b>${b.schedule.nextCheckup ? `${b.schedule.nextCheckup.label} (day ${b.schedule.nextCheckup.dueDays})` : 'all done'}</b>${b.schedule.overdueCheckups.length ? ` · <span class="chip danger">${b.schedule.overdueCheckups.length} missed</span>` : ''}</p>
      <p>Vaccines due: ${b.schedule.vaccinesDue.length ? b.schedule.vaccinesDue.map((x) => `<span class="chip ${x.overdue ? 'danger' : 'warn'}">${x.label}</span>`).join(' ') : '<span class="chip good">up to date</span>'}</p>
      ${v.house.nurseEtaMin != null ? `<p>Nurse ${v.house.nurseHere ? 'is at the door now' : `arrives in ~${Math.round(v.house.nurseEtaMin)} min`}.</p>` : ''}
      <p>Vaccines given: ${Object.keys(b.vaccines).length} · Checkups done: ${Object.keys(b.checkups).length}</p></div>
      <div class="section"><h3>Medicine cabinet</h3><div class="grid">${meds}</div><p>Acetaminophen: not under 2 months without the doctor. Ibuprofen: not under 6 months. Max 5 doses/day, 4–6 h apart.</p>
      <div class="grid" style="margin-top:8px"><div class="item"><div class="t">Vitamin D drops</div><div class="s">${inv.vitamin_d || 0} left</div><button data-act="vitamin_d" ${(inv.vitamin_d || 0) <= 0 ? 'disabled' : ''}>Give daily</button></div></div></div>
      <div class="section"><h3>Doctor's notes</h3>${b.doctorNotes.slice().reverse().map((r) => `<div class="journal"><div class="e ${r.severity === 'ok' ? 'good' : r.severity}"><small>${r.kind} · day ${Math.round(r.at / 86400)}</small>${r.notes.map((n) => `<div>• ${n}</div>`).join('')}${r.advice.length ? `<div style="margin-top:6px;color:var(--muted)">${r.advice.map((a) => `<div>→ ${a}</div>`).join('')}</div>` : ''}</div></div>`).join('') || '<p>No visits yet. The newborn visit is due around day 3–5.</p>'}</div>`;
  }

  tab_shop(v) {
    const cat = store.catalog; if (!cat) return '<p>Loading catalog…</p>';
    const days = v.sim.days, b = v.baby;
    const groups = { food: '🍼 Food', care: '🧷 Care', health: '💊 Health', clothes: '👕 Clothes', toys: '🧸 Toys', home: '🏠 Home & safety' };
    const sizeOpts = (item) => {
      if (item.sized === 'diaper') return `<select data-size>${DIAPER_SIZES.map((s) => `<option ${s === b.wear.neededDiaper ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
      if (item.sized === 'clothing') return `<select data-size>${CLOTHING_SIZES.map((s) => `<option ${s === b.wear.neededSize ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
      if (item.sized === 'toy') return `<select data-size>${cat.toys.map((t) => `<option value="${t.id}" ${v.inventory.toys.includes(t.id) ? 'disabled' : ''}>${t.label}${days < t.minDays ? ' (later)' : days > t.maxDays ? ' (outgrown)' : ''}${v.inventory.toys.includes(t.id) ? ' ✓' : ''}</option>`).join('')}</select>`;
      if (item.sized === 'proofing') return `<select data-size>${cat.proofing.map((p) => `<option value="${p.id}" ${v.house.proofing[p.id] ? 'disabled' : ''}>${p.label}${v.house.proofing[p.id] ? ' ✓' : ''}</option>`).join('')}</select>`;
      return '';
    };
    let html = '<div class="section"><p>Money is no object. Deliveries arrive at the front door in 1.5–8 hours of baby time — bring them in yourself.</p></div>';
    for (const [c, label] of Object.entries(groups)) {
      const items = cat.shop.filter((s) => s.cat === c && (s.minDays == null || days >= s.minDays - 30) && (s.maxDays == null || days <= s.maxDays));
      if (!items.length) continue;
      html += `<div class="section"><h3>${label}</h3><div class="grid">${items.map((it) => `<div class="item" data-item="${it.id}"><div class="t">${it.label}</div><div class="s">${it.warn ? `⚠️ ${it.warn}` : `~${it.deliveryH}h delivery`}${it.key && !it.sized ? ` · have ${typeof v.inventory[it.key] === 'number' ? v.inventory[it.key] : '—'}` : ''}</div>${sizeOpts(it)}<button data-add>Add to cart</button></div>`).join('')}</div></div>`;
    }
    html += `<div class="section"><h3>Orders</h3>${v.orders.length ? v.orders.map((o) => `<div class="kv"><span>${o.items.map((i) => i.label).join(', ')}</span><b>${o.status === 'delivered' ? '📦 at the door' : `~${Math.round(o.etaMin)} min`}</b></div>`).join('') : '<p>No open orders.</p>'}</div>`;
    html += `<div class="cart"><span id="cart-label">${this.cart.length ? `${this.cart.length} item${this.cart.length > 1 ? 's' : ''}: ${this.cart.map((c) => c.label).join(', ')}` : 'Cart is empty'}</span><div style="display:flex;gap:6px"><button class="ghost" data-cart-clear>Clear</button><button class="primary" data-cart-order ${this.cart.length ? '' : 'disabled'}>Order</button></div></div>`;
    return html;
  }

  tab_wardrobe(v) {
    const b = v.baby, inv = v.inventory;
    const sizes = CLOTHING_SIZES.filter((s) => inv.clothes[s] > 0);
    return `<div class="section"><h3>Wearing</h3><p><b>${b.wear.outfitSize} ${b.wear.outfit}</b> (${b.wear.layers}) · needs size <b>${b.wear.neededSize}</b> · diaper size ${b.wear.diaperSize} (needs ${b.wear.neededDiaper})</p>
      ${b.wear.outfitSize !== b.wear.neededSize ? `<p class="chip warn">Outfit doesn't fit — comfort suffers until you dress ${b.name} in ${b.wear.neededSize}.</p>` : '<p class="chip good">Fits well.</p>'}
      <p style="margin-top:8px">Room ${v.house.roomTempC.toFixed(1)}°C. Dress in layers to match: light when warm, warm when cold. Ideal room 20–22°C.</p></div>
      <div class="section"><h3>Dress ${b.name}</h3>${sizes.length ? `<div class="row" style="display:flex;gap:8px"><select id="wd-size">${sizes.map((s) => `<option ${s === b.wear.neededSize ? 'selected' : ''}>${s}</option>`).join('')}</select><select id="wd-outfit">${OUTFITS.map((o) => `<option ${o === b.wear.outfit ? 'selected' : ''}>${o}</option>`).join('')}</select><select id="wd-layers">${['light', 'normal', 'warm'].map((o) => `<option ${o === b.wear.layers ? 'selected' : ''}>${o}</option>`).join('')}</select></div><button class="primary" data-act="dress" style="margin-top:8px">Dress (you must be next to ${b.name})</button>` : '<p>No clothes in the wardrobe. Order some in the shop.</p>'}</div>
      <div class="section"><h3>Closet</h3><div class="chips">${CLOTHING_SIZES.map((s) => `<span class="chip ${inv.clothes[s] > 0 ? '' : ''}" style="opacity:${inv.clothes[s] > 0 ? 1 : 0.4}">${s}: ${inv.clothes[s] || 0}</span>`).join('')}</div>
      <h4>Diapers</h4><div class="chips">${DIAPER_SIZES.map((s) => `<span class="chip" style="opacity:${inv.diapers[s] > 0 ? 1 : 0.4}">size ${s}: ${inv.diapers[s] || 0}</span>`).join('')}</div>
      <p>Wipes ${inv.wipes} · rash cream ${inv.diaper_cream} · baby wash ${inv.baby_wash} · swaddles ${inv.swaddle} · pacifiers ${inv.pacifiers}</p></div>`;
  }

  tab_school(v) {
    const cat = store.catalog; const b = v.baby; const days = v.sim.days;
    const lessons = cat ? cat.lessons : [];
    return `<div class="section"><h3>Homeschool</h3><p>Short, playful lessons build cognitive, language, social and motor skills. More than 4 a day backfires. Most start after 6 months; academics after 2 years.</p>
      <div class="grid">${lessons.map((l) => `<div class="item"><div class="t">${l.label}</div><div class="s">${days >= l.minDays ? `done ${b.counters.lessons[l.id] || 0}×` : `from ${Math.round(l.minDays / 30)} months`}</div><button data-act="lesson" data-id="${l.id}" ${days >= l.minDays && b.state.activity !== 'sleeping' ? '' : 'disabled'}>Teach (next to ${b.name})</button></div>`).join('')}</div></div>
      <div class="section"><h3>Potty training</h3><p>Progress ${Math.round(b.counters.pottyProgress)}%. ${days < 540 ? 'Start around 18 months.' : v.inventory.potty ? 'Sit ' + b.name + ' on the potty regularly, praise, never punish.' : 'Buy a potty seat first.'}</p></div>
      <div class="section"><h3>Play</h3><p>Age-appropriate toys you own: ${b.ageToys.length ? b.ageToys.map((t) => `<span class="chip good">${t.replace(/_/g, ' ')}</span>`).join(' ') : 'none — buy some'}</p><p>Tummy time so far: ${Math.round(b.counters.tummyTimeMin)} min · floor time: ${Math.round(b.counters.floorTimeMin)} min · reads: ${b.counters.reads} · play sessions: ${b.counters.plays}</p></div>`;
  }

  tab_home(v) {
    const cat = store.catalog; const p = v.house.proofing;
    return `<div class="section"><h3>Baby-proofing</h3><p>Once ${v.baby.name} crawls, an unsafe house causes real accidents — especially while you're away.</p><div class="chips">${(cat ? cat.proofing : []).map((x) => `<span class="chip ${p[x.id] ? 'good' : 'danger'}">${x.label} ${p[x.id] ? '✓' : '✗'}</span>`).join('')}</div><p>Buy kits in the shop (Home & safety).</p></div>
      <div class="section"><h3>Climate</h3><p>Thermostat <b>${v.house.thermostatC}°C</b> · room ${v.house.roomTempC.toFixed(1)}°C · season ${v.sim.season}</p><input type="range" min="15" max="28" step="0.5" value="${v.house.thermostatC}" id="thermo-range"><button data-act="thermostat" style="margin-top:6px">Set thermostat</button></div>
      <div class="section"><h3>Babysitter</h3><p>${v.parent.sitter ? `A sitter is here for ${v.parent.sitterHoursLeft.toFixed(1)} more hours.` : `Hire a sitter before you go away. They feed and change, but they don't bond — trust drifts down slightly while you're gone.`}</p><div class="row" style="display:flex;gap:8px"><select id="sitter-h">${[4, 8, 12, 24].map((h) => `<option value="${h}">${h} hours</option>`).join('')}</select><button data-act="babysitter">Book</button></div></div>
      <div class="section"><h3>Equipment</h3><div class="chips">${['playpen', 'high_chair', 'potty', 'toddler_bed', 'white_noise', 'thermometer', 'sleep_sack'].map((k) => `<span class="chip ${v.inventory[k] ? 'good' : ''}">${k.replace('_', ' ')} ${v.inventory[k] ? '✓' : '—'}</span>`).join('')}</div><p>Bottles: ${v.inventory.bottlesClean}/${v.inventory.bottles} clean · formula ${v.inventory.formula} servings</p></div>
      ${v.parent.away ? `<div class="section"><h3>You are away</h3><p>${Math.round(v.parent.awayMinutesLeft)} minutes left. ${v.baby.name} cannot be comforted until you return.</p><button class="primary" data-act="return">Come back now</button></div>` : ''}`;
  }

  tab_friends(v) {
    const pd = store.playdate;
    return `<div class="section"><h3>Playdates</h3><p>Invite another parent over. Both babies share the living room, chat with the other parent, and both children gain social skills. Sick babies spread germs.</p>
      ${pd ? `<p>Active playdate <b>${pd.code}</b>${pd.guest ? ` with ${pd.guest.name} (${ageLabel(pd.guest.days)})` : ' — waiting for a guest to join with your code'}.</p><button class="danger" data-pd-end>End playdate</button>` : `<div class="row" style="display:flex;gap:8px"><button class="primary" data-pd-host>Create invite code</button></div><div class="row" style="display:flex;gap:8px;margin-top:8px"><input id="pd-code" placeholder="Enter a friend's code" maxlength="6" style="text-transform:uppercase"><button data-pd-join>Join</button></div>`}</div>
      ${pd ? `<div class="section"><h3>Parent chat</h3><div class="msgs" id="pd-msgs" style="max-height:200px;overflow:auto">${this.roomChat.map((m) => `<div class="msg ${m.mine ? 'parent' : 'baby'}" style="font-style:normal"><b>${m.from}</b>: ${m.text}</div>`).join('') || '<p>Say hi.</p>'}</div><form id="pd-form" style="display:flex;gap:8px;margin-top:8px"><input id="pd-text" placeholder="Message the other parent"><button class="primary">Send</button></form></div>` : ''}
      <div class="section"><h3>Social history</h3><p>Playdates: ${v.baby.counters.playdates} · social score ${Math.round(v.baby.dev.social)} (typical ${Math.round(v.baby.devExpected)})</p></div>`;
  }

  tab_journal(v) {
    const fmt = (t) => { const d = Math.floor(t / 86400) + 1, h = Math.floor(((t + 36000) % 86400) / 3600), m = Math.floor((t % 3600) / 60); return `Day ${d} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    return `<div class="section journal"><h3>Journal</h3>${v.journal.slice().reverse().map((e) => `<div class="e ${e.sev}"><small>${fmt(e.t)}</small>${e.text}</div>`).join('')}</div>`;
  }

  tab_settings(v) {
    return `<div class="section"><h3>Time</h3><p>Speed while you play: <b>${v.settings.timeScale}×</b> (1 real hour = ${(v.settings.timeScale / 24).toFixed(2)} baby days). While you're away the baby lives at 2× real time, up to 24 hours per absence.</p>
      <div class="seg">${[1, 6, 24, 60].map((s) => `<button class="${v.settings.timeScale === s ? 'on' : ''}" data-speed="${s}">${s}×</button>`).join('')}</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px"><input type="checkbox" id="set-boost" ${v.settings.sleepBoost ? 'checked' : ''} style="width:auto"> Fast-forward while ${v.baby.name} sleeps peacefully (×4)</label></div>
      <div class="section"><h3>Sound</h3><input type="range" min="0" max="1" step="0.05" value="${this.ctx.audio?.volume ?? 0.8}" id="set-vol"><label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="set-tts" ${this.ctx.tts ? 'checked' : ''} style="width:auto"> Read toddler speech aloud (voice)</label></div>
      <div class="section"><h3>Account</h3><p>Signed in as <b>${store.user?.username}</b>. AI chat: <b>${store.llm ? 'Claude connected' : 'rule-based (set ANTHROPIC_API_KEY on the server for live AI)'}</b>.</p><div class="row" style="display:flex;gap:8px"><button data-switch>Switch baby / new game</button><button class="ghost" data-signout>Sign out</button></div></div>
      <div class="section"><h3>Controls</h3><p>Phone/tablet: left thumb = walk, right thumb = look, tap = interact. Desktop: WASD/arrows to walk, drag to look, click to interact, Shift to hurry.</p></div>`;
  }

  bind(body, v) {
    const run = (id, params, opts) => this.ctx.run(id, params, opts);
    body.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'medicine') return run('medicine', { id: b.dataset.id }, { anim: 'item', item: 'medicine', dur: 3, near: true });
      if (act === 'doctor') { this.close(); return run('doctor', { kind: b.dataset.kind }, { anim: 'none', remote: true }); }
      if (act === 'vitamin_d') return run('vitamin_d', {}, { anim: 'item', item: 'medicine', dur: 2, near: true });
      if (act === 'dress') { const size = body.querySelector('#wd-size').value, outfit = body.querySelector('#wd-outfit').value, layers = body.querySelector('#wd-layers').value; this.close(); return run('dress', { size, outfit, layers }, { anim: 'item', item: 'cloth', dur: 5, near: true }); }
      if (act === 'lesson') { this.close(); return run('lesson', { id: b.dataset.id }, { anim: 'item', item: 'book', dur: 10, near: true, look: true }); }
      if (act === 'thermostat') return run('thermostat', { tempC: Number(body.querySelector('#thermo-range').value) }, { anim: 'none', remote: true });
      if (act === 'babysitter') return run('babysitter', { hours: Number(body.querySelector('#sitter-h').value) }, { anim: 'none', remote: true });
      if (act === 'return') { this.close(); return run('return', {}, { anim: 'none', remote: true }); }
    });
    body.querySelectorAll('[data-item]').forEach((card) => {
      card.querySelector('[data-add]').onclick = () => { const id = card.dataset.item; const sel = card.querySelector('[data-size]'); const it = store.catalog.shop.find((s) => s.id === id); this.cart.push({ id, size: sel ? sel.value : undefined, label: it.label + (sel ? ` (${sel.options[sel.selectedIndex].text})` : '') }); this.render(); };
    });
    const clear = body.querySelector('[data-cart-clear]'); if (clear) clear.onclick = () => { this.cart = []; this.render(); };
    const order = body.querySelector('[data-cart-order]'); if (order) order.onclick = async () => { try { const r = await api.order(store.gameId, this.cart.map(({ id, size }) => ({ id, size }))); store.toast(r.message, r.ok ? 'good' : 'warn'); if (r.ok) this.cart = []; if (r.game) store.setView(r.game); } catch (e) { store.toast(e.message, 'danger'); } this.render(); };
    body.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => this.ctx.setSpeed(Number(b.dataset.speed)));
    const boost = body.querySelector('#set-boost'); if (boost) boost.onchange = () => api.settings(store.gameId, { sleepBoost: boost.checked });
    const vol = body.querySelector('#set-vol'); if (vol) vol.oninput = () => this.ctx.audio?.setVolume(Number(vol.value));
    const tts = body.querySelector('#set-tts'); if (tts) tts.onchange = () => { this.ctx.tts = tts.checked; localStorage.setItem('cradle.tts', tts.checked ? '1' : '0'); };
    const sw = body.querySelector('[data-switch]'); if (sw) sw.onclick = () => this.ctx.switchGame();
    const so = body.querySelector('[data-signout]'); if (so) so.onclick = () => this.ctx.signOut();
    const host = body.querySelector('[data-pd-host]'); if (host) host.onclick = () => this.ctx.playdate('host');
    const join = body.querySelector('[data-pd-join]'); if (join) join.onclick = () => this.ctx.playdate('join', body.querySelector('#pd-code').value.trim().toUpperCase());
    const end = body.querySelector('[data-pd-end]'); if (end) end.onclick = () => this.ctx.playdate('end');
    const form = body.querySelector('#pd-form'); if (form) form.onsubmit = (e) => { e.preventDefault(); const t = body.querySelector('#pd-text').value.trim(); if (t) this.ctx.playdate('chat', t); body.querySelector('#pd-text').value = ''; };
    void v;
  }
}
