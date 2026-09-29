# Profil

Alles Persönliche steht im Profil: Name, Zyklus-Tracking, Trainingsvorgaben, Ernährung. Der Code enthält keine Namen, Medikamente oder persönlichen Regeln. So kann jede Person die App in einem eigenen Fork nutzen.

## Wo das Profil liegt

- **Auf dem Gerät**, in IndexedDB (Store `settings`, key `profile`). Nie im Repo, nie auf GitHub Pages.
- **In der verschlüsselten Sicherung** im privaten Daten-Repo (Standard `health-data`, in den Einstellungen änderbar). Bei einem neuen Gerät kommt das Profil mit der Wiederherstellung automatisch mit.
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
| `version` | Zahl | Version des Profil-Schemas. Aktuell `2`. Profile mit Version `1` (Feld `avoidTags`) werden beim Laden und Importieren automatisch migriert. |
| `displayName` | Text | Name der Person. Erscheint in der App als Titel („Beispiel“ ergibt „Beispiel Health“) und in der Begrüßung. Das Manifest heißt immer „Health“. |
| `language` | Text | Sprache der Oberfläche, aktuell nur `de`. |
| `birthYear` | Zahl oder `null` | Geburtsjahr, optional. Für altersabhängige Hinweise, z. B. im Training. |
| `sex` | Text oder `null` | Geschlecht: `weiblich`, `maennlich` oder `divers`. Setzt im Onboarding nur die Vorauswahl für `cycleTracking` (an bei weiblich, aus bei männlich, bei divers unverändert). |
| `cycleSymptomsDefault` | Liste | Symptome, die der Zyklus-Screen immer zeigt. Start: `gliederschmerzen`, `hautempfindlich`, `blaehbauch`, `kraempfe`, `muedigkeit`, `stimmungsschwankungen`. Ein Symptom aus der übrigen Liste rückt automatisch nach, wenn es an drei Tagen in 60 Tagen gewählt wurde. Mögliche Werte stehen in `js/cycle-symptoms.js`. |
| `cycleTracking` | ja/nein | `true` blendet Zyklustag und Zyklusauswertungen ein. Bei `false` fragt die App nie nach dem Zyklus. |

### `training`

| Feld | Typ | Bedeutung |
|---|---|---|
| `daysPerWeek` | Zahl | Geplante Trainingstage pro Woche, 1 bis 6. |
| `level` | Zahl | 1 Einstieg, 2 etwas Erfahrung, 3 erfahren. |
| `goal` | Text | Trainingsziel als Schlagwort, z. B. `allgemeine-fitness` oder `kraft`. |
| `protectRegions` | Liste | Körperregionen schonen, je `{ "region": "knie", "until": "2026-12-31" }`. `until` ist optional (`null` heißt unbefristet). Übungen mit dem Tag `belastet:<region>` fallen weg, Mobility mit `mobilisiert:<region>` kommt bevorzugt in den Aufwärmblock. Nach Ablauf fragt die Startseite, ob weiter geschont oder aufgehoben wird, entfernt wird nichts automatisch. |
| `avoidMovements` | Liste | Bewegungen vermeiden. Übungen mit dem Tag `bewegung:<id>` fallen weg. |
| `focus` | Liste | Aufbauen: Übungen mit passendem Schwerpunkt werden bevorzugt. |
| `guidance` | Text | Vorgaben von Arzt, Physio oder Osteopath als Freitext. Steht im Trainings-Tab unter „Meine Vorgaben“, ohne Logik. |
| `pullPushRatio` | Text | Verhältnis von Zug- zu Druckübungen, z. B. `1:1`. |
| `startPhase` | Zahl | Phase des Trainingsplans, mit der die App beginnt. |

Das Vokabular steht in `js/training-options.js`, die Tags an den Übungen in `data/exercises.json`.

**Regionen** (`protectRegions`): `nacken` Nacken, `schulter` Schulter, `lws` Lendenwirbelsäule, `bws` Brustwirbelsäule, `huefte` Hüfte, `knie` Knie, `handgelenk` Handgelenk, `ellbogen` Ellbogen, `bauchraum` Bauchraum.

**Bewegungen** (`avoidMovements`): `ueberkopf` Überkopf drücken oder ziehen, `last-hinter-kopf` Last hinter dem Kopf, `wirbelsaeule-beugen` Wirbelsäule unter Last beugen (Kreuzheben, Good Mornings), `wirbelsaeule-rotieren` Wirbelsäule unter Last rotieren, `bauchpressen` Bauchpressen (Crunches, Sit-ups), `tiefe-kniebeuge` tiefe Kniebeuge, `spruenge` Sprünge und Stöße, `einbeinig` einbeinige Stabilität, `haengen` Hängen am Griff.

**Aufbauen** (`focus`): `oberer-ruecken` Oberer Rücken, `schulterguertel` Schultergürtel, `core-stabilitaet` Core-Stabilität, `huefte-gesaess` Hüfte und Gesäß, `beine` Beine, `knochendichte` Knochendichte, `beweglichkeit` Beweglichkeit (längerer Mobility-Block), `allgemeine-kraft` Allgemeine Kraft.

Andere Werte aus einer importierten Datei bleiben erhalten und erscheinen als zusätzliche Option.

**Migration aus Version 1:** `bauchdruck` wird Region Bauchraum, `nackendruecken` Regionen Nacken und Schulter, `last-hinter-kopf`, `crunches` und `schweres-kreuzheben` werden die Bewegungen Last hinter dem Kopf, Bauchpressen und Wirbelsäule unter Last beugen. Alte Fokus-Begriffe wie `schultergürtel`, `rumpf` und `gesaess` werden auf das neue Vokabular umgeschrieben.

Alles davon lässt sich auch direkt im Trainings-Tab unter **Anpassen** ändern, zusammen mit Tagen pro Woche und Phase.

### `checkin`

| Feld | Typ | Bedeutung |
|---|---|---|
| `sliders` | Liste | Welche Regler der tägliche Check-in zeigt, jeweils fünf Stufen. Möglich: `energy` (Energie), `digestion` (Verdauung), `pain` (Schmerz), `sleep` (Schlaf), `mood` (Stimmung, optional). |
| `painSideToggle.enabled` | ja/nein | Zeigt einen zusätzlichen Schalter beim Schmerz. |
| `painSideToggle.label` | Text | Beschriftung dieses Schalters, z. B. `rechtes Knie`. |
| `cyclePhases` | Liste | Nur bei `cycleTracking`: Phasen für die Auswertung, je `{ "name", "from", "to" }` in Zyklustagen, `to` darf `null` sein. Fehlt die Liste, gilt: Periode 1 bis 5, Follikelphase 6 bis 13, Eisprungphase 14 bis 16, Lutealphase ab 17. |

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
| `schedule.slots` | Liste | Zeitpunkte am Tag: `morgen`, `nach-fruehstueck`, `mittag`, `nach-mittag`, `abend`, `nach-abend`. |
| `schedule.startDate` | Datum | Optional, `YYYY-MM-DD`. Vorher gibt es keine Erinnerung. Fehlt es, gilt der Tag des Imports, bei `everyNDays` ist das auch der Bezugstag. |
| `schedule.endDate` | Datum | Optional, `YYYY-MM-DD`. Danach endet der Plan. |

### `diet`

| Feld | Typ | Bedeutung |
|---|---|---|
| `intolerances` | Liste | Unverträglichkeiten. Zur Wahl: `fructose`, `lactose`, `histamine`, `gluten`, `sorbit`. Gerichte mit passenden Tags werden nicht vorgeschlagen. |
| `cuisines` | Liste | Bevorzugte Küchen, z. B. `italienisch`, `koreanisch`, `mediterran`. |
| `dislikes` | Liste | Gemiedene Zutaten oder Gerichtsarten als Tags, z. B. `pilze`. In der App als Text mit Komma eingegeben. Ein Gericht fällt weg, wenn einer seiner `tags` oder eine Zutaten-ID im Essensplan genau so heißt. |

### `reminders`

| Feld | Typ | Bedeutung |
|---|---|---|
| `times` | Liste | Uhrzeiten für Push-Erinnerungen, `HH:MM`. In der App unter Einstellungen > Erinnerungen änderbar. |
| `slotTimes` | Objekt | Optional. Ab wann ein Slot als fällig gilt, z. B. `{ "morgen": "06:30" }`. Standard: Morgen 07:00, nach dem Frühstück 08:00, Mittag 12:00, nach dem Mittagessen 13:00, Abend 18:00, nach dem Abendessen 19:30. |
| `timezone` | Text | Zeitzone für Erinnerungen, z. B. `Europe/Berlin`. |

### Welche Felder wirken schon?

Die App nutzt alle Felder: `displayName`, `birthYear` (im Auszug für die Beratung), `cycleTracking`, `training`, `checkin`, `diet`, `reminders` und die Medikamente aus einer importierten Datei. Das Schema steht schon fest, alles lässt sich also jetzt eintragen.

## Einrichtung für eine andere Person

Die Schritt-für-Schritt-Anleitung (Fork, Daten-Repo, Token, Profil, Sicherung) steht in [ONBOARDING.md](ONBOARDING.md).
