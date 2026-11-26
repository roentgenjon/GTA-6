// Missionssystem: Story, Zwischensequenzen, Ziele
import * as THREE from 'three';
import { G, emit, on } from './game.js?v=20261126142831-8986ff1';
import { Veh } from './vehicles.js?v=20261126142831-8986ff1';
import { Peds, Ped } from './peds.js?v=20261126142831-8986ff1';
import { randomLook } from './persons.js?v=20261126142831-8986ff1';
import { Markers } from './markers.js?v=20261126142831-8986ff1';
import { city } from './city.js?v=20261126142831-8986ff1';
import * as TR from './terrain.js?v=20261126142831-8986ff1';
import { P, R } from './terrain.js?v=20261126142831-8986ff1';
import { DriverAI } from './traffic.js?v=20261126142831-8986ff1';
import { Combat } from './combat.js?v=20261126142831-8986ff1';
import { Police } from './police.js?v=20261126142831-8986ff1';
import { Eco } from './profile.js?v=20261126142831-8986ff1';
import { CamCtl } from './player.js?v=20261126142831-8986ff1';
import { OUTFITS } from './persons.js?v=20261126142831-8986ff1';
import { clamp, rr, angDiff, fmtMoney, pick } from './util.js?v=20261126142831-8986ff1';
import { BY_ID } from './catalog.js?v=20261126142831-8986ff1';
import { FX } from './effects.js?v=20261126142831-8986ff1';
import { ISLAND_POS } from './terrain.js?v=20261126142831-8986ff1';

const poi = (id) => city.sites[id] || city.pois.find((p) => p.id === id);
export const snapRoad = (x, z) => { // Fahrbahnpunkt (rechte Spur) nahe x,z
  const k = Math.round(x / P), l = Math.round(z / P), dx = Math.abs(x - k * P), dz = Math.abs(z - l * P);
  if (dx < dz) return { x: k * P + 3.5, z, yaw: 0 }; return { x, z: l * P + 3.5, yaw: Math.PI / 2 };
};
export const nearestNode = (x, z) => ({ x: Math.round(x / P) * P, z: Math.round(z / P) * P });

// ---------- Gegner-KI ----------
function enemyBrain(p, dt) {
  const pl = G.player; p.stateT += dt;
  if (!pl || !pl.alive) { p.moveSpeed = 0; p.aim = false; return; }
  const dx = pl.pos.x - p.pos.x, dz = pl.pos.z - p.pos.z, d = Math.hypot(dx, dz);
  if (p.passive && d > 40 && !p.alerted) { p.moveSpeed = 0; p.aim = false; return; }
  const los = d < 60 && TR.rayStatic(p.pos.x, 1.5, p.pos.z, dx / d, 0, dz / d, d) >= d - 0.5;
  if (los || d < 25) p.alerted = true;
  if (!p.alerted) { p.moveSpeed = 0; p.aim = false; return; }
  p.faceLock = false;
  if (p.weapon === 'melee') { p.moveX = dx / d; p.moveZ = dz / d; p.moveSpeed = d > 1.4 ? 5 : 0; p.aim = false; p.fireT -= dt; if (d < 1.8 && p.fireT <= 0) { p.fireT = 1; pl.damage(10, p.pos); p.person.punch = 1; } return; }
  if (los && d < 45) {
    p.aim = true; p.faceLock = true; p.faceYaw = Math.atan2(dx, dz); p.yaw = p.faceYaw;
    p.strafe = p.strafe || (Math.random() < 0.5 ? 1 : -1); if (p.stateT % 3 < dt) p.strafe = -p.strafe;
    const want = 14;
    if (d > want + 5) { p.moveX = dx / d; p.moveZ = dz / d; p.moveSpeed = 3.8; } else if (d < want - 4) { p.moveX = -dx / d; p.moveZ = -dz / d; p.moveSpeed = 2.5; } else { p.moveX = dz / d * p.strafe; p.moveZ = -dx / d * p.strafe; p.moveSpeed = 1.6; }
    p.fireT -= dt;
    if (p.fireT <= 0) { p.fireT = 0.35 + rr(0.1, 0.7) / (p.accuracy + 0.3); const org = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z); const tgt = new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.vehicle ? 0.8 : 1.1), pl.pos.z); const dir = tgt.sub(org).normalize(); Combat.fire(p, org, dir, p.gunId || 'pistol', null, org.clone().addScaledVector(dir, 0.6)); p.person.shoot = 1; }
  } else { p.aim = false; p.moveX = dx / d; p.moveZ = dz / d; p.moveSpeed = 4.8; if (TR.rayStatic(p.pos.x, 1, p.pos.z, p.moveX, 0, p.moveZ, 2.5) < 2.5) { const a = Math.atan2(p.moveX, p.moveZ) + 1.0; p.moveX = Math.sin(a); p.moveZ = Math.cos(a); } }
}
export function spawnEnemy(x, z, gun = 'pistol', opts = {}) {
  const p = Peds.spawnAt(x, z, 'enemy', randomLook('thug')); p.role = 'enemy'; p.hp = p.maxHp = opts.hp || 70; p.cash = 80; p.brain = enemyBrain; p.gunId = gun === 'melee' ? null : gun; p.weapon = gun; p.setGun(gun === 'melee' ? null : gun); p.accuracy = opts.acc || 0.4; p.spreadMul = 2.0 - (opts.acc || 0.4); p.persistent = true; p.passive = !!opts.passive; p.noRemove = true; p.name = 'Gegner';
  const q = { x: p.pos.x, z: p.pos.z }; TR.resolveCircle(q, 0.4, 0); p.pos.x = q.x; p.pos.z = q.z;
  return p;
}

// ---------- Flucht-KI Zielfahrzeug ----------
export function makeFleeing(v, speed = 22) {
  const n = nearestNode(v.pos.x, v.pos.z); const k = Math.round(n.x / P), l = Math.round(n.z / P);
  v.driver = { npc: true, mission: true }; v.isTraffic = false; v.keep = true; v.isMission = true;
  const dirs = []; for (let d = 0; d < 4; d++) if (TR.edgeExists(k, l, d)) dirs.push(d);
  const ai = new DriverAI(v, k, l, dirs.length ? pick(dirs) : 0); ai.flee = true; ai.ignoreLights = true; ai.limit = speed; ai.aggr = 1; v.ai = ai;
  v.yaw = Math.atan2(TR.DIRS[ai.d][0], TR.DIRS[ai.d][1]);
  return v;
}

// ---------- Missions-Engine ----------
export const Missions = {
  active: null, defs: [], dialog: null, completed: () => G.profile.story.done, ctx: null, failedReason: null, timer: null,
  isDone(id) { return G.profile.story.done.includes(id); },
  available() { return this.defs.filter((d) => !this.isDone(d.id) && (!d.after || this.isDone(d.after))); },
  start(id) {
    const def = this.defs.find((d) => d.id === id); if (!def || this.active) return;
    const m = { def, i: -1, ents: [], veh: {}, peds: [], markers: [], text: '', sub: '', timer: null, start: G.clock, data: {}, cp: null };
    this.active = m; G.profile.story.current = id;
    m.steps = def.build(m);
    G.hudMission = { title: def.title, text: '' };
    emit('missionStart', def); emit('toast', '🎯 ' + def.title);
    if (G.audio) G.audio.play('ok');
    this.next();
  },
  next() {
    const m = this.active; if (!m) return;
    if (m.step && m.step.exit) m.step.exit(m);
    m.i++;
    if (m.i >= m.steps.length) { this.complete(); return; }
    m.step = m.steps[m.i]; m.text = m.step.text || m.text; if (m.step.timer) m.timer = G.clock + m.step.timer;
    if (m.step.enter) m.step.enter(m);
    emit('objective', m.text);
  },
  setMarker(m, x, z, type = 'obj', extra = {}) { const mk = Markers.add({ x, z, type, tag: 'mission', ...extra }); m.markers.push(mk); return mk; },
  update(dt) {
    const m = this.active; if (!m) return;
    const pl = G.player;
    if (m.step && m.step.tick) { if (m.step.tick(m, dt)) this.next(); }
    // Zeitlimit
    if (m.timer && G.clock > m.timer) { this.fail('Zeit abgelaufen!'); return; }
    if (m.def.failIfDead !== false && !pl.alive) this.fail('Du bist gestorben.');
  },
  cleanup(m) {
    Markers.clear('mission');
    for (const v of m.ents) { if (v.ai && v.ai.dispose) v.ai.dispose(); if (G.entities.vehicles.includes(v) && !v.driver?.isPlayer && !v.ownRec) { v.isMission = false; v.keep = false; if (Veh.list.includes(v)) { v.isParked = true; v.despawnT = 20; } } }
    for (const p of m.peds) { p.noRemove = false; p.persistent = false; if (!p.dead) p.despawn = 12; }
    G.profile.flags.missionNoWanted = false;
    G.hudMission = null; G.mission = null; m.timer = null;
  },
  complete() {
    const m = this.active, d = m.def; this.cleanup(m); this.active = null;
    if (!G.profile.story.done.includes(d.id)) G.profile.story.done.push(d.id); G.stats.missions++;
    G.profile.story.current = null;
    if (d.reward) Eco.earn(d.reward, 'Mission');
    if (d.give) d.give();
    G.ui && G.ui.missionPassed(d);
    if (G.audio) G.audio.play('win');
    emit('missionComplete', d);
    if (d.onComplete) d.onComplete();
    Save_auto();
  },
  fail(reason) {
    const m = this.active; if (!m) return; const d = m.def;
    if (G.state === 'cutscene') G.ui && G.ui.endCutscene();
    this.cleanup(m); this.active = null; G.profile.story.current = null;
    G.ui && G.ui.missionFailed(d, reason); if (G.audio) G.audio.play('fail'); emit('missionFailed', d);
  },
  abort() { const m = this.active; if (!m) return; this.cleanup(m); this.active = null; G.profile.story.current = null; emit('toast', 'Mission abgebrochen'); if (G.state === 'cutscene') G.ui.endCutscene(); },
  // Missionsstarter-Marker
  refreshMarkers() {
    Markers.clear('start');
    if (this.active) return;
    for (const d of this.available()) { const p = typeof d.giver === 'string' ? poi(d.giver) : d.giver; if (!p) continue; Markers.add({ x: p.x, z: p.z, type: 'mission', tag: 'start', label: d.title, icon: d.letter || 'M', def: d, r: 1.5, show: 220 }); }
  },
};
function Save_auto() { try { G.autosave && G.autosave(); } catch (e) { } }

// ---------- Schritt-Bausteine ----------
const S = {
  say(lines, cam) {
    return {
      text: '', enter(m) { G.ui.startCutscene(lines, cam, m); m.lineIdx = 0; }, tick(m) { return G.ui.cutsceneDone; }, exit() { G.ui.endCutscene(); },
    };
  },
  goto(x, z, text, opt = {}) {
    return { text, enter(m) { m.mk = Missions.setMarker(m, typeof x === 'function' ? x().x : x, typeof z === 'function' ? x().z : z, 'obj', { r: opt.r || 2.5 }); if (typeof x === 'function') { const p = x(); m.mk.x = p.x; m.mk.z = p.z; } }, tick(m) { const pl = G.player, mk = m.mk; if (opt.veh && !pl.vehicle) return false; if (opt.foot && pl.vehicle) return false; return Math.hypot(pl.pos.x - mk.x, pl.pos.z - mk.z) < (opt.r || 4.5); }, exit(m) { Markers.remove(m.mk); } };
  },
  vehicle(key, id, x, z, yaw, opt = {}) {
    return { text: '', enter(m) { const v = Veh.spawn(id, x, z, yaw, { c1: opt.c1, c2: opt.c2 }); v.isMissionVehicle = true; v.keep = true; v.isMission = true; v.parked = true; if (opt.hp) v.hp = opt.hp; m.veh[key] = v; m.ents.push(v); if (opt.flee) makeFleeing(v, opt.speed || 22); }, tick() { return true; } };
  },
  enter(key, text) {
    return { text, enter(m) { m.blip = Missions.setMarker(m, 0, 0, 'obj', { r: 2, h: 14 }); }, tick(m) { const v = m.veh[key], pl = G.player; if (!v || v.wreck) { Missions.fail('Das Fahrzeug wurde zerstört.'); return false; } m.blip.x = v.pos.x; m.blip.z = v.pos.z; m.blip.y = v.pos.y; return pl.vehicle === v; }, exit(m) { Markers.remove(m.blip); } };
  },
  deliver(key, x, z, text, opt = {}) {
    return { text, enter(m) { m.mk = Missions.setMarker(m, x, z, 'obj', { r: 3.5 }); m.hp0 = opt.minHp || 0; }, tick(m) { const v = m.veh[key], pl = G.player; if (!v || v.wreck) { Missions.fail('Das Fahrzeug wurde zerstört.'); return false; } if (opt.minHp && v.hp < opt.minHp) { Missions.fail('Das Fahrzeug ist zu stark beschädigt.'); return false; } if (pl.vehicle !== v) { m.text = 'Steig zurück ins Fahrzeug.'; m.mk.hidden = true; if (!m.blipv) m.blipv = Missions.setMarker(m, 0, 0, 'obj', { h: 14, r: 2 }); m.blipv.x = v.pos.x; m.blipv.z = v.pos.z; m.blipv.hidden = false; emit('objective', m.text); return false; } if (m.blipv) m.blipv.hidden = true; m.mk.hidden = false; if (m.text !== text) { m.text = text; emit('objective', text); } return Math.hypot(v.pos.x - x, v.pos.z - z) < 7 && Math.abs(v.speed) < 8; }, exit(m) { Markers.remove(m.mk); if (m.blipv) Markers.remove(m.blipv); } };
  },
  kill(spawn, text, opt = {}) {
    return {
      text, enter(m) { m.enemies = spawn(m); m.enemies.forEach((e) => { m.peds.push(e); }); m.eb = m.enemies.map((e) => Missions.setMarker(m, e.pos.x, e.pos.z, 'enemy', { h: 3, r: 0.6, show: 200 })); },
      tick(m) { let alive = 0; m.enemies.forEach((e, i) => { if (!e.dead) { alive++; m.eb[i].x = e.pos.x; m.eb[i].z = e.pos.z; m.eb[i].hidden = false; } else m.eb[i].hidden = true; }); if (m.text !== text + ` (${alive})`) { m.text = text + ` (${alive})`; emit('objective', m.text); } return alive === 0; },
      exit(m) { m.eb.forEach((b) => Markers.remove(b)); },
    };
  },
  destroy(key, text) {
    return { text, enter(m) { m.mk = Missions.setMarker(m, 0, 0, 'enemy', { h: 12, r: 1.5 }); }, tick(m) { const v = m.veh[key]; if (!v) return true; m.mk.x = v.pos.x; m.mk.z = v.pos.z; m.mk.y = v.pos.y; if (v.wreck) return true; const pl = G.player; if (Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) > 420) { Missions.fail('Das Ziel ist entkommen!'); } return false; }, exit(m) { Markers.remove(m.mk); } };
  },
  wanted(level, text) { return { text, enter(m) { Police.crime('theft', G.player.pos, null); G.profile.flags.missionNoWanted = false; Police.heat = Math.max(Police.heat, [0, 6, 18, 40, 70, 110][level]); Police.level = level; Police.seen = true; emit('wantedUp', level); }, tick() { return true; } }; },
  lose(text) { return { text, enter(m) { }, tick() { return Police.level === 0; } }; },
  wait(sec, text) { return { text, enter(m) { m.t0 = G.clock; }, tick(m) { return G.clock - m.t0 > sec; } }; },
  weather(type, hour) { return { text: '', enter() { G.weather.forced = type; G.weather.set(type); if (hour != null) G.hour = hour; }, tick() { return true; } }; },
  free() { return { text: '', enter() { G.weather.forced = null; }, tick() { return true; } }; },
  run(fn) { return { text: '', enter(m) { fn(m); }, tick() { return true; } }; },
  outfit(id, text) { return { text, enter(m) { m.mk = Missions.setMarker(m, poi('clothes1').x, poi('clothes1').z, 'obj', { r: 2.5 }); }, tick() { return G.profile.look.outfit === id; }, exit(m) { Markers.remove(m.mk); } }; },
  interact(x, z, text, onDo) { return { text, enter(m) { m.mk = Missions.setMarker(m, x, z, 'obj', { r: 2.5 }); m.done = false; G.interactHook = { x, z, label: text, fn: () => { m.done = true; if (onDo) onDo(m); } }; }, tick(m) { return m.done; }, exit(m) { Markers.remove(m.mk); G.interactHook = null; } }; },
  rings(list, text, key) {
    return {
      text, enter(m) { m.ring = 0; m.rings = list.map((r) => Markers.add({ x: r[0], z: r[2], y: r[1] - 6, type: 'ring', tag: 'mission', r: 6, h: 12, show: 3000 })); m.mk = m.rings[0]; },
      tick(m) { const v = G.player.vehicle; if (!v) { return false; } const r = list[m.ring]; const d = Math.hypot(v.pos.x - r[0], v.pos.y - r[1], v.pos.z - r[2]); if (d < 22) { m.ring++; if (G.audio) G.audio.play('ok'); m.rings[m.ring - 1].hidden = true; if (m.ring >= list.length) return true; emit('objective', `Fliege durch die Ringe (${m.ring}/${list.length})`); } return false; },
      exit(m) { m.rings.forEach((r) => Markers.remove(r)); },
    };
  },
  collect(x, z, text, y) { return { text, enter(m) { m.mk = Missions.setMarker(m, x, z, 'obj', { r: 2 }); }, tick(m) { const pl = G.player; return Math.hypot(pl.pos.x - x, pl.pos.z - z) < 3 && (y == null || Math.abs(pl.pos.y - y) < 6); }, exit(m) { Markers.remove(m.mk); } }; },
  setWanted0() { return { text: '', enter() { Police.setLevel(0); }, tick() { return true; } }; },
  give(fn) { return { text: '', enter() { fn(); }, tick() { return true; } }; },
  failIf(cond, msg) { return { text: '', enter() { }, tick(m) { if (cond(m)) Missions.fail(msg); return false; } }; },
};
export { S };

// =====================================================================
// STORY
// =====================================================================
const AIR = { x: -1660, z: 220 };
function giver(id) { return () => poi(id); }
const D = (title, id, after, giverId, reward, build, extra = {}) => ({ id, title, after, giver: giverId, reward, build, ...extra });
const cam = (x, y, z, lx, ly, lz) => ({ pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) });
const around = (p, a, d, h = 2.2) => ({ pos: new THREE.Vector3(p.x + Math.sin(a) * d, (p.y || 0) + h, p.z + Math.cos(a) * d), look: new THREE.Vector3(p.x, (p.y || 0) + 1.5, p.z) });
const roadSpot = (x, z) => snapRoad(x, z);

export function defineMissions() {
  const L = [];
  // ---- 1
  L.push(D('Willkommen zurück', 'm1', null, { x: AIR.x + 12, z: AIR.z + 5 }, 500, (m) => {
    const sp = { x: AIR.x + 30, z: AIR.z + 20 };
    return [
      S.run(() => { G.player.teleport(AIR.x + 10, AIR.z, Math.PI / 2); G.weather.forced = 'clear'; G.weather.set('clear', true); G.hour = 9.2; }),
      S.run((m) => { const pl = G.player; const look = randomLook('civ'); Object.assign(look, { female: true, hair: 4, hairColor: 0x3b2a1a, top: 1, topColor: 0xff6b9a, bottom: 0, bottomColor: 0x2c3e66, shoe: 0, shoeColor: 0xf0f0f0, hat: 0, glasses: true, skin: 0xe0ac69 }); const p = Peds.spawnAt(pl.pos.x + 1.4, pl.pos.z + 1.2, 'civ', look); p.persistent = true; p.noRemove = true; p.name = 'Mia'; p.brain = (pp) => { pp.moveSpeed = 0; pp.faceLock = true; pp.faceYaw = Math.atan2(pl.pos.x - pp.pos.x, pl.pos.z - pp.pos.z); pp.yaw = pp.faceYaw; }; m.peds.push(p); m.mia = p; }),
      S.say([
        { who: 'Mia', text: 'Sieh dir das an, Leo. Vice City. Fünf Jahre, und es sieht immer noch aus wie ein Werbeprospekt.' },
        { who: 'Leo', text: 'Ein Prospekt mit Zähnen. Wir haben nichts, Mia. Kein Geld, keine Kontakte.' },
        { who: 'Mia', text: 'Dante schuldet dir einen Gefallen. Seine Werkstatt ist in Neon District. Dort wartet ein Wagen auf dich.' },
        { who: 'Leo', text: 'Dann fangen wir an. Und diesmal ohne Fehler.' },
      ], around({ x: AIR.x + 10, z: AIR.z }, 0.8, 5)),
      S.run((m) => { if (m.mia) { m.mia.brain = null; m.mia.noRemove = false; m.mia.state = 'walk'; m.mia.despawn = 15; } }),
      S.vehicle('car', 'sedan_2', AIR.x + 34, AIR.z - 6, Math.PI / 2, { c1: 0x9a2a2a, c2: null }),
      S.enter('car', 'Steig in den Wagen (F)'),
      S.goto(() => poi('dante'), null, 'Fahre zu Dante\'s Autoteile', { r: 6, veh: true }),
      S.say([
        { who: 'Dante', text: 'Leo Marquez! Ich dachte, die hätten dich für immer behalten.' },
        { who: 'Leo', text: 'Gute Führung, Dante. Hast du Arbeit?' },
        { who: 'Dante', text: 'Immer. Aber lass uns nicht zu laut reden. Komm morgen wieder – oder besser, komm gleich wieder. Ich habe einen Auftrag am Hafen.' },
      ], null),
    ];
  }, { letter: 'L', give: () => { emit('toast', '📱 Neue Mission bei Dante verfügbar'); } }));
  // fix giver for m1: auf Flughafen
  L[0].giver = { x: AIR.x + 12, z: AIR.z + 5 };
  // ---- 2
  L.push(D('Erste Lieferung', 'm2', 'm1', 'dante', 1200, (m) => {
    const sp = roadSpot(poi('portgarage').x - 50, poi('portgarage').z - 38);
    return [
      S.say([{ who: 'Dante', text: 'Am Hafen steht ein Pickup. Bring ihn zu Turbo Garage, ohne Kratzer. Der Besitzer legt Wert auf Pflege.' }, { who: 'Leo', text: 'Ein Pickup. Wie aufregend.' }], null),
      S.goto(() => ({ x: sp.x, z: sp.z }), null, 'Fahre zum Hafen', { r: 15 }),
      S.vehicle('pu', 'pickup_2', sp.x, sp.z - 6, sp.yaw, { c1: 0x2a6bb0 }),
      S.enter('pu', 'Steig in den Pickup'),
      S.deliver('pu', poi('tuning').x, poi('tuning').z, 'Bringe den Pickup zu Turbo Garage (nicht beschädigen!)', { minHp: 600 }),
      S.give(() => { }),
    ];
  }, { letter: 'D' }));
  L[1].steps_time = 240;
  // ---- 3
  L.push(D('Schutzgeld', 'm3', 'm2', 'dante', 1800, (m) => {
    const bar = poi('marina_bar');
    return [
      S.say([{ who: 'Dante', text: 'Ein paar Jungs am Marina-Bar kassieren in meinem Revier. Zeig ihnen, dass das ein Fehler war.' }, { who: 'Leo', text: 'Wie viele?' }, { who: 'Dante', text: 'Vier. Hier – eine Pistole und Munition.' }], null),
      S.give(() => { G.player.addWeapon('pistol', 48); G.player.setWeapon('pistol'); emit('toast', '🔫 Pistole erhalten'); }),
      S.goto(() => ({ x: bar.x - 8, z: bar.z }), null, 'Fahre zur Marina Bar', { r: 40 }),
      S.kill((m) => [0, 1, 2, 3].map((i) => spawnEnemy(bar.x - 10 - i * 2.2, bar.z + (i - 1.5) * 4, i === 0 ? 'melee' : 'pistol', { acc: 0.3 })), 'Schalte die Schläger aus'),
      S.say([{ who: 'Leo', text: 'Erledigt. Das Revier gehört wieder Dante.' }], null),
    ];
  }, { letter: 'D' }));
  // ---- 4
  L.push(D('Heiße Ware', 'm4', 'm3', 'dante', 4000, (m) => {
    const vl = poi('mansion'); const sp = { x: vl.x + 8, z: vl.z + 22 };
    return [
      S.say([{ who: 'Dante', text: 'Ein Kunde will einen Sportwagen. In der Auffahrt der Starlight-Villa steht genau der richtige. Hol ihn – die Polizei wird nicht begeistert sein.' }], null),
      S.goto(() => ({ x: sp.x, z: sp.z - 6 }), null, 'Fahre zur Starlight-Villa', { r: 30 }),
      S.vehicle('sc', 'sport_8', sp.x, sp.z, Math.PI, { c1: 0xe8c200, flee: false }),
      S.enter('sc', 'Stiehl den Sportwagen'),
      S.wanted(2, 'Entkomme der Polizei!'),
      S.lose('Entkomme der Polizei (Fahndung verlieren)'),
      S.deliver('sc', poi('portgarage').x, poi('portgarage').z + 10, 'Bringe den Wagen zur Hafen-Lagerhalle'),
    ];
  }, { letter: 'D' }));
  // ---- 5
  L.push(D('Der Mann mit dem Plan', 'm5', 'm4', 'mission_g', 2500, (m) => {
    return [
      S.say([{ who: 'Vance', text: 'Du bist also der Junge, von dem Dante schwärmt. Ich brauche Männer mit Stil. Kauf dir einen Anzug bei Threadz – ich spendiere dir die Rechnung.' }, { who: 'Leo', text: 'Ein Anzug. Natürlich.' }], null),
      S.give(() => { Eco.earn(1300, 'Vance Vorschuss'); }),
      S.outfit('suit', 'Kaufe und trage den Business-Anzug bei Threadz Fashion'),
      S.goto(() => poi('casino'), null, 'Fahre zum Golden Flamingo Casino', { r: 7 }),
      S.say([{ who: 'Vance', text: 'Gut siehst du aus. Nächste Woche haben wir ein Ding am Laufen. Bis dahin: Bleib sauber.' }], null),
    ];
  }, { letter: 'V' }));
  // ---- 6
  L.push(D('Goldener Flamingo', 'm6', 'm5', 'casino', 3200, (m) => {
    const cs = poi('casino');
    return [
      S.say([{ who: 'Vance', text: 'Im Tresor des Casinos liegt eine Aktentasche mit unseren Papieren. Hol sie – aber die Security ist nervös.' }], null),
      S.goto(() => ({ x: cs.bx, z: cs.bz + 34 }), null, 'Gehe zur Aktentasche beim Casino', { r: 4, foot: true }),
      S.kill((m) => [0, 1, 2, 3, 4].map((i) => spawnEnemy(cs.bx + (i - 2) * 8, cs.bz + 44 + (i % 2) * 5, i % 2 ? 'smg' : 'pistol', { acc: 0.35 })), 'Schalte die Wachen aus'),
      S.wanted(2, 'Verlasse das Gebiet'),
      S.lose('Verliere die Polizei'),
    ];
  }, { letter: 'V' }));
  // ---- 7
  L.push(D('Flugstunde', 'm7', 'm6', 'story_airport', 3000, (m) => {
    const ax = -1950, az = 120;
    return [
      S.say([{ who: 'Kenji', text: 'Du brauchst eine Fluglizenz? Vergiss es. Flieg einfach durch die Ringe, und lande danach. Die Maschine gehört dir – für heute.' }], null),
      S.vehicle('pl', 'cessna', -1850, 100, 0, { c1: 0xf0f0f0 }),
      S.enter('pl', 'Steige in das Flugzeug (Shift = Gas, W/S = Neigung, A/D = Rollen)'),
      S.rings([[-1950, 60, 420], [-1950, 90, 800], [-1700, 140, 1000], [-1400, 180, 800], [-1500, 200, 420], [-1700, 160, 120], [-1950, 100, -150], [-1950, 40, 20]], 'Fliege durch die Ringe (1/8)'),
      S.goto(() => ({ x: ax, z: 20 }), null, 'Lande auf der Landebahn', { r: 40 }),
    ];
  }, { letter: 'K', giver: { x: -1655, z: 200 } }));
  // ---- 8
  L.push(D('Hafenrazzia', 'm8', 'm7', 'portgarage', 3500, (m) => {
    const port = poi('portgarage');
    return [
      S.say([{ who: 'Vance', text: 'Die Rattlesnakes lagern Ware am Hafen. Räum auf und sprenge ihren Lastwagen.' }], null),
      S.goto(() => ({ x: port.bx - 40, z: port.bz + 60 }), null, 'Fahre zum Hafen', { r: 60 }),
      S.vehicle('tr', 'truck_2', port.bx - 40, port.bz + 52, 0, { c1: 0xaa2222 }),
      S.kill((m) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => spawnEnemy(port.bx - 55 + (i % 4) * 9, port.bz + 55 + Math.floor(i / 4) * 8, i % 3 === 0 ? 'smg' : 'pistol', { acc: 0.38 })), 'Erledige die Rattlesnakes'),
      S.destroy('tr', 'Sprenge den Lastwagen!'),
    ];
  }, { letter: 'V' }));
  // ---- 9
  L.push(D('Der Verräter', 'm9', 'm8', 'mission_g', 5000, (m) => {
    const sp = roadSpot(poi('mission_g').x + 90, poi('mission_g').z + 60);
    return [
      S.weather('rain'),
      S.say([{ who: 'Vance', text: 'Rico hat uns verraten. Er fährt gerade durch die Stadt – ein schwarzer Muscle Car. Hol ihn von der Straße, bevor er redet.' }], null),
      S.vehicle('rico', 'muscle_3', sp.x, sp.z, sp.yaw, { c1: 0x111111, flee: true, speed: 21 }),
      S.destroy('rico', 'Zerstöre Ricos Wagen!'),
      S.free(),
    ];
  }, { letter: 'V' }));
  // ---- 10
  L.push(D('Der große Coup', 'm10', 'm9', 'bank', 50000, (m) => {
    const bk = poi('bank');
    return [
      S.say([{ who: 'Vance', text: 'Die Vice Savings & Trust. Fünfzig Riesen im Tresor. Zwei Minuten, dann kommen die Cops. Du hast die Fahrt. Ich zähl auf dich.' }, { who: 'Mia', text: 'Pass auf dich auf, Leo.' }], null),
      S.vehicle('van', 'van_3', bk.x + 10, bk.z - 36, 0, { c1: 0x222222 }),
      S.goto(() => ({ x: bk.x, z: bk.z }), null, 'Gehe zur Bank', { r: 3.5, foot: true }),
      S.say([{ who: 'Leo', text: 'Alle runter! Das ist ein Überfall!' }], null),
      S.run(() => { Eco.earn(0); }),
      S.kill((m) => [0, 1, 2].map((i) => spawnEnemy(bk.x + (i - 1) * 6, bk.z - 8 + 3, 'pistol', { acc: 0.3 })), 'Überwältige die Bankwächter'),
      S.wanted(4, 'Fliehe mit dem Transporter!'),
      S.enter('van', 'Steige in den Fluchtwagen'),
      S.lose('Verliere die Polizei (Fahndungsstufe 4!)'),
    ];
  }, { letter: 'V' }));
  // ---- 11
  L.push(D('Sturm auf See', 'm11', 'm10', 'marina_bar', 8000, (m) => {
    const isl = ISLAND_POS, marina = { x: 1262, z: -20 };
    return [
      S.weather('storm', 22.5),
      S.say([{ who: 'Vance', text: 'Die Ware liegt auf Isla Corazón. Bei diesem Wetter fährt keine Fähre. Nimm das Boot. Viel Glück.' }], null),
      S.vehicle('bt', 'sp_boat3', 1255, -70, -Math.PI / 2, { c1: 0xe8e8e8 }),
      S.enter('bt', 'Steige in das Boot'),
      S.collect(isl.x - 120, isl.z - 100, 'Fahre zur Insel Isla Corazón und hole das Paket', 0),
      S.deliver('bt', marina.x - 12, marina.z, 'Bringe das Paket zurück zur Marina'),
      S.free(),
    ];
  }, { letter: 'V' }));
  // ---- 12
  L.push(D('Vice City', 'm12', 'm11', 'penthouse', 100000, (m) => {
    const pt = poi('penthouse');
    return [
      S.say([{ who: 'Mia', text: 'Vance will uns beide loswerden, Leo. Er wartet im Penthouse.' }, { who: 'Leo', text: 'Dann überrasche ich ihn.' }], null),
      S.goto(() => ({ x: pt.bx, z: pt.bz + 40 }), null, 'Fahre zum Skyline Penthouse', { r: 30 }),
      S.kill((m) => Array.from({ length: 10 }, (_, i) => spawnEnemy(pt.bx - 36 + i * 8, pt.bz + 46 + (i % 3) * 6, i % 2 ? 'rifle' : 'smg', { acc: 0.42 })), 'Schalte Vances Leibwächter aus'),
      S.vehicle('heli', 'heli_news', pt.bx, pt.bz, 0, { c1: 0x111111 }),
      S.run((m) => { const v = m.veh.heli; v.pos.set(pt.bx, TR.groundHeight(pt.bx, pt.bz) + 95, pt.bz); v.rotorSpin = 1; v.isMission = true; v.driver = { npc: true, mission: true }; v.ai = { control(dt) { const I = v.input; const t = G.clock; const tx = pt.bx - 700 - Math.sin(t * 0.1) * 100, tz = pt.bz - 900; I.pitch = -0.55; I.roll = 0; const want = Math.atan2(tx - v.pos.x, tz - v.pos.z); I.yaw = clamp(-angDiff(v.yaw, want) * 2, -1, 1); I.lift = clamp((TR.groundHeight(v.pos.x, v.pos.z) + 110 - v.pos.y) * 0.15, -1, 1); } }; }),
      S.destroy('heli', 'Vance flieht im Hubschrauber – schieß ihn ab!'),
      S.say([{ who: 'Mia', text: 'Es ist vorbei, Leo. Vice City gehört uns.' }, { who: 'Leo', text: 'Nein, Mia. Es gehört denen, die den Mut haben, es sich zu nehmen. Das war erst der Anfang.' }], null),
    ];
  }, { letter: 'F', onComplete: () => { G.ui && G.ui.showCredits(); } }));
  Missions.defs = L;
  // Zusatz-Giver
  const fix = { m6: 'casino' };
  Missions.defs.find((d) => d.id === 'm7').giver = { x: -1655, z: 200 };
  // String-Giver zu POI auflösen
  for (const d of Missions.defs) if (typeof d.giver === 'string') { const id = d.giver; Object.defineProperty(d, 'giver', { get() { const p = poi(id); return p ? { x: p.x, z: p.z } : { x: 0, z: 0 }; }, configurable: true }); }
  Missions.defs[1].timeLimit = 0;
}
on('wantedLost', () => { });
