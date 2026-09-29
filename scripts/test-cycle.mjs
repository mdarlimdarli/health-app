#!/usr/bin/env node
/*
  Tests für die Zyklus-Symptome. Nur synthetische Daten.
  Aufruf: node scripts/test-cycle.mjs
*/

import assert from 'node:assert/strict';
import {
  SYMPTOMS, DEFAULT_SYMPTOMS, normalizeEntry, isEmpty, promotionCandidates, cycleRanges,
  currentCycleStrip, symptomPattern, bleedingLevel, symptomsText, addDays,
} from '../js/cycle-symptoms.js';

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

const entry = (date, symptoms = [], bleeding = 'keine') => ({ id: date, date, symptoms: symptoms.map((key) => (Array.isArray(key) ? { key: key[0], intensity: key[1] } : { key, intensity: 1 })), bleeding, note: '' });

test('Liste: 20 Symptome, Standard sind 6 davon', () => {
  assert.equal(SYMPTOMS.length, 20);
  assert.equal(DEFAULT_SYMPTOMS.length, 6);
  assert.ok(DEFAULT_SYMPTOMS.every((key) => SYMPTOMS.some(([k]) => k === key)));
});

test('Eintrag bereinigen: nur bekannte Symptome, Stärke 1 bis 3, bekannte Blutung', () => {
  const clean = normalizeEntry({ date: '2026-09-01', symptoms: [{ key: 'kraempfe', intensity: 2 }, { key: 'gibt-es-nicht', intensity: 1 }, { key: 'muedigkeit', intensity: 5 }, { key: 'kraempfe', intensity: 3 }], bleeding: 'extrem' });
  assert.deepEqual(clean.symptoms, [{ key: 'kraempfe', intensity: 2 }]);
  assert.equal(clean.bleeding, 'keine');
  assert.equal(isEmpty(normalizeEntry({ date: '2026-09-01' })), true);
  assert.equal(isEmpty(entry('2026-09-01', [], 'leicht')), false);
});

test('Standardliste: dreimal in 60 Tagen rückt nach, älter zählt nicht', () => {
  const today = '2026-09-29';
  const entries = [
    entry('2026-09-28', ['kopfschmerz']),
    entry('2026-09-10', ['kopfschmerz', 'schwindel']),
    entry('2026-08-05', ['kopfschmerz', 'schwindel']),
    entry('2026-07-20', ['schwindel']), // 71 Tage alt
    entry('2026-09-01', ['kraempfe']),
    entry('2026-09-02', ['kraempfe']),
    entry('2026-09-03', ['kraempfe']),
  ];
  assert.deepEqual(promotionCandidates(entries, DEFAULT_SYMPTOMS, today), ['kopfschmerz']);
});

test('Zyklen aus den Periodenbeginnen, der laufende endet morgen', () => {
  const ranges = cycleRanges(['2026-08-03', '2026-07-05', '2026-08-31', '2026-10-30'], '2026-09-29');
  assert.deepEqual(ranges, [
    { start: '2026-07-05', end: '2026-08-03' },
    { start: '2026-08-03', end: '2026-08-31' },
    { start: '2026-08-31', end: '2026-09-30' },
  ]);
});

test('Kalenderstreifen des aktuellen Zyklus', () => {
  const strip = currentCycleStrip([entry('2026-09-15', [], 'stark'), entry('2026-09-16', ['kraempfe'], 'mittel')], ['2026-08-18', '2026-09-15'], '2026-09-20', 28);
  assert.equal(strip.length, 28);
  assert.deepEqual(strip[0], { day: 1, date: '2026-09-15', future: false, today: false, bleeding: 3, symptoms: 0 });
  assert.equal(strip[1].symptoms, 1);
  assert.equal(strip[5].today, true);
  assert.equal(strip[6].future, true);
  // Länger als erwartet: der Streifen wächst mit
  assert.equal(currentCycleStrip([], ['2026-08-01'], '2026-09-10', 28).length, 41);
  assert.deepEqual(currentCycleStrip([], [], '2026-09-10', 28), []);
});

test('Muster: Zyklustage je Symptom über die letzten drei Zyklen', () => {
  const starts = ['2026-06-07', '2026-07-05', '2026-08-02', '2026-08-30'];
  const entries = [
    entry('2026-06-08', ['kraempfe']), // ältester Zyklus, fällt raus
    entry('2026-07-06', ['kraempfe']), // Tag 2
    entry('2026-08-03', ['kraempfe', ['muedigkeit', 3]]), // Tag 2
    entry('2026-08-31', ['kraempfe']), // Tag 2 im laufenden Zyklus
    entry('2026-09-20', ['muedigkeit']), // Tag 22
  ];
  const pattern = symptomPattern(entries, starts, '2026-09-29');
  assert.equal(pattern.cycles, 3);
  assert.deepEqual(pattern.rows.map((row) => row.key), ['kraempfe', 'muedigkeit']);
  assert.deepEqual([...pattern.rows[0].days], [[2, 3]]);
  assert.deepEqual([...pattern.rows[1].days].sort(), [[2, 1], [22, 1]]);
  assert.equal(pattern.maxDay, 31);
});

test('Hilfen', () => {
  assert.equal(bleedingLevel('keine'), 0);
  assert.equal(bleedingLevel('sehr-stark'), 4);
  assert.equal(bleedingLevel(undefined), 0);
  assert.equal(symptomsText(entry('2026-09-01', [['kraempfe', 2], 'muedigkeit'])), 'Krämpfe (2), Müdigkeit (1)');
  assert.equal(addDays('2026-09-29', 3), '2026-10-02');
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
