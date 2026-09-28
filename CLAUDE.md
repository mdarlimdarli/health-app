# CLAUDE.md

## Projekt
Persönliche Health- und Fitness-App für eine einzelne Person pro Fork (persönliche Angaben stehen nur im Profil, siehe Personenneutralität). Läuft als PWA auf einem iPhone SE 2022 (Viewport 375 x 667 px, Touch ID, Safari). Wird über GitHub Pages ausgeliefert (Repo: health-app). Alle Daten bleiben lokal auf dem Gerät und werden zusätzlich verschlüsselt in ein privates GitHub-Repo (health-data) gesichert.

## Stack, bewusst einfach
- Vanilla HTML, CSS, JavaScript (ES Modules). Kein Framework, kein Build-Schritt außer optionalem Minify.
- Speicher: IndexedDB über die Bibliothek `idb` (als lokale Kopie im Repo, nicht per CDN, damit alles offline läuft).
- Service Worker für Offline-Betrieb (App Shell cachen, Daten nie im SW-Cache).
- Verschlüsselung: WebCrypto, AES-GCM, Schlüssel per PBKDF2 (mind. 300.000 Iterationen) aus einem Nutzerpasswort. Passwort wird nie gespeichert, nur der Schlüssel in der Session.
- Sync: GitHub Contents API, eine Datei `data.json.enc` pro Sicherung plus `manifest.json` im Repo health-data. Token (fine-grained PAT) liegt in IndexedDB, wird nie geloggt.
- Schrift: Inter, selbst gehostet als woff2 (Variable Font), Subsets Latin. Keine Google-Fonts-Verlinkung.
- Sprache der Oberfläche: Deutsch, Du-Form. Keine Gedankenstriche im UI-Text.

## Struktur
/index.html
/manifest.webmanifest
/sw.js
/css/tokens.css, base.css, components.css
/js/app.js (Router, Shell), db.js (IndexedDB), crypto.js, sync.js, notify.js, profile.js (Profil), ui.js (Dialoge, Datum)
/js/modules/home.js, training.js, meds.js, checkin.js, food.js, settings.js, profile-form.js (Onboarding, Profil bearbeiten)
/js/vendor/idb.js
/data/exercises.json, plans.json, meals.json (Inhalt, kein Code), profile.example.json (neutrale Profilvorlage)
/assets/exercises/*.svg, /assets/fonts/, /assets/icons/

## Design-System (verbindlich)
Ästhetik: Swiss Design, clean, minimalistisch, mit weichen Farbverläufen als Zustandsanzeige. Große Zahlen tragen die Information, Text ist sekundär.
- Hintergrund: #F6F2EC (warmes Off-White). Text: #161616. Sekundärtext: #6F6A63. Linien: #E3DDD3.
- Akzentverläufe (radial, weich, blur 40 bis 80 px, immer auf dem Off-White):
  - Sonne: #FFB347 zu #FF6A3D (Energie, Training)
  - Zitrone: #F7E463 zu #FFD23F (Medikamente, Erinnerung)
  - Himmel: #8BB8FF zu #5A8DEE (Schlaf, Ruhe)
  - Flieder: #C9B8FF zu #9A8CFF (Zyklus)
  - Salbei: #B7D3A8 zu #7FA36A (Verdauung, Ernährung)
  - Rose: #FFB3C7 zu #FF7A9E (Schmerz, Warnung)
- Ein Verlauf zeigt Intensität: je höher der Wert, desto satter und größer der Blur-Fleck. Slider-Werte werden nicht nur als Zahl, sondern als Farbfläche sichtbar.
- Typografie: Inter. Große Zahlen 56 bis 72 px, Gewicht 500, tabular-nums, letter-spacing -0.02em. Überschriften 20 px, Gewicht 600. Fließtext 15 px, Gewicht 400, line-height 1.45. Labels 12 px, Uppercase, letter-spacing 0.08em, Sekundärfarbe.
- Raster: 8 px. Seitenrand 20 px. Karten: Radius 20 px, keine Schatten, Trennung über Farbe oder 1 px Linie.
- Bottom-Tab-Bar mit 5 Einträgen: Heute, Training, Medis, Check-in, Essen. Einstellungen über Icon oben rechts. Safe Areas (env(safe-area-inset-*)) beachten.
- Interaktion: Tap-Ziele mind. 44 px. Keine Hover-Zustände nötig. Übergänge 180 ms ease-out. Haptik nicht verfügbar, dafür klare visuelle Bestätigung.
- Icons: dünne Linien-Icons (1.5 px), selbst als SVG, keine Icon-Bibliothek.
- Verbotene Muster: Balkendiagramme mit vielen Farben, Schlagschatten, Bootstrap-Look, Emojis im UI.

## Regeln für Code
- Alles muss offline funktionieren, außer Sync und YouTube-Links.
- Jede Datenänderung: erst IndexedDB, dann Sync-Queue (Sync darf fehlschlagen, Daten nie).
- Datum immer lokal (Europe/Berlin), gespeichert als ISO-String ohne Zeitzonenverschiebung des Tages.
- Keine externen Requests außer api.github.com (Sync) und youtube.com (Links, nur per Klick).
- Kein Analytics, kein Tracking, keine Cookies.
- Kommentare und Commit-Messages auf Deutsch.

## Personenneutralität
- Der Code enthält keine Namen, keine konkreten Medikamente, keine Zyklus-Annahmen, keine Trainingsregeln. All das steht im Profil.
- Jede Funktion, die Verhalten personalisiert, liest aus dem Profil über js/profile.js (getProfile(), z.B. cycleTracking, training.avoidTags, diet). Medikamente liegen im Store meds.
- Das aktive Profil lebt in IndexedDB (Store settings, key "profile") und ist Teil der verschlüsselten Sicherung im Repo health-data. Bei Gerätewechsel wandert es mit der Wiederherstellung mit.
- data/profile.json wird nie committet (.gitignore) und nie deployt. Öffentlich ist nur data/profile.example.json (neutrale Vorlage). Eine lokale data/profile.json dient höchstens als Import-Datei.
- Beim ersten Start ohne Profil zeigt die App ein Onboarding (#/willkommen): Name, Geburtsjahr, Zyklus-Tracking, Trainingstage pro Woche, Trainingslevel, Schonungs-Tags als Checkboxen mit verständlichen Labels, Unverträglichkeiten, Lieblingsküchen, Abneigungen. Medikamente werden nicht im Onboarding abgefragt, sondern im Medis-Tab angelegt.
- In den Einstellungen: "Profil bearbeiten" (gleiche Felder), "Profil als Datei exportieren" und "Profil aus Datei importieren" (JSON). Ein Import ergänzt Medikamente mit neuer ID, bestehende werden nie überschrieben.
- Manifest-Name und short_name sind fest "Health". App-Titel und Begrüßung in der App werden aus profile.displayName gebildet ("<displayName> Health").
- Keine Profildaten in Tests, README, PROFILE.md, Beispielen oder Commits. Beispiele immer neutral.
