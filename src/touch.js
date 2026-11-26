// Touch-Steuerung (iPad/Tablet/Handy): virtueller Stick, Kamera-Wischen, kontextabhängige Tasten
import { G, emit } from './game.js';
import { Input } from './player.js';

export const Touch = {
  enabled: false, root: null, stick: { id: null, x: 0, y: 0, sx: 0, sy: 0 }, look: { id: null, x: 0, y: 0 }, groups: {}, mode: '',
  detect() {
    const s = G.settings.touch || 'auto';
    if (s === 'on') return true; if (s === 'off') return false;
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1 || ('ontouchstart' in window && innerWidth < 1400);
  },
  isTouchDevice() { return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1; },
  init(ui) {
    this.enabled = this.detect();
    document.body.classList.toggle('touch', this.enabled);
    if (this.root) this.root.remove();
    const r = this.root = document.createElement('div'); r.id = 'touch'; r.className = this.enabled ? '' : 'hidden';
    r.innerHTML = `
      <div id="t-look"></div>
      <div id="t-stick"><div class="base"><div class="knob"></div></div></div>
      <div class="tg" data-g="top"><button class="tb sm" data-k="pause">☰</button><button class="tb sm" data-k="map">🗺</button><button class="tb sm" data-k="fs">⛶</button><button class="tb sm" data-k="chat">💬</button></div>
      <div class="tg" data-g="foot">
        <button class="tb big fire" data-m="fire">🔫</button><button class="tb" data-m="aim" style="right:128px;bottom:150px">🎯</button>
        <button class="tb" data-key="Space" style="right:24px;bottom:150px">⤒</button><button class="tb sm" data-key="KeyR" style="right:215px;bottom:60px">R</button>
        <button class="tb" data-key="KeyE" style="right:24px;bottom:238px">E</button><button class="tb" data-key="KeyF" style="right:104px;bottom:238px">F</button>
        <button class="tb sm" data-wheel="1" style="right:210px;bottom:150px">⇄</button><button class="tb sm" data-hold="sprint" style="left:220px;bottom:36px">⚡</button>
      </div>
      <div class="tg" data-g="car">
        <button class="tb big gas" data-key="KeyW">GAS</button><button class="tb brake" data-key="KeyS" style="right:150px;bottom:30px">⏪</button>
        <button class="tb" data-key="Space" style="right:24px;bottom:176px">HB</button><button class="tb sm" data-key="KeyH" style="right:100px;bottom:176px">📯</button>
        <button class="tb sm" data-key="KeyC" style="right:164px;bottom:176px">📷</button><button class="tb sm" data-key="KeyL" style="right:228px;bottom:176px">💡</button>
        <button class="tb" data-key="KeyF" style="right:24px;bottom:252px">F</button><button class="tb sm" data-key="KeyE" style="right:100px;bottom:252px">E</button><button class="tb sm" data-key="KeyR" style="right:164px;bottom:252px">📻</button>
      </div>
      <div class="tg" data-g="air">
        <button class="tb big" data-key="ShiftLeft" data-hkey="Space" style="right:24px;bottom:150px">▲</button><button class="tb big" data-key="Space" data-hkey="ShiftLeft" style="right:24px;bottom:40px">▼</button>
        <button class="tb" data-key="KeyQ" style="right:130px;bottom:80px">◀</button><button class="tb" data-key="KeyE" style="right:200px;bottom:150px">▶</button>
        <button class="tb" data-key="KeyF" style="right:130px;bottom:220px">F</button>
      </div>`;
    document.getElementById('ui').appendChild(r);
    for (const g of r.querySelectorAll('.tg')) this.groups[g.dataset.g] = g;
    const base = r.querySelector('#t-stick .base'), knob = r.querySelector('.knob');
    this.base = base; this.knob = knob;
    // Stick: Zone linke Bildschirmhälfte unten
    const stickZone = r.querySelector('#t-stick');
    stickZone.addEventListener('pointerdown', (e) => { if (this.stick.id !== null) return; e.preventDefault(); try { stickZone.setPointerCapture(e.pointerId); } catch (_) { } const b = base.getBoundingClientRect(); this.stick = { id: e.pointerId, sx: b.left + b.width / 2, sy: b.top + b.height / 2, x: 0, y: 0 }; this.moveStick(e); });
    stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === this.stick.id) this.moveStick(e); });
    const endStick = (e) => { if (e.pointerId === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; Input.axisX = null; this.applyStick(); } };
    stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick);
    // Blick
    const lookZone = r.querySelector('#t-look');
    lookZone.addEventListener('pointerdown', (e) => { if (this.look.id !== null) return; e.preventDefault(); try { lookZone.setPointerCapture(e.pointerId); } catch (_) { } this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
    lookZone.addEventListener('pointermove', (e) => { if (e.pointerId !== this.look.id) return; const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y; this.look.x = e.clientX; this.look.y = e.clientY; this.look.moved += Math.abs(dx) + Math.abs(dy); Input.mouseDX += dx * 1.9; Input.mouseDY += dy * 1.9; });
    const endLook = (e) => { if (e.pointerId === this.look.id) { if (G.state === 'play' && this.look.moved < 8 && performance.now() - this.look.t < 250 && !G.player.vehicle) { Input.pressed.add('Mouse0'); } this.look.id = null; } };
    lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook);
    // Tasten
    for (const b of r.querySelectorAll('.tb')) {
      let key = b.dataset.key, mouse = b.dataset.m, wheel = b.dataset.wheel, hold = b.dataset.hold, act = b.dataset.k;
      const down = (e) => {
        e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { } b.classList.add('on');
        if (b.dataset.hkey) { const hv = G.player && G.player.vehicle; key = hv && hv.kind === 'heli' ? b.dataset.hkey : b.dataset.key; } // Hubschrauber: ▲ = Leertaste, ▼ = Shift
        if (key) { Input.pressed.add(key); Input.keys[key] = true; G.keys[key] = true; }
        else if (mouse === 'fire') { Input.buttons |= 1; Input.pressed.add('Mouse0'); } else if (mouse === 'aim') { Input.buttons |= 4; Input.pressed.add('Mouse2'); }
        else if (wheel) Input.wheel += +wheel;
        else if (hold === 'sprint') { this.sprint = !this.sprint; b.classList.toggle('lock', this.sprint); }
        else if (act === 'pause') { if (G.state === 'play') emit('pause'); } else if (act === 'map') { if (G.state === 'play') G.ui.openMenu('map'); } else if (act === 'chat') { if (G.state === 'play') { if (G.openChat) G.openChat(); } }
        else if (act === 'fs') { const d = document.documentElement; const f = d.requestFullscreen || d.webkitRequestFullscreen; if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else if (f) f.call(d); }
      };
      const up = (e) => { b.classList.remove('on'); if (key) { Input.keys[key] = false; G.keys[key] = false; } else if (mouse === 'fire') Input.buttons &= ~1; else if (mouse === 'aim') Input.buttons &= ~4; };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); b.addEventListener('pointerleave', (e) => { if (e.buttons === 0) up(e); });
    }
    window.addEventListener('pointerdown', (e) => { if (G.ui && G.state === 'cutscene' && G.ui.cutsceneActive) G.ui.advance(); });
    // Gesten-Zoom der Seite verhindern
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { const t = e.target; if (t && t.closest && t.closest('#touch, #game, #hud') && !t.closest('#menu, .modal')) e.preventDefault(); }, { passive: false });
  },
  moveStick(e) {
    const R = 62; let dx = e.clientX - this.stick.sx, dy = e.clientY - this.stick.sy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    this.stick.x = dx / R; this.stick.y = dy / R; this.knob.style.transform = `translate(${dx}px, ${dy}px)`; this.applyStick();
  },
  applyStick() {
    const s = this.stick, K = Input.keys, th = 0.28, v = G.player && G.player.vehicle, air = v && (v.kind === 'plane' || v.kind === 'heli');
    const set = (c, on) => { if (on && !K[c]) Input.pressed.add(c); K[c] = on; G.keys[c] = on; };
    if (v && !air) { Input.axisX = Math.abs(s.x) > 0.08 ? -s.x : 0; set('KeyA', false); set('KeyD', false); if (s.id === null) Input.axisX = null; return; }
    set('KeyA', s.x < -th); set('KeyD', s.x > th);
    if (!v || air) { set('KeyW', s.y < -th); set('KeyS', s.y > th); }
    if (!v) set('ShiftLeft', this.sprint || Math.hypot(s.x, s.y) > 0.92);
  },
  update() {
    if (!this.enabled) return;
    const v = G.player && G.player.vehicle, play = G.state === 'play';
    const mode = !play ? 'none' : !v ? 'foot' : (v.kind === 'plane' || v.kind === 'heli') ? 'air' : 'car';
    if (mode !== this.mode) {
      this.mode = mode; this.root.classList.toggle('inactive', !play);
      for (const [k, g] of Object.entries(this.groups)) g.classList.toggle('hidden', k === 'top' ? !play : k !== mode);
      // Eingaben zurücksetzen
      for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space']) { Input.keys[k] = false; G.keys[k] = false; }
      // Beim Wechsel der Knopfgruppe (z. B. Einsteigen per F) verschwindet der gedrückte Knopf – sein Loslassen käme nie an: alle Tasten freigeben
      for (const b of this.root.querySelectorAll('.tb')) { b.classList.remove('on'); const k = b.dataset.key; if (k) { Input.keys[k] = false; G.keys[k] = false; } }
      Input.buttons &= ~5;
      Input.axisX = null; this.stick.x = this.stick.y = 0; this.knob && (this.knob.style.transform = '');
      if (mode === 'car') { /* Gas-/Bremstasten statt Stick-Y */ }
    }
    if (this.stick.id !== null) this.applyStick();
  },
};
