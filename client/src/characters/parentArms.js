// First-person arms and hands (camera-attached) that appear when holding the baby or an item.
//
// The arm is one continuous piece of flesh from the sleeve cuff to the fingertips — see armMesh.js —
// rather than capsules with a sphere for a palm. It is rigged so the fingers can actually close
// around what they are holding.
import * as THREE from 'three';
import { makeSkinMaterial } from './skinMaterial.js';
import { buildArm } from './armMesh.js';
import { buildHandProps } from './handProps.js';
import { clothMaterial, fabricTexture } from '../engine/textures.js';

// Camera-space landmarks in metres: where the shoulder sits relative to the eyes, and where the hand
// goes in each pose. A cradle hold brings both hands to the chest; an item pose lifts the right hand
// into view and lets the left hang lower.
const ARM = {
  fwd: new THREE.Vector3(0, 0, 1),
  shoulder: new THREE.Vector3(0.21, -0.36, 0.06),
  holdHand: new THREE.Vector3(0.05, -0.32, -0.40),
  itemHandR: new THREE.Vector3(0.14, -0.22, -0.42),
  itemHandL: new THREE.Vector3(0.24, -0.34, -0.48),
};

export class ParentArms {
  constructor(camera, { skinTone = '#e9bfa0' } = {}) {
    this.camera = camera;
    this.rig = new THREE.Group(); camera.add(this.rig);
    this.skin = makeSkinMaterial({ skinTone, blush: 0.1, sss: 0.4 });
    this.skin.userData.uniforms.uHeadY.value = -10; // no cheeks on arms
    // The sleeve is the single largest thing on screen whenever the arms are up, so it is a woven
    // fabric with sheen rather than a slab of colour. DoubleSide so the cut cuff shows the inside of
    // the sleeve, not a vanishing wall.
    const sleeve = clothMaterial(fabricTexture({ color: '#5b6d85', repeat: 9, weave: 5, seed: 41 }), {
      sheen: 0.55, sheenTint: 0.45, extra: { side: THREE.DoubleSide, roughness: 0.96 },
    });
    this.mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    this.left = this.makeArm(-1, sleeve); this.right = this.makeArm(1, sleeve);
    this.rig.add(this.left.group, this.right.group);
    this.items = {}; this.mode = 'none'; this.weight = 0; this.t = 0;
    this.buildItems();
    this.rig.visible = false;
  }

  makeArm(sx, sleeve) {
    const group = new THREE.Group();
    const built = buildArm({ sx, skinMat: this.skin, sleeveMat: sleeve, mobile: this.mobile });
    group.add(built.mesh);
    // `hand` is the node items are parented to, so the bottle and spoon travel with the fingers.
    const hand = new THREE.Group();
    built.bones.hand.add(hand);
    hand.position.set(0, 0, 0.04);
    return { group, mesh: built.mesh, bones: built.bones, hand, sx };
  }

  buildItems() {
    // The props themselves live in handProps.js — this file is about arms.
    this.items = buildHandProps();
    for (const o of Object.values(this.items)) this.right.hand.add(o);
  }

  // mode: none | hold | item; item: name of an item in the right hand
  set(mode, item = null) {
    this.mode = mode; this.item = item;
    for (const [k, o] of Object.entries(this.items)) o.visible = k === item;
  }

  update(dt) {
    this.t += dt;
    const want = this.mode === 'none' ? 0 : 1;
    this.weight += (want - this.weight) * Math.min(1, dt * 6);
    this.rig.visible = this.weight > 0.02;
    if (!this.rig.visible) return;
    const w = this.weight, breathe = Math.sin(this.t * 1.6) * 0.006;
    for (const arm of [this.left, this.right]) {
      const sx = arm.sx;
      const hold = this.mode === 'hold';
      // The arm mesh runs from the shoulder along +Z. Place the shoulder where a shoulder is relative
      // to the eyes — beside and below the camera, slightly behind it — and aim the arm at where the
      // hand should end up. Aiming with a quaternion instead of guessing Euler angles is what keeps
      // the elbow from ending up in front of your face.
      const shoulder = ARM.shoulder.clone(); shoulder.x *= sx;
      const target = (hold ? ARM.holdHand : (sx > 0 ? ARM.itemHandR : ARM.itemHandL)).clone(); target.x *= sx;
      shoulder.y += breathe + (1 - w) * -0.3;
      arm.group.position.copy(shoulder);
      const dir = target.sub(shoulder).normalize();
      arm.group.quaternion.setFromUnitVectors(ARM.fwd, dir);
      // roll the forearm so the palm faces the baby (in), not the floor
      arm.group.rotateZ(sx * (hold ? 1.1 : 0.55));
      const B = arm.bones;
      // Cradling: the palms turn up and in under the baby and the fingers close over it, the way
      // hands actually hold something warm and heavy. Holding an item: a firmer, deeper grip.
      const curl = hold ? 0.55 : 1.0;
      B.upperArm.rotation.set(0, 0, 0);
      B.foreArm.rotation.set(hold ? -0.35 : -0.25, 0, sx * 0.05);
      B.hand.rotation.set(hold ? 0.55 : -0.1, sx * (hold ? 0.45 : 0.1), hold ? -sx * 0.6 : 0);
      B.fingers.rotation.set(curl * (hold ? 1.05 : 1.25) + Math.sin(this.t * 1.3 + sx) * 0.03, 0, 0);
      B.thumb.rotation.set(0, -sx * curl * 0.9, -sx * 0.35);
    }
  }
}
