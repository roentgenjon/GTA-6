// Einstieg: Initialisierung, Spielschleife, Interaktion, Respawn, Cheats
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G, emit, on } from './game.js';
import { Sky, Weather, Rain } from './sky.js';
import { buildWorld, updateWorld, World } from './world.js';
import * as TR from './terrain.js';
import { FX } from './effects.js';
import { Veh } from './vehicles.js';
import { Peds } from './peds.js';
import { Traffic } from './traffic.js';
import { Player, Input, CamCtl } from './player.js';
import { Combat } from './combat.js';
import { Police } from './police.js';
import { Audio } from './audio.js';
import { Markers } from './markers.js';
import { Missions, defineMissions, snapRoad } from './missions.js';
import { Race, Taxi, Delivery, Events, RACES } from './activities.js';
import { newProfile, Save, Eco } from './profile.js';
import { UI } from './ui.js';
import { city } from './city.js';
import { SITES } from './sites.js';
import { BY_ID, CATALOG } from './catalog.js';
import { clamp, rr, fmtMoney, lerp } from './util.js';
import { WEAPON_ORDER, WEAPONS } from './weapons.js';

const QUALITY = {
  low: { pr: 1, shadow: 1024, bloom: false, traffic: 14, peds: 26, parked: 10, terrain: 'low' },
  medium: { pr: 1.25, shadow: 2048, bloom: false, traffic: 22, peds: 40, parked: 18, terrain: 'high' },
  high: { pr: 1.5, shadow: 2048, bloom: true, traffic: 30, peds: 55, parked: 26, terrain: 'high' },
  ultra: { pr: 2, shadow: 4096, bloom: true, traffic: 40, peds: 70, parked: 34, terrain: 'high' },
};
const TIPS = ['Tipp: Mit der Handbremse (Leertaste) lassen sich Autos gezielt driften.', 'Tipp: Nach einem Verbrechen hilft es, außer Sichtweite zu fahren und das Auto zu wechseln.', 'Tipp: Gelbe Rampen bringen Stunt-Prämien.', 'Tipp: Kaufe Immobilien, um Fahrzeuge zu speichern.', 'Tipp: Regen macht Straßen rutschig – fahr vorsichtig!', 'Tipp: Mit F steigst du auch in Boote, Flugzeuge und Hubschrauber.', 'Tipp: Setze einen Wegpunkt auf der Karte (M) für eine GPS-Route.'];

let renderer, scene, camera, composer, bloom, cinePass, outPass, sky, rain, lampLights = [], headSpot, clockT = 0, last = performance.now(), saveTimer = 0, speedBlur = 0;
let loaded = false, started = false;

const CineShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uVig: { value: 0.4 }, uTime: { value: 0 }, uAspect: { value: 1 }, uWet: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur,uVig,uTime,uAspect,uWet; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
  void main(){ vec2 d = vUv-0.5; float r = length(d*vec2(uAspect,1.0));
    vec3 col = vec3(0.0); const int N=8; for(int i=0;i<N;i++){ float t=float(i)/float(N); col += texture2D(tDiffuse, vUv - d*uBlur*t*0.14).rgb; } col/=float(N);
    float ca = 0.0012 + uBlur*0.0015; col.r = mix(col.r, texture2D(tDiffuse, vUv - d*ca*2.0).r, 0.6); col.b = mix(col.b, texture2D(tDiffuse, vUv + d*ca*2.0).b, 0.6);
    float l = dot(col, vec3(0.299,0.587,0.114)); col = mix(vec3(l), col, 1.08);
    col = mix(col, col*vec3(1.04,1.0,0.95), 0.4);
    col *= 1.0 - uVig*smoothstep(0.35,1.0,r*1.15);
    col += (hash(vUv*vec2(1920.0,1080.0)+uTime)-0.5)*0.025;
    gl_FragColor = vec4(col,1.0); }`,
};

// ---------------- Setup ----------------
async function boot() {
  UI.init();
  Save.loadSettings();
  G.quality = QUALITY[G.settings.quality] || QUALITY.high;
  UI.setLoading(0.05, 'Renderer wird gestartet …');
  const canvas = document.getElementById('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, G.quality.pr)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = G.settings.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.4, 7000);
  G.scene = scene; G.camera = camera; G.renderer = renderer; G.weather = new Weather(); G.hour = 17.2; G.weather.set('clear', true); G.terrainY = TR.groundHeight;
  const step = (p, t) => new Promise((r) => { UI.setLoading(p, t); setTimeout(r, 30); });
  await step(0.1, 'Himmel & Beleuchtung …');
  sky = new Sky(scene, renderer); G.sky = sky; sky.setShadowRes(G.quality.shadow);
  await step(0.2, 'Stadt wird generiert … ' + TIPS[Math.floor(Math.random() * TIPS.length)]);
  buildWorld(scene, sky, G.quality.terrain);
  await step(0.55, 'Effekte, Marker & Missionen …');
  FX.init(scene); Markers.init(scene); Peds.init(); rain = new Rain(scene);
  defineMissions();
  // Lampenlicht
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffd9a0, 0, 34, 2); scene.add(l); lampLights.push(l); }
  headSpot = new THREE.SpotLight(0xfff0d0, 0, 90, 0.5, 0.6, 1.2); scene.add(headSpot); scene.add(headSpot.target);
  await step(0.7, 'Karte wird gezeichnet …');
  UI.buildMap();
  await step(0.9, 'Nachbearbeitung …');
  setupComposer();
  Input.init(canvas);
  // Spieler Platzhalter (für Titelhintergrund)
  G.profile = newProfile(); G.player = new Player(); G.player.teleport(120, -20);
  G.player.group.visible = false;
  Race.markers(); Missions.refreshMarkers();
  window.addEventListener('resize', onResize);
  on('pause', () => { if (G.state === 'play') UI.openMenu('map'); });
  on('playerDied', onDied); on('busted', onBusted);
  on('missionComplete', () => { Missions.refreshMarkers(); }); on('missionFailed', () => { Missions.refreshMarkers(); });
  G.autosave = () => { if (started) Save.save(); };
  window.addEventListener('beforeunload', () => { if (started && G.state !== 'menu') { try { Save.serialize(); const r = Save.serialize(); localStorage.setItem('vicecity_save_v1', JSON.stringify(r)); } catch (e) { } } });
  document.addEventListener('keydown', (e) => { if (e.code === 'KeyR' && G.state === 'play' && G.player.vehicle) { const st = Audio.nextStation(1); UI.radioShow(st); } if (e.code === 'KeyT' && G.state === 'play') Taxi.toggle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') emit('pause'); });
  UI.setLoading(1, 'Bereit.');
  loaded = true;
  window.__gameReady = true;
  if (new URLSearchParams(location.search).has('autostart')) { G.startNew(); }
  else UI.showTitle();
  G.state = G.state === 'menu' || G.state === 'play' ? G.state : 'menu';
  requestAnimationFrame(loop);
}
function setupComposer() {
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: G.quality.pr > 1 ? 4 : 2 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.65, 0.86); composer.addPass(bloom);
  outPass = new OutputPass(); composer.addPass(outPass);
  cinePass = new ShaderPass(CineShader); composer.addPass(cinePass);
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); cinePass.uniforms.uAspect.value = innerWidth / innerHeight; }
}
G.applySettings = (k) => {
  const s = G.settings; G.quality = QUALITY[s.quality] || QUALITY.high;
  if (k === 'quality' || k === 'shadows') { renderer.setPixelRatio(Math.min(window.devicePixelRatio, G.quality.pr)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = s.shadows; sky.setShadowRes(G.quality.shadow); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); } scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); if (k === 'quality') UI.toast('Qualität geändert (Gelände-Detail nach Neuladen)'); }
  if (k === 'volume' || k === 'music') Audio.setVolumes();
  if (k === 'fov') { camera.fov = s.fov; camera.updateProjectionMatrix(); }
};

// ---------------- Spielstart ----------------
function resetWorld() {
  Veh.clear(); for (const p of [...Peds.list]) Peds.remove(p); Markers.items.length = 0; Police.setLevel(0); Police.heat = 0; Police.busted = false;
  if (Missions.active) Missions.abort(); Missions.active = null; G.race = null; Taxi.job = null; Delivery.job = null; Events.cur = null;
  for (const c of Peds.cashDrops) scene.remove(c.mesh); Peds.cashDrops.length = 0;
}
function spawnWorldVehicles() {
  // Flugzeuge, Hubschrauber, Boote
  for (const s of World.spawns.planes) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; v.input.handbrake = true; } }
  for (const s of World.spawns.helis) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; } }
  for (const s of World.spawns.boats) { const v = Veh.spawn(s.id, s.x, s.z, s.yaw); if (v) { v.parked = true; v.keep = true; } }
  // Ausstellungswagen
  const ds = city.dealerSpots, ids = ['super_2', 'sport_3', 'muscle_4'];
  ds.forEach((d, i) => { const v = Veh.spawn(ids[i % 3], d.x, d.z + 3, d.yaw + Math.PI); if (v) { v.parked = true; v.keep = true; v.isDisplay = true; v.input.handbrake = true; v.locked = true; } });
}
G.startNew = () => {
  Audio.init(); Audio.resume(); UI.hideTitle(); resetWorld(); G.profile = newProfile(); Object.assign(G.stats, { dist: 0, vdist: 0, kills: 0, crimes: 0, jumps: 0, driftBest: 0, wins: 0, missions: 0, stolen: 0, arrests: 0, deaths: 0, played: 0, maxJump: 0, spent: 0, earned: 0 });
  G.hour = 9.2; G.day = 1; G.weather.set('clear', true); G.weather.timer = 300;
  G.player.setLook(G.profile.look); G.player.hp = 100; G.player.armor = 0; G.player.alive = true; G.player.group.visible = true; G.player.setWeapon('fist'); G.player.revive();
  spawnWorldVehicles(); Eco.updateGarage();
  const home = city.sites['apt_beach']; G.player.teleport(-1650, 228, Math.PI / 2);
  started = true; Race.markers(); Missions.refreshMarkers();
  CamCtl.init = false; G.state = 'play'; UI.showHud(true); UI.fade(false, 800);
  Input.lock(document.getElementById('game'));
  setTimeout(() => { if (!Missions.active) Missions.start('m1'); }, 600);
};
G.continueGame = (fromPause) => {
  const s = Save.load(); if (!s) return G.startNew();
  Audio.init(); Audio.resume(); UI.hideTitle(); resetWorld();
  G.profile = Object.assign(newProfile(), s.profile); G.profile.skills = Object.assign({ shooting: 0, driving: 0, stamina: 0, flying: 0 }, s.profile.skills); G.profile.side = Object.assign(newProfile().side, s.profile.side);
  Object.assign(G.stats, s.stats); G.hour = s.hour; G.day = s.day; G.weather.set(s.weather || 'clear', true);
  G.player.setLook(G.profile.look); G.player.alive = true; G.player.revive(); G.player.group.visible = true;
  const pos = s.pos || { x: -1650, z: 228, yaw: 0 }; G.player.teleport(pos.x, pos.z, pos.yaw);
  G.player.weaponId = 'fist'; G.player.setWeapon(G.profile.weapons.pistol ? 'pistol' : 'fist');
  spawnWorldVehicles();
  for (const st of G.profile.street || []) { const rec = G.profile.garage.find((g) => g.uid === st.uid); if (rec) Eco.materialize(rec, st.x, st.z, st.yaw); }
  Eco.updateGarage();
  started = true; Race.markers(); Missions.refreshMarkers();
  if (G.profile.story.done.length === 0 && !Missions.isDone('m1') && pos.x < -1300) setTimeout(() => Missions.start('m1'), 500);
  CamCtl.init = false; G.state = 'play'; UI.showHud(true); UI.fade(false, 600); $menuHide(); Input.lock(document.getElementById('game'));
};
function $menuHide() { document.getElementById('menu').classList.add('hidden'); }
G.toTitle = () => { started = false; resetWorld(); G.player.group.visible = false; G.player.teleport(120, -20); UI.showHud(false); UI.showTitle(); UI.closeModal(); };
G.fastTravel = (x, z) => {
  UI.fade(true, 500); G.state = 'play';
  setTimeout(() => { const pl = G.player; let tx = x, tz = z; const inCity = x > -1150 && x < 1150 && z > -1150 && z < 1150; if (inCity) { const s = snapRoad(x, z); tx = s.x; tz = s.z; }
    if (pl.vehicle) { const v = pl.vehicle; v.pos.set(tx, TR.groundHeight(tx, tz), tz); v.vel.set(0, 0, 0); v.speed = 0; } else pl.teleport(tx, tz);
    Markers.setWaypoint(null); UI.route = null; UI.fade(false, 700); }, 600);
};
G.deliverVehicle = (rec) => {
  const pl = G.player; const a = pl.camYaw; let x = pl.pos.x + Math.sin(a) * 40, z = pl.pos.z + Math.cos(a) * 40;
  const inCity = x > -1150 && x < 1150 && z > -1150 && z < 1150; let yaw = a; if (inCity) { const s = snapRoad(x, z); x = s.x; z = s.z; yaw = s.yaw; }
  const old = Eco.vehicleSpawned(rec); if (old) Veh.remove(old);
  const v = Eco.materialize(rec, x, z, yaw); if (v) { v.parked = false; UI.toast('🔧 Dein ' + BY_ID[rec.id].name + ' wurde geliefert.'); }
};
G.sleep = () => { UI.fade(true, 700); setTimeout(() => { if (G.hour > 7) G.day++; G.hour = 7.0; G.player.hp = 100; Save.save(); UI.fade(false, 900); G.weather.set('clear'); }, 900); };
G.cheatCode = (c) => {
  const pl = G.player, ch = G.cheat || (G.cheat = {});
  const spawnV = (id) => { const f = pl.camForward ? pl.camForward() : { x: 0, z: 1 }; const v = Veh.spawn(id, pl.pos.x + Math.sin(pl.camYaw) * 6, pl.pos.z + Math.cos(pl.camYaw) * 6, pl.camYaw); if (v) { v.keep = true; v.parked = true; if (id === 'heli_m' || id === 'jet_l') v.pos.y += 1; } return 'Fahrzeug erschienen'; };
  switch (c) {
    case 'GELD': Eco.earn(50000); return '+$50.000';
    case 'GESUND': pl.hp = 100; pl.armor = 100; return 'Gesundheit & Rüstung voll';
    case 'ARMOR': pl.armor = 100; return 'Rüstung voll';
    case 'WAFFEN': for (const w of WEAPON_ORDER) if (w !== 'fist') { pl.addWeapon(w, (WEAPONS[w].ammoPack || 3) * 4); if (WEAPONS[w].mag) G.profile.weapons[w].mag = WEAPONS[w].mag; } return 'Alle Waffen erhalten';
    case 'FAHNDUNG': Police.setLevel(0); return 'Fahndung gelöscht';
    case 'SUCHE': Police.crime('kill_cop', pl.pos, null); return 'Fahndung erhöht';
    case 'REGEN': G.weather.set('rain'); G.weather.forced = 'rain'; return 'Regen';
    case 'STURM': G.weather.set('storm'); G.weather.forced = 'storm'; return 'Gewitter';
    case 'SONNE': G.weather.set('clear'); G.weather.forced = 'clear'; return 'Sonnig';
    case 'NEBEL': G.weather.set('fog'); G.weather.forced = 'fog'; return 'Nebel';
    case 'WETTER': G.weather.forced = null; return 'Wetter automatisch';
    case 'NACHT': G.hour = 23; return 'Nacht';
    case 'TAG': G.hour = 12; return 'Mittag';
    case 'SUNSET': G.hour = 18.9; return 'Sonnenuntergang';
    case 'GOTT': ch.god = !ch.god; return 'Gott-Modus ' + (ch.god ? 'an' : 'aus');
    case 'NOCOPS': ch.noWanted = !ch.noWanted; return 'Keine Fahndung: ' + (ch.noWanted ? 'an' : 'aus');
    case 'PANZER': return spawnV('army'); case 'FLUG': return spawnV('jet_l'); case 'AUTO': return spawnV('sport_2'); case 'SUPER': return spawnV('super_2'); case 'BOOT': return spawnV('sp_boat1'); case 'HELI': return spawnV('heli_m'); case 'BIKE': return spawnV('bike_6'); case 'BUS': return spawnV('bus_1');
    case 'SPRINT': pl.energy = 600; return 'Unbegrenzte Ausdauer (10 min)';
    default: return 'Unbekannter Code';
  }
};

// ---------------- Tod / Verhaftung ----------------
function nearestPoi(type) { let best = null, bd = 1e12; for (const p of city.pois) if (p.type === type) { const d = (p.x - G.player.pos.x) ** 2 + (p.z - G.player.pos.z) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
function onDied() {
  UI.bigMsg('WASTED', '', 'red', 4200); Audio.play('fail');
  setTimeout(() => UI.fade(true, 900), 2600);
  setTimeout(() => {
    const pl = G.player, lose = Math.min(G.profile.money, Math.round(Math.min(800, G.profile.money * 0.08)));
    G.profile.money -= lose; pl.revive(); Police.setLevel(0); Police.busted = false;
    const h = nearestPoi('hospital'); if (h) pl.teleport(h.x, h.z + 6, 0);
    UI.toast(`🏥 Krankenhaus – Behandlungskosten ${fmtMoney(lose)}`); UI.fade(false, 900); CamCtl.init = false;
  }, 3800);
}
function onBusted() {
  UI.bigMsg('BUSTED', '', 'blue', 4200); Audio.play('fail');
  setTimeout(() => UI.fade(true, 900), 2400);
  setTimeout(() => {
    const pl = G.player, lose = Math.min(G.profile.money, Math.round(G.profile.money * 0.1));
    G.profile.money -= lose; G.profile.weapons = { }; pl.setWeapon('fist'); if (pl.vehicle) pl.exitVehicle(true);
    Police.setLevel(0); Police.busted = false; Police.arrestT = 0;
    const st = nearestPoi('police'); if (st) pl.teleport(st.x, st.z + 5, 0);
    UI.toast(`👮 Verhaftet – Kaution ${fmtMoney(lose)}, Waffen beschlagnahmt`); UI.fade(false, 900); CamCtl.init = false;
    if (Missions.active) Missions.fail('Du wurdest verhaftet.');
  }, 3600);
}

// ---------------- Interaktion ----------------
const IA_TYPES = new Set(['bank', 'clothes', 'barber', 'gun', 'dealer', 'tuning', 'burger', 'casino', 'hospital', 'police', 'property', 'business', 'hoops', 'gas', 'airport', 'port']);
function updateInteract(dt) {
  const pl = G.player; if (G.state !== 'play' || !pl.alive) { UI.prompt(''); return; }
  const I = Input; const inV = !!pl.vehicle; let best = null, bd = 1e9;
  const consider = (d, label, fn) => { if (d < bd) { bd = d; best = { label, fn }; } };
  // Mission-Interaktion
  const ih = G.interactHook; if (ih) { const d = Math.hypot(ih.x - pl.pos.x, ih.z - pl.pos.z); if (d < 4) consider(d - 2, `<kbd>E</kbd> ${ih.label}`, ih.fn); }
  const R_ = inV ? 8 : 3.6;
  for (const p of city.pois) {
    if (!IA_TYPES.has(p.type)) continue;
    const d = Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z); if (d > R_) continue;
    if (inV && !['property', 'tuning', 'dealer', 'gas'].includes(p.type)) continue;
    if (inV && pl.vehicle.kind !== 'car' && pl.vehicle.kind !== 'bike') continue;
    const verb = p.type === 'property' ? (Eco.ownsProp(p.site.id) ? 'Betreten' : `Kaufen (${fmtMoney(p.site.price)})`) : p.type === 'business' ? (G.profile.owned.biz[p.site.id] ? 'Verwalten' : `Kaufen (${fmtMoney(p.site.price)})`) : 'Betreten';
    consider(d, `<kbd>E</kbd> ${verb}: ${p.name}`, () => UI.openPoi(p));
  }
  if (!inV) for (const m of Markers.items) { if (m.tag === 'start' && m.def) { const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z); if (d < 3.6) consider(d, `<kbd>E</kbd> Mission starten: <b>${m.def.title}</b>`, () => { if (Police.level > 0) { UI.toast('Verliere erst die Polizei!'); return; } Missions.start(m.def.id); }); } }
  for (const m of Markers.items) { if (m.tag === 'racestart') { const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z); if (d < 9 && inV) consider(d, `<kbd>E</kbd> Rennen: <b>${m.label}</b>`, () => { if (Police.level > 0) { UI.toast('Verliere erst die Polizei!'); return; } Race.start(m.race); }); } }
  // Fahrzeug
  if (!inV) { const v = pl.nearestVehicle(); if (v) { const d = 2.5; let txt = `<kbd>F</kbd> Einsteigen: ${v.spec.name}`; if (v.driver && v.driver.npc) txt = `<kbd>F</kbd> Fahrzeug stehlen: ${v.spec.name}`; else if (v.isDisplay || v.locked) txt = null; if (txt) consider(d + 0.5, txt, null); } }
  else { if (pl.vehicle.kind === 'plane' || pl.vehicle.kind === 'heli') { if (!G._airHint) { G._airHint = true; UI.toast('✈ Shift = Gas · Leertaste = Gas weg · W/S = Neigung · A/D = Rollen · Q/E = Gieren'); } } }
  if (inV && pl.vehicle.spec.special === 'taxi' && !Taxi.job) consider(50, '<kbd>T</kbd> Taxi-Dienst starten', null);
  UI.prompt(best ? best.label : '');
  if (best && best.fn && I.press('KeyE')) { best.fn(); Audio.play('ui'); }
  if (I.press('KeyF') && !inV) { const v = pl.nearestVehicle(); if (v && !(v.isDisplay || v.locked)) { if (Police.level >= 0) { pl.enterVehicle(v); if (v.owned === false && (v.parked === false)) { } if (v.ownRec) { } } } }
  // Spielerfahrzeug nach Diebstahl besitzen
  if (inV && pl.vehicle.spec && !pl.vehicle.ownRec && false) { }
}

// ---------------- Lampenlichter ----------------
let lampT = 0;
function updateLampLights(dt) {
  lampT -= dt; const n = G.night, ref = camera.position;
  if (lampT <= 0) {
    lampT = 0.4; const L = city.lamps; const best = [];
    if (n > 0.25 && ref.x > -1250 && ref.x < 1300 && ref.z > -1250 && ref.z < 1300) {
      for (let i = 0; i < L.length; i++) { const l = L[i]; const dx = l.x - ref.x, dz = l.z - ref.z, d = dx * dx + dz * dz; if (d < 3600) { best.push([d, l]); } }
      best.sort((a, b) => a[0] - b[0]);
    }
    lampLights.forEach((pl, i) => { const b = best[i]; if (b) { pl.position.set(b[1].x, 7.2, b[1].z); pl._on = true; } else pl._on = false; });
  }
  const rainDim = 1 - (G.weather.rain * 0.2);
  lampLights.forEach((pl) => { const t = pl._on ? n * 45 * rainDim : 0; pl.intensity = lerp(pl.intensity, t, Math.min(1, dt * 4)); });
  // Scheinwerfer des Spielerfahrzeugs
  const v = G.player.vehicle;
  if (v && n > 0.2 || (v && G.weather.rain > 0.5)) { const s = Math.sin(v.yaw), c = Math.cos(v.yaw); headSpot.position.set(v.pos.x + s * v.halfL, v.pos.y + 0.8, v.pos.z + c * v.halfL); headSpot.target.position.set(v.pos.x + s * (v.halfL + 20), v.pos.y + 0.2, v.pos.z + c * (v.halfL + 20)); headSpot.intensity = (v.kind === 'plane' || v.kind === 'heli' ? 0 : 140 * Math.max(n, 0.4)); headSpot.visible = true; } else { headSpot.intensity = 0; }
}

// ---------------- Hauptschleife ----------------
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt <= 0) dt = 0.001;
  G.clock += dt; clockT += dt;
  const _t0 = performance.now();
  const st = G.state, sim = st === 'play' || st === 'cutscene' || st === 'menu';
  const pl = G.player;
  if (sim) {
    if (st !== 'menu' || true) { const ts = G.settings.timeScale; G.hour += dt * ts / 60; if (G.hour >= 24) { G.hour -= 24; G.day++; } }
    G.weather.update(dt);
    pl.update(dt);
    Veh.update(dt); Peds.update(dt); Traffic.update(dt); Police.update(dt); Combat.update(dt);
    if (st !== 'menu') { Missions.update(dt); Race.update(dt); Taxi.update(dt); Delivery.update(dt); Events.update(dt); Eco.updateGarage(); updateInteract(dt); Markers.update(dt); saveTimer += dt; }
    else { Markers.update(dt); }
    UI.tickCutscene(dt);
    // Tageswechsel/Einkommen: nichts nötig
    if (G.player.vehicle) { const v = G.player.vehicle; if (Audio.ready && Input.press('KeyR')) { } }
    G.skillTick = (G.skillTick || 0) + dt;
    Input.endFrame();
  } else if (st === 'pause') {
    // Kamera für Charakteransicht
    pl.update(0.0001); Input.endFrame();
  } else { Input.endFrame(); }
  const _t1 = performance.now();
  // Kamera
  const camPos0 = camera.position;
  if (st === 'menu') { CamCtl.update(dt); }
  else if (st === 'play' || st === 'cutscene' || st === 'pause' || st === 'dead') CamCtl.update(dt);
  FX.update(dt, camera);
  // Himmel/Wetter
  const follow = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  const k = sky.update(dt, camera.position, follow);
  renderer.toneMappingExposure = sky.exposure;
  updateWorld(dt, camera.position);
  rain.update(dt, camera.position, G.weather.rain, 0.2);
  updateLampLights(dt);
  Audio.update(dt); Audio.radioTick(dt);
  UI.update(dt);
  // Nachbearbeitung
  const q = G.quality; const sp = pl.vehicle ? Math.abs(pl.vehicle.speed) : 0; const target = clamp((sp - 38) / 120, 0, 0.3) * (pl.vehicle && pl.vehicle.kind !== 'boat' ? 1 : 0.4); speedBlur = lerp(speedBlur, target, Math.min(1, dt * 3));
  if (window.__skipRender) { } else if (composer && (G.settings.bloom || true)) {
    bloom.enabled = !!G.settings.bloom && q.bloom !== false && G.settings.quality !== 'low'; bloom.strength = (G.night > 0.4 ? 0.62 : 0.28) + (G.settings.quality === 'ultra' ? 0.1 : 0);
    cinePass.uniforms.uBlur.value = speedBlur; cinePass.uniforms.uTime.value = clockT % 100; cinePass.uniforms.uVig.value = 0.42 + (pl.alive ? 0 : 0.3) + (pl.hp < 30 ? 0.25 : 0);
    composer.render(dt);
  } else renderer.render(scene, camera);
  const _t2 = performance.now(); window.__prof = { sim: _t1 - _t0, render: _t2 - _t1 };
  // Autosave alle 2 Minuten (nur im Spiel)
  if (saveTimer > 150 && G.state === 'play') { saveTimer = 0; try { localStorage.setItem('vicecity_save_v1', JSON.stringify(Save.serialize())); } catch (e) { } }
  // Fähigkeiten steigern
  if (G.skillTick > 5) { G.skillTick = 0; if (pl.vehicle && (pl.vehicle.kind === 'plane' || pl.vehicle.kind === 'heli') && !pl.vehicle.grounded) G.profile.skills.flying = Math.min(1, G.profile.skills.flying + 0.003); if (pl.sprinting) G.profile.skills.stamina = Math.min(1, G.profile.skills.stamina + 0.004); }
  window.__frame = (window.__frame || 0) + 1;
}
// Debug-Hooks
window.__G = G; window.__mods = { Missions, Veh, Peds, Police, Traffic, Eco, UI, Race, Taxi, Delivery, Events, Combat, TR, Markers, city, Input, CamCtl };
boot().catch((e) => { console.error(e); const t = document.querySelector('#loading .tip'); if (t) t.textContent = 'Fehler beim Start: ' + e.message; });
