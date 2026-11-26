// Admin-Sicherheit: signierte Befehle (ECDSA P-256), damit Kick/Bann/Stumm/Ansagen/Admin-Rechte nicht von jedem gefälscht werden können.
// Vertrauensanker ist der öffentliche Schlüssel des Haupt-Admins "Entity_2806" (OWNER_PUB im Code, sonst beim ersten Kontakt gemerkt).
// Admins erhalten ein vom Haupt-Admin signiertes Recht (Name + öffentlicher Schlüssel + Rechte) und signieren ihre Befehle selbst.
import { NS, Accounts } from './accounts.js';

export const OWNER = 'entity_2806';
export const OWNER_PUB = null; // fest verankerter öffentlicher Schlüssel "x.y" – null = erster veröffentlichter Schlüssel wird gemerkt
export const PERMS = {
  kick: 'Kicken', ban: 'Bannen', mute: 'Stummschalten', announce: 'Ansagen', bring: 'Spieler holen', heal: 'Spieler heilen', give: 'Geld an Spieler geben',
  veh: 'Fahrzeuge spawnen & verwalten', god: 'Gott-Modus, Heilen, Fähigkeiten (eigen)', money: 'Eigenes Geld ändern', weap: 'Waffen & Munition (eigen)', wanted: 'Fahndung ändern',
  move: 'Tempo, Sprung, Fliegen', world: 'Uhrzeit, Wetter, Verkehr', chaos: 'Passanten & Explosionen', mission: 'Missionen steuern', tp: 'Teleport', tools: 'Werkzeuge (Speichern, Konsole)',
};
// früheres Sammelrecht "self" = alle eigenen Cheats
export const SELF_PERMS = ['veh', 'god', 'money', 'weap', 'wanted', 'move', 'world', 'chaos', 'mission', 'tp', 'tools'];
export const expandPerms = (p) => (p.includes('self') ? [...new Set([...p.filter((x) => x !== 'self'), ...SELF_PERMS])] : p);
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: { name: 'SHA-256' } };
const te = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const LSK = (n) => 'vc_akey_v1_' + n;

async function importPub(k) { const [x, y] = String(k).split('.'); return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, ext: true }, ALG, false, ['verify']); }
async function verifyRaw(k, d, s) { try { return await crypto.subtle.verify(SIGN, await importPub(k), unb64(s), te.encode(d)); } catch (e) { return false; } }

export const Sec = {
  priv: null, jwk: null, pub: null, ownerPub: OWNER_PUB, admins: [], adminsT: 0, bans: new Map(), mutes: new Map(), seen: new Set(), ready: false,
  isOwnerName() { return !!(Accounts.user && Accounts.user.key === OWNER); },
  async init() {
    if (this.ready || !Accounts.user || !(window.crypto && crypto.subtle)) return;
    const key = LSK(Accounts.user.key); let jwk = null;
    try { jwk = JSON.parse(localStorage.getItem(key)); } catch (e) { }
    if (!jwk) { const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']); jwk = await crypto.subtle.exportKey('jwk', kp.privateKey); try { localStorage.setItem(key, JSON.stringify(jwk)); } catch (e) { } }
    await this.useKey(jwk);
    if (!this.ownerPub) { try { this.ownerPub = localStorage.getItem('vc_ownerpub') || null; } catch (e) { } }
    this.ready = true;
  },
  async useKey(jwk) { this.jwk = jwk; this.priv = await crypto.subtle.importKey('jwk', jwk, ALG, false, ['sign']); this.pub = jwk.x + '.' + jwk.y; },
  exportKey() { return JSON.stringify(this.jwk); },
  async importKey(text) { const j = JSON.parse(text); if (j.kty !== 'EC' || !j.d || !j.x || !j.y) throw new Error('kein gültiger Schlüssel'); await this.useKey(j); try { localStorage.setItem(LSK(Accounts.user.key), JSON.stringify(j)); } catch (e) { } },
  fingerprint(k) { k = k || this.pub || ''; let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0').toUpperCase().replace(/(....)(....)/, '$1-$2'); },
  // ---- Signieren / Prüfen ----
  async sign(obj) { const d = JSON.stringify(obj); const s = b64(await crypto.subtle.sign(SIGN, this.priv, te.encode(d))); return JSON.stringify({ d, s }); },
  async open(text) {
    let env; try { env = JSON.parse(text); } catch (e) { return null; } if (!env || typeof env.d !== 'string' || typeof env.s !== 'string') return null;
    let p; try { p = JSON.parse(env.d); } catch (e) { return null; }
    const from = String(p.f || '').toLowerCase();
    if (p.admins) { // Rechteliste: nur vom Haupt-Admin
      if (!this.ownerPub || !(await verifyRaw(this.ownerPub, env.d, env.s))) return null; return { p, from: OWNER, owner: true };
    }
    if (from === OWNER) { if (!this.ownerPub || !(await verifyRaw(this.ownerPub, env.d, env.s))) return null; return { p, from, owner: true, perms: Object.keys(PERMS) }; }
    const a = this.admins.find((x) => x.n.toLowerCase() === from); if (!a || !(await verifyRaw(a.k, env.d, env.s))) return null;
    return { p, from, owner: false, perms: expandPerms(a.p) };
  },
  myPerms() {
    if (this.isOwnerName() && (!this.ownerPub || this.ownerPub === this.pub)) return Object.keys(PERMS);
    const a = Accounts.user && this.admins.find((x) => x.n.toLowerCase() === Accounts.user.key && x.k === this.pub); return a ? expandPerms(a.p) : [];
  },
  isOwner() { return this.isOwnerName(); },
  ownerKeyOk() { return this.isOwnerName() && (!this.ownerPub || this.ownerPub === this.pub); },
  // ---- Veröffentlichen ----
  async cmd(mq, base, c, to, args = {}) {
    if (!mq || !mq.connected) return false; const me = Accounts.user.key;
    const p = { c, to: String(to || '').toLowerCase(), a: args, f: me, t: Date.now(), n: Math.random().toString(36).slice(2, 8) };
    const env = await this.sign(p);
    if (c === 'ban' || c === 'unban') mq.publish(`${NS}/ban/${p.to}`, env, true);
    else if (c === 'mute' || c === 'unmute') mq.publish(`${NS}/mute/${p.to}`, env, true);
    else mq.publish(`${base}/cmd`, env);
    return true;
  },
  async publishAdmins(mq) { const d = { admins: this.admins, t: Date.now(), f: OWNER }; mq.publish(`${NS}/admins`, await this.sign(d), true); this.adminsT = d.t; },
  async grant(mq, name, k, perms) { this.admins = this.admins.filter((x) => x.n.toLowerCase() !== name.toLowerCase()); this.admins.push({ n: name, k, p: perms }); await this.publishAdmins(mq); },
  async revoke(mq, name) { this.admins = this.admins.filter((x) => x.n.toLowerCase() !== name.toLowerCase()); await this.publishAdmins(mq); },
  async publishOwnerKey(mq) { mq.publish(`${NS}/ownerkey`, JSON.stringify({ k: this.pub, t: Date.now() }), true); this.ownerPub = this.pub; try { localStorage.setItem('vc_ownerpub', this.pub); } catch (e) { } },
  // ---- Empfangen ----
  onOwnerKey(msg) {
    let m; try { m = JSON.parse(msg); } catch (e) { return; } if (!m || typeof m.k !== 'string' || m.k.split('.').length !== 2) return;
    if (this.ownerPub) return; // schon gemerkt (oder im Code verankert): spätere Änderungen werden ignoriert
    this.ownerPub = m.k; try { localStorage.setItem('vc_ownerpub', m.k); } catch (e) { }
  },
  async onAdmins(msg) { const r = await this.open(msg); if (!r || !r.owner || !Array.isArray(r.p.admins) || r.p.t <= this.adminsT) return false; this.adminsT = r.p.t; this.admins = r.p.admins.filter((a) => a && typeof a.n === 'string' && typeof a.k === 'string' && Array.isArray(a.p)).map((a) => ({ ...a, p: expandPerms(a.p) })); return true; },
};
