/*
  Check-in: ein Eintrag pro Tag, nachträglich editierbar (#/checkin, #/checkin/YYYY-MM-DD),
  und Auswertung (#/checkin/auswertung).
  Welche Slider, ob Schmerzseite und ob Zyklus: alles aus dem Profil.
  Jede Änderung wird sofort gespeichert, die Statuszeile bestätigt es sichtbar.
*/

import { getProfile } from '../profile.js';
import { SLIDER_META, activeSliders, getCheckin, emptyCheckin, saveCheckin, allCheckins, cycleDayFor, phaseFor, auraBlobs } from '../checkin-core.js';
import { setAura } from '../aura.js';
import { todayISO, toast, el } from '../ui.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* Hilfen */

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDay(iso, withWeekday = true) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { ...(withWeekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

const formatAverage = (value) => (value === null ? 'keine Daten' : value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function average(values) {
  const list = values.filter(Number.isInteger);
  return list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null;
}

function subnav(active) {
  const nav = el('nav', 'segmented segmented--links');
  nav.setAttribute('aria-label', 'Check-in');
  for (const [id, label, href] of [['tag', 'Tag', '#/checkin'], ['auswertung', 'Auswertung', '#/checkin/auswertung']]) {
    const link = el('a', 'segment', label);
    link.href = href;
    if (id === active) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

function switchRow(label, checked, onChange) {
  const row = el('label', 'switch-row');
  const input = el('input', 'switch');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(el('span', null, label), input);
  return row;
}

/* Tag */

async function renderDay(root, date) {
  const profile = getProfile();
  const sliders = activeSliders(profile);
  const today = todayISO();
  const checkin = (await getCheckin(date)) ?? emptyCheckin(date);
  let saved = Boolean(await getCheckin(date));

  root.replaceChildren(subnav('tag'));

  // Datum mit Blättern, Zukunft ist gesperrt
  const dateNav = el('div', 'date-nav');
  const prev = el('a', 'icon-button date-step', '‹');
  prev.href = `#/checkin/${addDays(date, -1)}`;
  prev.setAttribute('aria-label', 'Vorheriger Tag');
  const next = el('a', 'icon-button date-step', '›');
  next.href = addDays(date, 1) >= today ? '#/checkin' : `#/checkin/${addDays(date, 1)}`;
  next.setAttribute('aria-label', 'Nächster Tag');
  if (date >= today) next.hidden = true;
  const dateText = el('div', 'date-nav-text');
  dateText.append(el('p', 'label', date === today ? 'Heute' : 'Nachtrag'), el('h2', null, formatDay(date)));
  dateNav.append(prev, dateText, next);
  root.append(dateNav);

  // Tagesfläche wächst mit jedem gewählten Wert
  // Die Aura baut sich mit jedem gewählten Wert dezent auf
  setAura(auraBlobs(checkin, sliders, { subtle: true }));

  const status = el('p', 'hint save-status');
  const updateStatus = () => { status.textContent = saved ? 'Gespeichert. Du kannst jederzeit nachtragen.' : 'Noch nicht gespeichert. Jede Auswahl wird sofort gesichert.'; };
  updateStatus();

  const persist = async (message) => {
    await saveCheckin(checkin);
    saved = true;
    updateStatus();
    setAura(auraBlobs(checkin, sliders, { subtle: true }), { animate: false });
    if (message) toast(message);
  };

  // Slider als fünf Tap-Felder
  for (const key of sliders) {
    const meta = SLIDER_META[key];
    const card = el('div', `card slider-card slider-card--${meta.tone} tone-${meta.tone}`);
    const head = el('div', 'slider-head');
    const valueText = el('span', 'card-number');
    head.append(el('h2', null, meta.label), valueText);
    const scale = el('div', 'tap-scale');
    scale.setAttribute('role', 'radiogroup');
    scale.setAttribute('aria-label', meta.label);
    const buttons = [];
    const show = () => {
      const value = checkin[key];
      valueText.textContent = Number.isInteger(value) ? String(value) : '';
      buttons.forEach((button, index) => {
        const on = Number.isInteger(value) && index + 1 <= value;
        button.classList.toggle('tap--on', on);
        button.setAttribute('aria-checked', String(index + 1 === value));
      });
    };
    for (let value = 1; value <= 5; value++) {
      const button = el('button', 'tap', String(value));
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.style.setProperty('--level', String(value / 5));
      button.addEventListener('click', () => {
        checkin[key] = checkin[key] === value ? null : value;
        show();
        persist();
      });
      buttons.push(button);
      scale.append(button);
    }
    const ends = el('div', 'tap-ends');
    ends.append(el('span', 'hint', meta.low), el('span', 'hint', meta.high));
    card.append(head, scale, ends);

    // Schmerzseite nur, wenn im Profil aktiviert
    if (key === 'pain' && profile.checkin.painSideToggle.enabled) {
      card.append(switchRow(profile.checkin.painSideToggle.label || 'Seite', Boolean(checkin.painLeftSide), (value) => { checkin.painLeftSide = value; persist(); }));
    }
    show();
    root.append(card);
  }

  // Zyklus nur mit cycleTracking, sonst gar nicht sichtbar
  if (profile.cycleTracking) {
    const all = await allCheckins();
    let cycleDay = await cycleDayFor(date, all);
    const card = el('div', 'card cycle-card tone-rose');
    const line = el('div', 'day-line');
    const number = el('span', 'number');
    const suffix = el('span', 'month');
    line.append(number, suffix);
    const showCycle = () => {
      number.textContent = cycleDay ? String(cycleDay) : '';
      suffix.textContent = cycleDay ? '' : 'Noch unbekannt';
    };
    showCycle();

    const stepper = el('div', 'button-row');
    const minus = el('button', 'button', 'Tag weniger');
    const plus = el('button', 'button', 'Tag mehr');
    minus.type = plus.type = 'button';
    const setDay = (value) => {
      cycleDay = Math.max(1, value);
      checkin.cycleDay = cycleDay;
      showCycle();
      persist();
    };
    minus.addEventListener('click', () => setDay((cycleDay ?? 2) - 1));
    plus.addEventListener('click', () => setDay((cycleDay ?? 0) + 1));
    stepper.append(minus, plus);

    const period = el('button', 'button button--primary', date === today ? 'Periode heute begonnen' : 'Periode an diesem Tag begonnen');
    period.type = 'button';
    period.addEventListener('click', async () => {
      checkin.periodStart = true;
      checkin.cycleDay = 1;
      cycleDay = 1;
      showCycle();
      await persist('Periodenbeginn gespeichert');
      const db = await import('../db.js');
      const current = await db.getSetting('cycleStartDate');
      if (!current || current < date) await db.setSetting('cycleStartDate', date);
    });

    card.append(el('p', 'label', 'Zyklustag'), line, stepper, period);
    if (checkin.periodStart) card.append(el('p', 'hint', 'An diesem Tag hat die Periode begonnen.'));
    root.append(card);
  }

  // Training und Notiz
  const extra = el('div', 'card stack-tight');
  extra.append(switchRow(date === today ? 'Heute trainiert' : 'An diesem Tag trainiert', Boolean(checkin.trainedToday), (value) => { checkin.trainedToday = value; persist(); }));
  const note = el('textarea', 'input textarea');
  note.rows = 3;
  note.placeholder = 'Notiz, optional';
  note.value = checkin.note ?? '';
  let noteTimer;
  note.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { checkin.note = note.value.trim(); persist(); }, 500);
  });
  extra.append(note);
  root.append(extra, status);
}

/* Auswertung */

const LINE_CLASS = { energy: 'line--mandarine', sleep: 'line--periwinkle', digestion: 'line--salbei', pain: 'line--koralle', mood: 'line--rose' };

function trendChart(days, series, markers) {
  const width = 320;
  const height = 150;
  const top = 12;
  const bottom = 18;
  const n = days.length;
  const sx = (i) => (n <= 1 ? width / 2 : 4 + (i / (n - 1)) * (width - 8));
  const sy = (v) => top + ((5 - v) / 4) * (height - top - bottom);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart trend-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Verlauf der Check-in-Werte');
  let markup = '';
  // Marker: Training als kurze Striche unten, Periode als Punkte oben
  days.forEach((day, i) => {
    if (markers.training.has(day)) markup += `<line class="marker marker--training" x1="${sx(i).toFixed(1)}" x2="${sx(i).toFixed(1)}" y1="${height - 10}" y2="${height - 2}"/>`;
    if (markers.period.has(day)) markup += `<circle class="marker marker--period" cx="${sx(i).toFixed(1)}" cy="4" r="3"/>`;
  });
  for (const [key, values] of Object.entries(series)) {
    // Lücken ohne Wert unterbrechen die Linie
    let d = '';
    let open = false;
    values.forEach((value, i) => {
      if (!Number.isInteger(value)) { open = false; return; }
      d += `${open ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(value).toFixed(1)}`;
      open = true;
    });
    if (d) markup += `<path class="chart-line trend-line ${LINE_CLASS[key]}" d="${d}"/>`;
  }
  svg.innerHTML = markup;
  return svg;
}

async function renderAnalysis(root) {
  const profile = getProfile();
  const sliders = activeSliders(profile);
  const today = todayISO();
  const checkins = await allCheckins();
  const byDate = new Map(checkins.map((c) => [c.date, c]));
  root.replaceChildren(subnav('auswertung'));

  let weeks = 4;
  const range = el('div', 'segmented');
  range.setAttribute('role', 'radiogroup');
  range.setAttribute('aria-label', 'Zeitraum');
  for (const value of [4, 12]) {
    const option = el('label', 'segment');
    const input = el('input');
    input.type = 'radio';
    input.name = 'range';
    input.checked = value === weeks;
    input.addEventListener('change', () => { weeks = value; update(); });
    option.append(input, el('span', null, `${value} Wochen`));
    range.append(option);
  }
  const chartCard = el('div', 'card chart-card');
  const calendarCard = el('div', 'card');
  const stats = el('div', 'stack-tight');
  root.append(range, chartCard, calendarCard, stats);

  const update = async () => {
    const days = [];
    for (let i = weeks * 7 - 1; i >= 0; i--) days.push(addDays(today, -i));
    const series = Object.fromEntries(sliders.map((key) => [key, days.map((day) => byDate.get(day)?.[key] ?? null)]));
    const cycleDays = new Map();
    if (profile.cycleTracking) {
      for (const day of days) cycleDays.set(day, await cycleDayFor(day, checkins));
    }
    const periodPhase = profile.checkin.cyclePhases[0];
    const markers = {
      training: new Set(days.filter((day) => byDate.get(day)?.trainedToday)),
      period: new Set(profile.cycleTracking ? days.filter((day) => byDate.get(day)?.periodStart || phaseFor(cycleDays.get(day), [periodPhase])) : []),
    };

    chartCard.replaceChildren(el('p', 'label', 'Verlauf'));
    const withData = days.filter((day) => sliders.some((key) => Number.isInteger(byDate.get(day)?.[key])));
    if (!withData.length) {
      chartCard.append(el('p', 'secondary', 'In diesem Zeitraum gibt es noch keine Check-ins.'));
    } else {
      chartCard.append(trendChart(days, series, markers));
      const axis = el('div', 'chart-axis');
      axis.append(el('span', null, formatShort(days[0])), el('span', null, formatShort(days.at(-1))));
      const legend = el('div', 'chart-legend chart-legend--wrap');
      sliders.forEach((key) => legend.append(el('span', `legend legend--${SLIDER_META[key].tone}`, SLIDER_META[key].label)));
      legend.append(el('span', 'legend legend--training', 'Training'));
      if (profile.cycleTracking) legend.append(el('span', 'legend legend--period', 'Periode'));
      chartCard.append(axis, legend, el('p', 'hint', `${withData.length} von ${days.length} Tagen mit Check-in.`));
    }

    // Kalenderpunkte: eine Zeile pro Woche, Montag zuerst
    calendarCard.replaceChildren(el('p', 'label', 'Kalender'));
    const head = el('div', 'dot-calendar-head');
    ['M', 'D', 'M', 'D', 'F', 'S', 'S'].forEach((letter) => head.append(el('span', null, letter)));
    const grid = el('div', 'dot-calendar');
    const [y, m, d] = days[0].split('-').map(Number);
    const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(el('span', 'cal-dot cal-dot--empty'));
    for (const day of days) {
      const kind = markers.period.has(day) ? ' cal-dot--period' : markers.training.has(day) ? ' cal-dot--training' : '';
      const dot = el('span', `cal-dot${kind}`);
      dot.title = `${formatShort(day)}${markers.training.has(day) ? ', Training' : ''}${markers.period.has(day) ? ', Periode' : ''}`;
      grid.append(dot);
    }
    const calLegend = el('div', 'chart-legend chart-legend--wrap');
    calLegend.append(el('span', 'legend legend--cal-training', 'Training'));
    if (profile.cycleTracking) calLegend.append(el('span', 'legend legend--cal-period', 'Periode'));
    calLegend.append(el('span', 'legend legend--cal-none', 'ohne'));
    calendarCard.append(head, grid, calLegend);

    // Kennzahlen, nur Zahlen
    stats.replaceChildren(el('h2', null, 'Kennzahlen'));
    const inRange = days.map((day) => byDate.get(day)).filter(Boolean);
    if (sliders.includes('pain')) {
      const trained = inRange.filter((c) => c.trainedToday).map((c) => c.pain);
      const rest = inRange.filter((c) => !c.trainedToday).map((c) => c.pain);
      const card = el('div', 'card stat-card tone-koralle');
      card.append(el('p', 'label', 'Schmerz im Durchschnitt'));
      const grid = el('div', 'stat-grid');
      for (const [label, values] of [['Trainingstage', trained], ['Ohne Training', rest]]) {
        const cell = el('div', 'stat-cell');
        cell.append(el('span', 'card-number', formatAverage(average(values))), el('span', 'secondary', `${label}, ${values.filter(Number.isInteger).length} Tage`));
        grid.append(cell);
      }
      card.append(grid);
      stats.append(card);
    }
    if (profile.cycleTracking && sliders.includes('digestion')) {
      const card = el('div', 'card stat-card tone-salbei');
      card.append(el('p', 'label', 'Verdauung im Durchschnitt nach Zyklusphase'));
      const list = el('div', 'stat-list');
      for (const phase of profile.checkin.cyclePhases) {
        const values = inRange.filter((c) => phaseFor(cycleDays.get(c.date), [phase])).map((c) => c.digestion);
        const row = el('div', 'stat-row');
        const text = el('div', 'med-body');
        text.append(el('span', 'med-name', phase.name), el('span', 'secondary', `Tag ${phase.from}${phase.to ? ` bis ${phase.to}` : ' und später'}, ${values.filter(Number.isInteger).length} Tage`));
        row.append(text, el('span', 'card-number', formatAverage(average(values))));
        list.append(row);
      }
      card.append(list);
      stats.append(card);
    }
    if (stats.children.length === 1) stats.append(el('p', 'secondary', 'Für Kennzahlen fehlen passende Slider im Profil.'));
  };
  update();
}

/* Einstieg aus dem Router */

export async function render(root) {
  const [, sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const view = el('section', 'stack checkin');
  root.replaceChildren(view);
  if (sub === 'auswertung') return renderAnalysis(view);
  const date = DATE_PATTERN.test(sub) && sub <= todayISO() ? sub : todayISO();
  return renderDay(view, date);
}
