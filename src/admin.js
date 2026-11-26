// Admin-Panel – nur für das Konto "Entity_2806" (Prüfung im Client, siehe README). Öffnen: 🛡-Knopf oder F9.
import { G, emit } from './game.js';
import { Accounts } from './accounts.js';
import { Multi } from './multi.js';
import { Input } from './player.js';
import { Veh } from './vehicles.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Markers } from './markers.js';
import { Combat } from './combat.js';
import { Eco, Save } from './profile.js';
import { CATALOG } from './catalog.js';
import { city } from './city.js';
import { WEATHER_NAMES } from './sky.js';

const ADMIN = 'entity_2806';
const IN_GAME = new Set(['play', 'pause']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => '$' + Math.round(n).toLocaleString('de-DE');

export const Admin = {
  open: false, root: null, tab: 'player', btn: null, hdrT: 0, wasAdmin: false,
  isAdmin() { return !!(Accounts.user && Accounts.user.key === ADMIN); },
  C() { return G.cheat || (G.cheat = {}); },
  init() {
    if (!this.isAdmin() || this.btn) return;
    const b = document.createElement('button'); b.id = 'adminbtn'; b.textContent = '🛡'; b.title = 'Admin-Panel (F9)'; b.style.display = 'none';
    b.addEventListener('click', () => this.toggle()); document.body.appendChild(b); this.btn = b;
    window.addEventListener('keydown', (e) => { if (e.code === 'F9' && IN_GAME.has(G.state)) { e.preventDefault(); this.toggle(); } });
  },
  toggle() { this.open ? this.close() : this.show(); },
  show() {
    if (!this.isAdmin()) return; this.open = true; try { Input.unlock(); } catch (e) { }
    if (!this.root) { this.root = document.createElement('div'); this.root.id = 'adminpanel'; document.body.appendChild(this.root); }
    this.root.style.display = ''; this.render();
  },
  close() { this.open = false; if (this.root) this.root.style.display = 'none'; try { if (!document.body.classList.contains('touch') && G.state === 'play') Input.lock(document.getElementById('game')); } catch (e) { } },
  // ---------- Hilfsfunktionen für die Oberfläche ----------
  el(tag, props = {}, kids = []) { const e = document.createElement(tag); Object.assign(e, props); for (const k of [].concat(kids)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; },
  button(label, fn, cls = '') { const b = this.el('button', { className: 'ab ' + cls, textContent: label }); b.addEventListener('click', () => { try { fn(b); } catch (e) { emit('toast', 'Fehler: ' + e.message); } this.refreshHdr(); }); return b; },
  toggleBtn(label, get, set) { const b = this.button('', () => { set(!get()); paint(); }); const paint = () => { b.textContent = (get() ? '✅ ' : '⬜ ') + label; b.classList.toggle('on', !!get()); }; paint(); return b; },
  group(title, kids) { return this.el('div', { className: 'ag' }, [this.el('h4', { textContent: title }), this.el('div', { className: 'ar' }, kids)]); },
  num(ph, val = '', w = 90) { const i = this.el('input', { type: 'text', inputMode: 'decimal', placeholder: ph, value: val }); i.style.width = w + 'px'; i.addEventListener('keydown', (e) => e.stopPropagation()); return i; },
  txt(ph, val = '', w = 200) { const i = this.el('input', { type: 'text', placeholder: ph, value: val }); i.style.width = w + 'px'; i.addEventListener('keydown', (e) => e.stopPropagation()); return i; },
  say(t) { emit('toast', '🛡 ' + t); },
  pos() { const pl = G.player, v = pl.vehicle; return v ? v.pos : pl.pos; },
  ahead(d = 6) { const pl = G.player; return { x: pl.pos.x + Math.sin(pl.camYaw) * d, z: pl.pos.z + Math.cos(pl.camYaw) * d }; },
  tp(x, z) {
    const pl = G.player; if (!Number.isFinite(x) || !Number.isFinite(z)) return this.say('Ungültige Koordinaten');
    if (pl.vehicle) { const v = pl.vehicle; v.pos.set(x, v.kind === 'plane' || v.kind === 'heli' ? v.pos.y : 0, z); v.vel.set(0, 0, 0); const ph = G.terrainY ? G.terrainY(x, z) : 0; if (v.kind !== 'plane' && v.kind !== 'heli') v.pos.y = ph + 0.5; }
    else pl.teleport(x, z); G.cameraSnap = true; this.say(`Teleport → ${Math.round(x)} / ${Math.round(z)}`);
  },
  // ---------- Panel ----------
  render() {
    const tabs = [['player', '🧍 Spieler'], ['veh', '🚗 Fahrzeuge'], ['world', '🌍 Welt'], ['mission', '🎯 Missionen'], ['tp', '📍 Teleport'], ['multi', '🌐 Mehrspieler'], ['tools', '🛠 Werkzeuge']];
    this.root.innerHTML = '';
    const head = this.el('div', { className: 'ahead' }, [
      this.el('b', { textContent: '🛡 Admin-Panel · ' + (Accounts.user ? Accounts.user.name : '') }), this.el('span', { className: 'ainfo' }),
      this.button('✕', () => this.close(), 'x'),
    ]); this.info = head.querySelector('.ainfo');
    const bar = this.el('div', { className: 'atabs' }, tabs.map(([k, n]) => { const b = this.button(n, () => { this.tab = k; this.render(); }, k === this.tab ? 'on' : ''); return b; }));
    const body = this.el('div', { className: 'abody' }); this['tab_' + this.tab](body);
    this.root.append(head, bar, body); this.refreshHdr();
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
    const pl = G.player, q = this.txt('Fahrzeug suchen …', '', 220), enter = { v: true }, list = this.el('div', { className: 'alist' });
    const draw = () => {
      list.innerHTML = ''; const s = q.value.trim().toLowerCase(); let n = 0;
      for (const c of CATALOG) { if (s && !(c.name.toLowerCase().includes(s) || String(c.cls).includes(s) || String(c.kind).includes(s) || c.id.includes(s))) continue; if (++n > 80) break;
        list.append(this.button(`${c.name} · ${c.cls || c.kind}`, () => { const a = this.ahead(7), v = Veh.spawn(c.id, a.x, a.z, pl.camYaw); if (!v) return; v.keep = true; v.parked = false; if (enter.v) pl.enterVehicle(v); this.say('Gespawnt: ' + c.name); }, 'li')); }
      if (!n) list.append('Nichts gefunden.');
    };
    q.addEventListener('input', draw); draw();
    const cur = () => pl.vehicle;
    b.append(this.group('Aktuelles Fahrzeug', [
      this.button('Reparieren', () => { const v = cur(); if (!v) return this.say('Du sitzt in keinem Fahrzeug'); v.hp = 1000; v.burning = 0; v.dead = false; v.wreck = false; v.exploded = false; v.damageFlash = 0; this.say('Repariert'); }),
      this.button('Umdrehen', () => { const v = cur(); if (!v) return; v.roll = 0; v.pitch = 0; v.pos.y += 1.5; v.vel.set(0, 0, 0); }),
      this.button('Nitro', () => { const v = cur(); if (!v) return; const f = 1.8; v.vel.x *= f; v.vel.z *= f; }), this.button('Stoppen', () => { const v = cur(); if (v) { v.vel.set(0, 0, 0); v.speed = 0; } }),
      this.button('Löschen', () => { const v = cur(); if (!v) return; pl.exitVehicle(true); Veh.remove(v); }, 'warn'),
      this.toggleBtn('Unzerstörbar', () => !!this.C().vgod, (v) => (this.C().vgod = v)),
    ]));
    b.append(this.group('Aufräumen', [
      this.button('Alle NPC-Fahrzeuge löschen', () => { let n = 0; for (const v of [...G.entities.vehicles]) if (v !== pl.vehicle && !v.owned && !v.keep && !v.isDisplay) { Veh.remove(v); n++; } this.say(n + ' Fahrzeuge entfernt'); }, 'warn'),
      this.button('Wracks löschen', () => { let n = 0; for (const v of [...G.entities.vehicles]) if (v.wreck && v !== pl.vehicle) { Veh.remove(v); n++; } this.say(n + ' Wracks entfernt'); }),
    ]));
    const chk = this.toggleBtn('Nach dem Spawn einsteigen', () => enter.v, (v) => (enter.v = v));
    b.append(this.group('Spawnen (alle ' + CATALOG.length + ' Modelle)', [q, chk]), list);
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
  // ---------- Mehrspieler ----------
  tab_multi(b) {
    const st = this.el('div', { className: 'ameta', textContent: `Status: ${Multi.status} · ${Multi.remotes.size + 1} online` });
    const list = this.el('div', { className: 'alist' });
    for (const r of Multi.remotes.values()) {
      const row = this.el('div', { className: 'arow' }, [this.el('b', { textContent: r.name }), this.el('span', { textContent: ` ${Math.round(Math.hypot(r.x - this.pos().x, r.z - this.pos().z))} m ` }),
        this.button('Hin', () => this.tp(r.x + 2, r.z)), this.button(Multi.muted.has(r.name.toLowerCase()) ? 'Laut' : 'Stumm', () => { const k = r.name.toLowerCase(); Multi.muted.has(k) ? Multi.muted.delete(k) : Multi.muted.add(k); this.render(); })]);
      list.append(row);
    }
    if (!Multi.remotes.size) list.append('Kein anderer Spieler online.');
    const ann = this.txt('Ansage an alle Spieler …', '', 280);
    b.append(st, this.el('h4', { textContent: 'Spieler' }), list);
    b.append(this.group('Ansage', [ann, this.button('Senden', () => { if (ann.value.trim()) { Multi.sendAnnounce(ann.value.trim()); ann.value = ''; } })]));
    b.append(this.group('Verbindung', [this.button('Chat leeren', () => { if (Multi.chatEl) Multi.chatEl.log.innerHTML = ''; }), this.button('Neu verbinden', () => { const n = Accounts.user.name; Multi.stop(); setTimeout(() => Multi.start(n), 300); }), this.button('Mehrspieler aus', () => Multi.stop(), 'warn')]));
    b.append(this.el('div', { className: 'ameta', textContent: 'Hinweis: Ohne eigenen Server gibt es keine verbindlichen Kick-/Bann-Funktionen; Ansagen und Stummschalten wirken nur bei Clients, die diese Version haben.' }));
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
    b.append(this.group('Gefahrenzone', [this.button('Spielstand löschen', () => { if (confirm('Spielstand dieses Kontos wirklich löschen?')) { Save.wipe(); this.say('Gelöscht'); } }, 'warn'),
      this.button('Einstellungen zurücksetzen', () => { if (confirm('Einstellungen zurücksetzen und neu laden?')) { try { localStorage.removeItem('vicecity_settings_v1'); } catch (e) { } location.reload(); } }, 'warn')]));
  },
  // ---------- pro Bild ----------
  update(dt) {
    if (!this.btn) return; const C = G.cheat || {}, pl = G.player;
    this.btn.style.display = IN_GAME.has(G.state) ? '' : 'none';
    if (!IN_GAME.has(G.state) && this.open) this.close();
    if (C.freezeTime && C._hour != null) G.hour = C._hour;
    if (C.vgod && pl && pl.vehicle) { const v = pl.vehicle; v.hp = 1000; v.burning = 0; v.dead = false; }
    if (C.rapid && pl) { pl.fireT = 0; pl.reloadT = 0; }
    this.hdrT -= dt; if (this.open && this.hdrT <= 0) { this.hdrT = 0.5; this.refreshHdr(); }
  },
};
