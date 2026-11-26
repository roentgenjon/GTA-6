// 3D-Marker (Lichtsäulen) und Blip-Verwaltung
import * as THREE from 'three';
import { G } from './game.js';

const COL = { obj: 0xffd23a, mission: 0xffd23a, shop: 0x4dd0ff, prop: 0x66ff99, wp: 0xff3b5c, enemy: 0xff3b3b, race: 0xb36bff, side: 0xb36bff, ring: 0x4dffb8 };
export const Markers = {
  items: [], pool: [], waypoint: null,
  init(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    const cyl = new THREE.CylinderGeometry(1.4, 1.4, 1, 18, 1, true); cyl.translate(0, 0.5, 0);
    const ring = new THREE.TorusGeometry(2.2, 0.12, 8, 32); ring.rotateX(Math.PI / 2);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
      const beam = new THREE.Mesh(cyl, mat); const rm = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9 }));
      const g = new THREE.Group(); g.add(beam); g.add(rm); g.visible = false; g.userData = { beam, rm }; this.group.add(g); this.pool.push(g);
    }
  },
  clear(tag) { this.items = this.items.filter((m) => m.tag !== tag); },
  add(m) { this.items.push(m); return m; },
  remove(m) { const i = this.items.indexOf(m); if (i >= 0) this.items.splice(i, 1); },
  setWaypoint(x, z) { this.waypoint = x == null ? null : { x, z }; },
  update(dt) {
    const pl = G.player; if (!pl) return; const t = G.clock;
    const list = [];
    for (const m of this.items) { if (m.hidden) continue; const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z); if (d < (m.show || 260)) list.push([d, m]); }
    if (this.waypoint) { const w = this.waypoint; list.push([Math.hypot(w.x - pl.pos.x, w.z - pl.pos.z), { x: w.x, z: w.z, type: 'wp', h: 120 }]); }
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.pool.length; i++) {
      const g = this.pool[i]; const it = list[i];
      if (!it) { g.visible = false; continue; }
      const m = it[1]; g.visible = true;
      const y = m.y != null ? m.y : (G.terrainY ? G.terrainY(m.x, m.z) : 0);
      g.position.set(m.x, y, m.z);
      const h = m.h || (m.type === 'shop' || m.type === 'prop' ? 7 : 60);
      g.userData.beam.scale.set(m.r ? m.r / 1.4 : 1, h, m.r ? m.r / 1.4 : 1);
      g.userData.rm.scale.setScalar((m.r ? m.r / 2.2 : 1) * (1 + 0.06 * Math.sin(t * 4)));
      const c = COL[m.type] || 0xffffff; g.userData.beam.material.color.setHex(c); g.userData.rm.material.color.setHex(c);
      g.userData.beam.material.opacity = m.type === 'shop' || m.type === 'prop' ? 0.2 : 0.3;
    }
  },
};
export const BLIP_COL = COL;
