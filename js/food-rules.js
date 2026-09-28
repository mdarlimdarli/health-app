/*
  Regeln für Ernährung: Ampel, Ausschlüsse, Vorschläge. Rein funktional.
  Die Ampel wird zur Laufzeit aus profile.diet.intolerances berechnet und nie gespeichert.
  Ausschlüsse kommen aus profile.diet.dislikes, bevorzugte Küchen aus profile.diet.cuisines.
*/

export const INTOLERANCE_LABELS = {
  fructose: 'Fruktose',
  lactose: 'Laktose',
  histamine: 'Histamin',
  gluten: 'Gluten',
  sorbit: 'Sorbit',
};

export const MEAL_SLOTS = [
  { id: 'fruehstueck', label: 'Frühstück' },
  { id: 'mittag', label: 'Mittag' },
  { id: 'abend', label: 'Abend' },
];

export const RATING_LABELS = { gruen: 'gut verträglich', gelb: 'in Maßen', rot: 'eher meiden', neutral: 'keine Einschränkung' };

const LEVELS = { niedrig: 0, mittel: 1, hoch: 2 };
const RATINGS = ['gruen', 'gelb', 'rot'];

/*
  Ampel eines Lebensmittels für die Unverträglichkeiten aus dem Profil.
  Stufen (Fruktose, Histamin) und Ja/Nein-Felder (Laktose, Gluten) werden auf 0 bis 2 abgebildet,
  das schlechteste Ergebnis zählt. Ohne passende Angaben bleibt es neutral.
*/
export function foodRating(food, intolerances = []) {
  let worst = -1;
  const reasons = [];
  for (const key of intolerances) {
    const value = food?.[key];
    let score = null;
    if (typeof value === 'string' && value in LEVELS) score = LEVELS[value];
    else if (typeof value === 'boolean') score = value ? 2 : 0;
    if (score === null) continue;
    worst = Math.max(worst, score);
    if (score > 0) reasons.push(`${INTOLERANCE_LABELS[key] ?? key} ${typeof value === 'boolean' ? 'enthalten' : value}`);
  }
  return { level: worst < 0 ? 'neutral' : RATINGS[worst], reasons };
}

// Ampel eines Gerichts: schlechteste Zutat, dazu die auffälligen Zutaten
export function mealRating(meal, foodsById, intolerances = []) {
  let worst = -1;
  const flagged = [];
  for (const id of meal.ingredients ?? []) {
    const food = foodsById.get(id);
    if (!food) continue;
    const rating = foodRating(food, intolerances);
    const index = RATINGS.indexOf(rating.level);
    worst = Math.max(worst, index);
    if (index > 0) flagged.push({ food, rating });
  }
  return { level: worst < 0 ? 'neutral' : RATINGS[worst], flagged };
}

// Ausgeschlossen, wenn ein Tag oder eine Zutat einem Eintrag aus dislikes entspricht
export function isExcluded(meal, dislikes = []) {
  if (!dislikes.length) return false;
  return (meal.tags ?? []).some((tag) => dislikes.includes(tag)) || (meal.ingredients ?? []).some((id) => dislikes.includes(id));
}

export function excludedBy(meal, dislikes = []) {
  return [...(meal.tags ?? []), ...(meal.ingredients ?? [])].filter((item) => dislikes.includes(item));
}

/*
  Vorschläge für einen Slot: nie Ausgeschlossenes, bevorzugte Küchen zuerst,
  dann die bessere Ampel, dann alphabetisch.
*/
export function candidates(data, slot, diet, exceptId = null) {
  const foodsById = new Map((data.foods ?? []).map((food) => [food.id, food]));
  const cuisines = diet.cuisines ?? [];
  const rank = { gruen: 0, neutral: 0, gelb: 1, rot: 2 };
  return (data.meals ?? [])
    .filter((meal) => meal.slot === slot && meal.id !== exceptId && !isExcluded(meal, diet.dislikes ?? []))
    .map((meal) => ({ meal, rating: mealRating(meal, foodsById, diet.intolerances ?? []) }))
    .sort((a, b) =>
      (cuisines.includes(b.meal.cuisine) ? 1 : 0) - (cuisines.includes(a.meal.cuisine) ? 1 : 0)
      || rank[a.rating.level] - rank[b.rating.level]
      || a.meal.name.localeCompare(b.meal.name, 'de'));
}

/*
  Gericht für Tag und Slot: eigener Tausch, sonst Wochenplan.
  Ist das geplante Gericht ausgeschlossen, springt der beste Vorschlag ein.
*/
export function resolveMeal(data, weekday, slot, diet, swappedId = null) {
  const byId = new Map((data.meals ?? []).map((meal) => [meal.id, meal]));
  const swapped = swappedId ? byId.get(swappedId) : null;
  if (swapped && !isExcluded(swapped, diet.dislikes ?? [])) return { meal: swapped, source: 'tausch' };
  const planned = byId.get((data.weekPlan ?? []).find((day) => Number(day.weekday) === weekday)?.slots?.[slot]);
  if (planned && !isExcluded(planned, diet.dislikes ?? [])) return { meal: planned, source: 'plan' };
  const [best] = candidates(data, slot, diet, planned?.id);
  if (best) return { meal: best.meal, source: planned ? 'ersatz' : 'vorschlag', replaced: planned ?? null };
  return { meal: null, source: 'leer', replaced: planned ?? null };
}

export function validateMeals(data) {
  const errors = [];
  const foods = new Set((data.foods ?? []).map((f) => f.id));
  const meals = new Set((data.meals ?? []).map((m) => m.id));
  for (const meal of data.meals ?? []) {
    if (!['fruehstueck', 'mittag', 'abend', 'snack'].includes(meal.slot)) errors.push(`${meal.id}: unbekannter Slot ${meal.slot}.`);
    for (const id of meal.ingredients ?? []) if (!foods.has(id)) errors.push(`${meal.id}: Zutat ${id} fehlt in foods.`);
  }
  for (const day of data.weekPlan ?? []) {
    for (const id of Object.values(day.slots ?? {})) if (id && !meals.has(id)) errors.push(`Wochentag ${day.weekday}: Gericht ${id} fehlt in meals.`);
  }
  return errors;
}
