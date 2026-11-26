// Vice-City-Mehrspieler-Server: ein MQTT-Broker (über WebSocket) mit
//  - Namensschutz: ein einmal angelegtes Konto (acct/<name>) und der Haupt-Admin-Schlüssel (ownerkey) können nicht überschrieben werden
//  - Speicherung der dauerhaften Nachrichten (Konten, Admin-Liste, Banns, Stummschaltungen) in data.json
//  - Begrenzungen (Nachrichtengröße, Nachrichten pro Sekunde, nur das Spiel-Namensfeld vc-gta6-rj/…)
// Start: npm install && node server.js   (Port über Umgebungsvariable PORT, Standard 8884)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Aedes } = require('aedes');
const { WebSocketServer, createWebSocketStream } = require('ws');

const NS = process.env.VC_NS || 'vc-gta6-rj';
const PORT = +process.env.PORT || 8884;
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_PAYLOAD = 8192, MAX_RATE = 40; // Byte, Nachrichten pro Sekunde und Verbindung

(async () => {
  const aedes = await Aedes.createBroker({ maxClientsIdLength: 40 });
  const retained = new Map(); // Thema → Nutzlast (Text)
  try { for (const [t, p] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')))) { retained.set(t, p); aedes.publish({ topic: t, payload: Buffer.from(p), retain: true, qos: 0, cmd: 'publish', dup: false }, () => { }); } console.log('geladen:', retained.size, 'gespeicherte Nachrichten'); } catch (e) { }
  let dirty = false;
  const save = () => { if (!dirty) return; dirty = false; try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(Object.fromEntries(retained))); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('Speichern fehlgeschlagen', e.message); } };
  setInterval(save, 15000); process.on('SIGTERM', () => { save(); process.exit(0); }); process.on('SIGINT', () => { save(); process.exit(0); });

  const rate = new WeakMap();
  aedes.authorizePublish = (client, packet, cb) => {
    const drop = () => { packet.topic = '$vc/dropped'; packet.retain = false; cb(null); }; // still verwerfen, Verbindung bleibt bestehen
    const t = packet.topic || '';
    if (!t.startsWith(NS + '/') || packet.payload.length > MAX_PAYLOAD) return drop();
    if (client) { const now = Date.now(); let r = rate.get(client); if (!r || now - r.t > 1000) r = { t: now, n: 0 }; r.n++; rate.set(client, r); if (r.n > MAX_RATE) return drop(); }
    if (packet.retain) {
      if (t.startsWith(NS + '/acct/') && retained.has(t) && retained.get(t) !== packet.payload.toString()) return drop(); // Konto-Name schon vergeben
      if (t === NS + '/ownerkey' && retained.has(t) && retained.get(t) !== packet.payload.toString()) return drop(); // Haupt-Schlüssel nur einmal
    }
    cb(null);
  };
  aedes.authorizeSubscribe = (client, sub, cb) => { if (!sub.topic.startsWith(NS + '/')) return cb(null, null); cb(null, sub); }; // fremde Themen (#, $SYS …) werden nicht ausgeliefert
  aedes.on('publish', (packet) => {
    if (!packet.retain || !(packet.topic || '').startsWith(NS + '/')) return;
    const p = packet.payload.toString(); if (!p) retained.delete(packet.topic); else retained.set(packet.topic, p); dirty = true;
  });

  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`Vice City Server läuft · ${aedes.connectedClients} verbunden · ${retained.size} Einträge\n`); });
  const wss = new WebSocketServer({ server, handleProtocols: (p) => (p.has('mqtt') ? 'mqtt' : false) });
  wss.on('connection', (ws) => { const s = createWebSocketStream(ws); s.on('error', () => { }); aedes.handle(s); });
  server.listen(PORT, () => console.log(`Vice City Server auf Port ${PORT} (Namensfeld ${NS})`));
})();
