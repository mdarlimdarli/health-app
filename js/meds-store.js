/*
  Datenzugriff für Medikamente und Einnahmen (Stores meds und medLog).
  Ein Log pro Tag, Eintrag und Slot, die ID ist deterministisch (Datum|medId|Slot),
  so entstehen beim mehrfachen Antippen keine Dubletten.
*/

import * as db from './db.js';
import { logKey, openNow } from './meds-schedule.js';
import { getProfile } from './profile.js';
import { todayISO } from './ui.js';

const TIME_ZONE = 'Europe/Berlin';

export function nowMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export function slotTimes() {
  return getProfile().reminders?.slotTimes ?? {};
}

export async function loadMeds() {
  const meds = await db.getAll('meds');
  return meds.sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || a.name.localeCompare(b.name, 'de'));
}

// Alle Logs als Map nach Schlüssel, dazu der erste Log-Tag je Eintrag (Bezug für everyNDays)
export async function loadLogs() {
  const list = await db.getAll('medLog');
  const logs = new Map();
  const firstLogDates = new Map();
  for (const log of list) {
    logs.set(log.id, log);
    const first = firstLogDates.get(log.medId);
    if (!first || log.date < first) firstLogDates.set(log.medId, log.date);
  }
  return { logs, firstLogDates, list };
}

export async function setTaken(med, slot, date, taken) {
  const id = logKey(date, med.id, slot);
  if (!taken) {
    await db.remove('medLog', id);
    return null;
  }
  return db.put('medLog', { id, date, medId: med.id, slot, taken: true, takenAt: new Date().toISOString() });
}

export async function saveMeasurement(med, slot, date, values) {
  const id = logKey(date, med.id, slot);
  return db.put('medLog', { id, date, medId: med.id, slot, taken: true, takenAt: new Date().toISOString(), values });
}

export async function saveMed(med) {
  return db.put('meds', med);
}

export async function removeMed(id) {
  return db.remove('meds', id);
}

// Jetzt fällige, offene Einträge für Startseite und Badge
export async function openItems() {
  const [meds, { logs, firstLogDates }] = await Promise.all([loadMeds(), loadLogs()]);
  return openNow(meds, logs, todayISO(), nowMinutes(), { firstLogDates, slotTimes: slotTimes() });
}
