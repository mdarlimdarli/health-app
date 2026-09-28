# Profil

Alles Persönliche steht im Profil: Name, Zyklus-Tracking, Trainingsvorgaben, Ernährung. Der Code enthält keine Namen, Medikamente oder persönlichen Regeln. So kann jede Person die App in einem eigenen Fork nutzen.

## Wo das Profil liegt

- **Auf dem Gerät**, in IndexedDB (Store `settings`, key `profile`). Nie im Repo, nie auf GitHub Pages.
- **In der verschlüsselten Sicherung** im privaten Repo `health-data`. Bei einem neuen Gerät kommt das Profil mit der Wiederherstellung automatisch mit.
- **Als Datei nur, wenn du sie selbst exportierst.** Unter Einstellungen gibt es „Profil als Datei exportieren“ und „Profil aus Datei importieren“. Die Datei ist nicht verschlüsselt.

Im Repo liegt nur die neutrale Vorlage [data/profile.example.json](data/profile.example.json). Eine lokale `data/profile.json` steht in `.gitignore`, du kannst sie als vorbereitete Import-Datei behalten.

## Einrichten

Beim ersten Start ohne Profil zeigt die App die Einrichtung. Dort gibst du Name, Geburtsjahr, Zyklus-Tracking, Trainingstage, Trainingslevel, Schonungen, Unverträglichkeiten, Lieblingsküchen und Abneigungen an. Alternativ spielst du eine vorbereitete Profildatei ein oder stellst eine Sicherung wieder her.

Medikamente fragt die Einrichtung nicht ab, sie kommen im Tab Medis dazu. Enthält eine importierte Profildatei eine Liste `meds`, legt die App daraus Einträge an:

- Einträge mit neuer `id` kommen dazu.
- Einträge mit einer `id`, die schon existiert, bleiben unverändert, denn du kannst sie in der App bearbeitet haben.

Beim Export landen die aktuellen Medikamente wieder in der Datei.

## Felder

### Allgemein

| Feld | Typ | Bedeutung |
|---|---|---|
| `version` | Zahl | Version des Profil-Schemas. Aktuell `1`. |
| `displayName` | Text | Name der Person. Erscheint in der App als Titel („Beispiel“ ergibt „Beispiel Health“) und in der Begrüßung. Das Manifest heißt immer „Health“. |
| `language` | Text | Sprache der Oberfläche, aktuell nur `de`. |
| `birthYear` | Zahl oder `null` | Geburtsjahr, optional. Für altersabhängige Hinweise, z. B. im Training. |
| `cycleTracking` | ja/nein | `true` blendet Zyklustag und Zyklusauswertungen ein. Bei `false` fragt die App nie nach dem Zyklus. |

### `training`

| Feld | Typ | Bedeutung |
|---|---|---|
| `daysPerWeek` | Zahl | Geplante Trainingstage pro Woche, 1 bis 6. |
| `level` | Zahl | 1 Einstieg, 2 etwas Erfahrung, 3 erfahren. |
| `goal` | Text | Trainingsziel als Schlagwort, z. B. `allgemeine-fitness` oder `kraft`. |
| `focus` | Liste | Schwerpunkte als Schlagworte, z. B. `haltung`. Übungen mit passenden Tags werden bevorzugt. |
| `avoidTags` | Liste | Übungen mit einem dieser Tags schlägt die App nie vor. Die Tags stehen an den Übungen in `data/exercises.json`. |
| `pullPushRatio` | Text | Verhältnis von Zug- zu Druckübungen, z. B. `1:1`. |
| `startPhase` | Zahl | Phase des Trainingsplans, mit der die App beginnt. |

In der Einrichtung stehen für `avoidTags` diese Schonungen zur Wahl:

| Tag | Anzeige |
|---|---|
| `bauchdruck` | Bauchraum schonen |
| `last-hinter-kopf` | Nichts hinter dem Kopf |
| `schweres-kreuzheben` | Kein schweres Kreuzheben |
| `crunches` | Keine Crunches |
| `nackendruecken` | Kein Nackendrücken |

Andere Tags aus einer importierten Datei bleiben erhalten und erscheinen als zusätzliche Option.

### `checkin`

| Feld | Typ | Bedeutung |
|---|---|---|
| `sliders` | Liste | Welche Regler der tägliche Check-in zeigt, jeweils mit Skala 1 bis 5. Möglich: `energy`, `digestion`, `pain`, `sleep`. |
| `painSideToggle.enabled` | ja/nein | Zeigt einen zusätzlichen Schalter beim Schmerz. |
| `painSideToggle.label` | Text | Beschriftung dieses Schalters, z. B. `rechtes Knie`. |

### `meds` (nur in Profildateien)

Liste der Medikamente, Nahrungsergänzungen und Messungen. Nur für Import und Export, in der App liegen sie im Store `meds`.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | Text | Feste, eindeutige Kennung in Kleinbuchstaben, z. B. `eisen`. Nie nachträglich ändern, sonst gilt der Eintrag als neu. |
| `name` | Text | Anzeigename. |
| `dosage` | Text | Menge pro Einnahme, z. B. `1 Tablette`. |
| `type` | Text | `medication` (Standard, darf fehlen) oder `measurement` für Messungen wie Gewicht oder Blutdruck. |
| `active` | ja/nein | Inaktive Einträge erinnern nicht, bleiben aber gespeichert. |
| `critical` | ja/nein | Besonders wichtig: Die Erinnerung wird hervorgehoben, eine vergessene Einnahme fällt stärker auf. |
| `notes` | Text | Freitext, z. B. `zum Essen`. |
| `schedule.type` | Text | `daily` (täglich), `everyNDays` (alle n Tage), `weekly` (einmal pro Woche) oder `seasonal` (nur in bestimmten Monaten). |
| `schedule.n` | Zahl | Nur bei `everyNDays`: Abstand in Tagen. |
| `schedule.weekday` | Zahl | Nur bei `weekly`: 1 ist Montag, 7 ist Sonntag. |
| `schedule.months` | Liste | Nur bei `seasonal`: Monate 1 bis 12, z. B. `[6, 7, 8]`. |
| `schedule.slots` | Liste | Zeitpunkte am Tag: `morgen`, `abend`, `nach-fruehstueck`, `nach-mittag`, `nach-abend`. |
| `schedule.startDate` | Datum | Optional, `YYYY-MM-DD`. Vorher gibt es keine Erinnerung. Fehlt es, gilt der Tag des Imports, bei `everyNDays` ist das auch der Bezugstag. |
| `schedule.endDate` | Datum | Optional, `YYYY-MM-DD`. Danach endet der Plan. |

### `diet`

| Feld | Typ | Bedeutung |
|---|---|---|
| `intolerances` | Liste | Unverträglichkeiten. Zur Wahl: `fructose`, `lactose`, `histamine`, `gluten`, `sorbit`. Gerichte mit passenden Tags werden nicht vorgeschlagen. |
| `cuisines` | Liste | Bevorzugte Küchen, z. B. `italienisch`, `koreanisch`, `mediterran`. |
| `dislikes` | Liste | Gemiedene Zutaten oder Gerichtsarten als Tags, z. B. `pilze`. In der App als Text mit Komma eingegeben. |

### `reminders`

| Feld | Typ | Bedeutung |
|---|---|---|
| `times` | Liste | Uhrzeiten für tägliche Erinnerungen, `HH:MM`. |
| `timezone` | Text | Zeitzone für Erinnerungen, z. B. `Europe/Berlin`. |

### Welche Felder wirken schon?

Die App nutzt heute `displayName` und die Medikamente aus einer importierten Datei. Die übrigen Felder lesen die Module Training, Check-in, Essen und Erinnerungen, sobald sie gebaut sind. Das Schema steht schon fest, alles lässt sich also jetzt eintragen.

## So richtest du die App für eine andere Person ein

1. **Fork anlegen.** Auf GitHub das Repo `health-app` öffnen und oben rechts auf **Fork** tippen.
2. **Actions und Pages einschalten.** Im Fork unter **Actions** die Workflows erlauben (bei Forks sind sie zuerst aus). Dann unter **Settings > Pages > Source** die Option **GitHub Actions** wählen.
3. **Eigenes Repo für die Sicherung.** Ein neues, **privates** Repo `health-data` anlegen. Es darf leer bleiben.
4. **Eigenen Token erstellen.** Unter GitHub **Settings > Developer settings > Fine-grained tokens** einen Token nur für `health-data` mit **Contents: Read and write** erstellen. Den Token nie ins Repo schreiben, er gehört nur in die App.
5. **Auf dem iPhone installieren.** `https://<github-name>.github.io/health-app/` in Safari öffnen und wie in der [README](README.md) beschrieben zum Home-Bildschirm hinzufügen.
6. **Profil anlegen.** Beim ersten Start die Einrichtung ausfüllen. Oder vorher `data/profile.example.json` kopieren, anpassen, auf das iPhone legen (zum Beispiel über iCloud Drive) und in der Einrichtung „Profil importieren“ wählen. Diese Datei nicht committen.
7. **Sicherung verbinden.** In der App oben rechts die Einstellungen öffnen, GitHub-Owner und Token eintragen, ein Passwort setzen und einmal „Jetzt sichern“ tippen. Ab dann steckt das Profil in der Sicherung.
8. **Trainingsplan anpassen.** Die Übungen stehen in `data/exercises.json`, die Pläne A und B in `data/plans.json`. Beide Dateien kommen mit dem Trainingsmodul. Persönliche Einschränkungen gehören nicht in die Pläne, sondern als Schonungen (`avoidTags`) ins Profil.

**Updates aus dem Original holen:** Auf GitHub im Fork **Sync fork** nutzen. Da kein Profil im Repo liegt, gibt es dabei keine Konflikte mit persönlichen Daten.
