# Vice-City-Mehrspieler-Server

Ein kleiner Broker (MQTT über WebSocket) mit **Namensschutz** (einmal angelegte Konten und der Haupt-Admin-Schlüssel können nicht überschrieben werden), **Speicherung** (`data.json`) und **Begrenzungen** (Nachrichtengröße, Nachrichten pro Sekunde, nur das Spielfeld `vc-gta6-rj/…`).

## Kostenlos online stellen (Render, geht auch vom iPad)
1. <https://render.com> → mit GitHub anmelden.
2. **New → Blueprint** → Repository `roentgenjon/GTA-6` wählen → `render.yaml` wird erkannt → **Apply**.
   (Alternativ: New → Web Service → Root Directory `server`, Build `npm install`, Start `node server.js`.)
3. Nach dem Start steht oben die Adresse, z. B. `https://vicecity-server.onrender.com`. Öffne sie im Browser: „Vice City Server läuft …“.
4. Im Spiel auf der Anmeldeseite **⚙ Server** antippen und `wss://vicecity-server.onrender.com` eintragen – oder die Adresse fest in `src/config.js` (`SERVER_URL`) setzen, dann gilt sie für alle Spieler.

Hinweise: Im kostenlosen Render-Tarif schläft der Dienst nach ~15 Minuten ohne Besucher (erster Start dauert dann ~30–60 s) und das Dateisystem ist flüchtig – Konten/Banns gehen bei einem Neustart verloren, außer du hängst eine Disk an oder nutzt einen bezahlten Tarif. Auf einem eigenen PC/Raspberry/VPS: `npm install && PORT=8884 node server.js` (für `wss://` ein TLS-Proxy wie Caddy/nginx/Cloudflare Tunnel davor, weil die Seite per https läuft).

## Lokal testen
`cd server && npm install && node server.js` → im Spiel `?broker=ws://localhost:8884` an die Adresse hängen.
