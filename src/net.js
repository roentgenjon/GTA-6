// Minimaler MQTT-3.1.1-Client über WebSocket (nur QoS 0, Retain, Last-Will, Keep-Alive, automatisches Wiederverbinden).
// Dient als Vermittler für Mehrspieler und Kontenverzeichnis, weil die Seite statisch gehostet wird (kein eigener Server).
import { SERVER_URL } from './config.js?v=20261126142831-8986ff1';
const enc = new TextEncoder(), dec = new TextDecoder();

// Öffentliche Broker (WebSocket mit TLS) – werden der Reihe nach probiert. Mit ?broker=ws://host:port lässt sich ein eigener erzwingen.
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/'];

// ?broker=ws://host:port erzwingt einen eigenen Broker (Tests, eigener Server)
export function brokerUrls() {
  try { const f = new URLSearchParams(location.search).get('broker'); if (f) return [f]; } catch (e) { }
  try { const s = localStorage.getItem('vc_server'); if (s) return [s]; } catch (e) { }
  return SERVER_URL ? [SERVER_URL] : BROKERS;
}
function varint(n) { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; }
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) { const out = new Uint8Array(1 + varint(body.length).length + body.length); out[0] = type; const v = varint(body.length); out.set(v, 1); out.set(body, 1 + v.length); return out; }
function topicMatch(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) { if (f[i] === '#') return true; if (i >= t.length) return false; if (f[i] !== '+' && f[i] !== t[i]) return false; }
  return f.length === t.length;
}

export class Mqtt {
  constructor(opts = {}) {
    this.urls = opts.urls || brokerUrls(); this.clientId = opts.clientId || ('vc' + Math.random().toString(36).slice(2, 12));
    this.will = opts.will || null; this.keepAlive = 25; this.subs = new Map(); this.ws = null; this.url = null; this.buf = new Uint8Array(0);
    this.connected = false; this.closing = false; this.onstatus = opts.onstatus || (() => { }); this.pid = 1; this.pingT = null; this.retryT = null;
  }
  // Verbindung zum ersten erreichbaren Broker aufbauen; löst mit true/false auf
  async connect() {
    this.closing = false;
    // alle Broker gleichzeitig probieren, der schnellste gewinnt
    const ok = await new Promise((resolve) => { let left = this.urls.length; for (const u of this.urls) this._open(u).then((r) => { if (r) { if (!this.url || !this.connected || this.ws) this.url = u; resolve(true); } else if (--left === 0) resolve(false); }); });
    if (ok) { this.onstatus('online', this.url); return true; }
    this.onstatus('offline'); this._retry(); return false;
  }
  _open(url) {
    return new Promise((resolve) => {
      let done = false, ws;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(to); if (!ok) { try { ws && ws.close(); } catch (e) { } } resolve(ok); };
      const to = setTimeout(() => fin(false), 4500);
      try { ws = new WebSocket(url, 'mqtt'); } catch (e) { return fin(false); }
      ws.binaryType = 'arraybuffer'; this.buf = new Uint8Array(0);
      ws.onopen = () => {
        const flags = 0x02 | (this.will ? 0x04 : 0);
        const body = [...str('MQTT'), 4, flags, this.keepAlive >> 8, this.keepAlive & 255, ...str(this.clientId)];
        if (this.will) { body.push(...str(this.will.topic)); const wp = enc.encode(this.will.payload); body.push(wp.length >> 8, wp.length & 255, ...wp); }
        ws.send(packet(0x10, Uint8Array.from(body)));
      };
      ws.onmessage = (ev) => {
        this._feed(new Uint8Array(ev.data), (type, flags, data) => {
          if (type === 2 && !done) { if (data[1] === 0 && this.connected) fin(false); else if (data[1] === 0) { this.ws = ws; this.connected = true; this._armPing(); this._resubscribe(); fin(true); } else fin(false); }
          else if (type === 3) this._incoming(flags, data);
        });
      };
      ws.onerror = () => fin(false);
      ws.onclose = () => { if (!done) return fin(false); if (this.ws === ws) { this.connected = false; this.ws = null; clearInterval(this.pingT); this.onstatus('offline'); if (!this.closing) this._retry(); } };
    });
  }
  _retry() { clearTimeout(this.retryT); if (this.closing) return; this.retryT = setTimeout(async () => { if (this.closing || this.connected) return; const ok = await this.connect(); if (ok) this.onstatus('online', this.url); }, 15000); }
  _armPing() { clearInterval(this.pingT); this.pingT = setInterval(() => { try { if (this.ws && this.ws.readyState === 1) this.ws.send(Uint8Array.from([0xC0, 0])); } catch (e) { } }, this.keepAlive * 700); }
  _feed(chunk, cb) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
    for (;;) {
      if (this.buf.length < 2) return;
      let mul = 1, len = 0, i = 1, byte;
      do { if (i >= this.buf.length) return; byte = this.buf[i++]; len += (byte & 127) * mul; mul *= 128; } while (byte & 128);
      if (this.buf.length < i + len) return;
      const type = this.buf[0] >> 4, flags = this.buf[0] & 15, data = this.buf.slice(i, i + len); this.buf = this.buf.slice(i + len);
      cb(type, flags, data);
    }
  }
  _incoming(flags, d) {
    const tl = (d[0] << 8) | d[1], topic = dec.decode(d.slice(2, 2 + tl)); let off = 2 + tl; const qos = (flags >> 1) & 3; if (qos > 0) off += 2;
    const payload = d.slice(off), retained = !!(flags & 1);
    for (const [filter, cbs] of this.subs) if (topicMatch(filter, topic)) for (const cb of cbs) { try { cb(topic, dec.decode(payload), retained); } catch (e) { console.warn(e); } }
  }
  _resubscribe() { for (const f of this.subs.keys()) this._sendSub(f); }
  _sendSub(filter) { if (!this.ws || this.ws.readyState !== 1) return; const id = this.pid++ & 0xffff || 1; this.ws.send(packet(0x82, Uint8Array.from([id >> 8, id & 255, ...str(filter), 0]))); }
  subscribe(filter, cb) { let a = this.subs.get(filter); if (!a) { a = []; this.subs.set(filter, a); this._sendSub(filter); } else if (this.connected) this._sendSub(filter); a.push(cb); return () => { const x = this.subs.get(filter); if (!x) return; const k = x.indexOf(cb); if (k >= 0) x.splice(k, 1); if (!x.length) { this.subs.delete(filter); try { const id = this.pid++ & 0xffff || 1; this.ws && this.ws.readyState === 1 && this.ws.send(packet(0xA2, Uint8Array.from([id >> 8, id & 255, ...str(filter)]))); } catch (e) { } } }; }
  publish(topic, payload, retain = false) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const p = typeof payload === 'string' ? enc.encode(payload) : payload, t = str(topic), body = new Uint8Array(t.length + p.length); body.set(t); body.set(p, t.length);
    try { this.ws.send(packet(0x30 | (retain ? 1 : 0), body)); return true; } catch (e) { return false; }
  }
  // Einmal lesen: wartet auf eine (retained) Nachricht zu einem Thema; null bei Zeitüberschreitung
  getRetained(topic, ms = 2500) {
    return new Promise((resolve) => {
      if (!this.connected) return resolve(undefined);
      let off = null; const t = setTimeout(() => { off && off(); resolve(null); }, ms);
      off = this.subscribe(topic, (tp, msg, retained) => { clearTimeout(t); off && off(); resolve(msg); });
    });
  }
  close() { this.closing = true; clearTimeout(this.retryT); clearInterval(this.pingT); try { if (this.ws && this.ws.readyState === 1) this.ws.send(Uint8Array.from([0xE0, 0])); this.ws && this.ws.close(); } catch (e) { } this.ws = null; this.connected = false; }
}
