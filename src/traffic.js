// Autoverkehr: Spurführung auf dem Straßenraster, Ampeln, Abstandshalten, Parkplätze
import { G, emit, on } from './game.js?v=20261126142831-8986ff1';
import { Veh } from './vehicles.js?v=20261126142831-8986ff1';
import { CATALOG, BY_ID, CIVIL_COMMON } from './catalog.js?v=20261126142831-8986ff1';
import * as TR from './terrain.js?v=20261126142831-8986ff1';
import { P, R, K, DIRS } from './terrain.js?v=20261126142831-8986ff1';
import { clamp, rr, wrapAngle, angDiff, pick, damp } from './util.js?v=20261126142831-8986ff1';

const LANE = 3.5;
const right = (d) => [-DIRS[d][1], DIRS[d][0]]; // rechte Seite
const _tmp = [];

// ---------- Verkehrs-KI ----------
export class DriverAI {
  constructor(v, k, l, d) {
    this.v = v; this.k = k; this.l = l; this.d = d; // aktuell auf Kante von (k,l) in Richtung d
    this.wps = []; this.lookT = 0; this.mode = 'drive'; this.panic = 0; this.stuck = 0; this.limit = rr(10.5, 14.5); this.wait = 0; this.reverseT = 0; this.honkT = 0; this.entryNode = null;
    this.aggr = Math.random();
    this.planEdge(k, l, d, true);
  }
  // Wegpunkte für Kante (k,l)->d
  planEdge(k, l, d, first) {
    const [dx, dz] = DIRS[d], [rx, rz] = right(d);
    const nk = k + dx, nl = l + dz;
    const ex = nk * P - dx * (R / 2) + rx * LANE, ez = nl * P - dz * (R / 2) + rz * LANE;
    if (first) { this.wps = [{ x: ex, z: ez, node: { k: nk, l: nl, d } }]; } else this.wps.push({ x: ex, z: ez, node: { k: nk, l: nl, d } });
  }
  // beim Erreichen des Eingangspunkts: nächste Richtung wählen und Kurve planen
  planTurn(node) {
    const { k, l, d } = node;
    const opts = [];
    for (let d2 = 0; d2 < 4; d2++) { if (d2 === (d + 2) % 4) continue; if (TR.edgeExists(k, l, d2)) opts.push(d2); }
    let d2;
    if (!opts.length) d2 = (d + 2) % 4; // Sackgasse: wenden (U-Kurve über Kreuzung)
    else if (this.flee) { const pl = G.player; const ax = this.v.pos.x - pl.pos.x, az = this.v.pos.z - pl.pos.z; const al = Math.hypot(ax, az) || 1; const w = opts.map((o) => 1 + Math.max(0, (DIRS[o][0] * ax + DIRS[o][1] * az) / al) * 5); let t = w.reduce((a, b) => a + b, 0), r = Math.random() * t; d2 = opts[0]; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { d2 = opts[i]; break; } } }
    else { const w = opts.map((o) => (o === d ? 3 : 1)); let t = w.reduce((a, b) => a + b, 0), r = Math.random() * t; d2 = opts[0]; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { d2 = opts[i]; break; } } }
    const [dx, dz] = DIRS[d], [rx, rz] = right(d), [dx2, dz2] = DIRS[d2], [rx2, rz2] = right(d2);
    const bx = k * P, bz = l * P;
    const X = { x: bx + dx2 * (R / 2) + rx2 * LANE, z: bz + dz2 * (R / 2) + rz2 * LANE };
    const turn = d2 === d ? 'straight' : d2 === (d + 1) % 4 ? 'right' : d2 === (d + 3) % 4 ? 'left' : 'uturn';
    const E = { x: bx - dx * (R / 2) + rx * LANE, z: bz - dz * (R / 2) + rz * LANE };
    if (turn === 'right' || turn === 'left') {
      const sgn = turn === 'right' ? 1 : -1, rad = turn === 'right' ? (R / 2 - LANE) : (R / 2 + LANE);
      const cx = E.x + sgn * rx * rad, cz = E.z + sgn * rz * rad;
      const mx = (E.x + X.x) / 2 - cx, mz = (E.z + X.z) / 2 - cz, ml = Math.hypot(mx, mz) || 1;
      this.wps.push({ x: cx + mx / ml * rad, z: cz + mz / ml * rad, turn: true });
    } else if (turn === 'uturn') { this.wps.push({ x: bx + rx * 0 + dx * 2, z: bz + dz * 2, turn: true }); }
    this.wps.push({ x: X.x, z: X.z, exit: true });
    this.k = k; this.l = l; this.d = d2;
    this.planEdge(k, l, d2, false);
  }
  control(dt) {
    const v = this.v, I = v.input, pos = v.pos;
    if (v.wreck) return;
    if (!this.wps.length) { this.planEdge(this.k, this.l, this.d, true); }
    let wp = this.wps[0];
    const dx = wp.x - pos.x, dz = wp.z - pos.z, dist = Math.hypot(dx, dz);
    const sp = v.speed;
    const reach = wp.node ? 3.2 : 4.2;
    // Zielwechsel
    if (dist < Math.max(reach, sp * 0.35)) {
      if (wp.node) {
        // Ampel prüfen: vor dem Einfahren
        const n = wp.node;
        if (!this.ignoreLights && !TR.canEnter(n.k, n.l, n.d, G.clock) && !this.inside) { this.holdAtLine = true; }
        else { this.holdAtLine = false; this.wps.shift(); this.planTurn(n); wp = this.wps[0]; this.inside = true; }
      } else { this.wps.shift(); if (wp.exit) this.inside = false; wp = this.wps[0]; }
    }
    if (!wp) return;
    // Pure-Pursuit
    const tx = wp.x - pos.x, tz = wp.z - pos.z;
    const targetYaw = Math.atan2(tx, tz);
    const err = angDiff(v.yaw, targetYaw);
    let steer = clamp(err * 1.6, -1, 1);
    // Geschwindigkeitsziel
    let target = this.limit * (this.aggr > 0.8 ? 1.15 : 1);
    if (wp.turn || (this.inside && wp.exit)) target = Math.min(target, 6.5);
    else if (this.wps[0] && this.wps[0].node && Math.hypot(this.wps[0].x - pos.x, this.wps[0].z - pos.z) < 22) target = Math.min(target, 9);
    // Ampel: bremsen
    const front = this.wps[0];
    if (front && front.node && !this.inside) {
      const n = front.node, dd = Math.hypot(front.x - pos.x, front.z - pos.z);
      if (!this.ignoreLights && !TR.canEnter(n.k, n.l, n.d, G.clock)) { const allowed = dd - 1.2; target = Math.min(target, clamp(allowed * 0.9, 0, target)); if (dd < 2.4) target = 0; }
    }
    // Hindernisse voraus
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let gap = 99, blocker = null;
    for (const o of G.entities.vehicles) {
      if (o === v || o.pos.y > 4 && o.kind !== 'car') continue;
      const ox = o.pos.x - pos.x, oz = o.pos.z - pos.z; const along = ox * fx + oz * fz;
      if (along < 0 || along > 26) continue;
      const lat = Math.abs(ox * fz - oz * fx);
      if (lat < v.halfW + o.halfW * 0.8 + 0.6 && !(o.parked && lat > 2.6)) { const g = along - v.halfL - o.halfL; if (g < gap) { gap = g; blocker = o; } }
    }
    for (const p of G.entities.peds) {
      if (p.dead && p.deadAnim > 1) continue;
      const ox = p.pos.x - pos.x, oz = p.pos.z - pos.z; const along = ox * fx + oz * fz; if (along < 0 || along > 16) continue;
      const lat = Math.abs(ox * fz - oz * fx); if (lat < v.halfW + 0.9) { const g = along - v.halfL - 0.4; if (g < gap) { gap = g; blocker = p; } }
    }
    const pl = G.player;
    if (gap < 99) { target = Math.min(target, clamp((gap - 3.5) * 1.3, 0, target)); if (gap < 4 && blocker && blocker.vel && Math.hypot(blocker.vel.x, blocker.vel.z) < 0.5) { this.honkT -= dt; if (this.honkT <= 0 && gap < 7) { v.hornT = 0.4; emit('honk', v); this.honkT = rr(2, 5); } } }
    // Panik
    if (this.panic > 0) { this.panic -= dt; target = Math.max(target, 17); }
    // Steuerung
    const diff = target - sp;
    if (this.reverseT > 0) { this.reverseT -= dt; I.throttle = 0; I.brake = 0.8; I.steer = -steer; }
    else {
      I.steer = damp(I.steer, steer, 6, dt);
      if (diff > 0.6) { I.throttle = clamp(diff * 0.35, 0, 0.8); I.brake = 0; }
      else if (diff < -0.8) { I.throttle = 0; I.brake = clamp(-diff * 0.25, 0, 1); if (target === 0 && sp < 0.4) { I.brake = 0.3; } }
      else { I.throttle = 0.12; I.brake = 0; }
    }
    I.handbrake = false;
    // Festgefahren
    if (target > 3 && Math.abs(sp) < 0.4 && gap > 6) { this.stuck += dt; if (this.stuck > 3.5) { this.reverseT = 1.6; this.stuck = 0; } } else this.stuck = Math.max(0, this.stuck - dt);
  }
}

// ---------- Verwaltung ----------
const KIND_WEIGHTS = [['compact', 12], ['sedan', 38], ['suv', 14], ['pickup', 8], ['van', 6], ['sport', 7], ['muscle', 3], ['super', 1], ['taxi', 6], ['bus', 3], ['truck', 2], ['ambulance', 0.4]];
function pickSpec() {
  let t = KIND_WEIGHTS.reduce((a, b) => a + b[1], 0), r = Math.random() * t;
  for (const [k, w] of KIND_WEIGHTS) { r -= w; if (r <= 0) { if (k === 'taxi') return BY_ID.taxi; if (k === 'ambulance') return BY_ID.ambulance; if (k === 'bus') return BY_ID['bus_1']; if (k === 'truck') return pick([BY_ID.truck_1, BY_ID.truck_2, BY_ID.truck_4]); const l = CATALOG.filter((c) => c.cls === k && !c.special); return pick(l); } }
  return BY_ID.sedan_1;
}
export const Traffic = {
  timer: 0, parkTimer: 0,
  count() { let n = 0; for (const v of G.entities.vehicles) if (v.isTraffic && !v.wreck) n++; return n; },
  parkedCount() { let n = 0; for (const v of G.entities.vehicles) if (v.parked && !v.owned && v.isParked) n++; return n; },
  spawnOne() {
    const pl = G.player; if (!pl) return false;
    const px = pl.pos.x, pz = pl.pos.z;
    if (!(px > -1200 && px < 1260 && pz > -1200 && pz < 1260)) return false;
    // Richtung vor dem Spieler bevorzugen
    for (let t = 0; t < 8; t++) {
      const a = Math.random() * 6.28, d = rr(110, 280);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const k = clamp(Math.round(x / P), -K, K), l = clamp(Math.round(z / P), -K, K);
      const dirs = []; for (let dd = 0; dd < 4; dd++) if (TR.edgeExists(k, l, dd)) dirs.push(dd);
      if (!dirs.length) continue;
      const d0 = pick(dirs), [dx, dz] = DIRS[d0], [rx, rz] = right(d0);
      const f = rr(0.2, 0.8);
      const sx = k * P + dx * (R / 2 + (P - R) * f) + rx * LANE, sz = l * P + dz * (R / 2 + (P - R) * f) + rz * LANE;
      // nicht im Sichtfeld direkt
      if ((sx - px) ** 2 + (sz - pz) ** 2 < 90 * 90) continue;
      if (G.entities.vehicles.some((o) => (o.pos.x - sx) ** 2 + (o.pos.z - sz) ** 2 < 100)) continue;
      const spec = pickSpec();
      const v = Veh.spawn(spec, sx, sz, Math.atan2(dx, dz));
      v.isTraffic = true; v.driver = { npc: true }; v.ai = new DriverAI(v, k, l, d0); v.vel.set(dx * 8, 0, dz * 8);
      if (spec.special === 'taxi') v.sirenOn = false;
      return true;
    }
    return false;
  },
  spawnParked() {
    const pl = G.player; if (!pl) return;
    const px = pl.pos.x, pz = pl.pos.z; if (!(px > -1200 && px < 1260 && pz > -1200 && pz < 1260)) return;
    for (let t = 0; t < 6; t++) {
      const a = Math.random() * 6.28, d = rr(40, 160);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const k = clamp(Math.round(x / P), -K, K), l = clamp(Math.round(z / P), -K, K);
      const dirs = []; for (let dd = 0; dd < 4; dd++) if (TR.edgeExists(k, l, dd) && (dd === 0 || dd === 1)) dirs.push(dd);
      if (!dirs.length) continue;
      const d0 = pick(dirs), [dx, dz] = DIRS[d0], [rx, rz] = right(d0);
      const side = Math.random() < 0.5 ? 1 : -1, f = rr(0.12, 0.88);
      const off = (R / 2 - 1.15) * side;
      const sx = k * P + dx * (R / 2 + (P - R) * f) + rx * off, sz = l * P + dz * (R / 2 + (P - R) * f) + rz * off;
      if ((sx - px) ** 2 + (sz - pz) ** 2 < 28 * 28) continue;
      if (G.entities.vehicles.some((o) => (o.pos.x - sx) ** 2 + (o.pos.z - sz) ** 2 < 36)) continue;
      const spec = pick(CIVIL_COMMON);
      const v = Veh.spawn(spec, sx, sz, Math.atan2(dx, dz) + (side > 0 ? 0 : Math.PI));
      v.parked = true; v.isParked = true; return;
    }
  },
  update(dt) {
    const pl = G.player; if (!pl) return;
    this.timer -= dt;
    const max = Math.round((G.quality ? G.quality.traffic : 28) * (1 - G.night * 0.35) * (G.settings.traffic || 1));
    if (this.timer <= 0) { this.timer = 0.5; if (this.count() < max) this.spawnOne(); }
    this.parkTimer -= dt;
    if (this.parkTimer <= 0) { this.parkTimer = 0.8; if (this.parkedCount() < (G.quality ? G.quality.parked : 24)) this.spawnParked(); }
    for (let i = G.entities.vehicles.length - 1; i >= 0; i--) {
      const v = G.entities.vehicles[i];
      if (v.ai && v.ai.control && v.driver && v.driver.npc) v.ai.control(dt);
      // Despawn
      if ((v.isTraffic || v.isParked) && !v.driver?.isPlayer && !v.owned && !v.isMission && !v.keep) {
        const d2 = (v.pos.x - pl.pos.x) ** 2 + (v.pos.z - pl.pos.z) ** 2;
        const far = v.isParked ? 230 : 340;
        if (d2 > far * far || (v.wreck && v.wreckT > 30 && d2 > 50 * 50)) {
          if (v.isParked || !this.inView(v)) Veh.remove(v);
        }
      }
    }
  },
  inView(v) {
    const cam = G.camera; if (!cam) return false;
    const p = v.pos.clone().project(cam); return p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 && v.pos.distanceTo(cam.position) < 140;
  },
};
// Reaktionen: Hupen, Panik
on('vehicleCollision', (a, b, sp) => {
  for (const v of [a, b]) if (v.ai instanceof DriverAI && v.driver && v.driver.npc) { v.ai.panic = 0; if (sp > 6) { v.ai.panic = 3; } }
});
on('gunshot', (x, z) => { for (const v of G.entities.vehicles) if (v.ai instanceof DriverAI && v.isTraffic && (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 < 40 * 40) v.ai.panic = 5; });
on('explosion', (x, y, z) => { for (const v of G.entities.vehicles) if (v.ai instanceof DriverAI && v.isTraffic && (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 < 70 * 70) v.ai.panic = 6; });
