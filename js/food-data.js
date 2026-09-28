/*
  Datenzugriff Ernährung: data/meals.json laden (Inhalt, kommt von außen),
  eigene Tausche (settings mealSwaps) und Feedback (Store mealFeedback).
*/

import * as db from './db.js';
import { getProfile } from './profile.js';
import { resolveMeal, MEAL_SLOTS } from './food-rules.js';

let cache = null;

// fresh: Netz erzwingen (Button "Essensplan aktualisieren"), sonst Speicher oder Service-Worker-Cache
export async function loadMeals({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  try {
    const response = await fetch('./data/meals.json', { cache: fresh ? 'reload' : 'no-cache' });
    if (!response.ok) return cache;
    const data = await response.json();
    const notes = Array.isArray(data.notes) ? data.notes : data.note ? [data.note] : [];
    cache = { version: data.version ?? 0, updatedAt: data.updatedAt ?? null, notes, foods: data.foods ?? [], meals: data.meals ?? [], weekPlan: data.weekPlan ?? [] };
  } catch {
    // offline ohne Cache: bisheriger Stand bleibt
  }
  return cache;
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
