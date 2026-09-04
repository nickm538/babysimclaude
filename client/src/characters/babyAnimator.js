// Pose targets + procedural motion layers (breathing, wiggles, kicks, gaze, blinking, crying rhythm).
import * as THREE from 'three';

const D = Math.PI / 180;
const E = (x, y, z) => [x * D, y * D, z * D];
const mirror = (p) => ({ ...p, upperArmL: [p.upperArmR[0], -p.upperArmR[1], -p.upperArmR[2]], foreArmL: [p.foreArmR[0], -p.foreArmR[1], -p.foreArmR[2]], handL: [p.handR[0], -p.handR[1], -p.handR[2]], thighL: [p.thighR[0], -p.thighR[1], -p.thighR[2]], shinL: [p.shinR[0], -p.shinR[1], -p.shinR[2]], footL: [p.footR[0], -p.footR[1], -p.footR[2]] });

export const POSES = {
  lieBack: mirror({ head: E(-4, 14, 0), spine: E(0, 0, 0), chest: E(0, 0, 0), upperArmR: E(20, 0, 55), foreArmR: E(0, -25, 80), handR: E(0, 0, 10), thighR: E(-55, 0, 25), shinR: E(85, 0, 0), footR: E(-20, 0, 0) }),
  sleepBack: mirror({ head: E(-2, 22, 0), spine: E(0, 0, 0), chest: E(0, 0, 0), upperArmR: E(10, 0, 40), foreArmR: E(0, -20, 95), handR: E(0, 0, 15), thighR: E(-40, 0, 22), shinR: E(65, 0, 0), footR: E(-15, 0, 0) }),
  sleepSide: mirror({ head: E(8, 40, 10), spine: E(0, 10, 0), chest: E(0, 8, 0), upperArmR: E(30, 0, -20), foreArmR: E(0, -20, 100), handR: E(0, 0, 15), thighR: E(-60, 0, 10), shinR: E(80, 0, 0), footR: E(-10, 0, 0) }),
  cry: mirror({ head: E(-14, 0, 0), spine: E(-4, 0, 0), chest: E(-3, 0, 0), upperArmR: E(25, 0, 40), foreArmR: E(0, -20, 110), handR: E(0, 0, 25), thighR: E(-65, 0, 20), shinR: E(95, 0, 0), footR: E(-25, 0, 0) }),
  held: mirror({ head: E(12, 10, 0), spine: E(6, 0, 0), chest: E(4, 0, 0), upperArmR: E(30, 0, -30), foreArmR: E(0, -40, 95), handR: E(0, 0, 10), thighR: E(-75, 0, 18), shinR: E(100, 0, 0), footR: E(-15, 0, 0) }),
  tummy: mirror({ head: E(-70, 0, 0), spine: E(-6, 0, 0), chest: E(-4, 0, 0), upperArmR: E(0, -80, 10), foreArmR: E(0, 0, 85), handR: E(0, 0, 0), thighR: E(-12, 0, 15), shinR: E(25, 0, 0), footR: E(-30, 0, 0) }),
  sit: mirror({ head: E(2, 0, 0), spine: E(6, 0, 0), chest: E(2, 0, 0), upperArmR: E(35, 0, -55), foreArmR: E(0, -30, 55), handR: E(0, 0, 0), thighR: E(-85, 0, 22), shinR: E(15, 0, 0), footR: E(-20, 0, 0) }),
  crawl: mirror({ head: E(-62, 0, 0), spine: E(-4, 0, 0), chest: E(0, 0, 0), upperArmR: E(0, -88, 0), foreArmR: E(0, 0, 5), handR: E(-15, 0, 0), thighR: E(-92, 0, 8), shinR: E(92, 0, 0), footR: E(-40, 0, 0) }),
  stand: mirror({ head: E(0, 0, 0), spine: E(2, 0, 0), chest: E(0, 0, 0), upperArmR: E(0, 0, -78), foreArmR: E(0, 0, -20), handR: E(0, 0, 0), thighR: E(-4, 0, 4), shinR: E(6, 0, 0), footR: E(0, 0, 0) }),
  play: mirror({ head: E(10, 0, 0), spine: E(8, 0, 0), chest: E(2, 0, 0), upperArmR: E(45, 0, -45), foreArmR: E(0, -25, 70), handR: E(0, 0, 0), thighR: E(-80, 0, 30), shinR: E(35, 0, 0), footR: E(-20, 0, 0) }),
};

const BONES = ['head', 'spine', 'chest', 'upperArmR', 'foreArmR', 'handR', 'upperArmL', 'foreArmL', 'handL', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL'];

export class BabyAnimator {
  constructor(bones) {
    this.bones = bones; this.cur = {}; this.target = {}; this.phase = {};
    for (const b of BONES) { this.cur[b] = [0, 0, 0]; this.target[b] = [0, 0, 0]; this.phase[b] = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28]; }
    this.t = 0; this.pose = 'lieBack'; this.blinkT = 2; this.blink = 0; this.nextBlink = 2 + Math.random() * 3;
    this.state = { activity: 'sleeping', crying: false, cryIntensity: 0, mood: 'sleeping', days: 0, held: false, position: 'back', sucking: false, mobile: false, walking: false, moving: 0, gazeTarget: null };
    this.face = { blink: 0, squint: 0, browRaise: 0, browFurrow: 0, cry: 0, smile: 0, open: 0, frown: 0, sleep: false, gazeTarget: null, pacifier: false };
    this.morph = { cry: 0, smile: 0, open: 0, frown: 0 };
    this.energy = 1; // wiggle amount
  }

  choosePose(s) {
    if (s.hospital) return 'sleepBack';
    if (s.moving > 0.01) return s.walking ? 'stand' : 'crawl';
    if (s.activity === 'sleeping') return s.days > 200 && s.position !== 'tummy' ? 'sleepSide' : s.position === 'tummy' ? 'tummy' : 'sleepBack';
    if (s.held) return 'held';
    if (s.position === 'tummy') return s.mobile ? 'crawl' : 'tummy';
    if (s.crying) return s.days > 240 && s.position === 'sitting' ? 'sit' : 'cry';
    if (s.position === 'sitting' || s.spotKind === 'sit') return s.mood === 'playing' ? 'play' : 'sit';
    if (s.days > 360 && s.spotKind === 'floor' && s.walking) return 'stand';
    if (s.days > 200 && s.spotKind === 'floor') return s.mood === 'playing' ? 'play' : 'sit';
    return 'lieBack';
  }

  setState(s) { Object.assign(this.state, s); }

  update(dt) {
    const s = this.state; this.t += dt;
    const pose = this.choosePose(s); this.pose = pose;
    const P = POSES[pose];
    const days = s.days;
    const sleeping = s.activity === 'sleeping';
    this.energy = sleeping ? 0.25 : s.crying ? 1.4 : s.mood === 'happy' || s.mood === 'playing' ? 1.1 : s.mood === 'withdrawn' || s.mood === 'sick' ? 0.3 : 0.7;
    const wig = (days < 90 ? 6 : days < 365 ? 5 : 3) * D * this.energy;
    const rate = Math.min(1, dt * (s.crying ? 6 : 3.2));
    const t = this.t;
    for (const b of BONES) {
      const tg = P[b] || [0, 0, 0], c = this.cur[b], ph = this.phase[b];
      for (let i = 0; i < 3; i++) c[i] += (tg[i] - c[i]) * rate;
      const bone = this.bones[b]; if (!bone) continue;
      // procedural wiggle: layered sines, per-bone phases
      let ox = Math.sin(t * 0.9 + ph[0]) * 0.5 + Math.sin(t * 2.3 + ph[1]) * 0.3 + Math.sin(t * 4.1 + ph[2]) * 0.2;
      let oy = Math.sin(t * 1.1 + ph[1]) * 0.5 + Math.sin(t * 2.7 + ph[2]) * 0.3;
      let oz = Math.sin(t * 0.8 + ph[2]) * 0.5 + Math.sin(t * 3.3 + ph[0]) * 0.3;
      let ax = wig, ay = wig, az = wig;
      if (b === 'head') { ax *= 0.5; ay *= 0.8; az *= 0.3; }
      if (b === 'spine' || b === 'chest') { ax *= 0.3; ay *= 0.2; az *= 0.2; }
      // kicks when crying / excited (alternating legs), arm flails when crying
      if (b.startsWith('thigh') && !sleeping && (s.crying || s.mood === 'happy') && pose !== 'crawl' && pose !== 'stand') { const side = b.endsWith('R') ? 1 : -1; ox += Math.sin(t * (s.crying ? 7 : 4) + side * Math.PI / 2) * (s.crying ? 2.2 : 1.2); }
      if (b.startsWith('shin') && !sleeping && (s.crying || s.mood === 'happy') && pose !== 'crawl') { const side = b.endsWith('R') ? 1 : -1; ox += Math.sin(t * (s.crying ? 7 : 4) + side * Math.PI / 2 + 1) * 1.5; }
      if (b.startsWith('upperArm') && s.crying) { oz += Math.sin(t * 6 + (b.endsWith('R') ? 0 : 2)) * 1.6; }
      // crawl / walk cycles
      if (s.moving > 0.01) {
        const f = s.walking ? 5.5 : 3.2, side = b.endsWith('R') ? 0 : Math.PI, sw = Math.sin(t * f + side);
        if (b.startsWith('thigh')) ox += sw * (s.walking ? 5 : 3) * s.moving;
        if (b.startsWith('shin')) ox += Math.max(0, -sw) * (s.walking ? 6 : 3) * s.moving;
        if (b.startsWith('upperArm')) { if (s.walking) ox += -sw * 4 * s.moving; else oy += sw * 3 * s.moving; }
        if (b === 'head') { oy += Math.sin(t * f * 0.5) * 1.2; ox += Math.sin(t * f) * 0.6; }
        if (b === 'spine') oz += Math.sin(t * f) * 0.8;
      }
      // breathing
      if (b === 'chest') ox += Math.sin(t * (s.crying ? 5.2 : sleeping ? 2.6 : 3.4)) * 1.2;
      // gaze: head turns toward target a little when awake
      let gx = 0, gy = 0;
      if (!sleeping && s.gazeLocal) { gy = THREE.MathUtils.clamp(s.gazeLocal.yaw, -0.6, 0.6) * (s.held ? 0.5 : 0.8); gx = THREE.MathUtils.clamp(s.gazeLocal.pitch, -0.4, 0.4) * 0.6; }
      const ex = c[0] + ox * ax + (b === 'head' ? gx : 0), ey = c[1] + oy * ay + (b === 'head' ? gy : 0), ez = c[2] + oz * az;
      bone.rotation.set(ex, ey, ez, 'XYZ');
      if (b === 'chest') { const br = 1 + Math.sin(t * (sleeping ? 2.6 : 3.4)) * 0.012 * (s.crying ? 1.6 : 1); bone.scale.set(br, 1, br); }
    }
    this.updateFace(dt);
  }

  updateFace(dt) {
    const s = this.state, f = this.face, t = this.t;
    const sleeping = s.activity === 'sleeping';
    f.sleep = sleeping;
    // blinking
    if (!sleeping) { this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 1.5 + Math.random() * 4.5; } }
    if (this.blink > 0) { this.blink -= dt; f.blink = this.blink > 0.07 ? 1 : 0; } else f.blink = 0;
    // expressions
    const cryRhythm = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.6));
    const targetCry = s.crying ? (0.35 + s.cryIntensity * 0.65) * cryRhythm : 0;
    const happy = !sleeping && !s.crying && (s.mood === 'happy' || s.mood === 'playing') && s.days > 40;
    const content = !sleeping && !s.crying && (s.mood === 'content' || s.mood === 'calm') && s.days > 60;
    const targetSmile = happy ? 0.55 + 0.35 * Math.max(0, Math.sin(t * 0.7)) : content ? 0.25 + 0.15 * Math.sin(t * 0.4) : 0;
    const targetFrown = !sleeping && !s.crying && (s.mood === 'fussy' || s.mood === 'sick' || s.mood === 'scared' || s.mood === 'withdrawn') ? 0.6 : 0;
    const targetOpen = s.sucking ? 0.25 + 0.12 * Math.sin(t * 9) : (!sleeping && s.days > 150 && s.mood === 'happy' && Math.sin(t * 1.3) > 0.85 ? 0.4 : 0);
    const k = Math.min(1, dt * 8);
    this.morph.cry += (targetCry - this.morph.cry) * k; this.morph.smile += (targetSmile - this.morph.smile) * k; this.morph.frown += (targetFrown - this.morph.frown) * k; this.morph.open += (targetOpen - this.morph.open) * k;
    f.cry = this.morph.cry; f.smile = this.morph.smile; f.frown = this.morph.frown; f.open = this.morph.open;
    f.squint = s.crying ? 0.55 + 0.35 * cryRhythm : happy ? 0.25 : 0;
    f.browRaise = happy ? 0.5 : s.mood === 'scared' ? 0.8 : 0;
    f.browFurrow = s.crying ? 0.9 : targetFrown > 0 ? 0.5 : 0;
    f.gazeTarget = sleeping ? null : s.gazeTarget;
    f.pacifier = !!s.pacifier;
  }
}
