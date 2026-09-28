# Health

Persönliche Health- und Fitness-App als Progressive Web App, für eine Person pro Fork. Läuft komplett offline auf dem iPhone, alle Daten bleiben auf dem Gerät. Eine verschlüsselte Sicherung geht optional in ein privates GitHub-Repo.

Die verbindlichen Regeln für Design und Code stehen in [CLAUDE.md](CLAUDE.md).

Alles Persönliche (Name, Trainingsvorgaben, Ernährung) steht im Profil. Es lebt nur auf dem Gerät und in der verschlüsselten Sicherung, nie im Repo. Beim ersten Start richtest du es in der App ein. Felder, Import und die Einrichtung für eine andere Person beschreibt [PROFILE.md](PROFILE.md).

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

- Die Daten liegen im Speicher dieser Home-Bildschirm-App. Sie sind getrennt von Safari. Wenn du das Symbol löschst, sind auch die lokalen Daten weg. Deshalb die verschlüsselte Sicherung einrichten.
- iOS kann den Speicher von Web-Apps löschen, die lange nicht geöffnet wurden. Regelmäßig öffnen und sichern hilft.

## Sicherung einrichten

1. Auf GitHub ein **privates** Repo `health-data` anlegen (darf leer sein).
2. Einen Fine-grained Token erstellen: nur Zugriff auf `health-data`, Berechtigung **Contents: Read and write**. Dieser Token ist ein anderer als der zum Pushen des Codes.
3. In der App oben rechts die Einstellungen öffnen, GitHub-Owner und Token eintragen und speichern.
4. Ein Passwort setzen und gut aufbewahren. Ohne dieses Passwort lässt sich die Sicherung nicht mehr lesen.
5. „Jetzt sichern“ tippen. Danach sichert die App automatisch, 30 Sekunden nach jeder Änderung, sofern du online bist.

Im Repo liegen dann `data.json.enc` (verschlüsselt) und `manifest.json` (nur Zeitpunkt und Anzahl der Einträge, ohne Inhalte). Token, Passwort und Sync-Stand bleiben auf dem Gerät und werden nie mitgesichert oder exportiert.

## Entwicklung

Kein Build-Schritt nötig. Lokal starten, zum Beispiel mit:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Der Service Worker läuft nur über `localhost` oder HTTPS.

Nach Änderungen an Shell-Dateien in `sw.js` die `VERSION` erhöhen, damit Geräte die neue Fassung laden.

Tests für die Verschlüsselung: `http://localhost:8000/test.html` öffnen. Die Seite wird nicht deployt.

Tests für Trainingsplaner und Übungsbibliothek:

```bash
node scripts/test-planner.mjs
```

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
