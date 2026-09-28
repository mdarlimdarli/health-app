/*
  Trainingsplaner: erzeugt Pläne aus profile.training und der Übungsbibliothek.
  Rein funktional, ohne DOM und ohne Speicher, damit er im Browser und in Node
  (scripts/generate-plans.mjs) gleich rechnet. Alle persönlichen Vorgaben
  (Tage, Level, geschonte Regionen, vermiedene Bewegungen, Fokus, Verhältnis Zug zu Druck,
  Phase) kommen aus dem Profil.
  Übungen tragen Tags "belastet:<region>" und "bewegung:<id>", Mobility "mobilisiert:<region>".
  Vokabular und Labels: js/training-options.js.
*/

import { blockedTags, regionIds, regionLabel, movementLabel, focusLabel, REGION_IDS, MOVEMENT_IDS, FOCUS_IDS } from './training-options.js';

// Nach so vielen Einheiten in Phase 1 wird der Wechsel vorgeschlagen, nie erzwungen
export const SESSIONS_PER_PHASE = 16;

const MOBILITY_SECONDS = 75;
const MOBILITY_COUNT = 4;
// Mit Fokus Beweglichkeit zwei Mobility-Übungen mehr
const MOBILITY_EXTRA = 2;
const MAX_EXERCISES = 7;

// Fokus-Begriffe, die eine Muskelgruppe meinen: dort mindestens zwei Übungen pro Einheit
const FOCUS_GROUPS = {
  'oberer-ruecken': 'ruecken',
  beine: 'beine',
  'huefte-gesaess': 'beine',
  'core-stabilitaet': 'core',
};

// Bonuspunkte: geloggte Übungen halten die Fortschrittskurve, bisherige den Plan ruhig
const LOGGED_BONUS = 5;
const PREVIOUS_BONUS = 3;
const REPLACEMENT_BONUS = 2;

const BODYWEIGHT = new Set(['koerpergewicht', 'matte']);

/* Hilfen */

// "2:1" wird 2, ungültige Angaben werden 1
export function parseRatio(text) {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)\s*$/.exec(String(text ?? ''));
  if (!match) return 1;
  const pull = Number(match[1].replace(',', '.'));
  const push = Number(match[2].replace(',', '.'));
  return push > 0 && pull > 0 ? pull / push : 1;
}

// Geschätztes Maximalgewicht nach Epley
export function estimate1RM(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function formatKg(value) {
  return String(value).replace('.', ',');
}

// Gründe, warum eine Übung für dieses Profil wegfällt (leer heißt erlaubt)
export function exclusionReasons(exercise, training, prefs = {}) {
  const reasons = [];
  if (prefs[exercise.id]?.disliked) reasons.push({ type: 'disliked' });
  const blocked = new Set(blockedTags(training));
  for (const tag of exercise.tags) {
    if (!blocked.has(tag)) continue;
    const [kind, id] = tag.split(':');
    reasons.push({ type: kind === 'belastet' ? 'region' : 'movement', id });
  }
  return reasons;
}

export function isAllowed(exercise, training, prefs = {}) {
  return exclusionReasons(exercise, training, prefs).length === 0;
}

// Grund, wenn ein Ausschluss wegfällt
export function liftedText(reason) {
  if (reason.type === 'disliked') return '„Mag ich nicht“ zurückgenommen';
  if (reason.type === 'region') return `Schonung ${regionLabel(reason.id)} aufgehoben`;
  if (reason.type === 'movement') return `${movementLabel(reason.id)} wieder erlaubt`;
  return '';
}

export function reasonText(reason) {
  if (reason.type === 'disliked') return 'als „Mag ich nicht“ markiert';
  if (reason.type === 'region') return `Schonung ${regionLabel(reason.id)}`;
  if (reason.type === 'movement') return movementLabel(reason.id);
  return reason.text ?? '';
}

/* Belastungsvorgaben je Übung */

export function prescription(exercise, level, phase) {
  const advanced = level >= 2;
  if (exercise.pattern === 'mobilitaet') {
    return { sets: 1, repRange: [60, MOBILITY_SECONDS], restSeconds: 0, progressionRule: { type: 'keine', text: 'Locker und schmerzfrei bewegen.' } };
  }
  if (exercise.unit === 'seconds') {
    const carry = exercise.pattern === 'tragen';
    const repRange = carry ? [30, 45] : [20, 40];
    return {
      sets: advanced ? 3 : 2,
      repRange,
      restSeconds: carry ? 60 : 45,
      progressionRule: { type: 'zeit', stepSeconds: 5, text: `Schaffst du in allen Sätzen ${repRange[1]} Sekunden, verlängere um 5 Sekunden.` },
    };
  }
  if (BODYWEIGHT.has(exercise.equipment)) {
    const repRange = [8, 15];
    return {
      sets: advanced ? 3 : 2,
      repRange,
      restSeconds: 60,
      progressionRule: { type: 'wiederholungen', text: `Schaffst du in allen Sätzen ${repRange[1]} Wiederholungen, wähle eine schwerere Variante.` },
    };
  }
  const repRange = exercise.compound ? (phase >= 2 ? [6, 10] : [8, 12]) : [10, 15];
  const stepKg = exercise.compound && exercise.muscleGroup === 'beine' ? 2.5 : 1.25;
  return {
    sets: exercise.compound || advanced ? 3 : 2,
    repRange,
    restSeconds: exercise.compound ? (phase >= 2 ? 120 : 90) : 60,
    progressionRule: {
      type: 'doppelprogression',
      stepKg,
      text: `Schaffst du in allen Sätzen ${repRange[1]} Wiederholungen, erhöhe um ${formatKg(stepKg)} kg.`,
    },
  };
}

/* Auswahl */

function planExerciseIds(plans = []) {
  return new Set(plans.flatMap((plan) => [...(plan.exercises ?? []), ...(plan.mobility ?? [])].map((entry) => entry.exerciseId)));
}

function createContext({ training, exercises, prefs = {}, phase, history = [], previous = [] }) {
  const level = Math.min(2, Math.max(1, Number(training.level) || 1));
  const focus = Array.isArray(training.focus) ? training.focus : [];
  const regions = regionIds(training);
  const pool = exercises.filter((exercise) => exercise.level <= level && isAllowed(exercise, training, prefs));
  const allowed = new Set(pool.map((exercise) => exercise.id));
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  // Ausgeschlossene Übungen des bisherigen Plans: ihre Alternativen (gleiche Muskelgruppe) rücken nach
  const previousIds = planExerciseIds(previous);
  const replacements = new Set();
  for (const id of previousIds) {
    if (allowed.has(id)) continue;
    for (const alt of byId.get(id)?.alternatives ?? []) replacements.add(alt);
  }
  return {
    level,
    phase: phase === 2 ? 2 : 1,
    focus,
    regions,
    prefs,
    logged: new Set(history),
    previous: previousIds,
    replacements,
    ratio: parseRatio(training.pullPushRatio),
    order: new Map(exercises.map((exercise, index) => [exercise.id, index])),
    byId,
    pool: pool.filter((exercise) => exercise.pattern !== 'mobilitaet'),
    mobility: pool.filter((exercise) => exercise.pattern === 'mobilitaet'),
    used: new Map(),
  };
}

function focusMatches(exercise, ctx) {
  return exercise.focus.filter((item) => ctx.focus.includes(item)).length;
}

function score(exercise, ctx) {
  let value = 3 * focusMatches(exercise, ctx);
  // Phase 2 heißt freie Gewichte: dort zählt die Phase stärker als die Abwechslung
  if (exercise.phase === ctx.phase) value += ctx.phase === 2 ? 6 : 4;
  if (exercise.level === ctx.level) value += 1;
  if (exercise.compound) value += 1;
  // Belastungs-Tags zählen nicht: ausgeschlossen wird nur, was das Profil schont oder vermeidet
  if (ctx.logged.has(exercise.id)) value += LOGGED_BONUS;
  if (ctx.previous.has(exercise.id)) value += PREVIOUS_BONUS;
  if (ctx.replacements.has(exercise.id)) value += REPLACEMENT_BONUS;
  value -= 5 * (ctx.used.get(exercise.id) ?? 0);
  return value;
}

// Bestes passendes Exercise. In Phase 1 zuerst nur Phase-1-Übungen, sonst alles erlaubte.
function pick(ctx, session, match) {
  const taken = new Set(session.map((exercise) => exercise.id));
  const candidates = ctx.pool.filter((exercise) => !taken.has(exercise.id) && match(exercise));
  const inPhase = candidates.filter((exercise) => exercise.phase <= ctx.phase);
  const list = inPhase.length ? inPhase : candidates;
  if (!list.length) return null;
  list.sort((a, b) => score(b, ctx) - score(a, ctx) || ctx.order.get(a.id) - ctx.order.get(b.id));
  let chosen = list[0];
  // Dauerhaft gewählte Alternative ersetzt die Übung, sofern erlaubt
  const replacement = ctx.byId.get(ctx.prefs[chosen.id]?.replacedBy);
  if (replacement && ctx.pool.includes(replacement) && !taken.has(replacement.id)) chosen = replacement;
  return chosen;
}

function add(ctx, session, match) {
  const exercise = pick(ctx, session, match);
  if (exercise) session.push(exercise);
  return exercise;
}

const is = {
  knee: (e) => e.pattern === 'kniedominant' && e.compound,
  hip: (e) => e.pattern === 'hueftdominant' && e.compound,
  pullH: (e) => e.pattern === 'ziehen' && e.plane === 'horizontal' && e.muscleGroup === 'ruecken' && e.compound,
  pullV: (e) => e.pattern === 'ziehen' && e.plane === 'vertikal' && e.compound,
  push: (plane) => (e) => e.pattern === 'druecken' && e.compound && e.plane === plane,
  anyPush: (e) => e.pattern === 'druecken' && e.compound && e.plane,
  pull: (e) => e.pattern === 'ziehen',
  core: (e) => e.muscleGroup === 'core',
  calves: (e) => e.pattern === 'kniedominant' && !e.compound,
};

const count = (session, predicate) => session.filter(predicate).length;
const pulls = (session) => count(session, (e) => e.pattern === 'ziehen');
const pushes = (session) => count(session, (e) => e.pattern === 'druecken');

// Mindestens zwei Übungen in jeder Muskelgruppe, die der Fokus meint
function ensureFocusGroups(ctx, session) {
  const groups = [...new Set(ctx.focus.map((item) => FOCUS_GROUPS[item]).filter(Boolean))];
  for (const group of groups) {
    while (session.length < MAX_EXERCISES && count(session, (e) => e.muscleGroup === group) < 2) {
      if (!add(ctx, session, (e) => e.muscleGroup === group)) break;
    }
  }
}

// Zug und Druck ins Verhältnis aus dem Profil bringen
function balanceRatio(ctx, session, pushPlanes) {
  while (session.length < MAX_EXERCISES) {
    const currentPush = Math.max(1, pushes(session));
    const current = pulls(session) / currentPush;
    if (current < ctx.ratio - 0.01) {
      if (!add(ctx, session, is.pull)) break;
    } else if (pushes(session) && current > ctx.ratio + 0.01 && pulls(session) / (pushes(session) + 1) >= ctx.ratio - 0.01) {
      const plane = pushPlanes.find((p) => !session.some((e) => e.pattern === 'druecken' && e.plane === p)) ?? 'horizontal';
      if (!add(ctx, session, is.push(plane)) && !add(ctx, session, is.anyPush)) break;
    } else {
      break;
    }
  }
}

function addFocusAccessory(ctx, session) {
  if (!ctx.focus.length || session.length >= MAX_EXERCISES) return;
  add(ctx, session, (e) => focusMatches(e, ctx) > 0 && e.muscleGroup !== 'core');
}

const SLOT_ORDER = ['kniedominant', 'hueftdominant', 'ziehen', 'druecken', 'tragen', 'rotation', 'stabilisation'];
function sortSession(session) {
  const rank = (e) => {
    if (e.muscleGroup === 'core') return 10;
    const base = SLOT_ORDER.indexOf(e.pattern);
    return (base < 0 ? 8 : base) + (e.compound ? 0 : 0.5);
  };
  return [...session].sort((a, b) => rank(a) - rank(b));
}

function fullBody(ctx, variant) {
  const session = [];
  const mainPush = variant % 2 === 0 ? 'horizontal' : 'vertikal';
  add(ctx, session, is.knee);
  add(ctx, session, is.hip);
  add(ctx, session, is.pullH);
  add(ctx, session, is.pullV);
  if (!add(ctx, session, is.push(mainPush))) add(ctx, session, is.anyPush);
  add(ctx, session, is.core);
  ensureFocusGroups(ctx, session);
  balanceRatio(ctx, session, [mainPush, mainPush === 'horizontal' ? 'vertikal' : 'horizontal']);
  addFocusAccessory(ctx, session);
  return sortSession(session);
}

function upperBody(ctx) {
  const session = [];
  add(ctx, session, is.pullH);
  add(ctx, session, is.pullV);
  add(ctx, session, is.push('horizontal'));
  add(ctx, session, is.push('vertikal'));
  balanceRatio(ctx, session, ['horizontal', 'vertikal']);
  ensureFocusGroups(ctx, session);
  addFocusAccessory(ctx, session);
  if (session.length < 6) add(ctx, session, is.core);
  return sortSession(session);
}

function lowerBody(ctx) {
  const session = [];
  add(ctx, session, is.knee);
  add(ctx, session, is.hip);
  add(ctx, session, is.knee);
  add(ctx, session, is.hip);
  add(ctx, session, is.calves);
  add(ctx, session, is.core);
  if (ctx.focus.some((item) => FOCUS_GROUPS[item] === 'beine')) addFocusAccessory(ctx, session);
  return sortSession(session);
}

const mobilises = (exercise, ctx) => ctx.regions.filter((region) => exercise.tags.includes(`mobilisiert:${region}`)).length;

/*
  Mobility-Block: vier Übungen à 75 Sekunden (mit Fokus Beweglichkeit sechs), je Plan versetzt.
  Leichte Mobility für jede geschonte Region kommt zuerst.
*/
function mobilityBlock(ctx, variant) {
  const size = MOBILITY_COUNT + (ctx.focus.includes('beweglichkeit') ? MOBILITY_EXTRA : 0);
  const rank = (a, b) => focusMatches(b, ctx) - focusMatches(a, ctx) || ctx.order.get(a.id) - ctx.order.get(b.id);
  const block = [];
  // Je geschonte Region mindestens eine passende Übung, je Plan eine andere
  for (const region of ctx.regions) {
    const matching = ctx.mobility.filter((exercise) => exercise.tags.includes(`mobilisiert:${region}`) && !block.includes(exercise)).sort(rank);
    if (matching.length && block.length < size) block.push(matching[variant % matching.length]);
  }
  const rest = ctx.mobility.filter((exercise) => !block.includes(exercise))
    .sort((a, b) => mobilises(b, ctx) - mobilises(a, ctx) || rank(a, b));
  for (let i = 0; rest.length && block.length < size && i < rest.length; i++) {
    const exercise = rest[(variant * 2 + i) % rest.length];
    if (!block.includes(exercise)) block.push(exercise);
  }
  return block.map((exercise) => ({ exerciseId: exercise.id, seconds: MOBILITY_SECONDS }));
}

function toEntries(ctx, session) {
  return session.map((exercise) => {
    ctx.used.set(exercise.id, (ctx.used.get(exercise.id) ?? 0) + 1);
    return { exerciseId: exercise.id, ...prescription(exercise, ctx.level, ctx.phase) };
  });
}

/*
  Erzeugt die Pläne.
  daysPerWeek bis 2: Plan A und B (Ganzkörper), 3: zusätzlich Plan C,
  ab 4: Oberkörper/Unterkörper-Split mit vier Plänen.
  history: IDs von Übungen mit Trainingslog, sie bleiben bevorzugt im Plan.
  previous: bisherige Pläne, damit ein Neuaufbau nur ändert, was sich ändern muss.
*/
export function generatePlans({ training, exercises, prefs = {}, phase = 1, generatedAt = null, history = [], previous = [] }) {
  const ctx = createContext({ training, exercises, prefs, phase, history, previous });
  const days = Math.max(1, Number(training.daysPerWeek) || 2);
  const plans = [];

  if (days >= 4) {
    const layout = [['A', 'Oberkörper A', 'oberkoerper', 0], ['B', 'Unterkörper A', 'unterkoerper', 0], ['C', 'Oberkörper B', 'oberkoerper', 1], ['D', 'Unterkörper B', 'unterkoerper', 1]];
    for (const [id, name, type, variant] of layout) {
      const session = type === 'oberkoerper' ? upperBody(ctx) : lowerBody(ctx);
      plans.push({ id, name, type, mobility: mobilityBlock(ctx, plans.length), exercises: toEntries(ctx, session) });
    }
  } else {
    const ids = days >= 3 ? ['A', 'B', 'C'] : ['A', 'B'];
    ids.forEach((id, variant) => {
      plans.push({ id, name: `Plan ${id}`, type: 'ganzkoerper', mobility: mobilityBlock(ctx, variant), exercises: toEntries(ctx, fullBody(ctx, variant)) });
    });
  }

  return {
    version: 1,
    generatedAt,
    phase: ctx.phase,
    daysPerWeek: days,
    sessionsPerPhase: SESSIONS_PER_PHASE,
    plans,
  };
}

// Wechsel nur vorschlagen: Phase 1 und genug Einheiten seit Phasenbeginn
export function shouldSuggestPhaseChange(phase, finishedInPhase) {
  return phase === 1 && finishedInPhase >= SESSIONS_PER_PHASE;
}

/*
  Progressionsvorschlag aus der letzten Einheit mit dieser Übung.
  lastSets: Sätze der letzten Einheit, entry: Planeintrag mit repRange und progressionRule.
*/
export function suggestProgression(entry, lastSets) {
  const [min, max] = entry.repRange;
  const rule = entry.progressionRule ?? {};
  if (!lastSets?.length) return { weight: null, reps: min, text: 'Erstes Mal: Wähle ein Gewicht, mit dem alle Sätze sauber gelingen.' };
  const weight = Math.max(...lastSets.map((set) => Number(set.weight) || 0));
  const reachedTop = lastSets.length >= entry.sets && lastSets.every((set) => (Number(set.reps) || 0) >= max);
  if (rule.type === 'zeit') {
    return reachedTop
      ? { weight, reps: max + (rule.stepSeconds ?? 5), text: `Letztes Mal alle Sätze über ${max} s. Heute ${max + (rule.stepSeconds ?? 5)} s.` }
      : { weight, reps: Math.max(min, ...lastSets.map((set) => Number(set.reps) || 0)), text: `Ziel: ${max} Sekunden in allen Sätzen.` };
  }
  if (rule.type === 'doppelprogression' && weight > 0) {
    return reachedTop
      ? { weight: weight + rule.stepKg, reps: min, text: `Stark! Heute ${formatKg(weight + rule.stepKg)} kg, starte mit ${min} Wiederholungen.` }
      : { weight, reps: min, text: `Bleib bei ${formatKg(weight)} kg und steigere dich Richtung ${max} Wiederholungen.` };
  }
  if (rule.type === 'wiederholungen') {
    return reachedTop
      ? { weight, reps: max, text: 'Alle Sätze geschafft. Zeit für eine schwerere Variante.' }
      : { weight, reps: min, text: `Ziel: ${max} Wiederholungen in allen Sätzen.` };
  }
  return { weight, reps: min, text: rule.text ?? '' };
}

/*
  Was sich zwischen zwei Planständen geändert hat, mit Grund.
  before und after: { training, phase, prefs, plans }. Verglichen werden alle Übungen
  aller Pläne samt Mobility, unabhängig davon, in welchem Plan sie stehen.
*/
export function diffPlans(before, after, exercises) {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const name = (id) => byId.get(id)?.name ?? id;
  const oldIds = planExerciseIds(before.plans);
  const newIds = planExerciseIds(after.plans);
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  // Ohne bekannten Vorher-Stand (z. B. aus alten Einheiten abgeleitet) nur allgemeine Gründe
  const bt = before.training ?? null;
  const at = after.training ?? {};

  // Allgemeiner Grund, wenn eine Übung nicht ausgeschlossen ist, aber trotzdem wegfällt
  const generalReason = () => {
    if (before.phase && before.phase !== after.phase) return after.phase === 2 ? 'Phase 2 mit freien Gewichten' : 'zurück in Phase 1';
    if (bt && Number(bt.daysPerWeek) !== Number(at.daysPerWeek)) return `neue Aufteilung auf ${at.daysPerWeek} ${Number(at.daysPerWeek) === 1 ? 'Tag' : 'Tage'}`;
    if (bt && !same(bt.focus, at.focus)) return 'neuer Fokus';
    return 'Plan neu zusammengestellt';
  };

  const newRegions = regionIds(at).filter((region) => !bt || !regionIds(bt).includes(region));
  const isMobility = (id) => byId.get(id)?.pattern === 'mobilitaet';

  const removed = [...oldIds].filter((id) => !newIds.has(id)).map((id) => {
    const exercise = byId.get(id);
    const reasons = exercise ? exclusionReasons(exercise, at, after.prefs) : [];
    if (reasons.length) return { id, name: name(id), reason: reasons.map(reasonText).join(', '), excluded: true };
    // Mobility einer nicht mehr geschonten Region, oder Platz für neu geschonte Regionen
    const liftedRegion = isMobility(id) && bt ? regionIds(bt).find((r) => !regionIds(at).includes(r) && exercise?.tags.includes(`mobilisiert:${r}`)) : null;
    let reason = generalReason();
    if (liftedRegion) reason = `Schonung ${regionLabel(liftedRegion)} aufgehoben`;
    else if (isMobility(id) && newRegions.length) reason = `Platz für Mobility für ${newRegions.map(regionLabel).join(', ')}`;
    return { id, name: name(id), reason, excluded: false };
  });

  const added = [...newIds].filter((id) => !oldIds.has(id)).map((id) => {
    const exercise = byId.get(id);
    const region = exercise ? regionIds(at).find((r) => exercise.tags.includes(`mobilisiert:${r}`)) : null;
    if (region && isMobility(id)) return { id, name: name(id), reason: `Mobility für ${regionLabel(region)}` };
    // Vorher ausgeschlossen, jetzt wieder erlaubt
    const lifted = exercise && bt ? exclusionReasons(exercise, bt, before.prefs) : [];
    if (lifted.length) return { id, name: name(id), reason: lifted.map(liftedText).join(', '), lifted: true };
    // Ersatz: Alternative derselben Muskelgruppe, sonst eine ausgeschlossene Übung mit gleichem Bewegungsmuster
    const replaces = removed.find((entry) => exercise?.alternatives.includes(entry.id) || byId.get(entry.id)?.alternatives.includes(id))
      ?? removed.find((entry) => entry.excluded && byId.get(entry.id)?.pattern === exercise?.pattern);
    const focus = exercise ? (at.focus ?? []).find((item) => exercise.focus.includes(item) && !(bt?.focus ?? []).includes(item)) : null;
    let reason = 'neu im Plan';
    if (replaces) reason = `statt ${replaces.name}`;
    else if (focus) reason = `Fokus ${focusLabel(focus)}`;
    return { id, name: name(id), reason };
  });

  // Weggefallen ohne eigenen Ausschluss, weil wieder erlaubte Übungen den Platz brauchen
  if (added.some((entry) => entry.lifted)) {
    for (const entry of removed) if (!entry.excluded && entry.reason === 'Plan neu zusammengestellt') entry.reason = 'Platz für wieder erlaubte Übungen';
  }

  return { removed, added: added.map(({ lifted, ...entry }) => entry), changed: removed.length > 0 || added.length > 0 };
}

/* Prüfung der Übungsbibliothek (für Script und Tests) */

const REQUIRED = ['id', 'name', 'muscleGroup', 'pattern', 'equipment', 'level', 'phase', 'tags', 'setupHints', 'cues', 'commonMistakes', 'alternatives', 'youtubeSearch', 'svg'];
const GROUPS = ['beine', 'ruecken', 'brust', 'schultern', 'arme', 'core', 'mobility'];

export function validateLibrary(exercises) {
  const errors = [];
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  if (byId.size !== exercises.length) errors.push('Doppelte IDs in der Bibliothek.');
  if (exercises.length < 45) errors.push(`Nur ${exercises.length} Übungen, mindestens 45 nötig.`);
  for (const exercise of exercises) {
    for (const field of REQUIRED) {
      if (exercise[field] === undefined) errors.push(`${exercise.id}: Feld ${field} fehlt.`);
    }
    if (!GROUPS.includes(exercise.muscleGroup)) errors.push(`${exercise.id}: unbekannte muscleGroup ${exercise.muscleGroup}.`);
    if (![1, 2].includes(exercise.level) || ![1, 2].includes(exercise.phase)) errors.push(`${exercise.id}: level und phase müssen 1 oder 2 sein.`);
    if (exercise.cues.length < 3 || exercise.cues.length > 4) errors.push(`${exercise.id}: 3 bis 4 Cues erwartet.`);
    if (exercise.commonMistakes.length !== 2) errors.push(`${exercise.id}: 2 häufige Fehler erwartet.`);
    if (/watch\?v=|youtu\.be/.test(exercise.youtubeSearch)) errors.push(`${exercise.id}: youtubeSearch muss ein Suchbegriff sein, keine Video-ID.`);
    for (const tag of exercise.tags) {
      const [kind, id] = tag.split(':');
      const known = kind === 'bewegung' ? MOVEMENT_IDS.includes(id) : (kind === 'belastet' || kind === 'mobilisiert') && REGION_IDS.includes(id);
      if (!known) errors.push(`${exercise.id}: unbekannter Tag ${tag}.`);
      if (kind === 'mobilisiert' && exercise.pattern !== 'mobilitaet') errors.push(`${exercise.id}: mobilisiert nur an Mobility-Übungen.`);
    }
    for (const item of exercise.focus ?? []) {
      if (!FOCUS_IDS.includes(item)) errors.push(`${exercise.id}: unbekannter Fokus ${item}.`);
    }
    for (const altId of exercise.alternatives) {
      const alt = byId.get(altId);
      if (!alt) errors.push(`${exercise.id}: Alternative ${altId} existiert nicht.`);
      else if (alt.muscleGroup !== exercise.muscleGroup || alt.level !== exercise.level) errors.push(`${exercise.id}: Alternative ${altId} hat andere Muskelgruppe oder anderes Level.`);
    }
  }
  return errors;
}
