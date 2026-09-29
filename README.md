# Health

Persönliche Health- und Fitness-App als Progressive Web App, für eine Person pro Fork. Läuft komplett offline auf dem iPhone, alle Daten bleiben auf dem Gerät. Eine verschlüsselte Sicherung geht optional in ein privates GitHub-Repo.

Die verbindlichen Regeln für Design und Code stehen in [CLAUDE.md](CLAUDE.md).

Alles Persönliche (Name, Trainingsvorgaben, Ernährung) steht im Profil. Es lebt nur auf dem Gerät und in der verschlüsselten Sicherung, nie im Repo. Beim ersten Start richtest du es in der App ein. Die Felder und den Import beschreibt [PROFILE.md](PROFILE.md). Die Einrichtung für die erste und eine zweite Person steht in [ONBOARDING.md](ONBOARDING.md), die Versionen in [CHANGELOG.md](CHANGELOG.md).

## Auf dem iPhone installieren

1. Öffne **Safari** auf dem iPhone. Andere Browser können die App nicht als Web-App installieren.
2. Rufe die Adresse der App auf: `https://<github-name>.github.io/health-app/`
3. Tippe unten in der Leiste auf **Teilen** (das Quadrat mit dem Pfeil nach oben).
4. Scrolle in der Liste nach unten und tippe auf **Zum Home-Bildschirm**.
5. Der Name „Health“ ist schon eingetragen. Tippe oben rechts auf **Hinzufügen**.
6. Starte die App ab jetzt über das neue Symbol auf dem Home-Bildschirm. Sie öffnet sich ohne Safari-Leisten im Vollbild.

Beim ersten Start lädt die App alles Nötige. Danach funktioniert sie auch im Flugmodus.

### Update bekommen

Neue Versionen lädt die App automatisch im Hintergrund, sobald sie online ist. Aktiv werden sie beim nächsten Start. Falls etwas hängt: App im App-Umschalter ganz schließen und neu öffnen.

### Wichtig zu wissen

- **Neu anfangen:** Unter **Einstellungen > Zurücksetzen** löschst du alle Daten auf diesem Gerät (Bestätigung mit dem Wort LÖSCHEN). Die verschlüsselte Sicherung auf GitHub bleibt erhalten und lässt sich mit Owner, Repo, Token und Passwort wiederherstellen.

- Die Daten liegen im Speicher dieser Home-Bildschirm-App. Sie sind getrennt von Safari. Wenn du das Symbol löschst, sind auch die lokalen Daten weg. Deshalb die verschlüsselte Sicherung einrichten.
- iOS kann den Speicher von Web-Apps löschen, die lange nicht geöffnet wurden. Regelmäßig öffnen und sichern hilft.

## Sicherung einrichten

1. Auf GitHub ein **privates** Daten-Repo anlegen (darf leer sein). Standardname ist `health-data`, jeder andere Name geht auch.
2. Einen Fine-grained Token erstellen: nur Zugriff auf dieses Repo, Berechtigung **Contents: Read and write**. Dieser Token ist ein anderer als der zum Pushen des Codes.
3. In der App oben rechts die Einstellungen öffnen und unter GitHub Owner, **Daten-Repo** (leer lassen für `health-data`) und Token eintragen. Unter dem Feld steht der vollständige Pfad `owner/repo` als Vorschau. Dann speichern.
   Wechselst du später das Daten-Repo, beginnt die App dort mit einer neuen Sicherung. Die alte bleibt im bisherigen Repo liegen.
4. Ein Passwort setzen und gut aufbewahren. Ohne dieses Passwort lässt sich die Sicherung nicht mehr lesen.
5. „Jetzt sichern“ tippen. Danach sichert die App automatisch, 30 Sekunden nach jeder Änderung, sofern du online bist.

Im Repo liegen dann `data.json.enc` (verschlüsselt) und `manifest.json` (nur Zeitpunkt und Anzahl der Einträge, ohne Inhalte). Token, Passwort und Sync-Stand bleiben auf dem Gerät und werden nie mitgesichert oder exportiert.

## Push-Erinnerungen einrichten

Die App zeigt fällige Einträge immer auf der Startseite und als Zahl am Tab Medis. Push-Mitteilungen aufs Handy kommen ohne eigenen Server über eine GitHub Action in deinem privaten Daten-Repo. Unten steht dafür `health-data`. Hast du in den Einstellungen einen anderen Namen eingetragen, gilt überall dieser.

**So funktioniert es:** Beim Aktivieren legt die App im Repo `health-data` drei Dateien ab. `reminders.json` enthält deine Uhrzeiten und die Nachhak-Zeit, `subscriptions.json` die Push-Adresse deines iPhones, `status.json` nur das Datum und die Anzahl der heute noch offenen Einträge (keine Namen). Die App aktualisiert `status.json` beim Abhaken und beim Start. Die Action läuft zu diesen Uhrzeiten und verschickt eine allgemeine Mitteilung ohne Medikamentennamen.

**Nachhaken um 22 Uhr:** Zur Nachhak-Zeit (Standard 22:00, unter Einstellungen > Erinnerungen änderbar) kommt nur dann eine Mitteilung, wenn laut `status.json` heute noch etwas offen ist: „Du hast heute noch etwas offen: 2 Einträge.“ Welche es sind, siehst du erst in der App. Hast du die App an einem Tag gar nicht geöffnet, gibt es keinen Status von heute und damit kein Nachhaken, die normalen Erinnerungen kommen trotzdem.

**Einrichtung:** Schritt für Schritt in [ONBOARDING.md](ONBOARDING.md) unter „Push-Mitteilungen einrichten“: Secrets `VAPID_PRIVATE_KEY` und `VAPID_PUBLIC_KEY` im Daten-Repo, die Vorlagen aus `push-worker/` kopieren, den Token um **Actions: Read and write** erweitern, in der App **Mitteilungen aktivieren** und **Test-Mitteilung senden**. Der öffentliche Schlüssel steht in `js/config.js`, der private nur lokal in `.vapid-private` (ignoriert).

**Einschränkungen auf dem iPhone:**
- Web-Push gibt es erst ab iOS 16.4, und nur für die App vom Home-Bildschirm, nicht in Safari.
- Mitteilungen können sich verspäten oder ausbleiben, etwa im Energiesparmodus oder bei Fokus.
- GitHub startet geplante Actions oft einige Minuten später, bei hoher Last auch deutlich später.
- **Für wichtige Einträge deshalb zusätzlich eine Erinnerung in der iOS-App Erinnerungen stellen.**

Die Action braucht pro Lauf etwa eine Minute. Bei drei Uhrzeiten sind das rund 180 Minuten im Monat, das liegt gut im kostenlosen Kontingent für private Repos.

## Entwicklung

Kein Build-Schritt nötig. Lokal starten, zum Beispiel mit:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Der Service Worker läuft nur über `localhost` oder HTTPS.

Nach Änderungen an Shell-Dateien in `sw.js` die `VERSION` erhöhen, damit Geräte die neue Fassung laden.

Tests für die Verschlüsselung: `http://localhost:8000/test.html` öffnen. Die Seite wird nicht deployt.

Tests für Trainingsplaner, Übungsbibliothek und Medikamenten-Zeitpläne:

```bash
node scripts/test-planner.mjs
```

```bash
node scripts/test-meds.mjs
```

```bash
node scripts/test-food.mjs
```

```bash
node scripts/test-home.mjs
```

```bash
node scripts/test-cycle.mjs
```

**Essensplan:** Der eigene Plan ist persönlich und liegt nie im Repo. Du importierst ihn in der App unter **Einstellungen > Essensplan aus Datei importieren**, danach lebt er auf dem Gerät und in der verschlüsselten Sicherung. Im Repo liegt nur der neutrale Beispielplan `data/meals.example.json`. Eine lokale Arbeitskopie `data/meals.json` ist in `.gitignore`. Das Schema: `foods` (id, name, category, fructose, lactose, histamine, gluten, note), `meals` (id, name, cuisine, slot, ingredients, tags, prepMinutes, histamineTest, recipe als kurzes Markdown, swaps) und `weekPlan` (weekday 1 bis 7 mit slots). Eine Ampel gehört nicht in die Datei, die App berechnet sie aus dem Profil. Beim Import prüft die App das Schema und zeigt die Version. Nach einer Überarbeitung `version` erhöhen und die Datei erneut importieren.

App-Icons neu erzeugen (Creme mit Sonnenkreis, ohne Abhängigkeiten):

```bash
node scripts/generate-icons.mjs
```

**Schrift:** `assets/fonts/inter-app.woff2` ist Inter Variable, gesubsettet auf Latin, die genutzten Gewichte 400 bis 900 und die opsz-Achse. Neu erzeugen mit fonttools (`pip install fonttools brotli`) aus der Inter-Latin-Datei von Google Fonts:

```bash
pyftsubset inter-latin.woff2 --unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2039-203A,U+20AC,U+2212,U+2192" --layout-features="kern,tnum,calt,ccmp,locl,mark,mkmk" --flavor=woff2 --no-hinting --output-file=inter-sub.woff2
```

```bash
fonttools varLib.instancer inter-sub.woff2 wght=400:900 -o assets/fonts/inter-app.woff2
```

**Ladegröße:** Die erste Ansicht braucht ohne Schrift rund 135 KB (47 KB mit gzip, so liefert GitHub Pages aus). Der Service Worker legt beim ersten Besuch die ganze App Shell samt Übungsgrafiken ab, zusammen rund 150 KB mit gzip, dazu 41 KB Schrift.

Beispielpläne neu erzeugen (aus `data/profile.example.json` nach `data/plans.generated.json`):

```bash
node scripts/generate-plans.mjs
```

Mit `node scripts/generate-plans.mjs data/profile.json` siehst du die Pläne für dein eigenes Profil. Sie landen in `data/plans.local.json`, die Datei ist ignoriert.

## Deployment

Jeder Push auf `main` deployt über GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) nach GitHub Pages.

Einmalig im Repo `health-app` einstellen: **Settings > Pages > Build and deployment > Source: GitHub Actions**.

## Lizenzen

Schrift Inter von The Inter Project Authors, SIL Open Font License 1.1, siehe [assets/fonts/OFL.txt](assets/fonts/OFL.txt).
