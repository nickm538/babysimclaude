// Fully procedural audio with the Web Audio API: baby cries/coos/babble/giggles/breathing, room ambience,
// day birds / night crickets, doorbell, footsteps, music-box mobile, UI blips. No audio files needed.
export class GameAudio {
  constructor() { this.ctx = null; this.enabled = true; this.master = null; this.cry = null; this.amb = null; this.mobileTimer = null; this.breath = null; this.lastBabble = 0; this.volume = 0.8; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
    this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 4; this.comp.connect(this.master);
    this.bus = this.comp;
    this.noiseBuf = this.makeNoise();
    this.startAmbience();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.ctx.suspend(); else this.ctx.resume(); });
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  get t() { return this.ctx.currentTime; }

  makeNoise() {
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3.5; }
    return buf;
  }
  noise(gain, filterType = 'lowpass', freq = 800, q = 0.7) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); return { src, f, g };
  }

  // ----- ambience -----
  startAmbience() {
    const room = this.noise(0.012, 'lowpass', 180); room.g.connect(this.bus); room.src.start();
    this.amb = { room, birds: 0, crickets: 0, night: false };
    this.birdsGain = this.ctx.createGain(); this.birdsGain.gain.value = 0; this.birdsGain.connect(this.bus);
    this.cricketGain = this.ctx.createGain(); this.cricketGain.gain.value = 0; this.cricketGain.connect(this.bus);
    const cr = this.noise(0.08, 'bandpass', 4200, 12); cr.g.connect(this.cricketGain); cr.src.start();
    const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28; const lg = this.ctx.createGain(); lg.gain.value = 0.06; lfo.connect(lg); lg.connect(cr.g.gain); lfo.start();
    this.tick = setInterval(() => this.clockTick(), 1000);
    this.birdTimer = setInterval(() => { if (this.birdsGain.gain.value > 0.01 && Math.random() < 0.5) this.chirp(); }, 900);
  }
  setTimeOfDay(night, hour) {
    if (!this.ctx) return;
    const day = !night && hour > 6 && hour < 19;
    this.birdsGain.gain.setTargetAtTime(day ? 0.35 : 0, this.t, 2);
    this.cricketGain.gain.setTargetAtTime(night && (hour > 20 || hour < 5) ? 0.25 : 0, this.t, 2);
  }
  clockTick() { if (!this.ctx || this.ctx.state !== 'running') return; const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2400; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.012, this.t); g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.02); o.connect(g); g.connect(this.bus); o.start(); o.stop(this.t + 0.03); }
  chirp() {
    const o = this.ctx.createOscillator(); o.type = 'sine'; const f0 = 2400 + Math.random() * 1200; o.frequency.setValueAtTime(f0, this.t);
    const n = 2 + Math.floor(Math.random() * 3); const g = this.ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < n; i++) { const t0 = this.t + i * 0.12; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t0 + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t0 + 0.1); g.gain.setValueAtTime(0.0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.02); g.gain.linearRampToValueAtTime(0, t0 + 0.1); }
    o.connect(g); g.connect(this.birdsGain); o.start(); o.stop(this.t + n * 0.12 + 0.1);
  }

  // ----- baby voice -----
  voice(freq, type = 'sawtooth') {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
    const mix = this.ctx.createGain(); mix.gain.value = 0.5; o.connect(mix); const g2 = this.ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(mix);
    // soft clip
    const ws = this.ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } ws.curve = curve; mix.connect(ws);
    // formants
    const out = this.ctx.createGain(); out.gain.value = 0;
    for (const [f, q, gn] of [[720, 8, 1.0], [1250, 10, 0.55], [2700, 12, 0.3]]) { const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const g = this.ctx.createGain(); g.gain.value = gn; ws.connect(bp); bp.connect(g); g.connect(out); }
    const dry = this.ctx.createGain(); dry.gain.value = 0.12; ws.connect(dry); dry.connect(out);
    const vib = this.ctx.createOscillator(); vib.frequency.value = 5.5; const vg = this.ctx.createGain(); vg.gain.value = freq * 0.03; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency); vib.start();
    o.start(); o2.start();
    return { o, o2, out, vib, stop: (t) => { o.stop(t); o2.stop(t); vib.stop(t); } };
  }

  // continuous crying with intensity 0..1 and baby age (days) shaping pitch
  setCrying(on, intensity = 0.6, days = 0) {
    if (!this.ctx) return;
    if (!on) { if (this.cry) { this.cry.stop(); this.cry = null; } return; }
    intensity = Math.max(0.15, Math.min(1, intensity));
    if (this.cry) { this.cry.intensity = intensity; return; }
    const self = this; const base = days < 120 ? 470 : days < 730 ? 400 : 330;
    const cry = { intensity, alive: true, timer: null, stop() { this.alive = false; clearTimeout(this.timer); } };
    const bout = () => {
      if (!cry.alive) return;
      const I = cry.intensity, t0 = self.t;
      const v = self.voice(base * (0.92 + I * 0.25));
      const dur = 0.7 + I * 0.9 + Math.random() * 0.3;
      const f = v.o.frequency, f2 = v.o2.frequency;
      const peak = base * (1.05 + I * 0.5);
      f.setValueAtTime(base * 0.85, t0); f.exponentialRampToValueAtTime(peak, t0 + dur * 0.3); f.exponentialRampToValueAtTime(base * 0.8, t0 + dur);
      f2.setValueAtTime(base * 1.7, t0); f2.exponentialRampToValueAtTime(peak * 2.01, t0 + dur * 0.3); f2.exponentialRampToValueAtTime(base * 1.6, t0 + dur);
      const g = v.out.gain; const amp = 0.18 + I * 0.5;
      g.setValueAtTime(0, t0); g.linearRampToValueAtTime(amp, t0 + 0.08); g.setValueAtTime(amp, t0 + dur * 0.75); g.linearRampToValueAtTime(0, t0 + dur);
      // sob tremor at high intensity
      if (I > 0.6) { const trem = self.ctx.createOscillator(); trem.frequency.value = 9; const tg = self.ctx.createGain(); tg.gain.value = amp * 0.35; trem.connect(tg); tg.connect(v.out.gain); trem.start(t0); trem.stop(t0 + dur); }
      v.out.connect(self.bus); v.stop(t0 + dur + 0.05);
      // inhale gasp
      const gap = 0.25 + (1 - I) * 0.8 + Math.random() * 0.3;
      const inh = self.noise(0.06 * I, 'highpass', 1800); inh.g.gain.setValueAtTime(0, t0 + dur); inh.g.gain.linearRampToValueAtTime(0.08 * I, t0 + dur + 0.08); inh.g.gain.linearRampToValueAtTime(0, t0 + dur + 0.25); inh.g.connect(self.bus); inh.src.start(t0 + dur); inh.src.stop(t0 + dur + 0.3);
      cry.timer = setTimeout(bout, (dur + gap) * 1000);
    };
    bout();
    this.cry = cry;
  }

  coo(days = 60) {
    if (!this.ctx) return; const t0 = this.t; const base = days < 200 ? 330 : 290;
    const v = this.voice(base, 'triangle'); v.o.frequency.setValueAtTime(base, t0); v.o.frequency.linearRampToValueAtTime(base * 1.25, t0 + 0.35); v.o.frequency.linearRampToValueAtTime(base * 1.05, t0 + 0.7);
    v.out.gain.setValueAtTime(0, t0); v.out.gain.linearRampToValueAtTime(0.22, t0 + 0.12); v.out.gain.linearRampToValueAtTime(0, t0 + 0.75); v.out.connect(this.bus); v.stop(t0 + 0.8);
  }
  giggle(days = 200) {
    if (!this.ctx) return; const t0 = this.t; const base = days < 365 ? 520 : 440; const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { const ts = t0 + i * 0.14; const v = this.voice(base * (1 - i * 0.04), 'square'); v.out.gain.setValueAtTime(0, ts); v.out.gain.linearRampToValueAtTime(0.2, ts + 0.02); v.out.gain.linearRampToValueAtTime(0, ts + 0.09); v.out.connect(this.bus); v.stop(ts + 0.12); }
    const inh = this.noise(0.05, 'highpass', 1500); inh.g.gain.setValueAtTime(0, t0 + n * 0.14); inh.g.gain.linearRampToValueAtTime(0.06, t0 + n * 0.14 + 0.1); inh.g.gain.linearRampToValueAtTime(0, t0 + n * 0.14 + 0.35); inh.g.connect(this.bus); inh.src.start(t0 + n * 0.14); inh.src.stop(t0 + n * 0.14 + 0.4);
  }
  babble(days = 250, syllables = 3) {
    if (!this.ctx) return; const t0 = this.t; const base = days < 365 ? 300 : days < 1095 ? 280 : 260;
    for (let i = 0; i < syllables; i++) {
      const ts = t0 + i * 0.28;
      const burst = this.noise(0.1, 'bandpass', 1200 + Math.random() * 1500, 2); burst.g.gain.setValueAtTime(0.1, ts); burst.g.gain.linearRampToValueAtTime(0, ts + 0.04); burst.g.connect(this.bus); burst.src.start(ts); burst.src.stop(ts + 0.05);
      const v = this.voice(base * (0.9 + Math.random() * 0.3), 'sawtooth'); v.out.gain.setValueAtTime(0, ts + 0.03); v.out.gain.linearRampToValueAtTime(0.16, ts + 0.06); v.out.gain.linearRampToValueAtTime(0, ts + 0.22); v.out.connect(this.bus); v.stop(ts + 0.25);
    }
  }
  setBreathing(on, snore = false) {
    if (!this.ctx) return;
    if (!on) { if (this.breath) { this.breath.g.gain.setTargetAtTime(0, this.t, 0.5); const b = this.breath; setTimeout(() => { try { b.src.stop(); b.lfo.stop(); } catch { /* */ } }, 1500); this.breath = null; } return; }
    if (this.breath) { this.breath.lfo.frequency.value = snore ? 0.35 : 0.55; return; }
    const n = this.noise(0, 'lowpass', 500); const lfo = this.ctx.createOscillator(); lfo.frequency.value = snore ? 0.35 : 0.55; const lg = this.ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(n.g.gain); n.g.gain.value = 0.02; n.g.connect(this.bus); n.src.start(); lfo.start();
    this.breath = { ...n, lfo };
  }

  // ----- world sounds -----
  doorbell() { if (!this.ctx) return; for (const [f, d] of [[659, 0], [523, 0.45]]) { const o = this.ctx.createOscillator(); o.frequency.value = f; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, this.t + d); g.gain.exponentialRampToValueAtTime(0.25, this.t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, this.t + d + 1.2); o.connect(g); g.connect(this.bus); o.start(this.t + d); o.stop(this.t + d + 1.3); } }
  footstep() { if (!this.ctx) return; const n = this.noise(0.09, 'lowpass', 380 + Math.random() * 120); n.g.gain.setValueAtTime(0.09, this.t); n.g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.09); n.g.connect(this.bus); n.src.start(); n.src.stop(this.t + 0.1); }
  click() { if (!this.ctx) return; const o = this.ctx.createOscillator(); o.frequency.value = 1400; const g = this.ctx.createGain(); g.gain.setValueAtTime(0.05, this.t); g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.04); o.connect(g); g.connect(this.bus); o.start(); o.stop(this.t + 0.05); }
  notify(sev = 'info') { if (!this.ctx) return; const fs = sev === 'danger' ? [440, 330] : sev === 'good' ? [660, 880] : [520]; fs.forEach((f, i) => { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = this.ctx.createGain(); const t0 = this.t + i * 0.12; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25); o.connect(g); g.connect(this.bus); o.start(t0); o.stop(t0 + 0.3); }); }
  rattle() { if (!this.ctx) return; for (let i = 0; i < 6; i++) { const t0 = this.t + i * 0.09; const n = this.noise(0.1, 'bandpass', 3000 + Math.random() * 2000, 3); n.g.gain.setValueAtTime(0.1, t0); n.g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06); n.g.connect(this.bus); n.src.start(t0); n.src.stop(t0 + 0.08); } }
  splash() { if (!this.ctx) return; const n = this.noise(0.12, 'bandpass', 1400, 1); n.g.gain.setValueAtTime(0.12, this.t); n.g.gain.exponentialRampToValueAtTime(0.0001, this.t + 0.5); n.g.connect(this.bus); n.src.start(); n.src.stop(this.t + 0.6); }
  setMobile(on) {
    if (!this.ctx) return;
    if (!on) { clearInterval(this.mobileTimer); this.mobileTimer = null; return; }
    if (this.mobileTimer) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 783.99, 659.25]; let i = 0;
    this.mobileTimer = setInterval(() => { if (this.ctx.state !== 'running') return; const f = scale[i++ % scale.length]; for (const [m, gn] of [[1, 0.08], [2, 0.03], [3, 0.012]]) { const o = this.ctx.createOscillator(); o.frequency.value = f * m; const g = this.ctx.createGain(); g.gain.setValueAtTime(gn, this.t); g.gain.exponentialRampToValueAtTime(0.0001, this.t + 1.6); o.connect(g); g.connect(this.bus); o.start(); o.stop(this.t + 1.7); } }, 620);
  }
  setWhiteNoise(on) {
    if (!this.ctx) return;
    if (!on) { if (this.wn) { this.wn.g.gain.setTargetAtTime(0, this.t, 0.3); const w = this.wn; setTimeout(() => { try { w.src.stop(); } catch { /* */ } }, 1200); this.wn = null; } return; }
    if (this.wn) return; const n = this.noise(0.04, 'lowpass', 900); n.g.connect(this.bus); n.src.start(); this.wn = n;
  }
  speak(text, days) {
    if (!('speechSynthesis' in window) || days < 330) return;
    const clean = text.replace(/\*[^*]*\*/g, '').replace(/["“”]/g, '').trim(); if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean); u.pitch = days < 1095 ? 1.9 : 1.6; u.rate = days < 730 ? 0.75 : 0.9; u.volume = 0.9;
    const voices = speechSynthesis.getVoices(); const v = voices.find((x) => /child|kid|junior/i.test(x.name)) || voices.find((x) => /female|samantha|karen|moira|victoria/i.test(x.name)) || voices[0]; if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
}
