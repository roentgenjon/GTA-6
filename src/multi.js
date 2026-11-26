// Mehrspieler: andere angemeldete Spieler erscheinen mit Namen in der Welt (zu Fuß oder im Fahrzeug), dazu ein Text-Chat.
// Übertragung über einen öffentlichen MQTT-Broker (src/net.js): jeder Spieler sendet seinen Zustand ~5×/s auf ein eigenes Thema.
import * as THREE from 'three';
import { G, emit } from './game.js';
import { Mqtt } from './net.js';
import { NS, Accounts } from './accounts.js';
import { Person } from './persons.js';
import { buildModel } from './models.js';
import { BY_ID } from './catalog.js';
import { Input } from './player.js';

const ROOM = 'main', IN_GAME = new Set(['play', 'pause', 'cutscene', 'dead']);
const tag = (name, own) => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 72; const g = c.getContext('2d');
  g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(300, g.measureText(name).width + 28); g.fillStyle = 'rgba(10,4,24,.72)'; g.beginPath(); g.roundRect ? g.roundRect(160 - w / 2, 8, w, 56, 18) : g.rect(160 - w / 2, 8, w, 56); g.fill();
  g.lineWidth = 2; g.strokeStyle = own ? '#35ffb4' : '#ff3dbb'; g.stroke(); g.fillStyle = '#fff'; g.fillText(name, 160, 37, 280);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(2.5, 0.56, 1); s.renderOrder = 20; return s;
};
const wrapAngle = (a) => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const Multi = {
  on: false, status: 'aus', remotes: new Map(), id: Math.random().toString(36).slice(2, 8), name: '', mq: null, sendT: 0, lookT: 0, wasIn: false, chatEl: null, chatOpen: false, lastChat: 0, dup: false,
  async start(name) {
    if (this.mq) return;
    this.name = name; this.setStatus('verbinde');
    const base = `${NS}/room/${ROOM}`, mine = `${base}/p/${this.id}`;
    const forced = new URLSearchParams(location.search).get('broker');
    this.mq = new Mqtt({ urls: forced ? [forced] : undefined, clientId: 'vcp' + this.id, will: { topic: mine, payload: JSON.stringify({ i: this.id, bye: 1 }) }, onstatus: (s) => { this.setStatus(s === 'online' ? 'online' : 'offline'); if (s === 'online') this.afterConnect(); } });
    this.base = base; this.mine = mine; this.buildChat();
    const ok = await this.mq.connect();
    if (!ok) this.setStatus('offline');
  },
  afterConnect() {
    const mq = this.mq, base = this.base; this.on = true; this.lookT = 0;
    if (!this.subscribed) { // Abos bleiben beim Wiederverbinden erhalten (Mqtt._resubscribe)
      this.subscribed = true;
      mq.subscribe(`${base}/p/+`, (t, msg) => this.onState(msg));
      mq.subscribe(`${base}/chat`, (t, msg) => this.onChat(msg));
    }
    Accounts.syncClaim(mq).then(() => { if (Accounts.conflict) { emit('toast', '⚠ Der Kontoname ist online von jemand anderem belegt – Mehrspieler aus.'); this.stop(); } });
    // Doppelanmeldung (dasselbe Konto auf einem anderen Gerät) erkennen
    setTimeout(() => { if (this.dup) { emit('toast', '⚠ Dieses Konto ist schon auf einem anderen Gerät online – Mehrspieler aus.'); this.stop(); } }, 2600);
  },
  setStatus(s) { this.status = s; this.updateBadge(); },
  stop() {
    if (this.mq) { try { this.mq.publish(this.mine, JSON.stringify({ i: this.id, bye: 1 })); } catch (e) { } this.mq.close(); this.mq = null; }
    this.on = false; this.subscribed = false; for (const id of [...this.remotes.keys()]) this.drop(id); this.setStatus('aus'); if (this.chatEl) this.chatEl.root.style.display = 'none';
  },
  list() { const a = []; for (const r of this.remotes.values()) if (r.group) a.push({ name: r.name, x: r.x, z: r.z }); return a; },
  onState(msg) {
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    if (!m || !m.i || m.i === this.id) return;
    if (m.bye) { this.drop(m.i); return; }
    if (typeof m.n !== 'string' || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
    if (m.n.toLowerCase() === (Accounts.user && Accounts.user.name || '').toLowerCase()) { this.dup = true; return; }
    let r = this.remotes.get(m.i);
    if (!r) { r = { id: m.i, name: String(m.n).slice(0, 16), x: m.x, y: m.y || 0, z: m.z, yaw: m.r || 0, s: 0, group: null, look: null, veh: null, vehId: null, last: 0, snap: true }; this.remotes.set(m.i, r); this.lookT = 0; this.notify(`🌐 ${esc(r.name)} ist beigetreten`); }
    r.last = performance.now(); r.x = m.x; r.y = m.y || 0; r.z = m.z; r.yaw = m.r || 0; r.s = m.s || 0; r.p = m.p || 0; r.o = m.o || 0; r.w = m.w || 0; r.vehId = m.v || null; r.c1 = m.a; r.c2 = m.b;
    if (m.l && typeof m.l === 'object') { m.l.scale = Math.min(1.25, Math.max(0.8, +m.l.scale || 1)); m.l.fat = Math.min(1.3, Math.max(0.8, +m.l.fat || 1)); if (!r.look || JSON.stringify(m.l) !== r.lookKey) { r.look = m.l; r.lookKey = JSON.stringify(m.l); r.rebuild = true; } }
  },
  notify(t) { emit('toast', t); },
  drop(id) {
    const r = this.remotes.get(id); if (!r) return; this.remotes.delete(id); this.dispose(r);
    if (r.group) this.notify(`🌐 ${esc(r.name)} hat das Spiel verlassen`);
  },
  dispose(r) {
    if (r.person) { G.scene.remove(r.person.group); r.person = null; }
    if (r.veh) { G.scene.remove(r.veh.root); if (G.csm && r.veh.bodyMat) G.csm.shaders.delete(r.veh.bodyMat); if (r.veh.bodyGeo && r.vehKind !== 'bike') r.veh.bodyGeo.dispose(); if (r.veh.bodyMat) r.veh.bodyMat.dispose(); r.veh = null; }
    if (r.sprite) { G.scene.remove(r.sprite); r.sprite.material.map.dispose(); r.sprite.material.dispose(); r.sprite = null; }
    r.group = null;
  },
  build(r) {
    // Figur bzw. Fahrzeug passend zum letzten Zustand aufbauen
    if (r.rebuild && r.person) { G.scene.remove(r.person.group); r.person = null; }
    r.rebuild = false;
    if (!r.person && r.look) { try { r.person = new Person(r.look); r.person.group.position.set(r.x, r.y, r.z); G.scene.add(r.person.group); r.group = r.person.group; r.snap = true; } catch (e) { r.look = null; } }
    const key = r.vehId ? r.vehId + '|' + r.c1 + '|' + r.c2 : '';
    if (key !== r.vehKey) {
      if (r.veh) { G.scene.remove(r.veh.root); if (G.csm && r.veh.bodyMat) G.csm.shaders.delete(r.veh.bodyMat); if (r.veh.bodyGeo && r.vehKind !== 'bike') r.veh.bodyGeo.dispose(); if (r.veh.bodyMat) r.veh.bodyMat.dispose(); r.veh = null; }
      r.vehKey = key; const spec = r.vehId && BY_ID[r.vehId];
      if (spec) { try { r.veh = buildModel(spec, r.c1 != null ? r.c1 : spec.colors[0], r.c2 !== undefined ? r.c2 : spec.colors[1]); r.vehKind = spec.kind; r.vehWr = spec.wr || 0.3; r.veh.root.rotation.order = 'YXZ'; r.veh.root.position.set(r.x, r.y, r.z); G.scene.add(r.veh.root); r.snap = true; } catch (e) { r.veh = null; } }
    }
    if (!r.sprite && r.group) { r.sprite = tag(r.name, false); G.scene.add(r.sprite); }
  },
  update(dt) {
    const mq = this.mq; if (!mq) return;
    const inGame = IN_GAME.has(G.state) && G.player, pl = G.player;
    // eigenen Zustand senden
    if (this.on && inGame) {
      this.sendT -= dt; this.lookT -= dt;
      const v = pl.vehicle, x = v ? v.pos.x : pl.pos.x, y = v ? v.pos.y : pl.pos.y, z = v ? v.pos.z : pl.pos.z;
      const moved = Math.hypot(x - (this._lx ?? x), z - (this._lz ?? z)) > 0.05;
      if (this.sendT <= 0) {
        this.sendT = moved ? 0.2 : 1.5; this._lx = x; this._lz = z;
        const q = (n) => Math.round(n * 100) / 100;
        const m = { i: this.id, n: this.name, x: q(x), y: q(y), z: q(z), r: q(v ? v.yaw : pl.yaw), s: q(v ? Math.abs(v.speed) : pl.speed || 0) };
        if (v) { m.v = v.spec.id; m.a = v.c1; m.b = v.c2; m.p = q(v.pitch || 0); m.o = q(v.roll || 0); m.w = q(v.steerAngle || 0); }
        if (this.lookT <= 0) { this.lookT = 3; m.l = G.profile && G.profile.look; }
        mq.publish(this.mine, JSON.stringify(m));
      }
      this.wasIn = true;
    } else if (this.wasIn && !inGame) { mq.publish(this.mine, JSON.stringify({ i: this.id, bye: 1 })); this.wasIn = false; }
    // andere Spieler darstellen
    const now = performance.now(), cam = G.camera, cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0, k = 1 - Math.exp(-12 * dt);
    for (const r of [...this.remotes.values()]) {
      if (now - r.last > 8000) { this.drop(r.id); continue; }
      this.build(r); if (!r.group) continue;
      const d2 = (r.x - cx) ** 2 + (r.z - cz) ** 2, vis = d2 < 420 * 420;
      const inVeh = !!r.veh, node = inVeh ? r.veh.root : r.person.group;
      if (r.person) r.person.group.visible = vis && !inVeh;
      if (r.veh) r.veh.root.visible = vis;
      if (!vis) { if (r.sprite) r.sprite.visible = false; continue; }
      if (r.snap || Math.abs(node.position.x - r.x) + Math.abs(node.position.z - r.z) > 90) { node.position.set(r.x, r.y, r.z); node.rotation.y = r.yaw; r.snap = false; }
      node.position.x += (r.x - node.position.x) * k; node.position.y += (r.y - node.position.y) * k; node.position.z += (r.z - node.position.z) * k;
      node.rotation.y += wrapAngle(r.yaw - node.rotation.y) * k;
      if (inVeh) {
        const m = r.veh; node.rotation.x += ((-(r.p || 0)) - node.rotation.x) * k; node.rotation.z += ((r.o || 0) - node.rotation.z) * k;
        if (m.wheels && m.wheels.length) { r.wr = (r.wr || 0) + (r.s / (r.vehWr || 0.3)) * dt; for (const w of m.wheels) w.rotation.x = r.wr; }
        if (m.steerWheels && m.steerWheels.length) for (const h of m.steerWheels) h.rotation.y = r.w || 0;
        if (m.props) for (const p of m.props) p.rotation.z += dt * 40;
        if (m.rotor) { m.rotor.rotation.y += dt * 38; if (m.tailRotor) m.tailRotor.rotation.x += dt * 40; }
      } else {
        r.person.animate(dt, { speed: r.s });
        r.person.setLOD(d2 > 900 ? 1 : 0);
      }
      if (r.sprite) { r.sprite.visible = d2 < 80 * 80; r.sprite.position.set(node.position.x, node.position.y + (inVeh ? (r.veh.topY || 2) + 0.9 : 2.3), node.position.z); }
    }
    this.updateBadge();
    if (this.chatEl) { const show = IN_GAME.has(G.state) && G.state !== 'dead' || this.chatOpen; this.chatEl.root.style.display = show ? '' : 'none'; const old = performance.now() - 12000; for (const ln of [...this.chatEl.log.children]) ln.style.opacity = this.chatOpen || +ln.dataset.t > old ? 1 : 0; }
  },
  // ---------------- Chat ----------------
  buildChat() {
    if (this.chatEl) return;
    const root = document.createElement('div'); root.className = 'mpchat'; root.style.display = 'none';
    root.innerHTML = '<div class="mpbadge"></div><div class="mplog"></div><form class="mpform" style="display:none" autocomplete="off"><input type="text" maxlength="120" placeholder="Nachricht … (Enter = senden, Esc = schließen)" enterkeyhint="send"><button type="submit" class="btn">➤</button></form>';
    document.body.appendChild(root);
    const form = root.querySelector('form'), input = form.querySelector('input'); this.chatEl = { root, log: root.querySelector('.mplog'), badge: root.querySelector('.mpbadge'), form, input };
    form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); input.value = ''; if (t) this.sendChat(t); this.closeChat(); });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); } });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => { if (e.code === 'Enter' && G.state === 'play' && !this.chatOpen && this.on && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) { e.preventDefault(); this.openChat(); } });
    G.openChat = () => this.openChat();
  },
  openChat() {
    if (!this.chatEl || !this.on || this.chatOpen) return; this.chatOpen = true;
    try { Input.unlock(); } catch (e) { }
    this.chatEl.form.style.display = ''; this.chatEl.input.focus();
  },
  closeChat() {
    if (!this.chatEl) return; this.chatOpen = false; this.chatEl.form.style.display = 'none'; this.chatEl.input.blur();
    try { if (!document.body.classList.contains('touch') && G.state === 'play') Input.lock(document.getElementById('game')); } catch (e) { }
  },
  sendChat(t) {
    const now = performance.now(); if (!this.mq || now - this.lastChat < 700) return; this.lastChat = now;
    this.mq.publish(`${this.base}/chat`, JSON.stringify({ n: this.name, m: t.slice(0, 120), i: this.id }));
  },
  onChat(msg) {
    let m; try { m = JSON.parse(msg); } catch (e) { return; } if (!m || typeof m.m !== 'string') return;
    const mine = m.i === this.id, el = document.createElement('div'); el.className = 'mpmsg' + (mine ? ' me' : ''); el.dataset.t = performance.now();
    el.innerHTML = `<b>${esc(String(m.n || '?').slice(0, 16))}</b> ${esc(m.m.slice(0, 120))}`; this.chatEl.log.appendChild(el);
    while (this.chatEl.log.children.length > 7) this.chatEl.log.firstChild.remove();
    if (!mine && G.audio) { try { G.audio.play('blip'); } catch (e) { } }
  },
  updateBadge() {
    if (!this.chatEl) return; const n = this.remotes.size, st = this.status;
    this.chatEl.badge.textContent = st === 'online' ? `🌐 ${this.name} · ${n + 1} online` : st === 'verbinde' ? '🌐 verbinde …' : st === 'offline' ? '🌐 offline (wird erneut versucht)' : '';
    this.chatEl.badge.className = 'mpbadge ' + st;
  },
};
