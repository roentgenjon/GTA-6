// Spieler: Eingabe, Bewegung, Fahrzeugsteuerung, Waffen, Kamera
import * as THREE from 'three';
import { G, emit, on } from './game.js';
import { Person, playerLook } from './persons.js';
import * as TR from './terrain.js';
import { Veh } from './vehicles.js';
import { Peds, Ped } from './peds.js';
import { Combat } from './combat.js';
import { WEAPONS, WEAPON_ORDER, ITEMS } from './weapons.js';
import { FX } from './effects.js';
import { clamp, damp, lerp, wrapAngle, angDiff, rr, TAU } from './util.js';
import { randomLook } from './persons.js';

// ---------------- Eingabe ----------------
export const Input = {
  keys: {}, axisX: null, pressed: new Set(), mouseDX: 0, mouseDY: 0, buttons: 0, wheel: 0, locked: false, lastBtn: 0,
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed.add(e.code);
      this.keys[e.code] = true; G.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; G.keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in this.keys) this.keys[k] = false; this.buttons = 0; });
    canvas.addEventListener('mousedown', (e) => { if (document.body.classList.contains('touch')) return; if (G.state === 'play' && !this.locked) this.lock(canvas); this.buttons |= 1 << e.button; this.lastBtn = e.button; if (e.button === 0) this.pressed.add('Mouse0'); if (e.button === 2) this.pressed.add('Mouse2'); });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => { if (this.locked || (G.state === 'play' && this.buttons)) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    window.addEventListener('wheel', (e) => { if (G.state === 'play') this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && G.state === 'play' && !G.ignoreUnlock) emit('pause');
    });
  },
  lock(canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } },
  unlock() { G.ignoreUnlock = true; if (document.pointerLockElement) document.exitPointerLock(); setTimeout(() => { G.ignoreUnlock = false; }, 100); },
  down(c) { return !!this.keys[c]; },
  press(c) { return this.pressed.has(c); },
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; },
};

// ---------------- Spieler ----------------
export class Player {
  constructor() {
    this.isPlayer = true;
    this.look = G.profile.look; this.person = new Person(this.look); this.group = this.person.group; G.scene.add(this.group);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.knock = new THREE.Vector3(); this.yaw = 0; this.vy = 0; this.onGround = true; this.swim = false;
    this.hp = 100; this.armor = 0; this.maxHp = 100; this.stamina = 1; this.alive = true; this.vehicle = null; this.aiming = false; this.moving = false; this.sprinting = false;
    this.weaponId = 'fist'; this.weapon = WEAPONS.fist; this.fireT = 0; this.reloadT = 0; this.lastHit = 0; this.energy = 0; this.deadT = 0;
    this.camYaw = 0; this.camPitch = 0.25; this.camDist = 4.2; this.camMode = 0; this.camLook = 0; this.camAuto = 0;
    this.speed = 0; this.moveDir = new THREE.Vector3(); this.interactT = 0; this.noDamage = false; this.lastDamageDir = 0; this.regenT = 0; this.invuln = 0;
    this.drift = { cur: 0, t: 0 }; this.airT = 0; this.airStartY = 0; this.lastLand = 0; this.skillT = 0; this.wasVehicleY = 0;
  }
  setLook(look) { G.profile.look = look; this.look = look; this.person.setLook(look); this.equipVisual(); }
  teleport(x, z, yaw) { this.pos.set(x, TR.groundHeight(x, z), z); if (yaw != null) { this.yaw = yaw; this.camYaw = yaw; } this.vel.set(0, 0, 0); this.vy = 0; this.group.position.copy(this.pos); }
  equipVisual() { const w = this.weapon; this.person.setGun(w && w.model ? w.model : null); }
  setWeapon(id) {
    const prof = G.profile; if (!prof.weapons[id] && id !== 'fist') return;
    this.weaponId = id; this.weapon = WEAPONS[id]; this.reloadT = 0; this.equipVisual(); emit('weaponChanged', id);
  }
  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((w) => w === 'fist' || G.profile.weapons[w]);
    let i = owned.indexOf(this.weaponId); i = (i + dir + owned.length) % owned.length; this.setWeapon(owned[i]);
  }
  get wdata() { return G.profile.weapons[this.weaponId]; }
  addWeapon(id, ammo = 0) {
    const w = WEAPONS[id]; const p = G.profile.weapons;
    if (!p[id]) { p[id] = { ammo: 0, mag: w.mag || 0 }; }
    p[id].ammo += ammo; if (id === 'grenade') { p[id].ammo = Math.max(p[id].ammo, ammo); }
  }
  damage(amt, from = null) {
    if (!this.alive || this.invuln > 0 || G.cheat?.god) return;
    amt *= 1 / (1 + G.profile.skills.stamina * 0.0);
    this.lastHit = 0; this.regenT = 0;
    if (this.armor > 0) { const a = Math.min(this.armor, amt * 0.7); this.armor -= a; amt -= a; }
    this.hp -= amt; this.person.hit = 1;
    if (from) { const dx = from.x - this.pos.x, dz = from.z - this.pos.z; this.lastDamageDir = Math.atan2(dx, dz); }
    emit('playerHurt', amt, this.lastDamageDir);
    if (this.hp <= 0 && this.alive) this.die();
  }
  heal(a) { this.hp = Math.min(this.maxHp, this.hp + a); }
  die() {
    this.alive = false; this.hp = 0; this.deadT = 0; G.stats.deaths++;
    if (this.vehicle) this.exitVehicle(true);
    this.person.setGun(null); emit('playerDied');
  }
  revive() {
    this.alive = true; this.hp = this.maxHp; this.armor = 0; this.deadT = 0; this.person.deadT = 0; this.person.hit = 0; this.equipVisual(); this.invuln = 3; this.knock.set(0, 0, 0);
  }
  onVehicleExploded(v, drowned) { if (this.vehicle === v) { this.damage(drowned ? 0 : 400, v.pos); if (this.alive) this.exitVehicle(true); } }
  onVehicleDamage(v, amt) { if (amt > 40) this.damage(amt * 0.04, null); }

  // ---------- Fahrzeug ----------
  nearestVehicle() {
    let best = null, bd = 1e9;
    for (const v of G.entities.vehicles) {
      if (v.wreck && v.kind !== 'bike') continue;
      const dx = v.pos.x - this.pos.x, dz = v.pos.z - this.pos.z;
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), lz = dx * s + dz * c, lx = dx * c - dz * s;
      const ex = Math.max(Math.abs(lx) - v.halfW, 0), ez = Math.max(Math.abs(lz) - v.halfL, 0);
      const d = Math.hypot(ex, ez); if (d < 3.2 + (v.kind === 'plane' || v.kind === 'heli' ? 1.5 : 0) && d < bd && Math.abs(v.pos.y - this.pos.y) < 4) { bd = d; best = v; }
    }
    return best;
  }
  enterVehicle(v) {
    if (!v || this.vehicle) return;
    if (v.driver && v.driver !== this && !v.driver.npc && !v.driver.cop) return;
    if (v.driver && v.driver.npc) {
      // Carjack
      const look = randomLook('civ'); const p = Peds.spawnAt(v.pos.x + Math.cos(v.yaw) * (v.halfW + 0.8), v.pos.z - Math.sin(v.yaw) * (v.halfW + 0.8), 'civ', look);
      p.fearOf(this.pos, 12); p.state = 'flee'; if (G.audio) G.audio.play('scream');
      emit('crime', 'carjack', v.pos, v); G.stats.stolen++;
    } else if (!v.owned && !v.isMissionVehicle && (v.parked || v.isParked) && !v.stolenFlag) { v.stolenFlag = true; if (Math.random() < 0.65) emit('crime', 'theft', v.pos, v); G.stats.stolen++; }
    v.driver = this; v.ai = null; v.isTraffic = false; v.parked = false; v.isParked = false; v.keep = true; v.input.throttle = 0; v.input.brake = 0; v.input.handbrake = false;
    this.vehicle = v; this.group.visible = v.kind === 'bike' || v.kind === 'boat' && v.spec.cls === 'jetski';
    if (this.group.visible) { v.group.add(this.group); this.group.position.set(0, 0, -0.1); this.group.rotation.set(0, 0, 0); this.person.setGun(null); }
    this.camMode = 0; this.camAuto = 0; this.camYaw = v.yaw; this.camPitch = 0.22;
    this.person.sit = true;
    emit('enteredVehicle', v);
  }
  exitVehicle(force = false) {
    const v = this.vehicle; if (!v) return;
    if (!force) {
      if ((v.kind === 'plane' && v.pos.y > TR.groundHeight(v.pos.x, v.pos.z) + 4) || (v.kind === 'heli' && v.pos.y > TR.groundHeight(v.pos.x, v.pos.z) + 3)) { emit('toast', 'Im Flug kannst du nicht aussteigen.'); return; }
      if (Math.abs(v.speed) > 14 && v.kind !== 'boat') { emit('toast', 'Zu schnell zum Aussteigen!'); return; }
    }
    if (this.group.parent === v.group) { v.group.remove(this.group); G.scene.add(this.group); }
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const cands = [[c, -s], [-c, s], [-s, -c], [s, c]];
    let placed = false;
    for (const [dx, dz] of cands) {
      const d = v.halfW + 0.9 + (v.kind === 'heli' ? 1.2 : 0);
      const p = { x: v.pos.x + dx * d, z: v.pos.z + dz * d };
      const q = { x: p.x, z: p.z }; const hit = TR.resolveCircle(q, 0.4, v.pos.y);
      if (!hit || Math.hypot(q.x - p.x, q.z - p.z) < 0.2) { this.pos.set(q.x, Math.max(v.kind === 'boat' ? TR.WATER : TR.groundHeight(q.x, q.z), v.kind === 'heli' ? v.pos.y : -99), q.z); placed = true; break; }
    }
    if (!placed) this.pos.set(v.pos.x + c * (v.halfW + 1.2), TR.groundHeight(v.pos.x, v.pos.z), v.pos.z - s * (v.halfW + 1.2));
    if (v.kind === 'boat') this.pos.y = TR.WATER;
    v.driver = null; v.input.throttle = 0; v.input.brake = 0; v.input.handbrake = v.kind !== 'boat'; v.input.steer = 0; v.keep = true;
    if (v.kind === 'plane') { v.input.lift = 0; }
    this.vehicle = null; this.group.visible = true; this.person.sit = false; this.yaw = v.yaw; this.camYaw = v.yaw; this.vel.set(0, 0, 0); this.vy = 0;
    this.equipVisual(); emit('exitedVehicle', v);
    if (force && !this.alive) { this.vel.set(0, 0, 0); }
  }
  // ---------- Update ----------
  update(dt) {
    const I = Input, prof = G.profile;
    if (this.invuln > 0) this.invuln -= dt;
    this.lastHit += dt;
    if (!this.alive) {
      this.deadT += dt; this.person.animate(dt, { dead: true }); this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
      return;
    }
    // Regeneration
    this.regenT += dt; if (this.regenT > 6 && this.hp < 50 && !this.vehicle) this.hp = Math.min(50, this.hp + dt * 1.5);
    if (this.energy > 0) { this.energy -= dt; this.stamina = 1; }
    if (G.cheat && G.cheat.stamina) this.stamina = 1;
    const ctl = G.state === 'play';
    // Kamera-Mausdrehung
    const sens = 0.0022 * G.settings.sens;
    if (ctl) {
      this.camYaw -= I.mouseDX * sens; this.camPitch = clamp(this.camPitch + I.mouseDY * sens * (G.settings.invertY ? -1 : 1), -0.95, 1.2);
      if (this.vehicle && (Math.abs(I.mouseDX) + Math.abs(I.mouseDY)) > 0) this.camAuto = 0;
    }
    if (this.vehicle) this.updateDriving(dt, ctl); else this.updateFoot(dt, ctl);
    // Waffenwahl
    if (ctl && !this.vehicle) {
      if (I.wheel) this.cycleWeapon(I.wheel);
      const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
      const owned = WEAPON_ORDER.filter((w) => w === 'fist' || prof.weapons[w]); // Ziffer = n-te besessene Waffe
      keys.forEach((k, i) => { if (I.press(k) && owned[i]) this.setWeapon(owned[i]); });
    }
    this.group.position.copy(this.vehicle ? (this.group.parent === G.scene ? this.pos : this.group.position) : this.pos);
    // Wasserblasen etc.
    G.stats.played += dt;
  }

  updateFoot(dt, ctl) {
    const I = Input, p = this.pos;
    const prof = G.profile;
    // Bewegungseingabe relativ Kamera
    let ix = 0, iz = 0;
    if (ctl) { if (I.down('KeyW')) iz += 1; if (I.down('KeyS')) iz -= 1; if (I.down('KeyA')) ix -= 1; if (I.down('KeyD')) ix += 1; }
    const len = Math.hypot(ix, iz); if (len > 0) { ix /= len; iz /= len; }
    const cy = this.camYaw, fx = Math.sin(cy), fz = Math.cos(cy);
    const dirx = fx * iz - fz * ix, dirz = fz * iz + fx * ix; // rechts = (-fz, fx)
    this.moving = len > 0;
    const inWater = TR.terrainHeight(p.x, p.z) < TR.WATER - 0.95;
    const wantSprint = ctl && I.down('ShiftLeft') && len > 0 && !this.aiming;
    this.sprinting = wantSprint && this.stamina > 0.02 && !inWater;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.11 * (1 - prof.skills.stamina * 0.5)); else this.stamina = Math.min(1, this.stamina + dt * 0.18);
    this.aiming = ctl && (I.buttons & 4) !== 0 && !!this.weapon && !this.weapon.melee;
    let speed = this.sprinting ? 7.4 : 4.4; if (this.aiming) speed = 2.3; if (inWater) speed = this.sprinting ? 3.4 : 2.6; if (len > 0 && len < 0.3) speed = 1.5;
    if (!this.onGround && !inWater) speed *= 0.85;
    if (G.cheat && G.cheat.speed) speed *= G.cheat.speed; // Admin: Lauftempo
    const fly = !!(G.cheat && G.cheat.fly);
    // Boden/Schwimmen
    const gh = TR.groundHeight(p.x, p.z);
    this.swim = inWater;
    this.vel.x = damp(this.vel.x, dirx * speed, inWater ? 4 : 11, dt); this.vel.z = damp(this.vel.z, dirz * speed, inWater ? 4 : 11, dt);
    const ox = p.x, oz = p.z;
    p.x += (this.vel.x + this.knock.x) * dt; p.z += (this.vel.z + this.knock.z) * dt; this.knock.multiplyScalar(Math.exp(-6 * dt));
    // Fahrzeuge blockieren (weich)
    for (const v of G.entities.vehicles) {
      if (Math.abs(v.pos.y - p.y) > 2.2 && v.kind !== 'car') continue;
      const dx = p.x - v.pos.x, dz = p.z - v.pos.z; if (dx * dx + dz * dz > (v.halfL + 1.2) ** 2) continue;
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), lz = dx * s + dz * c, lx = dx * c - dz * s;
      const ex = v.halfW + 0.38, ez = v.halfL + 0.2;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez && p.y < v.pos.y + (v.spec.H || 1.5) - 0.2) {
        const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
        if (px < pz) { const sg = lx >= 0 ? 1 : -1; p.x += c * sg * px; p.z -= s * sg * px; } else { const sg = lz >= 0 ? 1 : -1; p.x += s * sg * pz; p.z += c * sg * pz; }
        const vs = Math.hypot(v.vel.x, v.vel.z);
        if (vs > 3) { this.damage(vs * 4, { x: v.pos.x, z: v.pos.z }); this.knock.x += v.vel.x * 0.6; this.knock.z += v.vel.z * 0.6; if (v.driver && v.driver.npc) { } if (vs > 5) emit('crime', 'ran_player', v.pos, v); }
      }
    }
    if (!fly) TR.resolveCircle(p, 0.38, p.y);
    // Wasser
    const terr = TR.terrainHeight(p.x, p.z);
    const swimming = terr < TR.WATER - 0.95;
    if (fly) { // Admin: Fliegen/Noclip (Leertaste hoch, Q runter, Shift schneller)
      const up = ctl ? ((I.down('Space') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0)) : 0;
      p.y = Math.max(p.y + up * 14 * dt * (this.sprinting ? 2.2 : 1), gh); this.vy = 0; this.onGround = false; this.swim = false;
    } else if (swimming) {
      this.swim = true; const targetY = TR.WATER - 0.9 + Math.sin(G.clock * 2) * 0.05; p.y = damp(p.y, targetY, 8, dt); this.vy = 0; this.onGround = false;
      if (this.moving && Math.random() < dt * 8) FX.splash(p.x, TR.WATER + 0.05, p.z, this.vel.x, this.vel.z, 0.5);
    } else {
      this.swim = false;
      if (this.onGround && ctl && I.press('Space')) { this.vy = 7.4 * ((G.cheat && G.cheat.jump) || 1); this.onGround = false; G.stats.jumps = (G.stats.jumps || 0); }
      this.vy -= 22 * dt; p.y += this.vy * dt;
      if (p.y <= gh) { if (!this.onGround && this.vy < -11) { this.damage((-this.vy - 10) * 6); } p.y = gh; this.vy = 0; this.onGround = true; }
      else if (p.y > gh + 0.25) this.onGround = false; else if (this.vy <= 0) { p.y = gh; this.onGround = true; }
    }
    // Schwimmen: Weltgrenzen
    const lim = TR.HALF - 60; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    // Ausrichtung
    let faceYaw = this.yaw;
    if (this.aiming || (ctl && (I.buttons & 1) && !this.weapon.melee)) faceYaw = this.camYaw; else if (len > 0.05) faceYaw = Math.atan2(dirx, dirz);
    this.yaw += angDiff(this.yaw, faceYaw) * Math.min(1, dt * (this.aiming ? 18 : 12));
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    G.stats.dist += this.speed * dt;
    // Schießen
    this.fireT -= dt; if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
    const w = this.weapon;
    if (ctl && w) {
      const fireHeld = (I.buttons & 1) !== 0, firePressed = I.press('Mouse0');
      if (w.melee) { if (firePressed && this.fireT <= 0) { this.fireT = 1 / w.rate; Combat.melee(this, w); } }
      else if (w.throw) { if (firePressed && this.fireT <= 0 && this.wdata && this.wdata.ammo > 0) { this.fireT = 1 / w.rate; if (!G.settings.infAmmo) this.wdata.ammo--; const f = this.camForward(); Combat.throwGrenade(this, new THREE.Vector3(p.x, p.y + 1.5, p.z), f); this.person.punch = 1; if (this.wdata.ammo <= 0 && !G.settings.infAmmo) { delete G.profile.weapons.grenade; this.setWeapon('fist'); } } }
      else if ((w.auto ? fireHeld : firePressed) && this.fireT <= 0 && this.reloadT <= 0 && !this.swim) {
        const wd = this.wdata;
        if (wd && G.settings.infAmmo && w.mag) { wd.mag = w.mag; if (wd.ammo < w.mag) wd.ammo = w.mag; } // unendlich Munition: Magazin bleibt voll
        if (wd && wd.mag > 0) {
          this.fireT = 1 / w.rate; if (!G.settings.infAmmo) wd.mag--; this.shoot(); this.person.shoot = 1; this.aiming = true;
          if (wd.mag === 0) this.reload();
        } else if (wd) this.reload();
      }
      if (ctl && I.press('KeyR')) this.reload();
    }
    if (fireHeldAim(ctl)) this.aiming = true;
    this.person.animate(dt, { speed: this.speed, aim: this.aiming && !!this.weapon && !this.weapon.melee, swim: this.swim, air: this.onGround ? 0 : this.vy, look: 0 });
    this.group.rotation.y = this.yaw;
  }
  camForward() {
    const cp = Math.cos(this.camPitch);
    return new THREE.Vector3(Math.sin(this.camYaw) * cp, -Math.sin(this.camPitch), Math.cos(this.camYaw) * cp).normalize();
  }
  reload() {
    const w = this.weapon, wd = this.wdata; if (!wd || !w.mag || this.reloadT > 0 || wd.mag >= w.mag || wd.ammo <= 0) return;
    this.reloadT = w.reload || 1.4; if (G.audio) G.audio.play('reload');
  }
  finishReload() { const w = this.weapon, wd = this.wdata; if (!wd) return; const need = w.mag - wd.mag, take = Math.min(need, wd.ammo); wd.mag += take; wd.ammo -= take; }
  autoTarget(w, cam) {
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); const o = cam.position, cone = Math.cos((this.aiming ? 34 : 26) * Math.PI / 180), long = w.range > 130;
    let best = null, bs = -1e9;
    for (const p of G.entities.peds) {
      if (p.dead || p.role === 'civ') continue; // nur Gegner (Polizei, Gangster, Missionsgegner), keine Passanten
      const hy = p.pos.y + (long ? 1.5 : 1.2), dx = p.pos.x - o.x, dy = hy - o.y, dz = p.pos.z - o.z, d = Math.hypot(dx, dy, dz);
      if (d > w.range * 0.92 || d < 1.5) continue;
      const c = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (c < cone) continue;
      const sc = c * 10 - d * 0.01; if (sc <= bs) continue;
      const h = Combat.castRay(o.x, o.y, o.z, dx / d, dy / d, dz / d, d + 0.5, this, null);
      if ((h.type === 'ped' && h.ped === p) || h.t >= d - 0.7) { bs = sc; best = new THREE.Vector3(p.pos.x, hy, p.pos.z); }
    }
    return best;
  }
  shoot() {
    const cam = G.camera, w = this.weapon;
    // Ziel: Strahl aus Kamera
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const org = cam.position.clone();
    const range = w.range;
    // Schnittpunkt Kamera-Strahl (um Waffe auszurichten)
    const hit = Combat.castRay(org.x, org.y, org.z, dir.x, dir.y, dir.z, range, this, null);
    const target = new THREE.Vector3(org.x + dir.x * Math.min(hit.t, range), org.y + dir.y * Math.min(hit.t, range), org.z + dir.z * Math.min(hit.t, range));
    const at = G.settings.autoAim !== false ? this.autoTarget(w, cam) : null; // Zielhilfe: rastet auf Gegner im Blickfeld ein
    if (at) target.copy(at);
    const muzzle = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.4, this.pos.z + Math.cos(this.yaw) * 0.6);
    const d2 = target.clone().sub(muzzle).normalize();
    Combat.fire(this, muzzle, d2, w.id, target, muzzle);
    G.stats.shots = (G.stats.shots || 0) + 1;
    this.camKick = 0.02;
  }

  updateDriving(dt, ctl) {
    const I = Input, v = this.vehicle, inp = v.input;
    this.aiming = false;
    const K = (c) => ctl && I.down(c);
    const kind = v.kind;
    if (kind === 'plane' || kind === 'heli') {
      // Flugsteuerung: W/S = Nase runter/hoch; A/D = rollen; Q/E = gieren; Shift = Schub/Steigen+, Space = -
      inp.pitch = (K('KeyS') ? 1 : 0) - (K('KeyW') ? 1 : 0);
      inp.roll = (K('KeyD') ? 1 : 0) - (K('KeyA') ? 1 : 0);
      inp.yaw = (K('KeyE') ? 1 : 0) - (K('KeyQ') ? 1 : 0);
      inp.lift = kind === 'heli' ? (K('Space') ? 1 : 0) - (K('ShiftLeft') ? 1 : 0) : (K('ShiftLeft') ? 1 : 0) - (K('Space') ? 1 : 0); // Heli: Leertaste hoch, Shift runter
      inp.brake = K('KeyS') && kind === 'plane' && v.flightSpeed < 10 ? 1 : 0; inp.handbrake = K('Space') && kind === 'plane' && v.grounded;
      inp.steer = inp.roll;
      if (kind === 'heli' && !(K('ShiftLeft') || K('Space'))) inp.lift = 0;
    } else {
      inp.throttle = K('KeyW') ? 1 : 0; inp.brake = K('KeyS') ? 1 : 0; inp.steer = damp(inp.steer, I.axisX != null ? I.axisX : (K('KeyA') ? 1 : 0) - (K('KeyD') ? 1 : 0), 9, dt);
      inp.handbrake = K('Space'); inp.boost = false;
      if (kind === 'boat') { inp.handbrake = false; }
    }
    if (ctl && I.press('KeyH')) { }
    v.hornT = K('KeyH') ? 0.2 : v.hornT;
    if (ctl && I.press('KeyL')) v.lightsOn = !v.lightsOn;
    // Driftpunkte
    if (v.drifting && v.grounded) { this.drift.cur += Math.abs(v.slip) * dt * 12; this.drift.t = 1.2; } else if (this.drift.t > 0) { this.drift.t -= dt; if (this.drift.t <= 0) { if (this.drift.cur > 150) { const pts = Math.round(this.drift.cur); const rew = Math.round(pts * 0.6); G.profile.money += rew; G.stats.earned += rew; emit('toast', `Drift! ${pts} Punkte (+$${rew})`); if (pts > G.stats.driftBest) G.stats.driftBest = pts; G.profile.skills.driving = Math.min(1, G.profile.skills.driving + 0.004); } this.drift.cur = 0; } }
    // Sprung
    if (v.grounded === false && v.kind === 'car') { this.airT += dt; } else { if (this.airT > 0.9 && v.kind === 'car') { const d = Math.round(this.airT * Math.hypot(v.vel.x, v.vel.z)); G.stats.maxJump = Math.max(G.stats.maxJump, d); emit('jumpDone', d, this.airT); } this.airT = 0; }
    // Fahrdistanz
    G.stats.vdist += Math.abs(v.speed) * dt;
    this.pos.copy(v.pos); this.yaw = v.yaw; this.speed = Math.abs(v.speed);
    if (ctl && I.press('KeyF')) { I.pressed.delete('KeyF'); this.exitVehicle(); } // Druck verbrauchen, sonst steigt die Interaktionsabfrage im selben Bild sofort wieder ein
    if (ctl && I.press('KeyC')) { this.camMode = (this.camMode + 1) % 4; emit('toast', ['Kamera: Verfolger', 'Kamera: Nah', 'Kamera: Motorhaube', 'Kamera: Kino'][this.camMode]); }
    if (this.group.visible && this.group.parent === v.group) {
      const bike = v.kind === 'bike';
      this.person.animate(dt, { speed: 0, sit: true });
      this.group.position.set(0, bike ? 0.05 : 0.0, bike ? -0.18 : -0.2);
      this.person.bones.hips.position.y = bike ? 0.58 : 0.45;
    }
    // Hubschrauber/Flugzeug: Höhenwarnung etc. in UI
  }
}
function fireHeldAim(ctl) { return false; }

// ---------------- Kamera ----------------
export const CamCtl = {
  pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 70, mode: 'follow', cut: null, orbit: 0, shakeT: 0, lastTarget: new THREE.Vector3(), headingSmooth: 0, init: false,
  update(dt) {
    const cam = G.camera, pl = G.player; if (!pl) return;
    const set = G.settings;
    let tgtPos = new THREE.Vector3(), tgtLook = new THREE.Vector3(), fovT = set.fov;
    if (G.state === 'cutscene' && this.cut) {
      tgtPos.copy(this.cut.pos); tgtLook.copy(this.cut.look);
      if (this.cut.follow) { tgtLook.set(this.cut.follow.x, (this.cut.follow.y || 0) + 1.5, this.cut.follow.z); }
      this.pos.lerp(tgtPos, Math.min(1, dt * (this.cut.smooth || 3))); this.look.lerp(tgtLook, Math.min(1, dt * 5)); fovT = this.cut.fov || 45;
      if (!this.init) { this.pos.copy(tgtPos); this.look.copy(tgtLook); }
    } else if (G.state === 'menu' || G.state === 'intro') {
      this.orbit += dt * 0.04; const R_ = 260, cx = 120, cz = -20;
      tgtPos.set(cx + Math.cos(this.orbit) * R_, 120 + Math.sin(this.orbit * 2) * 20, cz + Math.sin(this.orbit) * R_); tgtLook.set(cx, 40, cz);
      this.pos.copy(tgtPos); this.look.copy(tgtLook); fovT = 55;
    } else if (G.state === 'pause' && G.ui && G.ui.tab === 'char') {
      this.orbit += dt * 0.5; tgtLook.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z);
      tgtPos.set(pl.pos.x + Math.sin(this.orbit) * 2.6, pl.pos.y + 1.2, pl.pos.z + Math.cos(this.orbit) * 2.6);
      this.pos.lerp(tgtPos, Math.min(1, dt * 4)); this.look.lerp(tgtLook, Math.min(1, dt * 5)); fovT = 40;
    } else if (pl.vehicle) {
      const v = pl.vehicle; const kind = v.kind;
      const sp = Math.hypot(v.vel.x, v.vel.z);
      // Blickrichtung: Fahrzeug-Heading (Geschwindigkeit bevorzugt), mit manueller Drehung
      pl.camAuto += dt;
      let heading = v.yaw;
      if (sp > 5 && v.kind !== 'heli' && v.kind !== 'plane') { const vh = Math.atan2(v.vel.x, v.vel.z); if (Math.abs(angDiff(v.yaw, vh)) < 1.5) heading = v.yaw + angDiff(v.yaw, vh) * 0.35; }
      if (pl.camAuto > 1.6) pl.camYaw += angDiff(pl.camYaw, heading) * Math.min(1, dt * 3.5);
      if (pl.camAuto > 1.6) pl.camPitch = damp(pl.camPitch, kind === 'plane' || kind === 'heli' ? 0.12 : 0.2, 2, dt);
      const L = v.spec.L, big = Math.max(L * 0.9, 4);
      let dist = big * 1.35 + 3 + sp * 0.05, height = 1.4 + v.spec.H * 0.45 + Math.sin(pl.camPitch) * dist * 0.8;
      if (kind === 'plane') { dist = 15; height = 3.5 + pl.camPitch * 8; } if (kind === 'heli') { dist = 17; height = 4.5 + pl.camPitch * 8; } if (kind === 'boat') { dist = L * 1.1 + 4; height += 1; } if (kind === 'bike') { dist = 5.2; }
      const mode = pl.camMode;
      const cy = pl.camYaw, base = new THREE.Vector3(v.pos.x, v.pos.y + 1.1 + (kind === 'plane' || kind === 'heli' ? 1 : 0), v.pos.z);
      if (mode === 0) { tgtPos.set(base.x - Math.sin(cy) * dist, base.y + height, base.z - Math.cos(cy) * dist); tgtLook.set(base.x + Math.sin(cy) * 3, base.y + 0.5, base.z + Math.cos(cy) * 3); }
      else if (mode === 1) { tgtPos.set(base.x - Math.sin(cy) * dist * 0.62, base.y + height * 0.62, base.z - Math.cos(cy) * dist * 0.62); tgtLook.set(base.x + Math.sin(cy) * 4, base.y + 0.4, base.z + Math.cos(cy) * 4); }
      else if (mode === 2) { const s = Math.sin(v.yaw), c = Math.cos(v.yaw); tgtPos.set(v.pos.x + s * (v.spec.L * 0.18), v.pos.y + (v.spec.H * 0.78), v.pos.z + c * (v.spec.L * 0.18)); tgtLook.set(tgtPos.x + Math.sin(cy) * 10, tgtPos.y - Math.sin(pl.camPitch - 0.2) * 6, tgtPos.z + Math.cos(cy) * 10); }
      else { const ang = G.clock * 0.25 + 1; tgtPos.set(v.pos.x + Math.sin(heading + 2.4 + Math.sin(ang) * 0.7) * (dist * 0.9), v.pos.y + 1.0 + (Math.sin(G.clock * 0.3) + 1) * 0.6, v.pos.z + Math.cos(heading + 2.4 + Math.sin(ang) * 0.7) * (dist * 0.9)); tgtLook.set(v.pos.x + v.vel.x * 0.15, v.pos.y + 0.9, v.pos.z + v.vel.z * 0.15); }
      // Kollision
      this.avoid(tgtPos, base);
      const k = mode === 2 ? 30 : (mode === 3 ? 4 : 9);
      this.pos.x = damp(this.pos.x, tgtPos.x, k, dt); this.pos.y = damp(this.pos.y, tgtPos.y, k, dt); this.pos.z = damp(this.pos.z, tgtPos.z, k, dt);
      this.look.x = damp(this.look.x, tgtLook.x, 14, dt); this.look.y = damp(this.look.y, tgtLook.y, 14, dt); this.look.z = damp(this.look.z, tgtLook.z, 14, dt);
      fovT = set.fov + clamp(sp * 0.4, 0, 18) + (v.input && v.input.boost ? 6 : 0);
      if (kind === 'plane') fovT = set.fov + clamp(v.speed * 0.08, 0, 14);
    } else {
      // Zu Fuß: Schulterkamera
      const aim = pl.aiming;
      const dist = aim ? 1.9 : (pl.swim ? 5.5 : 4.2), sh = aim ? 0.8 : 0.4;
      const cy = pl.camYaw, cp = pl.camPitch, fx = Math.sin(cy), fz = Math.cos(cy);
      const head = new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.swim ? 0.9 : 1.55), pl.pos.z);
      const horiz = Math.cos(cp) * dist;
      tgtPos.set(head.x - fx * horiz - fz * sh, head.y + Math.sin(cp) * dist, head.z - fz * horiz + fx * sh);
      this.avoid(tgtPos, head);
      const k = aim ? 22 : 16;
      this.pos.x = damp(this.pos.x, tgtPos.x, k, dt); this.pos.y = damp(this.pos.y, tgtPos.y, k, dt); this.pos.z = damp(this.pos.z, tgtPos.z, k, dt);
      this.look.set(this.pos.x + Math.sin(cy) * Math.cos(cp) * 10, this.pos.y - Math.sin(cp) * 10, this.pos.z + Math.cos(cy) * Math.cos(cp) * 10);
      fovT = aim ? set.fov - ((pl.weapon && pl.weapon.zoom) || 18) : set.fov + (pl.sprinting ? 6 : 0);
    }
    if (!this.init) { this.init = true; this.pos.copy(cam.position.lengthSq() ? tgtPos : tgtPos); }
    // Schütteln
    const shake = (G.settings.camShake ? Math.max(G.camShake || 0, FX.shake) : 0);
    G.camShake = Math.max(0, (G.camShake || 0) - dt * 1.8);
    cam.position.copy(this.pos);
    if (shake > 0.001) { cam.position.x += (Math.random() - 0.5) * shake * 0.5; cam.position.y += (Math.random() - 0.5) * shake * 0.5; cam.position.z += (Math.random() - 0.5) * shake * 0.5; }
    // Bodenhöhe
    const gh = TR.groundHeight(cam.position.x, cam.position.z) + 0.4; if (cam.position.y < gh && !pl.swim) cam.position.y = gh;
    cam.lookAt(this.look);
    this.fov = damp(this.fov, fovT, 6, dt); if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  },
  avoid(pos, from) {
    const dx = pos.x - from.x, dy = pos.y - from.y, dz = pos.z - from.z, d = Math.hypot(dx, dy, dz);
    if (d < 0.1) return;
    const t = TR.rayStatic(from.x, from.y, from.z, dx / d, dy / d, dz / d, d);
    if (t < d) { const k = Math.max(0.6, t - 0.5) / d; pos.set(from.x + dx * k, from.y + dy * k, from.z + dz * k); }
  },
  cutscene(spec) { this.cut = spec; if (!this.init) this.init = false; },
};
