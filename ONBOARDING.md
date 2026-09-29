# Einrichtung

Die App selbst ist personenneutral. Alles Persönliche entsteht auf dem Gerät: das Profil über die Einrichtung in der App oder per Import, der Essensplan per Import, Medikamente im Tab Medis. Im Repo liegen nur neutrale Vorlagen (`data/profile.example.json`, `data/meals.example.json`), nie ein `profile.json` oder `meals.json`. Welche Felder das Profil hat, steht in [PROFILE.md](PROFILE.md).

Jede Person hat ihr eigenes iPhone und ihr eigenes privates Daten-Repo für die verschlüsselte Sicherung. Welches Daten-Repo die App nutzt, stellst du in den Einstellungen ein (Standard `health-data`).

## Erste Person einrichten

### Auf GitHub (einmalig)

1. **App-Repo und Pages.** Das Repo `health-app` liegt in deinem Account, als eigenes Repo oder als Fork. Unter **Settings > Pages > Build and deployment > Source** die Option **GitHub Actions** wählen. Bei einem Fork vorher unter **Actions** die Workflows erlauben, sie sind dort zuerst aus. Jeder Push auf `main` deployt dann nach `https://<github-name>.github.io/health-app/`.
2. **Daten-Repo anlegen.** Ein neues, **privates** Repo `health-data` anlegen. Es darf leer bleiben.
3. **Token erstellen.** Unter GitHub **Settings > Developer settings > Personal access tokens > Fine-grained tokens** einen Token anlegen:
   - Repository access: **Only select repositories**, nur `health-data`
   - Permissions: **Contents: Read and write**
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
9. **Medikamente anlegen (optional).** Im Tab **Medis > Verwalten > Neu**. Push-Erinnerungen richtest du wie in der [README](README.md) beschrieben im Daten-Repo ein.
10. **Training anpassen (optional).** Die Pläne entstehen aus `training` im Profil. Im Trainings-Tab öffnet **Anpassen** (neben dem Plan) Regionen, Bewegungen, Fokus, Tage pro Woche und Phase. Jede Änderung baut Plan A/B sofort neu, danach zeigt die App „Was sich geändert hat“ mit Grund. Übungen, für die es schon ein Trainingslog gibt, bleiben möglichst erhalten, damit die Fortschrittskurve weiterläuft. Während einer laufenden Einheit ist Anpassen gesperrt. Läuft eine befristete Schonung ab, fragt die Startseite, ob du weiter schonen oder aufheben willst, entfernt wird nichts automatisch. Persönliche Einschränkungen gehören nie in `data/exercises.json`. Einzelne Übungen tauschst du in der Einheit per „Alternative“ oder schließt sie per „Mag ich nicht“ aus.

**Neues iPhone:** App installieren, in der Einrichtung auf **Sicherung laden** tippen, Owner, Daten-Repo, Token und Passwort eintragen und **Wiederherstellen**. Profil, Essensplan und alle Einträge kommen mit.

## Zweite Person einrichten

Die zweite Person braucht keinen eigenen GitHub-Account und keinen eigenen Fork. Sie nutzt dieselbe App-Adresse auf ihrem eigenen iPhone. Getrennt sind die Daten, weil jedes iPhone seinen eigenen Speicher hat und jede Person ein eigenes Daten-Repo mit eigenem Token und eigenem Passwort bekommt.

### Im selben GitHub-Account (empfohlen)

1. **Zweites Daten-Repo.** Im selben Account ein weiteres **privates** Repo anlegen, zum Beispiel `health-data-2`. Es darf leer bleiben.
2. **Eigener Token nur dafür.** Einen neuen Fine-grained Token mit **Only select repositories: `health-data-2`** und **Contents: Read and write** erstellen. So kann das iPhone der zweiten Person nur ihr eigenes Daten-Repo lesen und schreiben, nie `health-data`.
3. **App installieren.** Auf dem iPhone der zweiten Person dieselbe Adresse `https://<github-name>.github.io/health-app/` in Safari öffnen und zum Home-Bildschirm hinzufügen.
4. **Einrichtung.** Die zweite Person füllt die Einrichtung selbst aus, mit ihren eigenen Regionen, Bewegungen, Fokus und Vorgaben, oder importiert ein eigenes `profile.json` (aus `data/profile.example.json` erstellt, nie committen). Profile im alten Schema mit `avoidTags` werden beim Import automatisch umgestellt. Den eigenen Essensplan ebenso per Import.
5. **Sicherung verbinden.** In den Einstellungen unter GitHub: **Owner** wie bei der ersten Person, **Daten-Repo** `health-data-2`, **Token** aus Schritt 2. Die Vorschau muss `<github-name>/health-data-2` zeigen. Speichern, ein **eigenes Passwort** setzen (die zweite Person kennt es allein) und **Jetzt sichern**.
6. **Push-Erinnerungen (optional).** Wie in der README beschrieben, nur im Repo `health-data-2`: Secrets anlegen, `push-worker/`-Dateien kopieren, in der App Push aktivieren. Die Action läuft pro Daten-Repo und liest nur dessen Dateien.

Ein Account, zwei Daten-Repos: Wer den Account verwaltet, kann beide Repos sehen, aber nur verschlüsselte Sicherungen. Lesen kann eine Sicherung nur, wer ihr Passwort kennt.

### Mit eigenem Fork (Variante)

Soll die zweite Person unabhängig sein, zum Beispiel mit eigenem GitHub-Account:

1. Das Repo `health-app` forken und im Fork unter **Actions** die Workflows erlauben.
2. Unter **Settings > Pages > Source** die Option **GitHub Actions** wählen. Einmal einen Push auf `main` machen oder unter **Actions > Deploy auf GitHub Pages > Run workflow** starten. Die App läuft dann unter `https://<eigener-name>.github.io/health-app/`.
3. Weiter wie bei der ersten Person ab Schritt 2: eigenes Daten-Repo `health-data`, eigener Token, Einrichtung, Sicherung.

Updates aus dem Original holen: im Fork **Sync fork**. Da nie ein Profil oder Essensplan im Repo liegt, gibt es dabei keine Konflikte mit persönlichen Daten.

## Was nie ins Repo gehört

- `data/profile.json`, `data/meals.json`, `data/plans.local.json` (per `.gitignore` ausgeschlossen, werden auch nicht deployt)
- Tokens, Passwörter, VAPID-Privatschlüssel
- Namen, Medikamente oder Ernährungsdetails in Commits, Tests oder Beispielen
