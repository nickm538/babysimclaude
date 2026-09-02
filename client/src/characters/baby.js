// The baby in the world: builds/rebuilds the procedural body as it grows, places it at the right spot,
// drives the animator + face from the server view, moves between spots when mobile, and plays sounds.
import * as THREE from 'three';
import { buildBabyBody } from './babyMesh.js';
import { buildFace, updateFace } from './babyFace.js';
import { BabyAnimator } from './babyAnimator.js';
import { makeSkinMaterial, setSkinState } from './skinMaterial.js';
import { fabricTexture, stdMaterial } from '../engine/textures.js';
import { SPOTS } from '../world/house.js';

const OUTFIT_COLORS = { white: '#f5f1ea', mint: '#bfe6d2', sky: '#bcd8f2', peach: '#f7cdb9', lilac: '#d9c7ee', lemon: '#f6e7a6', grey: '#cfd2d6', navy: '#3f4d6b', rose: '#efb2c0' };

export class Baby {
  constructor(scene, audio, { guest = false } = {}) {
    this.scene = scene; this.audio = audio; this.guest = guest;
    this.root = new THREE.Group(); this.root.name = guest ? 'guestBaby' : 'baby'; scene.add(this.root);
    this.rig = new THREE.Group(); this.root.add(this.rig); // rig: rotation for lying/prone; body inside
    this.body = null; this.face = null; this.anim = null; this.builtDays = -1; this.appearanceKey = '';
    this.view = null; this.days = 0; this.scale = 1;
    this.curPos = new THREE.Vector3(); this.curQuat = new THREE.Quaternion(); this.targetPos = new THREE.Vector3(); this.targetQuat = new THREE.Quaternion();
    this.moving = 0; this.location = null; this.heldParent = null; this.sound = { lastCoo: 0, lastGiggle: 0, lastBabble: 0 };
    this.mats = null; this.tmpV = new THREE.Vector3();
  }

  ensureBuilt(view) {
    const b = view.baby; const days = view.sim.days;
    const band = days < 365 ? Math.floor(days / 40) : 9 + Math.floor((days - 365) / 90);
    const key = JSON.stringify(b.appearance) + b.sex;
    if (this.body && band === this.builtDays && key === this.appearanceKey) return;
    this.builtDays = band; this.appearanceKey = key;
    if (this.body) { this.rig.remove(this.body); this.body.geometry.dispose(); this.onesie.geometry.dispose(); this.diaper.geometry.dispose(); }
    if (!this.mats) {
      this.mats = {
        skin: makeSkinMaterial({ skinTone: b.appearance.skinTone, blush: 0.32 * (b.appearance.cheekiness || 1) }),
        cloth: stdMaterial(fabricTexture({ color: OUTFIT_COLORS[b.wear.outfit] || '#f5f1ea', repeat: 14, weave: 3 }), { roughness: 1 }),
        diaper: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.95 }),
      };
    }
    const built = buildBabyBody({ days: Math.max(0, days), skinMat: this.mats.skin, clothMat: this.mats.cloth, diaperMat: this.mats.diaper, res: /iPhone|iPad|Android/i.test(navigator.userAgent) ? 72 : 88 });
    this.body = built.body; this.onesie = built.onesie; this.diaper = built.diaper; this.layout = built.layout; this.bones = built.bones; this.morphNames = built.morphNames;
    this.body.add(this.onesie); this.body.add(this.diaper);
    this.rig.add(this.body);
    this.face = buildFace({ headBone: this.bones.head, layout: this.layout, skinMat: this.mats.skin, appearance: b.appearance, days, surface: built.surface });
    if (this.helper) { this.scene.remove(this.helper); this.helper = null; }
    this.anim = new BabyAnimator(this.bones);
    this.mats.skin.userData.uniforms.uHeadY.value = this.layout.headCenter.y;
    this.gazePoint = new THREE.Vector3();
  }

  setOutfitColor(name) {
    const col = OUTFIT_COLORS[name] || '#f5f1ea';
    if (this.outfitName === name) return; this.outfitName = name;
    const tex = fabricTexture({ color: col, repeat: 14, weave: 3 });
    this.mats.cloth.map = tex.map; this.mats.cloth.normalMap = tex.normalMap; this.mats.cloth.needsUpdate = true;
  }

  // Compute world placement for a spot & state
  placement(view, camera) {
    const st = view.baby.state; const loc = st.held ? 'held' : st.hospitalized ? 'hospital' : st.location;
    const spot = SPOTS[loc] || SPOTS.floor;
    const P = this.layout.P, s = this.scale;
    const pos = new THREE.Vector3(...spot.pos), q = new THREE.Quaternion();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.rot + (this.yawJitter || 0));
    const sleeping = st.activity === 'sleeping';
    const upright = spot.kind !== 'lie' && (st.position === 'sitting' || (this.days > 200 && spot.kind === 'floor' && !sleeping && st.position !== 'tummy'));
    const walking = !!view.baby.milestones.walks && this.moving > 0.01;
    const crawling = this.moving > 0.01 && !walking;
    if (loc === 'held') return null;
    if (walking) { q.copy(this.faceDir); pos.y += 0.0; }
    else if (crawling) { q.copy(this.faceDir).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); pos.y += P.thigh * s * 0.85; }
    else if (st.position === 'tummy' && !upright) { q.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); pos.y += P.bellyR * s * 0.85; }
    else if (upright) { q.copy(yaw); pos.y += spot.kind === 'sit' ? 0 : 0.0; if (st.position === 'sitting' || !view.baby.milestones.walks || sleeping) pos.y -= (this.layout.hipY - P.legR * 1.4) * s; }
    else { q.copy(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); pos.y += P.bellyR * s * 0.9; }
    // recenter: rig origin is at the feet; shift so the body centre sits on the spot
    const center = new THREE.Vector3(0, this.layout.hipY * s * 0.9, 0).applyQuaternion(q);
    pos.sub(center);
    void camera;
    return { pos, q };
  }

  update(view, dt, camera, heldRig) {
    if (!view || !view.baby) return;
    this.view = view; const b = view.baby; this.days = view.sim.days;
    this.ensureBuilt(view);
    this.scale = (b.phys.heightCm / 100) / this.layout.totalH;
    this.rig.scale.setScalar(this.scale);
    this.setOutfitColor(b.wear.outfit);
    const st = b.state;
    const dbg = this.debug || {};
    this.onesie.visible = st.location !== 'bath' && !dbg.noCloth;
    this.diaper.visible = !dbg.noCloth;
    if (dbg.skeleton && !this.helper) { this.helper = new THREE.SkeletonHelper(this.body); this.scene.add(this.helper); }
    if (!dbg.skeleton && this.helper) { this.scene.remove(this.helper); this.helper = null; }
    if (this.face.cap) this.face.cap.visible = this.days > 300;
    // location transitions: crawl/walk between floor spots when mobile, otherwise snap (the parent carried the baby)
    const loc = st.held ? 'held' : st.hospitalized ? 'hospital' : st.location;
    if (loc !== this.location) {
      const wasFloor = this.location && SPOTS[this.location] && SPOTS[this.location].kind === 'floor';
      const toFloor = SPOTS[loc] && SPOTS[loc].kind === 'floor';
      this.moving = st.mobile && wasFloor && toFloor ? 1 : 0;
      this.location = loc; this.yawJitter = (Math.random() - 0.5) * 0.6;
    }
    // held: parent to camera rig
    if (loc === 'held') {
      if (this.root.parent !== heldRig) { heldRig.add(this.root); }
      // centre the body on the rig origin (rig origin is at the feet), then cradle it in front of the chest
      this.rig.position.set(0, -this.layout.hipY * this.scale * 0.95, 0);
      this.root.position.set(0.04, -0.3, -0.52);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.05, 0.35, 1.25, 'YXZ'));
      this.root.quaternion.slerp(q, Math.min(1, dt * 6));
      this.moving = 0;
    } else {
      if (this.root.parent !== this.scene) { this.scene.add(this.root); this.curPos.copy(this.targetPos); }
      this.rig.position.set(0, 0, 0);
      const pl = this.placement(view, camera);
      if (pl) {
        this.targetPos.copy(pl.pos); this.targetQuat.copy(pl.q);
        const dist = this.curPos.distanceTo(this.targetPos);
        if (this.moving > 0.01) {
          const speed = b.milestones.walks ? 0.55 : 0.28;
          const dir = this.targetPos.clone().sub(this.curPos); dir.y = 0;
          if (dir.length() > 0.02) { dir.normalize(); this.faceDir = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z)); }
          this.curPos.addScaledVector(dir, Math.min(dist, speed * dt));
          this.curPos.y += (this.targetPos.y - this.curPos.y) * Math.min(1, dt * 4);
          if (dist < 0.08) this.moving = 0;
          this.curQuat.slerp(pl.q, Math.min(1, dt * 4));
        } else {
          this.curPos.lerp(this.targetPos, Math.min(1, dt * (dist > 1.5 ? 30 : 5)));
          this.curQuat.slerp(this.targetQuat, Math.min(1, dt * 5));
        }
        this.root.position.copy(this.curPos); this.root.quaternion.copy(this.curQuat);
      }
    }
    this.root.visible = loc !== 'hospital';
    // animator state
    const headWorld = new THREE.Vector3(); this.bones.head.getWorldPosition(headWorld);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const attentive = !st.crying || st.cryIntensity < 0.5;
    const gazeTarget = attentive && camPos.distanceTo(headWorld) < 3.2 ? camPos : null;
    let gazeLocal = null;
    if (gazeTarget) { const l = this.bones.neck.worldToLocal(gazeTarget.clone()); gazeLocal = { yaw: Math.atan2(l.x, l.z), pitch: -Math.atan2(l.y, Math.hypot(l.x, l.z)) }; if (Math.abs(gazeLocal.yaw) > 1.4) gazeLocal = null; }
    this.anim.setState({
      activity: st.activity, crying: st.crying, cryIntensity: st.cryIntensity, mood: b.mood, days: this.days, held: st.held,
      position: st.position, sucking: st.pacifier || this.feeding, mobile: st.mobile, walking: !!b.milestones.walks, moving: this.moving,
      gazeTarget, gazeLocal, pacifier: st.pacifier, hospital: st.hospitalized, spotKind: (SPOTS[loc] || SPOTS.floor).kind,
    });
    this.anim.update(dt);
    updateFace(this.face, dt, this.anim.face, this.bones.head);
    // body morphs
    const inf = this.body.morphTargetInfluences; if (inf) { inf[0] = this.anim.morph.cry; inf[1] = this.anim.morph.smile; inf[2] = this.anim.morph.open; inf[3] = this.anim.morph.frown; }
    // skin
    const ill = b.illness ? b.illness.severity / 100 : 0;
    setSkinState(this.mats.skin, { sick: Math.max(ill * 0.8, b.needs.health < 40 ? 0.5 : 0), jaundice: (b.phys.jaundice || 0) / 100 * 0.8, flush: st.crying ? 0.5 + st.cryIntensity * 0.5 : b.phys.tempC > 38 ? 0.5 : 0 });
    // sounds (only the player's baby)
    if (!this.guest) this.sounds(view, dt, camPos.distanceTo(headWorld));
  }

  sounds(view, dt, dist) {
    const a = this.audio, b = view.baby, st = b.state; if (!a || !a.ctx) return;
    const t = performance.now() / 1000;
    const near = Math.max(0.25, 1 - dist / 9);
    if (st.crying && !st.hospitalized) a.setCrying(true, st.cryIntensity * near, this.days); else a.setCrying(false);
    a.setBreathing(st.activity === 'sleeping' && dist < 2.5 && !st.hospitalized, this.days > 300 && (b.illness && b.illness.id === 'cold'));
    if (st.activity !== 'sleeping' && !st.crying && !st.hospitalized) {
      if ((b.mood === 'happy' || b.mood === 'playing') && this.days > 90 && t - this.sound.lastGiggle > 9 + Math.random() * 20 && dist < 4) { this.sound.lastGiggle = t; a.giggle(this.days); }
      else if (this.days < 200 && t - this.sound.lastCoo > 8 + Math.random() * 25 && b.mood !== 'withdrawn') { this.sound.lastCoo = t; a.coo(this.days); }
      else if (this.days >= 150 && t - this.sound.lastBabble > 10 + Math.random() * 25 && b.mood !== 'withdrawn' && b.mood !== 'sick') { this.sound.lastBabble = t; a.babble(this.days, 2 + Math.floor(Math.random() * 4)); }
    }
    void dt;
  }

  headWorldPosition() { const v = new THREE.Vector3(); if (this.bones) this.bones.head.getWorldPosition(v); else this.root.getWorldPosition(v); return v; }
  worldPosition() { const v = new THREE.Vector3(); if (this.bones) this.bones.spine.getWorldPosition(v); else this.root.getWorldPosition(v); return v; }
}
