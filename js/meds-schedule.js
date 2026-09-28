/*
  Zeitplan-Regeln für Medikamente und Messungen. Rein funktional, ohne Speicher.
  Keine Medikamente im Code: alles kommt aus den Einträgen im Store meds.
  Datumswerte sind immer lokale Kalendertage als YYYY-MM-DD.
*/

// Slots in Tagesreihenfolge. time ist der neutrale Standard, ab dem ein Slot als fällig gilt,
// profile.reminders.slotTimes kann ihn je Slot überschreiben.
export const SLOTS = [
  { id: 'morgen', label: 'Morgen', time: '07:00' },
  { id: 'nach-fruehstueck', label: 'Nach dem Frühstück', time: '08:00' },
  { id: 'mittag', label: 'Mittag', time: '12:00' },
  { id: 'nach-mittag', label: 'Nach dem Mittagessen', time: '13:00' },
  { id: 'abend', label: 'Abend', time: '18:00' },
  { id: 'nach-abend', label: 'Nach dem Abendessen', time: '19:30' },
];

export const SCHEDULE_TYPES = [
  ['daily', 'Täglich'],
  ['everyNDays', 'Alle n Tage'],
  ['weekly', 'Einmal pro Woche'],
  ['seasonal', 'Nur in bestimmten Monaten'],
];

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const SLOT_IDS = SLOTS.map((slot) => slot.id);

/* Datumsrechnung auf Kalendertagen, unabhängig von der Zeitzone des Geräts */

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso, days) {
  return new Date(toUTC(iso) + days * 86400000).toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / 86400000);
}

// 1 = Montag bis 7 = Sonntag
export function weekdayOf(iso) {
  return ((new Date(toUTC(iso)).getUTCDay() + 6) % 7) + 1;
}

export function monthOf(iso) {
  return Number(iso.slice(5, 7));
}

export function minutesOf(time) {
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* Einträge */

export const isMeasurement = (med) => med.type === 'measurement';

export function slotLabel(id) {
  return SLOTS.find((slot) => slot.id === id)?.label ?? id;
}

export function slotTime(id, overrides = {}) {
  return overrides[id] ?? SLOTS.find((slot) => slot.id === id)?.time ?? '00:00';
}

export function slotsOf(med) {
  const slots = (med.schedule?.slots ?? []).filter((slot) => SLOT_IDS.includes(slot));
  return slots.length ? SLOT_IDS.filter((id) => slots.includes(id)) : ['morgen'];
}

export function startsLater(med, date) {
  return Boolean(med.schedule?.startDate) && date < med.schedule.startDate;
}

export function hasEnded(med, date) {
  return Boolean(med.schedule?.endDate) && date > med.schedule.endDate;
}

// Ab wann ein Eintrag zählt: Startdatum, sonst Anlage, sonst erster Log
function beginOf(med, firstLogDate) {
  return med.schedule?.startDate ?? med.createdAt?.slice(0, 10) ?? firstLogDate ?? null;
}

/*
  Ist der Eintrag an diesem Tag geplant?
  everyNDays zählt ab startDate, sonst ab dem ersten Log, ohne beides ab heute.
*/
export function isScheduledOn(med, date, firstLogDate = null) {
  if (med.active === false || startsLater(med, date) || hasEnded(med, date)) return false;
  const schedule = med.schedule ?? {};
  switch (schedule.type ?? 'daily') {
    case 'daily':
      return true;
    case 'everyNDays': {
      const n = Math.max(1, Math.round(Number(schedule.n) || 1));
      const anchor = schedule.startDate ?? firstLogDate ?? date;
      const days = diffDays(anchor, date);
      return days >= 0 && days % n === 0;
    }
    case 'weekly':
      return weekdayOf(date) === Number(schedule.weekday);
    case 'seasonal':
      return (schedule.months ?? []).map(Number).includes(monthOf(date));
    default:
      return false;
  }
}

export function dueSlots(med, date, firstLogDate = null) {
  return isScheduledOn(med, date, firstLogDate) ? slotsOf(med) : [];
}

// Nächster geplanter Tag ab (einschließlich) date, für "startet am" und "nächstes Mal"
export function nextScheduledDate(med, date, firstLogDate = null, horizon = 400) {
  const start = startsLater(med, date) ? med.schedule.startDate : date;
  for (let i = 0; i < horizon; i++) {
    const day = addDays(start, i);
    if (hasEnded(med, day)) return null;
    if (isScheduledOn({ ...med, active: true }, day, firstLogDate)) return day;
  }
  return null;
}

/* Logs */

export function logKey(date, medId, slot) {
  return `${date}|${medId}|${slot}`;
}

export function isDone(log) {
  return Boolean(log && (log.taken || log.values));
}

/*
  Streak: aufeinanderfolgende geplante Tage, an denen alle Slots erledigt sind.
  Tage ohne Plan unterbrechen nicht. Heute bricht den Streak nicht, solange noch offen.
*/
export function streak(med, logs, today, firstLogDate = null) {
  const begin = beginOf(med, firstLogDate);
  let count = 0;
  for (let i = 0; i < 1000; i++) {
    const date = addDays(today, -i);
    if (begin && date < begin) break;
    const slots = dueSlots(med, date, firstLogDate);
    if (slots.length) {
      const complete = slots.every((slot) => isDone(logs.get(logKey(date, med.id, slot))));
      if (complete) count++;
      else if (date !== today) break;
    }
    if (!begin && !slots.length && i > 60) break;
  }
  return count;
}

/*
  Adhärenz über die letzten days Tage in Prozent.
  Heute zählen nur Slots, die schon fällig oder bereits erledigt sind.
*/
export function adherence(med, logs, today, { days = 30, firstLogDate = null, nowMinutes = 24 * 60, slotTimes = {} } = {}) {
  const begin = beginOf(med, firstLogDate);
  let due = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i);
    if (begin && date < begin) break;
    for (const slot of dueSlots(med, date, firstLogDate)) {
      const log = logs.get(logKey(date, med.id, slot));
      if (date === today && !isDone(log) && minutesOf(slotTime(slot, slotTimes)) > nowMinutes) continue;
      due++;
      if (isDone(log)) done++;
    }
  }
  return { due, done, percent: due ? Math.round((done / due) * 100) : null };
}

/*
  Tagesplan: je Slot die Einträge des Tages.
  state: 'offen', 'erledigt' oder 'spaeter' (Startdatum liegt in der Zukunft).
  Pausierte Einträge erscheinen nicht.
*/
export function dayPlan(meds, logs, date, firstLogDates = new Map()) {
  const plan = SLOTS.map((slot) => ({ ...slot, items: [] }));
  for (const med of meds) {
    if (med.active === false || hasEnded(med, date)) continue;
    const first = firstLogDates.get(med.id) ?? null;
    if (startsLater(med, date)) {
      for (const slot of slotsOf(med)) plan.find((s) => s.id === slot).items.push({ med, slot, state: 'spaeter', log: null });
      continue;
    }
    for (const slot of dueSlots(med, date, first)) {
      const log = logs.get(logKey(date, med.id, slot)) ?? null;
      plan.find((s) => s.id === slot).items.push({ med, slot, state: isDone(log) ? 'erledigt' : 'offen', log });
    }
  }
  const order = (item) => (item.state === 'spaeter' ? 2 : 0) + (item.med.critical ? 0 : 1);
  for (const slot of plan) slot.items.sort((a, b) => order(a) - order(b) || a.med.name.localeCompare(b.med.name, 'de'));
  return plan.filter((slot) => slot.items.length);
}

// Jetzt fällige, nicht erledigte Einträge, wichtige zuerst
export function openNow(meds, logs, date, nowMinutes, { firstLogDates = new Map(), slotTimes = {} } = {}) {
  return dayPlan(meds, logs, date, firstLogDates)
    .flatMap((slot) => slot.items)
    .filter((item) => item.state === 'offen' && minutesOf(slotTime(item.slot, slotTimes)) <= nowMinutes)
    .sort((a, b) => (b.med.critical ? 1 : 0) - (a.med.critical ? 1 : 0) || SLOTS.findIndex((s) => s.id === a.slot) - SLOTS.findIndex((s) => s.id === b.slot));
}

// Kurze Beschreibung des Plans für die Verwaltung
export function describeSchedule(med) {
  const s = med.schedule ?? {};
  const slots = slotsOf(med).map(slotLabel).join(', ');
  switch (s.type ?? 'daily') {
    case 'everyNDays': return `Alle ${Math.max(1, Number(s.n) || 1)} Tage, ${slots}`;
    case 'weekly': return `${WEEKDAYS[(Number(s.weekday) || 1) - 1]}s, ${slots}`;
    case 'seasonal': return `${(s.months ?? []).map((m) => MONTHS[Number(m) - 1]).join(', ') || 'Keine Monate'}, ${slots}`;
    default: return `Täglich, ${slots}`;
  }
}
