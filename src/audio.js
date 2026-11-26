// Prozedurales Audio (WebAudio): Motor, Sirenen, Regen, Schüsse, Radio
import { G, on } from './game.js?v=20261126142831-8986ff1';
import { clamp, lerp, rr } from './util.js?v=20261126142831-8986ff1';

export const Audio = {
  ctx: null, master: null, ready: false, engines: new Map(), radioOn: true, station: 0, music: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = G.settings.volume; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = G.settings.music; this.musicBus.connect(this.master);
    // Rauschen
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
    // Regen
    this.rain = this.loopNoise(2600, 0.0, 'highpass'); this.wind = this.loopNoise(500, 0, 'lowpass'); this.amb = this.loopNoise(300, 0, 'lowpass');
    // Motor (Spieler)
    this.eng = { o1: c.createOscillator(), o2: c.createOscillator(), g: c.createGain(), f: c.createBiquadFilter() };
    this.eng.o1.type = 'sawtooth'; this.eng.o2.type = 'square'; this.eng.f.type = 'lowpass'; this.eng.f.frequency.value = 600; this.eng.g.gain.value = 0;
    this.eng.o1.connect(this.eng.f); this.eng.o2.connect(this.eng.f); this.eng.f.connect(this.eng.g); this.eng.g.connect(this.sfx); this.eng.o1.start(); this.eng.o2.start();
    // Reifenquietschen
    this.skid = this.loopNoise(1800, 0, 'bandpass');
    // Sirene
    this.siren = { o: c.createOscillator(), g: c.createGain() }; this.siren.o.type = 'sawtooth'; this.siren.g.gain.value = 0; this.siren.o.connect(this.siren.g); this.siren.g.connect(this.sfx); this.siren.o.start();
    this.ready = true; this.startRadio();
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  loopNoise(freq, vol, type) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(); return { s, f, g };
  },
  setVolumes() { if (!this.ready) return; this.master.gain.value = G.settings.volume; this.musicBus.gain.value = G.settings.music; },
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, freq = 1500, type = 'lowpass', delay = 0) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  pan(pos, base = 1) { // einfache Distanzdämpfung
    if (!pos || !G.camera) return base; const d = Math.hypot(pos.x - G.camera.position.x, pos.z - G.camera.position.z); return base * clamp(1 - d / 260, 0.02, 1);
  },
  gun(kind, pos) {
    if (!this.ready) return; const v = this.pan(pos, 1);
    if (kind === 'pistol') { this.noise(0.18, 0.5 * v, 2400, 'lowpass'); this.tone(180, 0.12, 'square', 0.18 * v, -120); }
    else if (kind === 'smg') { this.noise(0.1, 0.4 * v, 3000, 'lowpass'); this.tone(240, 0.07, 'square', 0.12 * v, -150); }
    else if (kind === 'heavy') { this.noise(0.3, 0.7 * v, 1800, 'lowpass'); this.tone(130, 0.2, 'square', 0.26 * v, -90); }
    else if (kind === 'sniper') { this.noise(0.5, 0.8 * v, 1400, 'lowpass'); this.tone(90, 0.35, 'sawtooth', 0.3 * v, -60); }
    else if (kind === 'rpg') { this.noise(0.7, 0.7 * v, 900, 'lowpass'); this.tone(70, 0.5, 'sawtooth', 0.3 * v, -40); }
    else if (kind === 'shotgun') { this.noise(0.35, 0.7 * v, 1500, 'lowpass'); this.tone(110, 0.25, 'sawtooth', 0.25 * v, -80); }
    else { this.noise(0.14, 0.5 * v, 3400, 'lowpass'); this.tone(200, 0.1, 'square', 0.15 * v, -140); }
  },
  explosion(x, y, z) { if (!this.ready) return; const v = this.pan({ x, z }, 1.2); this.noise(1.6, 0.9 * v, 600, 'lowpass'); this.tone(70, 1.2, 'sawtooth', 0.4 * v, -50); this.noise(0.5, 0.5 * v, 2500, 'lowpass'); },
  play(name, pos) {
    if (!this.ready) return;
    switch (name) {
      case 'punch': this.noise(0.1, 0.4, 700, 'lowpass'); this.tone(120, 0.08, 'sine', 0.2, -60); break;
      case 'reload': this.tone(900, 0.04, 'square', 0.08); this.tone(600, 0.05, 'square', 0.08, 0, 0.5); break;
      case 'crash': this.noise(0.4, this.pan(pos, 0.8), 900, 'lowpass'); this.tone(90, 0.3, 'sawtooth', 0.2, -50); break;
      case 'honk': this.tone(420, 0.35, 'square', this.pan(pos, 0.12)); this.tone(520, 0.35, 'square', this.pan(pos, 0.1)); break;
      case 'scream': this.tone(900, 0.5, 'sawtooth', 0.06, 500); break;
      case 'cash': this.tone(1100, 0.1, 'sine', 0.15); this.tone(1650, 0.18, 'sine', 0.15, 0, 0.08); break;
      case 'ui': this.tone(700, 0.05, 'sine', 0.08); break;
      case 'ok': this.tone(600, 0.08, 'sine', 0.12); this.tone(900, 0.14, 'sine', 0.12, 0, 0.07); break;
      case 'fail': this.tone(300, 0.3, 'sawtooth', 0.15, -120); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.15, 0, i * 0.1)); break;
      case 'thunder': this.noise(2.5, 0.8, 300, 'lowpass'); this.tone(50, 2, 'sawtooth', 0.25, -20); break;
      case 'splash': this.noise(0.3, 0.2, 1800, 'lowpass'); break;
      case 'door': this.noise(0.1, 0.3, 800, 'lowpass'); this.tone(150, 0.1, 'square', 0.1); break;
      case 'blip': this.tone(1200, 0.04, 'square', 0.05); break;
      case 'talk': this.tone(rr(180, 320), 0.05, 'square', 0.03); break;
    }
  },
  // pro Frame
  update(dt) {
    if (!this.ready) return;
    // Parameter nur 20× pro Sekunde setzen: jeder setTargetAtTime-Aufruf legt ein Automations-Ereignis an (12 Stück pro Bild belasten vor allem Safari)
    this._ut = (this._ut || 0) - dt; if (this._ut > 0) return; this._ut = 0.05;
    const c = this.ctx, t = c.currentTime, pl = G.player, w = G.weather;
    const v = pl && pl.vehicle;
    const active = G.state === 'play' || G.state === 'cutscene';
    // Regen/Wind
    const rain = w ? w.rain : 0; this.rain.g.gain.setTargetAtTime(active ? rain * 0.22 : 0, t, 0.3); this.wind.g.gain.setTargetAtTime(active ? (0.03 + (w ? w.cloud * 0.04 : 0) + (v && (v.kind === 'plane' || v.kind === 'heli') ? 0.1 : 0) + (v ? Math.min(0.15, Math.abs(v.speed) * 0.004) : 0)) : 0, t, 0.3);
    this.amb.g.gain.setTargetAtTime(active && (!v || v.kind === 'bike') ? 0.025 : 0, t, 0.5);
    // Motor
    if (v && active && !v.wreck) {
      const rpm = v.rpm, kind = v.kind; let base = 38 + rpm * 95, vol = 0.07 + v.throttleVis * 0.06;
      if (kind === 'plane') { base = 60 + rpm * 90; vol = 0.1; this.eng.o2.type = 'sawtooth'; }
      else if (kind === 'heli') { base = 22 + rpm * 20; vol = 0.14; this.eng.o2.type = 'square'; }
      else if (kind === 'boat') { base = 30 + rpm * 55; vol = 0.1; }
      else if (v.spec.cls === 'bike') { base = 70 + rpm * 130; vol = 0.08; }
      else if (v.spec.cls === 'truck' || v.spec.cls === 'bus') { base = 28 + rpm * 55; vol = 0.1; }
      else this.eng.o2.type = 'square';
      this.eng.o1.frequency.setTargetAtTime(base, t, 0.05); this.eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05); this.eng.f.frequency.setTargetAtTime(350 + rpm * 900 + v.throttleVis * 500, t, 0.05); this.eng.g.gain.setTargetAtTime(vol, t, 0.08);
      const sk = (v.drifting || (v.input.brake > 0.8 && v.speed > 12)) && v.grounded && v.kind === 'car' ? clamp(v.slip / 8 + 0.15, 0, 0.35) : 0; this.skid.g.gain.setTargetAtTime(sk * 0.5, t, 0.05); this.skid.f.frequency.setTargetAtTime(1500 + v.slip * 80, t, 0.1);
    } else { this.eng.g.gain.setTargetAtTime(0, t, 0.1); this.skid.g.gain.setTargetAtTime(0, t, 0.1); }
    // Sirene (nächstes Einsatzfahrzeug)
    let sv = 0, sd = 1e9;
    if (pl && active) for (const o of G.entities.vehicles) { if (o.sirenOn && !o.wreck) { const d = Math.hypot(o.pos.x - pl.pos.x, o.pos.z - pl.pos.z); if (d < sd) sd = d; } }
    const wail = 650 + Math.sin(G.clock * 3.2) * 250; this.siren.o.frequency.setTargetAtTime(wail, t, 0.03);
    this.siren.g.gain.setTargetAtTime(sd < 260 ? 0.04 * (1 - sd / 260) : 0, t, 0.1);
    // Hupe
    if (v && v.hornT > 0 && !this._horn) { this._horn = true; this.play('honk', v.pos); } if (!v || v.hornT <= 0) this._horn = false;
  },
  // ---------- Radio ----------
  STATIONS: [
    { name: 'Neon Waves FM', genre: 'Synthwave', bpm: 104, root: 45, scale: [0, 3, 5, 7, 10], wave: 'sawtooth' },
    { name: 'Calle Caliente', genre: 'Latin Pop', bpm: 96, root: 50, scale: [0, 2, 4, 7, 9], wave: 'triangle' },
    { name: 'Vice Beats 98.1', genre: 'Hip-Hop', bpm: 88, root: 41, scale: [0, 3, 5, 6, 7, 10], wave: 'square' },
    { name: 'Palm Chill', genre: 'Lo-Fi', bpm: 72, root: 48, scale: [0, 2, 3, 7, 9], wave: 'sine' },
    { name: 'Radio Aus', genre: '', bpm: 0 },
  ],
  startRadio() { this.seqT = 0; this.step = 0; },
  nextStation(dir = 1) { this.station = (this.station + dir + this.STATIONS.length) % this.STATIONS.length; return this.STATIONS[this.station]; },
  radioTick(dt) {
    if (!this.ready) return; const st = this.STATIONS[this.station]; const inCar = G.player && G.player.vehicle; const on_ = (inCar || G.state === 'menu') && st.bpm > 0 && (G.state === 'play' || G.state === 'menu' || G.state === 'pause');
    if (!on_) { this.musicBus.gain.setTargetAtTime(G.state === 'menu' ? G.settings.music : 0, this.ctx.currentTime, 0.2); if (!(G.state === 'menu')) return; }
    this.musicBus.gain.setTargetAtTime(G.settings.music * (G.state === 'pause' ? 0.4 : 1), this.ctx.currentTime, 0.2);
    const s = st.bpm > 0 ? st : this.STATIONS[0];
    const beat = 60 / s.bpm / 2; this.seqT -= dt;
    const c = this.ctx;
    while (this.seqT <= 0) {
      this.seqT += beat; const n = this.step++, t = c.currentTime + Math.max(0, this.seqT), bar = Math.floor(n / 16), chordRoots = [0, 5, 3, 7], cr = chordRoots[bar % 4];
      const note = (deg, oct = 0) => s.root + 12 * oct + s.scale[deg % s.scale.length] + cr;
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const play = (m, dur, type, vol, cutoff = 2500) => { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(f); f.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05); };
      const drum = (kind) => { const sBuf = c.createBufferSource(); sBuf.buffer = this.noiseBuf; const f = c.createBiquadFilter(); const g = c.createGain(); if (kind === 'k') { const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(og); og.connect(this.musicBus); o.start(t); o.stop(t + 0.25); return; } f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000; g.gain.setValueAtTime(kind === 's' ? 0.28 : 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 's' ? 0.14 : 0.04)); sBuf.connect(f); f.connect(g); g.connect(this.musicBus); sBuf.start(t, Math.random()); sBuf.stop(t + 0.2); };
      const pat = n % 16;
      if (s.genre === 'Hip-Hop') { if ([0, 5, 10].includes(pat)) drum('k'); if ([4, 12].includes(pat)) drum('s'); if (pat % 2 === 0) drum('h'); if (pat % 4 === 0) play(note(0, -1), beat * 3, 'sine', 0.25, 400); if (pat === 6 || pat === 14) play(note(2, 1), beat, 'square', 0.06, 1200); }
      else if (s.genre === 'Lo-Fi') { if (pat === 0 || pat === 8) drum('k'); if (pat === 4 || pat === 12) drum('s'); if (pat % 4 === 2) drum('h'); if (pat % 8 === 0) { [0, 2, 4].forEach((d) => play(note(d, 0), beat * 7, 'sine', 0.08, 900)); } if (pat % 4 === 3 && Math.random() < 0.6) play(note(Math.floor(Math.random() * 5), 1), beat * 2, 'triangle', 0.05, 1500); }
      else if (s.genre === 'Latin Pop') { if (pat % 4 === 0) drum('k'); if (pat % 8 === 4) drum('s'); if (pat % 2 === 1) drum('h'); if ([0, 3, 6, 10, 12].includes(pat)) play(note([0, 2, 4, 2, 3][[0, 3, 6, 10, 12].indexOf(pat)], 0), beat * 1.5, 'triangle', 0.13, 2500); if (pat % 4 === 0) play(note(0, -1), beat * 2, 'sine', 0.2, 500); }
      else { if (pat % 4 === 0) drum('k'); if (pat % 8 === 4) drum('s'); if (pat % 2 === 0) drum('h'); play(note([0, 0, 2, 0, 3, 0, 2, 4][n % 8], -1), beat * 1.6, 'sawtooth', 0.12, 700 + (n % 16) * 90); if (pat % 4 === 0) play(note([0, 2, 4, 2][Math.floor(pat / 4)], 1), beat * 3, 'square', 0.04, 2200); if (pat % 16 === 0) [0, 2, 4].forEach((d) => play(note(d, 0), beat * 14, 'sawtooth', 0.04, 1200)); }
    }
  },
};
on('honk', (v) => Audio.play('honk', v.pos));
on('crash', (v, vn) => Audio.play('crash', v.pos));
on('vehicleCollision', (a, b, sp) => { if (sp > 3) Audio.play('crash', a.pos); });
on('cash', () => Audio.play('cash'));
G.audio = Audio;
G.onThunder = () => Audio.play('thunder');
