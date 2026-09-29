# CLAUDE.md

## Projekt
Persönliche Health- und Fitness-App für eine einzelne Person pro Fork (persönliche Angaben stehen nur im Profil, siehe Personenneutralität). Läuft als PWA auf einem iPhone SE 2022 (Viewport 375 x 667 px, Touch ID, Safari). Wird über GitHub Pages ausgeliefert (Repo: health-app). Alle Daten bleiben lokal auf dem Gerät und werden zusätzlich verschlüsselt in ein privates GitHub-Daten-Repo gesichert (Standard health-data, in den Einstellungen änderbar, settings key syncRepo).

## Stack, bewusst einfach
- Vanilla HTML, CSS, JavaScript (ES Modules). Kein Framework, kein Build-Schritt außer optionalem Minify.
- Speicher: IndexedDB über die Bibliothek `idb` (als lokale Kopie im Repo, nicht per CDN, damit alles offline läuft).
- Service Worker für Offline-Betrieb (App Shell cachen, Daten nie im SW-Cache).
- Verschlüsselung: WebCrypto, AES-GCM, Schlüssel per PBKDF2 (mind. 300.000 Iterationen) aus einem Nutzerpasswort. Passwort wird nie gespeichert, nur der Schlüssel in der Session.
- Sync: GitHub Contents API, eine Datei `data.json.enc` pro Sicherung plus `manifest.json` im Daten-Repo (settings syncRepo, Standard health-data, gilt für Sync und Push-Dateien). Token (fine-grained PAT) liegt in IndexedDB, wird nie geloggt.
- Schrift: Inter, selbst gehostet als woff2 (Variable Font), gesubsettet auf Latin, Gewichte 400 bis 900 und opsz (assets/fonts/inter-app.woff2, Befehle in der README). Keine Google-Fonts-Verlinkung.
- Erstes Laden unter 300 KB ohne Schrift (übertragen, gzip).
- Sprache der Oberfläche: Deutsch, Du-Form. Keine Gedankenstriche im UI-Text.

## Struktur
/index.html
/manifest.webmanifest
/sw.js
/css/tokens.css, base.css, components.css
/js/app.js (Router, Shell), aura.js (Aura je Screen), clock.js (Begrüßung, Datum, Uhrzeit, rein funktional), week-bar.js (Wochentags-Leiste), db.js (IndexedDB), crypto.js, sync.js, notify.js, profile.js (Profil), ui.js (Dialoge, Datum), planner.js (Trainingspläne und Änderungsübersicht, rein funktional), training-options.js (Vokabular Regionen, Bewegungen, Fokus, Migration, rein funktional), training-data.js (gespeicherte Pläne, Neuaufbau), meds-schedule.js (Zeitplan-Regeln, rein funktional), meds-store.js, push.js, checkin-core.js (Slider, Zyklustag, Tagesfläche), cycle.js (Zykluslänge und Phase in Worten, rein funktional), cycle-symptoms.js (Symptomliste, Blutung, Muster, rein funktional), cycle-store.js (Store cycleSymptoms), food-rules.js (Ampel, Ausschlüsse, rein funktional), food-data.js, report.js (Auszug für Beratung)
/js/modules/home.js, cycle.js (Zyklus-Screen), training.js, training-adjust.js (Anpassen), training-fields.js (Felder der drei Ebenen), meds.js, checkin.js, food.js, settings.js, profile-form.js (Onboarding, Profil bearbeiten), reminders.js (Einstellungen Erinnerungen), report-section.js (Einstellungen Auszug), reset-section.js (Einstellungen Zurücksetzen)
/js/vendor/idb.js
/data/exercises.json, plans.json (optionale Überschreibung), meals.example.json (neutraler Beispiel-Essensplan), profile.example.json (neutrale Profilvorlage), plans.generated.json (Beispielpläne aus profile.example.json)
/scripts/generate-plans.mjs, generate-icons.mjs, test-home.mjs, test-cycle.mjs, test-planner.mjs, test-meds.mjs, test-food.mjs (Node, nur Entwicklung)
/push-worker/ (Vorlagen für die Push-Action im Repo health-data, wird nicht deployt)
/assets/exercises/*.svg, /assets/fonts/, /assets/icons/

## Design-System (verbindlich)
Ästhetik: Swiss Design, clean, minimalistisch. Jeder Screen liegt auf Creme und trägt eine Aura aus weichen Farbverläufen. Große Zahlen tragen die Information, Text ist sekundär. Alle Werte stehen als Tokens in css/tokens.css.

### Farben
- Neutral: Creme #F4EFE6 (Grund überall), Sand #EEE7DB (nur noch als Token, keine Kartenflächen), Ink #161616 (Text), Ink-2 #6C6761 (Sekundärtext), Linie #E1DACF, Kontur Ink 14 Prozent (--color-outline), Füllung Creme 72 Prozent (--color-fill, nur Eingabefelder und aktive Zustände).
- Modulfarben in zwei Stufen, base für Verläufe, Blobs und Flächen, deep für Buttons, große Zahlen, Linien, aktive Elemente und Text in Modulfarbe. Die deep-Werte sind so abgedunkelt, dass Creme-Schrift auf deep und deep-Text auf Creme mindestens 4,6:1 erreichen:
  - Butter: base #F5D96B, deep #81691E, strong #9B7E25 (Füllung für Primärbuttons mit Ink-Schrift, 4,66:1) (Medis, Streak)
  - Mandarine: base #F49A5A, deep #B04F1C (Training, Energie)
  - Koralle: base #F27A6B, deep #C4382A (Check-in, Schmerz, Warnung, Markierungen)
  - Rosé: base #F3B8CB, deep #BB3C6D (Zyklus, Stimmung)
  - Periwinkle: base #A9B8F0, deep #4A5FCC (Schlaf, Einstellungen, neutrale Aktionen)
  - Salbei: base #B9CFA6, deep #51753B (Verdauung, Ernährung)
- Modul-Ton: js/app.js setzt body[data-tone] je Ansicht (Training Mandarine, Medis Butter, Check-in Koralle, Essen Salbei, sonst Periwinkle). Einzelne Elemente bekommen .tone-<farbe>, z. B. ein Button auf der Startseite, der ins Training führt. Die Tokens --tone, --tone-deep, --tone-fill und --tone-on stehen in tokens.css.
- Text immer Ink, außer Sekundärbuttons und Text in Modulfarbe (deep). Sekundärtext Ink-2. Im oberen Aura-Bereich Ink mit 78 Prozent Deckkraft (Klasse .on-aura), das hält 4,5:1.
- Jede Text-Farbe-Kombination mindestens 4,5:1 (WCAG AA).
- Große Zahlen in der deep-Farbe ihres Moduls: Zyklustag Rosé, Streak Butter, Gewichte, Fortschritt und Fortschrittsring Mandarine, Check-in-Werte in ihrer Slider-Farbe. Die Tageszahl der Startseite bleibt Ink (.number--ink). Überschriften bleiben Ink.

### Aura
- Kein Screen hat eine farbige Vollfläche. Die Aura (js/aura.js, #aura in der Shell) besteht aus zwei bis drei, höchstens vier Verläufen von base zu transparent, blur 56 px, mix-blend-mode multiply, Größe 240 bis 420 px. Sie liegt hinter dem oberen Bereich, läuft nach unten in Creme aus, pointer-events none, 400 ms Einblenden beim Routing, sonst keine Animation. Die Kopfzeile ist darüber transparent und wird beim Scrollen Creme.
- Feste Kombinationen: Startseite Butter, Rosé, Periwinkle (mit Check-in-Daten wächst je Slider ein Verlauf nach Wert: Energie Mandarine oben links, Schlaf Periwinkle oben rechts, Verdauung Salbei unten links, Schmerz Koralle unten rechts). Check-in sehr dezent, baut sich beim Antippen auf. Training Mandarine und Butter dezent oben, während der Einheit nur ein Verlauf. Medis Butter und Mandarine großzügig oben. Auswertung Periwinkle und Rosé. Ernährung Salbei und Butter. Einstellungen und Profil nur Creme.
- In Karten nur Verläufe, die einen Wert zeigen (Streak, Pausentimer, Regler im Profil), nie zur Dekoration.

### Typografie (Inter Variable, Gewichte 100 bis 900, opsz)
- Große Zahlen: 72 px, Gewicht 900, line-height 0.9, letter-spacing -0.05em, tabular-nums, font-variation-settings "opsz" 32.
- Überschriften und Begrüßung: 28 px, Gewicht 900, letter-spacing -0.03em. Titel in Karten, Dialogen und Kopfzeile: 20 px, Gewicht 800.
- Begrüßung steht direkt über der Tageszahl. Monat 20 px, Gewicht 700, auf derselben Grundlinie neben der Zahl, rechts daneben die Uhrzeit HH:MM im gleichen Stil, live jede Minute und sofort nach Rückkehr in die App.
- Begrüßung nach der lokalen Stunde des Geräts (getHours): 5 bis 10 Uhr Guten Morgen, 10 bis 17 Hallo, 17 bis 22 Guten Abend, 22 bis 5 Gute Nacht.
- Kartenzahlen und Chips: 32 px, Gewicht 800.
- Labels und Tab-Beschriftungen: 12 px, Gewicht 700, Uppercase, letter-spacing 0.08em.
- Fließtext und Hinweise: Gewicht 500, mindestens 16 px, line-height 1.45.

### Formen
- Karten: transparent mit 1 px Kontur in Ink 14 Prozent, Radius 24 px, keine Schatten, Abstand 12 px. Auf der Aura liegen sie durchsichtig, die Verläufe scheinen durch. Keine gefüllten Sand- oder Ink-Flächen. Einzige deckende Fläche ist der Pausentimer, weil er über dem Inhalt liegt (Creme mit Kontur).
- Alles Interaktive ist vollrund (--radius-pill): Buttons als Pille (Höhe 52 px, Padding 0 24 px). Primär gefüllt in deep der Modulfarbe mit Creme-Schrift, bei Butter strong mit Ink-Schrift. Sekundär transparent mit 1,5 px Kontur und Text in deep der Modulfarbe. Chips und Tags als Pille (Höhe 32 px, ungewählt mit Kontur und leichter Creme-Füllung, gewählt in deep der Modulfarbe mit weißer Schrift), Eingabefelder als Pille mit Kontur und leichter Creme-Füllung, Schalter als Pille mit Kreis-Knopf (an in deep), Stepper als Pille mit runden Knöpfen, Umschalter aktiv in der Modulfarbe.
- Check-in-Stufen als fünf Kreise (52 px, Zahl zentriert, gewählt im base-Ton, satter mit höherem Wert). Haken und Gesamtgefühl ebenfalls als Kreise.
- Wochentags-Leiste (Training, Medis, Essen, js/week-bar.js): Reihe von Kreisen 40 px, aktiver Tag gefüllt in deep der Modulfarbe mit weißer Zahl, heute mit Ring, erledigte Tage mit Punkt.
- Kalenderpunkte in Auswertungen als Kreise 12 px. Fortschrittsring bleibt ein Kreis.
- Kein Radius unter 12 px irgendwo in der App. Mehrzeilige Felder bekommen den Kartenradius.

### Elemente
- Kopfzeile: Titel links, Einstellungen oben rechts. Auf Unterseiten steht links ein Zurück-Pfeil zur übergeordneten Ansicht (im Standalone-Modus gibt es keine Browserleiste). Externe Links öffnen immer außerhalb der App in Safari (target _blank, rel noopener).
- App-Icons 180 und 512 px: Creme mit einem Sonnenkreis im Verlauf, kein Text (scripts/generate-icons.mjs).
- Tab-Bar: Creme mit 1 px Linie in Ink 12 Prozent, 5 Einträge nur als Icons ohne Beschriftung, jedes mit aria-label: Heute Sonne, Training Hantel, Medis Kapsel, Check-in Herz, Essen Messer und Gabel. Icons 26 px, Linie 1,75 px. Aktiver Tab in Ink mit weichem Blob im base-Ton der Modulfarbe dahinter (Heute Rosé, Training Mandarine, Medis Butter, Check-in Koralle, Essen Salbei). Inaktiv Ink-2. Einstellungen über Icon oben rechts. Safe Areas (env(safe-area-inset-*)) beachten.
- Diagramme: Linien im deep-Ton der Modulfarbe, keine Gitterlinien, Punkte und Markierungen in Koralle deep.
- Raster: 8 px. Seitenrand 20 px.
- Interaktion: Tap-Ziele mind. 44 px (Chips mit erweiterter Tap-Fläche). Keine Hover-Zustände nötig. Übergänge 180 ms ease-out. Haptik nicht verfügbar, dafür klare visuelle Bestätigung.
- Icons: dünne Linien-Icons (1.5 px, in der Tab-Bar 1.75 px), selbst als SVG, keine Icon-Bibliothek.
- Verbotene Muster: farbige Vollflächen, gefüllte Kartenflächen, Balkendiagramme mit vielen Farben, Schlagschatten, Bootstrap-Look, Emojis im UI.

## Regeln für Code
- Alles muss offline funktionieren, außer Sync und YouTube-Links.
- Jede Datenänderung: erst IndexedDB, dann Sync-Queue (Sync darf fehlschlagen, Daten nie).
- Datum immer lokal (Europe/Berlin), gespeichert als ISO-String ohne Zeitzonenverschiebung des Tages.
- Keine externen Requests außer api.github.com (Sync) und youtube.com (Links, nur per Klick).
- Kein Analytics, kein Tracking, keine Cookies.
- Kommentare und Commit-Messages auf Deutsch.

## Personenneutralität
- Der Code enthält keine Namen, keine konkreten Medikamente, keine Zyklus-Annahmen, keine Trainingsregeln. All das steht im Profil.
- Jede Funktion, die Verhalten personalisiert, liest aus dem Profil über js/profile.js (getProfile(), z.B. cycleTracking, training.protectRegions, training.avoidMovements, diet). Medikamente liegen im Store meds.
- Das aktive Profil lebt in IndexedDB (Store settings, key "profile") und ist Teil der verschlüsselten Sicherung im Repo health-data. Bei Gerätewechsel wandert es mit der Wiederherstellung mit.
- data/profile.json wird nie committet (.gitignore) und nie deployt. Öffentlich ist nur data/profile.example.json (neutrale Vorlage). Eine lokale data/profile.json dient höchstens als Import-Datei.
- Beim ersten Start ohne Profil zeigt die App ein Onboarding (#/willkommen): Name, direkt darunter Geschlecht (weiblich, männlich, divers als Pillen, profile.sex) und "Zyklus tracken?" (Vorauswahl an bei weiblich, aus bei männlich, bei divers unverändert), Geburtsjahr, Trainingstage pro Woche, Trainingslevel, Regionen schonen, Bewegungen vermeiden und Aufbauen als Chips mit verständlichen Labels, Unverträglichkeiten, Lieblingsküchen, Abneigungen. Medikamente werden nicht im Onboarding abgefragt, sondern im Medis-Tab angelegt.
- In den Einstellungen: "Profil bearbeiten" (gleiche Felder), "Profil als Datei exportieren" und "Profil aus Datei importieren" (JSON). Ein Import ergänzt Medikamente mit neuer ID, bestehende werden nie überschrieben.
- Ganz unten "Zurücksetzen": "Alle Daten auf diesem Gerät löschen" (Koralle deep), dann das Wort LÖSCHEN eingeben und ein zweiter Button. Löscht IndexedDB komplett (Profil, alle Stores, Token, Sync-Stand), meldet den Service Worker ab, leert den Cache und startet im Onboarding. Die Sicherung auf GitHub bleibt unangetastet.
- Manifest-Name und short_name sind fest "Health". App-Titel und Begrüßung in der App werden aus profile.displayName gebildet ("<displayName> Health").
- Keine Profildaten in Tests, README, PROFILE.md, Beispielen oder Commits. Beispiele immer neutral.

## Training
- Übungsbibliothek data/exercises.json ist allgemein. Jede Übung trägt Tags für belastete Regionen ("belastet:<region>") und Bewegungsmuster ("bewegung:<id>"), Mobility zusätzlich "mobilisiert:<region>". Übungen, die nur ein Fokus holt, tragen "fokus:<id>" (Gleichgewicht: 8 Übungen, alle mit Stützmöglichkeit, Level und Phase 1, Gruppe gleichgewicht). Das Vokabular steht in js/training-options.js und wird von validateLibrary geprüft.
- Fokus "Gleichgewicht und Standsicherheit" bringt je Einheit eine Übung mit "fokus:gleichgewicht" in den Aufwärmblock (90 Sekunden, je Plan eine andere), ab Phase 1. Geschonte Regionen und vermiedene Bewegungen gelten auch dort. Neue Profile starten ohne diesen Fokus.
- Persönliche Einschränkungen nur im Profil, in drei Ebenen: training.protectRegions (Regionen schonen, je optional mit until), training.avoidMovements (Bewegungen vermeiden), training.focus (Aufbauen). Dazu training.guidance als Freitext ohne Logik ("Meine Vorgaben"). Nie im Code und nie in der Bibliothek.
- Geschonte Regionen aktivieren leichte Mobility für diese Region. Abgelaufene Schonungen fragt die Startseite ab, nichts wird automatisch entfernt.
- Pläne liegen in settings trainingPlans mit Signatur der Eingaben und werden nur bei geänderten Vorgaben neu gebaut. Übungen mit Trainingslog und aus dem bisherigen Plan bleiben bevorzugt, Ausgeschlossenes ersetzen Alternativen derselben Muskelgruppe. Nach jedem Neuaufbau zeigt der Trainings-Tab "Was sich geändert hat" mit Grund (settings trainingPlanChanges, bis zur Bestätigung).
- "Anpassen" im Trainings-Tab (#/training/anpassen) ändert Regionen, Bewegungen, Fokus, Tage und Phase direkt. Während einer laufenden Einheit ist es gesperrt, Änderungen gelten ab der nächsten.
- Pläne erzeugt js/planner.js zur Laufzeit aus profile.training, exercisePrefs (disliked, replacedBy) und der Phase (settings trainingPhase). data/plans.json überschreibt sie, falls vorhanden (öffentlich, keine persönlichen Vorgaben).
- data/plans.generated.json wird nur aus profile.example.json erzeugt. Pläne aus dem eigenen Profil gehen nach data/plans.local.json (ignoriert).
- Phasenwechsel nach 16 Einheiten nur vorschlagen, nie erzwingen.
- Nach Änderungen an Planer oder Bibliothek: node scripts/test-planner.mjs.

## Medis und Erinnerungen
- Keine Medikamente im Code. Einträge liegen im Store meds, Einnahmen in medLog mit ID Datum|medId|Slot.
- Schedule-Typen daily, everyNDays (ab startDate, sonst erstem Log), weekly (1 Montag bis 7 Sonntag), seasonal (months), jeweils mit optionalem startDate und endDate. type "measurement" speichert values (systolic, diastolic, pulse).
- critical steht auf der Startseite immer oben, Streak nur für critical.
- Erinnerungen laufen ohne Ende, bis der Eintrag pausiert oder gelöscht wird. endDate ist optional und standardmäßig leer, nur ein ausdrückliches Enddatum beendet einen Eintrag.
- Push-Nachrichten sind allgemein und nennen nie Medikamente. reminders.json (Uhrzeiten, Nachhak-Zeit), subscriptions.json (Push-Adressen) und status.json in health-data sind unverschlüsselt. status.json enthält nur {date, openCount}, keine Namen; die App schreibt sie nur mit aktivem Push, bei jedem Abhaken (gebündelt) und beim Start.
- Nachhaken (profile.reminders.nudgeTime, Standard 22:00): Push nur, wenn status.json von heute ist und openCount über 0 liegt, Text "Du hast heute noch etwas offen" mit Anzahl. In der App ist ab dieser Uhrzeit der Abschnitt Medikamente auf der Startseite in Koralle markiert, solange etwas offen ist.
- Nach Änderungen an den Zeitplan-Regeln: node scripts/test-meds.mjs.

## Check-in und Startseite
- Ein Check-in pro Tag (Store checkins, Index date), nachträglich editierbar, jede Auswahl wird sofort gespeichert.
- Startseite als Dashboard, von oben: Kopf (Wochentag, Begrüßung, Tageszahl, Monat, Live-Uhrzeit, Aura), dann je ein Abschnitt als Kontur-Karte mit Label in Uppercase und 12 px Abstand:
  1. Medikamente: heute offene Einträge als kompakte Zeilen mit Haken, critical zuerst. Alles erledigt: "Alles genommen" mit Streak (Tage in Folge, über die wichtigen Einträge) in Butter deep.
  2. Check-in: ohne Werte ein Outline-Button "Wie geht es dir?" in Koralle, sonst die Werte als kleine Kreise im base-Ton ihres Sliders, die Karte öffnet den Check-in.
  3. Zyklus (nur bei cycleTracking): Zyklustag groß in Rosé deep, daneben die Phase in Worten.
  4. Training: nächster Plan, letzte Einheit mit Datum, Wochenziel als kleiner Ring in Mandarine, "Einheit starten" startet direkt, abgelaufene Schonungen als Zeilen darin.
  5. Essen (nur mit eigenem Essensplan): Mittag und Abend mit Tagesnotiz, Tippen öffnet die Rezeptkarte (#/essen/<Datum>/<Slot>).
  Abschnitte ohne Inhalt fallen komplett weg, kein leerer Rahmen.
- Phase in Worten (js/cycle.js, nur Schätzung, keine Interpretation): Menstruation bis zum Ende der ersten Phase aus profile.checkin.cyclePhases, Ovulation ca. um Zykluslänge minus 14 (plus minus ein Tag), dazwischen Follikelphase, danach Lutealphase. Zykluslänge ist der Durchschnitt der letzten bis zu sechs eigenen Zyklen aus den Periodenbeginnen (18 bis 45 Tage), ohne Daten 28.
- Slider nur aus profile.checkin.sliders (energy Mandarine, digestion Salbei, pain Koralle, sleep Periwinkle, mood Rosé). Schmerzseite nur bei painSideToggle.enabled, Zyklus nur bei cycleTracking, sonst komplett ausgeblendet.
- Zyklusphasen für die Auswertung kommen aus profile.checkin.cyclePhases, nie fest im Code.
- Zyklus-Screen (#/zyklus, #/zyklus/YYYY-MM-DD, #/zyklus/muster), nur bei cycleTracking, erreichbar über den Zyklus-Abschnitt der Startseite und den Link "Zyklus-Symptome" im Check-in. Store cycleSymptoms (IndexedDB Version 2, ID ist das Datum): {id, date, symptoms: [{key, intensity 1 bis 3}], bleeding (keine, leicht, mittel, stark, sehr-stark), note}, ein Eintrag pro Tag, jede Auswahl sofort gespeichert.
- Oben Kalenderstreifen des aktuellen Zyklus (Kreise je Tag, Blutung als Füllung in Rosé, Symptome als Punkt), dann Blutungsstärke als fünf Pillen, die Standardliste aus profile.cycleSymptomsDefault (Start: Gliederschmerzen, Hautempfindlich, Blähbauch, Krämpfe, Müdigkeit, Stimmungsschwankungen) mit drei Kreisen für die Stärke (leer, base, deep), "Mehr" für die übrigen 14, Freitext. Ein Symptom aus der Langliste, das an drei Tagen in 60 Tagen gewählt wurde, rückt automatisch in die Standardliste.
- Muster: je Symptom die Zyklustage der letzten drei Zyklen als Punktreihe, satter bei mehr Zyklen. Keine Interpretation. Der Auszug für die Beratung enthält Blutung und Symptome je Tag mit Zyklustag.
- Nach Änderungen an den Symptom-Regeln: node scripts/test-cycle.mjs.
- Auswertung zeigt nur Zahlen und Verläufe, keine Interpretation.

## Ernährung und Auszug
- Der Essensplan ist persönlich und wird behandelt wie das Profil: data/meals.json wird nie committet (.gitignore) und nie deployt. Öffentlich ist nur data/meals.example.json (3 neutrale Gerichte, 10 Lebensmittel).
- Der aktive Plan lebt in IndexedDB (settings, key "meals") und ist Teil der verschlüsselten Sicherung. Er kommt per "Essensplan aus Datei importieren" (Schema-Prüfung mit validateMealsFile, Versionsanzeige) und geht per "Essensplan exportieren" wieder hinaus. Ohne eigenen Plan zeigt der Tab Essen den Beispielplan mit Hinweis "Eigenen Plan importieren".
- Die Ampel wird zur Laufzeit aus profile.diet.intolerances berechnet und nie in der Datei gespeichert.
- Gerichte mit einem Tag oder einer Zutat aus profile.diet.dislikes werden nie vorgeschlagen. Tags im Essensplan und dislikes im Profil müssen dasselbe Vokabular nutzen (exakter Vergleich).
- Vorschläge bevorzugen profile.diet.cuisines, dann die bessere Ampel. Eigene Tausche in settings mealSwaps, Feedback in mealFeedback.
- Auszug für die Beratung ist unverschlüsseltes Markdown, ohne Namen der Person, Medikamente standardmäßig anonymisiert, keine Interpretation.
- Nach Änderungen an den Regeln: node scripts/test-food.mjs (läuft gegen data/meals.example.json, prüft eine lokale data/meals.json zusätzlich auf das Schema).
