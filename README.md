# Health

Persönliche Health- und Fitness-App als Progressive Web App. Läuft komplett offline auf dem iPhone, alle Daten bleiben auf dem Gerät. Eine verschlüsselte Sicherung geht optional in ein privates GitHub-Repo.

Die verbindlichen Regeln für Design und Code stehen in [CLAUDE.md](CLAUDE.md).

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

## Entwicklung

Kein Build-Schritt nötig. Lokal starten, zum Beispiel mit:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Der Service Worker läuft nur über `localhost` oder HTTPS.

Nach Änderungen an Shell-Dateien in `sw.js` die `VERSION` erhöhen, damit Geräte die neue Fassung laden.

## Deployment

Jeder Push auf `main` deployt über GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) nach GitHub Pages.

Einmalig im Repo `health-app` einstellen: **Settings > Pages > Build and deployment > Source: GitHub Actions**.

## Lizenzen

Schrift Inter von The Inter Project Authors, SIL Open Font License 1.1, siehe [assets/fonts/OFL.txt](assets/fonts/OFL.txt).
