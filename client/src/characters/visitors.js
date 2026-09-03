// Keeps the people in the room in sync with view.social: whoever the simulation says is here gets
// built, placed and animated; whoever left gets disposed. One NPC at a time is all the social layer
// ever produces, but the manager is written for several so a playdate can add the other parent.
import * as THREE from 'three';
import { Adult } from './adult.js';

// Where a visitor stands or sits, and what they look at while they are there.
const STANDS = {
  door: { pos: [5.4, 0, 3.9], face: [1, 1.4, 0] },
  sofa: { pos: [-0.5, 0, 1.55], face: [1.5, 1.0, -0.5], sitting: true },
  crib: { pos: [3.7, 0, -3.2], face: [4.6, 0.9, -3.5] },
  play_mat: { pos: [2.2, 0, 1.1], face: [3.0, 0.4, 1.5] },
  kitchen: { pos: [-4.0, 0, -2.2], face: [-4.8, 1.0, -2.6] },
  room: { pos: [1.8, 0, 2.4], face: [1.4, 0.9, -0.5] },
};

// Which spot suits what they came to do.
function spotFor(activity, babyLocation) {
  const a = String(activity || '').toLowerCase();
  if (/cook|kitchen|tea|food|casserole/.test(a)) return STANDS.kitchen;
  if (/hold|cuddle|rock|feed|sit|chat|talk|catch/.test(a)) return STANDS.sofa;
  if (/watch|sleep|nap|settle/.test(a)) return STANDS.crib;
  if (/play|peekaboo|toys|floor/.test(a)) return STANDS.play_mat;
  if (babyLocation === 'crib') return STANDS.crib;
  if (babyLocation === 'play_mat' || babyLocation === 'floor') return STANDS.play_mat;
  return STANDS.room;
}

export class Visitors {
  constructor(scene, { mobile = false } = {}) {
    this.scene = scene; this.mobile = mobile;
    this.people = new Map();   // contactId -> { npc, spot, arrived }
    this.tmp = new THREE.Vector3();
  }

  // Called on every view update. `babyHead` is a world position to look at, when there is one.
  sync(view, babyHead) {
    const s = view && view.social;
    const here = new Map();
    if (s && s.visitor) {
      here.set(s.visitor.contactId || s.visitor.name, {
        name: s.visitor.name,
        relation: s.visitor.relation,
        activity: s.visitor.activity,
      });
    }
    // remove anyone who has gone home
    for (const [id, rec] of this.people) {
      if (!here.has(id)) { rec.npc.dispose(); this.people.delete(id); }
    }
    for (const [id, info] of here) {
      let rec = this.people.get(id);
      if (!rec) {
        const npc = new Adult(this.scene, { id, relation: info.relation, name: info.name, mobile: this.mobile });
        rec = { npc, spot: null, t: 0 };
        this.people.set(id, rec);
      }
      const spot = spotFor(info.activity, view.baby.state.location);
      if (rec.spot !== spot) {
        rec.spot = spot;
        rec.npc.place(new THREE.Vector3(...spot.pos), new THREE.Vector3(...spot.face));
        rec.npc.sitting = !!spot.sitting;
      }
      // Look at the baby when they can see one, otherwise at whatever they came to do.
      rec.npc.lookAt(babyHead && !view.baby.state.hospitalized ? babyHead : new THREE.Vector3(...spot.face));
    }
  }

  update(dt) { for (const rec of this.people.values()) rec.npc.update(dt); }

  get count() { return this.people.size; }

  dispose() { for (const rec of this.people.values()) rec.npc.dispose(); this.people.clear(); }
}
