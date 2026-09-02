// First-person controls: touch joystick + drag-look on mobile, WASD + drag-look on desktop.
// Simple capsule-vs-AABB collision, head bob, footstep callback, tap-to-interact raycasting.
import * as THREE from 'three';

export class FirstPersonControls {
  constructor(camera, dom, { colliders = [], eyeHeight = 1.62, bounds = { minX: -5.6, maxX: 5.6, minZ: -4.6, maxZ: 4.6 } } = {}) {
    this.camera = camera; this.dom = dom; this.colliders = colliders; this.eyeHeight = eyeHeight; this.bounds = bounds;
    this.yaw = 0; this.pitch = -0.08; // yaw 0 looks down -z, toward the TV and nursery
    this.pos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.joy = null; this.look = null; this.tap = null;
    this.bobT = 0; this.bobAmt = 0; this.speed = 2.2; this.radius = 0.28;
    this.onStep = null; this.onTap = null; this.enabled = true; this.lookTarget = null; this.lookWeight = 0;
    this.stepAcc = 0;
    this.bind();
    this.isTouch = 'ontouchstart' in window;
  }

  bind() {
    const d = this.dom;
    window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    // pointer events unify mouse and touch
    d.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    d.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    d.addEventListener('pointerup', (e) => this.up(e));
    d.addEventListener('pointercancel', (e) => this.up(e));
    d.addEventListener('wheel', (e) => { this.pitch = THREE.MathUtils.clamp(this.pitch - e.deltaY * 0.0008, -1.3, 1.2); }, { passive: true });
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY, w = window.innerWidth;
    const p = { id: e.pointerId, x0: x, y0: y, x, y, t0: performance.now(), moved: 0 };
    if (e.pointerType === 'touch' && x < w * 0.45 && y > window.innerHeight * 0.35 && !this.joy) { this.joy = p; this.showJoy(x, y); }
    else if (!this.look) { this.look = p; }
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  move(e) {
    const p = this.joy && this.joy.id === e.pointerId ? this.joy : this.look && this.look.id === e.pointerId ? this.look : null;
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;
    if (p === this.look) {
      const k = e.pointerType === 'touch' ? 0.0042 : 0.0032;
      this.yaw -= dx * k; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.3, 1.2);
      this.lookWeight = 0;
    } else this.updateJoy();
  }
  up(e) {
    if (this.joy && this.joy.id === e.pointerId) { this.joy = null; this.hideJoy(); }
    if (this.look && this.look.id === e.pointerId) {
      const p = this.look; this.look = null;
      if (p.moved < 12 && performance.now() - p.t0 < 400) { this.tap = { x: p.x0, y: p.y0 }; }
    }
  }
  showJoy(x, y) {
    if (!this.joyEl) {
      this.joyEl = document.createElement('div'); this.joyEl.className = 'joy';
      this.joyEl.innerHTML = '<div class="joy-knob"></div>'; document.getElementById('ui').appendChild(this.joyEl);
    }
    this.joyEl.style.left = `${x}px`; this.joyEl.style.top = `${y}px`; this.joyEl.classList.add('on');
    this.joyEl.firstChild.style.transform = 'translate(-50%,-50%)';
  }
  hideJoy() { if (this.joyEl) this.joyEl.classList.remove('on'); }
  updateJoy() {
    const j = this.joy; const dx = j.x - j.x0, dy = j.y - j.y0; const len = Math.hypot(dx, dy) || 1; const cl = Math.min(len, 60);
    if (this.joyEl) this.joyEl.firstChild.style.transform = `translate(calc(-50% + ${dx / len * cl}px), calc(-50% + ${dy / len * cl}px))`;
  }

  // Smoothly aim the camera at a world position for a moment (used when interacting with the baby)
  lookAt(v) { this.lookTarget = v.clone(); this.lookWeight = 1; }

  update(dt) {
    if (!this.enabled) return;
    let fx = 0, fz = 0; // forward, strafe
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fx += 1; if (k.has('KeyS') || k.has('ArrowDown')) fx -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fz -= 1; if (k.has('KeyD') || k.has('ArrowRight')) fz += 1;
    if (this.joy) { const dx = this.joy.x - this.joy.x0, dy = this.joy.y - this.joy.y0; const l = Math.hypot(dx, dy); if (l > 6) { const s = Math.min(1, l / 60); fx = -dy / l * s; fz = dx / l * s; } }
    if (k.has('ArrowLeft') && !k.has('KeyA')) { fz = 0; this.yaw += 1.6 * dt; } if (k.has('ArrowRight') && !k.has('KeyD')) { fz = 0; this.yaw -= 1.6 * dt; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * fx + cos * fz, 0, -cos * fx - sin * fz);
    const moving = wish.lengthSq() > 0.001;
    if (moving) wish.normalize().multiplyScalar(this.speed * (k.has('ShiftLeft') ? 1.6 : 1));
    this.vel.lerp(wish, Math.min(1, dt * 12));
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    this.resolve(next);
    this.pos.copy(next);
    // head bob & footsteps
    const sp = this.vel.length();
    this.bobT += dt * sp * 4.2;
    this.bobAmt = THREE.MathUtils.lerp(this.bobAmt, sp > 0.2 ? 1 : 0, dt * 8);
    this.stepAcc += dt * sp;
    if (this.stepAcc > 0.75 && sp > 0.5) { this.stepAcc = 0; this.onStep?.(); }
    const bobY = Math.sin(this.bobT * 2) * 0.022 * this.bobAmt, bobX = Math.cos(this.bobT) * 0.012 * this.bobAmt;
    // optional look-at easing
    if (this.lookTarget && this.lookWeight > 0.001) {
      const dir = this.lookTarget.clone().sub(new THREE.Vector3(this.pos.x, this.eyeHeight, this.pos.z));
      const ty = Math.atan2(-dir.x, -dir.z), tp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      const a = 1 - Math.pow(0.001, dt);
      let dy = ty - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * a * this.lookWeight; this.pitch += (tp - this.pitch) * a * this.lookWeight;
      this.lookWeight *= Math.pow(0.35, dt);
    }
    this.camera.position.set(this.pos.x + bobX, this.eyeHeight + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobT) * 0.004 * this.bobAmt, 'YXZ');
  }

  resolve(p) {
    const r = this.radius, b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX); p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    for (const c of this.colliders) {
      // c: {min:{x,z}, max:{x,z}} expanded by radius
      const minX = c.min.x - r, maxX = c.max.x + r, minZ = c.min.z - r, maxZ = c.max.z + r;
      if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
        const dl = p.x - minX, dr = maxX - p.x, dn = p.z - minZ, df = maxZ - p.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) p.x = minX; else if (m === dr) p.x = maxX; else if (m === dn) p.z = minZ; else p.z = maxZ;
      }
    }
  }

  consumeTap() { const t = this.tap; this.tap = null; return t; }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}
