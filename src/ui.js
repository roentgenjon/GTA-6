// UI: HUD, Menüs, Karte, Shops, Minispiele, Zwischensequenzen
import * as THREE from 'three';
import { G, emit, on } from './game.js';
import { Input, CamCtl } from './player.js';
import { Audio } from './audio.js';
import { Missions } from './missions.js';
import { Markers, BLIP_COL } from './markers.js';
import { SITES, SITE_ICON, TYPE_LABEL } from './sites.js';
import { city } from './city.js';
import * as TR from './terrain.js';
import { P, K, DISTRICT_NAMES, districtAt, streetAt, routeBetween, terrainHeight, WATER, coastE, coastS, BAY, AIRPORT, HIGHWAY } from './terrain.js';
import { CATALOG, BY_ID, BUYABLE, CLS } from './catalog.js';
import { WEAPONS, WEAPON_ORDER, ITEMS } from './weapons.js';
import { OUTFITS, SKINS, HAIR_STYLES, HAIR_COLORS, HATS, TOP_TYPES, BOTTOM_TYPES, SHOE_TYPES, COLOR_SWATCH } from './persons.js';
import { Eco, Save } from './profile.js';
import { RACES, Race, CHALLENGES, claimChallenge, Taxi, Delivery } from './activities.js';
import { Police } from './police.js';
import { WEATHER_NAMES } from './sky.js';
import { clamp, fmtMoney, hex, lerp, smoothstep, fbm, rr, pick } from './util.js';
import { Veh } from './vehicles.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const setH = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };
const setT = (el, t) => { if (el._t !== t) { el._t = t; el.textContent = t; } };
const setW = (el, w) => { if (el._w !== w) { el._w = w; el.style.width = w + '%'; } };
const MAP = { x0: -2700, z0: -1700, w: 5500, h: 4100, s: 10 };

export const UI = {
  tab: 'map', root: null, cutsceneDone: false, dialog: null, toastQ: [], promptEl: null, map: { cx: 0, cz: 0, zoom: 0.18, drag: null, hover: null },
  init() {
    const root = $('#ui'); this.root = root;
    root.innerHTML = `
    <div id="hud" class="hidden">
      <div id="race" class="hidden"></div>
      <div id="objective" class="hidden"><div class="t"></div><div class="o"></div></div>
      <div id="timer" class="hidden"></div>
      <div id="toasts"></div>
      <div id="topright"><div id="money"></div><div id="timeweather"></div><div id="stars"></div></div>
      <div id="weapon"></div>
      <div id="speedo" class="hidden"></div>
      <div id="bars"><div class="bar" id="hp-bar"><i></i></div><div class="bar" id="armor-bar"><i></i></div><div class="bar" id="stam-bar"><i></i></div></div>
      <div id="minimap-wrap"><canvas id="minimap" width="440" height="440"></canvas></div>
      <div id="street"></div>
      <div id="prompt" class="hidden"></div>
      <div id="subtitle" class="hidden"></div>
      <div id="crosshair" class="hidden"></div>
      <div id="radio"></div>
      <div id="countdown" class="hidden"></div>
      <div id="damage"></div><div id="fps"></div>
    </div>
    <div id="bigmsg"></div>
    <div id="bars-cine"><div class="b t"></div><div class="b bt"></div></div>
    <div id="fade"></div>
    <div id="title" class="hidden"></div>
    <div id="menu" class="hidden"></div>
    <div id="loading"><h2>VICE CITY</h2><div class="bar"><i></i></div><div class="tip"></div></div>`;
    this.hud = $('#hud'); this.mm = $('#minimap'); this.mmc = this.mm.getContext('2d');
    this.el = { money: $('#money'), tw: $('#timeweather'), stars: $('#stars'), weapon: $('#weapon'), speedo: $('#speedo'), hp: $('#hp-bar i'), armor: $('#armor-bar i'), stam: $('#stam-bar i'), street: $('#street'), prompt: $('#prompt'), sub: $('#subtitle'), obj: $('#objective'), toasts: $('#toasts'), cross: $('#crosshair'), damage: $('#damage'), timer: $('#timer'), race: $('#race'), radio: $('#radio'), count: $('#countdown'), big: $('#bigmsg'), fade: $('#fade') };
    // Ereignisse
    on('toast', (t) => this.toast(t)); on('cash', (n) => { if (n > 0) this.toast('+' + fmtMoney(n)); });
    on('objective', (t) => this.setObjective(t));
    on('wantedUp', (l) => this.toast('🚨 Fahndungsstufe ' + l)); on('wantedLost', () => { this.toast('✅ Fahndung verloren'); });
    on('playerHurt', (a, dir) => { this.el.damage.style.opacity = 0.9; setTimeout(() => (this.el.damage.style.opacity = 0), 220); });
    on('hitmarker', (head) => { this.el.cross.classList.add('hit'); setTimeout(() => this.el.cross.classList.remove('hit'), 90); });
    on('raceStart', () => { this.el.race.classList.remove('hidden'); }); on('raceEnd', (place, t, rev) => { this.el.race.classList.add('hidden'); this.bigMsg(place === 1 ? 'SIEG!' : `PLATZ ${place}`, `Zeit ${t.toFixed(1)} s · ${rev ? fmtMoney(rev) : 'kein Preisgeld'}`, place === 1 ? 'gold' : ''); });
    on('weaponChanged', () => { }); on('landed', () => { });
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.hud.addEventListener('click', () => { });
    window.addEventListener('mousedown', () => { if (this.cutsceneActive && G.state === 'cutscene') this.advance(); });
  },
  setLoading(p, tip) { const l = $('#loading'); if (!l) return; $('.bar i', l).style.width = (p * 100) + '%'; if (tip) $('.tip', l).textContent = tip; if (p >= 1) setTimeout(() => l.classList.add('hidden'), 300); },
  // ---------------- Titel ----------------
  showTitle() {
    G.state = 'menu'; this.hud.classList.add('hidden');
    const t = $('#title'); t.classList.remove('hidden'); $('#menu').classList.add('hidden');
    const info = Save.info();
    t.innerHTML = `<h1>VICE<br>CITY</h1><div class="sub">Open World · Ultra Edition</div>
      <div class="menu">
        ${G.account ? `<div class="acct">👤 Angemeldet als <b>${String(G.account.name).replace(/[<>&"]/g, '')}</b> <button class="link" data-a="logout">Abmelden</button></div>` : ''}
        ${info ? `<button class="btn" data-a="continue">Fortsetzen <small style="opacity:.7;font-weight:400">· ${fmtMoney(info.money)} · ${info.missions} Missionen</small></button>` : ''}
        <button class="btn ${info ? 'alt' : ''}" data-a="new">Neues Spiel</button>
        <button class="btn alt" data-a="settings">Einstellungen</button>
        <button class="btn alt" data-a="controls">Steuerung</button>
        <button class="btn alt" data-a="credits">Credits</button>
      </div>
      <div class="foot"><span>WASD Bewegen · Maus Kamera · E Interaktion · F Fahrzeug · ESC Pause</span><span>Prozedural generierte Open-World · Three.js</span></div>`;
    t.onclick = (e) => { const a = e.target.closest('[data-a]'); if (!a) return; Audio.init(); Audio.resume(); Audio.play('ui'); const act = a.dataset.a; if (act === 'logout') G.logout(); else if (act === 'new') G.startNew(); else if (act === 'continue') G.continueGame(); else if (act === 'settings') this.openMenu('settings', true); else if (act === 'controls') this.openMenu('controls', true); else if (act === 'credits') this.showCredits(); };
  },
  hideTitle() { $('#title').classList.add('hidden'); },
  // ---------------- HUD ----------------
  showHud(v) { this.hud.classList.toggle('hidden', !v); },
  toast(t) { const d = el(`<div class="toast">${t}</div>`); this.el.toasts.appendChild(d); while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove(); setTimeout(() => d.remove(), 3800); },
  setObjective(t) { const o = this.el.obj; if (!t || !G.hudMission) { o.classList.add('hidden'); return; } o.classList.remove('hidden'); $('.t', o).textContent = G.hudMission.title; $('.o', o).textContent = t; },
  bigMsg(t, sub = '', cls = '', ms = 3200) { const b = this.el.big; b.className = cls; b.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); b.classList.add('show'); clearTimeout(this._bm); this._bm = setTimeout(() => b.classList.remove('show'), ms); },
  fade(on_, ms = 600) { this.el.fade.style.transition = `opacity ${ms}ms`; this.el.fade.style.opacity = on_ ? 1 : 0; },
  missionPassed(d) { this.bigMsg('MISSION ERFOLGREICH', `${d.title} · ${d.reward ? fmtMoney(d.reward) : ''}`, 'gold', 4200); },
  missionFailed(d, reason) { this.bigMsg('MISSION GESCHEITERT', reason, 'red', 4200); },
  prompt(html) { const p = this.el.prompt; if (!html) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); if (p.dataset.h !== html) { p.innerHTML = html; p.dataset.h = html; } },
  update(dt) {
    const pl = G.player; if (!pl || G.state === 'menu') return;
    const P_ = G.profile;
    setT(this.el.money, fmtMoney(P_.money));
    const h = Math.floor(G.hour), m = Math.floor((G.hour - h) * 60);
    setT(this.el.tw, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${WEATHER_NAMES[G.weather.type] || ''}`);
    // Sterne
    const lvl = Police.level; let s = ''; for (let i = 1; i <= 5; i++) s += `<span class="${i <= lvl ? 'on' : 'off'}">★</span>`;
    if (this.el.stars.dataset.s !== s + Police.searching) { this.el.stars.innerHTML = s; this.el.stars.dataset.s = s + Police.searching; }
    this.el.stars.classList.toggle('search', Police.searching && lvl > 0);
    setW(this.el.hp, Math.round(clamp(pl.hp, 0, 100))); setW(this.el.armor, Math.round(clamp(pl.armor, 0, 100))); setW(this.el.stam, Math.round(pl.stamina * 50) * 2);
    // Waffe
    const w = pl.weapon, wd = pl.wdata;
    const _wh = pl.vehicle ? '' : `<b>${w.icon || ''}</b> ${w.name}${w.mag ? `<div class="ammo">${G.settings.infAmmo ? '∞' : wd ? wd.mag : 0}<span style="font-size:14px;opacity:.7"> / ${G.settings.infAmmo ? '∞' : wd ? wd.ammo : 0}</span>${pl.reloadT > 0 ? ' ⟳' : ''}</div>` : w.throw && wd ? `<div class="ammo">${G.settings.infAmmo ? '∞' : wd.ammo}</div>` : ''}`;
    setH(this.el.weapon, _wh);
    this.el.cross.classList.toggle('hidden', !(pl.aiming && !pl.vehicle) || G.state !== 'play');
    // Tacho
    const v = pl.vehicle;
    this.el.speedo.classList.toggle('hidden', !v);
    if (v) {
      const kmh = Math.abs(v.speed) * 3.6, mph = G.settings.units === 'mph', val = Math.round(kmh * (mph ? 0.621 : 1));
      let extra = '';
      if (v.kind === 'plane') extra = `<div class="vhp">Höhe ${Math.round(v.pos.y - TR.groundHeight(v.pos.x, v.pos.z))} m · Schub ${Math.round(v.throttle * 100)}%</div>`; else if (v.kind === 'heli') extra = `<div class="vhp">Höhe ${Math.round(v.pos.y - TR.groundHeight(v.pos.x, v.pos.z))} m</div>`;
      const gear = v.gear < 0 ? 'R' : v.gear === 0 ? 'N' : v.gear;
      const _sh = `<div><span class="spd">${val}</span><span class="unit">${mph ? 'mph' : 'km/h'}</span></div>${v.kind === 'car' || v.kind === 'bike' ? `<div class="gear">Gang ${gear}</div>` : ''}<div class="rpm"><i style="width:${Math.round(v.rpm * 25) * 4}%"></i></div><div class="vhp">${v.spec.name} · Zustand ${Math.round(clamp(v.hp / 10, 0, 100))}%</div>${extra}`;
      setH(this.el.speedo, _sh);
    }
    // Straße / Bezirk
    const dn = DISTRICT_NAMES[districtAt(pl.pos.x, pl.pos.z)] || '', st = streetAt(pl.pos.x, pl.pos.z);
    const sh = `${st ? st : ''}<small>${dn}</small>`; if (this.el.street.dataset.s !== sh) { this.el.street.innerHTML = sh; this.el.street.dataset.s = sh; }
    // Mission Timer
    const mi = Missions.active;
    if (mi && mi.timer) { const t = Math.max(0, mi.timer - G.clock); this.el.timer.classList.remove('hidden'); setT(this.el.timer, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`); } else this.el.timer.classList.add('hidden');
    // Rennen
    const r = G.race; if (r) {
      if (r.state === 'countdown') { this.el.count.classList.remove('hidden'); this.el.count.textContent = Math.ceil(r.t) > 0 ? Math.ceil(r.t) : 'GO'; } else { if (G.clock - r.started < 1.2) { this.el.count.classList.remove('hidden'); this.el.count.textContent = 'GO!'; } else this.el.count.classList.add('hidden'); }
      const _rh = `<div class="pos">${r.place || 1}<small style="font-size:22px">/${r.rivals.length + 1}</small></div><div>${r.def.name}</div><div>Checkpoint ${Math.min(r.cp + 1, r.route.seq.length)}/${r.route.seq.length}</div><div>${r.state === 'go' ? (G.clock - r.started).toFixed(1) + ' s' : ''}</div>`;
      setH(this.el.race, _rh);
    } else this.el.count.classList.add('hidden');
    // Radio
    if (this._radioT > 0) { this._radioT -= dt; if (this._radioT <= 0) this.el.radio.classList.remove('show'); }
    this._mmN = (this._mmN || 0) + 1; if (this._mmN % (document.body.classList.contains('touch') ? 3 : 2) === 0) this.drawMinimap();
  },
  radioShow(st) { this.el.radio.innerHTML = st.bpm > 0 ? `📻 <b>${st.name}</b><br>${st.genre}` : '📻 Radio aus'; this.el.radio.classList.add('show'); this._radioT = 3; },
  // ---------------- Karte vorrendern ----------------
  buildMap() {
    const c = document.createElement('canvas'); c.width = Math.ceil(MAP.w / MAP.s); c.height = Math.ceil(MAP.h / MAP.s); const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height), d = img.data;
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      const x = MAP.x0 + i * MAP.s, z = MAP.z0 + j * MAP.s, h = terrainHeight(x, z); let r, gg, b;
      if (h < WATER) { const dp = clamp((WATER - h) / 20, 0, 1); r = lerp(70, 18, dp); gg = lerp(150, 70, dp); b = lerp(190, 120, dp); }
      else if (h < 1.2 && (x > 900 || z > 900)) { r = 232; gg = 214; b = 160; }
      else if (h > 140) { r = 150; gg = 150; b = 150; } else if (h > 50) { r = 70; gg = 100; b = 62; } else { r = 96; gg = 140; b = 82; }
      const sh = h > 4 ? (terrainHeight(x + 10, z + 10) - h) * 3 : 0; r += sh; gg += sh; b += sh;
      const o = (j * c.width + i) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapBase = c;
    // Stadt in höherer Auflösung
    const S = 2, cw = Math.ceil(2700 / S), c2 = document.createElement('canvas'); c2.width = cw; c2.height = cw; const g2 = c2.getContext('2d');
    const X0 = -1250, Z0 = -1250; this.mapCity = { c: c2, x0: X0, z0: Z0, s: S };
    const colors = { downtown: '#a8a39c', midtown: '#b5a994', beach: '#d9c79a', villas: '#a6b78d', harbor: '#8f969c', industrial: '#8a8c88', residential: '#b8a98f', suburb: '#a9b28d' };
    for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) { if (!TR.blockExists(i, j)) continue; g2.fillStyle = colors[TR.districtOf(i, j)] || '#aaa'; g2.fillRect((i * P + 7 - X0) / S, (j * P + 7 - Z0) / S, (P - 14) / S, (P - 14) / S); }
    g2.strokeStyle = '#e9e6dc'; g2.lineWidth = 14 / S; g2.lineCap = 'butt';
    for (let k = -K; k <= K; k++) { g2.beginPath(); g2.moveTo((k * P - X0) / S, (-K * P - Z0) / S); g2.lineTo((k * P - X0) / S, (K * P - Z0) / S); g2.stroke(); g2.beginPath(); g2.moveTo((-K * P - X0) / S, (k * P - Z0) / S); g2.lineTo((K * P - X0) / S, (k * P - Z0) / S); g2.stroke(); }
    // Bucht + Küste überdecken
    const wimg = g2.getImageData(0, 0, cw, cw), wd = wimg.data;
    for (let j = 0; j < cw; j += 1) for (let i = 0; i < cw; i += 1) { const x = X0 + i * S, z = Z0 + j * S; if (terrainHeight(x, z) < WATER) { const o = (j * cw + i) * 4; wd[o] = 40; wd[o + 1] = 110; wd[o + 2] = 160; wd[o + 3] = 255; } else if (x > 1100 && wd[((j * cw + i) * 4) + 3] === 0) { const o = (j * cw + i) * 4; wd[o] = 232; wd[o + 1] = 214; wd[o + 2] = 160; wd[o + 3] = 255; } }
    g2.putImageData(wimg, 0, 0);
    // Flughafen & Highway auf grobe Karte
    const gb = this.mapBase.getContext('2d'); gb.fillStyle = '#ccc'; gb.fillRect((AIRPORT.x0 + 600 - MAP.x0) / MAP.s, (AIRPORT.z0 - MAP.z0) / MAP.s, 40 / MAP.s * 3, 1100 / MAP.s);
    gb.fillStyle = '#5a5a5a'; gb.fillRect((AIRPORT.rwX - 23 - MAP.x0) / MAP.s, (AIRPORT.rwZ0 - MAP.z0) / MAP.s, 46 / MAP.s, (AIRPORT.rwZ1 - AIRPORT.rwZ0) / MAP.s);
    gb.fillStyle = '#d8d2c0'; gb.fillRect((-1700 - MAP.x0) / MAP.s, (192 - 7 - MAP.z0) / MAP.s, 548 / MAP.s, 14 / MAP.s);
  },
  // ---------------- Minimap ----------------
  drawMinimap() {
    const pl = G.player, c = this.mmc, W = 440, H = 440, base = this.mapBase; if (!base) return;
    c.save(); c.clearRect(0, 0, W, H); c.beginPath(); c.arc(W / 2, H / 2, W / 2, 0, 6.2832); c.clip();
    c.fillStyle = '#1b4d6e'; c.fillRect(0, 0, W, H);
    const range = pl.vehicle ? 170 + Math.min(120, Math.abs(pl.vehicle.speed) * 2.5) : 150; const k = (W / 2) / range;
    const cy = G.camera ? pl.camYaw : 0, co = Math.cos(cy), si = Math.sin(cy);
    const px = pl.pos.x, pz = pl.pos.z;
    const a = -co * k, bb = -si * k, cc = si * k, dd = -co * k;
    const draw = (img, x0, z0, s) => { c.setTransform(a * s, bb * s, cc * s, dd * s, W / 2 + a * (x0 - px) + cc * (z0 - pz), H / 2 + bb * (x0 - px) + dd * (z0 - pz)); c.drawImage(img, 0, 0); };
    c.imageSmoothingEnabled = true;
    draw(base, MAP.x0, MAP.z0, MAP.s);
    const mc = this.mapCity; draw(mc.c, mc.x0, mc.z0, mc.s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const toS = (x, z) => { const dx = x - px, dz = z - pz; return [W / 2 + (-co * dx + si * dz) * k, H / 2 - (si * dx + co * dz) * k]; };
    // Route
    if (this.route && this.route.length > 1) { c.strokeStyle = '#ff3b8c'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); this.route.forEach((p, i) => { const [x, y] = toS(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); }
    // Polizeiradius
    if (Police.level > 0 && Police.searching) { const [x, y] = toS(Police.lastKnown.x, Police.lastKnown.z); c.strokeStyle = `rgba(${Math.floor(G.clock * 4) % 2 ? '255,40,60' : '60,100,255'},.9)`; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 90 * k, 0, 6.28); c.stroke(); }
    // Blips
    const dot = (x, z, col, r = 7, ring = false) => { let [sx, sy] = toS(x, z); const dx = sx - W / 2, dy = sy - H / 2, d = Math.hypot(dx, dy), lim = W / 2 - 12; if (d > lim) { sx = W / 2 + dx / d * lim; sy = H / 2 + dy / d * lim; r *= 0.8; } c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, r, 0, 6.28); c.fill(); c.stroke(); };
    for (const p of city.pois) { if (!['bank', 'hospital', 'police', 'property', 'business', 'casino', 'dealer', 'gun', 'clothes', 'story', 'airport', 'port'].includes(p.type)) continue; const d = Math.hypot(p.x - px, p.z - pz); if (d > range * 1.0) continue; const [sx, sy] = toS(p.x, p.z); c.font = '22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SITE_ICON[p.type] || '•', sx, sy); }
    for (const m of Markers.items) { if (m.hidden) continue; if (m.type === 'mission') dot(m.x, m.z, '#ffd23a', 9); else if (m.type === 'obj') dot(m.x, m.z, '#ffd23a', 8); else if (m.type === 'enemy') dot(m.x, m.z, '#ff3b3b', 6); else if (m.type === 'race') dot(m.x, m.z, '#b36bff', 8); }
    for (const v of G.entities.vehicles) { if ((v.isPolice || v.copUnit) && v.driver && !v.wreck) { dot(v.pos.x, v.pos.z, Math.floor(G.clock * 4) % 2 ? '#ff2d4d' : '#3d7bff', 6); } }
    for (const p of G.entities.peds) if (p.role === 'cop' && !p.dead && Police.level > 0) dot(p.pos.x, p.pos.z, '#4d8bff', 4);
    if (G.multiList) for (const r of G.multiList()) dot(r.x, r.z, '#35ffb4', 6);
    if (Markers.waypoint) dot(Markers.waypoint.x, Markers.waypoint.z, '#ff3b5c', 9);
    // Spieler-Pfeil
    c.save(); c.translate(W / 2, H / 2); c.rotate(cy - (pl.vehicle ? pl.vehicle.yaw : pl.yaw)); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    // Norden
    const [nx, ny] = [W / 2 + (-co * 0 + si * -1) * (W / 2 - 16) * -1 * 0, 0];
    c.restore();
  },
  // ---------------- Zwischensequenzen ----------------
  startCutscene(lines, camSpec, m) {
    this.cutsceneLines = lines; this.cutsceneIdx = 0; this.cutsceneDone = false; this.cutsceneActive = true; this.cutCam = camSpec;
    G.prevState = G.state; G.state = 'cutscene'; document.body.classList.add('cine'); this.hud.classList.add('cine');
    for (const e of ['minimap-wrap', 'bars', 'topright', 'weapon', 'speedo', 'street', 'objective', 'toasts']) $('#' + e) && ($('#' + e).style.visibility = 'hidden');
    Input.unlock(); this.showLine();
  },
  showLine() {
    const l = this.cutsceneLines[this.cutsceneIdx]; if (!l) { this.cutsceneDone = true; return; }
    const sub = this.el.sub; sub.classList.remove('hidden'); sub.innerHTML = `<b>${l.who}:</b> ${l.text}`;
    Audio.play('talk'); this.lineT = 0; this.lineMin = 0.7;
    const pl = G.player; const i = this.cutsceneIdx;
    let spec = this.cutCam;
    if (!spec) { const a = 0.6 + i * 1.3; const px = pl.pos.x, pz = pl.pos.z; spec = { pos: new THREE.Vector3(px + Math.sin(a) * 4.5, pl.pos.y + 1.8, pz + Math.cos(a) * 4.5), look: new THREE.Vector3(px, pl.pos.y + 1.5, pz) }; }
    else { const a = i * 0.9; spec = { pos: spec.pos.clone().add(new THREE.Vector3(Math.sin(a) * 1.2, (i % 2) * 0.5, Math.cos(a) * 1.2)), look: spec.look }; }
    spec.smooth = 1.6; spec.fov = 42 + (i % 2) * 8; CamCtl.cutscene(spec);
    if (!CamCtl.init) CamCtl.init = true;
  },
  advance() { if (!this.cutsceneActive || this.lineT < this.lineMin) return; this.cutsceneIdx++; if (this.cutsceneIdx >= this.cutsceneLines.length) { this.cutsceneDone = true; this.el.sub.classList.add('hidden'); } else this.showLine(); },
  endCutscene() {
    if (!this.cutsceneActive) return; this.cutsceneActive = false; this.cutsceneDone = false; this.el.sub.classList.add('hidden');
    document.body.classList.remove('cine'); for (const e of ['minimap-wrap', 'bars', 'topright', 'weapon', 'speedo', 'street', 'objective', 'toasts']) $('#' + e) && ($('#' + e).style.visibility = '');
    CamCtl.cut = null; if (G.state === 'cutscene') G.state = 'play';
    const r = G.camera && Input.lock(document.getElementById('game'));
  },
  tickCutscene(dt) { if (!this.cutsceneActive) return; this.lineT += dt; if (this.lineT > 7.5) this.advance(); },
  onKey(e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (G.state === 'cutscene' && ['KeyE', 'Space', 'Enter'].includes(e.code)) { this.advance(); e.preventDefault(); }
    if (G.state === 'cutscene' && e.code === 'Escape') { this.cutsceneIdx = this.cutsceneLines.length; this.cutsceneDone = true; this.el.sub.classList.add('hidden'); }
    if (this.minigame && this.minigame.key) this.minigame.key(e);
    if (G.state === 'play') {
      if (e.code === 'Escape') { this.openMenu(this.tab === 'char' ? 'map' : this.tab); }
      else if (e.code === 'KeyM') this.openMenu('map'); else if (e.code === 'KeyI') this.openMenu('inv'); else if (e.code === 'KeyJ') this.openMenu('missions'); else if (e.code === 'KeyP') this.openMenu('phone');
    } else if (G.state === 'pause' && (e.code === 'Escape' || (e.code === 'KeyM' && this.tab === 'map' && false))) { if (!this.modal) this.closeMenu(); else this.closeModal(); }
    else if (G.state === 'pause' && !this.modal && ['KeyM', 'KeyI', 'KeyJ', 'KeyP'].includes(e.code)) { const t = { KeyM: 'map', KeyI: 'inv', KeyJ: 'missions', KeyP: 'phone' }[e.code]; if (this.tab === t) this.closeMenu(); else this.openMenu(t); }
    if (e.code === 'Escape' && this.modal) this.closeModal();
  },
  // ---------------- Pause-/Hauptmenü ----------------
  TABS: [['map', 'Karte'], ['missions', 'Missionen'], ['phone', 'Handy'], ['char', 'Charakter'], ['inv', 'Inventar'], ['garage', 'Garage'], ['props', 'Immobilien'], ['stats', 'Statistik'], ['settings', 'Einstellungen'], ['controls', 'Steuerung'], ['save', 'Speichern']],
  openMenu(tab = 'map', fromTitle = false) {
    if (!fromTitle) this.hud.style.visibility = 'hidden';
    if (G.state === 'play' || G.state === 'menu' || G.state === 'pause') { if (G.state === 'play') { G.state = 'pause'; Input.unlock(); } }
    this.fromTitle = fromTitle; if (fromTitle) { this.menuMode = 'title'; } else this.menuMode = 'game';
    this._mOpen = performance.now(); this.tab = tab; this.renderMenu(); if (G.state === 'pause') Audio.play('ui');
  },
  closeMenu() { const m = $('#menu'); m.classList.add('hidden'); this.mapRaf = null; this.hud.style.visibility = ''; if (this.menuMode === 'title') { $('#title').classList.remove('hidden'); G.state = 'menu'; return; } if (G.state === 'pause') { G.state = 'play'; Input.lock(document.getElementById('game')); } },
  menuOpen() { const m = $('#menu'); return !!m && !m.classList.contains('hidden'); },
  renderMenu() {
    const m = $('#menu'); m.classList.remove('hidden'); m.classList.toggle('transparent', this.tab === 'char' && this.menuMode === 'game');
    if (this.menuMode === 'title') $('#title').classList.add('hidden');
    const tabs = this.menuMode === 'title' ? this.TABS.filter((t) => ['settings', 'controls'].includes(t[0])) : this.TABS;
    m.innerHTML = `<div class="win"><div class="menuhead"><div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === this.tab ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('')}</div><button class="closebtn" data-close="1" aria-label="Schließen">✕</button></div><div class="pane" id="pane"></div><button class="backbtn btn" data-close="1">⮌ Zurück ${this.menuMode === 'title' ? 'zum Hauptmenü' : 'zum Spiel'}</button></div>`;
    m.onclick = (e) => { if (performance.now() - (this._mOpen || 0) < 450) return; if (e.target === m) { this.closeMenu(); return; } const t = e.target.closest('[data-tab]'); if (t) { this.tab = t.dataset.tab; Audio.play('ui'); this.renderMenu(); return; } if (e.target.closest('[data-close]')) this.closeMenu(); };
    const act = m.querySelector('.tab.active'); if (act && act.scrollIntoView) { try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { } }
    const pane = $('#pane'); const pf = this['pane_' + this.tab]; if (pf) pf.call(this, pane);
  },
  // ---- Karte ----
  pane_map(pane) {
    pane.style.padding = '10px'; pane.innerHTML = `<div id="mapwrap"><canvas id="mapcv"></canvas><div id="maptip">Klick = Wegpunkt · Rechtsklick = entfernen · Mausrad = Zoom · Ziehen = Verschieben</div><div id="maplegend">🏦 Bank · ➕ Krankenhaus · 🚓 Polizei · 🏠 Immobilie · 💼 Geschäft<br>🎰 Casino · 🚘 Autohaus · 🔫 Waffen · 👕 Kleidung · ★ Kontakt<br><span style="color:#ffd23a">●</span> Ziel · <span style="color:#ff3b5c">●</span> Wegpunkt · <span style="color:#b36bff">●</span> Rennen</div></div>`;
    const cv = $('#mapcv'), M_ = this.map; const pl = G.player; if (!M_.init) { M_.cx = pl.pos.x; M_.cz = pl.pos.z; M_.init = true; } M_.cx = pl.pos.x; M_.cz = pl.pos.z; M_.zoom = 0.2;
    const resize = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; }; resize();
    const toW = (sx, sy) => [M_.cx + (sx - cv.width / 2) / M_.zoom, M_.cz + (sy - cv.height / 2) / M_.zoom];
    const zoomBy = (f, ox, oz) => { const z0 = M_.zoom; M_.zoom = clamp(M_.zoom * f, 0.04, 1.6); M_.cx = ox - (ox - M_.cx) * z0 / M_.zoom; M_.cz = oz - (oz - M_.cz) * z0 / M_.zoom; };
    cv.onwheel = (e) => { e.preventDefault(); const [wx, wz] = toW(e.offsetX * (cv.width / cv.clientWidth), e.offsetY * (cv.height / cv.clientHeight)); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, wx, wz); };
    const wrap = $('#mapwrap'); const zb = el('<div id="mapzoom"><button data-z="1">+</button><button data-z="-1">−</button></div>'); wrap.appendChild(zb); zb.onclick = (e) => { const b = e.target.closest('[data-z]'); if (b) zoomBy(+b.dataset.z > 0 ? 1.35 : 1 / 1.35, M_.cx, M_.cz); };
    const ptrs = new Map(); let pinch = 0;
    const loc = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.onpointerdown = (e) => { try { cv.setPointerCapture(e.pointerId); } catch (_) { } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); M_.drag = { x: e.clientX, y: e.clientY, cx: M_.cx, cz: M_.cz, moved: false, btn: e.button }; if (ptrs.size === 2) { const [a, b2] = [...ptrs.values()]; pinch = Math.hypot(a.x - b2.x, a.y - b2.y); M_.drag.moved = true; } };
    cv.onpointermove = (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b2] = [...ptrs.values()]; const d = Math.hypot(a.x - b2.x, a.y - b2.y); if (pinch) zoomBy(d / pinch, M_.cx, M_.cz); pinch = d; return; }
      if (M_.drag) { const dx = e.clientX - M_.drag.x, dy = e.clientY - M_.drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) M_.drag.moved = true; if (M_.drag.moved) { M_.cx = M_.drag.cx - dx / M_.zoom; M_.cz = M_.drag.cz - dy / M_.zoom; } }
      const [sx, sy] = loc(e); const [wx, wz] = toW(sx, sy); M_.hover = { x: wx, z: wz };
    };
    cv.onpointerup = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (M_.drag && !M_.drag.moved && e.button === 0) { const [sx, sy] = loc(e); const [wx, wz] = toW(sx, sy); Markers.setWaypoint(wx, wz); this.updateRoute(); Audio.play('ok'); } M_.drag = null; };
    cv.onpointercancel = () => { ptrs.clear(); M_.drag = null; };
    cv.oncontextmenu = (e) => { e.preventDefault(); Markers.setWaypoint(null); this.route = null; };
    const loop = () => { if (G.state !== 'pause' || this.tab !== 'map' || !$('#mapcv')) return; this.drawFullMap(cv); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  },
  drawFullMap(cv) {
    const c = cv.getContext('2d'), M_ = this.map, W = cv.width, H = cv.height, z = M_.zoom; c.fillStyle = '#133a55'; c.fillRect(0, 0, W, H);
    const T = (x, zz) => [W / 2 + (x - M_.cx) * z, H / 2 + (zz - M_.cz) * z];
    c.imageSmoothingEnabled = true; const [bx, by] = T(MAP.x0, MAP.z0); c.drawImage(this.mapBase, bx, by, MAP.w * z, MAP.h * z);
    const mc = this.mapCity; const [cx, cy] = T(mc.x0, mc.z0); c.drawImage(mc.c, cx, cy, mc.c.width * mc.s * z, mc.c.height * mc.s * z);
    // Bezirksnamen
    c.fillStyle = 'rgba(255,255,255,.8)'; c.font = `bold ${clamp(14 * z * 5, 10, 22)}px sans-serif`; c.textAlign = 'center';
    const labels = [['Vice Downtown', 0, 0], ['Neon District', 400, 200], ['Marina Shores', 1000, 100], ['Palm Estates', 650, -700], ['Port Maria', 500, 900], ['Rust Yards', -300, 900], ['Sunset Heights', -700, 100], ['Pine Suburbs', -600, -700], ['Aeropuerto', -1950, 100], ['Cabo Verde Hills', -1300, -2200], ['Isla Corazón', TR.ISLAND_POS.x, TR.ISLAND_POS.z]];
    for (const [n, x, zz] of labels) { const [sx, sy] = T(x, zz); c.fillText(n, sx, sy); }
    // Route + Wegpunkt
    if (this.route && this.route.length > 1) { c.strokeStyle = '#ff3b8c'; c.lineWidth = 4; c.beginPath(); this.route.forEach((p, i) => { const [x, y] = T(p[0], p[1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); }
    // POIs
    c.textBaseline = 'middle'; c.font = `${clamp(24 * z * 4, 14, 26)}px sans-serif`;
    let hoverPoi = null;
    const H_ = M_.hover;
    for (const p of city.pois) { const [sx, sy] = T(p.x, p.z); if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue; const icon = SITE_ICON[p.type] || '•'; if (p.type === 'property' && Eco.ownsProp(p.id)) { c.fillStyle = 'rgba(93,255,160,.9)'; c.beginPath(); c.arc(sx, sy, 14, 0, 6.28); c.fill(); } c.fillStyle = '#fff'; c.fillText(icon, sx, sy); if (H_ && Math.hypot(p.x - H_.x, p.z - H_.z) < 22 / z) hoverPoi = p; }
    for (const m of Markers.items) { if (m.hidden || !['mission', 'obj', 'race'].includes(m.type)) continue; const [sx, sy] = T(m.x, m.z); c.fillStyle = m.type === 'race' ? '#b36bff' : '#ffd23a'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, 9, 0, 6.28); c.fill(); c.stroke(); if (m.icon || m.label) { c.fillStyle = '#000'; c.font = 'bold 12px sans-serif'; c.fillText(m.icon || 'M', sx, sy); c.font = `${clamp(24 * z * 4, 14, 26)}px sans-serif`; } if (H_ && Math.hypot(m.x - H_.x, m.z - H_.z) < 22 / z && m.label) hoverPoi = { name: m.label, type: 'story' }; }
    if (Markers.waypoint) { const [sx, sy] = T(Markers.waypoint.x, Markers.waypoint.z); c.fillStyle = '#ff3b5c'; c.beginPath(); c.arc(sx, sy, 10, 0, 6.28); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); }
    for (const v of G.entities.vehicles) if (v.owned && !v.wreck) { const [sx, sy] = T(v.pos.x, v.pos.z); c.fillStyle = '#5dffa0'; c.fillText('🚘', sx, sy); }
    // Spieler
    const pl = G.player; const [px, py] = T(pl.pos.x, pl.pos.z); c.save(); c.translate(px, py); c.rotate(-(pl.vehicle ? pl.vehicle.yaw : pl.yaw) + Math.PI); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    const tip = $('#maptip'); if (tip) tip.innerHTML = hoverPoi ? `<b>${hoverPoi.name}</b><br>${TYPE_LABEL[hoverPoi.type] || ''}${H_ ? `<br>${Math.round(Math.hypot(hoverPoi.x - pl.pos.x, hoverPoi.z - pl.pos.z)) || ''} m` : ''}` : (H_ ? `${DISTRICT_NAMES[districtAt(H_.x, H_.z)] || ''}${streetAt(H_.x, H_.z) ? ' · ' + streetAt(H_.x, H_.z) : ''}<br><span style="opacity:.7">Klick = Wegpunkt setzen</span>` : '');
  },
  updateRoute() {
    const w = Markers.waypoint, pl = G.player; if (!w) { this.route = null; return; }
    const inCity = (x, z) => x > -1180 && z > -1180 && x < 1260 && z < 1260;
    this.route = inCity(pl.pos.x, pl.pos.z) && inCity(w.x, w.z) ? routeBetween(pl.pos.x, pl.pos.z, w.x, w.z) : [[pl.pos.x, pl.pos.z], [w.x, w.z]];
  },
  // ---- Missionen ----
  pane_missions(pane) {
    const av = Missions.available(), done = G.profile.story.done, act = Missions.active;
    const wpBtn = (x, z, label = 'Wegpunkt') => `<button class="btn small alt" data-wp="${x},${z}">${label}</button>`;
    pane.innerHTML = `<h3>Aktuelle Mission</h3>${act ? `<div class="card"><h4>${act.def.title}</h4><div class="meta">${act.text || ''}</div><div><button class="btn small alt" data-abort="1">Mission abbrechen</button></div></div>` : '<div class="meta">Keine aktive Mission. Gehe zu einem gelben Marker (★ auf der Karte).</div>'}
    <h3 style="margin-top:18px">Story</h3><div class="list">${Missions.defs.map((d, i) => { const dn = done.includes(d.id), ok = !dn && av.includes(d); const g = d.giver; return `<div style="opacity:${dn || ok ? 1 : .45}"><span><b>${i + 1}. ${d.title}</b><br><span class="meta">${dn ? '✔ abgeschlossen' : ok ? 'Verfügbar · Belohnung ' + fmtMoney(d.reward) : '🔒 gesperrt'}</span></span>${ok ? wpBtn(Math.round(g.x), Math.round(g.z), 'Zeigen') : ''}</div>`; }).join('')}</div>
    <h3 style="margin-top:18px">Straßenrennen</h3><div class="list">${RACES.map((r) => { const b = G.profile.side.races[r.id]; const sp = { x: r.start.k * P + r.start.off, z: r.start.l * P + 3.5 }; return `<div><span><b>${r.name}</b> <span class="chip">${r.rating}</span><br><span class="meta">Preise: ${r.reward.map(fmtMoney).join(' / ')} · ${b ? 'Bestzeit ' + b.toFixed(1) + ' s' : 'noch nicht gefahren'}</span></span>${wpBtn(Math.round(sp.x), Math.round(sp.z), 'Start zeigen')}</div>`; }).join('')}</div>
    <h3 style="margin-top:18px">Nebenjobs</h3><div class="list"><div><span><b>Taxi-Dienst</b><br><span class="meta">Steige in ein Taxi (gelb) und drücke T.</span></span></div><div><span><b>Lieferjob</b><br><span class="meta">An einer Burger Barn drücken: E.</span></span></div><div><span><b>Stunt-Sprünge</b><br><span class="meta">Gelbe Rampen in der Stadt. ${Object.keys(G.profile.side.stunts).length}/9 gefunden.</span></span></div><div><span><b>Zufallsereignisse</b><br><span class="meta">Diebe, Flüchtige und Überfälle tauchen in der Stadt auf.</span></span></div></div>`;
    pane.onclick = (e) => { const w = e.target.closest('[data-wp]'); if (w) { const [x, z] = w.dataset.wp.split(',').map(Number); Markers.setWaypoint(x, z); this.updateRoute(); this.toast('📍 Wegpunkt gesetzt'); } if (e.target.closest('[data-abort]')) { Missions.abort(); this.renderMenu(); } };
  },
  // ---- Handy ----
  pane_phone(pane) {
    const rec = G.profile.garage;
    pane.innerHTML = `<h3>Kontakte</h3><div class="grid">
      <div class="card"><h4>🚕 Taxi</h4><div class="meta">Schnellreise zum Wegpunkt. Kosten: $60 + $0.15/m</div><button class="btn small" data-taxi="1" ${Markers.waypoint ? '' : 'disabled'}>Zum Wegpunkt fahren</button></div>
      <div class="card"><h4>🔧 Mechaniker</h4><div class="meta">Lässt dein Auto aus der Garage zu dir liefern ($250).</div>${rec.length ? rec.map((r) => `<button class="btn small alt" data-call="${r.uid}">${BY_ID[r.id].name}</button>`).join('') : '<div class="meta">Keine Fahrzeuge.</div>'}</div>
      <div class="card"><h4>🏠 Nach Hause</h4><div class="meta">Zeige den Weg zu deiner Hauptimmobilie.</div><button class="btn small" data-home="1">Wegpunkt Zuhause</button></div>
      <div class="card"><h4>🕐 Warten</h4><div class="meta">Spielzeit um 1 Stunde vorspulen.</div><button class="btn small alt" data-wait="1">+1 Std.</button></div></div>
      <h3 style="margin-top:20px">Cheat-Konsole</h3><div class="row"><input type="text" id="cheat" placeholder="Code eingeben und Enter (z. B. GELD, REGEN, NACHT, FAHNDUNG, PANZER, FLUG, ARMOR, WAFFEN, WOLKEN, GOTT)" /></div><div class="meta" id="cheatmsg"></div>`;
    pane.onclick = (e) => {
      if (e.target.closest('[data-taxi]')) { const w = Markers.waypoint, pl = G.player; if (!w) return; const d = Math.hypot(w.x - pl.pos.x, w.z - pl.pos.z); const cost = Math.round(60 + d * 0.15); if (!Eco.spend(cost)) return; this.closeMenu(); G.fastTravel(w.x, w.z); }
      const c = e.target.closest('[data-call]'); if (c) { const r = G.profile.garage.find((x) => x.uid == c.dataset.call); if (r && Eco.spend(250)) { this.closeMenu(); G.deliverVehicle(r); } }
      if (e.target.closest('[data-home]')) { const h = city.sites[G.profile.home]; if (h) { Markers.setWaypoint(h.x, h.z); this.updateRoute(); this.toast('📍 Wegpunkt gesetzt'); } }
      if (e.target.closest('[data-wait]')) { G.hour += 1; if (G.hour >= 24) { G.hour -= 24; G.day++; } this.toast('🕐 Eine Stunde vergangen'); }
    };
    const inp = $('#cheat'); inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { const m = G.cheatCode(inp.value.trim().toUpperCase()); $('#cheatmsg').textContent = m; inp.value = ''; } };
  },
  // ---- Charakter ----
  pane_char(pane) {
    const pl = G.player, L = pl.look; const sw = (arr, key, val) => arr.map((c) => `<button class="sw ${val === c ? 'sel' : ''}" style="background:${hex(c)}" data-k="${key}" data-v="${c}"></button>`).join('');
    const sel = (arr, key, val) => `<select data-sel="${key}">${arr.map((n, i) => `<option value="${i}" ${i === val ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    const owned = G.profile.owned.outfits;
    pane.innerHTML = `<h3>Outfits</h3><div class="row">${OUTFITS.map((o) => `<button class="btn small ${L.outfit === o.id ? '' : 'alt'}" data-outfit="${o.id}" ${owned.includes(o.id) ? '' : 'disabled'}>${o.name}</button>`).join('')}</div>
    <div class="meta">Weitere Outfits gibt es bei Threadz Fashion / Urban Threads.</div>
    <h3 style="margin-top:14px">Aussehen</h3>
    <div class="row">Geschlecht: <button class="btn small ${!L.female ? '' : 'alt'}" data-g="0">Männlich</button><button class="btn small ${L.female ? '' : 'alt'}" data-g="1">Weiblich</button></div>
    <div class="row">Haut: ${sw(SKINS, 'skin', L.skin)}</div>
    <div class="row">Frisur: ${sel(HAIR_STYLES, 'hair', L.hair)} Haarfarbe: ${sw(HAIR_COLORS, 'hairColor', L.hairColor)}</div>
    <div class="row">Oberteil: ${sel(TOP_TYPES, 'top', L.top)}</div><div class="row">${sw(COLOR_SWATCH, 'topColor', L.topColor)}</div>
    <div class="row">Unterteil: ${sel(BOTTOM_TYPES, 'bottom', L.bottom)}</div><div class="row">${sw(COLOR_SWATCH, 'bottomColor', L.bottomColor)}</div>
    <div class="row">Schuhe: ${sel(SHOE_TYPES, 'shoe', L.shoe)}</div><div class="row">${sw(COLOR_SWATCH, 'shoeColor', L.shoeColor)}</div>
    <div class="row">Kopfbedeckung: ${sel(HATS, 'hat', L.hat)} <label><input type="checkbox" data-gl="1" ${L.glasses ? 'checked' : ''}> Sonnenbrille</label></div>`;
    const apply = (patch) => { const nl = { ...pl.look, ...patch, outfit: patch.outfit !== undefined ? patch.outfit : 'custom' }; pl.setLook(nl); this.pane_char(pane); };
    pane.onclick = (e) => { const s = e.target.closest('[data-k]'); if (s) { apply({ [s.dataset.k]: +s.dataset.v }); return; } const o = e.target.closest('[data-outfit]'); if (o) { const of = OUTFITS.find((x) => x.id === o.dataset.outfit); apply({ ...of.look, outfit: of.id }); return; } const g = e.target.closest('[data-g]'); if (g) apply({ female: g.dataset.g === '1' }); };
    pane.onchange = (e) => { const s = e.target.closest('[data-sel]'); if (s) apply({ [s.dataset.sel]: +s.value }); if (e.target.dataset.gl) apply({ glasses: e.target.checked }); };
  },
  // ---- Inventar ----
  pane_inv(pane) {
    const pr = G.profile, pl = G.player;
    pane.innerHTML = `<h3>Waffen</h3><div class="grid">${WEAPON_ORDER.filter((w) => w === 'fist' || pr.weapons[w]).map((id) => { const w = WEAPONS[id], d = pr.weapons[id]; return `<div class="card ${pl.weaponId === id ? 'sel' : ''}"><h4>${w.icon} ${w.name}</h4><div class="meta">${w.mag ? `Magazin ${d.mag}/${w.mag} · Reserve ${d.ammo}` : w.throw ? `Anzahl ${d.ammo}` : 'Nahkampf'}</div><button class="btn small" data-w="${id}">Ausrüsten</button></div>`; }).join('')}</div>
    <h3 style="margin-top:18px">Gegenstände</h3><div class="grid">${Object.keys(ITEMS).filter((i) => (pr.inv[i] || 0) > 0 || i === 'phone').map((id) => { const it = ITEMS[id]; return `<div class="card"><h4>${it.icon} ${it.name} ${id === 'phone' ? '' : '× ' + (pr.inv[id] || 0)}</h4><div class="meta">${it.desc}</div>${id === 'phone' ? '<button class="btn small alt" data-tab2="phone">Öffnen</button>' : '<button class="btn small" data-use="' + id + '">Benutzen</button>'}</div>`; }).join('')}</div>
    <h3 style="margin-top:18px">Geld</h3><div class="stat"><span>Bargeld</span><b>${fmtMoney(pr.money)}</b></div>`;
    pane.onclick = (e) => { const w = e.target.closest('[data-w]'); if (w) { pl.setWeapon(w.dataset.w); this.pane_inv(pane); } const u = e.target.closest('[data-use]'); if (u) { this.useItem(u.dataset.use); this.pane_inv(pane); } const t = e.target.closest('[data-tab2]'); if (t) { this.tab = t.dataset.tab2; this.renderMenu(); } };
  },
  useItem(id) { const pr = G.profile, pl = G.player; if (!(pr.inv[id] > 0)) return; if (id === 'medkit') { if (pl.hp >= 100) { this.toast('Du bist gesund.'); return; } pl.heal(50); } else if (id === 'armor') pl.armor = 100; else if (id === 'burger') pl.heal(20); else if (id === 'energy') pl.energy = 60; else return; pr.inv[id]--; this.toast(`${ITEMS[id].icon} ${ITEMS[id].name} benutzt`); },
  // ---- Garage ----
  pane_garage(pane) {
    const g = G.profile.garage;
    pane.innerHTML = `<h3>Deine Fahrzeuge (${g.length})</h3>${g.length ? `<div class="grid">${g.map((r) => { const s = BY_ID[r.id], p = r.prop ? Eco.site(r.prop) : null, live = Eco.vehicleSpawned(r); return `<div class="card"><h4>${s.name}</h4><div class="meta">${s.label} · ${s.top} km/h · Kennzeichen ${r.plate}</div><div class="meta">📍 ${live && !p ? 'In der Stadt' : p ? p.name : 'Auf der Straße'} · Zustand ${Math.round(clamp((live ? live.hp : r.hp) / 10, 0, 100))}%</div><div class="row"><span class="sw" style="background:${hex(r.c1)}"></span><button class="btn small alt" data-wp="${r.uid}">Wegpunkt</button><button class="btn small alt" data-sell="${r.uid}">Verkaufen ${fmtMoney(Math.round(s.price * 0.45))}</button></div></div>`; }).join('')}</div>` : '<div class="meta">Kaufe Fahrzeuge im Autohaus oder stiehl welche und parke sie in deiner Garage (E am Immobilien-Marker).</div>'}`;
    pane.onclick = (e) => { const w = e.target.closest('[data-wp]'); if (w) { const r = g.find((x) => x.uid == w.dataset.wp); const live = Eco.vehicleSpawned(r); const p = live ? live.pos : (r.prop ? city.sites[r.prop] : null); if (p) { Markers.setWaypoint(p.x, p.z); this.updateRoute(); this.toast('📍 Wegpunkt gesetzt'); } } const s = e.target.closest('[data-sell]'); if (s) { const r = g.find((x) => x.uid == s.dataset.sell); const live = Eco.vehicleSpawned(r); if (live) Veh.remove(live); G.profile.garage = g.filter((x) => x !== r); Eco.earn(Math.round(BY_ID[r.id].price * 0.45), 'Verkauf'); this.pane_garage(pane); } };
  },
  // ---- Immobilien ----
  pane_props(pane) {
    const props = SITES.filter((s) => s.type === 'property'), biz = SITES.filter((s) => s.type === 'business');
    pane.innerHTML = `<h3>Immobilien</h3><div class="grid">${props.map((s) => { const own = Eco.ownsProp(s.id); return `<div class="card ${own ? 'sel' : ''}"><h4>${s.name}</h4><div class="meta">Garage: ${s.garage} Plätze ${own ? `(${Eco.used(s.id)} belegt)` : ''}</div><div class="price">${s.price ? fmtMoney(s.price) : 'Kostenlos'}</div><div class="row"><button class="btn small alt" data-wp="${s.id}">Wegpunkt</button>${own ? (G.profile.home === s.id ? '<span class="chip">Zuhause</span>' : `<button class="btn small" data-home="${s.id}">Als Zuhause</button>`) : ''}</div></div>`; }).join('')}</div>
    <h3 style="margin-top:18px">Geschäfte</h3><div class="grid">${biz.map((s) => { const own = G.profile.owned.biz[s.id]; return `<div class="card ${own ? 'sel' : ''}"><h4>${s.name}</h4><div class="meta">Einnahmen ${fmtMoney(s.income)} / Tag${own ? ` · ausstehend ${fmtMoney(Eco.bizAccrued(s.id))}` : ''}</div><div class="price">${own ? 'Besitzer' : fmtMoney(s.price)}</div><button class="btn small alt" data-wp="${s.id}">Wegpunkt</button></div>`; }).join('')}</div>`;
    pane.onclick = (e) => { const w = e.target.closest('[data-wp]'); if (w) { const p = city.sites[w.dataset.wp]; Markers.setWaypoint(p.x, p.z); this.updateRoute(); this.toast('📍 Wegpunkt gesetzt'); } const h = e.target.closest('[data-home]'); if (h) { G.profile.home = h.dataset.home; this.pane_props(pane); } };
  },
  // ---- Statistik ----
  pane_stats(pane) {
    const s = G.stats, p = G.profile, sk = p.skills; const cl = p.flags.claimed || {};
    const t = Math.floor(s.played / 60);
    pane.innerHTML = `<h3>Statistik</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"><div>${[['Spielzeit', `${Math.floor(t / 60)} h ${t % 60} min`], ['Zu Fuß', (s.dist / 1000).toFixed(1) + ' km'], ['Mit Fahrzeugen', (s.vdist / 1000).toFixed(1) + ' km'], ['Verdient', fmtMoney(s.earned)], ['Ausgegeben', fmtMoney(s.spent)], ['Missionen', s.missions + ' / ' + Missions.defs.length], ['Verbrechen', s.crimes], ['Eliminierte Gegner', s.kills], ['Fahrzeuge gestohlen', s.stolen], ['Verhaftet', s.arrests], ['Gestorben', s.deaths], ['Längster Sprung', Math.round(s.maxJump) + ' m'], ['Bester Drift', Math.round(s.driftBest) + ' Pkt']].map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('')}</div>
    <div><h3>Fähigkeiten</h3>${[['Schießen', sk.shooting], ['Fahren', sk.driving], ['Ausdauer', sk.stamina], ['Fliegen', sk.flying]].map(([n, v]) => `<div>${n} <span class="meta">${Math.round(v * 100)}%</span><div class="prog"><i style="width:${v * 100}%"></i></div></div>`).join('')}</div></div>
    <h3 style="margin-top:18px">Herausforderungen</h3><div class="list">${CHALLENGES.map((c) => { const cur = c.cur(), pr = clamp(cur / c.goal, 0, 1); return `<div><span style="flex:1"><b>${c.name}</b> <span class="meta">${c.desc}</span><div class="prog"><i style="width:${pr * 100}%"></i></div></span><span>${cl[c.id] ? '✔' : pr >= 1 ? `<button class="btn small" data-claim="${c.id}">+${fmtMoney(c.reward)}</button>` : `<span class="meta">${Math.floor(Math.min(cur, c.goal))}/${c.goal} · ${fmtMoney(c.reward)}</span>`}</span></div>`; }).join('')}</div>`;
    pane.onclick = (e) => { const c = e.target.closest('[data-claim]'); if (c) { claimChallenge(CHALLENGES.find((x) => x.id === c.dataset.claim)); this.pane_stats(pane); } };
  },
  // ---- Einstellungen ----
  pane_settings(pane) {
    const s = G.settings;
    const sl = (k, min, max, step, fmt = (v) => v) => `<input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-s="${k}"> <span class="meta" id="sv_${k}">${fmt(s[k])}</span>`;
    const tg = (k) => `<input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}>`;
    pane.innerHTML = `<h3>Grafik</h3>
    <div class="setrow"><span>Qualität</span><select data-s="quality">${['low', 'medium', 'high', 'ultra'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${{ low: 'Niedrig', medium: 'Mittel', high: 'Hoch', ultra: 'Ultra' }[q]}</option>`).join('')}</select></div>
    <div class="setrow"><span>Schatten</span>${tg('shadows')}</div><div class="setrow"><span>Bloom / Nachbearbeitung</span>${tg('bloom')}</div><div class="setrow"><span>Spiegelungen (Wasser, nasse Straßen) <small class="meta">ab „Hoch“</small></span>${tg('reflections')}</div><div class="setrow"><span>Sonnenstrahlen &amp; Linseneffekte <small class="meta">ab „Hoch“</small></span>${tg('godrays')}</div><div class="setrow"><span>Grafik automatisch anpassen</span>${tg('autoGfx')}</div><div class="setrow"><span>FPS anzeigen</span>${tg('showFps')}</div><div class="setrow"><span>Sichtfeld (FOV)</span><div>${sl('fov', 50, 100, 1)}</div></div><div class="setrow"><span>Kamera-Wackeln</span>${tg('camShake')}</div>
    <h3 style="margin-top:14px">Audio</h3><div class="setrow"><span>Gesamtlautstärke</span><div>${sl('volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}</div></div><div class="setrow"><span>Radio / Musik</span><div>${sl('music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}</div></div>
    <h3 style="margin-top:14px">Steuerung</h3><div class="setrow"><span>Mausempfindlichkeit</span><div>${sl('sens', 0.2, 3, 0.05, (v) => v.toFixed(2))}</div></div><div class="setrow"><span>Maus Y invertieren</span>${tg('invertY')}</div>
    <h3 style="margin-top:14px">Spiel</h3><div class="setrow"><span>Unendlich Munition</span>${tg('infAmmo')}</div><div class="setrow"><span>Verkehrs-/Fußgängerdichte</span><div>${sl('traffic', 0, 2, 0.1, (v) => Math.round(v * 100) + '%')}</div></div><div class="setrow"><span>Zeitgeschwindigkeit</span><div>${sl('timeScale', 0, 5, 0.25, (v) => v + 'x')}</div></div>
    <div class="setrow"><span>Einheit</span><select data-s="units"><option value="kmh" ${s.units === 'kmh' ? 'selected' : ''}>km/h</option><option value="mph" ${s.units === 'mph' ? 'selected' : ''}>mph</option></select></div><div class="setrow"><span>Untertitel</span>${tg('subtitles')}</div><div class="setrow"><span>Touch-Steuerung</span><select data-s="touch">${[['auto', 'Automatisch'], ['on', 'Immer an'], ['off', 'Aus']].map(([v, n]) => `<option value="${v}" ${s.touch === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const upd = (e) => { const t = e.target; const k = t.dataset.s; if (!k) return; let v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value; s[k] = v; const sv = $('#sv_' + k); if (sv) sv.textContent = k === 'fov' ? v : (t.type === 'range' ? (k === 'sens' ? (+v).toFixed(2) : k === 'timeScale' ? v + 'x' : k === 'traffic' || k === 'volume' || k === 'music' ? Math.round(v * 100) + '%' : v) : ''); Save.saveSettings(); G.applySettings(k); };
    pane.oninput = upd; pane.onchange = upd;
  },
  pane_controls(pane) {
    pane.innerHTML = `<h3>Zu Fuß</h3><div class="keys"><div><kbd>W A S D</kbd>Bewegen</div><div><kbd>Maus</kbd>Kamera</div><div><kbd>Shift</kbd>Sprinten</div><div><kbd>Leertaste</kbd>Springen</div><div><kbd>E</kbd>Interagieren / Betreten</div><div><kbd>F</kbd>Fahrzeug betreten / verlassen</div><div><kbd>LMB</kbd>Schießen / Schlagen</div><div><kbd>RMB</kbd>Zielen</div><div><kbd>R</kbd>Nachladen</div><div><kbd>1-7 / Rad</kbd>Waffe wechseln</div><div><kbd>ESC</kbd>Pause</div><div><kbd>M</kbd>Karte</div><div><kbd>I</kbd>Inventar</div><div><kbd>J</kbd>Missionen</div><div><kbd>P</kbd>Handy</div></div>
    <h3 style="margin-top:16px">Fahrzeuge</h3><div class="keys"><div><kbd>W / S</kbd>Gas / Bremse &amp; Rückwärts</div><div><kbd>A / D</kbd>Lenken</div><div><kbd>Leertaste</kbd>Handbremse (Driften)</div><div><kbd>H</kbd>Hupe</div><div><kbd>L</kbd>Licht</div><div><kbd>C</kbd>Kamera wechseln</div><div><kbd>R</kbd>Radiosender wechseln</div><div><kbd>T</kbd>Taxi-Dienst (im Taxi)</div><div><kbd>F</kbd>Aussteigen</div></div>
    <h3 style="margin-top:16px">Flugzeuge &amp; Helikopter</h3><div class="keys"><div><kbd>Shift</kbd>Schub / Steigen</div><div><kbd>Leertaste</kbd>Schub reduzieren / Sinken</div><div><kbd>W / S</kbd>Nase runter / hoch</div><div><kbd>A / D</kbd>Rollen</div><div><kbd>Q / E</kbd>Gieren (Heck)</div></div>`;
  },
  pane_save(pane) {
    const info = Save.info();
    pane.innerHTML = `<h3>Spielstand</h3><div class="card"><h4>${info ? 'Gespeichert: ' + new Date(info.at).toLocaleString('de-DE') : 'Kein Spielstand'}</h4><div class="meta">${info ? fmtMoney(info.money) + ' · ' + info.missions + ' Missionen' : ''}</div><div class="row"><button class="btn" data-save="1">Jetzt speichern</button><button class="btn alt" data-load="1" ${info ? '' : 'disabled'}>Laden</button></div></div>
    <div class="row" style="margin-top:14px"><button class="btn alt" data-title="1">Zum Hauptmenü</button></div><div class="meta" style="margin-top:12px">Das Spiel speichert automatisch nach Missionen und beim Betreten deiner Immobilien.</div>`;
    pane.onclick = (e) => { if (e.target.closest('[data-save]')) { Save.save(); this.pane_save(pane); } if (e.target.closest('[data-load]')) { this.closeMenu(); G.continueGame(true); } if (e.target.closest('[data-title]')) { Save.save(); $('#menu').classList.add('hidden'); G.toTitle(); } };
  },
  // ---------------- Modale Fenster ----------------
  openModal(title, body, onClose) {
    this.closeModal(); const m = el(`<div class="modal"><div class="win"><div class="head"><h2>${title}</h2><span><span id="mmoney" class="price" style="margin-right:16px;font-size:18px">${fmtMoney(G.profile.money)}</span><button class="btn small alt" data-x="1">Schließen</button></span></div><div class="pane" id="mpane"></div></div></div>`);
    this.root.appendChild(m); this.modal = { el: m, onClose };
    if (G.state === 'play') { G.state = 'pause'; this.modalPaused = true; Input.unlock(); }
    this._mOpen = performance.now(); m.addEventListener('click', (e) => { if (performance.now() - this._mOpen < 450) return; if (e.target.closest('[data-x]')) this.closeModal(); });
    const p = $('#mpane', m); if (typeof body === 'function') body(p, m); else p.innerHTML = body; return p;
  },
  refreshMoney() { const m = $('#mmoney'); if (m) m.textContent = fmtMoney(G.profile.money); },
  closeModal() { if (!this.modal) return; const m = this.modal; this.modal = null; m.el.remove(); if (m.onClose) m.onClose(); this.minigame = null; if (this.modalPaused && G.state === 'pause' && $('#menu').classList.contains('hidden')) { G.state = 'play'; Input.lock(document.getElementById('game')); } this.modalPaused = false; },
  openPoi(p) {
    const t = p.type; Audio.play('door');
    const fn = this['shop_' + t]; if (fn) fn.call(this, p); else this.toast(p.name);
  },
  // ---- Kleidung ----
  shop_clothes(p) {
    this.openModal(p.name, (pane) => {
      const draw = () => { const own = G.profile.owned.outfits, cur = G.player.look.outfit;
        pane.innerHTML = `<h3>Outfits</h3><div class="grid">${OUTFITS.map((o) => `<div class="card ${cur === o.id ? 'sel' : ''}"><h4>${o.name}</h4><div class="meta">${TOP_TYPES[o.look.top]} · ${BOTTOM_TYPES[o.look.bottom]}</div><div class="row"><span class="sw" style="background:${hex(o.look.topColor)}"></span><span class="sw" style="background:${hex(o.look.bottomColor)}"></span></div>${own.includes(o.id) ? `<button class="btn small" data-wear="${o.id}">Anziehen</button>` : `<button class="btn small" data-buyo="${o.id}">Kaufen ${fmtMoney(o.price)}</button>`}</div>`).join('')}</div><div class="meta" style="margin-top:12px">Farben und Frisur änderst du jederzeit im Charakter-Menü.</div>`; this.refreshMoney(); };
      draw();
      pane.onclick = (e) => { const w = e.target.closest('[data-wear]'); if (w) { const o = OUTFITS.find((x) => x.id === w.dataset.wear); G.player.setLook({ ...G.player.look, ...o.look, outfit: o.id }); draw(); } const b = e.target.closest('[data-buyo]'); if (b) { const o = OUTFITS.find((x) => x.id === b.dataset.buyo); if (Eco.spend(o.price)) { G.profile.owned.outfits.push(o.id); G.player.setLook({ ...G.player.look, ...o.look, outfit: o.id }); Audio.play('ok'); draw(); } } };
    });
  },
  shop_barber(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Frisur ($60)</h3><div class="row">${HAIR_STYLES.map((n, i) => `<button class="btn small ${G.player.look.hair === i ? '' : 'alt'}" data-h="${i}">${n}</button>`).join('')}</div><h3 style="margin-top:14px">Haarfarbe ($40)</h3><div class="row">${HAIR_COLORS.map((c) => `<button class="sw" style="background:${hex(c)}" data-hc="${c}"></button>`).join('')}</div>`; pane.onclick = (e) => { const h = e.target.closest('[data-h]'); if (h && Eco.spend(60)) { G.player.setLook({ ...G.player.look, hair: +h.dataset.h }); this.shop_barber(p); } const c = e.target.closest('[data-hc]'); if (c && Eco.spend(40)) { G.player.setLook({ ...G.player.look, hairColor: +c.dataset.hc }); this.refreshMoney(); } this.refreshMoney(); }; }); },
  // ---- Waffen ----
  shop_gun(p) {
    this.openModal(p.name, (pane) => {
      const draw = () => { const pr = G.profile; pane.innerHTML = `<h3>Waffen</h3><div class="grid">${WEAPON_ORDER.filter((w) => WEAPONS[w].price > 0).map((id) => { const w = WEAPONS[id], d = pr.weapons[id]; return `<div class="card"><h4>${w.icon} ${w.name}</h4><div class="meta">Schaden ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · ${w.melee ? 'Nahkampf' : 'Magazin ' + (w.mag || '—')}</div>${d ? `<div class="meta">Munition: ${d.mag}+${d.ammo}</div>${w.ammoPrice ? `<button class="btn small" data-ammo="${id}">+${w.ammoPack} Munition ${fmtMoney(w.ammoPrice)}</button>` : ''}` : `<button class="btn small" data-buyw="${id}">Kaufen ${fmtMoney(w.price)}</button>`}</div>`; }).join('')}</div><h3 style="margin-top:16px">Ausrüstung</h3><div class="grid">${['armor', 'medkit'].map((i) => `<div class="card"><h4>${ITEMS[i].icon} ${ITEMS[i].name}</h4><div class="meta">${ITEMS[i].desc}</div><button class="btn small" data-item="${i}">Kaufen ${fmtMoney(ITEMS[i].price)}</button></div>`).join('')}</div>`; this.refreshMoney(); };
      draw();
      pane.onclick = (e) => { const b = e.target.closest('[data-buyw]'); if (b) { const w = WEAPONS[b.dataset.buyw]; if (Eco.spend(w.price)) { G.player.addWeapon(w.id, w.ammoPack || 0); if (w.mag) G.profile.weapons[w.id].mag = w.mag; Audio.play('ok'); draw(); } } const a = e.target.closest('[data-ammo]'); if (a) { const w = WEAPONS[a.dataset.ammo]; if (Eco.spend(w.ammoPrice)) { G.profile.weapons[w.id].ammo += w.ammoPack; draw(); } } const it = e.target.closest('[data-item]'); if (it) { const i = ITEMS[it.dataset.item]; if (Eco.spend(i.price)) { if (it.dataset.item === 'armor') { G.player.armor = 100; this.toast('🛡️ Weste angelegt'); } else G.profile.inv.medkit = (G.profile.inv.medkit || 0) + 1; draw(); } } };
    });
  },
  shop_burger(p) { this.openModal(p.name, (pane) => { const draw = () => { pane.innerHTML = `<h3>Menü</h3><div class="grid">${[['burger', 'Burger', 12], ['energy', 'Energy Drink', 8], ['medkit', 'Verbandskasten', 150]].map(([id, n, pr]) => `<div class="card"><h4>${ITEMS[id].icon} ${n}</h4><div class="meta">${ITEMS[id].desc}</div><button class="btn small" data-b="${id}">Kaufen ${fmtMoney(pr)}</button></div>`).join('')}</div><div class="row" style="margin-top:14px">${Delivery.job ? '' : '<button class="btn" data-job="1">🛵 Lieferjob starten (3 Bestellungen)</button>'}</div>`; this.refreshMoney(); }; draw(); pane.onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { const id = b.dataset.b, pr = { burger: 12, energy: 8, medkit: 150 }[id]; if (Eco.spend(pr)) { G.profile.inv[id] = (G.profile.inv[id] || 0) + 1; if (id === 'burger') { this.useItem('burger'); } draw(); } } if (e.target.closest('[data-job]')) { this.closeModal(); Delivery.start(p); } }; }); },
  shop_gas(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Snacks</h3><div class="grid">${[['burger', 'Sandwich', 12], ['energy', 'Energy Drink', 8]].map(([id, n, pr]) => `<div class="card"><h4>${ITEMS[id].icon} ${n}</h4><div class="meta">${ITEMS[id].desc}</div><button class="btn small" data-b="${id}">Kaufen ${fmtMoney(pr)}</button></div>`).join('')}</div>`; pane.onclick = (e) => { const b = e.target.closest('[data-b]'); if (b) { const id = b.dataset.b, pr = { burger: 12, energy: 8 }[id]; if (Eco.spend(pr)) { G.profile.inv[id] = (G.profile.inv[id] || 0) + 1; this.toast(ITEMS[id].icon + ' gekauft'); this.refreshMoney(); } } }; }); },
  // ---- Autohaus ----
  shop_dealer(p) {
    const classes = ['compact', 'sedan', 'sport', 'super', 'muscle', 'suv', 'pickup', 'van', 'bike', 'boat', 'jetski', 'yacht', 'sail', 'plane', 'heli'];
    let cls = 'sport', color = null;
    this.openModal(p.name + ' – ' + BUYABLE.length + ' Fahrzeuge', (pane) => {
      const draw = () => { const list = BUYABLE.filter((c) => c.cls === cls); pane.innerHTML = `<div class="row">${classes.map((c) => `<button class="btn small ${c === cls ? '' : 'alt'}" data-c="${c}">${CLS[c].label} (${BUYABLE.filter((x) => x.cls === c).length})</button>`).join('')}</div><div class="row">Lackierung: <button class="sw ${color == null ? 'sel' : ''}" style="background:linear-gradient(135deg,#f00,#00f)" data-col="auto" title="Standard"></button>${[0xd62828, 0x1d3557, 0xf1faee, 0x111111, 0xc0c0c0, 0x2a9d8f, 0xe9c46a, 0xf77f00, 0x6a4c93, 0xff4d8d].map((c) => `<button class="sw ${color === c ? 'sel' : ''}" style="background:${hex(c)}" data-col="${c}"></button>`).join('')}</div><div class="grid">${list.map((c) => `<div class="card"><h4>${c.name}</h4><div class="meta">${c.top} km/h · ${c.acc.toFixed(1)} m/s² · ${Math.round(c.mass)} kg</div><div class="prog"><i style="width:${clamp(c.top / 350 * 100, 5, 100)}%"></i></div><div class="price">${fmtMoney(c.price)}</div><button class="btn small" data-buy="${c.id}">Kaufen</button></div>`).join('')}</div>`; this.refreshMoney(); };
      draw();
      pane.onclick = (e) => { const c = e.target.closest('[data-c]'); if (c) { cls = c.dataset.c; draw(); } const co = e.target.closest('[data-col]'); if (co) { color = co.dataset.col === 'auto' ? null : +co.dataset.col; draw(); } const b = e.target.closest('[data-buy]'); if (b) { const rec = Eco.buyVehicle(b.dataset.buy, color); if (rec) { const d = p; const pl = G.player; const sp = (city.dealerSpots[0] || { x: p.x, z: p.z - 20, yaw: 0 }); const v = Eco.materialize(rec, sp.x, sp.z, sp.yaw + Math.PI); if (v && rec.prop == null) { } this.toast('Dein neues Fahrzeug steht vor dem Autohaus.'); draw(); } } };
    });
  },
  // ---- Tuning ----
  shop_tuning(p) {
    this.openModal(p.name, (pane) => { const v = G.player.vehicle; if (!v) { pane.innerHTML = '<div class="meta">Fahre mit einem Fahrzeug hierher.</div>'; return; }
      pane.innerHTML = `<h3>${v.spec.name}</h3><div class="stat"><span>Zustand</span><b>${Math.round(v.hp / 10)}%</b></div><div class="row"><button class="btn" data-rep="1">Reparieren $300</button></div><h3 style="margin-top:14px">Umlackieren ($250)</h3><div class="row">${COLOR_SWATCH.concat([0x111111, 0xd62828, 0x00b4d8, 0xb5179e]).map((c) => `<button class="sw" style="background:${hex(c)}" data-p="${c}"></button>`).join('')}</div><div class="row">Zweitfarbe (Dach): ${[0x111111, 0xffffff, 0xd62828].map((c) => `<button class="sw" style="background:${hex(c)}" data-p2="${c}"></button>`).join('')}</div>`;
      pane.onclick = (e) => { if (e.target.closest('[data-rep]') && Eco.spend(300)) { v.repair(); this.toast('🔧 Repariert'); this.shop_tuning(p); } const c = e.target.closest('[data-p]'); if (c && Eco.spend(250)) { v.setColors(+c.dataset.p, v.c2); if (v.ownRec) v.ownRec.c1 = v.c1; Audio.play('ok'); this.refreshMoney(); } const c2 = e.target.closest('[data-p2]'); if (c2 && Eco.spend(150)) { v.setColors(v.c1, +c2.dataset.p2); if (v.ownRec) v.ownRec.c2 = v.c2; this.refreshMoney(); } }; });
  },
  // ---- Krankenhaus ----
  shop_hospital(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Behandlung</h3><div class="stat"><span>Gesundheit</span><b>${Math.round(G.player.hp)}%</b></div><div class="row"><button class="btn" data-heal="1">Vollständig heilen $100</button></div>`; pane.onclick = (e) => { if (e.target.closest('[data-heal]') && Eco.spend(100)) { G.player.hp = 100; this.toast('➕ Geheilt'); this.shop_hospital(p); } }; }); },
  shop_police(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Polizeirevier</h3><div class="meta">Aktuelle Fahndungsstufe: ${Police.level} ★</div><div class="row"><button class="btn" data-pay="1" ${Police.level ? '' : 'disabled'}>Fahndung ablösen ($${Police.level * 2500})</button></div>`; pane.onclick = (e) => { if (e.target.closest('[data-pay]') && Eco.spend(Police.level * 2500)) { Police.setLevel(0); this.toast('Gegen Kaution freigelassen'); this.closeModal(); } }; }); },
  shop_fire(p) { this.toast('🚒 Die Feuerwehr ist im Einsatz.'); },
  shop_bank(p) { this.openModal(p.name, (pane) => { const draw = () => { pane.innerHTML = `<h3>Konto</h3><div class="stat"><span>Bargeld</span><b>${fmtMoney(G.profile.money)}</b></div><div class="stat"><span>Kontostand</span><b>${fmtMoney(G.profile.bank)}</b></div><div class="row"><button class="btn small" data-d="1000">Einzahlen $1.000</button><button class="btn small" data-d="10000">Einzahlen $10.000</button><button class="btn small alt" data-w="1000">Abheben $1.000</button><button class="btn small alt" data-w="10000">Abheben $10.000</button></div><div class="meta">Auf dem Konto ist dein Geld sicher: bei Verhaftung oder Tod gehen nur Bargeld-Anteile verloren.</div>`; this.refreshMoney(); }; draw(); pane.onclick = (e) => { const d = e.target.closest('[data-d]'), w = e.target.closest('[data-w]'); if (d) { const n = +d.dataset.d; if (G.profile.money >= n) { G.profile.money -= n; G.profile.bank += n; } else this.toast('Nicht genug Bargeld'); } if (w) { const n = +w.dataset.w; if (G.profile.bank >= n) { G.profile.bank -= n; G.profile.money += n; } else this.toast('Nicht genug Guthaben'); } draw(); }; }); },
  // ---- Immobilien / Geschäfte ----
  shop_property(p) {
    const s = p.site, own = Eco.ownsProp(s.id);
    this.openModal(s.name, (pane) => {
      if (!own) { pane.innerHTML = `<h3>Zum Verkauf</h3><div class="card"><h4>${s.name}</h4><div class="meta">Garage mit ${s.garage} Stellplätzen · Speicherpunkt · Kleiderschrank</div><div class="price">${fmtMoney(s.price)}</div><button class="btn" data-buy="1">Kaufen</button></div>`; pane.onclick = (e) => { if (e.target.closest('[data-buy]') && Eco.buyProp(s.id)) this.shop_property(p); }; return; }
      const pl = G.player, v = pl.vehicle;
      pane.innerHTML = `<h3>Dein Zuhause</h3><div class="grid"><div class="card"><h4>💾 Speichern</h4><button class="btn small" data-save="1">Spiel speichern</button></div><div class="card"><h4>🛏 Schlafen</h4><div class="meta">Bis 07:00 schlafen, Gesundheit auffüllen.</div><button class="btn small" data-sleep="1">Schlafen</button></div><div class="card"><h4>👔 Kleiderschrank</h4><button class="btn small alt" data-wardrobe="1">Öffnen</button></div>${v ? `<div class="card"><h4>🅿️ Fahrzeug einparken</h4><div class="meta">${v.spec.name} · Garage ${Eco.used(s.id)}/${s.garage}</div><button class="btn small" data-park="1">Einparken</button></div>` : ''}${G.profile.home !== s.id ? '<div class="card"><h4>🏠 Zuhause</h4><button class="btn small alt" data-home="1">Als Zuhause festlegen</button></div>' : ''}<div class="card"><h4>💰 Verkaufen</h4><div class="meta">${s.start ? 'Startwohnung' : fmtMoney(Math.round(s.price * 0.6))}</div><button class="btn small alt" data-sell="1" ${s.start ? 'disabled' : ''}>Verkaufen</button></div></div>`;
      pane.onclick = (e) => { if (e.target.closest('[data-save]')) { Save.save(); } if (e.target.closest('[data-sleep]')) { this.closeModal(); G.sleep(); } if (e.target.closest('[data-wardrobe]')) { this.closeModal(); this.openMenu('char'); } if (e.target.closest('[data-park]')) { if (!v.ownRec) Eco.claimVehicle(v); const car = v; pl.exitVehicle(true); if (Eco.parkVehicle(car, s.id)) this.closeModal(); } if (e.target.closest('[data-home]')) { G.profile.home = s.id; this.toast('🏠 Zuhause festgelegt'); } if (e.target.closest('[data-sell]')) { if (Eco.sellProp(s.id)) this.closeModal(); } };
    });
  },
  shop_business(p) {
    const s = p.site, own = G.profile.owned.biz[s.id];
    this.openModal(s.name, (pane) => { const draw = () => { if (!own && !G.profile.owned.biz[s.id]) pane.innerHTML = `<h3>Zum Verkauf</h3><div class="card"><h4>${s.name}</h4><div class="meta">Einnahmen: ${fmtMoney(s.income)} / Tag (Spielzeit)</div><div class="price">${fmtMoney(s.price)}</div><button class="btn" data-buy="1">Kaufen</button></div>`; else pane.innerHTML = `<h3>Dein Geschäft</h3><div class="stat"><span>Einnahmen</span><b>${fmtMoney(s.income)} / Tag</b></div><div class="stat"><span>Ausstehend</span><b>${fmtMoney(Eco.bizAccrued(s.id))}</b></div><button class="btn" data-col="1">Einnahmen abholen</button>`; this.refreshMoney(); }; draw(); pane.onclick = (e) => { if (e.target.closest('[data-buy]') && Eco.buyBiz(s.id)) { draw(); } if (e.target.closest('[data-col]')) { Eco.collectBiz(s.id); draw(); } }; });
  },
  // ---- Casino ----
  shop_casino(p) {
    this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Spiele</h3><div class="grid"><div class="card"><h4>🎰 Spielautomat</h4><div class="meta">Drei Walzen, bis zu 100× Gewinn.</div><button class="btn" data-g="slots">Spielen</button></div><div class="card"><h4>🃏 Blackjack</h4><div class="meta">Schlage den Dealer auf 21.</div><button class="btn" data-g="bj">Spielen</button></div></div>`; pane.onclick = (e) => { const g = e.target.closest('[data-g]'); if (g) { if (g.dataset.g === 'slots') this.game_slots(pane, p); else this.game_bj(pane, p); } }; });
  },
  game_slots(pane, p) {
    const sym = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'], pay = { '🍒': 5, '🍋': 8, '🔔': 12, '⭐': 20, '💎': 40, '7️⃣': 100 };
    let bet = 100, spinning = false, res = ['❔', '❔', '❔'];
    const draw = (msg = '') => { pane.innerHTML = `<h3>🎰 Spielautomat</h3><div class="slot">${res.map((r) => `<div class="reel">${r}</div>`).join('')}</div><div class="row" style="justify-content:center">Einsatz: ${[100, 500, 2000, 10000].map((b) => `<button class="btn small ${b === bet ? '' : 'alt'}" data-bet="${b}">${fmtMoney(b)}</button>`).join('')}</div><div class="row" style="justify-content:center"><button class="btn" data-spin="1" ${spinning ? 'disabled' : ''}>DREHEN</button><button class="btn alt" data-back="1">Zurück</button></div><div class="meta" style="text-align:center;font-size:16px;margin-top:10px">${msg}</div>`; this.refreshMoney(); };
    draw();
    pane.onclick = (e) => { const b = e.target.closest('[data-bet]'); if (b) { bet = +b.dataset.bet; draw(); } if (e.target.closest('[data-back]')) this.shop_casino(p) || (this.closeModal(), this.shop_casino(p));
      if (e.target.closest('[data-spin]') && !spinning) { if (!Eco.spend(bet)) return; spinning = true; let n = 0; const iv = setInterval(() => { res = res.map((r, i) => (n < 8 + i * 5 ? pick(sym) : r)); n++; Audio.play('blip'); draw(); if (n > 24) { clearInterval(iv); spinning = false; const [a, b2, c] = res; let win = 0; if (a === b2 && b2 === c) win = bet * pay[a]; else if ([a, b2, c].filter((x) => x === '🍒').length === 2) win = bet * 2; else if (a === b2 || b2 === c || a === c) win = Math.round(bet * 0.5); if (win) { Eco.earn(win, 'Casino'); G.profile.side.slots += win >= bet * 2 ? 1 : 0; Audio.play('win'); } draw(win ? `Gewinn: ${fmtMoney(win)}!` : 'Leider verloren.'); } }, 70); } };
  },
  game_bj(pane, p) {
    const mk = () => { const d = []; for (const s of ['♠', '♥', '♦', '♣']) for (const r of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
    const val = (h) => { let v = 0, a = 0; for (const c of h) { if (c.r === 'A') { a++; v += 11; } else if ('JQK'.includes(c.r)) v += 10; else v += +c.r; } while (v > 21 && a > 0) { v -= 10; a--; } return v; };
    const card = (c, hide) => hide ? '<div class="card-bj back"></div>' : `<div class="card-bj ${'♥♦'.includes(c.s) ? 'red' : ''}"><span>${c.r}</span><span>${c.s}</span></div>`;
    let deck = mk(), pl_ = [], dl = [], bet = 200, phase = 'bet', msg = '';
    const draw = () => { pane.innerHTML = `<h3>🃏 Blackjack</h3>${phase === 'bet' ? `<div class="row">Einsatz: ${[100, 200, 1000, 5000].map((b) => `<button class="btn small ${b === bet ? '' : 'alt'}" data-bet="${b}">${fmtMoney(b)}</button>`).join('')}</div><button class="btn" data-deal="1">Austeilen</button>` : `<div>Dealer ${phase === 'play' ? '' : '(' + val(dl) + ')'}<br>${dl.map((c, i) => card(c, phase === 'play' && i === 1)).join('')}</div><div style="margin-top:10px">Du (${val(pl_)})<br>${pl_.map((c) => card(c)).join('')}</div>${phase === 'play' ? `<div class="row"><button class="btn" data-hit="1">Karte</button><button class="btn alt" data-stand="1">Halten</button><button class="btn alt" data-dbl="1">Verdoppeln</button></div>` : `<div class="row"><button class="btn" data-again="1">Neue Runde</button></div>`}`}<div class="row"><button class="btn small alt" data-back="1">Zurück</button></div><div style="font-size:18px;margin-top:8px">${msg}</div>`; this.refreshMoney(); };
    const end = (res) => { phase = 'done'; if (res === 'win') { Eco.earn(bet * 2, 'Blackjack'); msg = `Gewonnen! +${fmtMoney(bet)}`; Audio.play('win'); } else if (res === 'bj') { Eco.earn(Math.round(bet * 2.5), 'Blackjack'); msg = `Blackjack! +${fmtMoney(bet * 1.5)}`; Audio.play('win'); } else if (res === 'push') { Eco.earn(bet); msg = 'Unentschieden.'; } else msg = `Verloren. -${fmtMoney(bet)}`; draw(); };
    const dealerPlay = () => { while (val(dl) < 17) dl.push(deck.pop()); const a = val(pl_), b = val(dl); if (b > 21 || a > b) end('win'); else if (a === b) end('push'); else end('lose'); };
    draw();
    pane.onclick = (e) => { const b = e.target.closest('[data-bet]'); if (b) { bet = +b.dataset.bet; draw(); } if (e.target.closest('[data-back]')) { this.closeModal(); this.shop_casino(p); return; }
      if (e.target.closest('[data-deal]') || e.target.closest('[data-again]')) { if (deck.length < 15) deck = mk(); if (!Eco.spend(bet)) return; pl_ = [deck.pop(), deck.pop()]; dl = [deck.pop(), deck.pop()]; msg = ''; phase = 'play'; if (val(pl_) === 21) end('bj'); else draw(); }
      if (e.target.closest('[data-hit]')) { pl_.push(deck.pop()); if (val(pl_) > 21) end('lose'); else draw(); } if (e.target.closest('[data-stand]')) dealerPlay();
      if (e.target.closest('[data-dbl]')) { if (!Eco.spend(bet)) return; bet *= 2; pl_.push(deck.pop()); if (val(pl_) > 21) end('lose'); else dealerPlay(); } };
  },
  // ---- Basketball ----
  shop_hoops(p) {
    this.openModal('Basketball – Freiwürfe', (pane) => {
      let shots = 5, hits = 0, t = 0, run = false, raf = 0, zone = [0.42, 0.58];
      const draw = (msg = '') => { pane.innerHTML = `<h3>🏀 Freiwürfe (${shots} übrig · ${hits} Treffer)</h3><div class="powerbar"><div class="zone" style="left:${zone[0] * 100}%;width:${(zone[1] - zone[0]) * 100}%"></div><div class="needle" id="needle"></div></div><div class="row"><button class="btn" data-shoot="1">${run ? 'WERFEN (Leertaste)' : shots ? 'Start' : 'Nochmal'}</button></div><div style="font-size:20px">${msg}</div><div class="meta">Triff die grüne Zone. Pro Treffer $120, ab 3 Treffern Bonus!</div>`; };
      draw();
      const tick = () => { if (!run || !this.modal) return; t += 0.016 * (1.3 + hits * 0.25); const v = (Math.sin(t * 3.2) + 1) / 2; const n = $('#needle'); if (n) n.style.left = (v * 100) + '%'; this._v = v; raf = requestAnimationFrame(tick); };
      const shoot = () => { if (!run) { if (shots === 0) { shots = 5; hits = 0; } run = true; draw(); tick(); return; } const v = this._v; const hit = v > zone[0] && v < zone[1]; shots--; if (hit) { hits++; Eco.earn(120); G.profile.side.hoops++; Audio.play('ok'); } else Audio.play('fail'); if (shots === 0) { run = false; cancelAnimationFrame(raf); if (hits >= 3) Eco.earn(hits * 150); draw(`Ende: ${hits}/5 Treffer${hits >= 3 ? ' – Bonus!' : ''}`); } else draw(hit ? 'Treffer! 🏀' : 'Daneben!'); tick(); this.refreshMoney(); };
      pane.onclick = (e) => { if (e.target.closest('[data-shoot]')) shoot(); };
      this.minigame = { key: (e) => { if (e.code === 'Space') { e.preventDefault(); shoot(); } } };
    });
  },
  shop_story(p) { this.toast('Kein Interesse. Komm mit einem Auftrag.'); },
  shop_airport(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Flughafen</h3><div class="meta">Auf dem Vorfeld stehen Flugzeuge und Hubschrauber bereit – steige mit F ein.</div>`; }); },
  shop_port(p) { this.openModal(p.name, (pane) => { pane.innerHTML = `<h3>Hafen Port Maria</h3><div class="meta">Boote liegen an den Stegen. Steige mit F ein und nutze W/S/A/D.</div>`; }); },
  // ---------------- Credits ----------------
  showCredits() {
    const c = el(`<div id="credits"><div class="roll"><h2>VICE CITY</h2><p>Ein prozedurales Open-World-Spiel</p><h2>STORY</h2><p>Leo Marquez – Hauptfigur</p><p>Mia Santos</p><p>Dante Ruiz</p><p>Don Vance</p><p>Kenji</p><h2>TECHNIK</h2><p>Three.js · WebGL · WebAudio</p><p>Prozedurale Stadt, Fahrzeuge, Wetter und Musik</p><h2>DANKE FÜRS SPIELEN</h2><p>Die Stadt gehört dir.</p></div></div>`);
    this.root.appendChild(c); const close = () => { c.remove(); document.removeEventListener('keydown', k); }; const k = (e) => { if (e.code === 'Escape' || e.code === 'Space') close(); }; document.addEventListener('keydown', k); setTimeout(close, 52000); c.onclick = close;
  },
};
G.ui = UI;
