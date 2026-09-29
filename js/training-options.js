/*
  Neutrales Vokabular für die Trainingsanpassung und die Bereinigung von profile.training.
  Rein funktional (ohne DOM und Speicher), damit Planer, Formulare und Node-Tests
  dieselben Werte nutzen. Welche Werte gelten, steht nur im Profil.

  Drei Ebenen (dazu Tags "fokus:<id>" an Übungen, die ein Fokus eigens in den Plan holt):
  - protectRegions: Körperregionen schonen. Übungen mit Tag "belastet:<region>" fallen weg,
    Mobility mit "mobilisiert:<region>" kommt bevorzugt in den Aufwärmblock.
    Jede Region kann ein Enddatum "until" haben, danach fragt die Startseite nach.
  - avoidMovements: Bewegungen vermeiden, Übungen mit Tag "bewegung:<id>" fallen weg.
  - focus: Aufbauen, bevorzugt Übungen mit passendem Fokus.
*/

export const REGIONS = [
  ['nacken', 'Nacken'],
  ['schulter', 'Schulter'],
  ['lws', 'Lendenwirbelsäule'],
  ['bws', 'Brustwirbelsäule'],
  ['huefte', 'Hüfte'],
  ['knie', 'Knie'],
  ['handgelenk', 'Handgelenk'],
  ['ellbogen', 'Ellbogen'],
  ['bauchraum', 'Bauchraum'],
];

// [id, Label, Beispiele]
export const MOVEMENTS = [
  ['ueberkopf', 'Überkopf drücken oder ziehen', ''],
  ['last-hinter-kopf', 'Last hinter dem Kopf', ''],
  ['wirbelsaeule-beugen', 'Wirbelsäule unter Last beugen', 'Kreuzheben, Good Mornings'],
  ['wirbelsaeule-rotieren', 'Wirbelsäule unter Last rotieren', ''],
  ['bauchpressen', 'Bauchpressen', 'Crunches, Sit-ups'],
  ['tiefe-kniebeuge', 'Tiefe Kniebeuge', ''],
  ['spruenge', 'Sprünge und Stöße', ''],
  ['haengen', 'Hängen am Griff', ''],
];

export const FOCUS = [
  ['oberer-ruecken', 'Oberer Rücken'],
  ['schulterguertel', 'Schultergürtel'],
  ['core-stabilitaet', 'Core-Stabilität'],
  ['huefte-gesaess', 'Hüfte und Gesäß'],
  ['beine', 'Beine'],
  ['knochendichte', 'Knochendichte'],
  ['beweglichkeit', 'Beweglichkeit'],
  ['gleichgewicht', 'Gleichgewicht und Standsicherheit'],
  ['allgemeine-kraft', 'Allgemeine Kraft'],
];

// Aus dem Vokabular gestrichen, gespeicherte Profile verlieren diese Werte beim Laden
const REMOVED_MOVEMENTS = new Set(['einbeinig']);

export const REGION_IDS = REGIONS.map(([id]) => id);
export const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
export const FOCUS_IDS = FOCUS.map(([id]) => id);

const labelMap = (list) => new Map(list.map(([id, label]) => [id, label]));
const REGION_LABELS = labelMap(REGIONS);
const MOVEMENT_LABELS = labelMap(MOVEMENTS);
const FOCUS_LABELS = labelMap(FOCUS);

function fallbackLabel(id) {
  const text = String(id).replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const regionLabel = (id) => REGION_LABELS.get(id) ?? fallbackLabel(id);
export const movementLabel = (id) => MOVEMENT_LABELS.get(id) ?? fallbackLabel(id);
export const focusLabel = (id) => FOCUS_LABELS.get(id) ?? fallbackLabel(id);

/*
  Alte Schonungs-Tags (Profil Version 1, training.avoidTags) auf die neuen Ebenen abbilden.
  Nackendrücken belastet Nacken und Schulter, deshalb beide Regionen.
*/
const LEGACY_TAGS = {
  'last-hinter-kopf': { movements: ['last-hinter-kopf'] },
  nackendruecken: { regions: ['nacken', 'schulter'] },
  bauchdruck: { regions: ['bauchraum'] },
  crunches: { movements: ['bauchpressen'] },
  'schweres-kreuzheben': { movements: ['wirbelsaeule-beugen'] },
};

// Alte Fokus-Begriffe auf das neue Vokabular
const LEGACY_FOCUS = {
  'schultergürtel': 'schulterguertel',
  schultern: 'schulterguertel',
  rumpf: 'core-stabilitaet',
  core: 'core-stabilitaet',
  gesaess: 'huefte-gesaess',
  ruecken: 'oberer-ruecken',
  haltung: 'oberer-ruecken',
  kraft: 'allgemeine-kraft',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

const unique = (list) => [...new Set(list)];

// Regionen als [{ region, until }], Strings werden zu Einträgen ohne Enddatum
function regionList(value) {
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const region = typeof item === 'string' ? item.trim() : typeof item?.region === 'string' ? item.region.trim() : '';
    if (!region || result.some((entry) => entry.region === region)) continue;
    const until = typeof item?.until === 'string' && DATE.test(item.until) ? item.until : null;
    result.push({ region, until });
  }
  return result;
}

/*
  Bereinigt profile.training und migriert alte Felder.
  Unbekannte Werte bleiben erhalten (z. B. aus einem importierten Profil),
  der Planer ignoriert sie, wenn keine Übung sie trägt.
*/
export function normalizeTraining(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const regions = regionList(source.protectRegions);
  const movements = stringList(source.avoidMovements);

  for (const tag of stringList(source.avoidTags)) {
    const mapped = LEGACY_TAGS[tag];
    if (!mapped) continue;
    for (const region of mapped.regions ?? []) if (!regions.some((entry) => entry.region === region)) regions.push({ region, until: null });
    movements.push(...(mapped.movements ?? []));
  }

  const { avoidTags, ...rest } = source;
  return {
    daysPerWeek: 2,
    level: 1,
    goal: '',
    pullPushRatio: '1:1',
    startPhase: 1,
    ...rest,
    protectRegions: regions,
    avoidMovements: unique(movements).filter((movement) => !REMOVED_MOVEMENTS.has(movement)),
    focus: unique(stringList(source.focus).map((item) => LEGACY_FOCUS[item] ?? item)),
    guidance: typeof source.guidance === 'string' ? source.guidance.trim() : '',
  };
}

export const regionIds = (training) => (training?.protectRegions ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.region));

// Tags, die eine Übung ausschließen
export function blockedTags(training) {
  return [
    ...regionIds(training).map((region) => `belastet:${region}`),
    ...(training?.avoidMovements ?? []).map((movement) => `bewegung:${movement}`),
  ];
}

// Regionen, deren Enddatum vor heute liegt. Sie bleiben geschont, bis die Person entscheidet.
export function expiredRegions(training, today) {
  return (training?.protectRegions ?? []).filter((entry) => entry.until && entry.until < today);
}
