// First-person arms and hands (camera-attached) that appear when holding the baby or an item.
import * as THREE from 'three';
import { makeSkinMaterial } from './skinMaterial.js';

function capsule(r, len, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); m.castShadow = true; return m; }

export class ParentArms {
  constructor(camera, { skinTone = '#e9bfa0' } = {}) {
    this.camera = camera;
    this.rig = new THREE.Group(); camera.add(this.rig);
    this.skin = makeSkinMaterial({ skinTone, blush: 0.1, sss: 0.4 });
    this.skin.userData.uniforms.uHeadY.value = -10; // no cheeks on arms
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6d85, roughness: 0.95 });
    this.left = this.makeArm(-1, sleeve); this.right = this.makeArm(1, sleeve);
    this.rig.add(this.left.group, this.right.group);
    this.items = {}; this.mode = 'none'; this.weight = 0; this.t = 0;
    this.buildItems();
    this.rig.visible = false;
  }

  makeArm(sx, sleeve) {
    const group = new THREE.Group();
    const upper = capsule(0.045, 0.22, sleeve); upper.rotation.z = Math.PI / 2; group.add(upper);
    const fore = capsule(0.036, 0.2, this.skin); group.add(fore);
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), this.skin); palm.scale.set(1, 0.55, 1.25); hand.add(palm);
    for (let i = 0; i < 4; i++) { const f = capsule(0.011, 0.05, this.skin); f.position.set(-0.03 + i * 0.02, 0, 0.065); f.rotation.x = Math.PI / 2 + 0.25; hand.add(f); }
    const thumb = capsule(0.012, 0.04, this.skin); thumb.position.set(sx * 0.045, 0.005, 0.02); thumb.rotation.set(Math.PI / 2, 0, sx * 0.9); hand.add(thumb);
    group.add(hand);
    return { group, upper, fore, hand, sx };
  }

  buildItems() {
    const mk = (name, obj) => { obj.visible = false; this.right.hand.add(obj); this.items[name] = obj; };
    const bottle = new THREE.Group();
    bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.13, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.7, roughness: 0.1, transparent: true, opacity: 0.6, thickness: 0.02 })));
    const milk = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xfff8e8 })); milk.position.y = -0.012; bottle.add(milk);
    const nip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 16), new THREE.MeshStandardMaterial({ color: 0xf0c9a8, roughness: 0.6 })); nip.position.y = 0.085; bottle.add(nip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0x7fc8e8 })); collar.position.y = 0.065; bottle.add(collar);
    bottle.position.set(0, 0.05, 0.03); bottle.rotation.x = -0.9; mk('bottle', bottle);
    const diaper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.95 })); diaper.position.set(0, 0.04, 0.05); mk('diaper', diaper);
    const bowl = new THREE.Group(); bowl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.035, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffb27a, roughness: 0.4, side: THREE.DoubleSide }))); const food = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshStandardMaterial({ color: 0xe0a24a })); food.rotation.x = -Math.PI / 2; food.position.y = 0.012; bowl.add(food); bowl.position.set(0, 0.05, 0.03); mk('bowl', bowl);
    const spoon = new THREE.Group(); spoon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xff8a5c }))); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff8a5c })); tip.scale.set(1, 0.4, 1.4); tip.position.y = 0.055; spoon.add(tip); spoon.position.set(0, 0.03, 0.06); spoon.rotation.x = -1.2; mk('spoon', spoon);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.8 })); book.position.set(0, 0.03, 0.05); mk('book', book);
    const thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); thermo.rotation.x = -1.1; thermo.position.set(0, 0.04, 0.05); mk('thermometer', thermo);
    const syringe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 10), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.5, transparent: true, opacity: 0.7 })); syringe.rotation.x = -1.1; syringe.position.set(0, 0.04, 0.05); mk('medicine', syringe);
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
      // hold: both arms cradle in front; item: right hand raised, left lower
      const px = hold ? sx * 0.16 : sx * 0.26, py = hold ? -0.34 : (sx > 0 ? -0.24 : -0.36), pz = hold ? -0.42 : (sx > 0 ? -0.36 : -0.5);
      arm.group.position.set(px, py + breathe + (1 - w) * -0.25, pz);
      arm.group.rotation.set(hold ? 0.2 : 0.1, hold ? -sx * 0.9 : -sx * 0.5, hold ? sx * 0.35 : sx * 0.15);
      arm.upper.position.set(sx * 0.16, -0.04, 0.16); arm.upper.rotation.set(0.5, 0, Math.PI / 2 + sx * 0.4);
      arm.fore.position.set(0, 0, 0); arm.fore.rotation.set(Math.PI / 2 + 0.2, 0, 0);
      arm.hand.position.set(0, 0, -0.14); arm.hand.rotation.set(hold ? -0.4 : 0.3, 0, hold ? sx * 1.3 : 0);
    }
  }
}
