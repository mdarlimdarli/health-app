/*
  Medis: Tag (#/medis, #/medis/YYYY-MM-DD zum Nachtragen), Übersicht (#/medis/uebersicht), Verwaltung (#/medis/verwalten),
  Formular (#/medis/neu, #/medis/bearbeiten/<id>).
  Keine Medikamente im Code: alle Einträge kommen aus dem Store meds.
*/

import * as db from '../db.js';
import * as S from '../meds-schedule.js';
import { loadMeds, loadLogs, setTaken, saveMeasurement, saveMed, removeMed, nowMinutes, slotTimes } from '../meds-store.js';
import { toast, confirmDialog, todayISO, el } from '../ui.js';
import { weekBar } from '../week-bar.js';

const TABS = [['', 'Heute'], ['uebersicht', 'Übersicht'], ['verwalten', 'Verwalten']];

/* Hilfen */

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatTime(isoDateTime) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(isoDateTime));
}

function svgIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'eintrag';
}

function subnav(active) {
  const nav = el('nav', 'segmented segmented--links');
  nav.setAttribute('aria-label', 'Medis');
  for (const [id, label] of TABS) {
    const link = el('a', 'segment', label);
    link.href = id ? `#/medis/${id}` : '#/medis';
    if (id === active) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

function measurementText(values) {
  if (!values) return '';
  return `${values.systolic}/${values.diastolic}${values.pulse ? `, Puls ${values.pulse}` : ''}`;
}

/* Heute */

async function renderToday(root, date = todayISO()) {
  const today = todayISO();
  // Zukunft nur ansehen, abhaken erst am Tag selbst
  const readOnly = date > today;
  const [meds, { logs, firstLogDates }] = await Promise.all([loadMeds(), loadLogs()]);
  const plan = S.dayPlan(meds, logs, date, firstLogDates);
  const times = slotTimes();

  root.replaceChildren(subnav(''));
  const head = el('div', 'meds-head hero');
  const counter = el('div', 'day-line');
  const doneEl = el('span', 'number');
  const totalEl = el('span', 'month');
  counter.append(doneEl, totalEl);
  head.append(el('p', 'label on-aura', date === today ? `Heute, ${formatDay(date)}` : formatDay(date)), counter, el('p', 'on-aura', readOnly ? 'geplant' : 'erledigt'));
  root.append(head, weekBar({ date, today, tone: 'butter', href: (day) => (day === today ? '#/medis' : `#/medis/${day}`), label: 'Tag wählen' }));

  const items = plan.flatMap((slot) => slot.items).filter((item) => item.state !== 'spaeter');
  const updateCounter = () => {
    const done = items.filter((item) => item.state === 'erledigt').length;
    doneEl.textContent = String(done);
    totalEl.textContent = `von ${items.length}`;
  };
  updateCounter();

  if (!plan.length) {
    const empty = el('div', 'card stack-tight');
    empty.append(el('p', null, meds.length ? 'An diesem Tag steht nichts an.' : 'Noch keine Einträge.'));
    const add = el('a', 'button', 'Eintrag anlegen');
    add.href = '#/medis/neu';
    empty.append(add);
    root.append(empty);
    return;
  }

  for (const slot of plan) {
    const section = el('section', 'slot');
    const title = el('h2', 'slot-title');
    title.append(el('span', null, slot.label), el('span', 'secondary', `ab ${S.slotTime(slot.id, times)}`));
    const list = el('div', 'card med-list');
    for (const item of slot.items) list.append(item.state === 'spaeter' ? laterRow(item) : S.isMeasurement(item.med) ? measureRow(item, date, updateCounter, readOnly) : medRow(item, date, updateCounter, readOnly));
    section.append(title, list);
    root.append(section);
  }
}

function rowBase(item) {
  const row = el('div', `med-row${item.med.critical ? ' med-row--critical' : ''}`);
  const body = el('div', 'med-body');
  const name = el('span', 'med-name', item.med.name);
  if (item.med.critical) {
    const tag = el('span', 'med-tag', 'Wichtig');
    name.append(' ', tag);
  }
  const meta = el('span', 'secondary');
  body.append(name, meta);
  return { row, body, meta };
}

function laterRow(item) {
  const { row, body, meta } = rowBase(item);
  row.classList.add('med-row--later');
  meta.textContent = `${item.med.dosage ? `${item.med.dosage}, ` : ''}startet am ${formatDay(item.med.schedule.startDate)}`;
  const check = el('span', 'med-check med-check--disabled');
  check.setAttribute('aria-hidden', 'true');
  row.append(check, body);
  return row;
}

function medRow(item, today, onChange, readOnly = false) {
  const { row, body, meta } = rowBase(item);
  const check = el('button', 'med-check');
  check.type = 'button';
  check.disabled = readOnly;
  check.append(svgIcon(ICON_CHECK));
  const show = () => {
    const done = item.state === 'erledigt';
    row.classList.toggle('med-row--done', done);
    check.setAttribute('aria-pressed', String(done));
    check.setAttribute('aria-label', `${item.med.name} ${done ? 'nicht genommen' : 'genommen'}`);
    const parts = [item.med.dosage, done && item.log?.takenAt ? `genommen ${formatTime(item.log.takenAt)}` : ''].filter(Boolean);
    meta.textContent = parts.join(', ');
  };
  check.addEventListener('click', async () => {
    const done = item.state !== 'erledigt';
    item.log = await setTaken(item.med, item.slot, today, done);
    item.state = done ? 'erledigt' : 'offen';
    show();
    onChange();
    if (done) toast(`${item.med.name} abgehakt`);
  });
  show();
  row.append(check, body);
  return row;
}

function measureRow(item, today, onChange, readOnly = false) {
  const { row, body, meta } = rowBase(item);
  row.classList.add('med-row--measure');
  const form = el('form', 'measure-form');
  const field = (name, label) => {
    const wrap = el('label', 'measure-field');
    const input = el('input', 'input');
    input.name = name;
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.maxLength = 3;
    input.autocomplete = 'off';
    wrap.append(el('span', 'label', label), input);
    return { wrap, input };
  };
  const sys = field('systolic', 'Sys');
  const dia = field('diastolic', 'Dia');
  const pulse = field('pulse', 'Puls');
  const save = el('button', 'button button--primary', 'Speichern');
  save.type = 'submit';
  form.append(sys.wrap, dia.wrap, pulse.wrap, save);
  if (readOnly) form.querySelectorAll('input, button').forEach((node) => { node.disabled = true; });

  const show = () => {
    const values = item.log?.values;
    row.classList.toggle('med-row--done', Boolean(values));
    meta.textContent = values ? `${measurementText(values)}, gemessen ${formatTime(item.log.takenAt)}` : 'Systolisch, diastolisch, Puls optional';
    if (values) {
      sys.input.value = values.systolic;
      dia.input.value = values.diastolic;
      pulse.input.value = values.pulse ?? '';
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const s = Number(sys.input.value);
    const d = Number(dia.input.value);
    const p = pulse.input.value ? Number(pulse.input.value) : null;
    if (!(s >= 60 && s <= 260) || !(d >= 30 && d <= 160) || s <= d) {
      toast('Bitte prüf die Werte: systolisch 60 bis 260, diastolisch 30 bis 160.', { error: true });
      return;
    }
    if (p !== null && !(p >= 30 && p <= 220)) {
      toast('Der Puls sieht nicht richtig aus.', { error: true });
      return;
    }
    item.log = await saveMeasurement(item.med, item.slot, today, { systolic: s, diastolic: d, pulse: p });
    item.state = 'erledigt';
    show();
    onChange();
    toast('Messung gespeichert');
  });

  show();
  body.append(form);
  row.append(body);
  return row;
}

/* Übersicht */

function measurementChart(points) {
  const width = 300;
  const height = 130;
  const pad = 8;
  const values = points.flatMap((p) => [p.systolic, p.diastolic]);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const xs = points.map((p) => p.t);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const sx = (t) => (maxX === minX ? width / 2 : pad + ((t - minX) / (maxX - minX)) * (width - 2 * pad));
  const sy = (v) => height - pad - ((v - min) / (max - min)) * (height - 2 * pad);
  const path = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)} ${sy(p[key]).toFixed(1)}`).join('');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Verlauf systolisch und diastolisch');
  svg.innerHTML = `<path class="chart-line chart-line--sys" d="${path('systolic')}"/><path class="chart-line chart-line--dia" d="${path('diastolic')}"/>`;
  return svg;
}

async function renderOverview(root) {
  const today = todayISO();
  const [meds, { logs, firstLogDates, list }] = await Promise.all([loadMeds(), loadLogs()]);
  const minutes = nowMinutes();
  const times = slotTimes();
  root.replaceChildren(subnav('uebersicht'));

  // Streaks für wichtige Einträge, satter mit längerem Streak
  const critical = meds.filter((med) => med.critical && med.active !== false);
  const streaks = el('section', 'stack-tight');
  streaks.append(el('h2', null, 'Streaks'));
  if (!critical.length) streaks.append(el('p', 'secondary', 'Markiere wichtige Einträge in der Verwaltung, dann siehst du hier ihren Streak.'));
  for (const med of critical) {
    const value = S.streak(med, logs, today, firstLogDates.get(med.id));
    const card = el('div', 'card streak-card');
    const blob = el('div', 'blob blob--butter');
    blob.style.setProperty('--intensity', String(Math.min(1, 0.2 + value / 30)));
    const line = el('div', 'day-line');
    line.append(el('span', 'number', String(value)), el('span', 'month', value === 1 ? 'Tag in Folge' : 'Tage in Folge'));
    card.append(blob, el('p', 'label', med.name), line);
    streaks.append(card);
  }
  root.append(streaks);

  // Adhärenz der letzten 30 Tage
  const active = meds.filter((med) => med.active !== false);
  const adherence = el('section', 'stack-tight');
  adherence.append(el('h2', null, 'Einnahme, letzte 30 Tage'));
  const card = el('div', 'card adherence-list');
  for (const med of active) {
    const result = S.adherence(med, logs, today, { days: 30, firstLogDate: firstLogDates.get(med.id), nowMinutes: minutes, slotTimes: times });
    const row = el('div', 'adherence-row');
    const text = el('div', 'med-body');
    text.append(el('span', 'med-name', med.name), el('span', 'secondary', result.due ? `${result.done} von ${result.due}` : 'Noch nicht fällig gewesen'));
    row.append(text, el('span', 'card-number', result.percent === null ? '' : `${result.percent} %`));
    card.append(row);
  }
  if (!active.length) card.append(el('p', 'secondary', 'Keine aktiven Einträge.'));
  adherence.append(card);
  root.append(adherence);

  // Messwerte als zwei dünne Linien
  const measurements = meds.filter(S.isMeasurement);
  if (measurements.length) {
    const section = el('section', 'stack-tight');
    section.append(el('h2', null, 'Messwerte, letzte 90 Tage'));
    const from = S.addDays(today, -89);
    for (const med of measurements) {
      const points = list
        .filter((log) => log.medId === med.id && log.values && log.date >= from)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((log) => ({ t: Date.parse(`${log.date}T12:00:00Z`), date: log.date, ...log.values }));
      const chartCard = el('div', 'card chart-card');
      chartCard.append(el('p', 'label', med.name));
      if (!points.length) {
        chartCard.append(el('p', 'secondary', 'Noch keine Messung.'));
      } else {
        const last = points.at(-1);
        const line = el('div', 'day-line');
        line.append(el('span', 'number', `${last.systolic}/${last.diastolic}`), el('span', 'month', last.pulse ? `Puls ${last.pulse}` : ''));
        const legend = el('div', 'chart-legend');
        legend.append(el('span', 'legend legend--sys', 'systolisch'), el('span', 'legend legend--dia', 'diastolisch'));
        const axis = el('div', 'chart-axis');
        axis.append(el('span', null, formatShort(points[0].date)), el('span', null, formatShort(last.date)));
        chartCard.append(line, measurementChart(points), axis, legend);
      }
      section.append(chartCard);
    }
    root.append(section);
  }
}

/* Verwaltung */

async function renderManage(root) {
  const meds = await loadMeds();
  root.replaceChildren(subnav('verwalten'));
  const add = el('a', 'button button--primary button--large', 'Neuer Eintrag');
  add.href = '#/medis/neu';
  root.append(add);

  if (!meds.length) root.append(el('p', 'secondary', 'Noch keine Einträge. Lege deinen ersten an oder importiere ein Profil in den Einstellungen.'));

  for (const med of meds) {
    const card = el('div', `card manage-card${med.active === false ? ' manage-card--paused' : ''}`);
    const name = el('h2', null, med.name);
    if (med.critical) name.append(' ', el('span', 'med-tag', 'Wichtig'));
    const lines = [
      `${S.isMeasurement(med) ? 'Messung' : med.dosage || 'Medikament'}`,
      S.describeSchedule(med),
      [med.schedule?.startDate ? `ab ${formatDay(med.schedule.startDate)}` : '', med.schedule?.endDate ? `bis ${formatDay(med.schedule.endDate)}` : ''].filter(Boolean).join(' '),
      med.active === false ? 'Pausiert' : '',
      med.notes,
    ].filter(Boolean);
    card.append(name);
    lines.forEach((line) => card.append(el('p', 'secondary', line)));
    const actions = el('div', 'button-row');
    const edit = el('a', 'button', 'Bearbeiten');
    edit.href = `#/medis/bearbeiten/${encodeURIComponent(med.id)}`;
    const pause = el('button', 'button', med.active === false ? 'Fortsetzen' : 'Pausieren');
    pause.type = 'button';
    pause.addEventListener('click', async () => {
      await saveMed({ ...med, active: med.active === false });
      toast(med.active === false ? `${med.name} läuft wieder` : `${med.name} pausiert`);
      renderManage(root);
    });
    actions.append(edit, pause);
    card.append(actions);
    root.append(card);
  }
}

/* Formular */

function chipGroup(name, options, selected, type = 'checkbox') {
  const wrap = el('div', 'chips');
  for (const [value, label] of options) {
    const chip = el('label', 'chip chip--butter');
    const input = el('input');
    input.type = type;
    input.name = name;
    input.value = String(value);
    input.checked = selected.map(String).includes(String(value));
    chip.append(input, el('span', null, label));
    wrap.append(chip);
  }
  return wrap;
}

async function renderForm(root, id) {
  const existing = id ? await db.get('meds', id) : null;
  if (id && !existing) {
    location.hash = '#/medis/verwalten';
    return;
  }
  const med = existing ?? { name: '', dosage: '', type: 'medication', critical: false, active: true, notes: '', schedule: { type: 'daily', slots: ['morgen'], startDate: todayISO(), endDate: null } };
  const schedule = med.schedule ?? {};

  root.replaceChildren(subnav('verwalten'));
  const form = el('form', 'stack med-form');
  form.noValidate = true;
  form.append(el('h2', null, existing ? 'Eintrag bearbeiten' : 'Neuer Eintrag'));

  const field = (label, input) => {
    const wrap = el('label', 'field');
    wrap.append(el('span', 'label', label), input);
    return wrap;
  };
  const input = (name, value, type = 'text') => {
    const node = el('input', 'input');
    node.name = name;
    node.type = type;
    node.value = value ?? '';
    return node;
  };

  const kind = el('div', 'segmented');
  kind.setAttribute('role', 'radiogroup');
  for (const [value, label] of [['medication', 'Medikament'], ['measurement', 'Messung']]) {
    const option = el('label', 'segment');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'type';
    radio.value = value;
    radio.checked = (med.type ?? 'medication') === value;
    option.append(radio, el('span', null, label));
    kind.append(option);
  }

  const name = input('name', med.name);
  name.required = true;
  const dosage = input('dosage', med.dosage);
  dosage.placeholder = 'z. B. 1 Tablette';
  const dosageField = field('Menge', dosage);

  const critical = el('label', 'switch-row');
  const criticalInput = el('input', 'switch');
  criticalInput.type = 'checkbox';
  criticalInput.name = 'critical';
  criticalInput.checked = Boolean(med.critical);
  critical.append(el('span', null, 'Wichtig, steht auf der Startseite immer oben'), criticalInput);

  const typeSelect = el('select', 'input');
  typeSelect.name = 'scheduleType';
  S.SCHEDULE_TYPES.forEach(([value, label]) => typeSelect.append(new Option(label, value)));
  typeSelect.value = schedule.type ?? 'daily';

  const n = input('n', schedule.n ?? 2, 'number');
  n.min = '2';
  n.max = '60';
  n.inputMode = 'numeric';
  const nField = field('Alle wie viele Tage', n);

  const weekday = el('select', 'input');
  weekday.name = 'weekday';
  S.WEEKDAYS.forEach((label, index) => weekday.append(new Option(label, String(index + 1))));
  weekday.value = String(schedule.weekday ?? 1);
  const weekdayField = field('Wochentag', weekday);

  const monthsField = el('fieldset', 'fieldset');
  monthsField.append(el('legend', 'label', 'Monate'), chipGroup('months', S.MONTHS.map((label, index) => [index + 1, label]), schedule.months ?? []));

  const slotsField = el('fieldset', 'fieldset');
  slotsField.append(el('legend', 'label', 'Zeitpunkte'), chipGroup('slots', S.SLOTS.map((slot) => [slot.id, slot.label]), schedule.slots ?? ['morgen']));

  const start = input('startDate', schedule.startDate ?? '', 'date');
  const end = input('endDate', schedule.endDate ?? '', 'date');
  const dates = el('div', 'date-row');
  dates.append(field('Start', start), field('Ende, optional', end));
  const datesHint = el('p', 'hint', 'Ohne Ende läuft der Eintrag mit seinen Erinnerungen weiter, bis du ihn pausierst oder löschst.');

  const notes = el('textarea', 'input textarea');
  notes.name = 'notes';
  notes.rows = 2;
  notes.value = med.notes ?? '';

  const active = el('label', 'switch-row');
  const activeInput = el('input', 'switch');
  activeInput.type = 'checkbox';
  activeInput.name = 'active';
  activeInput.checked = med.active !== false;
  active.append(el('span', null, 'Aktiv, ausschalten zum Pausieren'), activeInput);

  const save = el('button', 'button button--primary button--large', 'Speichern');
  save.type = 'submit';
  const cancel = el('a', 'button', 'Abbrechen');
  cancel.href = '#/medis/verwalten';

  form.append(field('Name', name), kind, dosageField, critical, field('Rhythmus', typeSelect), nField, weekdayField, monthsField, slotsField, dates, datesHint, field('Notiz, optional', notes), active, save, cancel);

  if (existing) {
    const remove = el('button', 'button button--danger', 'Eintrag löschen');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: `${existing.name} löschen?`, text: 'Der Eintrag verschwindet. Bisherige Einnahmen bleiben gespeichert. Zum vorübergehenden Aussetzen reicht Pausieren.', confirmLabel: 'Löschen', danger: true });
      if (!ok) return;
      await removeMed(existing.id);
      toast('Eintrag gelöscht');
      location.hash = '#/medis/verwalten';
    });
    form.append(remove);
  }

  // Felder je nach Rhythmus und Art ein- und ausblenden
  const sync = () => {
    const type = typeSelect.value;
    nField.hidden = type !== 'everyNDays';
    weekdayField.hidden = type !== 'weekly';
    monthsField.hidden = type !== 'seasonal';
    dosageField.hidden = form.querySelector('input[name="type"]:checked').value === 'measurement';
  };
  typeSelect.addEventListener('change', sync);
  kind.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const title = name.value.trim();
    const slots = values.getAll('slots');
    const type = typeSelect.value;
    const months = values.getAll('months').map(Number);
    if (!title) return toast('Bitte gib einen Namen ein.', { error: true });
    if (!slots.length) return toast('Wähle mindestens einen Zeitpunkt.', { error: true });
    if (type === 'seasonal' && !months.length) return toast('Wähle mindestens einen Monat.', { error: true });
    if (end.value && start.value && end.value < start.value) return toast('Das Ende liegt vor dem Start.', { error: true });

    const nextSchedule = { type, slots, startDate: start.value || null, endDate: end.value || null };
    if (type === 'everyNDays') nextSchedule.n = Math.max(2, Math.round(Number(n.value) || 2));
    if (type === 'weekly') nextSchedule.weekday = Number(weekday.value);
    if (type === 'seasonal') nextSchedule.months = months;

    let medId = existing?.id;
    if (!medId) {
      const taken = new Set((await loadMeds()).map((m) => m.id));
      const base = slugify(title);
      medId = base;
      for (let i = 2; taken.has(medId); i++) medId = `${base}-${i}`;
    }
    const kindValue = form.querySelector('input[name="type"]:checked').value;
    await saveMed({
      ...(existing ?? {}),
      id: medId,
      name: title,
      dosage: kindValue === 'measurement' ? '' : dosage.value.trim(),
      type: kindValue,
      critical: criticalInput.checked,
      active: activeInput.checked,
      notes: notes.value.trim(),
      schedule: nextSchedule,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    toast(existing ? 'Gespeichert' : 'Eintrag angelegt');
    location.hash = '#/medis/verwalten';
  });

  root.append(form);
}

/* Einstieg aus dem Router */

export async function render(root) {
  const [, sub = '', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const view = el('section', 'stack meds');
  root.replaceChildren(view);
  if (sub === 'uebersicht') return renderOverview(view);
  if (sub === 'verwalten') return renderManage(view);
  if (sub === 'neu') return renderForm(view, null);
  if (sub === 'bearbeiten') return renderForm(view, decodeURIComponent(param));
  return renderToday(view, /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : todayISO());
}
