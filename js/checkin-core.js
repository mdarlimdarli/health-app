/*
  Gemeinsamer Kern für Check-in, Startseite und Auswertung:
  Slider-Beschreibung, Laden und Speichern (ein Check-in pro Tag),
  Zyklustag und Zyklusphase, Tagesfläche aus übereinanderliegenden Verläufen.
  Welche Slider es gibt und wie die Zyklusphasen liegen, steht im Profil.
*/

import * as db from './db.js';

/*
  Farbwelt, Beschriftung und feste Position der Verläufe je Slider (Prozent der Aura-Fläche):
  Energie oben links, Schlaf oben rechts, Verdauung unten links, Schmerz unten rechts.
*/
export const SLIDER_META = {
  energy: { label: 'Energie', tone: 'mandarine', low: 'leer', high: 'voll', x: 10, y: 10 },
  sleep: { label: 'Schlaf', tone: 'periwinkle', low: 'schlecht', high: 'gut', x: 92, y: 8 },
  digestion: { label: 'Verdauung', tone: 'salbei', low: 'schlecht', high: 'gut', x: 8, y: 52 },
  pain: { label: 'Schmerz', tone: 'koralle', low: 'kaum', high: 'stark', x: 94, y: 50 },
  mood: { label: 'Stimmung', tone: 'rose', low: 'tief', high: 'gut', x: 52, y: 28 },
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

/*
  Aura aus den Werten des Tages: je Slider mit Wert ein Verlauf an fester Stelle,
  größer und satter mit höherem Wert, höchstens vier. subtle für den Check-in selbst.
*/
export function auraBlobs(checkin, sliders, { subtle = false } = {}) {
  const factor = subtle ? 0.6 : 1;
  return sliders
    .filter((key) => Number.isInteger(checkin?.[key]))
    .slice(0, 4)
    .map((key) => ({ ...SLIDER_META[key], intensity: (0.15 + (checkin[key] / 5) * 0.85) * factor }))
    .map(({ tone, x, y, intensity }) => ({ tone, x, y, intensity }));
}
