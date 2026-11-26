// Fahrzeugphysik (Auto, Motorrad, Boot, Flugzeug, Hubschrauber) und Verwaltung
import * as THREE from 'three';
import { G, emit } from './game.js';
import { BY_ID, CATALOG } from './catalog.js';
import { buildModel, paintVehicleColors } from './models.js';
import * as TR from './terrain.js';
import { clamp, lerp, damp, rr, wrapAngle, TAU } from './util.js';
import { FX } from './effects.js';
import { waveHeight } from './world.js';
import { M } from './materials.js';

let UID = 1;
const _res = { nx: 0, nz: 0, pen: 0 };
const GRAV = 22;

export class Vehicle {
  constructor(spec, x, z, yaw = 0, opts = {}) {
    this.id = UID++; this.spec = spec; this.kind = spec.kind;
    this.c1 = opts.c1 != null ? opts.c1 : spec.colors[0]; this.c2 = opts.c2 !== undefined ? opts.c2 : spec.colors[1];
    this.model = buildModel(spec, this.c1, this.c2); this.group = this.model.root;
    this.pos = new THREE.Vector3(x, 0, z); this.vel = new THREE.Vector3(); this.yaw = yaw; this.pitch = 0; this.roll = 0; this.angVel = 0; this.vy = 0; this.steerAngle = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, pitch: 0, roll: 0, yaw: 0, lift: 0, boost: false };
    this.hp = 1000; this.driver = null; this.ai = null; this.owner = null; this.owned = false; this.parked = false;
    this.speed = 0; this.slip = 0; this.drifting = false; this.grounded = true; this.lastGh = 0; this.vyGround = 0;
    this.throttleVis = 0; this.rpm = 0; this.gear = 1; this.lightsOn = false; this.hornT = 0; this.sirenOn = false; this.burning = 0; this.dead = false; this.wreck = false; this.wreckT = 0;
    this.engineOn = true; this.sinkT = 0; this.stuckT = 0; this.age = 0; this.deformTotal = 0; this.rotorSpin = 0; this.throttle = 0; this.fuel = 1; this.damageFlash = 0;
    this.isPolice = spec.special === 'police' || spec.special === 'swat'; this.isEmergency = this.isPolice || ['ambulance', 'fire', 'army'].includes(spec.special);
    this.halfL = spec.L / 2; this.halfW = spec.W / 2; this.r = Math.max(0.6, spec.W * 0.5);
    this.wb = this.model.wb || spec.L * 0.6;
    const n = Math.max(2, Math.ceil(spec.L / (spec.W * 1.05)));
    this.circles = []; for (let i = 0; i < n; i++) this.circles.push(n === 1 ? 0 : -spec.L / 2 + this.r + (spec.L - 2 * this.r) * i / (n - 1));
    this.mass = spec.mass; this.maxV = spec.top / 3.6;
    this.plate = 'VC' + (spec.seed % 900 + 100) + 'X';
    this.y0 = this.kind === 'boat' ? TR.WATER : TR.groundHeight(x, z);
    this.pos.y = this.y0; this.lastGh = this.y0;
    if (this.kind === 'plane') this.pos.y = this.y0 + 0.9;
    this.flightSpeed = 0; this.onGroundAir = true;
    this.updateVisual(0);
    G.scene.add(this.group);
    this.targetPos = null; this.isTraffic = false; this.isMission = false; this.exploded = false;
  }
  get driverPresent() { return !!this.driver; }
  setColors(c1, c2) { this.c1 = c1; this.c2 = c2; if (this.kind === 'car') { paintVehicleColors(this.model, c1, c2); this.model.bodyGeo.attributes.color.needsUpdate = true; } else if (this.model.bodyMat) this.model.bodyMat.color.setHex(c1); }
  repair() { this.hp = 1000; this.dead = false; this.burning = 0; this.deformTotal = 0; this.wreck = false; if (this.kind === 'car') { const orig = this._origPos; if (orig) { this.model.bodyGeo.attributes.position.array.set(orig); this.model.bodyGeo.attributes.position.needsUpdate = true; this.model.bodyGeo.computeVertexNormals(); } paintVehicleColors(this.model, this.c1, this.c2); this.model.bodyGeo.attributes.color.needsUpdate = true; } }
  // Schaden mit lokalem Aufprallpunkt (x quer, z längs)
  damage(amount, lx = 0, lz = 0, ly = 0.5, silent = false) {
    if (this.dead && this.wreck) return;
    this.hp -= amount; this.damageFlash = 0.3;
    if (amount > 25 && this.kind === 'car') this.deform(lx, ly, lz, clamp(amount / 160, 0.1, 1.2));
    if (this.hp <= 0 && !this.exploded) { this.hp = 0; if (!this.burning) this.burning = 0.001; }
    if (this.driver && this.driver.onVehicleDamage) this.driver.onVehicleDamage(this, amount);
  }
  deform(lx, ly, lz, amt) {
    const g = this.model.bodyGeo; if (!g) return; const pos = g.attributes.position, col = g.attributes.color;
    if (!this._origPos) this._origPos = pos.array.slice();
    this.deformTotal += amt;
    const rad = 0.9 + amt * 0.8;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const d = Math.hypot(x - lx, (y - ly) * 0.6, z - lz);
      if (d < rad) {
        const f = (1 - d / rad) * (1 - d / rad) * amt;
        const dx = -x, dz = -z, dl = Math.hypot(dx, dz) || 1;
        pos.setXYZ(i, x + dx / dl * f * 0.28 + rr(-0.03, 0.03) * f, y - f * 0.1 + rr(-0.04, 0.04) * f, z + dz / dl * f * 0.28 + rr(-0.03, 0.03) * f);
        if (col) { const k = 1 - f * 0.45; col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k); }
      }
    }
    pos.needsUpdate = true; if (col) col.needsUpdate = true; g.computeVertexNormals();
  }
  explode() {
    if (this.exploded) return; this.exploded = true; this.dead = true; this.wreck = true; this.wreckT = 0;
    FX.explosion(this.pos.x, this.pos.y + 1, this.pos.z, this.kind === 'plane' || this.kind === 'heli' || this.spec.cls === 'truck' ? 1.6 : 1);
    emit('explosion', this.pos.x, this.pos.y, this.pos.z, 11, 160, this);
    this.vy = 7; this.vel.multiplyScalar(0.3); this.vel.x += rr(-3, 3); this.vel.z += rr(-3, 3); this.angVel = rr(-2, 2);
    if (this.model.bodyMat) { this.model.bodyMat.color.setHex(0x202020); }
    this.input.throttle = this.input.brake = 0; this.input.handbrake = false; this.ai = null;
    this.model.headMats.forEach((m) => m.color.setHex(0x000000)); this.model.tailMats.forEach((m) => m.color.setHex(0x000000));
    emit('vehicleDestroyed', this);
    if (this.driver && this.driver.onVehicleExploded) this.driver.onVehicleExploded(this);
  }
  localPoint(wx, wz) { const dx = wx - this.pos.x, dz = wz - this.pos.z, s = Math.sin(this.yaw), c = Math.cos(this.yaw); return [dx * c - dz * s, dx * s + dz * c]; }

  // ---------------- Update ----------------
  update(dt) {
    this.age += dt;
    if (this.dead && !this.exploded) this.dead = false;
    const wreckMode = this.wreck;
    if (wreckMode) { this.wreckT += dt; this.input.throttle = this.input.brake = 0; if (Math.random() < dt * 8) FX.flame(this.pos.x + rr(-1, 1), this.pos.y + 0.6, this.pos.z + rr(-1, 1), 0.8); if (Math.random() < dt * 6) FX.puffSmoke(this.pos.x, this.pos.y + 1.2, this.pos.z, 1.5, 0.08, 3); }
    switch (this.kind) {
      case 'car': case 'bike': this.updateCar(dt); break;
      case 'boat': this.updateBoat(dt); break;
      case 'plane': this.updatePlane(dt); break;
      case 'heli': this.updateHeli(dt); break;
    }
    // Schäden: Rauch/Feuer
    if (!wreckMode) {
      const hpf = this.hp / 1000;
      if (hpf < 0.4) { if (Math.random() < dt * (14 * (0.4 - hpf) + 3)) FX.puffSmoke(this.pos.x + Math.sin(this.yaw) * this.halfL * 0.8, this.pos.y + 0.9, this.pos.z + Math.cos(this.yaw) * this.halfL * 0.8, 1, hpf < 0.2 ? 0.05 : 0.35, 2.2); }
      if (hpf < 0.17 || this.burning > 0) {
        if (Math.random() < dt * 14) FX.flame(this.pos.x + Math.sin(this.yaw) * this.halfL * 0.7, this.pos.y + 0.7, this.pos.z + Math.cos(this.yaw) * this.halfL * 0.7, 0.7);
        this.burning += dt; if (this.hp > 0) this.hp -= dt * 22;
        if (this.hp <= 0 && !this.exploded) this.explode();
      }
    }
    this.updateVisual(dt);
    this.hornT = Math.max(0, this.hornT - dt); this.damageFlash = Math.max(0, this.damageFlash - dt);
  }

  groundSample() { return TR.groundHeight(this.pos.x, this.pos.z); }

  updateCar(dt) {
    const s = this.spec, I = this.input, wet = G.weather ? G.weather.wet : 0;
    const bike = this.kind === 'bike';
    if (this.wreck) { I.throttle = 0; I.brake = 0; I.steer = 0; }
    const hpf = clamp(this.hp / 1000, 0.15, 1);
    // Heading
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    let vF = this.vel.x * sn + this.vel.z * cs;
    const gh = this.groundSample();
    // Untergrund
    const x = this.pos.x, z = this.pos.z;
    const inCity = x > -1175 && z > -1175 && x < 1262 && z < 1262;
    const terr = TR.terrainHeight(x, z);
    let surf = inCity ? 1 : (Math.abs(z - 192) < 12 && x > -1700 && x < -1100) || (x > TR.AIRPORT.x0 && x < TR.AIRPORT.x1 && z > TR.AIRPORT.z0 && z < TR.AIRPORT.z1) ? 1 : 0.62;
    if (terr < 1.2 && terr > TR.WATER - 0.2 && (x > 900 || z > 900)) surf = Math.min(surf, 0.55);
    if (G.weather) surf *= 1 - 0.28 * wet;
    this.surf = surf;
    const deep = terr < TR.WATER - 0.6;
    if (deep) { this.sinkT += dt; this.vel.multiplyScalar(Math.exp(-1.6 * dt)); if (Math.random() < dt * 20) FX.splash(x, TR.WATER, z, this.vel.x, this.vel.z, 0.7); if (this.sinkT > 3.5 && !this.exploded) { this.hp = 0; this.wreck = true; this.dead = true; this.exploded = true; this.model.bodyMat.color.setHex(0x303030); emit('vehicleDestroyed', this); if (this.driver && this.driver.onVehicleExploded) this.driver.onVehicleExploded(this, true); } }
    else this.sinkT = 0;
    const air = this.pos.y > gh + 0.35;
    this.grounded = !air;
    // Lenkung / Gieren
    const sp = Math.abs(vF);
    if (this.grounded) {
      const lim = s.steer / (1 + sp / (bike ? 16 : 13));
      this.steerAngle = damp(this.steerAngle, I.steer * lim, bike ? 8 : 10, dt);
      let wt = vF * Math.tan(this.steerAngle) / this.wb;
      if (I.handbrake && sp > 6) wt *= 1.45;
      // Übersteuern bei viel Gas in Sportwagen
      if (I.throttle > 0.85 && s.acc > 10 && sp > 8 && sp < 30) wt *= 1.12;
      const wmax = Math.min(2.4, 0.75 + 30 / (sp + 6)) * (I.handbrake ? 1.15 : 1) * (bike ? 1.1 : 1); wt = clamp(wt, -wmax, wmax);
      this.angVel = damp(this.angVel, wt, 7 + surf * 3, dt);
    }
    this.yaw = wrapAngle(this.yaw + this.angVel * dt);
    const sn2 = Math.sin(this.yaw), cs2 = Math.cos(this.yaw);
    vF = this.vel.x * sn2 + this.vel.z * cs2;
    let vL = this.vel.x * cs2 - this.vel.z * sn2;
    if (this.grounded) {
      const maxV = this.maxV * (0.45 + 0.55 * hpf) * (I.boost ? 1.12 : 1) * (surf < 0.8 ? 0.75 + 0.25 * surf : 1);
      let acc = 0;
      if (this.engineOn && !this.wreck) {
        if (I.throttle > 0) { const fr = clamp(vF / maxV, 0, 1.05); acc += I.throttle * s.acc * (1 - fr * fr * fr) * surf * (vF < -1 ? 2.2 : 1) * (I.boost ? 1.3 : 1); }
        if (I.brake > 0) {
          if (vF > 1) acc -= I.brake * (7 + 4 * surf) * (s.grip / 8); else { const fr = clamp(-vF / (maxV * 0.28), 0, 1); acc -= I.brake * s.acc * 0.62 * (1 - fr * fr); }
        }
      }
      if (I.handbrake) { vF *= Math.exp(-0.9 * dt); }
      acc -= vF * 0.035 + Math.sign(vF) * 0.35 * (this.engineOn ? 1 : 0.5);
      if (I.throttle === 0 && I.brake === 0) acc -= vF * 0.16;
      vF += acc * dt;
      let gr = s.grip * surf * (I.handbrake ? 0.16 : 1) * (bike ? 1 : 1);
      const slip = Math.abs(vL);
      if (slip > 3.2) gr *= 0.72; if (slip > 7) gr *= 0.62;
      if (I.throttle > 0.9 && s.acc > 11 && sp < 14) gr *= 0.8;
      vL *= Math.exp(-gr * dt);
      this.slip = Math.abs(vL);
      // Neue Velocity
      this.vel.x = sn2 * vF + cs2 * vL; this.vel.z = cs2 * vF - sn2 * vL;
      this.speed = vF;
      this.drifting = this.slip > 2.4 && Math.abs(vF) > 6;
      // Reifenspuren/Rauch
      const hard = this.drifting || (I.brake > 0.8 && vF > 12) || (I.handbrake && sp > 8) || (I.throttle > 0.95 && sp < 8 && s.acc > 10 && surf > 0.9);
      const inten = hard ? 1 : 0;
      const sx = cs2, sz = -sn2;
      const rz = this.model.rzz != null ? this.model.rzz : -this.halfL * 0.6, wx = this.model.wx || this.halfW - 0.2;
      if (bike) FX.skid(this.id * 4, this.pos.x + sn2 * rz, this.pos.z + cs2 * rz, this.pos.y, this.yaw, inten, 0.1);
      else { FX.skid(this.id * 4, this.pos.x + sn2 * rz + sx * wx, this.pos.z + cs2 * rz + sz * wx, this.pos.y, this.yaw, inten); FX.skid(this.id * 4 + 1, this.pos.x + sn2 * rz - sx * wx, this.pos.z + cs2 * rz - sz * wx, this.pos.y, this.yaw, inten); }
      if (inten && surf > 0.9 && Math.random() < dt * 30) FX.puffSmoke(this.pos.x + sn2 * rz, this.pos.y + 0.2, this.pos.z + cs2 * rz, 0.6, 0.75, 0.6);
      if (surf < 0.8 && sp > 6 && Math.random() < dt * 18) FX.dust(this.pos.x + sn2 * rz, this.pos.y, this.pos.z + cs2 * rz, -this.vel.x, -this.vel.z, terr < 1.5 ? [0.85, 0.78, 0.55] : [0.5, 0.45, 0.35]);
      if (G.weather && wet > 0.4 && sp > 12 && Math.random() < dt * 14 * wet) FX.splash(this.pos.x + sn2 * rz, this.pos.y + 0.1, this.pos.z + cs2 * rz, -this.vel.x, -this.vel.z, 0.5);
      G.stats.driftBest = Math.max(G.stats.driftBest, 0);
    } else {
      FX.skid(this.id * 4, 0, 0, 0, 0, 0); FX.skid(this.id * 4 + 1, 0, 0, 0, 0, 0);
      this.speed = vF; this.drifting = false;
      this.angVel *= Math.exp(-0.4 * dt);
    }
    // Position
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Vertikal
    const gh2 = this.groundSample();
    if (this.grounded) {
      this.vyGround = (gh2 - this.lastGh) / Math.max(dt, 1e-3);
      if (gh2 < this.pos.y - 0.35) { this.vy = Math.max(this.vyGround, 0); this.grounded = false; }
      else this.pos.y = gh2;
    }
    if (!this.grounded) {
      this.vy -= GRAV * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= gh2) {
        const impact = -this.vy; this.pos.y = gh2; this.vy = 0; this.grounded = true;
        if (impact > 5) { this.damage(Math.pow(impact - 4, 1.8) * 4, 0, 0, 0.3); FX.dust(this.pos.x, this.pos.y, this.pos.z, 0, 0); G.camShake = Math.max(G.camShake || 0, clamp(impact / 20, 0, 0.6)); if (this.driver === G.player) emit('landed', this, impact); }
      }
    }
    this.lastGh = gh2;
    // Zustandsvisualisierung: Neigung
    const spl = this.spec.L * 0.5, spw = this.spec.W * 0.5;
    const hF = TR.groundHeight(this.pos.x + sn2 * spl, this.pos.z + cs2 * spl), hB = TR.groundHeight(this.pos.x - sn2 * spl, this.pos.z - cs2 * spl);
    const hR = TR.groundHeight(this.pos.x + cs2 * spw, this.pos.z - sn2 * spw), hLf = TR.groundHeight(this.pos.x - cs2 * spw, this.pos.z + sn2 * spw);
    let pt = this.grounded ? Math.atan2(hF - hB, spl * 2) : clamp(this.vy * 0.04, -0.5, 0.5);
    let rt = this.grounded ? Math.atan2(hR - hLf, spw * 2) : 0;
    const latAcc = vL * 0.0 + this.angVel * vF * 0.0;
    const lean = bike ? -this.angVel * clamp(Math.abs(vF), 0, 40) * 0.025 - this.steerAngle * 0.2 : 0;
    // Federung: Nick bei Beschleunigung, Wank in Kurven
    const accelPitch = -((this.throttleVis - I.throttle) + 0) * 0.0;
    this._pitchT = pt - (I.throttle - I.brake) * 0.018 * (bike ? 2 : 1) - (this.speed > 0 ? I.brake * 0.025 : 0);
    this._rollT = rt + (bike ? lean : this.angVel * vF * 0.0055) + (this.slip > 3 ? (vL > 0 ? 0.02 : -0.02) : 0);
    this.pitch = damp(this.pitch, this._pitchT, 8, dt); this.roll = damp(this.roll, this._rollT, 8, dt);
    // Statische Kollision
    this.collideStatic(dt);
    // Weltgrenzen
    const lim = TR.HALF - 100; this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
    // Drehzahl/Gang
    const sr = clamp(Math.abs(vF) / Math.max(this.maxV, 1), 0, 1.05), ng = 6;
    const gi = Math.min(ng - 1, Math.floor(sr * ng * 0.92)); this.gear = vF < -0.5 ? -1 : (Math.abs(vF) < 0.5 && I.throttle === 0) ? 0 : gi + 1;
    const gearFrac = (sr * ng * 0.92 - gi);
    this.rpm = clamp(0.18 + (this.gear <= 0 ? I.throttle * 0.6 : 0.2 + gearFrac * 0.6 + I.throttle * 0.18), 0.15, 1);
    this.throttleVis = damp(this.throttleVis, I.throttle, 10, dt);
  }

  collideStatic(dt) {
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    for (const off of this.circles) {
      const p = { x: this.pos.x + sn * off, z: this.pos.z + cs * off };
      const ox = p.x, oz = p.z;
      if (TR.resolveCircle(p, this.r * 0.95, this.pos.y, _res)) {
        const dx = p.x - ox, dz = p.z - oz;
        this.pos.x += dx; this.pos.z += dz;
        const vn = -(this.vel.x * _res.nx + this.vel.z * _res.nz);
        if (vn > 0.5) {
          const e = 0.18; this.vel.x += (1 + e) * vn * _res.nx; this.vel.z += (1 + e) * vn * _res.nz;
          // Gieren durch Offcenter
          this.angVel += (off / (this.halfL + 0.01)) * vn * 0.06 * (_res.nx * cs - _res.nz * sn);
          this.vel.x *= 0.985; this.vel.z *= 0.985;
          if (vn > 3.5) {
            const [lx, lz] = this.localPoint(p.x - _res.nx * this.r, p.z - _res.nz * this.r);
            this.damage(Math.pow(vn - 2.5, 1.6) * 7, lx, lz, 0.5);
            FX.sparks(p.x - _res.nx * this.r, this.pos.y + 0.6, p.z - _res.nz * this.r, 6, _res.nx, _res.nz);
            if (vn > 6) { G.camShake = Math.max(G.camShake || 0, clamp(vn / 22, 0, 0.8)); emit('crash', this, vn); }
          }
        }
      }
    }
  }

  updateBoat(dt) {
    const s = this.spec, I = this.input, wave = waveHeight(this.pos.x, this.pos.z, G.clock);
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    let vF = this.vel.x * sn + this.vel.z * cs, vL = this.vel.x * cs - this.vel.z * sn;
    const maxV = this.maxV * (0.45 + 0.55 * clamp(this.hp / 1000, 0.15, 1));
    const eng = this.driver && !this.wreck;
    if (eng) { const fr = clamp(vF / maxV, 0, 1); vF += (I.throttle * s.acc * (1 - fr * fr) - I.brake * s.acc * 0.5 * (vF > 0 ? 1 : 0.6) * (vF > -maxV * 0.2 ? 1 : 0)) * dt; }
    vF *= Math.exp(-0.18 * dt); vL *= Math.exp(-s.grip * dt);
    const rot = I.steer * s.steer * clamp(Math.abs(vF) / 4, 0.12, 1) * (vF >= -0.2 ? 1 : -1) * (this.kind === 'boat' && s.cls === 'yacht' ? 0.6 : 1);
    this.angVel = damp(this.angVel, eng ? rot : 0, 3, dt);
    this.yaw = wrapAngle(this.yaw + this.angVel * dt);
    const sn2 = Math.sin(this.yaw), cs2 = Math.cos(this.yaw);
    this.vel.x = sn2 * vF + cs2 * vL; this.vel.z = cs2 * vF - sn2 * vL;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Strand: Landberührung
    const ahead = TR.terrainHeight(this.pos.x + sn2 * this.halfL * 0.7, this.pos.z + cs2 * this.halfL * 0.7), here = TR.terrainHeight(this.pos.x, this.pos.z);
    if (ahead > TR.WATER + 0.1 || here > TR.WATER - 0.15) {
      this.pos.x = ox; this.pos.z = oz; const vn = Math.abs(vF); this.vel.multiplyScalar(0.3); if (vn > 6) this.damage(vn * 6, 0, this.halfL, 0.4); vF *= 0.3; this.stuckT += dt;
      if (here > TR.WATER + 0.3) { const gx = TR.terrainHeight(this.pos.x + 2, this.pos.z) - TR.terrainHeight(this.pos.x - 2, this.pos.z), gz = TR.terrainHeight(this.pos.x, this.pos.z + 2) - TR.terrainHeight(this.pos.x, this.pos.z - 2); this.pos.x -= gx * dt * 4; this.pos.z -= gz * dt * 4; }
    }
    this.speed = vF; this.slip = Math.abs(vL); this.grounded = true;
    // Gischt
    if (Math.abs(vF) > 4 && Math.random() < dt * 40) { FX.splash(this.pos.x + sn2 * this.halfL * 0.6, TR.WATER + 0.1, this.pos.z + cs2 * this.halfL * 0.6, -this.vel.x * 0.5, -this.vel.z * 0.5, 1); FX.splash(this.pos.x - sn2 * this.halfL * 0.8, TR.WATER + 0.1, this.pos.z - cs2 * this.halfL * 0.8, -this.vel.x * 0.5, -this.vel.z * 0.5, 1.2); }
    // Statische Hindernisse (Stege, Gebäude)
    this.collideStatic(dt);
    const ty = TR.WATER + wave * 0.9 + 0.1;
    this.pos.y = damp(this.pos.y, ty, 6, dt);
    const trim = clamp(Math.abs(vF) / maxV, 0, 1) * 0.1;
    this.pitch = damp(this.pitch, -trim + Math.sin(G.clock * 1.3 + this.id) * 0.025 + (s.cls === 'sail' ? 0 : 0), 3, dt);
    this.roll = damp(this.roll, -this.angVel * clamp(Math.abs(vF) / 12, 0, 1) * 0.25 + Math.sin(G.clock * 1.1 + this.id * 2) * 0.03, 3, dt);
    if (this.hp <= 0 && !this.exploded) this.explode();
    this.rpm = clamp(0.2 + I.throttle * 0.7, 0, 1); this.gear = 1;
    const lim = TR.HALF - 100; this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim);
  }

  updatePlane(dt) {
    const s = this.spec, I = this.input, f = s.flags;
    const gh = TR.groundHeight(this.pos.x, this.pos.z);
    const clearance = 1.0;
    const onGround = this.pos.y <= gh + clearance + 0.15;
    const active = this.driver && !this.wreck;
    this.throttle = active ? clamp(this.throttle + (I.lift > 0 ? dt * 0.5 : I.lift < 0 ? -dt * 0.6 : 0), 0, 1) : Math.max(0, this.throttle - dt * 0.2);
    const maxV = this.maxV * (0.5 + 0.5 * clamp(this.hp / 1000, 0.2, 1)), stall = maxV * 0.27;
    let sp = this.flightSpeed;
    const target = this.throttle * maxV;
    sp += (target - sp) * Math.min(1, s.acc * 0.05 * dt * (target > sp ? 1 : 0.6)) - Math.sin(this.pitch) * 6 * dt;
    if (onGround) { sp -= ((I.brake > 0 || I.handbrake) ? 16 : 0.5) * dt; }
    sp = clamp(sp, 0, maxV * 1.25);
    this.flightSpeed = sp;
    const ctrl = clamp(sp / (stall * 1.3), 0, 1);
    const pr = f.stunt ? 1.8 : 1.1, rr_ = f.stunt ? 2.8 : 1.6;
    this.pitchRate = damp(this.pitchRate || 0, active ? I.pitch * pr * ctrl : 0, 5, dt);
    this.rollRate = damp(this.rollRate || 0, active ? I.roll * rr_ * ctrl : 0, 5, dt);
    if (onGround) {
      this.roll = damp(this.roll, 0, 6, dt);
      if (active) this.yaw = wrapAngle(this.yaw - (I.yaw + I.roll * 0.7) * 0.65 * clamp(sp / 5, 0, 1) * dt * (sp > 3 ? 1 : 0.6));
      if (sp > stall * 0.95 && I.pitch > 0.2) this.pitch = damp(this.pitch, 0.3, 1.5, dt); else this.pitch = damp(this.pitch, 0, 4, dt);
      this.pitch = clamp(this.pitch, -0.05, 0.5);
    } else {
      this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.35, 1.35);
      this.roll = clamp(this.roll + this.rollRate * dt, -1.4, 1.4);
      if (Math.abs(I.roll) < 0.1) this.roll = damp(this.roll, 0, 0.4, dt);
      this.yaw = wrapAngle(this.yaw - Math.sin(this.roll) * 0.9 * ctrl * dt - I.yaw * 0.5 * ctrl * dt);
    }
    const cp = Math.cos(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const vx = sy * cp * sp, vz = cy * cp * sp;
    let vy = Math.sin(this.pitch) * sp;
    const lift = clamp(sp / stall, 0, 1);
    if (!onGround) vy -= (1 - lift) * 26 + 0.8;
    this.vel.set(vx, vy, vz);
    this.pos.x += vx * dt; this.pos.z += vz * dt; this.pos.y += vy * dt;
    this.speed = sp;
    const gh2 = TR.groundHeight(this.pos.x, this.pos.z);
    const water = TR.terrainHeight(this.pos.x, this.pos.z) < TR.WATER;
    const base = (water ? TR.WATER : gh2) + clearance;
    if (this.pos.y < base) {
      const sink = -vy, rollAbs = Math.abs(this.roll);
      if (water && sp > 5) { this.hp = 0; }
      else if (sink > 7 || rollAbs > 0.55 || (this.pitch < -0.35 && sink > 3)) this.damage(250 + sink * 60);
      else if (sink > 3.2) this.damage(sink * 25);
      this.pos.y = base; if (this.pitch < 0 && sink > 0) this.pitch *= 0.3;
      if (sink > 2) FX.dust(this.pos.x, base - 0.8, this.pos.z, 0, 0);
    }
    if (this.pos.y < 70 + gh2) { const p = { x: this.pos.x, z: this.pos.z }; if (TR.resolveCircle(p, 2.2, this.pos.y)) { this.damage(600); this.pos.x = p.x; this.pos.z = p.z; this.flightSpeed *= 0.4; FX.sparks(this.pos.x, this.pos.y, this.pos.z, 12); } }
    if (this.hp <= 0 && !this.exploded) this.explode();
    this.grounded = onGround;
    this.rpm = clamp(0.2 + this.throttle * 0.8, 0, 1); this.gear = 1;
    const lim = TR.HALF - 50; this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim); this.pos.y = Math.min(this.pos.y, 1800);
  }

  updateHeli(dt) {
    const s = this.spec, I = this.input, active = !!(this.driver || this.ai) && !this.wreck;
    const gh = TR.groundHeight(this.pos.x, this.pos.z), water = TR.terrainHeight(this.pos.x, this.pos.z) < TR.WATER;
    const floor = (water ? TR.WATER : gh) + 0.9;
    const onGround = this.pos.y <= floor + 0.1;
    this.rotorSpin = damp(this.rotorSpin, active ? 1 : 0, active ? 0.8 : 0.3, dt);
    const power = this.rotorSpin > 0.7 ? 1 : 0, maxV = this.maxV;
    this.pitch = damp(this.pitch, active ? I.pitch * 0.4 : 0, 3, dt);
    this.roll = damp(this.roll, active ? I.roll * 0.35 : 0, 3, dt);
    this.yaw = wrapAngle(this.yaw - I.yaw * 1.4 * power * dt * (onGround ? 0.5 : 1));
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const accF = -this.pitch * 40 * power, accR = this.roll * 34 * power;
    this.vel.x += (sn * accF - cs * accR) * dt; this.vel.z += (cs * accF + sn * accR) * dt;
    this.vel.x *= Math.exp(-0.55 * dt); this.vel.z *= Math.exp(-0.55 * dt);
    const vh = Math.hypot(this.vel.x, this.vel.z); if (vh > maxV) { this.vel.x *= maxV / vh; this.vel.z *= maxV / vh; }
    this.vy = damp(this.vy, power ? (active ? I.lift * 12 : 0) : -14, 1.8, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vy * dt;
    if (this.pos.y < floor) { const sink = -this.vy; if (sink > 7) this.damage(sink * 40); this.pos.y = floor; this.vy = Math.max(0, this.vy); this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt); }
    if (this.pos.y < 80 + gh) { const p = { x: this.pos.x, z: this.pos.z }; if (TR.resolveCircle(p, 2.2, this.pos.y)) { this.pos.x = p.x; this.pos.z = p.z; this.vel.multiplyScalar(0.3); this.damage(120); } }
    if (this.hp <= 0 && !this.exploded) this.explode();
    this.speed = Math.hypot(this.vel.x, this.vel.z); this.grounded = onGround;
    this.rpm = clamp(0.2 + this.rotorSpin * 0.7, 0, 1); this.gear = 1;
    const lim = TR.HALF - 50; this.pos.x = clamp(this.pos.x, -lim, lim); this.pos.z = clamp(this.pos.z, -lim, lim); this.pos.y = Math.min(this.pos.y, 1500);
  }

  updateVisual(dt) {
    const g = this.group, m = this.model;
    g.position.copy(this.pos);
    g.rotation.set(0, 0, 0); g.rotation.order = 'YXZ';
    g.rotation.y = this.yaw; g.rotation.x = -this.pitch; g.rotation.z = this.roll;
    // Räder drehen
    const sp = this.kind === 'plane' ? this.speed : this.speed, wr = this.spec.wr || 0.3;
    if (m.wheels.length) { this.wheelRot = (this.wheelRot || 0) + (sp / wr) * dt; for (const w of m.wheels) w.rotation.x = this.wheelRot; }
    if (m.steerWheels.length) for (const h of m.steerWheels) h.rotation.y = this.steerAngle * 1.0;
    if (m.steerNode) m.steerNode.rotation.y = this.steerAngle * 0.6;
    if (m.props) for (const p of m.props) p.rotation.z += dt * (6 + this.throttle * 80);
    if (m.rotor) { m.rotor.rotation.y += dt * this.rotorSpin * 38; if (m.tailRotor) m.tailRotor.rotation.x += dt * this.rotorSpin * 40; }
    // Lichter
    const night = G.night, headOn = (this.driver || this.ai) && (night > 0.3 || (G.weather && G.weather.rain > 0.3)) && !this.wreck;
    const hOn = (this.lightsOn || headOn) && !this.wreck;
    for (const hm of m.headMats) hm.color.setRGB(hOn ? 1.6 : 0.35, hOn ? 1.5 : 0.36, hOn ? 1.2 : 0.38);
    const brk = !this.wreck && (this.input.brake > 0.1 && this.speed > 0.3 || this.input.handbrake);
    const rev = this.speed < -0.5 && this.input.brake > 0;
    for (const tm of m.tailMats) tm.color.setRGB(brk ? 2.2 : (hOn ? 0.8 : 0.25), brk ? 0.1 : (hOn ? 0.04 : 0.03), brk ? 0.1 : 0.04);
    if (this.kind === 'car' && G.camera) { const d2 = this.pos.distanceToSquared(G.camera.position), far = this._far ? d2 > 55 * 55 : d2 > 75 * 75; if (far !== !!this._far) { this._far = far; for (const o of m.farHide) o.visible = !far; } if (m.body) m.body.castShadow = d2 < 110 * 110; }
    if (m.beams) { const dc = G.camera ? this.pos.distanceToSquared(G.camera.position) : 0, fog = G.weather ? G.weather.fog : 0, rn = G.weather ? G.weather.rain : 0; m.beams.visible = !!(hOn && !this.wreck && (G.night > 0.12 || rn > 0.4 || fog > 0.4) && dc < 140 * 140 && G.beamsOn !== false); }
    if (m.siren) { const on = this.sirenOn && !this.wreck; m.siren.visible = on ? (Math.floor(G.clock * 7) % 2 === 0) : true; m.siren.scale.x = on ? (Math.floor(G.clock * 7) % 2 ? 1 : -1) : 1; if (!on) m.siren.visible = true; }
  }
  dispose() {
    G.scene.remove(this.group);
    if (G.csm && this.model.bodyMat) G.csm.shaders.delete(this.model.bodyMat);
    if (this.model.bodyGeo && this.kind !== 'bike') this.model.bodyGeo.dispose();
    if (this.model.bodyMat) this.model.bodyMat.dispose();
    this.group.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && o.material !== M.neon) o.material.dispose(); });
  }
}

// ---------------- Verwaltung ----------------
const cellMap = new Map();
export const Veh = {
  list: G.entities.vehicles,
  spawn(id, x, z, yaw = 0, opts = {}) {
    const spec = typeof id === 'string' ? BY_ID[id] : id; if (!spec) return null;
    const v = new Vehicle(spec, x, z, yaw, opts);
    if (opts.y != null) v.pos.y = opts.y;
    this.list.push(v); return v;
  },
  remove(v) { const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1); v.dispose(); if (v.driver && v.driver.vehicle === v) v.driver.vehicle = null; },
  nearest(x, z, r, filter) {
    let best = null, bd = r * r;
    for (const v of this.list) { if (v.exploded && v.wreck && false) continue; const d = (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2; if (d < bd && (!filter || filter(v))) { bd = d; best = v; } }
    return best;
  },
  update(dt) {
    const L = this.list;
    for (const v of L) v.update(dt);
    this.collideAll(dt);
  },
  collideAll(dt) {
    const L = this.list, n = L.length;
    for (let i = 0; i < n; i++) {
      const a = L[i];
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        if (a.kind === 'plane' && a.pos.y > 4 || b.kind === 'plane' && b.pos.y > 4) { if (!(a.kind === 'plane' && b.kind === 'plane')) {} }
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr_ = a.halfL + b.halfL + 1;
        if (dx * dx + dz * dz > rr_ * rr_) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 3.2 && !(a.kind === 'boat' && b.kind === 'boat')) continue;
        if ((a.kind === 'heli' || a.kind === 'plane') && a.pos.y > TR.groundHeight(a.pos.x, a.pos.z) + 4) continue;
        if ((b.kind === 'heli' || b.kind === 'plane') && b.pos.y > TR.groundHeight(b.pos.x, b.pos.z) + 4) continue;
        this.pair(a, b);
      }
    }
  },
  pair(a, b) {
    const as = Math.sin(a.yaw), ac = Math.cos(a.yaw), bs = Math.sin(b.yaw), bc = Math.cos(b.yaw);
    for (const oa of a.circles) for (const ob of b.circles) {
      const ax = a.pos.x + as * oa, az = a.pos.z + ac * oa, bx = b.pos.x + bs * ob, bz = b.pos.z + bc * ob;
      let dx = bx - ax, dz = bz - az; const d2 = dx * dx + dz * dz, rs = a.r * 0.95 + b.r * 0.95;
      if (d2 >= rs * rs) continue;
      const d = Math.sqrt(d2) || 0.001; dx /= d; dz /= d; const pen = rs - d;
      const ma = a.mass * (a.parked ? 3 : 1), mb = b.mass * (b.parked ? 3 : 1), tm = ma + mb;
      a.pos.x -= dx * pen * (mb / tm); a.pos.z -= dz * pen * (mb / tm); b.pos.x += dx * pen * (ma / tm); b.pos.z += dz * pen * (ma / tm);
      const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z, vn = rvx * dx + rvz * dz;
      if (vn < 0) {
        const e = 0.25, j = -(1 + e) * vn / (1 / ma + 1 / mb);
        a.vel.x -= j * dx / ma; a.vel.z -= j * dz / ma; b.vel.x += j * dx / mb; b.vel.z += j * dz / mb;
        const sp = -vn;
        a.angVel += (oa / a.halfL) * sp * 0.04 * ((dx * ac - dz * as)) * (mb / tm) * 2; b.angVel -= (ob / b.halfL) * sp * 0.04 * ((dx * bc - dz * bs)) * (ma / tm) * 2;
        if (sp > 2.5) {
          const dmgA = Math.pow(sp - 1.5, 1.6) * 7 * (mb / tm) * 2, dmgB = Math.pow(sp - 1.5, 1.6) * 7 * (ma / tm) * 2;
          const [alx, alz] = a.localPoint(ax + dx * a.r, az + dz * a.r), [blx, blz] = b.localPoint(bx - dx * b.r, bz - dz * b.r);
          a.damage(dmgA, alx, alz); b.damage(dmgB, blx, blz);
          FX.sparks((ax + bx) / 2, a.pos.y + 0.6, (az + bz) / 2, 5, dx, dz);
          emit('vehicleCollision', a, b, sp);
          if (sp > 6) G.camShake = Math.max(G.camShake || 0, clamp(sp / 24, 0, 0.7));
        }
      }
    }
  },
  clear() { for (const v of [...this.list]) this.remove(v); },
};
