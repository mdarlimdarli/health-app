/*
  Gemeinsamer Kern für Check-in, Startseite und Auswertung:
  Slider-Beschreibung, Laden und Speichern (ein Check-in pro Tag),
  Zyklustag und Zyklusphase, Tagesfläche aus übereinanderliegenden Verläufen.
  Welche Slider es gibt und wie die Zyklusphasen liegen, steht im Profil.
*/

import * as db from './db.js';
import { el } from './ui.js';

// Farbwelt, Beschriftung und feste Position der Verläufe je Slider
export const SLIDER_META = {
  energy: { label: 'Energie', tone: 'sonne', low: 'leer', high: 'voll', x: 22, y: 30 },
  sleep: { label: 'Schlaf', tone: 'himmel', low: 'schlecht', high: 'gut', x: 78, y: 28 },
  digestion: { label: 'Verdauung', tone: 'salbei', low: 'schlecht', high: 'gut', x: 26, y: 76 },
  pain: { label: 'Schmerz', tone: 'rose', low: 'kaum', high: 'stark', x: 76, y: 74 },
  mood: { label: 'Stimmung', tone: 'flieder', low: 'tief', high: 'gut', x: 50, y: 52 },
};

export function activeSliders(profile) {
  return (profile.checkin?.sliders ?? []).filter((key) => SLIDER_META[key]);
}

/* Laden und Speichern */

export async function getCheckin(date) {
  const [first] = await db.getByDate('checkins', date);
  return first ?? null;
}

export function emptyCheckin(date) {
  return { id: db.newId(), date, cycleDay: null, energy: null, digestion: null, pain: null, painLeftSide: false, sleep: null, mood: null, trainedToday: false, periodStart: false, note: '' };
}

export function hasValues(checkin, sliders) {
  return Boolean(checkin) && sliders.some((key) => Number.isInteger(checkin[key]));
}

export async function saveCheckin(checkin) {
  return db.put('checkins', checkin);
}

export async function allCheckins() {
  const list = await db.getAll('checkins');
  return list.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* Zyklus */

function daysBetween(from, to) {
  const toUTC = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((toUTC(to) - toUTC(from)) / 86400000);
}

/*
  Zyklustag an einem Datum: gespeicherter Wert des Tages, sonst gezählt ab dem letzten
  Periodenbeginn (Check-in mit periodStart oder Einstellung cycleStartDate).
*/
export async function cycleDayFor(date, checkins = null) {
  const list = checkins ?? await allCheckins();
  const own = list.find((c) => c.date === date);
  if (Number.isInteger(own?.cycleDay)) return own.cycleDay;
  const starts = list.filter((c) => c.periodStart && c.date <= date).map((c) => c.date);
  const setting = await db.getSetting('cycleStartDate');
  if (setting && setting <= date) starts.push(setting);
  if (!starts.length) return null;
  const last = starts.sort().at(-1);
  return daysBetween(last, date) + 1;
}

export function phaseFor(cycleDay, phases) {
  if (!Number.isInteger(cycleDay)) return null;
  return phases.find((phase) => cycleDay >= phase.from && (phase.to == null || cycleDay <= phase.to)) ?? null;
}

/* Tagesfläche: je Slider ein Verlauf an fester Stelle, Größe und Sättigung nach Wert */

export function renderAura(container, checkin, sliders) {
  container.replaceChildren();
  container.classList.add('day-aura');
  const quiet = !hasValues(checkin, sliders);
  container.classList.toggle('day-aura--quiet', quiet);
  for (const key of sliders) {
    const meta = SLIDER_META[key];
    const value = Number.isInteger(checkin?.[key]) ? checkin[key] : null;
    const blob = el('div', `blob blob--${meta.tone} aura-blob`);
    blob.dataset.slider = key;
    // Ohne Wert ruhig und klein, mit Wert je nach Höhe größer und satter
    blob.style.setProperty('--intensity', String(value ? 0.15 + (value / 5) * 0.85 : 0.12));
    blob.style.setProperty('--x', `${meta.x}%`);
    blob.style.setProperty('--y', `${meta.y}%`);
    container.append(blob);
  }
}
