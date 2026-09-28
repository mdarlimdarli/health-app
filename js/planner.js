/*
  Trainingsplaner: erzeugt Pläne aus profile.training und der Übungsbibliothek.
  Rein funktional, ohne DOM und ohne Speicher, damit er im Browser und in Node
  (scripts/generate-plans.mjs) gleich rechnet. Alle persönlichen Vorgaben
  (Tage, Level, Fokus, avoidTags, Verhältnis Zug zu Druck, Phase) kommen aus dem Profil.
*/

// Nach so vielen Einheiten in Phase 1 wird der Wechsel vorgeschlagen, nie erzwungen
export const SESSIONS_PER_PHASE = 16;

const MOBILITY_SECONDS = 75;
const MOBILITY_COUNT = 4;
const MAX_EXERCISES = 7;

// Fokus-Begriffe, die eine Muskelgruppe meinen: dort mindestens zwei Übungen pro Einheit
const FOCUS_GROUPS = {
  'oberer-ruecken': 'ruecken',
  ruecken: 'ruecken',
  beine: 'beine',
  gesaess: 'beine',
  brust: 'brust',
  schultern: 'schultern',
  arme: 'arme',
  rumpf: 'core',
  core: 'core',
};

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

export function isAllowed(exercise, avoidTags, prefs = {}) {
  if (prefs[exercise.id]?.disliked) return false;
  return !exercise.tags.some((tag) => avoidTags.includes(tag));
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

function createContext({ training, exercises, prefs = {}, phase }) {
  const level = Math.min(2, Math.max(1, Number(training.level) || 1));
  const avoidTags = Array.isArray(training.avoidTags) ? training.avoidTags : [];
  const focus = Array.isArray(training.focus) ? training.focus : [];
  const pool = exercises.filter((exercise) => exercise.level <= level && isAllowed(exercise, avoidTags, prefs));
  return {
    level,
    phase: phase === 2 ? 2 : 1,
    avoidTags,
    focus,
    prefs,
    ratio: parseRatio(training.pullPushRatio),
    order: new Map(exercises.map((exercise, index) => [exercise.id, index])),
    byId: new Map(exercises.map((exercise) => [exercise.id, exercise])),
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
  // Übungen mit Belastungs-Tags nur, wenn nichts Gleichwertiges da ist
  if (exercise.tags.length) value -= 2;
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

// Mobility-Block: vier Übungen à 75 Sekunden, je Plan versetzt
function mobilityBlock(ctx, variant) {
  const ranked = [...ctx.mobility].sort((a, b) => focusMatches(b, ctx) - focusMatches(a, ctx) || ctx.order.get(a.id) - ctx.order.get(b.id));
  if (!ranked.length) return [];
  const block = [];
  for (let i = 0; i < Math.min(MOBILITY_COUNT, ranked.length); i++) {
    block.push(ranked[(variant * 2 + i) % ranked.length]);
  }
  return [...new Set(block)].map((exercise) => ({ exerciseId: exercise.id, seconds: MOBILITY_SECONDS }));
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
*/
export function generatePlans({ training, exercises, prefs = {}, phase = 1, generatedAt = null }) {
  const ctx = createContext({ training, exercises, prefs, phase });
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
    for (const altId of exercise.alternatives) {
      const alt = byId.get(altId);
      if (!alt) errors.push(`${exercise.id}: Alternative ${altId} existiert nicht.`);
      else if (alt.muscleGroup !== exercise.muscleGroup || alt.level !== exercise.level) errors.push(`${exercise.id}: Alternative ${altId} hat andere Muskelgruppe oder anderes Level.`);
    }
  }
  return errors;
}
