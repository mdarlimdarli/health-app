/*
  Zyklus (#/zyklus, #/zyklus/YYYY-MM-DD, #/zyklus/muster), nur mit cycleTracking.
  Tag: Kalenderstreifen des aktuellen Zyklus, Blutungsstärke, Symptome mit Stärke 1 bis 3,
  "Mehr" für die Langliste, Freitext. Ein Eintrag pro Tag, jede Auswahl wird sofort gespeichert.
  Muster: je Symptom die Zyklustage der letzten drei Zyklen als Punktreihe. Keine Interpretation.
*/

import { getProfile } from '../profile.js';
import { cycleDayFor, periodStarts } from '../checkin-core.js';
import { averageCycleLength, cyclePhaseName, periodLength } from '../cycle.js';
import { SYMPTOMS, BLEEDING, symptomLabel, currentCycleStrip, symptomPattern, addDays } from '../cycle-symptoms.js';
import { getEntry, allEntries, saveEntry } from '../cycle-store.js';
import { todayISO, toast, el } from '../ui.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function subnav(active) {
  const nav = el('nav', 'segmented segmented--links');
  nav.setAttribute('aria-label', 'Zyklus');
  for (const [id, label, href] of [['tag', 'Tag', '#/zyklus'], ['muster', 'Muster', '#/zyklus/muster']]) {
    const link = el('a', 'segment', label);
    link.href = href;
    if (id === active) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

async function cycleInfo(date) {
  const profile = getProfile();
  const [cycleDay, starts] = await Promise.all([cycleDayFor(date), periodStarts()]);
  const length = averageCycleLength(starts);
  return { cycleDay, starts, length, phase: cyclePhaseName(cycleDay, length, periodLength(profile.checkin.cyclePhases)) };
}

/* Kalenderstreifen: je Tag ein Kreis, Blutung als Füllung, Symptome als Punkt */

function stripView(strip, selected) {
  const list = el('div', 'cycle-strip');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Aktueller Zyklus');
  for (const day of strip) {
    const cell = el(day.future ? 'span' : 'a', 'strip-day');
    cell.setAttribute('role', 'listitem');
    if (!day.future) cell.href = day.today ? '#/zyklus' : `#/zyklus/${day.date}`;
    const circle = el('span', `strip-circle strip-circle--${day.bleeding}`, String(day.day));
    const classes = [day.future && 'strip-day--future', day.today && 'strip-day--today', day.date === selected && 'strip-day--selected', day.symptoms && 'strip-day--symptoms'];
    classes.filter(Boolean).forEach((name) => cell.classList.add(name));
    const bleeding = BLEEDING[day.bleeding]?.[1] ?? 'Keine';
    cell.setAttribute('aria-label', `Zyklustag ${day.day}, ${formatDay(day.date)}${day.future ? ', noch nicht' : `, Blutung ${bleeding.toLowerCase()}${day.symptoms ? `, ${day.symptoms} ${day.symptoms === 1 ? 'Symptom' : 'Symptome'}` : ''}`}`);
    cell.append(circle);
    list.append(cell);
  }
  return list;
}

/* Tag */

function intensityRow(key, entry, save) {
  const row = el('div', 'symptom-row');
  const label = symptomLabel(key);
  const group = el('div', 'intensity');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${label}, Stärke`);
  const buttons = [1, 2, 3].map((level) => {
    const button = el('button', `intensity-dot intensity-dot--${level}`);
    button.type = 'button';
    button.setAttribute('aria-label', `${label}, Stärke ${level}`);
    return button;
  });
  const show = () => {
    const current = entry.symptoms.find((item) => item.key === key)?.intensity ?? 0;
    buttons.forEach((button, index) => {
      button.classList.toggle('intensity-dot--on', index < current);
      button.setAttribute('aria-pressed', String(index + 1 === current));
    });
  };
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    const level = index + 1;
    const current = entry.symptoms.find((item) => item.key === key)?.intensity ?? 0;
    entry.symptoms = entry.symptoms.filter((item) => item.key !== key);
    // Gleiche Stärke nochmal antippen hebt die Auswahl auf
    if (current !== level) entry.symptoms.push({ key, intensity: level });
    show();
    save();
  }));
  show();
  group.append(...buttons);
  row.append(el('span', 'symptom-label', label), group);
  return row;
}

async function renderDay(root, date) {
  const today = todayISO();
  const [entry, info, entries] = await Promise.all([getEntry(date), cycleInfo(date), allEntries()]);
  const current = await cycleInfo(today);
  root.replaceChildren(subnav('tag'));

  // Streifen des laufenden Zyklus, sofern ein Periodenbeginn bekannt ist
  const strip = currentCycleStrip(entries, current.starts, today, current.length);
  if (strip.length) {
    const card = el('div', 'card stack-tight');
    card.append(el('p', 'label', 'Aktueller Zyklus'), stripView(strip, date));
    root.append(card);
  } else {
    root.append(el('p', 'hint', 'Trag im Check-in ein, wann deine Periode begonnen hat. Dann siehst du hier deinen Zyklus als Streifen.'));
  }

  // Datum mit Blättern, Zukunft ist gesperrt
  const dateNav = el('div', 'date-nav');
  const prev = el('a', 'icon-button date-step', '‹');
  prev.href = `#/zyklus/${addDays(date, -1)}`;
  prev.setAttribute('aria-label', 'Vorheriger Tag');
  const next = el('a', 'icon-button date-step', '›');
  next.href = addDays(date, 1) >= today ? '#/zyklus' : `#/zyklus/${addDays(date, 1)}`;
  next.setAttribute('aria-label', 'Nächster Tag');
  if (date >= today) next.hidden = true;
  const dateText = el('div', 'date-nav-text');
  dateText.append(el('p', 'label', date === today ? 'Heute' : 'Nachtrag'), el('h2', null, formatDay(date)));
  dateNav.append(prev, dateText, next);
  root.append(dateNav);
  if (info.cycleDay) root.append(el('p', 'secondary cycle-day-line', `Zyklustag ${info.cycleDay}, ${info.phase}`));

  const status = el('p', 'hint save-status');
  let saved = entries.some((item) => item.date === date);
  const updateStatus = () => { status.textContent = saved ? 'Gespeichert. Du kannst jederzeit nachtragen.' : 'Jede Auswahl wird sofort gespeichert.'; };
  updateStatus();
  const save = async () => {
    const promoted = await saveEntry(entry);
    saved = true;
    updateStatus();
    if (promoted.length) toast(`${promoted.map(symptomLabel).join(', ')} ${promoted.length === 1 ? 'steht' : 'stehen'} jetzt in deiner Standardliste`);
  };

  // Blutungsstärke als fünf Pillen
  const bleeding = el('div', 'card');
  const bleedingSet = el('fieldset', 'fieldset');
  bleedingSet.append(el('legend', 'label', 'Blutung'));
  const pills = el('div', 'chips bleeding-pills');
  for (const [value, label] of BLEEDING) {
    const chip = el('label', 'chip chip--rose');
    const input = el('input');
    input.type = 'radio';
    input.name = 'bleeding';
    input.value = value;
    input.checked = entry.bleeding === value;
    input.addEventListener('change', () => { entry.bleeding = value; save(); });
    chip.append(input, el('span', null, label));
    pills.append(chip);
  }
  bleedingSet.append(pills);
  bleeding.append(bleedingSet);

  // Standardliste aus dem Profil, der Rest unter "Mehr"
  const defaults = getProfile().cycleSymptomsDefault;
  const symptoms = el('div', 'card stack-tight symptom-card');
  symptoms.append(el('p', 'label', 'Symptome'), el('p', 'hint', 'Drei Kreise für die Stärke, nochmal antippen hebt sie auf.'));
  const list = el('div', 'symptom-list');
  defaults.forEach((key) => list.append(intensityRow(key, entry, save)));
  const rest = SYMPTOMS.map(([key]) => key).filter((key) => !defaults.includes(key));
  const more = el('div', 'symptom-list');
  rest.forEach((key) => more.append(intensityRow(key, entry, save)));
  // Aufgeklappt, wenn an diesem Tag schon ein Symptom aus der Langliste eingetragen ist
  more.hidden = !entry.symptoms.some((item) => rest.includes(item.key));
  const toggle = el('button', 'button button--small', more.hidden ? 'Mehr' : 'Weniger');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(!more.hidden));
  toggle.addEventListener('click', () => {
    more.hidden = !more.hidden;
    toggle.textContent = more.hidden ? 'Mehr' : 'Weniger';
    toggle.setAttribute('aria-expanded', String(!more.hidden));
  });
  symptoms.append(list, more, toggle);

  // Freitext
  const noteCard = el('label', 'field card');
  const note = el('textarea', 'input textarea');
  note.rows = 3;
  note.placeholder = 'Notiz, optional';
  note.value = entry.note ?? '';
  note.addEventListener('change', () => { entry.note = note.value; save(); });
  noteCard.append(el('span', 'label', 'Notiz'), note);

  root.append(bleeding, symptoms, noteCard, status);
}

/* Muster: Punktreihe je Symptom über die Zyklustage */

function patternRow(row, maxDay, cycles) {
  const days = [...row.days.entries()].sort((a, b) => a[0] - b[0]);
  const dots = el('div', 'pattern-dots');
  dots.style.setProperty('--days', String(maxDay));
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', `${row.label}: ${days.map(([day, count]) => `Tag ${day} in ${count} von ${cycles} Zyklen`).join(', ')}`);
  for (let day = 1; day <= maxDay; day++) {
    const count = row.days.get(day) ?? 0;
    const cell = el('span', count ? 'pattern-dot' : 'pattern-cell');
    // Satter, je öfter das Symptom an diesem Zyklustag auftrat
    if (count) cell.style.setProperty('--share', (0.35 + 0.65 * (count / cycles)).toFixed(2));
    dots.append(cell);
  }
  const wrap = el('div', 'pattern-row');
  wrap.append(el('span', 'symptom-label', row.label), dots);
  return wrap;
}

async function renderPattern(root) {
  const today = todayISO();
  const [entries, starts] = await Promise.all([allEntries(), periodStarts()]);
  const pattern = symptomPattern(entries, starts, today, 3);
  root.replaceChildren(subnav('muster'));
  if (!pattern.cycles) {
    root.append(el('p', 'hint', 'Für Muster braucht die App mindestens einen Periodenbeginn aus dem Check-in.'));
    return;
  }
  const card = el('div', 'card stack-tight');
  card.append(
    el('p', 'label', pattern.cycles === 1 ? 'Aktueller Zyklus' : `Letzte ${pattern.cycles} Zyklen`),
    el('p', 'hint', 'Je Symptom die Zyklustage, an denen es auftrat. Satter heißt in mehr Zyklen.'),
  );
  if (!pattern.rows.length) {
    card.append(el('p', 'secondary', 'In diesen Zyklen sind noch keine Symptome eingetragen.'));
  } else {
    pattern.rows.forEach((row) => card.append(patternRow(row, pattern.maxDay, pattern.cycles)));
    const axis = el('div', 'pattern-axis');
    axis.append(el('span', null, 'Tag 1'), el('span', null, `Tag ${pattern.maxDay}`));
    card.append(axis);
  }
  root.append(card);
}

/* Einstieg aus dem Router */

export async function render(root) {
  const [, sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const view = el('section', 'stack cycle');
  root.replaceChildren(view);
  if (!getProfile().cycleTracking) {
    const link = el('a', 'button', 'Profil bearbeiten');
    link.href = '#/profil';
    view.append(el('p', 'secondary', 'Zyklus-Tracking ist aus. Du kannst es im Profil einschalten.'), link);
    return;
  }
  if (sub === 'muster') return renderPattern(view);
  const today = todayISO();
  return renderDay(view, DATE_PATTERN.test(sub) && sub <= today ? sub : today);
}
