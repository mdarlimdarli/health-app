#!/usr/bin/env node
/*
  Tests für die Zeitplan-Regeln der Medikamente. Nur synthetische Einträge.
  Aufruf: node scripts/test-meds.mjs
*/

import assert from 'node:assert/strict';
import { isScheduledOn, dueSlots, dayPlan, openNow, openToday, nudgeDue, streak, adherence, logKey, nextScheduledDate, weekdayOf, addDays, slotsOf } from '../js/meds-schedule.js';

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

const med = (id, schedule, extra = {}) => ({ id, name: id, dosage: '', type: 'medication', active: true, critical: false, notes: '', schedule, ...extra });
const logsFrom = (entries) => new Map(entries.map(([date, id, slot]) => [logKey(date, id, slot), { id: logKey(date, id, slot), date, medId: id, slot, taken: true }]));

test('Wochentag: 2026-09-28 ist ein Montag', () => {
  assert.equal(weekdayOf('2026-09-28'), 1);
  assert.equal(weekdayOf('2026-10-04'), 7);
});

test('daily mit Start- und Enddatum', () => {
  const m = med('a', { type: 'daily', slots: ['morgen'], startDate: '2026-09-10', endDate: '2026-09-20' });
  assert.equal(isScheduledOn(m, '2026-09-09'), false);
  assert.equal(isScheduledOn(m, '2026-09-10'), true);
  assert.equal(isScheduledOn(m, '2026-09-20'), true);
  assert.equal(isScheduledOn(m, '2026-09-21'), false);
});

test('everyNDays ab startDate', () => {
  const m = med('b', { type: 'everyNDays', n: 2, slots: ['morgen'], startDate: '2026-09-01' });
  assert.equal(isScheduledOn(m, '2026-09-01'), true);
  assert.equal(isScheduledOn(m, '2026-09-02'), false);
  assert.equal(isScheduledOn(m, '2026-09-03'), true);
});

test('everyNDays ohne startDate zählt ab dem ersten Log', () => {
  const m = med('c', { type: 'everyNDays', n: 3, slots: ['abend'] });
  assert.equal(isScheduledOn(m, '2026-09-10', '2026-09-04'), true);
  assert.equal(isScheduledOn(m, '2026-09-11', '2026-09-04'), false);
  assert.equal(isScheduledOn(m, '2026-09-11'), true, 'ohne Log ist heute fällig');
});

test('weekly nach Wochentag 1 bis 7', () => {
  const m = med('d', { type: 'weekly', weekday: 1, slots: ['morgen'] });
  assert.equal(isScheduledOn(m, '2026-09-28'), true);
  assert.equal(isScheduledOn(m, '2026-09-29'), false);
});

test('seasonal nach Monatsliste', () => {
  const m = med('e', { type: 'seasonal', months: [12, 1, 2], slots: ['abend'] });
  assert.equal(isScheduledOn(m, '2026-12-05'), true);
  assert.equal(isScheduledOn(m, '2027-02-28'), true);
  assert.equal(isScheduledOn(m, '2026-09-28'), false);
});

test('pausierte Einträge sind nie fällig', () => {
  assert.equal(isScheduledOn(med('f', { type: 'daily' }, { active: false }), '2026-09-28'), false);
});

test('Slots in Tagesreihenfolge, ohne Slots gilt Morgen', () => {
  assert.deepEqual(slotsOf(med('g', { slots: ['nach-abend', 'morgen'] })), ['morgen', 'nach-abend']);
  assert.deepEqual(slotsOf(med('h', {})), ['morgen']);
});

test('Tagesplan: zukünftiger Start erscheint als spaeter, leere Slots fehlen', () => {
  const meds = [med('x', { type: 'daily', slots: ['nach-fruehstueck', 'nach-abend'], startDate: '2027-01-01' }), med('y', { type: 'daily', slots: ['morgen'] })];
  const plan = dayPlan(meds, new Map(), '2026-09-28');
  assert.deepEqual(plan.map((s) => s.id), ['morgen', 'nach-fruehstueck', 'nach-abend']);
  assert.equal(plan[1].items[0].state, 'spaeter');
  assert.equal(nextScheduledDate(meds[0], '2026-09-28'), '2027-01-01');
});

test('Offen jetzt: nur fällige Slots, wichtige zuerst', () => {
  const meds = [med('normal', { type: 'daily', slots: ['morgen'] }), med('wichtig', { type: 'daily', slots: ['morgen', 'abend'] }, { critical: true })];
  const open = openNow(meds, new Map(), '2026-09-28', 9 * 60);
  assert.deepEqual(open.map((i) => `${i.med.id}:${i.slot}`), ['wichtig:morgen', 'normal:morgen']);
  const logs = logsFrom([['2026-09-28', 'wichtig', 'morgen']]);
  assert.deepEqual(openNow(meds, logs, '2026-09-28', 20 * 60).map((i) => `${i.med.id}:${i.slot}`), ['wichtig:abend', 'normal:morgen']);
});

test('Streak zählt geplante Tage, heute offen bricht nicht', () => {
  const m = med('s', { type: 'daily', slots: ['morgen'], startDate: '2026-09-01' });
  const today = '2026-09-28';
  const logs = logsFrom([1, 2, 3, 4, 5].map((i) => [addDays(today, -i), 's', 'morgen']));
  assert.equal(streak(m, logs, today), 5);
  logs.set(logKey(today, 's', 'morgen'), { taken: true });
  assert.equal(streak(m, logs, today), 6);
  logs.delete(logKey(addDays(today, -3), 's', 'morgen'));
  assert.equal(streak(m, logs, today), 3);
});

test('Streak bei alle zwei Tage überspringt freie Tage', () => {
  const m = med('t', { type: 'everyNDays', n: 2, slots: ['morgen'], startDate: '2026-09-20' });
  const logs = logsFrom(['2026-09-20', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-28'].map((d) => [d, 't', 'morgen']));
  assert.equal(streak(m, logs, '2026-09-28'), 5);
});

test('Adhärenz 30 Tage, heute nur fällige Slots', () => {
  const m = med('u', { type: 'daily', slots: ['morgen', 'abend'], startDate: '2026-09-19' });
  const today = '2026-09-28';
  const entries = [];
  for (let i = 1; i <= 9; i++) entries.push([addDays(today, -i), 'u', 'morgen']);
  entries.push([today, 'u', 'morgen']);
  const result = adherence(m, logsFrom(entries), today, { nowMinutes: 9 * 60 });
  assert.equal(result.due, 19);
  assert.equal(result.done, 10);
  assert.equal(result.percent, 53);
});

test('dueSlots für Messung wie für Medikament', () => {
  const m = med('bp', { type: 'weekly', weekday: 1, slots: ['morgen'] }, { type: 'measurement' });
  assert.deepEqual(dueSlots(m, '2026-09-28'), ['morgen']);
});

test('Ohne Enddatum läuft ein Eintrag weiter, bis er pausiert oder gelöscht wird', () => {
  const m = med('a', { type: 'daily', slots: ['morgen'], startDate: '2026-01-01', endDate: null });
  assert.equal(isScheduledOn(m, '2031-06-15'), true);
  assert.equal(isScheduledOn({ ...m, active: false }, '2026-10-01'), false);
  const noDates = med('b', { type: 'weekly', weekday: 3, slots: ['abend'] });
  assert.equal(isScheduledOn(noDates, '2030-01-02'), true);
  // Nur ein ausdrückliches Enddatum beendet ihn
  assert.equal(isScheduledOn({ ...m, schedule: { ...m.schedule, endDate: '2026-12-31' } }, '2027-01-01'), false);
});

test('Nachhaken: offen heute zählt alle Slots des Tages, ab 22 Uhr fällig', () => {
  const a = med('a', { type: 'daily', slots: ['morgen', 'abend'] });
  const b = med('b', { type: 'daily', slots: ['nach-abend'] }, { active: false });
  const logs = logsFrom([['2026-09-29', 'a', 'morgen']]);
  assert.deepEqual(openToday([a, b], logs, '2026-09-29').map((item) => `${item.med.id}|${item.slot}`), ['a|abend']);
  assert.equal(nudgeDue(21 * 60 + 59), false);
  assert.equal(nudgeDue(22 * 60), true);
  assert.equal(nudgeDue(23 * 60 + 30, '23:00'), true);
  assert.equal(nudgeDue(22 * 60, 'kaputt'), false);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
