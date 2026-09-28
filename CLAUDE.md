# CLAUDE.md

## Projekt
Persönliche Health- und Fitness-App für eine einzelne Person pro Fork (persönliche Angaben stehen nur im Profil, siehe Personenneutralität). Läuft als PWA auf einem iPhone SE 2022 (Viewport 375 x 667 px, Touch ID, Safari). Wird über GitHub Pages ausgeliefert (Repo: health-app). Alle Daten bleiben lokal auf dem Gerät und werden zusätzlich verschlüsselt in ein privates GitHub-Daten-Repo gesichert (Standard health-data, in den Einstellungen änderbar, settings key syncRepo).

## Stack, bewusst einfach
- Vanilla HTML, CSS, JavaScript (ES Modules). Kein Framework, kein Build-Schritt außer optionalem Minify.
- Speicher: IndexedDB über die Bibliothek `idb` (als lokale Kopie im Repo, nicht per CDN, damit alles offline läuft).
- Service Worker für Offline-Betrieb (App Shell cachen, Daten nie im SW-Cache).
- Verschlüsselung: WebCrypto, AES-GCM, Schlüssel per PBKDF2 (mind. 300.000 Iterationen) aus einem Nutzerpasswort. Passwort wird nie gespeichert, nur der Schlüssel in der Session.
- Sync: GitHub Contents API, eine Datei `data.json.enc` pro Sicherung plus `manifest.json` im Daten-Repo (settings syncRepo, Standard health-data, gilt für Sync und Push-Dateien). Token (fine-grained PAT) liegt in IndexedDB, wird nie geloggt.
- Schrift: Inter, selbst gehostet als woff2 (Variable Font), Subsets Latin. Keine Google-Fonts-Verlinkung.
- Sprache der Oberfläche: Deutsch, Du-Form. Keine Gedankenstriche im UI-Text.

## Struktur
/index.html
/manifest.webmanifest
/sw.js
/css/tokens.css, base.css, components.css
/js/app.js (Router, Shell), aura.js (Aura je Screen), week-bar.js (Wochentags-Leiste), db.js (IndexedDB), crypto.js, sync.js, notify.js, profile.js (Profil), ui.js (Dialoge, Datum), planner.js (Trainingspläne, rein funktional), meds-schedule.js (Zeitplan-Regeln, rein funktional), meds-store.js, push.js, checkin-core.js (Slider, Zyklustag, Tagesfläche), food-rules.js (Ampel, Ausschlüsse, rein funktional), food-data.js, report.js (Auszug für Beratung)
/js/modules/home.js, training.js, meds.js, checkin.js, food.js, settings.js, profile-form.js (Onboarding, Profil bearbeiten), reminders.js (Einstellungen Erinnerungen), report-section.js (Einstellungen Auszug)
/js/vendor/idb.js
/data/exercises.json, plans.json (optionale Überschreibung), meals.example.json (neutraler Beispiel-Essensplan), profile.example.json (neutrale Profilvorlage), plans.generated.json (Beispielpläne aus profile.example.json)
/scripts/generate-plans.mjs, test-planner.mjs, test-meds.mjs, test-food.mjs (Node, nur Entwicklung)
/push-worker/ (Vorlagen für die Push-Action im Repo health-data, wird nicht deployt)
/assets/exercises/*.svg, /assets/fonts/, /assets/icons/

## Design-System (verbindlich)
Ästhetik: Swiss Design, clean, minimalistisch. Jeder Screen liegt auf Creme und trägt eine Aura aus weichen Farbverläufen. Große Zahlen tragen die Information, Text ist sekundär. Alle Werte stehen als Tokens in css/tokens.css.

### Farben
- Neutral: Creme #F4EFE6 (Grund überall), Sand #EEE7DB (Karten), Ink #161616 (Text), Ink-2 #6C6761 (Sekundärtext, 4,5:1 auch auf Sand), Linie #E1DACF.
- Modulfarben in zwei Stufen, base für Verläufe und Flächen, deep für Linien, aktive Elemente und Flächen mit weißer Schrift. Die deep-Werte sind abgedunkelt, damit weiße Schrift mindestens 4,5:1 erreicht:
  - Butter: base #F5D96B, deep #8C7221 (Medis)
  - Mandarine: base #F49A5A, deep #C0561E (Training, Energie)
  - Koralle: base #F27A6B, deep #C7392B (Schmerz, Warnung, Markierungen)
  - Rosé: base #F3B8CB, deep #C54B7A (Zyklus, Stimmung)
  - Periwinkle: base #A9B8F0, deep #4A5FCC (Schlaf, Check-in)
  - Salbei: base #B9CFA6, deep #598141 (Verdauung, Ernährung)
- Text immer Ink. Sekundärtext Ink-2 auf Creme und Sand. Im oberen Aura-Bereich Ink mit 78 Prozent Deckkraft (Klasse .on-aura), das hält 4,5:1.
- Jede Text-Farbe-Kombination mindestens 4,5:1 (WCAG AA). Große Zahlen in Ink, nie in einem deep-Ton.

### Aura
- Kein Screen hat eine farbige Vollfläche. Die Aura (js/aura.js, #aura in der Shell) besteht aus zwei bis drei, höchstens vier Verläufen von base zu transparent, blur 56 px, mix-blend-mode multiply, Größe 240 bis 420 px. Sie liegt hinter dem oberen Bereich, läuft nach unten in Creme aus, pointer-events none, 400 ms Einblenden beim Routing, sonst keine Animation. Die Kopfzeile ist darüber transparent und wird beim Scrollen Creme.
- Feste Kombinationen: Startseite Butter, Rosé, Periwinkle (mit Check-in-Daten wächst je Slider ein Verlauf nach Wert: Energie Mandarine oben links, Schlaf Periwinkle oben rechts, Verdauung Salbei unten links, Schmerz Koralle unten rechts). Check-in sehr dezent, baut sich beim Antippen auf. Training Mandarine und Butter dezent oben, während der Einheit nur ein Verlauf. Medis Butter und Mandarine großzügig oben. Auswertung Periwinkle und Rosé. Ernährung Salbei und Butter. Einstellungen und Profil nur Creme.
- In Karten nur Verläufe, die einen Wert zeigen (Streak, Pausentimer, Regler im Profil), nie zur Dekoration.

### Typografie (Inter Variable, Gewichte 100 bis 900, opsz)
- Große Zahlen: 72 px, Gewicht 900, line-height 0.9, letter-spacing -0.05em, tabular-nums, font-variation-settings "opsz" 32.
- Überschriften und Begrüßung: 28 px, Gewicht 900, letter-spacing -0.03em. Titel in Karten, Dialogen und Kopfzeile: 20 px, Gewicht 800.
- Begrüßung steht direkt über der Tageszahl. Monat 20 px, Gewicht 700, auf derselben Grundlinie neben der Zahl.
- Kartenzahlen und Chips: 32 px, Gewicht 800.
- Labels und Tab-Beschriftungen: 12 px, Gewicht 700, Uppercase, letter-spacing 0.08em.
- Fließtext und Hinweise: Gewicht 500, mindestens 16 px, line-height 1.45.

### Formen
- Karten: Sand auf Creme, Rechteck mit Radius 24 px, keine Kontur, keine Schatten, Abstand 12 px. Aktions-Karten Ink mit Creme-Text.
- Alles Interaktive ist vollrund (--radius-pill): Buttons als Pille (Höhe 52 px, Padding 0 24 px, primär Ink mit Creme-Text, sekundär Sand mit Ink-Text), Chips und Tags als Pille (Höhe 32 px, gewählt in deep der Modulfarbe mit weißer Schrift), Eingabefelder als Pille, Schalter als Pille mit Kreis-Knopf, Stepper als Pille mit runden Knöpfen.
- Check-in-Stufen als fünf Kreise (52 px, Zahl zentriert, gewählt im base-Ton, satter mit höherem Wert). Haken und Gesamtgefühl ebenfalls als Kreise.
- Wochentags-Leiste (Training, Medis, Essen, js/week-bar.js): Reihe von Kreisen 40 px, aktiver Tag gefüllt in deep der Modulfarbe mit weißer Zahl, heute mit Ring, erledigte Tage mit Punkt.
- Kalenderpunkte in Auswertungen als Kreise 12 px. Fortschrittsring bleibt ein Kreis.
- Kein Radius unter 12 px irgendwo in der App. Mehrzeilige Felder bekommen den Kartenradius.

### Elemente
- Tab-Bar: Creme mit 1 px Linie in Ink 12 Prozent, 5 Einträge (Heute, Training, Medis, Check-in, Essen). Aktives Icon mit 2 px Linie und Ink-Label, dahinter ein Kreis 36 px im base-Ton der Modulfarbe (Heute Rosé, Training Mandarine, Medis Butter, Check-in Periwinkle, Essen Salbei). Inaktiv Ink-2. Einstellungen über Icon oben rechts. Safe Areas (env(safe-area-inset-*)) beachten.
- Diagramme: Linien im deep-Ton der Modulfarbe, keine Gitterlinien, Punkte und Markierungen in Koralle deep.
- Raster: 8 px. Seitenrand 20 px.
- Interaktion: Tap-Ziele mind. 44 px (Chips mit erweiterter Tap-Fläche). Keine Hover-Zustände nötig. Übergänge 180 ms ease-out. Haptik nicht verfügbar, dafür klare visuelle Bestätigung.
- Icons: dünne Linien-Icons (1.5 px), selbst als SVG, keine Icon-Bibliothek.
- Verbotene Muster: farbige Vollflächen, Balkendiagramme mit vielen Farben, Schlagschatten, Konturen um Karten, Bootstrap-Look, Emojis im UI.

## Regeln für Code
- Alles muss offline funktionieren, außer Sync und YouTube-Links.
- Jede Datenänderung: erst IndexedDB, dann Sync-Queue (Sync darf fehlschlagen, Daten nie).
- Datum immer lokal (Europe/Berlin), gespeichert als ISO-String ohne Zeitzonenverschiebung des Tages.
- Keine externen Requests außer api.github.com (Sync) und youtube.com (Links, nur per Klick).
- Kein Analytics, kein Tracking, keine Cookies.
- Kommentare und Commit-Messages auf Deutsch.

## Personenneutralität
- Der Code enthält keine Namen, keine konkreten Medikamente, keine Zyklus-Annahmen, keine Trainingsregeln. All das steht im Profil.
- Jede Funktion, die Verhalten personalisiert, liest aus dem Profil über js/profile.js (getProfile(), z.B. cycleTracking, training.avoidTags, diet). Medikamente liegen im Store meds.
- Das aktive Profil lebt in IndexedDB (Store settings, key "profile") und ist Teil der verschlüsselten Sicherung im Repo health-data. Bei Gerätewechsel wandert es mit der Wiederherstellung mit.
- data/profile.json wird nie committet (.gitignore) und nie deployt. Öffentlich ist nur data/profile.example.json (neutrale Vorlage). Eine lokale data/profile.json dient höchstens als Import-Datei.
- Beim ersten Start ohne Profil zeigt die App ein Onboarding (#/willkommen): Name, Geburtsjahr, Zyklus-Tracking, Trainingstage pro Woche, Trainingslevel, Schonungs-Tags als Checkboxen mit verständlichen Labels, Unverträglichkeiten, Lieblingsküchen, Abneigungen. Medikamente werden nicht im Onboarding abgefragt, sondern im Medis-Tab angelegt.
- In den Einstellungen: "Profil bearbeiten" (gleiche Felder), "Profil als Datei exportieren" und "Profil aus Datei importieren" (JSON). Ein Import ergänzt Medikamente mit neuer ID, bestehende werden nie überschrieben.
- Manifest-Name und short_name sind fest "Health". App-Titel und Begrüßung in der App werden aus profile.displayName gebildet ("<displayName> Health").
- Keine Profildaten in Tests, README, PROFILE.md, Beispielen oder Commits. Beispiele immer neutral.

## Training
- Übungsbibliothek data/exercises.json ist allgemein. Persönliche Einschränkungen nur über profile.training.avoidTags, nie im Code und nie in der Bibliothek.
- Pläne erzeugt js/planner.js zur Laufzeit aus profile.training, exercisePrefs (disliked, replacedBy) und der Phase (settings trainingPhase). data/plans.json überschreibt sie, falls vorhanden (öffentlich, keine persönlichen Vorgaben).
- data/plans.generated.json wird nur aus profile.example.json erzeugt. Pläne aus dem eigenen Profil gehen nach data/plans.local.json (ignoriert).
- Phasenwechsel nach 16 Einheiten nur vorschlagen, nie erzwingen.
- Nach Änderungen an Planer oder Bibliothek: node scripts/test-planner.mjs.

## Medis und Erinnerungen
- Keine Medikamente im Code. Einträge liegen im Store meds, Einnahmen in medLog mit ID Datum|medId|Slot.
- Schedule-Typen daily, everyNDays (ab startDate, sonst erstem Log), weekly (1 Montag bis 7 Sonntag), seasonal (months), jeweils mit optionalem startDate und endDate. type "measurement" speichert values (systolic, diastolic, pulse).
- critical steht auf der Startseite immer oben, Streak nur für critical.
- Push-Nachrichten sind allgemein und nennen nie Medikamente. reminders.json und subscriptions.json in health-data sind unverschlüsselt und enthalten nur Uhrzeiten und Push-Adressen.
- Nach Änderungen an den Zeitplan-Regeln: node scripts/test-meds.mjs.

## Check-in und Startseite
- Ein Check-in pro Tag (Store checkins, Index date), nachträglich editierbar, jede Auswahl wird sofort gespeichert.
- Slider nur aus profile.checkin.sliders (energy Mandarine, digestion Salbei, pain Koralle, sleep Periwinkle, mood Rosé). Schmerzseite nur bei painSideToggle.enabled, Zyklus nur bei cycleTracking, sonst komplett ausgeblendet.
- Zyklusphasen für die Auswertung kommen aus profile.checkin.cyclePhases, nie fest im Code.
- Auswertung zeigt nur Zahlen und Verläufe, keine Interpretation.

## Ernährung und Auszug
- Der Essensplan ist persönlich und wird behandelt wie das Profil: data/meals.json wird nie committet (.gitignore) und nie deployt. Öffentlich ist nur data/meals.example.json (3 neutrale Gerichte, 10 Lebensmittel).
- Der aktive Plan lebt in IndexedDB (settings, key "meals") und ist Teil der verschlüsselten Sicherung. Er kommt per "Essensplan aus Datei importieren" (Schema-Prüfung mit validateMealsFile, Versionsanzeige) und geht per "Essensplan exportieren" wieder hinaus. Ohne eigenen Plan zeigt der Tab Essen den Beispielplan mit Hinweis "Eigenen Plan importieren".
- Die Ampel wird zur Laufzeit aus profile.diet.intolerances berechnet und nie in der Datei gespeichert.
- Gerichte mit einem Tag oder einer Zutat aus profile.diet.dislikes werden nie vorgeschlagen. Tags im Essensplan und dislikes im Profil müssen dasselbe Vokabular nutzen (exakter Vergleich).
- Vorschläge bevorzugen profile.diet.cuisines, dann die bessere Ampel. Eigene Tausche in settings mealSwaps, Feedback in mealFeedback.
- Auszug für die Beratung ist unverschlüsseltes Markdown, ohne Namen der Person, Medikamente standardmäßig anonymisiert, keine Interpretation.
- Nach Änderungen an den Regeln: node scripts/test-food.mjs (läuft gegen data/meals.example.json, prüft eine lokale data/meals.json zusätzlich auf das Schema).
