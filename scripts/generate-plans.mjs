#!/usr/bin/env node
/*
  Erzeugt Trainingspläne aus einem Profil und schreibt sie als JSON.
  Nutzt denselben Planer wie die App (js/planner.js).

  node scripts/generate-plans.mjs
    Beispielprofil -> data/plans.generated.json (liegt im Repo, zeigt die Regeln)
  node scripts/generate-plans.mjs data/profile.json
    Eigenes Profil -> data/plans.local.json (in .gitignore, enthält persönliche Vorgaben)
  node scripts/generate-plans.mjs <profil> <ausgabe> [--phase 2]
*/

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generatePlans, validateLibrary } from '../js/planner.js';
import { normalizeTraining } from '../js/training-options.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const phaseIndex = args.indexOf('--phase');
const phaseArg = phaseIndex >= 0 ? Number(args.splice(phaseIndex, 2)[1]) : null;

const exampleProfile = path.join(root, 'data', 'profile.example.json');
const profilePath = path.resolve(args[0] ?? exampleProfile);
const isExample = profilePath === exampleProfile;
const outPath = path.resolve(args[1] ?? path.join(root, 'data', isExample ? 'plans.generated.json' : 'plans.local.json'));

const library = JSON.parse(await readFile(path.join(root, 'data', 'exercises.json'), 'utf8'));
const errors = validateLibrary(library.exercises);
if (errors.length) {
  console.error('Übungsbibliothek fehlerhaft:\n' + errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}

const profile = JSON.parse(await readFile(profilePath, 'utf8'));
// Auch Profile im alten Schema (avoidTags) werden migriert
const training = normalizeTraining(profile.training ?? {});
const result = generatePlans({
  training,
  exercises: library.exercises,
  phase: phaseArg ?? training.startPhase ?? 1,
  generatedAt: new Date().toISOString(),
});

// Namen zur besseren Lesbarkeit mitschreiben, die App nutzt nur die IDs
const names = new Map(library.exercises.map((e) => [e.id, e.name]));
for (const plan of result.plans) {
  for (const entry of [...plan.exercises, ...plan.mobility]) entry.name = names.get(entry.exerciseId);
}
result.source = isExample ? 'data/profile.example.json' : 'eigenes Profil';

await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.plans.length} Pläne (Phase ${result.phase}) nach ${path.relative(process.cwd(), outPath)} geschrieben.`);
if (!isExample) console.log('Hinweis: Die Datei enthält Vorgaben aus deinem Profil. Nicht committen.');
