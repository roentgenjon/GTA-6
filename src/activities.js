// Nebenaktivitäten: Rennen, Taxi, Lieferjobs, zufällige Ereignisse, Stunts, Herausforderungen
import * as THREE from 'three';
import { G, emit, on } from './game.js?v=20261126142831-8986ff1';
import { Veh } from './vehicles.js?v=20261126142831-8986ff1';
import { Peds } from './peds.js?v=20261126142831-8986ff1';
import { randomLook } from './persons.js?v=20261126142831-8986ff1';
import { Markers } from './markers.js?v=20261126142831-8986ff1';
import { city } from './city.js?v=20261126142831-8986ff1';
import * as TR from './terrain.js?v=20261126142831-8986ff1';
import { P, K, R } from './terrain.js?v=20261126142831-8986ff1';
import { Eco } from './profile.js?v=20261126142831-8986ff1';
import { Missions, spawnEnemy, makeFleeing, snapRoad } from './missions.js?v=20261126142831-8986ff1';
import { clamp, rr, angDiff, pick, fmtMoney, ri } from './util.js?v=20261126142831-8986ff1';
import { BY_ID } from './catalog.js?v=20261126142831-8986ff1';
import { World } from './world.js?v=20261126142831-8986ff1';

// ---------------- Rennen ----------------
const N = (k, l) => ({ x: k * P, z: l * P });
export const RACES = [
  { id: 'r1', name: 'Downtown Sprint', start: { k: -2, l: 0, off: 48 }, nodes: [[1, 0], [1, 3], [-2, 3], [-2, 0]], laps: 1, reward: [2500, 1500, 800], rating: 'leicht' },
  { id: 'r2', name: 'Beach Run', start: { k: 8, l: -3, off: 48 }, nodes: [[11, -3], [11, 3], [8, 3], [8, -3], [11, -3], [11, 3]], laps: 1, reward: [3500, 2000, 1000], rating: 'mittel' },
  { id: 'r3', name: 'Industrie-Jagd', start: { k: -6, l: 7, off: 48 }, nodes: [[-2, 7], [-2, 10], [-6, 10], [-6, 7], [-2, 7]], laps: 1, reward: [3000, 1800, 900], rating: 'mittel' },
  { id: 'r4', name: 'Villen-Grand-Prix', start: { k: 3, l: -8, off: 48 }, nodes: [[6, -8], [6, -5], [3, -5], [3, -8], [6, -8], [6, -5]], laps: 1, reward: [5000, 3000, 1500], rating: 'schwer' },
  { id: 'r5', name: 'Stadtrundfahrt', start: { k: 0, l: -6, off: 48 }, nodes: [[4, -6], [4, 4], [-4, 4], [-4, -6], [0, -6]], laps: 1, reward: [7000, 4000, 2000], rating: 'extrem' },
];
const raceStartPos = (r) => ({ x: r.start.k * P + r.start.off, z: r.start.l * P + 3.5 });

class RaceAI {
  constructor(v, path, skill) { this.v = v; this.path = path; this.i = 0; this.skill = skill; this.stuck = 0; this.rev = 0; }
  control(dt) {
    const v = this.v, I = v.input; if (v.wreck) return; if (G.race && G.race.state !== 'go') { I.throttle = 0; I.brake = 0.5; I.handbrake = true; return; } I.handbrake = false;
    const tgt = this.path[this.i]; const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d < 14 + Math.abs(v.speed) * 0.35) { this.i = Math.min(this.path.length - 1, this.i + 1); G.race && (G.race.progress.get(v).cp = this.i); }
    const err = angDiff(v.yaw, Math.atan2(dx, dz));
    I.steer = clamp(err * 2.0, -1, 1);
    let top = v.maxV * 0.84 * this.skill;
    // Rubber-Band
    const pl = G.player, r = G.race; if (r) { const me = r.dist(v), pd = r.dist(pl.vehicle || { pos: pl.pos }); if (me > pd + 120) top *= 0.88; else if (me < pd - 80) top *= 1.06; }
    const next = this.path[Math.min(this.i + 1, this.path.length - 1)]; const turn = Math.abs(angDiff(Math.atan2(dx, dz), Math.atan2(next.x - tgt.x, next.z - tgt.z)));
    if (turn > 0.6 && d < 50) top = Math.min(top, 16); if (Math.abs(err) > 0.5) top = Math.min(top, 12);
    const diff = top - v.speed;
    if (this.rev > 0) { this.rev -= dt; I.throttle = 0; I.brake = 1; I.steer = -I.steer; }
    else { I.throttle = diff > 0 ? clamp(diff * 0.5, 0, 1) : 0; I.brake = diff < -3 ? 0.6 : 0; }
    if (Math.abs(v.speed) < 1 && G.race && G.race.state === 'go') { this.stuck += dt; if (this.stuck > 1.5) { this.rev = 1.1; this.stuck = 0; } } else this.stuck = 0;
  }
}

function buildRoute(race) {
  const pts = []; let cur = { x: race.start.k * P, z: race.start.l * P };
  const seq = []; for (let lap = 0; lap < race.laps; lap++) for (const [k, l] of race.nodes) seq.push(N(k, l));
  const cps = [];
  for (const target of seq) { const r = TR.routeBetween(cur.x, cur.z, target.x, target.z); for (let i = 1; i < r.length; i++) pts.push({ x: r[i][0], z: r[i][1] }); cps.push(pts.length - 1); cur = target; }
  return { pts, cps, seq };
}

export const Race = {
  start(race) {
    const pl = G.player; if (!pl.vehicle || pl.vehicle.kind !== 'car' && pl.vehicle.kind !== 'bike') { emit('toast', '🚗 Du brauchst ein Fahrzeug für das Rennen.'); return; }
    if (Missions.active || G.race) return;
    const route = buildRoute(race); const sp = raceStartPos(race);
    const v = pl.vehicle; v.pos.set(sp.x, TR.groundHeight(sp.x, sp.z), sp.z); v.yaw = Math.PI / 2; v.vel.set(0, 0, 0); v.angVel = 0; v.speed = 0;
    const r = { def: race, state: 'countdown', t: 3.99, route, cp: 0, started: 0, rivals: [], progress: new Map(), done: false, markers: [] };
    // Rivalen
    const rivalIds = ['sport_5', 'sport_9', 'sport_12', 'muscle_5', 'super_3'];
    for (let i = 0; i < 3; i++) {
      const spec = BY_ID[rivalIds[i + (race.rating === 'extrem' ? 2 : 0)]] || BY_ID.sport_1;
      const x = sp.x - 9 - i * 7, z = sp.z + (i % 2 ? 3.5 : -3.5) * 0 + (i % 2 ? 3 : -3) * 0 + (i - 1) * 3.3;
      const rv = Veh.spawn(spec, x, sp.z + (i - 1) * 3.2, Math.PI / 2, {}); rv.isMission = true; rv.keep = true; rv.driver = { npc: true, race: true }; rv.ai = new RaceAI(rv, route.pts, 0.9 + i * 0.035 + (race.rating === 'schwer' ? 0.04 : 0) + (race.rating === 'extrem' ? 0.07 : 0)); rv.isRival = true; r.rivals.push(rv); r.progress.set(rv, { cp: 0 });
    }
    r.progress.set(v, { cp: 0 });
    r.dist = (veh) => { const pr = r.progress.get(veh) || { cp: 0 }; const idx = pr.cp; const t = route.pts[Math.min(idx, route.pts.length - 1)]; return idx * 1000 - Math.hypot(t.x - veh.pos.x, t.z - veh.pos.z); };
    G.race = r; G.profile.flags.missionNoWanted = true;
    r.mk = Markers.add({ x: route.seq[0].x, z: route.seq[0].z, type: 'race', tag: 'race', r: 5, show: 3000 });
    emit('raceStart', r);
  },
  update(dt) {
    const r = G.race; if (!r) return; const pl = G.player, v = pl.vehicle;
    if (r.state === 'countdown') { r.t -= dt; if (v) { v.input.throttle = 0; v.input.handbrake = true; } if (r.t <= 0) { r.state = 'go'; r.started = G.clock; emit('raceGo'); } return; }
    if (!v || v.wreck || !pl.alive) { if (!v || !pl.vehicle) { r.abandonT = (r.abandonT || 0) + dt; if (r.abandonT > 12) this.end(false, 'Rennen verlassen'); } return; } r.abandonT = 0;
    const cps = r.route.cps; const tgt = r.route.seq[r.cp];
    r.mk.x = tgt.x; r.mk.z = tgt.z;
    if (Math.hypot(v.pos.x - tgt.x, v.pos.z - tgt.z) < 18) { r.cp++; r.progress.get(v).cp = cps[r.cp - 1] || 0; if (r.cp >= r.route.seq.length) { this.finish(); return; } if (G.audio) G.audio.play('blip'); }
    else { const idx = r.progress.get(v); const nextCp = cps[r.cp]; // Fortschritt über Route schätzen
      let best = idx.cp; for (let i = idx.cp; i < Math.min(r.route.pts.length, idx.cp + 12); i++) { if (Math.hypot(r.route.pts[i].x - v.pos.x, r.route.pts[i].z - v.pos.z) < 20) best = i; } idx.cp = best; }
    // Rivalen am Ziel?
    for (const rv of r.rivals) { const pr = r.progress.get(rv); if (pr.cp >= r.route.pts.length - 1 && !pr.fin) { pr.fin = G.clock; } }
    // Position
    const all = [v, ...r.rivals]; all.sort((a, b) => r.dist(b) - r.dist(a)); r.place = all.indexOf(v) + 1;
  },
  finish() {
    const r = G.race; const t = G.clock - r.started; const place = r.place || 1; const rev = r.def.reward[place - 1] || 0;
    G.profile.side.races[r.def.id] = Math.min(G.profile.side.races[r.def.id] || 1e9, t);
    if (place === 1) G.stats.wins++; if (rev) Eco.earn(rev, 'Rennen');
    emit('raceEnd', place, t, rev); this.end(true);
  },
  end(ok, why) { const r = G.race; if (!r) return; for (const rv of r.rivals) { if (rv.ai) rv.ai = null; rv.driver = null; rv.isMission = false; rv.isParked = true; rv.parked = true; rv.despawnT = 20; rv.input.handbrake = true; } Markers.remove(r.mk); G.race = null; G.profile.flags.missionNoWanted = false; if (why) emit('toast', why); if (G.player.vehicle) G.player.vehicle.input.handbrake = false; },
  markers() { Markers.clear('racestart'); for (const r of RACES) { const sp = raceStartPos(r); Markers.add({ x: sp.x, z: sp.z, type: 'race', tag: 'racestart', label: r.name, icon: '🏁', race: r, r: 2.5, show: 160 }); } },
};

// ---------------- Taxi ----------------
export const Taxi = {
  job: null,
  toggle() { const pl = G.player; const v = pl.vehicle; if (!v || v.spec.special !== 'taxi') { return; } if (this.job) { this.end('Taxi-Dienst beendet'); return; } if (Missions.active || G.race) return; this.newFare(); emit('toast', '🚕 Taxi-Dienst gestartet'); },
  newFare() { const pl = G.player; for (let t = 0; t < 20; t++) { const k = ri(-9, 9), l = ri(-9, 9); if (!TR.nodeExists(k, l)) continue; const x = k * P + 11, z = l * P + 11; if (Math.hypot(x - pl.pos.x, z - pl.pos.z) < 100 || Math.hypot(x - pl.pos.x, z - pl.pos.z) > 600) continue; const ped = Peds.spawnAt(x, z, 'civ'); ped.state = 'idle'; ped.persistent = true; ped.noRemove = true; ped.walkSpeed = 0; ped.brain = (p, dt) => { p.moveSpeed = 0; p.person.animate; }; const mk = Markers.add({ x, z, type: 'obj', tag: 'taxi', r: 2.5, h: 20 }); this.job = { stage: 'pickup', ped, mk, x, z, t0: G.clock }; emit('objective', 'Hole den Fahrgast ab'); return; } },
  update(dt) {
    const j = this.job; if (!j) return; const pl = G.player, v = pl.vehicle;
    if (G.mission || Missions.active) { this.end('Taxi-Dienst beendet'); return; }
    if (!v || v.spec.special !== 'taxi') { j.away = (j.away || 0) + dt; if (j.away > 30) this.end('Taxi-Dienst abgebrochen'); return; } j.away = 0;
    if (v.wreck) { this.end('Taxi zerstört'); return; }
    if (j.stage === 'pickup') { if (Math.hypot(v.pos.x - j.x, v.pos.z - j.z) < 8 && Math.abs(v.speed) < 4) { j.ped.group.visible = false; j.ped.dead = true; j.ped.noRemove = false; j.ped.deadAnim = 100; Markers.remove(j.mk); let dx, dz; for (let t = 0; t < 30; t++) { const k = ri(-10, 10), l = ri(-10, 10); if (!TR.nodeExists(k, l)) continue; dx = k * P + 11; dz = l * P + 11; if (Math.hypot(dx - v.pos.x, dz - v.pos.z) > 500) break; } j.dest = { x: dx, z: dz }; j.mk = Markers.add({ x: dx, z: dz, type: 'obj', tag: 'taxi', r: 3, h: 30 }); j.stage = 'drive'; j.t0 = G.clock; j.dist = Math.hypot(dx - v.pos.x, dz - v.pos.z); emit('objective', 'Bringe den Fahrgast zum Ziel'); emit('toast', '🚕 "Ins Zentrum bitte, aber schnell!"'); } }
    else if (j.stage === 'drive') { if (Math.hypot(v.pos.x - j.dest.x, v.pos.z - j.dest.z) < 9 && Math.abs(v.speed) < 5) { const t = G.clock - j.t0; const fare = Math.round(j.dist * 0.9 + Math.max(0, j.dist / 14 - t) * 6 + 60); Eco.earn(fare, 'Taxi'); G.profile.side.taxi++; Markers.remove(j.mk); this.job = null; emit('toast', `🚕 Fahrt beendet: ${fmtMoney(fare)}`); setTimeout(() => { if (G.player.vehicle && G.player.vehicle.spec.special === 'taxi') Taxi.newFare(); }, 2500); } }
  },
  end(msg) { const j = this.job; if (!j) return; if (j.mk) Markers.remove(j.mk); if (j.ped && !j.ped.dead) { j.ped.noRemove = false; j.ped.persistent = false; j.ped.brain = null; } this.job = null; if (msg) emit('toast', msg); emit('objective', ''); },
};

// ---------------- Lieferjob ----------------
export const Delivery = {
  job: null,
  start(poiO) {
    if (this.job || Missions.active || G.race) return; const pl = G.player;
    this.job = { n: 0, total: 3, t: G.clock, limit: 0, mk: null, from: poiO }; this.next(); emit('toast', '🍔 Lieferjob gestartet – liefere 3 Bestellungen!');
  },
  next() { const j = this.job, pl = G.player; for (let t = 0; t < 30; t++) { const k = ri(-8, 8), l = ri(-8, 8); if (!TR.nodeExists(k, l)) continue; const x = k * P + (Math.random() < 0.5 ? 9 : -9), z = l * P + 9; const d = Math.hypot(x - pl.pos.x, z - pl.pos.z); if (d < 200 || d > 650) continue; if (j.mk) Markers.remove(j.mk); j.mk = Markers.add({ x, z, type: 'obj', tag: 'delivery', r: 3, h: 25 }); j.x = x; j.z = z; j.limit = G.clock + d / 6 + 25; j.t0 = G.clock; emit('objective', `Liefere Bestellung ${j.n + 1}/${j.total}`); return; } },
  update(dt) {
    const j = this.job; if (!j) return; const pl = G.player;
    if (Missions.active) { this.end('Lieferjob abgebrochen'); return; }
    if (G.clock > j.limit) { this.end('⏱ Zeit abgelaufen – Lieferjob beendet'); return; }
    if (Math.hypot(pl.pos.x - j.x, pl.pos.z - j.z) < 5) { j.n++; const tip = Math.round(Math.max(0, (j.limit - G.clock)) * 2); Eco.earn(150 + tip, 'Lieferung'); G.profile.side.deliveries++; if (j.n >= j.total) { Eco.earn(300, 'Bonus'); this.end('✅ Lieferjob abgeschlossen!'); } else this.next(); }
  },
  end(msg) { const j = this.job; if (!j) return; if (j.mk) Markers.remove(j.mk); this.job = null; if (msg) emit('toast', msg); emit('objective', ''); },
};

// ---------------- Zufällige Ereignisse ----------------
export const Events = {
  timer: 120, cur: null,
  update(dt) {
    const pl = G.player; if (!pl) return;
    if (this.cur) { this.cur.t -= dt; this.cur.tick(dt); if (this.cur.t <= 0 || this.cur.done) this.end(); return; }
    if (Missions.active || G.race || Taxi.job || Delivery.job || G.state !== 'play' || Police.level > 0) return;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = rr(150, 260); this.spawn(); }
  },
  end() { const e = this.cur; if (!e) return; if (e.cleanup) e.cleanup(); Markers.clear('event'); this.cur = null; },
  spawn() {
    const pl = G.player; if (!(pl.pos.x > -1100 && pl.pos.x < 1150 && pl.pos.z > -1100 && pl.pos.z < 1150)) return;
    const kind = pick(['thief', 'fugitive', 'robbery']);
    const k = clamp(Math.round(pl.pos.x / P) + ri(-2, 2), -10, 10), l = clamp(Math.round(pl.pos.z / P) + ri(-2, 2), -10, 10); if (!TR.nodeExists(k, l)) return;
    const x = k * P + 11, z = l * P + 11;
    if (kind === 'thief') {
      const p = Peds.spawnAt(x, z, 'civ'); p.cash = 450; p.persistent = true; p.noRemove = true; p.walkSpeed = 6; p.fearOf(pl.pos, 90); p.fear = 90; p.name = 'Dieb'; p.moveSpeed = 6;
      const mk = Markers.add({ x, z, type: 'enemy', tag: 'event', h: 6, r: 0.8, show: 400 }); emit('toast', '💰 Ein Dieb ist mit einer Handtasche geflohen! Fang ihn! (Markierung auf der Karte)');
      this.cur = { t: 120, tick: () => { mk.x = p.pos.x; mk.z = p.pos.z; if (p.dead) { this.cur.done = true; Eco.earn(300, 'Dieb gefasst'); emit('toast', '✅ Dieb gestoppt'); } }, cleanup: () => { p.noRemove = false; p.persistent = false; } };
    } else if (kind === 'fugitive') {
      const sp = snapRoad(x, z); const v = Veh.spawn(pick(['sport_3', 'sport_10', 'muscle_2']), sp.x, sp.z, sp.yaw, {}); makeFleeing(v, 20); v.isMission = true;
      const mk = Markers.add({ x: sp.x, z: sp.z, type: 'enemy', tag: 'event', h: 14, r: 1.4, show: 400 }); emit('toast', '🚨 Flüchtiger Verbrecher! Zerstöre sein Fahrzeug (+$800)');
      this.cur = { t: 150, tick: () => { mk.x = v.pos.x; mk.z = v.pos.z; if (v.wreck) { this.cur.done = true; Eco.earn(800, 'Verbrecher gestoppt'); } }, cleanup: () => { if (G.entities.vehicles.includes(v)) { v.isMission = false; v.isParked = true; v.ai = null; v.driver = null; v.despawnT = 20; v.input.handbrake = true; } } };
    } else {
      const en = [0, 1, 2].map((i) => spawnEnemy(x + i * 2, z + 2, i ? 'pistol' : 'smg', { acc: 0.3 }));
      const mk = Markers.add({ x, z, type: 'enemy', tag: 'event', h: 20, r: 3, show: 400 }); emit('toast', '🔫 Überfall im Gange! Schalte die Räuber aus (+$700)');
      this.cur = { t: 150, tick: () => { if (en.every((e) => e.dead)) { this.cur.done = true; Eco.earn(700, 'Überfall gestoppt'); } }, cleanup: () => { en.forEach((e) => { e.noRemove = false; e.persistent = false; if (!e.dead) e.despawn = 10; }); } };
    }
  },
};

// ---------------- Stunts ----------------
const stuntSeen = new Set();
on('jumpDone', (d, airT) => {
  const v = G.player.vehicle; if (!v || d < 18 || airT < 0.9) return;
  const jumps = World.jumps || []; let near = -1, best = 1e9;
  jumps.forEach((j, i) => { const dd = Math.hypot(j.x - v.pos.x, j.z - v.pos.z); if (dd < best) { best = dd; near = i; } });
  if (best > Math.max(120, d * 2)) { if (d > 35) { Eco.earn(150, 'Weitsprung'); emit('toast', `Sprung ${d} m`); } return; }
  const first = !G.profile.side.stunts[near]; G.profile.side.stunts[near] = Math.max(G.profile.side.stunts[near] || 0, d);
  const rew = first ? 1500 : 200; Eco.earn(rew, 'Stunt'); emit('toast', `🏍️ Stunt-Sprung ${d} m ${first ? '(neu!)' : ''} +${fmtMoney(rew)}`);
  G.profile.skills.driving = Math.min(1, G.profile.skills.driving + 0.01);
});

// ---------------- Herausforderungen ----------------
export const CHALLENGES = [
  { id: 'c1', name: 'Drift-König', desc: 'Erreiche 800 Drift-Punkte am Stück', cur: () => G.stats.driftBest, goal: 800, reward: 5000 },
  { id: 'c2', name: 'Weitspringer', desc: 'Springe 60 Meter mit einem Fahrzeug', cur: () => G.stats.maxJump, goal: 60, reward: 6000 },
  { id: 'c3', name: 'Stuntmaster', desc: 'Finde 5 Stunt-Rampen', cur: () => Object.keys(G.profile.side.stunts).length, goal: 5, reward: 8000 },
  { id: 'c4', name: 'Rennfahrer', desc: 'Gewinne 3 Rennen', cur: () => G.stats.wins, goal: 3, reward: 7500 },
  { id: 'c5', name: 'Vielfahrer', desc: 'Fahre 20 km mit Fahrzeugen', cur: () => G.stats.vdist / 1000, goal: 20, reward: 5000 },
  { id: 'c6', name: 'Marathon', desc: 'Laufe 5 km zu Fuß', cur: () => G.stats.dist / 1000, goal: 5, reward: 3000 },
  { id: 'c7', name: 'Taxifahrer', desc: 'Schließe 5 Taxi-Fahrten ab', cur: () => G.profile.side.taxi, goal: 5, reward: 4000 },
  { id: 'c8', name: 'Lieferheld', desc: 'Schließe 6 Lieferungen ab', cur: () => G.profile.side.deliveries, goal: 6, reward: 3500 },
  { id: 'c9', name: 'Autodieb', desc: 'Stiehl 10 Fahrzeuge', cur: () => G.stats.stolen, goal: 10, reward: 4500 },
  { id: 'c10', name: 'Fahndungs-Flüchtling', desc: 'Lasse dich 10-mal verfolgen (Verbrechen begehen)', cur: () => G.stats.crimes, goal: 10, reward: 2500 },
  { id: 'c11', name: 'Korbleger', desc: 'Triff 10 Körbe beim Basketball', cur: () => G.profile.side.hoops, goal: 10, reward: 3000 },
  { id: 'c12', name: 'Glückspilz', desc: 'Gewinne 5-mal an den Spielautomaten', cur: () => G.profile.side.slots, goal: 5, reward: 6000 },
];
export function claimChallenge(c) { const cl = G.profile.flags.claimed || (G.profile.flags.claimed = {}); if (cl[c.id] || c.cur() < c.goal) return false; cl[c.id] = true; Eco.earn(c.reward, 'Herausforderung'); emit('toast', `🏆 ${c.name} abgeschlossen!`); return true; }
import { Police } from './police.js?v=20261126142831-8986ff1';
