/*
  Datenzugriff Ernährung. Der aktive Essensplan ist persönlich und lebt wie das Profil
  nur in IndexedDB (settings, key "meals") und damit in der verschlüsselten Sicherung.
  Ohne eigenen Plan zeigt die App den neutralen Beispielplan data/meals.example.json.
  Eigene Tausche liegen in settings mealSwaps, Feedback im Store mealFeedback.
*/

import * as db from './db.js';
import { getProfile } from './profile.js';
import { resolveMeal, validateMealsFile, MEAL_SLOTS } from './food-rules.js';

const EXAMPLE_URL = './data/meals.example.json';

let cache = null;

function normalize(data, source) {
  const notes = Array.isArray(data.notes) ? data.notes : data.note ? [data.note] : [];
  return { source, version: data.version ?? 0, updatedAt: data.updatedAt ?? null, notes, foods: data.foods ?? [], meals: data.meals ?? [], weekPlan: data.weekPlan ?? [] };
}

// source: 'eigen' (importiert) oder 'beispiel' (neutraler Beispielplan)
export async function loadMeals({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  const stored = await db.getSetting('meals');
  if (stored) {
    cache = normalize(stored, 'eigen');
    return cache;
  }
  try {
    const response = await fetch(EXAMPLE_URL);
    if (response.ok) cache = normalize(await response.json(), 'beispiel');
  } catch {
    // offline ohne Cache: kein Plan
  }
  return cache;
}

export async function storedMeals() {
  return db.getSetting('meals');
}

// Prüft und speichert einen Plan aus einer Datei. Wirft mit allen gefundenen Fehlern.
export function parseMealsFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const errors = validateMealsFile(data);
  if (errors.length) {
    const error = new Error(`Der Essensplan ist nicht gültig: ${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ` Und ${errors.length - 3} weitere Fehler.` : ''}`);
    error.details = errors;
    throw error;
  }
  return data;
}

export async function importMeals(data) {
  const { version = 1, updatedAt = null, notes, note, foods, meals, weekPlan = [] } = data;
  const stored = { version, updatedAt, notes: Array.isArray(notes) ? notes : note ? [note] : [], foods, meals, weekPlan, importedAt: new Date().toISOString() };
  await db.setSetting('meals', stored);
  cache = null;
  return stored;
}

export function diet() {
  return getProfile().diet ?? { intolerances: [], cuisines: [], dislikes: [] };
}

export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

const swapKey = (date, slot) => `${date}|${slot}`;

export async function getSwaps() {
  return (await db.getSetting('mealSwaps')) ?? {};
}

export async function setSwap(date, slot, mealId) {
  const swaps = await getSwaps();
  swaps[swapKey(date, slot)] = mealId;
  await db.setSetting('mealSwaps', swaps);
}

// Gerichte eines Tages je Slot
export async function mealsForDate(date) {
  const data = await loadMeals();
  if (!data?.meals.length) return null;
  const swaps = await getSwaps();
  return MEAL_SLOTS.map((slot) => ({ slot, ...resolveMeal(data, weekdayOf(date), slot.id, diet(), swaps[swapKey(date, slot.id)]) }));
}

/* Feedback: ein Eintrag pro Tag, Slot und Gericht */

const feedbackId = (date, slot, mealId) => `${date}|${slot}|${mealId}`;

export async function getFeedback(date, slot, mealId) {
  return (await db.get('mealFeedback', feedbackId(date, slot, mealId))) ?? null;
}

export async function saveFeedback(date, slot, mealId, changes) {
  const current = (await getFeedback(date, slot, mealId)) ?? { id: feedbackId(date, slot, mealId), date, slot, mealId, tolerated: null, liked: null, note: '' };
  return db.put('mealFeedback', { ...current, ...changes });
}
