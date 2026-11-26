// Admin-Panel – nur für das Konto "Entity_2806" (Prüfung im Client, siehe README). Öffnen: 🛡-Knopf oder F9.
import { G, emit } from './game.js';
import { Accounts } from './accounts.js';
import { Multi } from './multi.js';
import { Sec, PERMS, OWNER } from './adminsec.js';
import { Input } from './player.js';
import { Veh } from './vehicles.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Markers } from './markers.js';
import { Combat } from './combat.js';
import { Eco, Save } from './profile.js';
import { CATALOG, CLS as CLSMAP } from './catalog.js';
import * as TR from './terrain.js';
import { city } from './city.js';
import { WEATHER_NAMES } from './sky.js';

const ADMIN = 'entity_2806';
const IN_GAME = new Set(['play', 'pause']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => '$' + Math.round(n).toLocaleString('de-DE');

export const Admin = {
  open: false, root: null, tab: 'player', btn: null, hdrT: 0, wasAdmin: false,
  isAdmin() { return !!(Accounts.user && (Accounts.user.key === ADMIN || Sec.myPerms().length)); },
  has(p) { return !!(Accounts.user && ((Accounts.user.key === ADMIN) || Sec.myPerms().includes(p))); },
  changed() { if (this.open && (this.tab === 'multi' || this.tab === 'tools')) this.render(); },
  C() { return G.cheat || (G.cheat = {}); },
  init() {
    if (this.btn || !Accounts.user) return; G.admin = this;
    const b = document.createElement('button'); b.id = 'adminbtn'; b.textContent = '🛡'; b.title = 'Admin-Panel (F9)'; b.style.display = 'none';
    b.addEventListener('click', () => this.toggle()); document.body.appendChild(b); this.btn = b;
    window.addEventListener('keydown', (e) => { if (e.code === 'F9' && IN_GAME.has(G.state)) { e.preventDefault(); this.toggle(); } });
  },
  toggle() { this.open ? this.close() : this.show(); },
  show() {
    if (!this.isAdmin()) return; if (!this.has('self') && this.tab !== 'multi') this.tab = 'multi'; this.open = true; try { Input.unlock(); } catch (e) { }
    if (!this.root) { this.root = document.createElement('div'); this.root.id = 'adminpanel'; document.body.appendChild(this.root); }
    this.root.style.display = ''; this.render();
  },
  close() { this.open = false; if (this.root) this.root.style.display = 'none'; try { if (!document.body.classList.contains('touch') && G.state === 'play') Input.lock(document.getElementById('game')); } catch (e) { } },
  // ---------- Hilfsfunktionen für die Oberfläche ----------
  el(tag, props = {}, kids = []) { const e = document.createElement(tag); Object.assign(e, props); for (const k of [].concat(kids)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; },
  button(label, fn, cls = '') { const b = this.el('button', { className: 'ab ' + cls, textContent: label }); b.addEventListener('click', () => { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 350); try { fn(b); } catch (e) { emit('toast', 'Fehler: ' + e.message); } this.refreshHdr(); }); return b; },
  toggleBtn(label, get, set) { const b = this.button('', () => { set(!get()); paint(); this.say(label + ': ' + (get() ? 'AN' : 'AUS')); }); const paint = () => { b.textContent = (get() ? '✅ ' : '⬜ ') + label; b.classList.toggle('on', !!get()); }; paint(); return b; },
  group(title, kids) { return this.el('div', { className: 'ag' }, [this.el('h4', { textContent: title }), this.el('div', { className: 'ar' }, kids)]); },
  num(ph, val = '', w = 90) { const i = this.el('input', { type: 'text', inputMode: 'decimal', placeholder: ph, value: val }); i.style.width = w + 'px'; i.addEventListener('keydown', (e) => e.stopPropagation()); return i; },
  txt(ph, val = '', w = 200) { const i = this.el('input', { type: 'text', placeholder: ph, value: val }); i.style.width = w + 'px'; i.addEventListener('keydown', (e) => e.stopPropagation()); return i; },
  say(t) { emit('toast', '🛡 ' + t); this.lastStatus = t; this.paintStatus(true); },
  paintStatus(flash) { const s = this.statusEl; if (!s) return; s.textContent = this.lastStatus ? '✔ ' + this.lastStatus : 'Tippe einen Knopf – hier erscheint die Rückmeldung.'; if (flash) { s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); } },
  pos() { const pl = G.player, v = pl.vehicle; return v ? v.pos : pl.pos; },
  ahead(d = 6) { const pl = G.player; return { x: pl.pos.x + Math.sin(pl.camYaw) * d, z: pl.pos.z + Math.cos(pl.camYaw) * d }; },
  tp(x, z) {
    const pl = G.player; if (!Number.isFinite(x) || !Number.isFinite(z)) return this.say('Ungültige Koordinaten');
    if (pl.vehicle) { const v = pl.vehicle; v.pos.set(x, v.kind === 'plane' || v.kind === 'heli' ? v.pos.y : 0, z); v.vel.set(0, 0, 0); const ph = G.terrainY ? G.terrainY(x, z) : 0; if (v.kind !== 'plane' && v.kind !== 'heli') v.pos.y = ph + 0.5; }
    else pl.teleport(x, z); G.cameraSnap = true; this.say(`Teleport → ${Math.round(x)} / ${Math.round(z)}`);
  },
  // ---------- Panel ----------
  render() {
    const all = [['player', '🧍 Ich'], ['veh', '🚗 Fahrzeuge'], ['world', '🌍 Welt'], ['mission', '🎯 Missionen'], ['tp', '📍 Teleport'], ['multi', '👥 Spieler'], ['tools', '🛠 Werkzeuge']];
    const tabs = all.filter(([k]) => k === 'multi' || this.has('self'));
    this.root.innerHTML = '';
    const head = this.el('div', { className: 'ahead' }, [
      this.el('b', { textContent: '🛡 Admin-Panel · ' + (Accounts.user ? Accounts.user.name : '') + (Accounts.user && Accounts.user.key === ADMIN ? ' · Haupt-Admin' : ' · Admin') }), this.el('span', { className: 'ainfo' }),
      this.button('✕', () => this.close(), 'x'),
    ]); this.info = head.querySelector('.ainfo');
    const bar = this.el('div', { className: 'atabs' }, tabs.map(([k, n]) => { const b = this.button(n, () => { this.tab = k; this.render(); }, k === this.tab ? 'on' : ''); return b; }));
    const body = this.el('div', { className: 'abody' }); this['tab_' + this.tab](body);
    this.statusEl = this.el('div', { className: 'astatus' }); this.root.append(head, bar, body, this.statusEl); this.paintStatus(false); this.refreshHdr();
  },
  refreshHdr() {
    if (!this.open || !this.info || !G.player) return; const pl = G.player, p = this.pos();
    this.info.textContent = `x ${Math.round(p.x)} · y ${Math.round(p.y)} · z ${Math.round(p.z)} · HP ${Math.round(pl.hp)} · ${fmt(G.profile.money)} · ★${Police.level}`;
  },
  // ---------- Spieler ----------
  tab_player(b) {
    const C = this.C(), pl = G.player, A = (...k) => b.append(...k);
    A(this.group('Unverwundbarkeit & Ausdauer', [
      this.toggleBtn('Gott-Modus', () => !!C.god, (v) => (C.god = v)),
      this.toggleBtn('Fahrzeug unzerstörbar', () => !!C.vgod, (v) => (C.vgod = v)),
      this.toggleBtn('Unendlich Munition', () => !!G.settings.infAmmo, (v) => { G.settings.infAmmo = v; Save.saveSettings(); }),
      this.toggleBtn('Auto-Aim', () => G.settings.autoAim !== false, (v) => { G.settings.autoAim = v; Save.saveSettings(); }),
      this.toggleBtn('Unendlich Ausdauer', () => !!C.stamina, (v) => (C.stamina = v)),
      this.toggleBtn('Schnellfeuer (kein Nachladen)', () => !!C.rapid, (v) => (C.rapid = v)),
      this.toggleBtn('Nie gesucht', () => !!C.noWanted, (v) => { C.noWanted = v; if (v) Police.setLevel(0); }),
    ]));
    A(this.group('Gesundheit', [
      this.button('Heilen', () => { pl.hp = pl.maxHp || 100; this.say('Geheilt'); }), this.button('Rüstung voll', () => { pl.armor = 100; }),
      this.button('Beides + Ausdauer', () => { pl.hp = pl.maxHp || 100; pl.armor = 100; pl.stamina = 1; }), this.button('Respawn', () => { pl.revive(); }), this.button('Selbstmord', () => pl.damage(9999, null), 'warn'),
    ]));
    const mi = this.num('Betrag', '1000000', 110);
    A(this.group('Geld', [this.button('+10.000', () => Eco.earn(10000)), this.button('+1 Mio', () => Eco.earn(1e6)), this.button('+100 Mio', () => Eco.earn(1e8)), this.button('−10.000', () => { G.profile.money = Math.max(0, G.profile.money - 1e4); }),
      mi, this.button('Setzen', () => { const n = +mi.value; if (Number.isFinite(n) && n >= 0) G.profile.money = Math.round(n); }), this.button('Addieren', () => { const n = +mi.value; if (Number.isFinite(n)) Eco.earn(Math.round(n)); })]));
    A(this.group('Fahndung', [0, 1, 2, 3, 4, 5].map((l) => this.button(l ? '★'.repeat(l) : 'Aus', () => Police.setLevel(l)))));
    A(this.group('Waffen', [this.button('Alle Waffen + Munition', () => this.say(G.cheatCode('WAFFEN'))), this.button('Waffen entfernen', () => { G.profile.weapons = {}; pl.setWeapon('fist'); }, 'warn')]));
    A(this.group('Lauftempo', [1, 2, 4, 8, 16].map((s) => this.button('×' + s, () => { C.speed = s === 1 ? 0 : s; this.say('Tempo ×' + s); }, (C.speed || 1) === s ? 'on' : ''))));
    A(this.group('Supersprung', [1, 2, 4, 8].map((s) => this.button('×' + s, () => { C.jump = s === 1 ? 0 : s; this.say('Sprung ×' + s); }, (C.jump || 1) === s ? 'on' : ''))));
    A(this.group('Bewegung', [this.toggleBtn('Fliegen / Noclip (Leertaste hoch, Q runter, Shift schnell)', () => !!C.fly, (v) => { C.fly = v; }), this.button('Auf den Boden', () => { pl.teleport(pl.pos.x, pl.pos.z); })]));
    A(this.group('Fähigkeiten', [this.button('Alle Fähigkeiten max', () => { for (const k of Object.keys(G.profile.skills)) G.profile.skills[k] = 1; this.say('Fähigkeiten auf Maximum'); })]));
  },
  // ---------- Fahrzeuge ----------
  tab_veh(b) {
    const pl = G.player, st = this.vst || (this.vst = { cls: '', enter: true, color: null, n: 1 });
    const q = this.txt('Fahrzeug suchen …', '', 220), list = this.el('div', { className: 'alist' });
    const COLORS = [['Zufall', null], ['Rot', 0xc81e1e], ['Blau', 0x1e4fc8], ['Schwarz', 0x111111], ['Weiß', 0xf2f2f2], ['Gelb', 0xf0c419], ['Grün', 0x1e8a3c], ['Pink', 0xff3dbb], ['Orange', 0xff7a1a]];
    const waterSpot = () => { const x0 = pl.pos.x, z0 = pl.pos.z; for (let r = 20; r <= 3000; r += 50) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = x0 + Math.sin(a) * r, z = z0 + Math.cos(a) * r; if (TR.terrainHeight(x, z) < TR.WATER - 1.2) return { x, z }; } return null; };
    const spawn = (c, enter) => {
      const sp = CLS_KIND(c); let a = this.ahead(7 + (st.n > 1 ? 0 : 0));
      if (sp === 'boat') { const w = waterSpot(); if (!w) { this.say('Kein Wasser in der Nähe – Boote gehen nur am Wasser'); return null; } a = w; }
      const out = [];
      for (let i = 0; i < st.n; i++) {
        const off = st.n > 1 ? { x: Math.cos(pl.camYaw) * (i - (st.n - 1) / 2) * 3.6, z: -Math.sin(pl.camYaw) * (i - (st.n - 1) / 2) * 3.6 } : { x: 0, z: 0 };
        const v = Veh.spawn(c.id, a.x + off.x, a.z + off.z, pl.camYaw, st.color != null ? { c1: st.color } : {}); if (!v) continue; v.keep = true; v.parked = false; if (sp === 'heli') v.pos.y += 3; out.push(v);
      }
      if (out[0] && enter) pl.enterVehicle(out[0]); if (sp === 'boat' && out[0] && !enter) this.say('Boot gespawnt am Wasser (' + Math.round(a.x) + ' / ' + Math.round(a.z) + ')');
      this.say(out.length + '× ' + c.name + ' gespawnt'); return out[0];
    };
    const CLS_KIND = (c) => c.kind || (CLSMAP[c.cls] && CLSMAP[c.cls].kind) || 'car';
    const draw = () => {
      list.innerHTML = ''; const s = q.value.trim().toLowerCase(); let n = 0;
      for (const c of CATALOG) { if (st.cls && c.cls !== st.cls) continue; if (s && !(c.name.toLowerCase().includes(s) || String(c.cls).includes(s) || c.id.includes(s))) continue; if (++n > 120) break;
        const it = this.button(`${c.name} · ${(CLSMAP[c.cls] && CLSMAP[c.cls].label) || c.cls}${c.price ? ' · ' + fmt(c.price) : ''}`, () => { st.sel = c; for (const x of list.children) x.classList && x.classList.remove('sel'); it.classList.add('sel'); selLbl.textContent = 'Ausgewählt: ' + c.name; this.say('Ausgewählt: ' + c.name + ' – jetzt SPAWN drücken'); }, 'li' + (st.sel && st.sel.id === c.id ? ' sel' : '')); list.append(it); }
      if (!n) list.append('Nichts gefunden.');
    };
    q.addEventListener('input', draw);
    const selLbl = this.el('span', { className: 'asel', textContent: st.sel ? 'Ausgewählt: ' + st.sel.name : 'Kein Fahrzeug ausgewählt – unten in der Liste eines antippen' });
    const spawnBtn = this.button('🚗 SPAWN', () => { if (!st.sel) return this.say('Erst unten in der Liste ein Fahrzeug antippen'); spawn(st.sel, st.enter && st.n === 1); }, 'on big');
    const cur = () => pl.vehicle;
    const chips = this.el('div', { className: 'ar' }, [this.button('Alle', () => { st.cls = ''; this.render(); }, st.cls === '' ? 'on' : ''), ...Object.keys(CLSMAP).map((k) => this.button(CLSMAP[k].label, () => { st.cls = k; this.render(); }, st.cls === k ? 'on' : ''))]);
    b.append(this.group('Aktuelles Fahrzeug', [
      this.button('Reparieren', () => { const v = cur(); if (!v) return this.say('Du sitzt in keinem Fahrzeug'); v.hp = 1000; v.burning = 0; v.dead = false; v.wreck = false; v.exploded = false; v.damageFlash = 0; this.say('Repariert'); }),
      this.button('Umdrehen', () => { const v = cur(); if (!v) return; v.roll = 0; v.pitch = 0; v.pos.y += 1.5; v.vel.set(0, 0, 0); }),
      this.button('Nitro', () => { const v = cur(); if (!v) return; v.vel.x *= 1.8; v.vel.z *= 1.8; }), this.button('Stoppen', () => { const v = cur(); if (v) { v.vel.set(0, 0, 0); v.speed = 0; } }),
      this.button('Löschen', () => { const v = cur(); if (!v) return; pl.exitVehicle(true); Veh.remove(v); }, 'warn'),
      this.toggleBtn('Unzerstörbar', () => !!this.C().vgod, (v) => (this.C().vgod = v)),
    ]));
    b.append(this.group('Aufräumen', [
      this.button('Alle NPC-Fahrzeuge löschen', () => { let n = 0; for (const v of [...G.entities.vehicles]) if (v !== pl.vehicle && !v.owned && !v.keep && !v.isDisplay) { Veh.remove(v); n++; } this.say(n + ' Fahrzeuge entfernt'); }, 'warn'),
      this.button('Wracks löschen', () => { let n = 0; for (const v of [...G.entities.vehicles]) if (v.wreck && v !== pl.vehicle) { Veh.remove(v); n++; } this.say(n + ' Wracks entfernt'); }),
    ]));
    b.append(this.group('Spawn-Optionen', [this.toggleBtn('Nach dem Spawn einsteigen (nur bei 1 Stück)', () => st.enter, (v) => (st.enter = v)),
      ...[1, 3, 5, 10].map((n) => this.button('×' + n, () => { st.n = n; this.render(); }, st.n === n ? 'on' : ''))]));
    b.append(this.group('Farbe', COLORS.map(([n, c]) => this.button(n, () => { st.color = c; this.render(); }, st.color === c ? 'on' : ''))));
    b.append(this.group('Kategorie', [chips]));
    list.style.maxHeight = '30vh'; // Spawn-Leiste, Suche und Liste stehen ganz oben, die Optionen darunter
    b.prepend(list); b.prepend(this.group('Fahrzeug suchen (' + CATALOG.length + ' Modelle)', [q])); b.prepend(this.el('div', { className: 'aspawn' }, [selLbl, spawnBtn])); draw();
  },
  // ---------- Welt ----------
  tab_world(b) {
    const C = this.C(), pl = G.player;
    const hr = this.el('input', { type: 'range', min: 0, max: 24, step: 0.1, value: G.hour }), hl = this.el('span', { textContent: this.hh(G.hour) });
    hr.addEventListener('input', () => { G.hour = +hr.value % 24; if (C.freezeTime) C._hour = G.hour; hl.textContent = this.hh(G.hour); });
    const ts = this.el('input', { type: 'range', min: 0, max: 20, step: 0.5, value: G.settings.timeScale }), tl = this.el('span', { textContent: G.settings.timeScale + '×' });
    ts.addEventListener('input', () => { G.settings.timeScale = +ts.value; tl.textContent = ts.value + '×'; Save.saveSettings(); });
    const tr = this.el('input', { type: 'range', min: 0, max: 3, step: 0.1, value: G.settings.traffic }), trl = this.el('span', { textContent: Math.round(G.settings.traffic * 100) + '%' });
    tr.addEventListener('input', () => { G.settings.traffic = +tr.value; trl.textContent = Math.round(tr.value * 100) + '%'; Save.saveSettings(); });
    b.append(this.group('Uhrzeit', [hr, hl, this.button('Morgen', () => { G.hour = 7; }), this.button('Mittag', () => { G.hour = 12; }), this.button('Abend', () => { G.hour = 18.9; }), this.button('Nacht', () => { G.hour = 23; }),
      this.toggleBtn('Zeit einfrieren', () => !!C.freezeTime, (v) => { C.freezeTime = v; C._hour = G.hour; })]));
    b.append(this.group('Zeitgeschwindigkeit', [ts, tl]));
    b.append(this.group('Wetter', [...Object.entries(WEATHER_NAMES).map(([k, n]) => this.button(n, () => { G.weather.set(k, true); G.weather.forced = k; })), this.button('Automatisch', () => { G.weather.forced = null; })]));
    b.append(this.group('Verkehrsdichte (Neuladen/Respawn wirkt)', [tr, trl]));
    b.append(this.group('Passanten', [this.button('+10 spawnen', () => this.spawnPeds(10)), this.button('+40 spawnen', () => this.spawnPeds(40)), this.button('Alle löschen', () => { for (const p of [...Peds.list]) Peds.remove(p); this.say('Passanten entfernt'); }, 'warn')]));
    b.append(this.group('Chaos', [
      this.button('Explosion vor mir', () => { const a = this.ahead(10); Combat.explode(a.x, pl.pos.y + 1, a.z, 12, 300, null); }),
      this.button('Explosion bei mir', () => { Combat.explode(pl.pos.x, pl.pos.y + 1, pl.pos.z, 10, 150, null); }, 'warn'),
      this.button('Alle Passanten fliehen', () => { for (const p of Peds.list) { if (p.state !== undefined && p.role === 'civ') p.state = 'flee'; } }),
    ]));
  },
  hh(h) { const m = Math.round(h * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
  spawnPeds(n) { const pl = G.player; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, d = 6 + Math.random() * 30; const p = Peds.spawnAt(pl.pos.x + Math.sin(a) * d, pl.pos.z + Math.cos(a) * d, 'civ'); if (p) p.noRemove = false; } this.say(n + ' Passanten gespawnt'); },
  // ---------- Missionen ----------
  tab_mission(b) {
    const M = Missions, a = M.active;
    b.append(this.group('Aktuell: ' + (a && a.def ? a.def.title : a ? a.id || 'Mission' : 'keine'), [
      this.button('Abbrechen', () => { M.abort(); this.render(); }), this.button('Abschließen', () => { if (M.active) M.complete(); else this.say('Keine aktive Mission'); this.render(); }),
    ]));
    b.append(this.group('Alle Missionen', [
      this.button('Alle abschließen (freischalten)', () => { for (const d of M.defs) if (!G.profile.story.done.includes(d.id)) G.profile.story.done.push(d.id); M.refreshMarkers(); this.say('Alle Missionen als erledigt markiert'); }),
      this.button('Fortschritt zurücksetzen', () => { if (confirm('Missionsfortschritt wirklich zurücksetzen?')) { G.profile.story.done.length = 0; M.abort(); M.refreshMarkers(); } }, 'warn'),
    ]));
    const list = this.el('div', { className: 'alist' });
    for (const d of M.defs) list.append(this.button(`${M.isDone(d.id) ? '✔ ' : ''}${d.title}`, () => { if (M.active) M.abort(); M.start(d.id); this.close(); }, 'li'));
    b.append(this.el('h4', { textContent: 'Starten (' + M.defs.length + ')' }), list);
  },
  // ---------- Teleport ----------
  tab_tp(b) {
    const x = this.num('X'), z = this.num('Z'), q = this.txt('Ort suchen (Bank, Flughafen, Hafen …)', '', 240), list = this.el('div', { className: 'alist' });
    const p = this.pos(); x.value = Math.round(p.x); z.value = Math.round(p.z);
    b.append(this.group('Koordinaten', [x, z, this.button('Teleport', () => this.tp(+x.value, +z.value)), this.button('Hierher kopieren', () => { const q = this.pos(); x.value = Math.round(q.x); z.value = Math.round(q.z); })]));
    b.append(this.group('Schnell', [this.button('Wegpunkt', () => { const w = Markers.waypoint; if (w) this.tp(w.x, w.z); else this.say('Kein Wegpunkt gesetzt'); }),
      this.button('Spielstart (Strand)', () => this.tp(-1650, 228)), this.button('Innenstadt', () => this.tp(99.5, 99.5)), this.button('Mitte (0 / 0)', () => this.tp(0, 0)),
      this.button('Auf den Boden', () => G.player.teleport(G.player.pos.x, G.player.pos.z))]));
    const draw = () => { list.innerHTML = ''; const s = q.value.trim().toLowerCase(); let n = 0; for (const o of city.pois) { const nm = o.name || o.type; if (s && !(String(nm).toLowerCase().includes(s) || String(o.type).includes(s))) continue; if (++n > 80) break; list.append(this.button(`${nm} · ${o.type}`, () => this.tp(o.x, o.z + 5), 'li')); } if (!n) list.append('Nichts gefunden.'); };
    q.addEventListener('input', draw); draw(); b.append(this.group('Orte (' + city.pois.length + ')', [q]), list);
  },
  // ---------- Spielerverwaltung ----------
  async send(c, to, args, ok, perm) {
    if (!this.has(perm)) return this.say('Dafür fehlt dir das Recht „' + PERMS[perm] + '“');
    if (!Multi.mq || !Multi.mq.connected) return this.say('Nicht mit dem Mehrspieler verbunden');
    if (Sec.isOwnerName() && !Sec.ownerKeyOk()) return this.say('Dieses Gerät hat nicht den Admin-Schlüssel (Werkzeuge → Admin-Schlüssel importieren)');
    await Sec.cmd(Multi.mq, Multi.base, c, to, args); this.say(ok);
  },
  tab_multi(b) {
    const owner = Sec.isOwnerName(), me = this.pos(), nm = (r) => r.name.toLowerCase();
    b.append(this.el('div', { className: 'ameta', textContent: `Status: ${Multi.status} · ${Multi.remotes.size + 1} online · Deine Rechte: ${owner ? 'Haupt-Admin (alle)' : Sec.myPerms().map((p) => PERMS[p]).join(', ') || 'keine'}` }));
    if (owner && !Sec.ownerKeyOk()) b.append(this.el('div', { className: 'ameta warn', textContent: '⚠ Dieses Gerät hat nicht den Admin-Schlüssel des Haupt-Admins – Befehle werden von anderen nicht anerkannt. Unter „Werkzeuge → Admin-Schlüssel“ den Schlüssel von deinem anderen Gerät importieren.' }));
    const amt = this.num('Betrag', '10000', 90), why = this.txt('Minuten', '60', 90);
    b.append(this.group('Werte für die Knöpfe unten', [this.el('span', { className: 'ameta', textContent: 'Geld $' }), amt, this.el('span', { className: 'ameta', textContent: 'Bann Minuten' }), why]));
    const list = this.el('div', { className: 'alist' }); list.style.maxHeight = 'none';
    for (const r of Multi.remotes.values()) {
      const adm = Sec.admins.find((x) => x.n.toLowerCase() === nm(r)), muted = Sec.mutes.has(nm(r));
      const row = this.el('div', { className: 'aprow' }, [this.el('b', { textContent: r.name + (adm ? ' 🛡' : '') + (muted ? ' 🔇' : '') }), this.el('span', { className: 'ameta', textContent: ` ${Math.round(Math.hypot(r.x - me.x, r.z - me.z))} m` })]);
      const btns = this.el('div', { className: 'ar' });
      if (this.has('self')) btns.append(this.button('Hin', () => this.tp(r.x + 2, r.z)));
      btns.append(this.button('Holen', () => this.send('bring', nm(r), { x: Math.round(me.x), z: Math.round(me.z) }, r.name + ' wird geholt', 'bring')),
        this.button('Heilen', () => this.send('heal', nm(r), {}, r.name + ' geheilt', 'heal')),
        this.button('Geld', () => this.send('give', nm(r), { amount: Math.round(+amt.value) || 0 }, '$' + (+amt.value || 0) + ' an ' + r.name, 'give')),
        this.button(muted ? 'Laut' : 'Stumm', () => this.send(muted ? 'unmute' : 'mute', nm(r), {}, r.name + (muted ? ' darf wieder schreiben' : ' stummgeschaltet'), 'mute')),
        this.button('Kick', () => this.send('kick', nm(r), {}, r.name + ' entfernt', 'kick'), 'warn'),
        this.button('Bann', () => this.send('ban', nm(r), { min: Math.max(1, Math.round(+why.value) || 60), why: isNaN(+why.value) ? why.value : '' }, r.name + ' gebannt', 'ban'), 'warn'));
      if (owner) btns.append(this.button(adm ? 'Admin entziehen' : '🛡 Admin machen', async () => {
        if (!Sec.ownerKeyOk()) return this.say('Dieses Gerät hat nicht den Admin-Schlüssel'); if (!Multi.mq) return;
        if (adm) { await Sec.revoke(Multi.mq, r.name); this.say(r.name + ' ist kein Admin mehr'); }
        else if (!r.k) { this.say(r.name + ' hat noch keinen Schlüssel gesendet – kurz warten'); }
        else { await Sec.grant(Multi.mq, r.name, r.k, ['self', 'kick', 'mute', 'announce', 'heal', 'bring']); this.say(r.name + ' ist jetzt Admin (Rechte unten einstellbar)'); }
        this.render();
      }));
      row.append(btns); list.append(row);
    }
    if (!Multi.remotes.size) list.append('Kein anderer Spieler online.');
    b.append(this.el('h4', { textContent: 'Online-Spieler' }), list);
    // Namen direkt (auch Offline-Spieler)
    const who = this.txt('Kontoname', '', 160);
    b.append(this.group('Nach Kontoname', [who, this.button('Bannen', () => who.value && this.send('ban', who.value.toLowerCase(), { min: Math.max(1, Math.round(+why.value) || 60) }, who.value + ' gebannt', 'ban'), 'warn'), this.button('Entbannen', () => who.value && this.send('unban', who.value.toLowerCase(), {}, who.value + ' entbannt', 'ban')),
      this.button('Stumm', () => who.value && this.send('mute', who.value.toLowerCase(), {}, who.value + ' stumm', 'mute')), this.button('Entstummen', () => who.value && this.send('unmute', who.value.toLowerCase(), {}, who.value + ' entstummt', 'mute'))]));
    if (Sec.bans.size || Sec.mutes.size) {
      const bl = this.el('div', { className: 'ar' });
      for (const [n, v] of Sec.bans) if (v.until > Date.now()) bl.append(this.button('🚫 ' + n + ' (' + Math.ceil((v.until - Date.now()) / 60000) + ' Min.) aufheben', () => this.send('unban', n, {}, n + ' entbannt', 'ban'), 'warn'));
      for (const n of Sec.mutes.keys()) bl.append(this.button('🔇 ' + n + ' aufheben', () => this.send('unmute', n, {}, n + ' entstummt', 'mute')));
      b.append(this.group('Sperren (bekannt in dieser Sitzung)', [bl]));
    }
    const ann = this.txt('Ansage an alle Spieler …', '', 280);
    b.append(this.group('Ansage', [ann, this.button('Senden', () => { if (ann.value.trim() && this.has('announce')) { Multi.sendAnnounce(ann.value.trim()); this.say('Ansage gesendet'); ann.value = ''; } else this.say('Kein Recht oder leer'); })]));
    // Admin-Verwaltung (nur Haupt-Admin)
    if (owner) {
      const ad = this.el('div', { className: 'alist' }); ad.style.maxHeight = 'none';
      for (const x of Sec.admins) {
        const row = this.el('div', { className: 'aprow' }, [this.el('b', { textContent: '🛡 ' + x.n }), this.el('span', { className: 'ameta', textContent: ' Schlüssel ' + Sec.fingerprint(x.k) })]);
        const pr = this.el('div', { className: 'ar' });
        for (const p of Object.keys(PERMS)) pr.append(this.toggleBtn(PERMS[p], () => x.p.includes(p), (v) => { x.p = v ? [...new Set([...x.p, p])] : x.p.filter((q) => q !== p); Sec.publishAdmins(Multi.mq); }));
        pr.append(this.button('Entfernen', async () => { await Sec.revoke(Multi.mq, x.n); this.say(x.n + ' entfernt'); this.render(); }, 'warn')); row.append(pr); ad.append(row);
      }
      if (!Sec.admins.length) ad.append('Noch keine weiteren Admins. Bei einem Online-Spieler „🛡 Admin machen“ drücken.');
      b.append(this.el('h4', { textContent: 'Admins verwalten (nur Haupt-Admin)' }), ad);
    }
    b.append(this.group('Verbindung', [this.button('Chat leeren', () => { if (Multi.chatEl) Multi.chatEl.log.innerHTML = ''; }), this.button('Neu verbinden', () => { const n = Accounts.user.name; Multi.banned = false; Multi.stop(); setTimeout(() => Multi.start(n), 300); }), this.button('Mehrspieler aus', () => Multi.stop(), 'warn')]));
    b.append(this.el('div', { className: 'ameta', textContent: 'Alle Befehle sind digital signiert; Spieler dieser Version erkennen gefälschte Befehle. Admin-Rechte kann nur der Haupt-Admin „Entity_2806“ vergeben. Wirksam sind Befehle nur bei Spielern, die gerade online sind (Bann/Stumm auch später beim Beitreten).' }));
  },
  // ---------- Werkzeuge ----------
  tab_tools(b) {
    const cmd = this.txt('Cheat-Code (z. B. GELD, PANZER, FLUG)', '', 260), area = this.el('textarea', { placeholder: 'Spielstand (JSON) hier einfügen …', rows: 4 }); area.style.width = '100%'; area.addEventListener('keydown', (e) => e.stopPropagation());
    b.append(this.group('Cheat-Konsole', [cmd, this.button('Ausführen', () => { this.say(G.cheatCode(cmd.value.trim().toUpperCase())); cmd.value = ''; })]));
    b.append(this.group('Spielstand', [
      this.button('Speichern', () => Save.save()), this.button('Laden', () => { this.close(); G.continueGame(true); }),
      this.button('Exportieren (Kopie)', () => { const t = JSON.stringify(Save.serialize()); try { navigator.clipboard.writeText(t); this.say('In die Zwischenablage kopiert'); } catch (e) { area.value = t; this.say('Text unten kopieren'); } area.value = t; }),
      this.button('Importieren', () => { try { const o = JSON.parse(area.value); if (!o.profile) throw new Error('kein Spielstand'); localStorage.setItem(Save.key(), JSON.stringify(o)); this.close(); G.continueGame(true); } catch (e) { this.say('Ungültig: ' + e.message); } }),
    ]), area);
    b.append(this.group('Anzeige', [this.toggleBtn('FPS anzeigen', () => !!G.settings.showFps, (v) => { G.settings.showFps = v; Save.saveSettings(); }),
      this.toggleBtn('Grafik automatisch anpassen', () => G.settings.autoGfx === true, (v) => { G.settings.autoGfx = v; Save.saveSettings(); })]));
    const pr = window.__prof || {};
    b.append(this.el('div', { className: 'ameta', textContent: `Render: ${pr.calls ?? '?'} Aufrufe · ${Math.round((pr.tris || 0) / 1000)}k Dreiecke · Sim ${(pr.sim || 0).toFixed(1)} ms · Qualität ${G.settings.quality} · Fahrzeuge ${G.entities.vehicles.length} · Passanten ${G.entities.peds.length}` }));
    b.append(this.el('pre', { className: 'ameta', textContent: JSON.stringify(G.stats, null, 1) }));
    if (Sec.isOwnerName()) {
      const ka = this.el('textarea', { rows: 3, placeholder: 'Privater Admin-Schlüssel (nur für dich!) …' }); ka.style.width = '100%'; ka.addEventListener('keydown', (e) => e.stopPropagation());
      b.append(this.group('Admin-Schlüssel (Fingerabdruck ' + Sec.fingerprint() + ')', [
        this.button('Öffentlichen Schlüssel kopieren', () => { try { navigator.clipboard.writeText(Sec.pub); } catch (e) { } ka.value = Sec.pub; this.say('Öffentlicher Schlüssel: ' + Sec.pub.slice(0, 16) + '…'); }),
        this.button('Privaten Schlüssel anzeigen (Backup)', () => { ka.value = Sec.exportKey(); this.say('Gut aufbewahren, niemandem zeigen'); }),
        this.button('Schlüssel importieren', async () => { try { await Sec.importKey(ka.value); this.say('Schlüssel importiert'); this.render(); } catch (e) { this.say('Ungültig: ' + e.message); } }),
        this.button('Als Haupt-Schlüssel veröffentlichen', async () => { if (confirm('Diesen Schlüssel als Haupt-Admin-Schlüssel veröffentlichen? Spieler, die einen anderen gemerkt haben, vertrauen ihm dann nicht mehr.')) { Sec.ownerPub = null; if (Multi.mq) await Sec.publishOwnerKey(Multi.mq); this.say('Veröffentlicht'); this.render(); } }, 'warn'),
      ]), ka);
    }
    b.append(this.group('Gefahrenzone', [this.button('Spielstand löschen', () => { if (confirm('Spielstand dieses Kontos wirklich löschen?')) { Save.wipe(); this.say('Gelöscht'); } }, 'warn'),
      this.button('Einstellungen zurücksetzen', () => { if (confirm('Einstellungen zurücksetzen und neu laden?')) { try { localStorage.removeItem('vicecity_settings_v1'); } catch (e) { } location.reload(); } }, 'warn')]));
  },
  // ---------- pro Bild ----------
  update(dt) {
    if (!this.btn) return; const C = G.cheat || {}, pl = G.player;
    const adm = this.isAdmin(); this.btn.style.display = adm && IN_GAME.has(G.state) ? '' : 'none'; if (!adm && this.open) this.close();
    if (!IN_GAME.has(G.state) && this.open) this.close();
    if (C.freezeTime && C._hour != null) G.hour = C._hour;
    if (C.vgod && pl && pl.vehicle) { const v = pl.vehicle; v.hp = 1000; v.burning = 0; v.dead = false; }
    if (C.rapid && pl) { pl.fireT = 0; pl.reloadT = 0; }
    this.hdrT -= dt; if (this.open && this.hdrT <= 0) { this.hdrT = 0.5; this.refreshHdr(); }
  },
};
