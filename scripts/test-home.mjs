#!/usr/bin/env node
/*
  Tests für die Startseite: Begrüßung, Uhrzeit, Datum und Zyklusphase.
  Aufruf: node scripts/test-home.mjs
*/

import assert from 'node:assert/strict';
import { greetingPhrase, greeting, timeText, dayParts, msToNextMinute } from '../js/clock.js';
import { averageCycleLength, cyclePhaseName, periodLength, DEFAULT_CYCLE_LENGTH } from '../js/cycle.js';

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

// Lokale Zeit des Geräts, wie in der App
const at = (hour, minute = 0) => new Date(2026, 8, 29, hour, minute, 0);

test('Morgen: 5 bis 10 Uhr', () => {
  for (const hour of [5, 6, 8, 9]) assert.equal(greetingPhrase(hour), 'Guten Morgen', `${hour} Uhr`);
});
test('Hallo: 10 bis 17 Uhr', () => {
  for (const hour of [10, 12, 16]) assert.equal(greetingPhrase(hour), 'Hallo', `${hour} Uhr`);
});
test('Abend: 17 bis 22 Uhr', () => {
  for (const hour of [17, 19, 21]) assert.equal(greetingPhrase(hour), 'Guten Abend', `${hour} Uhr`);
});
test('Nacht: 22 bis 5 Uhr', () => {
  for (const hour of [22, 23, 0, 3, 4]) assert.equal(greetingPhrase(hour), 'Gute Nacht', `${hour} Uhr`);
});
test('Begrüßung aus der lokalen Stunde, mit und ohne Namen', () => {
  assert.equal(greeting(at(8, 15), 'Beispiel'), 'Guten Morgen, Beispiel');
  assert.equal(greeting(at(9, 59)), 'Guten Morgen');
  assert.equal(greeting(at(10, 0)), 'Hallo');
  assert.equal(greeting(at(21, 59)), 'Guten Abend');
  assert.equal(greeting(at(22, 0)), 'Gute Nacht');
  assert.equal(greeting(at(4, 59)), 'Gute Nacht');
});
test('Uhrzeit zweistellig', () => {
  assert.equal(timeText(at(8, 5)), '08:05');
  assert.equal(timeText(at(0, 0)), '00:00');
  assert.equal(timeText(at(23, 59)), '23:59');
});
test('Datum in lokaler Zeit', () => {
  assert.deepEqual(dayParts(at(0, 30)), { weekday: 'Dienstag', day: '29', month: 'September' });
});
test('Nächster Minutenwechsel', () => {
  assert.equal(msToNextMinute(new Date(2026, 8, 29, 8, 5, 30, 250)), 29750);
  assert.equal(msToNextMinute(at(8, 5)), 60000);
});

test('Zykluslänge: Durchschnitt der eigenen Zyklen, sonst 28', () => {
  assert.equal(averageCycleLength([]), DEFAULT_CYCLE_LENGTH);
  assert.equal(averageCycleLength(['2026-09-01']), 28);
  assert.equal(averageCycleLength(['2026-07-01', '2026-07-31', '2026-08-30']), 30);
  // Unplausible Abstände (vergessener Eintrag) zählen nicht
  assert.equal(averageCycleLength(['2026-05-01', '2026-06-26', '2026-07-22', '2026-08-17']), 26);
  // Doppelte Einträge stören nicht
  assert.equal(averageCycleLength(['2026-08-01', '2026-08-01', '2026-08-29']), 28);
});
test('Periodendauer aus dem Profil', () => {
  assert.equal(periodLength([{ name: 'Periode', from: 1, to: 6 }]), 6);
  assert.equal(periodLength([]), 5);
});
test('Phase in Worten bei 28 Tagen', () => {
  const at = (day) => cyclePhaseName(day, 28, 5);
  assert.equal(at(1), 'Menstruation');
  assert.equal(at(5), 'Menstruation');
  assert.equal(at(6), 'Follikelphase');
  assert.equal(at(12), 'Follikelphase');
  assert.equal(at(13), 'Ovulation ca.');
  assert.equal(at(15), 'Ovulation ca.');
  assert.equal(at(16), 'Lutealphase');
  assert.equal(at(28), 'Lutealphase');
  assert.equal(at(35), 'Lutealphase');
  assert.equal(cyclePhaseName(null, 28), null);
});
test('Phase verschiebt sich mit der eigenen Zykluslänge', () => {
  // 32 Tage: Eisprung geschätzt an Tag 18, Fenster 17 bis 19
  assert.equal(cyclePhaseName(16, 32, 5), 'Follikelphase');
  assert.equal(cyclePhaseName(17, 32, 5), 'Ovulation ca.');
  assert.equal(cyclePhaseName(19, 32, 5), 'Ovulation ca.');
  assert.equal(cyclePhaseName(20, 32, 5), 'Lutealphase');
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
