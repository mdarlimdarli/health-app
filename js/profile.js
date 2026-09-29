/*
  Profil: alles Persönliche steht hier, der Code bleibt neutral.
  Das aktive Profil lebt in IndexedDB (settings, key "profile") und ist Teil
  der verschlüsselten Sicherung. Es wird nie aus dem Repo geladen.
  Medikamente liegen im Store meds. Ein importiertes Profil ergänzt dort nur
  neue Einträge, das gespeicherte Profil selbst enthält keine Medikamente.
*/

import * as db from './db.js';
import { todayISO } from './ui.js';
import { normalizeTraining } from './training-options.js';
import { DEFAULT_SYMPTOMS, SYMPTOM_KEYS } from './cycle-symptoms.js';

export const SEX_OPTIONS = ['weiblich', 'maennlich', 'divers'];

// Version 2: training.avoidTags ersetzt durch protectRegions, avoidMovements, focus und guidance
export const PROFILE_VERSION = 2;

// Neutrale Standardwerte für fehlende Felder
const DEFAULTS = {
  version: PROFILE_VERSION,
  displayName: '',
  language: 'de',
  birthYear: null,
  sex: null,
  cycleTracking: false,
  // Symptome, die der Zyklus-Screen immer zeigt, der Rest steht unter "Mehr"
  cycleSymptomsDefault: [...DEFAULT_SYMPTOMS],
  training: { daysPerWeek: 2, level: 1, goal: '', protectRegions: [], avoidMovements: [], focus: [], guidance: '', pullPushRatio: '1:1', startPhase: 1 },
  checkin: {
    sliders: ['energy', 'digestion', 'pain', 'sleep'],
    painSideToggle: { enabled: false, label: '' },
    // Nur für die Auswertung nach Zyklusphase, im Profil anpassbar
    cyclePhases: [
      { name: 'Periode', from: 1, to: 5 },
      { name: 'Follikelphase', from: 6, to: 13 },
      { name: 'Eisprungphase', from: 14, to: 16 },
      { name: 'Lutealphase', from: 17, to: null },
    ],
  },
  meds: [],
  diet: { intolerances: [], cuisines: [], dislikes: [] },
  reminders: { times: [], timezone: 'Europe/Berlin' },
};

const events = new EventTarget();
let profile = null;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

// Führt ein Profil mit den Standardwerten zusammen und bereinigt Typen
function normalize(raw) {
  const source = isObject(raw) ? raw : {};
  const result = { ...structuredClone(DEFAULTS), ...source };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (isObject(value)) result[key] = { ...structuredClone(value), ...(isObject(source[key]) ? source[key] : {}) };
  }
  if (!Array.isArray(result.checkin.cyclePhases) || !result.checkin.cyclePhases.length) result.checkin.cyclePhases = structuredClone(DEFAULTS.checkin.cyclePhases);
  result.checkin.sliders = stringList(result.checkin.sliders);
  result.checkin.painSideToggle = { ...DEFAULTS.checkin.painSideToggle, ...(isObject(result.checkin.painSideToggle) ? result.checkin.painSideToggle : {}) };
  result.displayName = typeof result.displayName === 'string' ? result.displayName.trim() : '';
  result.birthYear = Number.isInteger(result.birthYear) ? result.birthYear : null;
  result.cycleTracking = result.cycleTracking === true;
  result.sex = SEX_OPTIONS.includes(result.sex) ? result.sex : null;
  const symptoms = stringList(source.cycleSymptomsDefault).filter((key) => SYMPTOM_KEYS.includes(key));
  result.cycleSymptomsDefault = symptoms.length ? [...new Set(symptoms)] : [...DEFAULT_SYMPTOMS];
  // Migriert alte Schonungs-Tags (Version 1) auf Regionen und Bewegungen
  result.training = normalizeTraining(isObject(source.training) ? { ...DEFAULTS.training, ...source.training } : DEFAULTS.training);
  result.diet.intolerances = stringList(result.diet.intolerances);
  result.diet.cuisines = stringList(result.diet.cuisines);
  result.diet.dislikes = stringList(result.diet.dislikes);
  result.meds = Array.isArray(source.meds) ? source.meds.filter((med) => isObject(med) && typeof med.id === 'string' && med.id) : [];
  result.version = PROFILE_VERSION;
  return result;
}

function emitChange() {
  events.dispatchEvent(new Event('change'));
}

export function onProfileChange(listener) {
  events.addEventListener('change', listener);
  return () => events.removeEventListener('change', listener);
}

/* Laden und Lesen */

export async function loadProfile() {
  const stored = await db.getSetting('profile');
  // Älteres Schema einmalig migriert zurückschreiben, damit auch die Sicherung das neue enthält
  if (stored && Number(stored.version) < PROFILE_VERSION) return saveProfile(stored);
  profile = stored ? normalize(stored) : null;
  emitChange();
  return profile;
}

export function hasProfile() {
  return profile !== null;
}

// Ohne Profil: neutrale Standardwerte
export function getProfile() {
  return profile ?? normalize(null);
}

// "<displayName> Health", ohne Namen nur "Health"
export function appTitle(source = profile) {
  return source?.displayName ? `${source.displayName} Health` : 'Health';
}

/* Speichern: erst IndexedDB, db.put reiht die Änderung in die Sync-Queue ein */

export async function saveProfile(next) {
  const { meds, ...stored } = normalize(next);
  await db.setSetting('profile', stored);
  profile = normalize(stored);
  emitChange();
  return profile;
}

/* Datei-Import und -Export */

// Prüft eine Profildatei und liefert das bereinigte Profil
export function parseProfileFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (isObject(raw) && isObject(raw.stores)) {
    throw new Error('Das ist ein Datenexport, kein Profil. Nutze dafür Import aus Datei im Bereich Datei.');
  }
  if (!isObject(raw) || typeof raw.displayName !== 'string') {
    throw new Error('Die Datei enthält kein gültiges Profil.');
  }
  if (Number(raw.version) > PROFILE_VERSION) {
    throw new Error('Das Profil stammt aus einer neueren App-Version.');
  }
  return normalize(raw);
}

// Wandelt einen Profil-Eintrag in einen Datensatz für den Store meds
function toStoredMed(med) {
  const schedule = isObject(med.schedule) ? med.schedule : { type: 'daily', slots: [] };
  return {
    ...med,
    type: med.type ?? 'medication',
    dosage: med.dosage ?? '',
    notes: med.notes ?? '',
    active: med.active ?? true,
    critical: med.critical ?? false,
    schedule: {
      ...schedule,
      slots: Array.isArray(schedule.slots) ? schedule.slots : [],
      // Ohne Startdatum gilt der Plan ab dem Import (Bezugstag für everyNDays)
      startDate: schedule.startDate ?? todayISO(),
      endDate: schedule.endDate ?? null,
    },
  };
}

/*
  Übernimmt ein Profil aus einer Datei. Medikamente mit neuer ID kommen in den
  Store meds, vorhandene werden nie überschrieben (sie können in der App
  bearbeitet worden sein). Liefert die Zahl der neu angelegten Medikamente.
*/
export async function importProfile(parsed) {
  const existing = new Set((await db.getAll('meds')).map((med) => med.id));
  let added = 0;
  for (const med of parsed.meds) {
    if (existing.has(med.id)) continue;
    await db.put('meds', toStoredMed(med));
    existing.add(med.id);
    added++;
  }
  await saveProfile(parsed);
  return added;
}

// Profil samt aktueller Medikamente, im selben Schema wie beim Import
export async function exportProfile() {
  const meds = (await db.getAll('meds')).map(({ id, name, dosage, type, schedule, active, critical, notes }) => ({
    id, name, dosage, type, schedule, active, critical, notes,
  }));
  return { ...getProfile(), meds };
}
