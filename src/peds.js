// Fußgänger: Körper, Wegfindung auf Gehsteigen, Reaktionen
import * as THREE from 'three';
import { G, emit, on } from './game.js?v=20261126142831-8986ff1';
import { Person, randomLook } from './persons.js?v=20261126142831-8986ff1';
import * as TR from './terrain.js?v=20261126142831-8986ff1';
import { P, R, K } from './terrain.js?v=20261126142831-8986ff1';
import { clamp, damp, rr, wrapAngle, angDiff, pick, lerp } from './util.js?v=20261126142831-8986ff1';
import { FX } from './effects.js?v=20261126142831-8986ff1';

const SWo = R / 2 + 2; // Mitte Gehsteig
let PID = 1;
const _r = { nx: 0, nz: 0, pen: 0 };

export class Ped {
  constructor(look, x, z, role = 'civ') {
    this.id = PID++; this.role = role; this.look = look;
    this.person = new Person(look); this.group = this.person.group;
    this.pos = new THREE.Vector3(x, TR.groundHeight(x, z), z); this.vel = new THREE.Vector3(); this.yaw = Math.random() * 6.28; this.faceYaw = this.yaw;
    this.hp = role === 'civ' ? 55 : 100; this.maxHp = this.hp; this.state = 'idle'; this.stateT = 0; this.moveX = 0; this.moveZ = 0; this.moveSpeed = 0; this.walkSpeed = 1.4 + Math.random() * 0.5;
    this.dead = false; this.downT = 0; this.age = 0; this.threat = null; this.node = null; this.target = null; this.brain = null; this.armed = null; this.fear = 0; this.aim = false; this.vy = 0;
    this.cash = Math.floor(rr(5, 60)); this.hostile = false; this.persistent = false; this.vehicle = null; this.umbrella = false; this.name = null; this.deadAnim = 0; this.noRemove = false; this.tag = null; this.accuracy = 0.5; this.fireT = 0; this.reloadT = 0; this.ammo = 999; this.handsUp = 0;
    this.sit = false; this.knock = new THREE.Vector3();
    G.scene.add(this.group);
    this.group.position.copy(this.pos);
  }
  get alive() { return !this.dead; }
  setGun(kind) { this.armed = kind; this.person.setGun(kind); }
  hurt(dmg, src = null, head = false, dir = null) {
    if (this.dead) return;
    this.hp -= dmg * (head ? 2.6 : 1);
    this.person.hit = 1; FX.blood(this.pos.x, this.pos.y + 1.3, this.pos.z, 4);
    if (dir) { this.knock.x += dir.x * 2.2; this.knock.z += dir.z * 2.2; }
    if (this.hp <= 0) this.die(src, head);
    else if (this.role === 'civ') { this.fearOf(src || { x: this.pos.x + rr(-5, 5), z: this.pos.z + rr(-5, 5) }, 8); }
    emit('pedHurt', this, src, dmg);
  }
  die(src, head = false) {
    if (this.dead) return; this.dead = true; this.state = 'dead'; this.stateT = 0; this.person.setGun(null); this.person.setUmbrella(false);
    this.moveSpeed = 0; G.stats.kills += (src === G.player || (src && src.isPlayer)) ? 1 : 0;
    emit('pedDied', this, src, head);
  }
  fearOf(src, secs = 8) {
    if (this.dead || this.role !== 'civ') return;
    this.threat = src; this.fear = secs; this.state = 'flee'; this.stateT = 0; this.person.setUmbrella(false);
  }
  update(dt) {
    this.age += dt; this.stateT += dt;
    const p = this.pos;
    if (this.dead) {
      this.deadAnim += dt;
      this.vel.multiplyScalar(Math.exp(-5 * dt)); p.x += this.knock.x * dt; p.z += this.knock.z * dt; this.knock.multiplyScalar(Math.exp(-6 * dt));
      this.person.animate(dt, { dead: true });
      this.finish(dt); return;
    }
    if (this.state === 'down') { this.downT -= dt; this.person.animate(dt, { dead: true }); p.x += this.knock.x * dt; p.z += this.knock.z * dt; this.knock.multiplyScalar(Math.exp(-6 * dt)); if (this.downT <= 0) { this.state = 'flee'; this.fear = 8; } this.finish(dt); return; }
    if (this.brain) this.brain(this, dt); else this.civAI(dt);
    // Bewegung integrieren
    const sp = this.moveSpeed;
    const tx = this.moveX * sp, tz = this.moveZ * sp;
    this.vel.x = damp(this.vel.x, tx, 10, dt); this.vel.z = damp(this.vel.z, tz, 10, dt);
    const ox = p.x, oz = p.z;
    p.x += (this.vel.x + this.knock.x) * dt; p.z += (this.vel.z + this.knock.z) * dt; this.knock.multiplyScalar(Math.exp(-6 * dt));
    TR.resolveCircle(p, 0.35, p.y, _r);
    if (TR.terrainHeight(p.x, p.z) < TR.WATER - 0.25) { p.x = ox; p.z = oz; }
    const gh = TR.groundHeight(p.x, p.z);
    p.y = damp(p.y, gh, 18, dt);
    // Blickrichtung
    const targetYaw = this.faceYaw != null && this.faceLock ? this.faceYaw : (sp > 0.2 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw);
    this.yaw += angDiff(this.yaw, targetYaw) * Math.min(1, dt * 9);
    this.person.animate(dt, { speed: Math.hypot(this.vel.x, this.vel.z), aim: this.aim, cower: this.state === 'cower' || this.state === 'handsup', look: 0 });
    if (this.state === 'handsup') { this.person.bones.shL.rotation.x = -2.9; this.person.bones.shR.rotation.x = -2.9; this.person.bones.elL.rotation.x = -0.4; this.person.bones.elR.rotation.x = -0.4; }
    this.finish(dt);
  }
  finish(dt) { this.group.position.copy(this.pos); this.group.rotation.y = this.yaw; }
  // --------- Zivile KI ---------
  civAI(dt) {
    const pl = G.player, w = G.weather;
    this.fear = Math.max(0, this.fear - dt);
    // Bedrohungserkennung: Spieler zielt/ schießt / Fahrzeug rast
    if (pl && pl.alive && !pl.vehicle) {
      const d2 = (pl.pos.x - this.pos.x) ** 2 + (pl.pos.z - this.pos.z) ** 2;
      if (pl.aiming && pl.weapon && !pl.weapon.melee && d2 < 14 * 14 && this.state !== 'flee' && this.state !== 'handsup' && Math.random() < dt * 2) { this.state = 'handsup'; this.stateT = 0; this.moveSpeed = 0; this.faceLock = true; this.faceYaw = Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z); }
    }
    switch (this.state) {
      case 'handsup':
        this.moveSpeed = 0; if (!(G.player.aiming && G.player.weapon && !G.player.weapon.melee) || this.stateT > 7) { this.state = 'flee'; this.fear = 5; this.faceLock = false; this.threat = G.player.pos; }
        break;
      case 'flee': {
        this.faceLock = false;
        const th = this.threat; let dx = this.pos.x - (th.x), dz = this.pos.z - (th.z != null ? th.z : th.y); let l = Math.hypot(dx, dz) || 1;
        // Weg vom Bedroher, entlang Gehsteig bevorzugt
        this.moveX = dx / l; this.moveZ = dz / l; this.moveSpeed = 5.6;
        if (this.fear <= 0 || l > 60) { this.state = 'idle'; this.stateT = 0; this.node = null; }
        // Ausweichen vor Gebäuden
        if (TR.rayStatic(this.pos.x, 1, this.pos.z, this.moveX, 0, this.moveZ, 2.5) < 2.5) { const a = Math.atan2(this.moveX, this.moveZ) + 1.2 * (this.id % 2 ? 1 : -1); this.moveX = Math.sin(a); this.moveZ = Math.cos(a); }
        break;
      }
      case 'cower': this.moveSpeed = 0; if (this.stateT > 2.2) { this.state = 'idle'; } break;
      case 'idle': {
        this.moveSpeed = 0; this.person.phone = this.id % 4 === 0 ? 1 : 0;
        if (this.stateT > 2 + (this.id % 5) && !(w && w.rain > 0.7 && false)) { this.person.phone = 0; this.state = 'walk'; this.stateT = 0; if (!this.node) this.pickNode(true); }
        break;
      }
      case 'walk': {
        this.person.phone = 0;
        const rain = w ? w.rain : 0;
        const spd = this.walkSpeed * (1 + rain * 0.9);
        if (!this.target) { this.pickNode(false); if (!this.target) { this.state = 'idle'; break; } }
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.2) {
          // Ampel beachten beim Überqueren
          if (this.target.cross && !this.canCross(this.target)) { this.moveSpeed = 0; this.waiting = true; break; }
          this.waiting = false; this.arrive();
        } else { this.moveX = dx / d; this.moveZ = dz / d; this.moveSpeed = this.waiting ? 0 : spd; }
        // Fahrzeug nähert sich: ausweichen
        break;
      }
    }
    // Gefahr durch Fahrzeuge: weiches Ausweichen
    if (this.state === 'walk' || this.state === 'idle') {
      for (const v of G.entities.vehicles) {
        const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z; if (dx * dx + dz * dz > 100) continue;
        const sp = Math.hypot(v.vel.x, v.vel.z);
        if (sp > 6) { const ahead = (-dx * v.vel.x - dz * v.vel.z) / sp; if (ahead < 0 && Math.abs(ahead) < 9) { this.fearOf({ x: v.pos.x, z: v.pos.z }, 3); if (sp > 14) emit('nearMiss', this, v); } }
      }
    }
    // Regen: Schirm
    if (!this.umbrella && w && w.rain > 0.35 && this.id % 3 === 0 && this.state !== 'flee') { this.umbrella = true; this.person.setUmbrella(true); }
    if (this.umbrella && w && w.rain < 0.1) { this.umbrella = false; this.person.setUmbrella(false); }
  }
  // Gehsteig-Graph: Ecken (k,l,cx,cz)
  nodePos(n) { return { x: n.k * P + n.cx * SWo, z: n.l * P + n.cz * SWo }; }
  pickNode(init) {
    if (!this.node) {
      // nächstgelegene Ecke
      const k = clamp(Math.round(this.pos.x / P), -K, K), l = clamp(Math.round(this.pos.z / P), -K, K);
      const cx = this.pos.x > k * P ? 1 : -1, cz = this.pos.z > l * P ? 1 : -1;
      this.node = { k, l, cx, cz }; this.prev = null;
      if (!TR.nodeExists(k, l)) { this.target = null; return; }
      const np = this.nodePos(this.node); this.target = { x: np.x, z: np.z, node: this.node }; return;
    }
    this.arrive();
  }
  arrive() {
    const n = this.node; if (!n) { this.target = null; return; }
    // Optionen
    const opts = [];
    const { k, l, cx, cz } = n;
    // entlang der x-Straße (Gehsteig parallel zur x-Straße auf Seite cz)
    const ex = cx > 0 ? 1 : -1;
    if (TR.nodeExists(k + ex, l)) opts.push({ k: k + ex, l, cx: -ex, cz, cross: false });
    const ez = cz > 0 ? 1 : -1;
    if (TR.nodeExists(k, l + ez)) opts.push({ k, l: l + ez, cx, cz: -ez, cross: false });
    // Überqueren
    opts.push({ k, l, cx: -cx, cz, cross: true, axis: 'x' }); opts.push({ k, l, cx, cz: -cz, cross: true, axis: 'z' });
    let cand = opts.filter((o) => !(this.prev && o.k === this.prev.k && o.l === this.prev.l && o.cx === this.prev.cx && o.cz === this.prev.cz));
    if (!cand.length) cand = opts;
    // Straße überqueren seltener
    const weights = cand.map((o) => (o.cross ? 0.35 : 1));
    let tw = weights.reduce((a, b) => a + b, 0), r = Math.random() * tw, ch = cand[0];
    for (let i = 0; i < cand.length; i++) { r -= weights[i]; if (r <= 0) { ch = cand[i]; break; } }
    this.prev = { ...n }; this.node = { k: ch.k, l: ch.l, cx: ch.cx, cz: ch.cz };
    const np = this.nodePos(this.node);
    const off = ((this.id % 7) - 3) * 0.35;
    this.target = { x: np.x + (ch.cross ? 0 : off * (ch.cx ? 0 : 1)), z: np.z + (ch.cross ? 0 : off * (ch.cz ? 0 : 1)), cross: ch.cross, axis: ch.axis, k: ch.k, l: ch.l };
    if (!TR.nodeExists(ch.k, ch.l)) { this.target = null; this.node = null; }
  }
  canCross(t) {
    const ph = TR.lightPhase(t.k, t.l, G.clock);
    // axis 'x': Ped läuft in x-Richtung → überquert N-S-Straße → N-S Verkehr muss Rot haben (Phase 2/3)
    if (t.axis === 'x') return ph === 2 || ph === 3 ? ph === 2 || true : false;
    return ph === 0 || ph === 1;
  }
}

// ---------------- Verwaltung ----------------
export const Peds = {
  list: G.entities.peds, cashDrops: [], timer: 0,
  spawnAt(x, z, role = 'civ', look = null) { const p = new Ped(look || randomLook(role), x, z, role); this.list.push(p); return p; },
  remove(p) { const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); G.scene.remove(p.group); },
  nearest(x, z, r, pred) { let b = null, bd = r * r; for (const p of this.list) { if (pred && !pred(p)) continue; const d = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2; if (d < bd) { bd = d; b = p; } } return b; },
  update(dt) {
    const pl = G.player; if (!pl) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.update(dt);
      const d2 = (p.pos.x - pl.pos.x) ** 2 + (p.pos.z - pl.pos.z) ** 2;
      p.group.visible = d2 < 260 * 260;
      const lite = !!(G.quality && G.quality.lite), lod = p.person.lod, far = d2 > (lite ? (lod === 1 ? 20 * 20 : 25 * 25) : (lod === 1 ? 26 * 26 : 34 * 34));
      p.person.setLOD(far ? 1 : (!lite && d2 > (lod === 2 ? 11 * 11 : 15 * 15)) ? 2 : 0);
      if (p.dead && p.deadAnim > 18 && !p.noRemove) { this.dropCash(p); this.remove(p); continue; }
      if (!p.persistent && !p.noRemove && d2 > 190 * 190) { this.remove(p); continue; }
    }
    // Fahrzeuge überfahren Fußgänger
    for (const v of G.entities.vehicles) {
      const sp = Math.hypot(v.vel.x, v.vel.z); if (sp < 2.2 || v.kind === 'boat' || (v.kind !== 'car' && v.kind !== 'bike' && v.pos.y > 2)) continue;
      const hit = (p) => {
        if (p.dead && p.deadAnim > 1) return;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
        if (dx * dx + dz * dz > (v.halfL + 1) ** 2) return;
        const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
        const lz = dx * s + dz * c, lx = dx * c - dz * s;
        if (Math.abs(lz) < v.halfL + 0.2 && Math.abs(lx) < v.halfW + 0.35) {
          if (p.dead || p.state === 'down') { return; }
          const dmg = sp * 7; emit('pedRunOver', p, v, sp);
          p.knock.x += v.vel.x * 0.9 + (lx > 0 ? 1 : -1) * c * 2; p.knock.z += v.vel.z * 0.9 - (lx > 0 ? 1 : -1) * s * 2;
          p.hurt(dmg, v.driver === pl ? pl : v.driver, false);
          if (!p.dead) { p.state = 'down'; p.downT = rr(3, 7); }
          FX.blood(p.pos.x, p.pos.y + 1, p.pos.z, 6);
          v.vel.multiplyScalar(0.96); G.camShake = Math.max(G.camShake || 0, 0.15);
        }
      };
      for (const p of this.list) hit(p);
    }
    // Geld einsammeln
    for (let i = this.cashDrops.length - 1; i >= 0; i--) {
      const c = this.cashDrops[i]; c.t += dt; c.mesh.rotation.y += dt * 2; c.mesh.position.y = c.y + 0.5 + Math.sin(c.t * 3) * 0.1;
      if ((c.x - pl.pos.x) ** 2 + (c.z - pl.pos.z) ** 2 < 2.4 * 2.4 && !pl.dead) { G.profile.money += c.amt; G.stats.earned += c.amt; emit('cash', c.amt); G.scene.remove(c.mesh); this.cashDrops.splice(i, 1); }
      else if (c.t > 90) { G.scene.remove(c.mesh); this.cashDrops.splice(i, 1); }
    }
    // Spawnen
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0.25; this.spawnAround(); }
  },
  dropCash(p) {
    if (p.cash <= 0 || p.role === 'cop' && false) return;
    const mesh = this.cashMesh.clone(); const y = TR.groundHeight(p.pos.x, p.pos.z); mesh.position.set(p.pos.x, y + 0.5, p.pos.z); G.scene.add(mesh);
    this.cashDrops.push({ x: p.pos.x, z: p.pos.z, y, amt: p.cash, mesh, t: 0 });
  },
  dropCashAt(x, z, amt) { const mesh = this.cashMesh.clone(); const y = TR.groundHeight(x, z); mesh.position.set(x, y + 0.5, z); G.scene.add(mesh); this.cashDrops.push({ x, z, y, amt, mesh, t: 0 }); },
  init() { this.cashMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0x3fbf5a, emissive: 0x1b6d2f, emissiveIntensity: 0.8 })); },
  civCount() { let n = 0; for (const p of this.list) if (p.role === 'civ' && !p.dead) n++; return n; },
  spawnAround() {
    const pl = G.player; if (!pl || (G.state !== 'play' && G.state !== 'cutscene' && G.state !== 'menu')) return;
    const cs = G.settings;
    const night = G.night, rain = G.weather ? G.weather.rain : 0;
    const max = Math.round((G.quality ? G.quality.peds : 55) * (1 - night * 0.55) * (1 - rain * 0.55) * (cs.traffic || 1));
    if (this.civCount() >= max) return;
    const px = pl.pos.x, pz = pl.pos.z;
    if (!(px > -1170 && px < 1180 && pz > -1170 && pz < 1180)) return;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * 6.28, d = rr(35, 120);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const k = clamp(Math.round(x / P), -K, K), l = clamp(Math.round(z / P), -K, K);
      if (!TR.nodeExists(k, l)) continue;
      const cx = Math.random() < 0.5 ? 1 : -1, cz = Math.random() < 0.5 ? 1 : -1;
      const sx = k * P + cx * SWo, sz = l * P + cz * SWo;
      if ((sx - px) ** 2 + (sz - pz) ** 2 < 30 * 30) continue;
      const ped = this.spawnAt(sx, sz, 'civ'); ped.node = { k, l, cx, cz }; ped.state = 'walk'; ped.pickNode(false); ped.arrive();
      return;
    }
  },
};
on('explosion', (x, y, z, r) => { for (const p of Peds.list) { if (p.dead) continue; const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < r * 3 && p.role === 'civ') p.fearOf({ x, z }, 10); } });
on('gunshot', (x, z, shooter) => { for (const p of Peds.list) { if (p.dead || p.role !== 'civ') continue; const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < 45) p.fearOf({ x, z }, 9); } });
