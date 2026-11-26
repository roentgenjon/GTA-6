// Kampfsystem: Schüsse, Nahkampf, Granaten, Explosionen
import * as THREE from 'three';
import { G, emit, on } from './game.js';
import { WEAPONS } from './weapons.js';
import * as TR from './terrain.js';
import { Veh } from './vehicles.js';
import { Peds } from './peds.js';
import { FX } from './effects.js';
import { clamp, rr } from './util.js';

const _v = new THREE.Vector3();

function rayPed(ox, oy, oz, dx, dy, dz, maxD, ignore) {
  let best = null, bt = maxD;
  for (const p of G.entities.peds) {
    if (p === ignore || p.dead && p.deadAnim > 0.5) continue;
    const px = p.pos.x - ox, pz = p.pos.z - oz, t = px * dx + pz * dz;
    if (t < 0 || t > bt) continue;
    const hx = px - dx * t, hz = pz - dz * t; const h2 = Math.hypot(hx, hz);
    if (h2 > 0.45) continue;
    const dl = Math.hypot(dx, dz) || 1; const tt = t / dl; const y = oy + dy * tt;
    if (y < p.pos.y - 0.05 || y > p.pos.y + 1.9) continue;
    bt = t; best = { ped: p, t, y: y - p.pos.y };
  }
  return best;
}
function rayVeh(ox, oy, oz, dx, dy, dz, maxD, ignore) {
  let best = null, bt = maxD;
  for (const v of G.entities.vehicles) {
    if (v === ignore) continue;
    const dxv = v.pos.x - ox, dzv = v.pos.z - oz; if (dxv * dxv + dzv * dzv > (maxD + 8) ** 2) continue;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    for (const off of v.circles) {
      const cx = v.pos.x + s * off, cz = v.pos.z + c * off, cy = v.pos.y + 0.8;
      const px = cx - ox, py = cy - oy, pz = cz - oz, t = px * dx + py * dy + pz * dz;
      if (t < 0 || t > bt) continue;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t, d2 = qx * qx + qy * qy + qz * qz;
      const rr_ = Math.max(0.9, v.r * 1.05);
      if (d2 < rr_ * rr_) { bt = t; best = { veh: v, t }; }
    }
  }
  return best;
}

export const Combat = {
  grenades: [],
  // Strahl: gibt {t, type, ped/veh}
  castRay(ox, oy, oz, dx, dy, dz, maxD, ignorePed = null, ignoreVeh = null) {
    const ts = TR.rayStatic(ox, oy, oz, dx, dy, dz, maxD);
    let best = { t: Math.min(ts, maxD), type: ts < maxD ? 'world' : 'none' };
    const gt = dy < -0.001 ? (oy - TR.groundHeight(ox + dx * 20, oz + dz * 20)) / -dy : Infinity; // grob: Boden
    if (gt < best.t && gt > 0) best = { t: gt, type: 'ground' };
    const hp = rayPed(ox, oy, oz, dx, dy, dz, best.t, ignorePed); if (hp && hp.t < best.t) best = { t: hp.t, type: 'ped', ped: hp.ped, y: hp.y };
    const hv = rayVeh(ox, oy, oz, dx, dy, dz, best.t, ignoreVeh); if (hv && hv.t < best.t) best = { t: hv.t, type: 'veh', veh: hv.veh };
    // Mitspieler (PvP): senkrechte Kapsel bzw. Kugel um Fahrzeuge
    if (G.remoteTargets && (!ignorePed || ignorePed === G.player)) {
      const hl2 = dx * dx + dz * dz || 1e-6;
      for (const r of G.remoteTargets()) {
        const px = r.x - ox, pz = r.z - oz, t = (px * dx + pz * dz) / hl2; if (t <= 0 || t >= best.t) continue;
        const hx = px - dx * t, hz = pz - dz * t, yy = oy + dy * t - r.y, rad = r.veh ? 1.5 : 0.45, top = r.veh ? 2.0 : 1.9;
        if (Math.hypot(hx, hz) < rad && yy > -0.1 && yy < top) best = { t, type: 'rplayer', rp: r, y: yy };
      }
    }
    // Spieler als Ziel (für NPC-Schützen)
    const pl = G.player;
    if (pl && pl !== ignorePed && !pl.vehicle && pl.alive) {
      const px = pl.pos.x - ox, pz = pl.pos.z - oz, t = px * dx + pz * dz;
      if (t > 0 && t < best.t) { const hx = px - dx * t, hz = pz - dz * t; if (Math.hypot(hx, hz) < 0.45 && oy + dy * t > pl.pos.y - 0.1 && oy + dy * t < pl.pos.y + 1.9) best = { t, type: 'player' }; }
    }
    return best;
  },
  // Schuss von shooter (Player oder Ped). origin/dir Vector3
  fire(shooter, origin, dir, wid, aimPoint = null, muzzle = null) {
    const w = WEAPONS[wid]; if (!w) return;
    const isPlayer = shooter === G.player;
    const pellets = w.pellets || 1;
    emit('gunshot', origin.x, origin.z, shooter, w);
    if (G.audio) G.audio.gun(w.sound || 'pistol', origin);
    if (muzzle) FX.flash(muzzle);
    const skill = isPlayer ? 1 - (G.profile.skills ? G.profile.skills.shooting * 0.35 : 0) : 1;
    for (let i = 0; i < pellets; i++) {
      const sp = (w.spread || 0.01) * (isPlayer ? skill * (shooter.aiming ? 0.6 : 1.3) * (shooter.moving ? 1.4 : 1) : (shooter.spreadMul || 1.6));
      _v.set(dir.x + rr(-sp, sp), dir.y + rr(-sp, sp), dir.z + rr(-sp, sp)).normalize();
      const hit = this.castRay(origin.x, origin.y, origin.z, _v.x, _v.y, _v.z, w.range, isPlayer ? null : shooter, null);
      const end = new THREE.Vector3(origin.x + _v.x * hit.t, origin.y + _v.y * hit.t, origin.z + _v.z * hit.t);
      FX.tracer(muzzle ? muzzle : origin, end);
      const dmg = w.explosive ? 5 : w.dmg * (isPlayer ? 1 : 0.55);
      if (w.explosive) this.explode(end.x, end.y, end.z, w.blast || 9, w.dmg, shooter);
      if (hit.type === 'ped') { const head = hit.y > 1.55; hit.ped.hurt(dmg, shooter, head, { x: _v.x, z: _v.z }); if (isPlayer) emit('hitmarker', head); if (isPlayer && hit.ped.role === 'civ') emit('crime', 'shoot_ped', hit.ped.pos, hit.ped); }
      else if (hit.type === 'rplayer') { const head = hit.y > 1.55 && !hit.rp.veh; FX.sparks(end.x, end.y, end.z, 4, -_v.x, -_v.z); if (G.multiHit) G.multiHit(hit.rp, (w.explosive ? 5 : w.dmg) * (head ? 1.8 : 1), head, w.id); emit('hitmarker', head); }
      else if (hit.type === 'player') { G.player.damage(dmg, shooter.pos || origin); }
      else if (hit.type === 'veh') {
        const v = hit.veh; const [lx, lz] = v.localPoint(end.x, end.z);
        v.damage(dmg * 1.4, lx, lz, end.y - v.pos.y, true); FX.sparks(end.x, end.y, end.z, 4, -_v.x, -_v.z);
        if (v.hp < 120 && Math.random() < 0.15 && !v.exploded && !v.burning) v.burning = 0.01;
        if (isPlayer && v.driver && v.driver.npc) { emit('crime', 'shoot_veh', v.pos, v); }
        if (v.driver === G.player) { G.player.damage(dmg * 0.2, origin); }
        if (isPlayer) emit('hitmarker', false);
      } else if (hit.type === 'world' || hit.type === 'ground') { FX.sparks(end.x, end.y, end.z, 3, -_v.x, -_v.z); if (hit.type === 'ground') FX.dust(end.x, end.y, end.z, 0, 0); }
    }
  },
  melee(shooter, w) {
    const f = { x: Math.sin(shooter.yaw), z: Math.cos(shooter.yaw) };
    let best = null, bd = w.range;
    for (const p of G.entities.peds) {
      if (p === shooter || p.dead && p.deadAnim > 0.2) continue;
      const dx = p.pos.x - shooter.pos.x, dz = p.pos.z - shooter.pos.z, d = Math.hypot(dx, dz);
      if (d > w.range) continue; const dot = (dx * f.x + dz * f.z) / (d || 1); if (dot < 0.4) continue;
      if (d < bd) { bd = d; best = p; }
    }
    if (shooter.person) shooter.person.punch = 1;
    if (G.audio) G.audio.play('punch');
    if (best) { best.hurt(w.dmg, shooter, false, f); if (best.role === 'civ' && shooter === G.player) { emit('crime', 'assault', best.pos, best); if (Math.random() < 0.25 && !best.dead) { best.fearOf(shooter.pos, 8); } } if (!best.dead && best.role === 'civ') { best.state = 'down'; best.downT = rr(1.5, 3); } best.knock.x += f.x * 4; best.knock.z += f.z * 4; FX.sparks(best.pos.x, best.pos.y + 1.2, best.pos.z, 3); }
    else if (shooter === G.player) {
      const v = Veh.nearest(shooter.pos.x + f.x * 1.5, shooter.pos.z + f.z * 1.5, 2.2);
      if (v && w.id === 'bat') { v.damage(8, 0, 0); FX.sparks(v.pos.x, v.pos.y + 1, v.pos.z, 4); }
    }
  },
  throwGrenade(shooter, pos, dir) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x4a5a3a }));
    G.scene.add(m);
    this.grenades.push({ mesh: m, pos: pos.clone(), vel: new THREE.Vector3(dir.x * 15, dir.y * 15 + 4, dir.z * 15), t: 2.4, owner: shooter });
    emit('gunshot', pos.x, pos.z, shooter, WEAPONS.grenade);
  },
  update(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t -= dt; g.vel.y -= 22 * dt;
      g.pos.addScaledVector(g.vel, dt);
      const gh = TR.groundHeight(g.pos.x, g.pos.z) + 0.06;
      if (g.pos.y < gh) { g.pos.y = gh; g.vel.y *= -0.35; g.vel.x *= 0.6; g.vel.z *= 0.6; }
      const p = { x: g.pos.x, z: g.pos.z }; if (TR.resolveCircle(p, 0.1, g.pos.y)) { g.vel.x *= -0.4; g.vel.z *= -0.4; g.pos.x = p.x; g.pos.z = p.z; }
      g.mesh.position.copy(g.pos); g.mesh.rotation.x += dt * 8;
      if (g.t <= 0) { this.explode(g.pos.x, g.pos.y, g.pos.z, 9, 200, g.owner); G.scene.remove(g.mesh); this.grenades.splice(i, 1); }
    }
  },
  explode(x, y, z, radius, damage, source) {
    FX.explosion(x, y, z, radius > 10 ? 1.3 : 1);
    emit('explosion', x, y, z, radius, damage, source);
  },
};
// Explosion: Schaden an allem im Radius
on('explosion', (x, y, z, radius, damage, source) => {
  for (const p of G.entities.peds) {
    if (p.dead) continue; const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d > radius * 1.2) continue;
    const f = 1 - d / (radius * 1.2); p.hurt(damage * f * 1.2, source, false, { x: (p.pos.x - x) / (d || 1), z: (p.pos.z - z) / (d || 1) }); p.knock.x += (p.pos.x - x) / (d || 1) * 10 * f; p.knock.z += (p.pos.z - z) / (d || 1) * 10 * f;
    if (!p.dead && p.role === 'civ') { p.state = 'down'; p.downT = 4; }
  }
  for (const v of G.entities.vehicles) {
    if (v === source && v.exploded) continue; const d = Math.hypot(v.pos.x - x, v.pos.z - z); if (d > radius * 1.6) continue;
    const f = 1 - d / (radius * 1.6);
    if (v.kind === 'plane' || v.kind === 'heli') { v.damage(damage * f * 3); } else v.damage(damage * f * 5, 0, 0, 0.8);
    const dx = (v.pos.x - x) / (d || 1), dz = (v.pos.z - z) / (d || 1);
    v.vel.x += dx * 9 * f; v.vel.z += dz * 9 * f; if (v.kind === 'car' || v.kind === 'bike') { v.vy = Math.max(v.vy, 4 * f); v.pos.y += 0.05; v.angVel += rr(-1.5, 1.5) * f; }
    if (v.hp < 150 && !v.exploded) v.burning = Math.max(v.burning, 0.01);
  }
  if (G.remoteTargets && (source === G.player || (source && source.driver === G.player))) { // Explosion trifft Mitspieler
    for (const r of G.remoteTargets()) { const d = Math.hypot(r.x - x, r.z - z); if (d < radius * 1.2) G.multiHit(r, damage * (1 - d / (radius * 1.2)) * 0.6, false, 'explosion'); }
  }
  const pl = G.player;
  if (pl && pl.alive) { const d = Math.hypot(pl.pos.x - x, pl.pos.z - z); if (d < radius * 1.2 && !(pl.vehicle && pl.vehicle === source)) { const f = 1 - d / (radius * 1.2); pl.damage(damage * f * 0.6, { x, y, z }); if (!pl.vehicle) { pl.knock.x += (pl.pos.x - x) / (d || 1) * 9 * f; pl.knock.z += (pl.pos.z - z) / (d || 1) * 9 * f; } } }
  if (G.audio) G.audio.explosion(x, y, z);
  G.camShake = Math.max(G.camShake || 0, clamp(1 - Math.hypot(G.camera.position.x - x, G.camera.position.z - z) / 60, 0, 1) * 1.2);
  if (source === G.player || (source && source.driver === G.player)) emit('crime', 'explosion', { x, y, z }, null);
});
