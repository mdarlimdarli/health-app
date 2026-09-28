# Changelog

## v1.1 (28.09.2026): flexible Trainingsanpassung

- **Drei Ebenen statt fester Schonungen:** Körperregionen schonen (Nacken, Schulter, Lendenwirbelsäule, Brustwirbelsäule, Hüfte, Knie, Handgelenk, Ellbogen, Bauchraum), Bewegungen vermeiden (Überkopf, Last hinter dem Kopf, Wirbelsäule unter Last beugen oder rotieren, Bauchpressen, tiefe Kniebeuge, Sprünge und Stöße, einbeinige Stabilität, Hängen am Griff) und Aufbauen (oberer Rücken, Schultergürtel, Core-Stabilität, Hüfte und Gesäß, Beine, Knochendichte, Beweglichkeit, allgemeine Kraft).
- **Übungsbibliothek:** jede Übung mit Tags für belastete Regionen (`belastet:<region>`) und Bewegungsmuster (`bewegung:<id>`), Mobility mit `mobilisiert:<region>`. Drei neue Mobility-Übungen mit Grafik: Handgelenke mobilisieren, Fersenrutschen, Bauchatmung in Rückenlage. Für jede Region gibt es jetzt leichte Mobility.
- **Planer:** filtert nach Regionen und Bewegungen, nimmt für jede geschonte Region Mobility in den Aufwärmblock, mit Fokus Beweglichkeit sechs statt vier Übungen. Geloggte und bisherige Übungen bleiben bevorzugt, Ausgeschlossenes ersetzen Alternativen derselben Muskelgruppe.
- **Anpassen im Trainings-Tab:** Regionen, Bewegungen, Fokus, Tage pro Woche und Phase direkt ändern, jede Änderung speichert ins Profil und baut die Pläne sofort neu. Gesperrt während einer laufenden Einheit.
- **Was sich geändert hat:** nach jedem Neuaufbau eine Übersicht mit entfernten und neuen Übungen samt Grund, zum Beispiel „Latzug in den Nacken entfernt, weil Last hinter dem Kopf“. Mehrere Schritte werden zusammengefasst, bis du sie bestätigst.
- **Befristete Schonung:** optionales Datum „bis“ je Region. Danach fragt die Startseite „weiter schonen oder aufheben?“, entfernt wird nichts automatisch.
- **Meine Vorgaben:** Freitext für Vorgaben von Arzt, Physio oder Osteopath, im Trainings-Tab zum Nachlesen im Studio, ohne Logik. Der Auszug für die Beratung nennt Regionen, Bewegungen, Fokus und Vorgaben.
- **Profil Version 2:** `training.avoidTags` ist ersetzt durch `protectRegions`, `avoidMovements`, `focus` und `guidance`. Alte Profile werden beim Laden und Importieren automatisch migriert und migriert zurückgespeichert.
- Pläne werden gespeichert und nur bei geänderten Vorgaben neu gebaut. Service Worker v14.

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
- **Mehr Übungen für eingeschränkte Profile:** zum Beispiel knieschonende Beinübungen und Varianten ohne Überkopf, damit auch bei mehreren Schonungen jede Einheit vollständig bleibt.
- **Messwerte-Diagramme** über Wochen und Monate, Export als CSV.
- **Wochenrückblick** am Sonntag: Einheiten, Einnahmen, Check-ins als Zahlen, weiterhin ohne Interpretation.
- **Konflikte zusammenführen:** bei einer fremden Sicherung auf GitHub Einträge zusammenführen statt nur wiederherstellen oder überschreiben.
- **Tests in CI:** Planer-, Medis- und Food-Tests als GitHub Action vor jedem Deployment.
- **Optionaler Minify-Schritt** im Deployment, um die erste Ladung weiter zu verkleinern.
- **Weitere Sprachen:** Oberflächentexte auslagern, Englisch als erste Ergänzung.
