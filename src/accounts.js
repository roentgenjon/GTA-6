// Konten: Name + Passwort. Das Passwort verlässt nie das Gerät; es wird mit PBKDF2 zu einem Prüfwert verrechnet.
// Konten werden lokal (localStorage) gespeichert; der Name wird zusätzlich online "reserviert" (Retained-Nachricht auf dem
// öffentlichen Broker), damit Namen zwischen Geräten eindeutig sind. Ohne eigenen Server ist das nur ein weicher Schutz.
import { Mqtt } from './net.js';

export const NS = 'vc-gta6-rj';
const LS = 'vc_accounts_v1', REM = 'vc_remember_v1', LEG = 'vc_legacy_taken', SAVE_PREFIX = 'vicecity_save_v1_';
const NAME_RE = /^[A-Za-z0-9_\-äöüÄÖÜß]{3,16}$/;

const norm = (n) => String(n || '').trim().toLowerCase();
const rd = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
const wr = (m) => { try { localStorage.setItem(LS, JSON.stringify(m)); } catch (e) { } };
const topic = (n) => `${NS}/acct/${n}`;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const Accounts = {
  user: null, // { name, key }
  conflict: false,
  norm,
  validate(name, pass) {
    if (!NAME_RE.test(String(name || '').trim())) return 'Name: 3–16 Zeichen (Buchstaben, Zahlen, _ und -).';
    if (String(pass || '').length < 4) return 'Passwort: mindestens 4 Zeichen.';
    if (String(pass).length > 64) return 'Passwort: höchstens 64 Zeichen.';
    return null;
  },
  async derive(n, pass) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Für die Anmeldung wird eine sichere Verbindung (https) benötigt.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('vicecity|' + n), iterations: 150000 }, key, 256);
    return hex(bits);
  },
  // kurzlebige Verbindung nur zum Nachschlagen/Reservieren des Namens
  async lookup(n, claimHash, display) {
    const m = new Mqtt({ clientId: 'vcq' + Math.random().toString(36).slice(2, 10) });
    const ok = await m.connect(); if (!ok) { m.close(); return { online: false }; }
    const raw = await m.getRetained(topic(n), 2500);
    let rec = null; try { rec = raw ? JSON.parse(raw) : null; } catch (e) { rec = null; }
    let claimed = false;
    if (claimHash && !rec) { claimed = m.publish(topic(n), JSON.stringify({ h: claimHash, n: display, t: Date.now() }), true); await new Promise((r) => setTimeout(r, 300)); }
    m.close(); return { online: true, rec, claimed };
  },
  async login(name, pass, remember = true) {
    const err = this.validate(name, pass); if (err) return { ok: false, msg: err };
    const n = norm(name); let h; try { h = await this.derive(n, pass); } catch (e) { return { ok: false, msg: e.message }; }
    const accts = rd(), loc = accts[n];
    if (loc) {
      if (loc.h !== h) return { ok: false, msg: 'Falsches Passwort.' };
    } else {
      const r = await this.lookup(n);
      if (!r.online) return { ok: false, msg: 'Keine Verbindung zum Konten-Verzeichnis. Auf diesem Gerät gibt es das Konto noch nicht – bitte mit Internet erneut versuchen.' };
      if (!r.rec) return { ok: false, msg: 'Konto nicht gefunden. Zuerst „Konto erstellen“ wählen.' };
      if (r.rec.h !== h) return { ok: false, msg: 'Falsches Passwort.' };
      accts[n] = { name: String(r.rec.n || name).trim(), h, t: Date.now(), c: true }; wr(accts);
    }
    return this.finish(accts[n].name, n, remember);
  },
  async register(name, pass, remember = true) {
    const err = this.validate(name, pass); if (err) return { ok: false, msg: err };
    const n = norm(name); let h; try { h = await this.derive(n, pass); } catch (e) { return { ok: false, msg: e.message }; }
    const accts = rd(); if (accts[n]) return { ok: false, msg: 'Dieser Name ist auf diesem Gerät schon vergeben. Bitte anmelden.' };
    const r = await this.lookup(n, h, String(name).trim()); // prüft und reserviert in einer Verbindung
    if (r.online && r.rec) return { ok: false, msg: 'Dieser Name ist schon vergeben.' };
    const claimed = !!r.claimed;
    accts[n] = { name: String(name).trim(), h, t: Date.now(), c: claimed }; wr(accts);
    const res = this.finish(String(name).trim(), n, remember);
    if (!claimed) res.note = 'Offline erstellt: Der Name ist online noch nicht reserviert (wird beim nächsten Verbinden nachgeholt).';
    return res;
  },
  finish(name, n, remember) {
    this.user = { name, key: n }; this.conflict = false; try { sessionStorage.setItem('vc_sess', n); } catch (e) { }
    try { if (remember) localStorage.setItem(REM, n); else localStorage.removeItem(REM); } catch (e) { }
    this.adoptLegacy(n);
    return { ok: true, name };
  },
  // gespeichertes Konto auf diesem Gerät ("Angemeldet bleiben")
  restore() {
    try { const n = localStorage.getItem(REM) || sessionStorage.getItem('vc_sess'), a = n && rd()[n]; if (a) { this.user = { name: a.name, key: n }; this.adoptLegacy(n); return true; } } catch (e) { }
    return false;
  },
  // alter, kontoloser Spielstand gehört dem ersten Konto auf diesem Gerät
  adoptLegacy(n) {
    try {
      if (localStorage.getItem(LEG) || localStorage.getItem(SAVE_PREFIX + n)) return;
      const old = localStorage.getItem('vicecity_save_v1');
      if (old) { localStorage.setItem(SAVE_PREFIX + n, old); localStorage.setItem(LEG, n); }
    } catch (e) { }
  },
  saveKey() { return this.user ? SAVE_PREFIX + this.user.key : 'vicecity_save_v1'; },
  // nach dem Verbinden: Name nachträglich reservieren bzw. Konflikte erkennen
  async syncClaim(mq) {
    const u = this.user; if (!u || !mq || !mq.connected) return;
    const accts = rd(), loc = accts[u.key]; if (!loc) return;
    const raw = await mq.getRetained(topic(u.key), 2500); let rec = null; try { rec = raw ? JSON.parse(raw) : null; } catch (e) { }
    if (!rec) { mq.publish(topic(u.key), JSON.stringify({ h: loc.h, n: loc.name, t: Date.now() }), true); loc.c = true; accts[u.key] = loc; wr(accts); }
    else if (rec.h !== loc.h) this.conflict = true;
  },
  logout() { try { localStorage.removeItem(REM); sessionStorage.removeItem('vc_sess'); } catch (e) { } this.user = null; },
};
