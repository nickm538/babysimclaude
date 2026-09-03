// First-person arms and hands (camera-attached) that appear when holding the baby or an item.
//
// The arm is one continuous piece of flesh from the sleeve cuff to the fingertips — see armMesh.js —
// rather than capsules with a sphere for a palm. It is rigged so the fingers can actually close
// around what they are holding.
import * as THREE from 'three';
import { makeSkinMaterial } from './skinMaterial.js';
import { buildArm } from './armMesh.js';

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
    // DoubleSide so the cut cuff shows the inside of the sleeve, not a vanishing wall.
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6d85, roughness: 0.95, side: THREE.DoubleSide });
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
    const mk = (name, obj) => { obj.visible = false; this.right.hand.add(obj); this.items[name] = obj; };
    const bottle = new THREE.Group();
    // Baby bottles are frosted polypropylene, not glass: a milky solid with a soft sheen. A transparent
    // cylinder here showed the fingers through it and read as hollow.
    bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.13, 20), new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) })));
    const milk = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xfff8e8 })); milk.position.y = -0.012; bottle.add(milk);
    const nip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 16), new THREE.MeshStandardMaterial({ color: 0xf0c9a8, roughness: 0.6 })); nip.position.y = 0.085; bottle.add(nip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x7fc8e8 })); collar.position.y = 0.065; bottle.add(collar);
    bottle.position.set(0, 0.05, 0.03); bottle.rotation.x = -0.9; mk('bottle', bottle);
    const diaper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.95 })); diaper.position.set(0, 0.04, 0.05); mk('diaper', diaper);
    const bowl = new THREE.Group(); bowl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.035, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffb27a, roughness: 0.4, side: THREE.DoubleSide }))); const food = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshStandardMaterial({ color: 0xe0a24a })); food.rotation.x = -Math.PI / 2; food.position.y = 0.012; bowl.add(food); bowl.position.set(0, 0.05, 0.03); mk('bowl', bowl);
    const spoon = new THREE.Group(); spoon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xff8a5c }))); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff8a5c })); tip.scale.set(1, 0.4, 1.4); tip.position.y = 0.055; spoon.add(tip); spoon.position.set(0, 0.03, 0.06); spoon.rotation.x = -1.2; mk('spoon', spoon);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.8 })); book.position.set(0, 0.03, 0.05); mk('book', book);
    const thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); thermo.rotation.x = -1.1; thermo.position.set(0, 0.04, 0.05); mk('thermometer', thermo);
    const syringe = new THREE.Group();
    syringe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 12), new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 })));
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x9ad0e6, roughness: 0.5 })); plunger.position.y = 0.06; syringe.add(plunger);
    syringe.rotation.x = -1.1; syringe.position.set(0, 0.04, 0.05); mk('medicine', syringe);
    const toy = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0x118ab2, roughness: 0.5 })); toy.position.set(0, 0.045, 0.04); mk('toy', toy);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 0.12), new THREE.MeshStandardMaterial({ color: 0xbfe6d2, roughness: 1 })); cloth.position.set(0, 0.03, 0.05); mk('cloth', cloth);
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
