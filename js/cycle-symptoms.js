/*
  Zyklus-Symptome, rein funktional (ohne DOM und Speicher), für Screen, Startseite,
  Auszug und Tests. Ein Eintrag pro Tag im Store cycleSymptoms:
  { id, date, symptoms: [{ key, intensity 1 bis 3 }], bleeding, note }.
  Nur Zahlen und Muster, keine Interpretation.
*/

export const SYMPTOMS = [
  ['kraempfe', 'Krämpfe'],
  ['rueckenschmerzen', 'Rückenschmerzen'],
  ['gliederschmerzen', 'Gliederschmerzen'],
  ['kopfschmerz', 'Kopfschmerz'],
  ['brustspannen', 'Brustspannen'],
  ['blaehbauch', 'Blähbauch'],
  ['verdauung', 'Verdauung'],
  ['hautempfindlich', 'Hautempfindlich'],
  ['hautunreinheiten', 'Hautunreinheiten'],
  ['wassereinlagerung', 'Wassereinlagerung'],
  ['heisshunger', 'Heißhunger'],
  ['muedigkeit', 'Müdigkeit'],
  ['schlafprobleme', 'Schlafprobleme'],
  ['stimmungsschwankungen', 'Stimmungsschwankungen'],
  ['reizbarkeit', 'Reizbarkeit'],
  ['unruhe', 'Unruhe'],
  ['libido', 'Libido'],
  ['schmierblutung', 'Schmierblutung'],
  ['uebelkeit', 'Übelkeit'],
  ['schwindel', 'Schwindel'],
];

export const SYMPTOM_KEYS = SYMPTOMS.map(([key]) => key);
const LABELS = new Map(SYMPTOMS);
export const symptomLabel = (key) => LABELS.get(key) ?? key;

// Startwert der Standardliste im Profil (cycleSymptomsDefault)
export const DEFAULT_SYMPTOMS = ['gliederschmerzen', 'hautempfindlich', 'blaehbauch', 'kraempfe', 'muedigkeit', 'stimmungsschwankungen'];

// Blutungsstärke, level 0 bis 4 steuert die Füllung im Kalenderstreifen
export const BLEEDING = [
  ['keine', 'Keine'],
  ['leicht', 'Leicht'],
  ['mittel', 'Mittel'],
  ['stark', 'Stark'],
  ['sehr-stark', 'Sehr stark'],
];
export const bleedingLevel = (value) => Math.max(0, BLEEDING.findIndex(([key]) => key === value));
export const bleedingLabel = (value) => BLEEDING.find(([key]) => key === value)?.[1] ?? '';

// Wie oft und in welchem Zeitraum ein Symptom aus der Langliste gewählt sein muss
export const PROMOTE_COUNT = 3;
export const PROMOTE_DAYS = 60;

const toUTC = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const daysBetween = (from, to) => Math.round((toUTC(to) - toUTC(from)) / 86400000);

export function addDays(iso, days) {
  const date = new Date(toUTC(iso) + days * 86400000);
  return date.toISOString().slice(0, 10);
}

// Bereinigt einen Eintrag: bekannte Symptome, Stärke 1 bis 3, bekannte Blutung
export function normalizeEntry(entry) {
  const seen = new Set();
  const symptoms = (entry?.symptoms ?? [])
    .filter((item) => SYMPTOM_KEYS.includes(item?.key) && [1, 2, 3].includes(item.intensity))
    .filter((item) => !seen.has(item.key) && seen.add(item.key));
  const bleeding = BLEEDING.some(([key]) => key === entry?.bleeding) ? entry.bleeding : 'keine';
  return { ...entry, symptoms, bleeding, note: typeof entry?.note === 'string' ? entry.note : '' };
}

export function isEmpty(entry) {
  return !entry || (!entry.symptoms?.length && (entry.bleeding ?? 'keine') === 'keine' && !entry.note?.trim());
}

/*
  Symptome aus der Langliste, die in den letzten 60 Tagen (bis heute) an mindestens
  drei Tagen gewählt wurden und noch nicht in der Standardliste stehen.
*/
export function promotionCandidates(entries, defaults, today) {
  const counts = new Map();
  for (const entry of entries) {
    const age = daysBetween(entry.date, today);
    if (age < 0 || age >= PROMOTE_DAYS) continue;
    for (const { key } of entry.symptoms ?? []) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return SYMPTOM_KEYS.filter((key) => !defaults.includes(key) && (counts.get(key) ?? 0) >= PROMOTE_COUNT);
}

/*
  Zyklen aus den Periodenbeginnen: je Zyklus { start, end } (end exklusiv, beim
  laufenden Zyklus der Tag nach heute). Nur Zyklen, die bis heute begonnen haben.
*/
export function cycleRanges(starts, today) {
  const sorted = [...new Set(starts)].filter((date) => date <= today).sort();
  return sorted.map((start, index) => ({ start, end: sorted[index + 1] ?? addDays(today, 1) }));
}

/*
  Kalenderstreifen des aktuellen Zyklus: je Tag Zyklustag, Datum, Blutung und ob
  Symptome eingetragen sind. Länge mindestens die erwartete Zykluslänge.
*/
export function currentCycleStrip(entries, starts, today, expectedLength) {
  const ranges = cycleRanges(starts, today);
  const current = ranges.at(-1);
  if (!current) return [];
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const length = Math.max(expectedLength, daysBetween(current.start, today) + 1);
  return Array.from({ length }, (_, index) => {
    const date = addDays(current.start, index);
    const entry = byDate.get(date);
    return {
      day: index + 1,
      date,
      future: date > today,
      today: date === today,
      bleeding: bleedingLevel(entry?.bleeding),
      symptoms: entry?.symptoms?.length ?? 0,
    };
  });
}

/*
  Muster der letzten Zyklen (höchstens drei, der laufende zählt mit):
  je Symptom, an welchen Zyklustagen es auftrat und in wie vielen dieser Zyklen.
  Liefert { cycles, maxDay, rows: [{ key, label, days: Map(Zyklustag -> Anzahl Zyklen) }] }.
*/
export function symptomPattern(entries, starts, today, count = 3) {
  const ranges = cycleRanges(starts, today).slice(-count);
  const rows = new Map();
  let maxDay = 0;
  for (const range of ranges) {
    const length = daysBetween(range.start, range.end);
    maxDay = Math.max(maxDay, length);
    for (const entry of entries) {
      if (entry.date < range.start || entry.date >= range.end) continue;
      const day = daysBetween(range.start, entry.date) + 1;
      for (const { key } of entry.symptoms ?? []) {
        if (!rows.has(key)) rows.set(key, new Map());
        const days = rows.get(key);
        days.set(day, (days.get(day) ?? 0) + 1);
      }
    }
  }
  const ordered = SYMPTOM_KEYS.filter((key) => rows.has(key)).map((key) => ({ key, label: symptomLabel(key), days: rows.get(key) }));
  return { cycles: ranges.length, maxDay, rows: ordered };
}

// Kurztext für den Auszug: "Krämpfe (2), Müdigkeit (1)"
export function symptomsText(entry) {
  return (entry.symptoms ?? []).map(({ key, intensity }) => `${symptomLabel(key)} (${intensity})`).join(', ');
}
