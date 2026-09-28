/*
  Trainingsdaten: Übungsbibliothek, Vorlieben, Phase, Einheiten und die aktuellen Pläne.
  Die Pläne liegen in settings "trainingPlans" samt Signatur ihrer Eingaben. Ändert sich
  eine Vorgabe (Profil, Phase, "Mag ich nicht", dauerhafte Alternative), baut js/planner.js
  sie neu, geloggte und bisherige Übungen bleiben dabei bevorzugt erhalten.
  Was sich seit der letzten Bestätigung geändert hat, steht in settings "trainingPlanChanges".
*/

import * as db from './db.js';
import { getProfile, saveProfile } from './profile.js';
import { generatePlans, diffPlans } from './planner.js';
import { regionIds } from './training-options.js';
import { todayISO } from './ui.js';

// Erhöhen, wenn sich die Planerlogik so ändert, dass bestehende Pläne neu gebaut werden sollen
const PLANNER_VERSION = 2;

let library = null;
let libraryVersion = 0;

export async function loadLibrary() {
  if (!library) {
    const response = await fetch('./data/exercises.json');
    const data = await response.json();
    libraryVersion = `${data.version ?? 1}-${data.exercises.length}`;
    library = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  }
  return library;
}

export async function loadPrefs() {
  const list = await db.getAll('exercisePrefs');
  return Object.fromEntries(list.map((pref) => [pref.exerciseId, pref]));
}

export async function savePref(exerciseId, changes) {
  const current = (await db.get('exercisePrefs', exerciseId)) ?? { exerciseId, disliked: false, replacedBy: null, lastWeight: null, lastReps: null };
  return db.put('exercisePrefs', { ...current, ...changes });
}

export async function currentPhase() {
  const stored = await db.getSetting('trainingPhase');
  return stored ?? (getProfile().training.startPhase === 2 ? 2 : 1);
}

export async function setPhase(phase) {
  await db.setSetting('trainingPhase', phase === 2 ? 2 : 1);
  await db.setSetting('trainingPhaseSince', todayISO());
}

export async function loadWorkouts() {
  const list = await db.getAll('workouts');
  return list.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

export const finishedOf = (list) => list.filter((workout) => workout.finishedAt);
export const activeOf = (list) => list.filter((workout) => !workout.finishedAt).at(-1) ?? null;

// Übernimmt Änderungen an profile.training (Regionen, Bewegungen, Fokus, Tage)
export async function saveTraining(changes) {
  const next = structuredClone(getProfile());
  Object.assign(next.training, changes);
  return saveProfile(next);
}

/* Pläne */

// Nur was den Plan beeinflusst: Enddaten der Schonung und die Vorgaben als Text gehören nicht dazu
function planInputs(training, prefs, phase) {
  return {
    training: {
      daysPerWeek: training.daysPerWeek,
      level: training.level,
      protectRegions: regionIds(training).sort(),
      avoidMovements: [...training.avoidMovements].sort(),
      focus: [...training.focus].sort(),
      pullPushRatio: training.pullPushRatio,
    },
    phase,
    prefs: Object.fromEntries(Object.values(prefs)
      .filter((pref) => pref.disliked || pref.replacedBy)
      .sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1))
      .map((pref) => [pref.exerciseId, { disliked: Boolean(pref.disliked), replacedBy: pref.replacedBy ?? null }])),
  };
}

// Letzter Stand je Plan aus den Einheiten, falls noch keine Pläne gespeichert sind (erster Start nach Update)
function plansFromWorkouts(finished) {
  const byPlan = new Map();
  for (const workout of finished) {
    byPlan.set(workout.planId, {
      id: workout.planId,
      exercises: workout.entries.map((entry) => ({ exerciseId: entry.originalId ?? entry.exerciseId })),
      mobility: (workout.mobility ?? []).map((item) => ({ exerciseId: item.exerciseId })),
    });
  }
  return [...byPlan.values()];
}

async function planOverride() {
  try {
    const response = await fetch('./data/plans.json', { cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.plans) && data.plans.length) return { ...data, source: 'datei' };
    }
  } catch {
    // keine Überschreibung vorhanden
  }
  return null;
}

let queue = Promise.resolve();

// Handgeschriebene data/plans.json hat Vorrang, sonst gespeicherte oder neu erzeugte Pläne
export function loadPlans(lib) {
  // Nacheinander, damit schnelle Änderungen in "Anpassen" sich nicht überholen
  const run = queue.then(() => buildPlans(lib));
  queue = run.catch(() => {});
  return run;
}

async function buildPlans(lib) {
  const override = await planOverride();
  if (override) return override;

  const training = getProfile().training;
  const [prefs, phase, workouts, stored] = await Promise.all([loadPrefs(), currentPhase(), loadWorkouts(), db.getSetting('trainingPlans')]);
  const inputs = planInputs(training, prefs, phase);
  const signature = JSON.stringify({ v: PLANNER_VERSION, lib: libraryVersion, ...inputs });
  if (stored?.signature === signature && stored.plans?.length) return { ...stored, source: 'profil' };

  const exercises = [...lib.values()];
  const finished = finishedOf(workouts);
  const history = [...new Set(finished.flatMap((workout) => workout.sets.map((set) => set.exerciseId)))];
  const previousPlans = stored?.plans?.length ? stored.plans : plansFromWorkouts(finished);
  const result = generatePlans({ training, exercises, prefs, phase, history, previous: previousPlans });
  const next = { ...result, generatedAt: new Date().toISOString(), signature, inputs };
  await db.setSetting('trainingPlans', next);

  // Netto-Änderung seit der letzten Bestätigung, damit mehrere Schritte zusammen sichtbar bleiben
  if (previousPlans.length) {
    const pending = await db.getSetting('trainingPlanChanges');
    const base = pending?.base ?? { training: stored?.inputs?.training ?? null, phase: stored?.inputs?.phase ?? null, prefs: stored?.inputs?.prefs ?? {}, plans: previousPlans };
    const diff = diffPlans(base, { training: inputs.training, phase, prefs: inputs.prefs, plans: result.plans }, exercises);
    await db.setSetting('trainingPlanChanges', diff.changed ? { at: next.generatedAt, base, removed: diff.removed, added: diff.added } : null);
  }
  return { ...next, source: 'profil' };
}

export async function planChanges() {
  return db.getSetting('trainingPlanChanges');
}

export async function dismissPlanChanges() {
  await db.setSetting('trainingPlanChanges', null);
}
