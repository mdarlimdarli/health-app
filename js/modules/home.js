/*
  Startseite (Tab Heute) als Dashboard. Von oben:
  0. Kopf: Wochentag, Begrüßung, Tageszahl, Monat, Live-Uhrzeit, Aura aus dem Check-in
  1. Medikamente: heute offene Einträge als kompakte Zeilen, wichtige zuerst, sonst "Alles genommen" mit Streak
  2. Check-in: Aufforderung oder die Werte als farbige Kreise
  3. Zyklus (nur mit cycleTracking): Zyklustag, Phase in Worten, Symptome des Tages als Chips
  4. Training: nächster Plan, letzte Einheit, Wochenziel als Ring, abgelaufene Schonungen
  5. Essen (nur mit eigenem Plan): Mittag und Abend mit Tagesnotiz, Tippen öffnet die Rezeptkarte
  Jeder Abschnitt ist eine Kontur-Karte, Abschnitte ohne Inhalt fallen ganz weg.
*/

import { getProfile } from '../profile.js';
import { loadMeds, loadLogs, setTaken } from '../meds-store.js';
import { dayPlan, streak, isMeasurement, slotLabel, SLOTS, nudgeDue } from '../meds-schedule.js';
import { SLIDER_META, activeSliders, getCheckin, hasValues, cycleDayFor, periodStarts, auraBlobs } from '../checkin-core.js';
import { averageCycleLength, cyclePhaseName, periodLength } from '../cycle.js';
import { setAura, AURAS } from '../aura.js';
import { todayISO, toast, el } from '../ui.js';
import { greeting, timeText, dayParts, msToNextMinute } from '../clock.js';
import { expiredRegions, regionLabel } from '../training-options.js';

/* Kopf: Wochentag, Begrüßung, Tageszahl, Monat und Uhrzeit, jede Minute aktualisiert */

let clock = null;
let refreshMeds = null;

function renderHead() {
  const head = el('div', 'hero');
  const weekday = el('p', 'label on-aura');
  const hello = el('h2');
  const line = el('div', 'day-line');
  const day = el('span', 'number number--ink');
  const month = el('span', 'month');
  const time = el('time', 'clock');
  line.append(day, month, time);
  head.append(weekday, hello, line);

  const update = () => {
    const now = new Date();
    // Zum Nachhak-Zeitpunkt die Medikamente neu zeichnen, damit die Markierung ohne Neuladen erscheint
    const nudge = nudgeDue(now.getHours() * 60 + now.getMinutes(), getProfile().reminders?.nudgeTime);
    if (head.dataset.nudge !== undefined && head.dataset.nudge !== String(nudge)) refreshMeds?.();
    head.dataset.nudge = String(nudge);
    const parts = dayParts(now);
    weekday.textContent = parts.weekday;
    hello.textContent = greeting(now, getProfile().displayName);
    day.textContent = parts.day;
    month.textContent = parts.month;
    time.textContent = timeText(now);
    time.dateTime = timeText(now);
  };
  update();
  startClock(head, update);
  return head;
}

// Ein Zeitgeber für die sichtbare Startseite, er endet, sobald der Kopf nicht mehr im DOM ist
function startClock(head, update) {
  stopClock();
  clock = { head, update, timer: null };
  const schedule = () => {
    clock.timer = setTimeout(() => {
      if (!head.isConnected) return stopClock();
      update();
      schedule();
    }, msToNextMinute(new Date()));
  };
  schedule();
}

function stopClock() {
  if (clock) clearTimeout(clock.timer);
  clock = null;
}

// Zurück in der App: sofort aktualisieren, ohne auf den nächsten Minutenwechsel zu warten
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !clock) return;
  if (!clock.head.isConnected) return stopClock();
  clock.update();
  startClock(clock.head, clock.update);
});

function svgIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
const ICON_NEXT = '<path d="m9 5 7 7-7 7"/>';

// Kontur-Karte mit Label in Uppercase, Ton für Buttons und Zahlen
function sectionCard(label, tone) {
  const card = el('section', `card dash-card tone-${tone}`);
  card.append(el('p', 'label', label));
  return card;
}

/* 1. Medikamente */

// Streak über die wichtigen Einträge (sonst alle): Tage in Folge, an denen alles erledigt war
function overallStreak(meds, logs, today, firstLogDates) {
  const active = meds.filter((med) => med.active !== false);
  const relevant = active.some((med) => med.critical) ? active.filter((med) => med.critical) : active;
  const values = relevant.map((med) => streak(med, logs, today, firstLogDates.get(med.id) ?? null));
  return values.length ? Math.min(...values) : 0;
}

async function renderMeds(container) {
  const [meds, { logs, firstLogDates }] = await Promise.all([loadMeds(), loadLogs()]);
  const today = todayISO();
  const items = dayPlan(meds, logs, today, firstLogDates).flatMap((slot) => slot.items).filter((item) => item.state !== 'spaeter');
  container.replaceChildren();
  if (!items.length) return;

  const slotIndex = (id) => SLOTS.findIndex((slot) => slot.id === id);
  const open = items
    .filter((item) => item.state === 'offen')
    .sort((a, b) => (b.med.critical ? 1 : 0) - (a.med.critical ? 1 : 0) || slotIndex(a.slot) - slotIndex(b.slot));

  const card = sectionCard('Medikamente', 'butter');
  // Ab der Nachhak-Zeit (Standard 22 Uhr) Koralle-Markierung, solange etwas offen ist
  const now = new Date();
  if (open.length && nudgeDue(now.getHours() * 60 + now.getMinutes(), getProfile().reminders?.nudgeTime)) {
    card.classList.add('dash-card--nudge');
    card.append(el('p', 'nudge-text', `Heute noch ${open.length} ${open.length === 1 ? 'Eintrag' : 'Einträge'} offen`));
  }
  if (!open.length) {
    const days = overallStreak(meds, logs, today, firstLogDates);
    const row = el('div', 'dash-done');
    const text = el('div', 'med-body');
    text.append(el('span', 'med-name', 'Alles genommen'), el('span', 'secondary', days === 1 ? 'Tag in Folge' : 'Tage in Folge'));
    row.append(text, el('span', 'card-number', String(days)));
    card.append(row);
    container.append(card);
    return;
  }

  for (const item of open) {
    const row = el('div', `med-row dash-med${item.med.critical ? ' med-row--critical' : ''}`);
    const body = el('div', 'med-body');
    const name = el('span', 'med-name', item.med.name);
    if (item.med.critical) name.append(' ', el('span', 'med-tag', 'Wichtig'));
    body.append(name, el('span', 'secondary', [slotLabel(item.slot), item.med.dosage].filter(Boolean).join(', ')));

    if (isMeasurement(item.med)) {
      const go = el('a', 'button button--small', 'Messen');
      go.href = '#/medis';
      row.append(body, go);
    } else {
      const check = el('button', 'med-check');
      check.type = 'button';
      check.setAttribute('aria-label', `${item.med.name} genommen`);
      check.append(svgIcon(ICON_CHECK));
      check.addEventListener('click', async () => {
        await setTaken(item.med, item.slot, today, true);
        row.classList.add('med-row--done');
        toast(`${item.med.name} abgehakt`);
        setTimeout(() => renderMeds(container), 500);
      });
      row.append(check, body);
    }
    card.append(row);
  }
  container.append(card);
}

/* 2. Check-in: die Aura des Screens wächst mit den Werten */

async function renderCheckin(container) {
  const sliders = activeSliders(getProfile());
  const checkin = await getCheckin(todayISO());
  const filled = hasValues(checkin, sliders);
  setAura(filled ? auraBlobs(checkin, sliders) : AURAS.heute, { animate: false });
  container.replaceChildren();
  if (!sliders.length) return;

  if (!filled) {
    const card = sectionCard('Check-in', 'koralle');
    const start = el('a', 'button', 'Wie geht es dir?');
    start.href = '#/checkin';
    card.append(start);
    container.append(card);
    return;
  }

  // Die ganze Karte öffnet den Check-in zum Bearbeiten
  const card = el('a', 'card dash-card dash-link tone-koralle');
  card.href = '#/checkin';
  const values = sliders.filter((key) => Number.isInteger(checkin[key]));
  card.setAttribute('aria-label', `Check-in bearbeiten: ${values.map((key) => `${SLIDER_META[key].label} ${checkin[key]}`).join(', ')}`);
  const head = el('div', 'dash-head');
  head.append(el('p', 'label', 'Check-in'), svgIcon(ICON_NEXT));
  const circles = el('div', 'value-circles');
  for (const key of values) {
    const item = el('span', `value-item tone-${SLIDER_META[key].tone}`);
    item.append(el('span', 'value-circle', String(checkin[key])), el('span', 'value-label', SLIDER_META[key].label));
    circles.append(item);
  }
  card.append(head, circles);
  container.append(card);
}

/* 3. Zyklus */

async function renderCycle(container) {
  const profile = getProfile();
  container.replaceChildren();
  if (!profile.cycleTracking) return;
  const today = todayISO();
  const [cycleDay, starts] = await Promise.all([cycleDayFor(today), periodStarts()]);

  const card = el('a', 'card dash-card dash-link tone-rose');
  card.href = '#/zyklus';
  const head = el('div', 'dash-head');
  head.append(el('p', 'label', 'Zyklus'), svgIcon(ICON_NEXT));
  card.append(head);
  if (!cycleDay) {
    card.append(el('p', 'secondary', 'Trag im Check-in ein, wann deine Periode begonnen hat. Dann siehst du hier Zyklustag und Phase.'));
    container.append(card);
    return;
  }
  const length = averageCycleLength(starts);
  const phase = cyclePhaseName(cycleDay, length, periodLength(profile.checkin.cyclePhases));
  const line = el('div', 'day-line');
  line.append(el('span', 'number', String(cycleDay)), el('span', 'month', phase));
  card.append(line, el('p', 'secondary', `Zyklustag, dein Zyklus dauert im Schnitt ${length} Tage`));

  // Heute eingetragene Symptome als Chips
  const { getEntry } = await import('../cycle-store.js');
  const { symptomLabel } = await import('../cycle-symptoms.js');
  const entry = await getEntry(today);
  const labels = entry.symptoms.map((item) => symptomLabel(item.key));
  if (labels.length) {
    const tags = el('div', 'symptom-tags');
    labels.forEach((label) => tags.append(el('span', 'symptom-tag', label)));
    card.append(tags);
  }
  card.setAttribute('aria-label', `Zyklus: Tag ${cycleDay}, ${phase}${labels.length ? `, heute ${labels.join(', ')}` : ''}`);
  container.append(card);
}

/* 4. Training */

function miniRing(done, goal) {
  const size = 56;
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'mini-ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${done} von ${goal} Einheiten diese Woche`);
  const offset = circumference * (1 - Math.min(1, done / goal));
  svg.innerHTML = `<circle class="mini-ring-track" cx="28" cy="28" r="${radius}"/><circle class="mini-ring-value" cx="28" cy="28" r="${radius}" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/><text x="28" y="33" text-anchor="middle">${done}/${goal}</text>`;
  return svg;
}

// Abgelaufene Schonung: weiter schonen (ohne Enddatum) oder aufheben, nichts wird automatisch entfernt
function protectionRows(container) {
  const rows = [];
  for (const entry of expiredRegions(getProfile().training, todayISO())) {
    const label = regionLabel(entry.region);
    const row = el('div', 'dash-protection stack-tight');
    row.append(el('p', null, `Schonung ${label} ist abgelaufen, weiter schonen oder aufheben?`));
    const keep = el('button', 'button', 'Weiter schonen');
    const lift = el('button', 'button button--primary', 'Aufheben');
    keep.type = 'button';
    lift.type = 'button';
    const update = async (next, message) => {
      const { saveTraining } = await import('../training-data.js');
      await saveTraining({ protectRegions: next });
      toast(message);
      renderTraining(container);
    };
    keep.addEventListener('click', () => update(getProfile().training.protectRegions.map((item) => (item.region === entry.region ? { ...item, until: null } : item)), `${label} wird weiter geschont`));
    lift.addEventListener('click', () => update(getProfile().training.protectRegions.filter((item) => item.region !== entry.region), `Schonung ${label} aufgehoben, der Plan wird neu aufgebaut`));
    const actions = el('div', 'button-row');
    actions.append(keep, lift);
    row.append(actions);
    rows.push(row);
  }
  return rows;
}

async function renderTraining(container) {
  try {
    const { nextTraining, startNextWorkout, formatTrainingDate } = await import('./training.js');
    const { plan, active, last, doneThisWeek, goal } = await nextTraining();
    container.replaceChildren();
    if (!plan) return;
    const card = sectionCard('Training', 'mandarine');
    const row = el('div', 'dash-training');
    const text = el('div', 'med-body');
    text.append(
      el('h2', null, active ? `${active.planName ?? plan.name} läuft` : `Als Nächstes ${plan.name}`),
      el('span', 'secondary', last ? `Letzte Einheit ${formatTrainingDate(last.date)}` : 'Noch keine Einheit'),
    );
    row.append(text, miniRing(doneThisWeek, goal));
    card.append(row, ...protectionRows(container));

    if (active) {
      const go = el('a', 'button button--primary', 'Einheit fortsetzen');
      go.href = '#/training/einheit';
      card.append(go);
    } else {
      const start = el('button', 'button button--primary', 'Einheit starten');
      start.type = 'button';
      start.addEventListener('click', async () => {
        start.disabled = true;
        await startNextWorkout();
        location.hash = '#/training/einheit';
      });
      card.append(start);
    }
    container.append(card);
  } catch {
    container.replaceChildren();
  }
}

/* 5. Essen: nur mit eigenem Essensplan */

const DASH_MEALS = ['mittag', 'abend'];

async function renderMeal(container) {
  container.replaceChildren();
  try {
    const { loadMeals, mealsForDate, dayNote } = await import('../food-data.js');
    const data = await loadMeals();
    if (data?.source !== 'eigen') return;
    const today = todayISO();
    const [day, note] = await Promise.all([mealsForDate(today), dayNote(today)]);
    const planned = (day ?? []).filter((entry) => entry.meal && DASH_MEALS.includes(entry.slot.id))
      .sort((a, b) => DASH_MEALS.indexOf(a.slot.id) - DASH_MEALS.indexOf(b.slot.id));
    if (!planned.length) return;
    const card = sectionCard('Essen', 'salbei');
    for (const entry of planned) {
      const link = el('a', 'dash-row');
      link.href = `#/essen/${today}/${entry.slot.id}`;
      const text = el('span', 'med-body');
      text.append(el('span', 'secondary', entry.slot.label), el('span', 'med-name', entry.meal.name));
      link.append(text, svgIcon(ICON_NEXT));
      card.append(link);
    }
    if (note) card.append(el('p', 'hint', note));
    container.append(card);
  } catch {
    // kein Essensplan verfügbar
  }
}

export async function render(root) {
  const section = el('section', 'stack home');
  const head = renderHead();
  const meds = el('div');
  const checkin = el('div');
  const cycle = el('div');
  const training = el('div');
  const meal = el('div');
  section.append(head, meds, checkin, cycle, training, meal);
  refreshMeds = () => renderMeds(meds);
  root.replaceChildren(section);
  await Promise.all([renderMeds(meds), renderCheckin(checkin), renderCycle(cycle), renderTraining(training), renderMeal(meal)]);
}
