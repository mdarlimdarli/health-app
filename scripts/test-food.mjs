#!/usr/bin/env node
/*
  Tests für Ampel, Ausschlüsse und Vorschläge. Synthetische Profile, dazu die Beispieldatei.
  Aufruf: node scripts/test-food.mjs
*/

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { foodRating, mealRating, isExcluded, candidates, resolveMeal, validateMeals } from '../js/food-rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'data', 'meals.json'), 'utf8'));
const foods = new Map(data.foods.map((f) => [f.id, f]));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FEHLER  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

test('Beispieldatei: 3 Gerichte, 12 Lebensmittel, gültig', () => {
  assert.equal(data.meals.length, 3);
  assert.equal(data.foods.length, 12);
  assert.deepEqual(validateMeals(data), []);
  assert.ok(data.foods.every((f) => !('ampel' in f) && !('rating' in f)), 'Ampel darf nicht in der Datei stehen');
});

test('Ampel ohne Unverträglichkeiten ist neutral', () => {
  assert.equal(foodRating(foods.get('zwiebel'), []).level, 'neutral');
});

test('Ampel nach Stufen und Ja/Nein-Feldern', () => {
  assert.equal(foodRating(foods.get('zwiebel'), ['fructose']).level, 'rot');
  assert.equal(foodRating(foods.get('kokosmilch'), ['fructose']).level, 'gelb');
  assert.equal(foodRating(foods.get('reis'), ['fructose', 'histamine', 'lactose', 'gluten']).level, 'gruen');
  assert.equal(foodRating(foods.get('milch'), ['lactose']).level, 'rot');
  assert.equal(foodRating(foods.get('milch'), ['fructose']).level, 'gruen');
  assert.deepEqual(foodRating(foods.get('sojasauce'), ['histamine', 'gluten']).reasons, ['Histamin hoch', 'Gluten enthalten']);
});

test('Unbekannte Unverträglichkeit ohne Feld wird ignoriert', () => {
  assert.equal(foodRating(foods.get('reis'), ['sorbit']).level, 'neutral');
});

test('Gericht: schlechteste Zutat zählt', () => {
  const curry = data.meals.find((m) => m.id === 'rotes-curry-huhn');
  const result = mealRating(curry, foods, ['fructose']);
  assert.equal(result.level, 'rot');
  assert.deepEqual(result.flagged.map((f) => f.food.id), ['kokosmilch', 'zwiebel']);
});

test('Ausschluss über Tag oder Zutat', () => {
  const curry = data.meals.find((m) => m.id === 'rotes-curry-huhn');
  assert.equal(isExcluded(curry, ['kokosmilch']), true);
  assert.equal(isExcluded(curry, ['zwiebel']), true);
  assert.equal(isExcluded(curry, ['pilze']), false);
});

test('Vorschläge: nie ausgeschlossen, bevorzugte Küche zuerst, dann Ampel', () => {
  const extra = {
    ...data,
    meals: [
      ...data.meals,
      { id: 'a', name: 'A Gericht', cuisine: 'italienisch', slot: 'abend', ingredients: ['reis'], tags: [] },
      { id: 'b', name: 'B Gericht', cuisine: 'thai', slot: 'abend', ingredients: ['zwiebel'], tags: [] },
      { id: 'c', name: 'C Gericht', cuisine: 'mexikanisch', slot: 'abend', ingredients: ['reis'], tags: ['breiig'] },
    ],
  };
  const diet = { intolerances: ['fructose'], cuisines: ['thai'], dislikes: ['kokosmilch', 'breiig'] };
  assert.deepEqual(candidates(extra, 'abend', diet).map((c) => c.meal.id), ['b', 'a']);
  assert.deepEqual(candidates(extra, 'abend', { intolerances: ['fructose'], cuisines: [], dislikes: [] }).map((c) => c.meal.id), ['a', 'c', 'b', 'rotes-curry-huhn']);
});

test('Geplantes, aber ausgeschlossenes Gericht wird ersetzt oder fällt weg', () => {
  const diet = { intolerances: [], cuisines: [], dislikes: ['kokosmilch'] };
  const result = resolveMeal(data, 1, 'abend', diet);
  assert.equal(result.meal, null);
  assert.equal(result.replaced.id, 'rotes-curry-huhn');
  assert.equal(resolveMeal(data, 1, 'mittag', diet).meal.id, 'lachs-reis-bowl');
});

test('Eigener Tausch hat Vorrang, außer er ist ausgeschlossen', () => {
  const extra = { ...data, meals: [...data.meals, { id: 'x', name: 'X', cuisine: 'thai', slot: 'mittag', ingredients: ['reis'], tags: ['testtag'] }] };
  assert.equal(resolveMeal(extra, 2, 'mittag', { dislikes: [] }, 'x').meal.id, 'x');
  const fallback = resolveMeal(extra, 2, 'mittag', { dislikes: ['testtag'] }, 'x');
  assert.equal(fallback.source, 'plan');
  assert.equal(fallback.meal.id, 'lachs-reis-bowl');
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
