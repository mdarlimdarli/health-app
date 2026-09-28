# Changelog

## v1.0 (28.09.2026)

Erste vollständige Fassung als PWA für das iPhone (375 x 667 px, Safari, Home-Bildschirm).

### App
- Startseite mit Tageszahl, Begrüßung aus dem Profil, Aura aus dem Check-in, fälligen Medis, nächstem Training und den Mahlzeiten des Tages.
- Training: Pläne zur Laufzeit aus dem Profil (Tage pro Woche, Level, Schonungen, Phase), Übungsbibliothek mit Grafiken, Einheit mit Sätzen, Gewicht, Wiederholungen, RPE, Pausentimer und Progressionsvorschlag, Alternativen und „Mag ich nicht“, Fortschritt, Phasenwechsel als Vorschlag.
- Medis: Zeitpläne täglich, alle n Tage, wöchentlich und saisonal, Messwerte (Blutdruck, Puls), kritische Einträge oben mit Streak, Tagesauswahl, Verwalten, Zahl am Tab und am App-Symbol.
- Check-in: ein Eintrag pro Tag mit Slidern aus dem Profil, optional Schmerzseite und Zyklus, Auswertung mit Verläufen und Kalender, ohne Interpretation.
- Ernährung: Wochenplan, Ampel aus den Unverträglichkeiten im Profil, Ausschluss über Abneigungen, Tauschen, Feedback, Lebensmittelliste. Eigener Essensplan per Import, sonst neutraler Beispielplan mit Hinweis.
- Auszug für die Beratung als Markdown, ohne Namen, Medikamente standardmäßig anonymisiert.

### Daten und Sicherheit
- Alles in IndexedDB auf dem Gerät, jede Änderung zuerst lokal, dann in die Sync-Queue.
- Verschlüsselte Sicherung (AES-GCM, PBKDF2 mit 300.000 Iterationen) über die GitHub Contents API in ein privates Daten-Repo, Name in den Einstellungen änderbar. Konflikte werden nie still überschrieben.
- Profil und Essensplan leben nur auf dem Gerät und in der Sicherung, nie im Repo. Token, Passwort-Prüfwert und Sync-Stand werden nie gesichert oder exportiert.
- Push-Erinnerungen über eine GitHub Action im Daten-Repo, Mitteilungen ohne Medikamentennamen.
- Content Security Policy: nur eigene Quellen, Netzwerk nur zu api.github.com. Kein Tracking, keine Cookies.

### Plattform
- Offline nach dem ersten Laden: App Shell, Übungsgrafiken und Schrift im Service-Worker-Cache, Daten nie im Cache.
- Standalone: eigener Zurück-Pfeil in der Kopfzeile auf Unterseiten, externe Links öffnen in Safari.
- Onboarding auf frischem Gerät, Profil-Import und Wiederherstellung aus der Sicherung.
- App-Icons 180 und 512 px (Creme mit Sonnenkreis), erzeugt mit `scripts/generate-icons.mjs`.
- Inter Variable selbst gehostet und gesubsettet (Latin, Gewichte 400 bis 900, opsz), 41 KB.
- Design-System mit Aura, Pillen und Kreisen, Kontraste nach WCAG AA, Tap-Ziele mindestens 44 px.

## Ideen für v2

- **Entsperren mit Touch ID:** Passkey mit WebAuthn-PRF statt Passworteingabe bei jedem Start, das Passwort bleibt als Rückfallebene.
- **Essensplan in der App bearbeiten:** Gerichte und Wochenplan direkt ändern statt über eine Datei, mit Export für die Beratung.
- **Einkaufsliste** aus dem Wochenplan, gruppiert nach Kategorie, offline abhakbar.
- **Trainingsplan-Editor:** Übungen, Sätze und Reihenfolge je Plan von Hand festlegen, ohne `data/plans.json`.
- **Messwerte-Diagramme** über Wochen und Monate, Export als CSV.
- **Wochenrückblick** am Sonntag: Einheiten, Einnahmen, Check-ins als Zahlen, weiterhin ohne Interpretation.
- **Konflikte zusammenführen:** bei einer fremden Sicherung auf GitHub Einträge zusammenführen statt nur wiederherstellen oder überschreiben.
- **Tests in CI:** Planer-, Medis- und Food-Tests als GitHub Action vor jedem Deployment.
- **Optionaler Minify-Schritt** im Deployment, um die erste Ladung weiter zu verkleinern.
- **Weitere Sprachen:** Oberflächentexte auslagern, Englisch als erste Ergänzung.
