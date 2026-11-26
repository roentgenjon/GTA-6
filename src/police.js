// Fahndungssystem: Verbrechen, Polizeiautos, Streifen, Helikopter, Straßensperren
import * as THREE from 'three';
import { G, emit, on } from './game.js';
import { Veh } from './vehicles.js';
import { Peds, Ped } from './peds.js';
import { randomLook } from './persons.js';
import { Combat } from './combat.js';
import * as TR from './terrain.js';
import { P, K, R } from './terrain.js';
import { clamp, damp, rr, angDiff, wrapAngle, pick } from './util.js';
import { FX } from './effects.js';
import { BY_ID } from './catalog.js';

const THRESH = [6, 18, 40, 70, 110];
const CRIME = { assault: 2.5, shoot_ped: 4, kill_ped: 10, shoot_veh: 2, theft: 4, carjack: 9, explosion: 9, ran_player: 3, run_over: 5, hit_cop: 22, kill_cop: 32, crash: 1.2, gunshot: 2, shoot_cop: 24, red_light: 1.5, aim_cop: 6, kill_ped_veh: 12 };
const UNITS = { cars: [0, 2, 3, 5, 7, 8], heli: [0, 0, 1, 1, 2, 2], swat: [0, 0, 0, 2, 3, 3], army: [0, 0, 0, 0, 0, 2] };

// ---------- Verfolger-KI für Polizeiautos ----------
class ChaseAI {
  constructor(v, role = 'cop') { this.v = v; this.role = role; this.path = []; this.pathT = 0; this.stuck = 0; this.reverseT = 0; this.unitT = 0; this.exitT = 0; this.rammer = Math.random() < 0.5; this.passengers = 2; this.exited = false; this.bypass = 0; }
  control(dt) {
    const v = this.v, I = v.input, pl = G.player; if (v.wreck || !pl) return;
    const tp = G.police.targetPos(); const sp = v.speed;
    this.pathT -= dt;
    const inCity = v.pos.x > -1160 && v.pos.x < 1160 && v.pos.z > -1160 && v.pos.z < 1160 && tp.x > -1160 && tp.x < 1160 && tp.z > -1160 && tp.z < 1160;
    const dx = tp.x - v.pos.x, dz = tp.z - v.pos.z, dist = Math.hypot(dx, dz);
    let goal = { x: tp.x, z: tp.z };
    if (inCity && dist > 55) {
      if (this.pathT <= 0) { this.path = TR.routeBetween(v.pos.x, v.pos.z, tp.x, tp.z).slice(1); this.pathT = 1.6; }
      // nächster Wegpunkt, der nicht erreicht ist
      while (this.path.length > 1 && Math.hypot(this.path[0][0] - v.pos.x, this.path[0][1] - v.pos.z) < 14) this.path.shift();
      if (this.path.length) { goal = { x: this.path[0][0], z: this.path[0][1] }; if (this.path.length === 1) goal = { x: tp.x, z: tp.z }; }
    }
    // Rammen: Zielpunkt voraus
    if (this.rammer && G.police.level >= 3 && dist < 45 && pl.vehicle) { goal = { x: tp.x + pl.vehicle.vel.x * 0.5, z: tp.z + pl.vehicle.vel.z * 0.5 }; }
    const gx = goal.x - v.pos.x, gz = goal.z - v.pos.z, gd = Math.hypot(gx, gz);
    let ty = Math.atan2(gx, gz); const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    // Hindernis voraus
    const look = clamp(8 + sp * 0.7, 8, 28);
    const rt = TR.rayStatic(v.pos.x, 1, v.pos.z, fx, 0, fz, look);
    let avoid = 0;
    if (rt < look) {
      const rl = TR.rayStatic(v.pos.x, 1, v.pos.z, Math.sin(v.yaw + 0.6), 0, Math.cos(v.yaw + 0.6), look), rr_ = TR.rayStatic(v.pos.x, 1, v.pos.z, Math.sin(v.yaw - 0.6), 0, Math.cos(v.yaw - 0.6), look);
      avoid = rl > rr_ ? 1 : -1; ty = v.yaw + avoid * 0.9 * (1 - rt / look + 0.3);
    }
    const err = angDiff(v.yaw, ty);
    I.steer = damp(I.steer, clamp(err * 1.8, -1, 1), 7, dt);
    const lvl = G.police.level;
    let target = 17 + lvl * 3.2; if (dist < 25) target = Math.max(8, (pl.vehicle ? Math.abs(pl.vehicle.speed) : 5) + 4);
    if (Math.abs(err) > 0.7) target *= 0.5; if (rt < 9) target = Math.min(target, 7);
    if (dist < 8 && !pl.vehicle) target = 0;
    const diff = target - sp;
    if (this.reverseT > 0) { this.reverseT -= dt; I.throttle = 0; I.brake = 1; I.steer = -I.steer; }
    else { I.throttle = diff > 0 ? clamp(diff * 0.4, 0, 1) : 0; I.brake = diff < -1.5 ? clamp(-diff * 0.2, 0, 1) : 0; }
    I.handbrake = false;
    if (target > 4 && Math.abs(sp) < 0.8) { this.stuck += dt; if (this.stuck > 1.6) { this.reverseT = 1.3; this.stuck = 0; } } else this.stuck = Math.max(0, this.stuck - dt * 2);
    v.sirenOn = true;
    // Aussteigen
    this.exitT += dt;
    if (!this.exited && dist < 32 && (!pl.vehicle || Math.abs(pl.vehicle.speed) < 3) && this.exitT > 2 && G.police.level > 0 && sp < 8) this.dismount();
  }
  dismount() {
    const v = this.v; this.exited = true; v.input.throttle = 0; v.input.brake = 1; v.input.handbrake = true; v.sirenOn = true; v.ai = null; v.driver = null; v.keep = false;
    const n = this.role === 'army' ? 3 : this.role === 'swat' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), side = i % 2 ? 1 : -1;
      G.police.spawnCop(v.pos.x + c * side * (v.halfW + 1.0) - s * (i * 0.8 - 1), v.pos.z - s * side * (v.halfW + 1.0) - c * (i * 0.8 - 1), this.role);
    }
  }
}

// ---------- Hubschrauber-KI ----------
class HeliAI {
  constructor(v) { this.v = v; this.ang = Math.random() * 6.28; this.shootT = 3; this.beam = null; }
  control(dt) {
    const v = this.v, I = v.input, tp = G.police.targetPos(), pl = G.player;
    this.ang += dt * 0.25;
    const tx = tp.x + Math.cos(this.ang) * 38, tz = tp.z + Math.sin(this.ang) * 38, alt = (pl.vehicle && pl.vehicle.kind === 'heli' ? pl.pos.y : TR.groundHeight(tp.x, tp.z)) + 48;
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const ff = dx * sn + dz * cs, rc = -dx * cs + dz * sn;
    const vf = v.vel.x * sn + v.vel.z * cs, vr = -v.vel.x * cs + v.vel.z * sn;
    I.pitch = clamp(-(ff * 0.012 - vf * 0.07), -1, 1); I.roll = clamp(rc * 0.012 - vr * 0.07, -1, 1);
    const want = Math.atan2(tp.x - v.pos.x, tp.z - v.pos.z); I.yaw = clamp(-angDiff(v.yaw, want) * 2, -1, 1);
    I.lift = clamp((alt - v.pos.y) * 0.15 - v.vy * 0.1, -1, 1);
    // Scheinwerfer
    if (!this.beam) { const g = new THREE.ConeGeometry(7, 48, 18, 1, true); g.translate(0, -24, 0); this.beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); G.scene.add(this.beam); }
    const bx = v.pos.x, by = v.pos.y - 1, bz = v.pos.z, tdx = tp.x - bx, tdy = tp.y - by, tdz = tp.z - bz, tl = Math.hypot(tdx, tdy, tdz);
    this.beam.position.set(bx, by, bz); this.beam.scale.set(1, tl / 48, 1);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(tdx / tl, tdy / tl, tdz / tl));
    this.beam.visible = !v.wreck && v.spec.flags.police;
    if (G.night < 0.3) this.beam.material.opacity = 0.05; else this.beam.material.opacity = 0.16;
    // Schießen
    if (G.police.level >= 4 && G.police.seen && tl < 90 && !v.wreck) { this.shootT -= dt; if (this.shootT <= 0) { this.shootT = 0.12; if (Math.random() < 0.35) { if (G.audio) G.audio.gun('smg', v.pos); const hit = Math.random() < 0.18; if (hit && pl.alive) pl.damage(5, v.pos); FX.tracer(new THREE.Vector3(bx, by, bz), new THREE.Vector3(tp.x + rr(-3, 3), tp.y + 1, tp.z + rr(-3, 3))); } if (Math.random() < 0.02) this.shootT = 2.5; } }
    v.sirenOn = true;
  }
  dispose() { if (this.beam) { G.scene.remove(this.beam); this.beam = null; } }
}

export const Police = {
  level: 0, heat: 0, seen: false, unseenT: 0, searching: false, lastKnown: new THREE.Vector3(), spawnT: 0, roadblocks: [], blockT: 0, cooldown: 0, flash: 0, copCount: 0, arrestT: 0, busted: false, stationPos: null,
  targetPos() { return this.seen || !this.searching ? G.player.pos : this.lastKnown; },
  setLevel(l) { l = clamp(l, 0, 5); if (l > this.level) emit('wantedUp', l); if (l === 0 && this.level > 0) emit('wantedLost'); this.level = l; if (l === 0) { this.heat = 0; this.clearAll(); } else if (this.heat < THRESH[l - 1]) this.heat = THRESH[l - 1]; },
  clearWanted() { this.setLevel(0); },
  crime(type, pos, target) {
    const pl = G.player; if (!pl || !pl.alive) return;
    let val = CRIME[type] || 1;
    // Zeugen
    let witness = false, copNear = false;
    for (const p of G.entities.peds) { if (p.dead) continue; const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (p.role === 'cop' && d < 70) { witness = true; copNear = true; break; } if (p.role === 'civ' && d < 28) { witness = true; } }
    for (const v of G.entities.vehicles) if (v.isPolice && v.driver && !v.wreck && Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) < 70) { witness = true; copNear = true; }
    if (type === 'kill_cop' || type === 'hit_cop' || type === 'shoot_cop') witness = true;
    if (!witness && this.level === 0) { if (G.cheat && G.cheat.noWanted) return; return; }
    if (G.cheat && G.cheat.noWanted) return;
    if (G.profile.flags && G.profile.flags.missionNoWanted) return;
    G.stats.crimes++;
    this.heat += val * (copNear ? 1.4 : 1); G.profile.wantedTotal = (G.profile.wantedTotal || 0);
    let l = 0; for (let i = 0; i < THRESH.length; i++) if (this.heat >= THRESH[i]) l = i + 1;
    if (l > this.level) { this.level = l; emit('wantedUp', l); }
    this.seen = true; this.unseenT = 0; this.searching = false; this.lastKnown.copy(pl.pos);
    emit('wantedChanged', this.level);
  },
  spawnCop(x, z, role = 'cop') {
    const look = randomLook(role === 'army' ? 'army' : role === 'swat' ? 'swat' : 'cop');
    const p = Peds.spawnAt(x, z, 'cop', look); p.persistent = false; p.cash = 0; p.hp = role === 'cop' ? 100 : 160; p.maxHp = p.hp; p.armed = true;
    const lvl = this.level; const gun = role === 'cop' ? (lvl >= 3 ? 'smg' : 'pistol') : 'rifle'; p.setGun(gun); p.copRole = role; p.accuracy = role === 'cop' ? 0.35 + lvl * 0.04 : 0.6; p.spreadMul = role === 'cop' ? 2.2 : 1.4; p.brain = copBrain; p.walkSpeed = 4.6;
    p.name = 'Polizist'; return p;
  },
  clearAll() {
    for (const v of [...G.entities.vehicles]) if ((v.isPolice || v.spec.special === 'army' || v.copUnit) && !v.isMission) { if (v.ai && v.ai.dispose) v.ai.dispose(); if (v.driver && v.driver.cop) { v.driver = null; } v.ai = null; v.copUnit = false; v.sirenOn = false; v.input.throttle = 0; v.input.brake = 1; v.input.handbrake = true; v.despawnT = 8; v.keep = false; v.isParked = true; v.parked = true; }
    for (const p of [...G.entities.peds]) if (p.role === 'cop' && !p.noRemove) { p.brain = (pp, dt) => { pp.moveSpeed = 0; pp.aim = false; pp.person.aim = 0; if (pp.stateT > 6) { /* bleibt stehen */ } }; p.aim = false; p.despawn = 10; }
    for (const rb of this.roadblocks) { }
    this.roadblocks.length = 0;
  },
  update(dt) {
    const pl = G.player; if (!pl) return;
    this.flash += dt;
    // Sichtprüfung
    let seen = false, nearest = 1e9, cops = 0;
    for (const v of G.entities.vehicles) { if (!(v.copUnit || v.isPolice) || v.wreck || !v.driver) continue; cops++; const d = Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z); nearest = Math.min(nearest, d); if (d < 90 && (G.night < 0.5 || d < 60)) { if (TR.rayStatic(v.pos.x, 1.2, v.pos.z, (pl.pos.x - v.pos.x) / d, 0, (pl.pos.z - v.pos.z) / d, d) >= d) seen = true; } if (v.kind === 'heli' && d < 140) seen = true; }
    for (const p of G.entities.peds) { if (p.role !== 'cop' || p.dead) continue; cops++; const d = Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z); nearest = Math.min(nearest, d); if (d < 75 && TR.rayStatic(p.pos.x, 1.5, p.pos.z, (pl.pos.x - p.pos.x) / d, 0, (pl.pos.z - p.pos.z) / d, d) >= d) seen = true; }
    this.copCount = cops;
    if (this.level > 0) {
      if (seen) { this.seen = true; this.unseenT = 0; this.searching = false; this.lastKnown.copy(pl.pos); }
      else { this.seen = false; this.unseenT += dt; if (!this.searching && this.unseenT > 4) { this.searching = true; } }
      // Fahndung verlieren
      const need = 14 + this.level * 4;
      if (this.searching && this.unseenT > need && nearest > 60) { this.heat -= dt * (4 + this.level * 2); let l = 0; for (let i = 0; i < THRESH.length; i++) if (this.heat >= THRESH[i]) l = i + 1; if (l < this.level) { this.level = l; if (l === 0) { this.heat = 0; this.searching = false; this.clearAll(); emit('wantedLost'); } else emit('wantedChanged', l); } }
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 2.2; this.spawnUnits(); }
      if (this.level >= 4) { this.blockT -= dt; if (this.blockT <= 0) { this.blockT = 22; this.spawnRoadblock(); } }
      // Verhaftung
      this.checkArrest(dt);
    } else {
      this.heat = Math.max(0, this.heat - dt * 0.7); this.seen = false; this.searching = false;
    }
    // KI aufräumen
    for (const v of G.entities.vehicles) {
      if (v.despawnT !== undefined) { v.despawnT -= dt; if (v.despawnT < 0 && Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) > 40) { if (v.ai && v.ai.dispose) v.ai.dispose(); Veh.remove(v); continue; } }
      if (v.ai instanceof HeliAI && v.wreck) v.ai.dispose();
      // Polizei-Autos, die zu weit weg sind, neu positionieren
      if (v.copUnit && v.driver && v.driver.cop && this.level > 0) { const d = Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z); if (d > 420) { this.respawnUnit(v); } }
    }
    for (const p of G.entities.peds) if (p.despawn !== undefined) { p.despawn -= dt; if (p.despawn < 0 && Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) > 25) Peds.remove(p); }
    // Roadblocks entfernen
    for (let i = this.roadblocks.length - 1; i >= 0; i--) { const rb = this.roadblocks[i]; rb.t -= dt; if (rb.t < 0) { this.roadblocks.splice(i, 1); } }
  },
  checkArrest(dt) {
    const pl = G.player; if (!pl.alive || pl.vehicle && Math.abs(pl.vehicle.speed) > 3 || this.busted) { this.arrestT = 0; return; }
    let near = false;
    for (const p of G.entities.peds) { if (p.role !== 'cop' || p.dead) continue; if (Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) < (pl.vehicle ? 3.8 : 2.0) && p.copRole === 'cop') { near = true; break; } }
    if (near && this.level <= 3 && !pl.aiming && pl.speed < 2.5) { this.arrestT += dt; if (this.arrestT > 1.6) this.arrest(); } else this.arrestT = Math.max(0, this.arrestT - dt);
  },
  arrest() {
    this.busted = true; G.stats.arrests++; emit('busted');
  },
  spawnUnits() {
    const pl = G.player, lvl = this.level;
    let cars = 0, heli = 0, swat = 0, army = 0;
    for (const v of G.entities.vehicles) { if (v.wreck || !v.copUnit) continue; if (v.kind === 'heli') heli++; else if (v.spec.special === 'swat') swat++; else if (v.spec.special === 'army') army++; else cars++; }
    const swatDismounted = G.entities.peds.filter((p) => p.role === 'cop' && !p.dead && p.copRole === 'swat').length;
    const tot = G.entities.peds.filter((p) => p.role === 'cop' && !p.dead).length;
    if (cars < UNITS.cars[lvl] && tot < 14) this.spawnCar('police');
    if (heli < UNITS.heli[lvl]) this.spawnHeli();
    if (swat < UNITS.swat[lvl] && swatDismounted < 6) this.spawnCar('swat');
    if (army < UNITS.army[lvl]) this.spawnCar('army');
  },
  respawnUnit(v) { const pos = this.findSpawn(); if (!pos) return; v.pos.set(pos.x, TR.groundHeight(pos.x, pos.z), pos.z); v.yaw = pos.yaw; v.vel.set(0, 0, 0); },
  findSpawn() {
    const pl = G.player, px = pl.pos.x, pz = pl.pos.z;
    for (let t = 0; t < 12; t++) {
      const hd = pl.vehicle ? Math.atan2(pl.vehicle.vel.x, pl.vehicle.vel.z) : G.camera ? pl.camYaw : 0;
      const a = hd + (Math.random() < 0.6 ? rr(-1.2, 1.2) : Math.PI + rr(-1.2, 1.2)), d = rr(140, 260);
      let x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
      if (x > -1150 && x < 1150 && z > -1150 && z < 1150) {
        const k = clamp(Math.round(x / P), -K, K), l = clamp(Math.round(z / P), -K, K);
        const dirs = []; for (let dd = 0; dd < 4; dd++) if (TR.edgeExists(k, l, dd)) dirs.push(dd); if (!dirs.length) continue;
        const dd = pick(dirs), dx = TR.DIRS[dd][0], dz = TR.DIRS[dd][1];
        x = k * P + dx * 30; z = l * P + dz * 30; // auf der Straße
        x += -dz * 3.5; z += dx * 3.5;
        if (Math.hypot(x - px, z - pz) < 100) continue;
        return { x, z, yaw: Math.atan2(dx, dz) };
      } else { if (TR.terrainHeight(x, z) < 0.5) continue; return { x, z, yaw: Math.atan2(px - x, pz - z) }; }
    }
    return null;
  },
  spawnCar(id) {
    const pos = this.findSpawn(); if (!pos) return;
    const spec = id === 'police' ? (Math.random() < 0.5 ? BY_ID.police : BY_ID.police2) : BY_ID[id];
    const v = Veh.spawn(spec, pos.x, pos.z, pos.yaw); v.copUnit = true; v.driver = { cop: true, npc: false }; v.ai = new ChaseAI(v, id === 'police' ? 'cop' : id); v.sirenOn = true; v.isTraffic = false; v.keep = true;
    v.vel.set(Math.sin(pos.yaw) * 10, 0, Math.cos(pos.yaw) * 10);
  },
  spawnHeli() {
    const pl = G.player; const a = rr(0, 6.28);
    const v = Veh.spawn('heli_police', pl.pos.x + Math.cos(a) * 200, pl.pos.z + Math.sin(a) * 200, 0); v.copUnit = true; v.driver = { cop: true }; v.ai = new HeliAI(v); v.pos.y = TR.groundHeight(v.pos.x, v.pos.z) + 60; v.rotorSpin = 1; v.keep = true; v.isPolice = true;
  },
  spawnRoadblock() {
    const pl = G.player; if (!pl.vehicle) return;
    const v = pl.vehicle, hd = Math.atan2(v.vel.x, v.vel.z), sp = Math.hypot(v.vel.x, v.vel.z); if (sp < 8) return;
    const px = pl.pos.x + Math.sin(hd) * 220, pz = pl.pos.z + Math.cos(hd) * 220;
    if (!(px > -1100 && px < 1100 && pz > -1100 && pz < 1100)) return;
    const k = Math.round(px / P), l = Math.round(pz / P);
    // Straße in Fahrtrichtung: bestimmen ob x- oder z-orientiert
    const alongX = Math.abs(Math.sin(hd)) > Math.abs(Math.cos(hd));
    const cx = alongX ? px : k * P, cz = alongX ? l * P : pz;
    const sx = alongX ? 0 : 1, sz = alongX ? 1 : 0;
    for (let i = -1; i <= 1; i += 2) {
      const car = Veh.spawn('police', cx + sx * i * 4, cz + sz * i * 4, alongX ? 0 : Math.PI / 2); car.parked = true; car.sirenOn = true; car.copUnit = true; car.keep = true; car.despawnT = 60; car.input.handbrake = true; car.mass *= 2;
      for (let j = 0; j < 1; j++) { const c = this.spawnCop(cx + sx * i * 4 + (alongX ? 2 : 0), cz + sz * i * 4 + (alongX ? 0 : 2), 'cop'); c.despawn = 60; }
    }
    this.roadblocks.push({ x: cx, z: cz, t: 60 });
    emit('toast', '🚧 Straßensperre voraus!');
  },
  respawnPlayer(kind) { },
};
// Polizisten zu Fuß
function copBrain(p, dt) {
  const pl = G.player, P_ = Police; p.stateT += dt;
  if (!pl || !pl.alive || P_.level === 0) { p.moveSpeed = 0; p.aim = false; return; }
  const tp = P_.targetPos(); const dx = tp.x - p.pos.x, dz = tp.z - p.pos.z, d = Math.hypot(dx, dz);
  const inCar = pl.vehicle;
  const los = d < 80 && TR.rayStatic(p.pos.x, 1.5, p.pos.z, dx / d, 0, dz / d, d) >= d - 0.5;
  p.faceLock = false;
  if (p.hp < 25 && p.copRole === 'cop' && false) { }
  const wantRange = P_.level >= 2 && (pl.weapon && !pl.weapon.melee || pl.vehicle) ? 18 : 2;
  if (los && d < wantRange + 14 && P_.level >= 2) {
    // schießen
    p.aim = true; p.faceLock = true; p.faceYaw = Math.atan2(dx, dz); p.yaw = p.faceYaw;
    p.moveSpeed = d > wantRange ? p.walkSpeed * 0.6 : 0; p.moveX = dx / d; p.moveZ = dz / d;
    if (d < wantRange - 6) { p.moveSpeed = 1.2; p.moveX = -dx / d; p.moveZ = -dz / d; }
    p.fireT -= dt;
    const w = p.armed === 'smg' || p.copRole !== 'cop' ? 12 : 3;
    if (p.fireT <= 0) { p.fireT = 1 / (p.copRole === 'cop' ? 2.2 : 3.2) + rr(0, 0.6) * (1.2 - p.accuracy); if (p.reactT === undefined) p.reactT = 0; const org = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z); const tgt = new THREE.Vector3(tp.x, (pl.vehicle ? pl.pos.y + 0.8 : pl.pos.y + 1.1), tp.z); const dir = tgt.sub(org).normalize(); Combat.fire(p, org, dir, p.armed === 'smg' ? 'smg' : p.armed === 'rifle' ? 'rifle' : 'pistol', null, org.clone().addScaledVector(dir, 0.6)); p.person.shoot = 1; }
  } else {
    p.aim = false; p.moveX = dx / (d || 1); p.moveZ = dz / (d || 1); p.moveSpeed = d > 2 ? Math.min(p.walkSpeed + 1.2 + P_.level * 0.3, 6.2) : 0;
    if (TR.rayStatic(p.pos.x, 1, p.pos.z, p.moveX, 0, p.moveZ, 2.5) < 2.5) { const a = Math.atan2(p.moveX, p.moveZ) + 1.1; p.moveX = Math.sin(a); p.moveZ = Math.cos(a); }
    if (d < 1.6 && P_.level <= 2) { p.moveSpeed = 0; }
  }
}
G.police = Police;
// Ereignisse
on('crime', (type, pos, target) => Police.crime(type, pos, target));
on('pedDied', (ped, src, head) => {
  if (src !== G.player && !(src && src.driver === G.player)) return;
  if (ped.role === 'cop') Police.crime('kill_cop', ped.pos, ped);
  else if (ped.role === 'civ') Police.crime('kill_ped', ped.pos, ped);
});
on('pedRunOver', (ped, veh, sp) => { if (veh.driver === G.player) { if (ped.role === 'cop') Police.crime('hit_cop', ped.pos, ped); else Police.crime('run_over', ped.pos, ped); } });
on('gunshot', (x, z, shooter) => { if (shooter === G.player) { Police.crime('gunshot', { x, z }, null); } });
on('pedHurt', (ped, src) => { if (ped.role === 'cop' && src === G.player) Police.crime('shoot_cop', ped.pos, ped); });
on('vehicleCollision', (a, b, sp) => { const p = G.player; if (p && p.vehicle && (a === p.vehicle || b === p.vehicle) && sp > 5) { const o = a === p.vehicle ? b : a; if (o.isPolice || o.copUnit) Police.crime('hit_cop', o.pos, o); else if (o.driver && o.driver.npc) Police.crime('crash', o.pos, o); } });
export { ChaseAI, HeliAI, THRESH };
