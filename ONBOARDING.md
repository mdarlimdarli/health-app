# Einrichtung

Die App selbst ist personenneutral. Alles Persönliche entsteht auf dem Gerät: das Profil über die Einrichtung in der App oder per Import, der Essensplan per Import, Medikamente im Tab Medis. Im Repo liegen nur neutrale Vorlagen (`data/profile.example.json`, `data/meals.example.json`), nie ein `profile.json` oder `meals.json`. Welche Felder das Profil hat, steht in [PROFILE.md](PROFILE.md).

Jede Person hat ihr eigenes iPhone und ihr eigenes privates Daten-Repo für die verschlüsselte Sicherung. Welches Daten-Repo die App nutzt, stellst du in den Einstellungen ein (Standard `health-data`).

## Erste Person einrichten

### Auf GitHub (einmalig)

1. **App-Repo und Pages.** Das Repo `health-app` liegt in deinem Account, als eigenes Repo oder als Fork. Unter **Settings > Pages > Build and deployment > Source** die Option **GitHub Actions** wählen. Bei einem Fork vorher unter **Actions** die Workflows erlauben, sie sind dort zuerst aus. Jeder Push auf `main` deployt dann nach `https://<github-name>.github.io/health-app/`.
2. **Daten-Repo anlegen.** Ein neues, **privates** Repo `health-data` anlegen. Es darf leer bleiben.
3. **Token erstellen.** Unter GitHub **Settings > Developer settings > Personal access tokens > Fine-grained tokens** einen Token anlegen:
   - Repository access: **Only select repositories**, nur `health-data`
   - Permissions: **Contents: Read and write**, für Push-Mitteilungen zusätzlich **Actions: Read and write** (siehe „Push-Mitteilungen einrichten“)
   - Ablaufdatum nach Wunsch. Läuft er ab, meldet die App „Token ungültig oder abgelaufen.“, dann einen neuen eintragen.

   Den Token nie ins Repo, in Notizen oder in Chats schreiben. Er gehört nur in die App.

### Auf dem iPhone

4. **App installieren.** Die Adresse aus Schritt 1 in **Safari** öffnen, **Teilen > Zum Home-Bildschirm** und die App ab dann über das Symbol starten (Details in der [README](README.md)). Nur so läuft sie im Vollbild, offline und mit Mitteilungen.
5. **Einrichtung.** Beim ersten Start erscheint die Einrichtung: Name, Geburtsjahr, Zyklus, Training, Unverträglichkeiten, Lieblingsküchen, Abneigungen. Das Training hat drei Ebenen:
   - **Körperregionen schonen** (Nacken, Schulter, Lendenwirbelsäule, Brustwirbelsäule, Hüfte, Knie, Handgelenk, Ellbogen, Bauchraum), je optional mit Datum „bis“. Übungen, die die Region belasten, fallen weg, dazu kommt leichte Mobility für diese Region.
   - **Bewegungen vermeiden**, zum Beispiel Überkopf, Last hinter dem Kopf oder Bauchpressen.
   - **Aufbauen**, zum Beispiel oberer Rücken, Core-Stabilität, Knochendichte oder Gleichgewicht und Standsicherheit (dann kommt je Einheit eine Gleichgewichtsübung mit Stütze in den Aufwärmblock).

   Dazu ein Freitextfeld für **Vorgaben von Arzt, Physio oder Osteopath**. Es steht im Trainings-Tab unter „Meine Vorgaben“ zum Nachlesen im Studio, die App wertet es nicht aus. Die Angaben ersetzen keine Beratung, trag ein, was dir gesagt wurde. Alles lässt sich später unter **Einstellungen > Profil bearbeiten** oder direkt im Trainings-Tab unter **Anpassen** ändern.

   Alternativ ein vorbereitetes Profil übernehmen: `data/profile.example.json` kopieren, lokal als `profile.json` anpassen, aufs iPhone legen (zum Beispiel über iCloud Drive) und in der Einrichtung **Profil importieren** wählen. Das geht auch später unter **Einstellungen > Profil aus Datei importieren**. Die Datei ist per `.gitignore` ausgeschlossen, also nie committen.
6. **Sicherung verbinden.** Oben rechts die Einstellungen öffnen und unter **GitHub** eintragen:
   - **Owner:** dein GitHub-Name
   - **Daten-Repo:** leer lassen für `health-data`
   - **Token:** der Token aus Schritt 3

   Unter dem Feld zeigt die App das Ziel als Vorschau, zum Beispiel `beispiel/health-data`. Prüfen, **Speichern**.
7. **Passwort setzen und erste Sicherung.** Unter **Passwort** ein Passwort festlegen und gut aufbewahren, ohne es lässt sich die Sicherung nie mehr lesen. Dann **Jetzt sichern**. Im Daten-Repo liegen danach `data.json.enc` (verschlüsselt, mit Profil, Essensplan und allen Einträgen) und `manifest.json` (nur Zeitpunkt und Anzahl). Ab jetzt sichert die App automatisch, 30 Sekunden nach jeder Änderung, sobald sie online ist.
8. **Essensplan importieren (optional).** Ohne eigenen Plan zeigt der Tab Essen den neutralen Beispielplan mit dem Hinweis „Eigenen Plan importieren“. Einen eigenen Plan im Format von `data/meals.example.json` vorbereiten, aufs iPhone legen und unter **Einstellungen > Essensplan aus Datei importieren** einspielen. Die App prüft das Schema und zeigt die Version. Eine lokale `data/meals.json` ist per `.gitignore` ausgeschlossen, nie committen.
9. **Medikamente anlegen (optional).** Im Tab **Medis > Verwalten > Neu**. Push-Mitteilungen richtest du wie unten unter „Push-Mitteilungen einrichten“ beschrieben ein.
10. **Training anpassen (optional).** Die Pläne entstehen aus `training` im Profil. Im Trainings-Tab öffnet **Anpassen** (neben dem Plan) Regionen, Bewegungen, Fokus, Tage pro Woche und Phase. Jede Änderung baut Plan A/B sofort neu, danach zeigt die App „Was sich geändert hat“ mit Grund. Übungen, für die es schon ein Trainingslog gibt, bleiben möglichst erhalten, damit die Fortschrittskurve weiterläuft. Während einer laufenden Einheit ist Anpassen gesperrt. Läuft eine befristete Schonung ab, fragt die Startseite, ob du weiter schonen oder aufheben willst, entfernt wird nichts automatisch. Persönliche Einschränkungen gehören nie in `data/exercises.json`. Einzelne Übungen tauschst du in der Einheit per „Alternative“ oder schließt sie per „Mag ich nicht“ aus.

**Neues iPhone:** App installieren, in der Einrichtung auf **Sicherung laden** tippen, Owner, Daten-Repo, Token und Passwort eintragen und **Wiederherstellen**. Profil, Essensplan und alle Einträge kommen mit.

## Push-Mitteilungen einrichten

Mitteilungen aufs iPhone kommen ohne eigenen Server über eine GitHub Action im privaten Daten-Repo. Sie erinnern um 07:30, 12:30 und 20:30 an die Medis und haken um 22:00 nach, falls heute noch etwas offen ist. Keine Mitteilung nennt ein Medikament, beim Nachhaken steht nur die Anzahl.

### 1. Schlüssel (einmal pro App)

Das Schlüsselpaar für Web Push (VAPID) ist schon erzeugt:

- **Öffentlicher Schlüssel:** steht in `js/config.js` und darf öffentlich sein.
- **Privater Schlüssel:** liegt nur lokal in `.vapid-private` im Projektordner. Die Datei ist per `.gitignore` ausgeschlossen und nur für dich lesbar. Nie committen, nie in Chats oder Notizen kopieren.

Wer die App forkt, erzeugt ein eigenes Paar, zum Beispiel mit `npx web-push generate-vapid-keys`, trägt den öffentlichen Schlüssel in `js/config.js` ein und legt den privaten in `.vapid-private` ab.

### 2. Secrets im Daten-Repo

Im Repo `health-data` auf GitHub: **Settings > Secrets and variables > Actions > New repository secret**.

- **`VAPID_PRIVATE_KEY`:** der Inhalt von `.vapid-private`. Am Mac im Projektordner diesen Befehl ausführen, dann steht der Schlüssel in der Zwischenablage und du fügst ihn direkt in das Feld „Secret“ ein:

  ```bash
  tr -d '\n' < .vapid-private | pbcopy
  ```

  Danach die Zwischenablage mit etwas anderem überschreiben.
- **`VAPID_PUBLIC_KEY`:** der Wert von `VAPID_PUBLIC_KEY` aus `js/config.js`, ohne Anführungszeichen.
- **`VAPID_SUBJECT`** (optional): eine Kontaktadresse wie `mailto:du@example.com`. Ohne dieses Secret nutzt die Action dein GitHub-Profil als Kontakt.

### 3. Dateien ins Daten-Repo

Zwei Dateien aus diesem Repo kommen ins Daten-Repo. Am einfachsten im Browser: im Repo `health-data` auf **Add file > Create new file**, den Pfad eintippen, den Inhalt aus der Raw-Ansicht der Vorlage einfügen und committen.

| Vorlage in `health-app` | Pfad im Daten-Repo |
|---|---|
| `push-worker/reminders.yml` | `.github/workflows/reminders.yml` |
| `push-worker/send-reminders.mjs` | `push/send-reminders.mjs` |

Die Vorlage enthält die Zeiten 07:30, 12:30, 20:30 und 22:00, je mit einer Zeile für Sommer- und Winterzeit. Bei eigenen Uhrzeiten zeigt die App unter **Einstellungen > Erinnerungen > Zeitplan für die GitHub Action** die passenden Zeilen.

### 4. Token erweitern

Der Fine-grained Token für das Daten-Repo braucht jetzt zwei Berechtigungen:

- **Contents: Read and write** (Sicherung und die Dateien für Mitteilungen)
- **Actions: Read and write** (nur für den Button „Test-Mitteilung senden“)

Unter GitHub **Settings > Developer settings > Fine-grained tokens** den Token bearbeiten, oder einen neuen erstellen und in der App eintragen.

### 5. In der App

1. App vom Home-Bildschirm öffnen, nicht in Safari. Web Push geht auf dem iPhone ab iOS 16.4 und nur so.
2. **Einstellungen > Erinnerungen:** Uhrzeiten 07:30, 12:30 und 20:30 eintragen, Nachhaken 22:00, **Zeiten speichern**.
3. **Mitteilungen aktivieren** tippen und die Frage von iOS erlauben. Die App legt dann `reminders.json`, `subscriptions.json` und `status.json` im Daten-Repo ab. Der Status zeigt „Aktiv“, „Nicht erlaubt“ oder „Nicht unterstützt“.
4. **Test-Mitteilung senden** tippen. Nach etwa einer Minute kommt „Test: Mitteilungen funktionieren.“ Alternativ im Daten-Repo unter **Actions > Erinnerungen senden > Run workflow** mit `test` auf `true` starten.

Kommt nichts: Unter **Actions** im Daten-Repo den letzten Lauf öffnen. Dort steht, ob Secrets fehlen, und abgelaufene Abos werden automatisch entfernt. Für wichtige Einträge trotzdem zusätzlich eine Erinnerung in der iOS-App Erinnerungen stellen, iOS stellt Web Push nicht immer pünktlich zu.

## Zweite Person einrichten

Die zweite Person braucht keinen eigenen GitHub-Account und keinen eigenen Fork. Sie nutzt dieselbe App-Adresse auf ihrem eigenen iPhone. Getrennt sind die Daten, weil jedes iPhone seinen eigenen Speicher hat und jede Person ein eigenes Daten-Repo mit eigenem Token und eigenem Passwort bekommt.

### Im selben GitHub-Account (empfohlen)

1. **Zweites Daten-Repo.** Im selben Account ein weiteres **privates** Repo anlegen, zum Beispiel `health-data-2`. Es darf leer bleiben.
2. **Eigener Token nur dafür.** Einen neuen Fine-grained Token mit **Only select repositories: `health-data-2`** und **Contents: Read and write** erstellen. So kann das iPhone der zweiten Person nur ihr eigenes Daten-Repo lesen und schreiben, nie `health-data`.
3. **App installieren.** Auf dem iPhone der zweiten Person dieselbe Adresse `https://<github-name>.github.io/health-app/` in Safari öffnen und zum Home-Bildschirm hinzufügen.
4. **Einrichtung.** Die zweite Person füllt die Einrichtung selbst aus, mit ihren eigenen Regionen, Bewegungen, Fokus und Vorgaben, oder importiert ein eigenes `profile.json` (aus `data/profile.example.json` erstellt, nie committen). Profile im alten Schema mit `avoidTags` werden beim Import automatisch umgestellt. Den eigenen Essensplan ebenso per Import.
5. **Sicherung verbinden.** In den Einstellungen unter GitHub: **Owner** wie bei der ersten Person, **Daten-Repo** `health-data-2`, **Token** aus Schritt 2. Die Vorschau muss `<github-name>/health-data-2` zeigen. Speichern, ein **eigenes Passwort** setzen (die zweite Person kennt es allein) und **Jetzt sichern**.
6. **Push-Mitteilungen (optional).** Wie oben unter „Push-Mitteilungen einrichten“, nur im Repo `health-data-2`: dieselben Secrets `VAPID_PRIVATE_KEY` und `VAPID_PUBLIC_KEY` (gleiche App, gleiche Schlüssel), die zwei Dateien kopieren, der eigene Token mit Contents und Actions, in der App **Mitteilungen aktivieren**. Die Action läuft pro Daten-Repo und liest nur dessen Dateien.

Ein Account, zwei Daten-Repos: Wer den Account verwaltet, kann beide Repos sehen, aber nur verschlüsselte Sicherungen. Lesen kann eine Sicherung nur, wer ihr Passwort kennt.

### Mit eigenem Fork (Variante)

Soll die zweite Person unabhängig sein, zum Beispiel mit eigenem GitHub-Account:

1. Das Repo `health-app` forken und im Fork unter **Actions** die Workflows erlauben.
2. Unter **Settings > Pages > Source** die Option **GitHub Actions** wählen. Einmal einen Push auf `main` machen oder unter **Actions > Deploy auf GitHub Pages > Run workflow** starten. Die App läuft dann unter `https://<eigener-name>.github.io/health-app/`.
3. Weiter wie bei der ersten Person ab Schritt 2: eigenes Daten-Repo `health-data`, eigener Token, Einrichtung, Sicherung.

Updates aus dem Original holen: im Fork **Sync fork**. Da nie ein Profil oder Essensplan im Repo liegt, gibt es dabei keine Konflikte mit persönlichen Daten.

## Was nie ins Repo gehört

- `data/profile.json`, `data/meals.json`, `data/plans.local.json` (per `.gitignore` ausgeschlossen, werden auch nicht deployt)
- Tokens, Passwörter, der VAPID-Privatschlüssel (`.vapid-private`, per `.gitignore` ausgeschlossen)
- Namen, Medikamente oder Ernährungsdetails in Commits, Tests oder Beispielen
