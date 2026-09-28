#!/usr/bin/env node
/*
  Tests für Planer und Übungsbibliothek. Nur synthetische Profile, keine echten Daten.
  Aufruf: node scripts/test-planner.mjs
*/

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { generatePlans, validateLibrary, parseRatio, estimate1RM, suggestProgression, shouldSuggestPhaseChange } from '../js/planner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { exercises } = JSON.parse(await readFile(path.join(root, 'data', 'exercises.json'), 'utf8'));
const byId = new Map(exercises.map((e) => [e.id, e]));
const ALL_TAGS = ['last-hinter-kopf', 'nackendruecken', 'bauchdruck', 'crunches', 'schweres-kreuzheben'];

const base = { daysPerWeek: 2, level: 1, goal: '', focus: [], avoidTags: [], pullPushRatio: '1:1', startPhase: 1 };
const profiles = {
  neutral: { ...base },
  eingeschraenkt: { ...base, avoidTags: ALL_TAGS, focus: ['oberer-ruecken', 'schultergürtel', 'knochendichte'], pullPushRatio: '2:1' },
  fortgeschritten: { ...base, level: 2, pullPushRatio: '3:2', focus: ['gesaess'] },
  dreiTage: { ...base, daysPerWeek: 3 },
  vierTage: { ...base, daysPerWeek: 4, pullPushRatio: '2:1' },
};

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

const exerciseList = (plan) => plan.exercises.map((entry) => byId.get(entry.exerciseId));

console.log('Bibliothek');
test('Bibliothek ist gültig (Felder, Alternativen, mindestens 45)', () => {
  assert.deepEqual(validateLibrary(exercises), []);
});
test('Alle Pflichtübungen der Vorgabe sind vorhanden', () => {
  const required = ['beinpresse', 'beinstrecker', 'beinbeuger', 'hip-thrust-maschine', 'glute-bridge', 'goblet-squat', 'langhantel-kniebeuge', 'rumaenisches-kreuzheben-kh', 'kreuzheben-langhantel', 'ausfallschritte', 'wadenheben', 'rudern-kabel-sitzend', 'latzug-brust', 'latzug-nacken', 'rudern-maschine', 'facepull', 'reverse-fly', 'einarmiges-rudern-kh', 'aussenrotation-kabel', 'klimmzug-unterstuetzt', 'brustpresse-maschine', 'kh-bankdruecken', 'lh-bankdruecken', 'liegestuetz-erhoeht', 'fliegende-kabel', 'schulterdruecken-maschine', 'lh-schulterdruecken', 'seitheben', 'bizeps-curl', 'hammer-curl', 'trizeps-kabel', 'dips-unterstuetzt', 'plank', 'seitplank', 'pallof-press', 'dead-bug', 'farmers-carry', 'crunch', 'beinheben-haengend', 'bws-rotation', 'katze-kuh', 'tuerrahmen-dehnung', 'schulterkreise', 'nackendehnung-seitlich', 'faszienrolle-oberer-ruecken', 'hueftbeuger-dehnung', 'hueft-mobilitaet-90-90'];
  const missing = required.filter((id) => !byId.has(id));
  assert.deepEqual(missing, []);
});
test('Tags der Vorgabe sitzen an den richtigen Übungen', () => {
  assert.ok(byId.get('langhantel-kniebeuge').tags.includes('bauchdruck') && byId.get('langhantel-kniebeuge').phase === 2);
  assert.deepEqual([...byId.get('kreuzheben-langhantel').tags].sort(), ['bauchdruck', 'schweres-kreuzheben']);
  assert.ok(byId.get('latzug-nacken').tags.includes('last-hinter-kopf'));
  assert.ok(byId.get('lh-schulterdruecken').tags.includes('nackendruecken'));
  assert.ok(byId.get('crunch').tags.includes('crunches'));
  assert.deepEqual([...byId.get('beinheben-haengend').tags].sort(), ['bauchdruck', 'crunches']);
  assert.equal(byId.get('lh-bankdruecken').phase, 2);
});
test('Jede SVG-Datei existiert', () => {
  const missing = exercises.filter((e) => !existsSync(path.join(root, 'assets', 'exercises', e.svg))).map((e) => e.svg);
  assert.deepEqual(missing, []);
});

console.log('Planer');
for (const [name, training] of Object.entries(profiles)) {
  for (const phase of [1, 2]) {
    const result = generatePlans({ training, exercises, phase });
    const label = `${name}, Phase ${phase}`;

    test(`${label}: richtige Anzahl Pläne`, () => {
      const expected = training.daysPerWeek >= 4 ? 4 : training.daysPerWeek === 3 ? 3 : 2;
      assert.equal(result.plans.length, expected);
    });

    test(`${label}: keine Übung mit einem avoidTag, keine über dem Level`, () => {
      for (const plan of result.plans) {
        for (const e of [...exerciseList(plan), ...plan.mobility.map((m) => byId.get(m.exerciseId))]) {
          assert.ok(!e.tags.some((t) => training.avoidTags.includes(t)), `${e.id} in ${plan.id}`);
          assert.ok(e.level <= Math.min(2, training.level), `${e.id} Level ${e.level}`);
        }
      }
    });

    test(`${label}: 6 bis 7 Übungen und 5 Minuten Mobility`, () => {
      for (const plan of result.plans) {
        assert.ok(plan.exercises.length >= 6 && plan.exercises.length <= 7, `${plan.id}: ${plan.exercises.length}`);
        assert.equal(plan.mobility.reduce((sum, m) => sum + m.seconds, 0), 300);
      }
    });

    if (training.daysPerWeek < 4) {
      test(`${label}: jede Einheit hat Knie, Hüfte, Zug horizontal und vertikal, Druck und Core`, () => {
        for (const plan of result.plans) {
          const list = exerciseList(plan);
          assert.ok(list.some((e) => e.pattern === 'kniedominant' && e.compound), `${plan.id} kniedominant`);
          assert.ok(list.some((e) => e.pattern === 'hueftdominant' && e.compound), `${plan.id} hüftdominant`);
          assert.ok(list.some((e) => e.pattern === 'ziehen' && e.plane === 'horizontal'), `${plan.id} Zug horizontal`);
          assert.ok(list.some((e) => e.pattern === 'ziehen' && e.plane === 'vertikal'), `${plan.id} Zug vertikal`);
          assert.ok(list.some((e) => e.pattern === 'druecken'), `${plan.id} Druck`);
          assert.ok(list.some((e) => e.muscleGroup === 'core'), `${plan.id} Core`);
        }
      });

      test(`${label}: Zug zu Druck mindestens wie im Profil`, () => {
        const ratio = parseRatio(training.pullPushRatio);
        for (const plan of result.plans) {
          const list = exerciseList(plan);
          const pull = list.filter((e) => e.pattern === 'ziehen').length;
          const push = list.filter((e) => e.pattern === 'druecken').length;
          assert.ok(pull / push >= ratio - 0.01, `${plan.id}: ${pull}:${push}`);
        }
      });
    } else {
      test(`${label}: Split mit Ober- und Unterkörper`, () => {
        assert.deepEqual(result.plans.map((p) => p.type), ['oberkoerper', 'unterkoerper', 'oberkoerper', 'unterkoerper']);
        for (const plan of result.plans.filter((p) => p.type === 'unterkoerper')) {
          assert.ok(exerciseList(plan).every((e) => e.muscleGroup === 'beine' || e.muscleGroup === 'core'), plan.id);
        }
      });
    }

    test(`${label}: Phase 1 nur Maschinen, Kabel und Körpergewicht, Phase 2 mit freien Gewichten`, () => {
      const list = result.plans.flatMap(exerciseList);
      if (phase === 1) assert.ok(list.every((e) => e.phase === 1), list.filter((e) => e.phase !== 1).map((e) => e.id).join(', '));
      else assert.ok(list.some((e) => e.phase === 2));
    });
  }
}

test('Fokus oberer Rücken: zwei Rückenübungen pro Einheit', () => {
  const result = generatePlans({ training: profiles.eingeschraenkt, exercises, phase: 1 });
  for (const plan of result.plans) assert.ok(exerciseList(plan).filter((e) => e.muscleGroup === 'ruecken').length >= 2, plan.id);
});

test('Abgelehnte Übungen werden nie gewählt, dauerhafte Alternativen ersetzen', () => {
  const first = generatePlans({ training: base, exercises, phase: 1 });
  const disliked = first.plans[0].exercises[0].exerciseId;
  const withDislike = generatePlans({ training: base, exercises, phase: 1, prefs: { [disliked]: { exerciseId: disliked, disliked: true } } });
  assert.ok(withDislike.plans.every((p) => p.exercises.every((e) => e.exerciseId !== disliked)));

  const target = first.plans[0].exercises.find((e) => byId.get(e.exerciseId).alternatives.length);
  const alt = byId.get(target.exerciseId).alternatives.find((id) => byId.get(id).phase === 1);
  const replaced = generatePlans({ training: base, exercises, phase: 1, prefs: { [target.exerciseId]: { exerciseId: target.exerciseId, replacedBy: alt } } });
  assert.ok(replaced.plans[0].exercises.some((e) => e.exerciseId === alt), `${alt} fehlt`);
});

test('Pläne sind deterministisch', () => {
  const a = generatePlans({ training: profiles.eingeschraenkt, exercises, phase: 1 });
  const b = generatePlans({ training: profiles.eingeschraenkt, exercises, phase: 1 });
  assert.deepEqual(a, b);
});

console.log('Hilfen');
test('Verhältnis, Epley, Phasenwechsel', () => {
  assert.equal(parseRatio('2:1'), 2);
  assert.equal(parseRatio('3:2'), 1.5);
  assert.equal(parseRatio('quatsch'), 1);
  assert.equal(Math.round(estimate1RM(50, 10) * 10) / 10, 66.7);
  assert.equal(estimate1RM(0, 10), 0);
  assert.equal(shouldSuggestPhaseChange(1, 15), false);
  assert.equal(shouldSuggestPhaseChange(1, 16), true);
  assert.equal(shouldSuggestPhaseChange(2, 40), false);
});

test('Progressionsvorschlag', () => {
  const entry = { sets: 3, repRange: [8, 12], progressionRule: { type: 'doppelprogression', stepKg: 2.5 } };
  const top = [1, 2, 3].map((setNo) => ({ setNo, weight: 40, reps: 12 }));
  assert.equal(suggestProgression(entry, top).weight, 42.5);
  const partial = [{ setNo: 1, weight: 40, reps: 12 }, { setNo: 2, weight: 40, reps: 10 }, { setNo: 3, weight: 40, reps: 9 }];
  assert.equal(suggestProgression(entry, partial).weight, 40);
  assert.equal(suggestProgression(entry, []).weight, null);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
