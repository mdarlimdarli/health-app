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
import { generatePlans, validateLibrary, parseRatio, estimate1RM, suggestProgression, shouldSuggestPhaseChange, isAllowed, exclusionReasons, diffPlans } from '../js/planner.js';
import { normalizeTraining, expiredRegions, blockedTags, REGION_IDS } from '../js/training-options.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { exercises } = JSON.parse(await readFile(path.join(root, 'data', 'exercises.json'), 'utf8'));
const byId = new Map(exercises.map((e) => [e.id, e]));
// Alle alten Schonungs-Tags aus Profil Version 1, zum Testen der Migration
const LEGACY_TAGS = ['last-hinter-kopf', 'nackendruecken', 'bauchdruck', 'crunches', 'schweres-kreuzheben'];

const base = normalizeTraining({ daysPerWeek: 2, level: 1, goal: '', pullPushRatio: '1:1', startPhase: 1 });
// fullSlots: Knie, Hüfte, Zug horizontal und vertikal müssen in jeder Ganzkörpereinheit möglich sein
const profiles = {
  neutral: { training: base, fullSlots: true },
  eingeschraenkt: { training: normalizeTraining({ ...base, avoidTags: LEGACY_TAGS, focus: ['oberer-ruecken', 'schultergürtel', 'knochendichte'], pullPushRatio: '2:1' }), fullSlots: true },
  fortgeschritten: { training: { ...base, level: 2, pullPushRatio: '3:2', focus: ['huefte-gesaess'] }, fullSlots: true },
  dreiTage: { training: { ...base, daysPerWeek: 3 }, fullSlots: true },
  vierTage: { training: { ...base, daysPerWeek: 4, pullPushRatio: '2:1' }, fullSlots: true },
  knieUndUeberkopf: { training: { ...base, protectRegions: [{ region: 'knie', until: '2026-10-31' }, { region: 'handgelenk', until: null }], avoidMovements: ['ueberkopf', 'einbeinig'], focus: ['beweglichkeit', 'core-stabilitaet'] }, fullSlots: false },
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
test('Regionen- und Bewegungs-Tags sitzen an den richtigen Übungen', () => {
  const has = (id, ...tags) => tags.every((tag) => byId.get(id).tags.includes(tag));
  assert.ok(has('langhantel-kniebeuge', 'belastet:bauchraum', 'belastet:knie', 'bewegung:tiefe-kniebeuge') && byId.get('langhantel-kniebeuge').phase === 2);
  assert.ok(has('kreuzheben-langhantel', 'belastet:lws', 'belastet:bauchraum', 'bewegung:wirbelsaeule-beugen'));
  assert.ok(has('latzug-nacken', 'bewegung:last-hinter-kopf', 'bewegung:ueberkopf', 'belastet:nacken', 'belastet:schulter'));
  assert.ok(has('lh-schulterdruecken', 'belastet:schulter', 'belastet:nacken', 'bewegung:ueberkopf'));
  assert.ok(has('crunch', 'bewegung:bauchpressen', 'belastet:bauchraum'));
  assert.ok(has('beinheben-haengend', 'bewegung:bauchpressen', 'bewegung:haengen', 'belastet:bauchraum'));
  assert.ok(has('klimmzug-unterstuetzt', 'bewegung:haengen', 'bewegung:ueberkopf'));
  assert.equal(byId.get('lh-bankdruecken').phase, 2);
});
test('Für jede Region gibt es leichte Mobility', () => {
  const missing = REGION_IDS.filter((region) => !exercises.some((e) => e.pattern === 'mobilitaet' && e.tags.includes(`mobilisiert:${region}`)));
  assert.deepEqual(missing, []);
});
test('Jede SVG-Datei existiert', () => {
  const missing = exercises.filter((e) => !existsSync(path.join(root, 'assets', 'exercises', e.svg))).map((e) => e.svg);
  assert.deepEqual(missing, []);
});

console.log('Planer');
for (const [name, { training, fullSlots }] of Object.entries(profiles)) {
  for (const phase of [1, 2]) {
    const result = generatePlans({ training, exercises, phase });
    const label = `${name}, Phase ${phase}`;

    test(`${label}: richtige Anzahl Pläne`, () => {
      const expected = training.daysPerWeek >= 4 ? 4 : training.daysPerWeek === 3 ? 3 : 2;
      assert.equal(result.plans.length, expected);
    });

    test(`${label}: keine Übung aus geschonter Region oder vermiedener Bewegung, keine über dem Level`, () => {
      const blocked = blockedTags(training);
      for (const plan of result.plans) {
        for (const e of [...exerciseList(plan), ...plan.mobility.map((m) => byId.get(m.exerciseId))]) {
          assert.ok(!e.tags.some((t) => blocked.includes(t)), `${e.id} in ${plan.id}`);
          assert.ok(e.level <= Math.min(2, training.level), `${e.id} Level ${e.level}`);
        }
      }
    });

    test(`${label}: 5 bis 7 Übungen und 5 Minuten Mobility, mit Fokus Beweglichkeit mehr`, () => {
      const seconds = training.focus.includes('beweglichkeit') ? 450 : 300;
      for (const plan of result.plans) {
        assert.ok(plan.exercises.length >= (fullSlots ? 6 : 5) && plan.exercises.length <= 7, `${plan.id}: ${plan.exercises.length}`);
        assert.equal(plan.mobility.reduce((sum, m) => sum + m.seconds, 0), seconds);
      }
    });

    test(`${label}: jede geschonte Region bekommt Mobility`, () => {
      for (const plan of result.plans) {
        for (const { region } of training.protectRegions) {
          assert.ok(plan.mobility.some((m) => byId.get(m.exerciseId).tags.includes(`mobilisiert:${region}`)), `${plan.id} ${region}`);
        }
      }
    });

    if (training.daysPerWeek < 4) {
      if (fullSlots) test(`${label}: jede Einheit hat Knie, Hüfte, Zug horizontal und vertikal, Druck und Core`, () => {
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
  const result = generatePlans({ training: profiles.eingeschraenkt.training, exercises, phase: 1 });
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
  const a = generatePlans({ training: profiles.eingeschraenkt.training, exercises, phase: 1 });
  const b = generatePlans({ training: profiles.eingeschraenkt.training, exercises, phase: 1 });
  assert.deepEqual(a, b);
});

console.log('Anpassung');
test('Migration: alte Schonungs-Tags werden Regionen und Bewegungen, Fokus neues Vokabular', () => {
  const migrated = normalizeTraining({ daysPerWeek: 2, avoidTags: LEGACY_TAGS, focus: ['oberer-ruecken', 'schultergürtel', 'knochendichte', 'rumpf'] });
  assert.deepEqual(migrated.protectRegions.map((r) => r.region).sort(), ['bauchraum', 'nacken', 'schulter']);
  assert.deepEqual([...migrated.avoidMovements].sort(), ['bauchpressen', 'last-hinter-kopf', 'wirbelsaeule-beugen']);
  assert.deepEqual(migrated.focus, ['oberer-ruecken', 'schulterguertel', 'knochendichte', 'core-stabilitaet']);
  assert.equal('avoidTags' in migrated, false);
  assert.equal(migrated.guidance, '');
});

test('Regionen mit Enddatum: abgelaufen erst nach dem Tag, nichts wird entfernt', () => {
  const training = normalizeTraining({ protectRegions: [{ region: 'knie', until: '2026-10-01' }, 'nacken', { region: 'knie', until: null }] });
  assert.equal(training.protectRegions.length, 2);
  assert.deepEqual(expiredRegions(training, '2026-10-01'), []);
  assert.deepEqual(expiredRegions(training, '2026-10-02').map((r) => r.region), ['knie']);
  assert.ok(blockedTags(training).includes('belastet:knie'));
});

test('Gründe für einen Ausschluss', () => {
  const training = { ...base, protectRegions: [{ region: 'nacken', until: null }], avoidMovements: ['last-hinter-kopf'] };
  const reasons = exclusionReasons(byId.get('latzug-nacken'), training, {});
  assert.deepEqual(reasons.map((r) => `${r.type}:${r.id}`).sort(), ['movement:last-hinter-kopf', 'region:nacken']);
  assert.equal(isAllowed(byId.get('latzug-brust'), training, {}), true);
});

test('Geloggte Übungen bleiben bevorzugt im Plan', () => {
  const plain = generatePlans({ training: base, exercises, phase: 1 });
  const used = new Set(plain.plans.flatMap((p) => p.exercises.map((e) => e.exerciseId)));
  const knee = plain.plans[0].exercises.map((e) => byId.get(e.exerciseId)).find((e) => e.pattern === 'kniedominant' && e.compound);
  const logged = knee.alternatives.find((id) => !used.has(id) && byId.get(id).phase === 1 && byId.get(id).compound);
  assert.ok(logged, 'Testvoraussetzung: ungenutzte Alternative');
  const withHistory = generatePlans({ training: base, exercises, phase: 1, history: [logged] });
  assert.ok(withHistory.plans.some((p) => p.exercises.some((e) => e.exerciseId === logged)), `${logged} fehlt`);
});

test('Neuaufbau ändert nur, was ausgeschlossen ist, und ersetzt durch dieselbe Muskelgruppe', () => {
  const before = generatePlans({ training: profiles.eingeschraenkt.training, exercises, phase: 1 });
  const training = { ...profiles.eingeschraenkt.training, avoidMovements: [...profiles.eingeschraenkt.training.avoidMovements, 'ueberkopf'] };
  const after = generatePlans({ training, exercises, phase: 1, previous: before.plans });
  const diff = diffPlans({ training: profiles.eingeschraenkt.training, phase: 1, prefs: {}, plans: before.plans }, { training, phase: 1, prefs: {}, plans: after.plans }, exercises);
  assert.ok(diff.removed.length > 0, 'etwas muss wegfallen');
  assert.ok(diff.removed.every((r) => r.excluded && r.reason === 'Überkopf drücken oder ziehen'), JSON.stringify(diff.removed));
  for (const removed of diff.removed) {
    const group = byId.get(removed.id).muscleGroup;
    assert.ok(after.plans.some((p) => p.exercises.some((e) => byId.get(e.exerciseId).muscleGroup === group)), `${group} fehlt`);
  }
  assert.ok(diff.added.length <= diff.removed.length + 2, `zu viele neue Übungen: ${diff.added.map((a) => a.id)}`);
});

test('Änderungsübersicht nennt den Grund', () => {
  const before = { training: base, phase: 1, prefs: {}, plans: [{ id: 'A', exercises: [{ exerciseId: 'latzug-nacken' }, { exerciseId: 'rudern-maschine' }], mobility: [] }] };
  const training = { ...base, avoidMovements: ['last-hinter-kopf'] };
  const after = generatePlans({ training, exercises, phase: 1, previous: before.plans });
  const diff = diffPlans(before, { training, phase: 1, prefs: {}, plans: after.plans }, exercises);
  const removed = diff.removed.find((r) => r.id === 'latzug-nacken');
  assert.equal(`${removed.name} entfernt, weil ${removed.reason}`, 'Latzug in den Nacken entfernt, weil Last hinter dem Kopf');
  assert.ok(diff.added.some((a) => a.reason === 'statt Latzug in den Nacken'), JSON.stringify(diff.added));
  const back = diffPlans({ training, phase: 1, prefs: {}, plans: after.plans }, { training: base, phase: 1, prefs: {}, plans: before.plans }, exercises);
  assert.ok(back.added.some((a) => a.id === 'latzug-nacken' && a.reason === 'Last hinter dem Kopf wieder erlaubt'), JSON.stringify(back.added));
  const phaseDiff = diffPlans({ ...before, training: base }, { training: base, phase: 2, prefs: {}, plans: generatePlans({ training: base, exercises, phase: 2 }).plans }, exercises);
  assert.ok(phaseDiff.removed.some((r) => r.reason === 'Phase 2 mit freien Gewichten'));
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
