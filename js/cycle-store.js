/*
  Datenzugriff für Zyklus-Symptome (Store cycleSymptoms), ein Eintrag pro Tag.
  Die ID ist das Datum, so entsteht pro Tag nie mehr als ein Eintrag.
  Beim Speichern rücken Symptome aus der Langliste, die dreimal in 60 Tagen gewählt
  wurden, in die Standardliste des Profils (cycleSymptomsDefault).
*/

import * as db from './db.js';
import { getProfile, saveProfile } from './profile.js';
import { normalizeEntry, isEmpty, promotionCandidates } from './cycle-symptoms.js';
import { todayISO } from './ui.js';

export function emptyEntry(date) {
  return { id: date, date, symptoms: [], bleeding: 'keine', note: '' };
}

export async function getEntry(date) {
  const entry = await db.get('cycleSymptoms', date);
  return entry ? normalizeEntry(entry) : emptyEntry(date);
}

export async function allEntries() {
  const list = await db.getAll('cycleSymptoms');
  return list.map(normalizeEntry).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Speichert den Tag (leer heißt löschen) und liefert neu in die Standardliste gerückte Symptome
export async function saveEntry(entry) {
  const clean = normalizeEntry({ ...entry, id: entry.date });
  if (isEmpty(clean)) await db.remove('cycleSymptoms', clean.id);
  else await db.put('cycleSymptoms', clean);

  const profile = getProfile();
  const promoted = promotionCandidates(await allEntries(), profile.cycleSymptomsDefault, todayISO());
  if (promoted.length) {
    await saveProfile({ ...structuredClone(profile), cycleSymptomsDefault: [...profile.cycleSymptomsDefault, ...promoted] });
  }
  return promoted;
}
