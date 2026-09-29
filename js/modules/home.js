/*
  Startseite (Tab Heute): Begrüßung, Datum und Live-Uhrzeit (lokale Zeit des Geräts),
  Zyklustag (nur mit cycleTracking),
  Aura aus den Check-in-Werten (ohne Check-in ruhig in Butter, Rosé, Periwinkle),
  fällige Medikamente (wichtige zuerst, direkt abhakbar),
  abgelaufene Schonungen (nie automatisch entfernt, die Person entscheidet),
  nächstes Training und die Gerichte des Tages, sofern ein Essensplan existiert.
*/

import { getProfile } from '../profile.js';
import { openItems, setTaken } from '../meds-store.js';
import { isMeasurement, slotLabel } from '../meds-schedule.js';
import { SLIDER_META, activeSliders, getCheckin, hasValues, cycleDayFor, auraBlobs } from '../checkin-core.js';
import { setAura, AURAS } from '../aura.js';
import { todayISO, toast, el } from '../ui.js';
import { greeting, timeText, dayParts, msToNextMinute } from '../clock.js';
import { expiredRegions, regionLabel } from '../training-options.js';

/* Kopf: Wochentag, Begrüßung, Tageszahl, Monat und Uhrzeit, jede Minute aktualisiert */

let clock = null;

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

function checkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  return svg;
}

/* Tageswerte: die Aura des Screens wächst mit dem Check-in */

async function renderDay(container) {
  const profile = getProfile();
  const sliders = activeSliders(profile);
  const today = todayISO();
  const checkin = await getCheckin(today);
  const filled = hasValues(checkin, sliders);
  setAura(filled ? auraBlobs(checkin, sliders) : AURAS.heute, { animate: false });

  const content = el('div', 'stack-tight');
  if (profile.cycleTracking) {
    const cycleDay = await cycleDayFor(today);
    if (cycleDay) {
      const line = el('div', 'day-line tone-rose');
      line.append(el('span', 'number', String(cycleDay)), el('span', 'month', 'Zyklustag'));
      content.append(line);
    }
  }

  if (filled) {
    const values = el('div', 'day-values');
    for (const key of sliders) {
      if (!Number.isInteger(checkin[key])) continue;
      const item = el('span', `day-value tone-${SLIDER_META[key].tone}`);
      item.append(el('span', 'label on-aura', SLIDER_META[key].label), el('span', 'card-number', String(checkin[key])));
      values.append(item);
    }
    const edit = el('a', 'button button--small tone-koralle', 'Check-in bearbeiten');
    edit.href = '#/checkin';
    content.append(values, edit);
  } else {
    // Ohne Check-in keine Fläche, nur Aufforderung und Button auf der Aura
    const prompt = el('div', 'stack-tight checkin-prompt');
    const start = el('a', 'button button--primary tone-koralle', 'Check-in starten');
    start.href = '#/checkin';
    prompt.append(el('p', null, 'Wie geht es dir heute? Mit deinem Check-in füllt sich die Farbfläche oben.'), start);
    content.append(prompt);
  }
  container.replaceChildren(content);
}

/* Fällige Medikamente */

async function renderDue(container) {
  const items = await openItems();
  container.replaceChildren();
  if (!items.length) return;

  const card = el('div', 'card due-card tone-butter');
  const head = el('div', 'due-head');
  head.append(el('p', 'label', 'Jetzt fällig'), el('span', 'card-number', String(items.length)));
  card.append(head);

  for (const item of items) {
    const row = el('div', `med-row${item.med.critical ? ' med-row--critical' : ''}`);
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
      check.append(checkIcon());
      check.addEventListener('click', async () => {
        await setTaken(item.med, item.slot, todayISO(), true);
        row.classList.add('med-row--done');
        toast(`${item.med.name} abgehakt`);
        setTimeout(() => renderDue(container), 600);
      });
      row.append(check, body);
    }
    card.append(row);
  }
  container.append(card);
}

/* Abgelaufene Schonung: weiter schonen (ohne Enddatum) oder aufheben */

async function renderProtection(container) {
  const training = getProfile().training;
  const expired = expiredRegions(training, todayISO());
  container.replaceChildren();
  for (const entry of expired) {
    const card = el('div', 'card stack-tight tone-mandarine');
    const label = regionLabel(entry.region);
    card.append(el('p', 'label', 'Schonung'), el('p', null, `Schonung ${label} ist abgelaufen, weiter schonen oder aufheben?`));
    const keep = el('button', 'button', 'Weiter schonen');
    const lift = el('button', 'button button--primary', 'Aufheben');
    keep.type = 'button';
    lift.type = 'button';
    const update = async (next, message) => {
      const { saveTraining } = await import('../training-data.js');
      await saveTraining({ protectRegions: next });
      toast(message);
      renderProtection(container);
    };
    keep.addEventListener('click', () => update(getProfile().training.protectRegions.map((item) => (item.region === entry.region ? { ...item, until: null } : item)), `${label} wird weiter geschont`));
    lift.addEventListener('click', () => update(getProfile().training.protectRegions.filter((item) => item.region !== entry.region), `Schonung ${label} aufgehoben, der Plan wird neu aufgebaut`));
    const actions = el('div', 'button-row');
    actions.append(keep, lift);
    card.append(actions);
    container.append(card);
  }
}

/* Nächstes Training */

async function renderTraining(container) {
  try {
    const { nextTraining } = await import('./training.js');
    const { plan, active, names } = await nextTraining();
    if (!plan) return;
    const card = el('div', 'card training-card tone-mandarine');
    card.append(el('p', 'label', active ? 'Einheit läuft' : 'Nächstes Training'), el('h2', null, active?.planName ?? plan.name));
    card.append(el('p', 'secondary', active ? 'Mach dort weiter, wo du aufgehört hast.' : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` und ${names.length - 3} weitere` : ''}`));
    const go = el('a', 'button button--primary', active ? 'Fortsetzen' : 'Zum Training');
    go.href = active ? '#/training/einheit' : '#/training';
    card.append(go);
    container.replaceChildren(card);
  } catch {
    container.replaceChildren();
  }
}

// Gerichte des Tages aus dem Essensplan (eigener Plan oder Beispielplan)
async function renderMeal(container) {
  try {
    const { mealsForDate } = await import('../food-data.js');
    const day = await mealsForDate(todayISO());
    const planned = (day ?? []).filter((entry) => entry.meal);
    if (!planned.length) return;
    const card = el('div', 'card meal-today tone-salbei');
    card.append(el('p', 'label', 'Heute auf dem Plan'));
    for (const entry of planned) {
      const row = el('div', 'meal-today-row');
      row.append(el('span', 'secondary', entry.slot.label), el('span', 'med-name', entry.meal.name));
      card.append(row);
    }
    const link = el('a', 'button', 'Zum Essen');
    link.href = '#/essen';
    card.append(link);
    container.replaceChildren(card);
  } catch {
    // kein Essensplan verfügbar
  }
}

export async function render(root) {
  const section = el('section', 'stack home');
  // Begrüßung direkt über der Tageszahl, Monat und Uhrzeit auf derselben Grundlinie
  const intro = renderHead();

  const dayArea = el('div');
  const protection = el('div', 'stack-tight');
  const due = el('div');
  const training = el('div');
  const meal = el('div');
  section.append(intro, dayArea, due, protection, training, meal);
  root.replaceChildren(section);
  await Promise.all([renderDay(dayArea), renderProtection(protection), renderDue(due), renderTraining(training), renderMeal(meal)]);
}
