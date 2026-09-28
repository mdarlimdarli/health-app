/*
  Startseite (Tab Heute): Begrüßung, Datum, Zyklustag (nur mit cycleTracking),
  Tagesfläche aus den Check-in-Werten, fällige Medikamente (wichtige zuerst, direkt abhakbar),
  nächstes Training und die Gerichte des Tages, sofern ein Essensplan existiert.
*/

import { getProfile } from '../profile.js';
import { openItems, setTaken } from '../meds-store.js';
import { isMeasurement, slotLabel } from '../meds-schedule.js';
import { SLIDER_META, activeSliders, getCheckin, hasValues, cycleDayFor, renderAura } from '../checkin-core.js';
import { todayISO, toast, el } from '../ui.js';

const TIME_ZONE = 'Europe/Berlin';

function todayParts() {
  const now = new Date();
  const fmt = (options) => new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, ...options }).format(now);
  return { day: fmt({ day: 'numeric' }), weekday: fmt({ weekday: 'long' }), month: fmt({ month: 'long' }), hour: Number(fmt({ hour: 'numeric', hourCycle: 'h23' })) };
}

// Begrüßung nach Tageszeit, mit Namen aus dem Profil, falls vorhanden
function greeting(hour) {
  const phrase = hour >= 5 && hour < 11 ? 'Guten Morgen' : hour >= 11 && hour < 17 ? 'Hallo' : hour >= 17 && hour < 23 ? 'Guten Abend' : 'Gute Nacht';
  const name = getProfile().displayName;
  return name ? `${phrase}, ${name}` : phrase;
}

function checkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  return svg;
}

/* Tagesfläche mit Check-in */

async function renderDay(container) {
  const profile = getProfile();
  const sliders = activeSliders(profile);
  const today = todayISO();
  const checkin = await getCheckin(today);
  const filled = hasValues(checkin, sliders);

  const card = el('div', 'day-card');
  const aura = el('div');
  renderAura(aura, checkin, sliders);
  const content = el('div', 'day-card-content');

  if (profile.cycleTracking) {
    const cycleDay = await cycleDayFor(today);
    if (cycleDay) {
      const line = el('div', 'day-line');
      line.append(el('span', 'number', String(cycleDay)), el('span', 'month', 'Zyklustag'));
      content.append(line);
    }
  }

  if (filled) {
    const values = el('div', 'day-values');
    for (const key of sliders) {
      if (!Number.isInteger(checkin[key])) continue;
      const item = el('span', `day-value day-value--${SLIDER_META[key].tone}`);
      item.append(el('span', 'label', SLIDER_META[key].label), el('span', 'card-number', String(checkin[key])));
      values.append(item);
    }
    const edit = el('a', 'button button--small', 'Check-in bearbeiten');
    edit.href = '#/checkin';
    content.append(values, edit);
  } else {
    const start = el('a', 'button button--primary', 'Check-in starten');
    start.href = '#/checkin';
    content.append(el('p', 'secondary', 'Wie geht es dir heute? Mit deinem Check-in füllt sich diese Fläche.'), start);
  }
  card.append(aura, content);
  container.replaceChildren(card);
}

/* Fällige Medikamente */

async function renderDue(container) {
  const items = await openItems();
  container.replaceChildren();
  if (!items.length) return;

  const card = el('div', 'card due-card');
  const blob = el('div', 'blob blob--zitrone');
  blob.style.setProperty('--intensity', String(Math.min(1, 0.3 + items.length * 0.15)));
  const head = el('div', 'due-head');
  head.append(el('p', 'label', 'Jetzt fällig'), el('span', 'card-number', String(items.length)));
  card.append(blob, head);

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

/* Nächstes Training */

async function renderTraining(container) {
  try {
    const { nextTraining } = await import('./training.js');
    const { plan, active, names } = await nextTraining();
    if (!plan) return;
    const card = el('div', 'card training-card');
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

// Gerichte des Tages aus dem Essensplan, sofern data/meals.json Inhalte hat
async function renderMeal(container) {
  try {
    const { mealsForDate } = await import('../food-data.js');
    const day = await mealsForDate(todayISO());
    const planned = (day ?? []).filter((entry) => entry.meal);
    if (!planned.length) return;
    const card = el('div', 'card meal-today');
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
  const { day, weekday, month, hour } = todayParts();
  const section = el('section', 'stack home');
  const intro = el('div', 'home-intro');
  const line = el('div', 'day-line');
  line.append(el('span', 'number', day), el('span', 'month', month));
  intro.append(el('h2', null, greeting(hour)), el('p', 'label', weekday), line);

  const dayArea = el('div');
  const due = el('div');
  const training = el('div');
  const meal = el('div');
  section.append(intro, dayArea, due, training, meal);
  root.replaceChildren(section);
  await Promise.all([renderDay(dayArea), renderDue(due), renderTraining(training), renderMeal(meal)]);
}
