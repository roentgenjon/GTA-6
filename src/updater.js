// Automatische Aktualisierung: erkennt neue Versionen (version.json) und lädt die Seite neu
import { G } from './game.js';

const BUILD = (typeof window !== 'undefined' && window.__BUILD) || '';
export const Updater = {
  pending: null, bar: null, timer: null, left: 0, postponed: 0,
  enabled() { return !!BUILD && !BUILD.startsWith('__'); },
  init() {
    if (!this.enabled()) return;
    this.check();
    setInterval(() => this.check(), 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    window.addEventListener('online', () => this.check());
  },
  async check() {
    if (this.pending) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.v || j.v === BUILD) return;
      let tried = ''; try { tried = sessionStorage.getItem('vc_upd') || ''; } catch (e) { }
      if (tried === j.v) return; // wurde schon versucht (z. B. Deploy-Verzögerung) → keine Endlosschleife
      this.pending = j.v; this.show();
    } catch (e) { /* offline – später erneut */ }
  },
  busy() { return !!(G.hudMission || G.race || G.state === 'cutscene' || G.state === 'dead'); },
  show() {
    if (this.bar) return;
    const b = document.createElement('div'); b.id = 'updbar';
    b.innerHTML = '<span class="t">🔄 Neue Version verfügbar</span><button class="btn small" data-a="now">Jetzt aktualisieren</button><button class="btn small alt" data-a="later">Später</button>';
    document.body.appendChild(b); this.bar = b;
    b.onclick = (e) => { const a = e.target.closest('[data-a]'); if (!a) return; if (a.dataset.a === 'now') this.apply(); else { this.postponed = Date.now() + 5 * 60000; this.left = 0; b.querySelector('.t').textContent = '🔄 Update wartet …'; } };
    this.timer = setInterval(() => this.tick(), 1000); this.left = 0;
  },
  tick() {
    if (!this.pending || !this.bar) return;
    const t = this.bar.querySelector('.t');
    if (Date.now() < this.postponed) return;
    if (this.busy()) { this.left = 0; t.textContent = '🔄 Update wird nach der Mission installiert'; return; }
    const quiet = G.state === 'menu' || G.state === 'pause';
    if (!this.left) this.left = quiet ? 3 : 15;
    this.left--;
    t.textContent = '🔄 Neue Version – Update in ' + Math.max(0, this.left) + ' s (Spielstand wird gesichert)';
    if (this.left <= 0) this.apply();
  },
  apply() {
    if (!this.pending) return;
    const playing = G.state !== 'menu';
    try { if (G.autosave && playing) G.autosave(); } catch (e) { }
    try { sessionStorage.setItem('vc_upd', this.pending); if (playing) sessionStorage.setItem('vc_resume', '1'); } catch (e) { }
    clearInterval(this.timer);
    // anderer Query-Parameter → index.html wird garantiert frisch geladen
    location.replace(location.pathname + '?u=' + encodeURIComponent(this.pending));
  },
};
