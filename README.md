# VICE CITY – Open World (Three.js)

Ein im Browser spielbares, komplett prozedural erzeugtes Open-World-Spiel im Stil moderner GTA-Titel – ohne Build-Schritt, ohne externe Assets.

**Spielen:** `https://<benutzer>.github.io/GTA-6/` – die Seite aktualisiert sich nach jedem Deploy von selbst (siehe *Automatische Updates*).
**Lokal:** beliebigen statischen Server im Projektordner starten (z. B. `python3 -m http.server`) und `index.html` öffnen. Module werden per `importmap` geladen, daher nicht per `file://`.

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D / Maus | Bewegen / Kamera |
| Shift / Leertaste | Sprinten / Springen (im Auto: Handbremse) |
| E | Interaktion (Shops, Missionen, Immobilien) |
| F | Fahrzeug betreten / verlassen |
| LMB / RMB / R / 1-7 | Schießen / Zielen / Nachladen / Waffenwahl |
| H, L, C, R (im Auto) | Hupe, Licht, Kamera, Radiosender |
| M, I, J, P, ESC | Karte, Inventar, Missionen, Handy, Pause |
| Flugzeug/Heli | Shift = Schub/Steigen, Leertaste = Schub weg/Sinken, W/S Neigung, A/D Rollen, Q/E Gieren |

## Touch / iPad

Auf Tablets und Handys erscheint automatisch eine Touch-Steuerung: linker Stick (Bewegen bzw. Lenken), Wischen rechts (Kamera), Tasten für Schießen, Zielen, Springen, E/F, Gas/Bremse/Handbremse im Auto sowie Schub/Neigung im Flugzeug. Unter *Einstellungen → Touch-Steuerung* lässt sie sich erzwingen oder ausschalten. Auf Touch-Geräten startet das Spiel in „Mittel"; für mehr Grafik die Qualität erhöhen. Tipp für iPad: Seite zum Home-Bildschirm hinzufügen (Vollbild).

## Licht, Schatten & Spiegelungen

- **Kaskaden-Schatten (CSM):** Sonne und Mond werfen Schatten über die ganze Sichtweite (2–4 Kaskaden je nach Qualität), Wolkenkratzer-Schatten liegen quer über den Straßen.
- **Sonneneffekte:** sichtbare Sonnenscheibe, Lichtstrahlen (God Rays) durch Häuserlücken, Linsenreflexe, Bloom, Verdeckung durch Gebäude und Wolken.
- **Echtzeit-Spiegelungen:** der Ozean und nasse Straßen/Pfützen spiegeln Stadt, Himmel, Fahrzeuge und Figuren (planare Reflexion), dazu Himmels-Reflexionen auf Lack und Glas.
- **Lichtkegel:** volumetrische Scheinwerferstrahlen und Lichtflecken auf der Straße bei Nacht, Regen und Nebel.
- Unter *Einstellungen* lassen sich Spiegelungen und Sonnenstrahlen einzeln abschalten; dort gibt es auch eine FPS-Anzeige und die automatische Leistungsanpassung (senkt bei niedriger Bildrate die Auflösung bzw. die Qualitätsstufe). Die Qualitätsstufe bestimmt Kaskaden, Schattenauflösung und Spiegelungs-Detail (Wechsel lädt die Seite neu).

## Glatte 3D-Modelle (kein Blockwerk)

- **Figuren:** Spieler, Passanten, Polizisten & Co. sind weich gelofte Körper mit 11-Knochen-Skelett (Skinning): Torso mit Schultern/Taille/Hüfte, runde Arme und Beine, Hände, Schuhe (Sneaker, Stiefel, Lederschuhe, Flip-Flops), Gesicht mit Augen, Brauen, Nase, Lippen, Ohren, sieben Frisuren, Hüte, Brillen, Kleidung (T-Shirt, Hoodie, Hemd, Top, Anzug mit Krawatte, Lederjacke, Hawaiihemd, Rock) – alles mit Vertexfarben. Drei Detailstufen (voll / mittel / fern) halten die Bildrate hoch.
- **Fahrzeuge:** Karosserien aus geglätteten Profilkurven (Chaikin + Fasen), runde Reifen mit Flanken, Felgen und Bremsen; Bäume mit weichen Kronen.

## Automatische Updates

Jeder Push startet das Deployment (Branch `gh-pages`). Der Build stempelt eine Versionsnummer in alle Modul-Importe (`?v=…`), schreibt `version.json` und umgeht so jeden Browser-Cache. Die laufende Seite fragt `version.json` regelmäßig ab; bei einer neuen Version erscheint ein Hinweis (im Menü nach 3 s, im Spiel nach 15 s, nie mitten in Mission/Rennen/Zwischensequenz), das Spiel speichert automatisch, lädt neu und macht dort weiter.

## Inhalt

- **Welt:** 24×24-Block-Stadt (Downtown-Wolkenkratzer, Neon District, Marina Shores mit Strand, Palm-Estates-Villen, Hafen, Industrie, Vororte), Flughafen mit Rollfeld, Bucht mit Stegen, Insel, Berge, Wälder, Farmen. Tag/Nacht-Zyklus, Sonnenuntergang, Regen, Gewitter, Nebel, Wolken, nasse Straßen.
- **Fahrzeuge:** 128 Modelle (Kompakt, Limousinen, Sport-/Supersportwagen, Muscle Cars, SUVs, Pickups, Vans, LKW, Busse, Motorräder, Boote, Jetskis, Yachten, Segelboot, Flugzeuge, Hubschrauber, Einsatzfahrzeuge) mit Fahrphysik, Driften, Bremsen, Sprüngen, Schaden/Verformung, Feuer und Explosionen.
- **Leben:** Ampeln, Spurführung, Verkehr, Fußgänger mit Reaktionen (Flucht, Hände hoch, Regenschirme, Ausweichen), parkende Autos.
- **Polizei:** 5 Fahndungsstufen, Zeugen, Streifenwagen, SWAT, Armee, Helikopter mit Scheinwerfer, Straßensperren, Festnahme/Krankenhaus.
- **Story:** 12 Missionen mit Dialogen/Zwischensequenzen, plus Straßenrennen, Taxi, Lieferjobs, Stunt-Sprünge, zufällige Ereignisse, Herausforderungen.
- **Spielsysteme:** Geld, Immobilien mit Garagen, Geschäfte mit Einnahmen, Autohaus, Tuning, Kleidung/Friseur, Waffenladen, Casino (Slots, Blackjack), Basketball, interaktive Karte mit GPS, Charakter-Editor, Inventar, Speichern/Laden (localStorage).
- **Technik:** Three.js r170 (lokal eingebunden in `vendor/`), PBR-Materialien mit Bump-Maps, Fassaden mit Jalousien/Rahmen, Kontaktschatten, Straßenmobiliar, Auto-Innenräume, Ambient Occlusion (Ultra), Umgebungsreflexionen aus dem Himmel, Schatten, Bloom, Bewegungsunschärfe, prozedurale Texturen, WebAudio (Motor, Sirenen, Regen, Schüsse, Radiosender).

## Cheats (Handy → Cheat-Konsole)

`GELD`, `GESUND`, `WAFFEN`, `FAHNDUNG`, `SUCHE`, `REGEN`, `STURM`, `SONNE`, `NEBEL`, `NACHT`, `TAG`, `SUNSET`, `GOTT`, `NOCOPS`, `AUTO`, `SUPER`, `BIKE`, `BUS`, `BOOT`, `HELI`, `FLUG`, `PANZER`.

## Deployment

`.github/workflows/deploy.yml` läuft bei jedem Push auf `main` und `claude/**` (oder manuell über *Actions → Run workflow*): `node --check` über alle Module, `index.html`, `styles.css`, `src/`, `vendor/` nach `dist/`, Versionsstempel + Cache-Busting, dann Veröffentlichung als Branch `gh-pages`. In den Repo-Einstellungen unter *Pages → Source* **Deploy from a branch → `gh-pages` / (root)** wählen.

## Projektstruktur

```
index.html, styles.css
src/  main.js (Schleife)  updater.js (Auto-Update)  bodies.js (Figuren-Generator)  world.js/city.js/terrain.js (Welt)  sky.js (Wetter)
      vehicles.js/models.js/catalog.js (Fahrzeuge)  persons.js/peds.js/traffic.js (Leben)
      police.js  combat.js  missions.js  activities.js  profile.js  ui.js  audio.js ...
vendor/three  (Three.js + Post-Processing-Addons)
```
