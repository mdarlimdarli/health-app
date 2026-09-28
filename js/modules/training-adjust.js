/*
  Anpassen im Trainings-Tab (#/training/anpassen): Tage pro Woche, Phase und die drei Ebenen
  (Regionen schonen, Bewegungen vermeiden, Aufbauen), direkt editierbar.
  Jede Änderung speichert ins Profil und baut die Pläne sofort neu. Während einer laufenden
  Einheit ist Anpassen gesperrt, die Einheit behält ihre Übungen.
*/

import { getProfile } from '../profile.js';
import { loadPlans, loadWorkouts, activeOf, currentPhase, setPhase, saveTraining, planChanges, dismissPlanChanges } from '../training-data.js';
import { trainingFields } from './training-fields.js';
import { toast, el } from '../ui.js';

/* Übersicht "Was sich geändert hat" */

export function changesCard(changes, { onDismiss } = {}) {
  const card = el('div', 'card changes-card stack-tight');
  card.append(el('p', 'label', 'Was sich geändert hat'));
  const list = el('ul', 'changes-list');
  for (const item of changes.removed ?? []) {
    const row = el('li', 'change change--removed');
    row.append(el('span', 'change-name', item.name), el('span', 'secondary', item.excluded ? `entfernt, weil ${item.reason}` : `entfernt, ${item.reason}`));
    list.append(row);
  }
  for (const item of changes.added ?? []) {
    const row = el('li', 'change change--added');
    row.append(el('span', 'change-name', item.name), el('span', 'secondary', `neu, ${item.reason}`));
    list.append(row);
  }
  card.append(list);
  if (onDismiss) {
    const ok = el('button', 'button button--small', 'Verstanden');
    ok.type = 'button';
    ok.addEventListener('click', () => onDismiss(card));
    card.append(ok);
  }
  return card;
}

function segmented(name, options, current, label) {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const option = el('label', 'segment');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(value);
    input.checked = value === current;
    option.append(input, el('span', null, text));
    group.append(option);
  }
  return group;
}

export async function renderAdjust(root, lib) {
  const section = el('section', 'stack training-adjust');
  root.replaceChildren(section);

  const active = activeOf(await loadWorkouts());
  if (active) {
    const card = el('div', 'card stack-tight');
    const go = el('a', 'button button--primary', 'Zur Einheit');
    go.href = '#/training/einheit';
    card.append(el('p', 'label', 'Gesperrt'), el('h2', null, 'Eine Einheit läuft'), el('p', 'secondary', 'Anpassen geht wieder, sobald du sie beendet hast. Änderungen gelten ab der nächsten Einheit.'), go);
    section.append(card);
    return;
  }

  const training = getProfile().training;
  const intro = el('p', 'secondary', 'Jede Änderung speichert ins Profil und baut deine Pläne sofort neu. Übungen mit Trainingslog bleiben bevorzugt erhalten.');
  const changesSlot = el('div');

  const days = el('div', 'stack-tight');
  days.append(el('p', 'label', 'Tage pro Woche'), segmented('days', [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), Number(training.daysPerWeek), 'Tage pro Woche'));

  const phase = el('div', 'stack-tight');
  phase.append(
    el('p', 'label', 'Phase'),
    segmented('phase', [[1, 'Phase 1'], [2, 'Phase 2']], await currentPhase(), 'Phase'),
    el('p', 'hint', 'Phase 1 mit Maschinen und Kabelzug, Phase 2 mit freien Gewichten.'),
  );

  const status = el('p', 'hint');
  status.setAttribute('aria-live', 'polite');

  // Nach jedem Neuaufbau die Netto-Änderung zeigen
  const showChanges = async () => {
    const changes = await planChanges();
    changesSlot.replaceChildren(changes ? changesCard(changes, { onDismiss: async (card) => { await dismissPlanChanges(); card.remove(); } }) : el('p', 'hint', 'Dein Plan ist auf dem aktuellen Stand.'));
  };

  const rebuild = async (save) => {
    try {
      await save();
      const plans = await loadPlans(lib);
      status.textContent = `Plan neu aufgebaut: ${plans.plans.map((plan) => plan.name).join(', ')}.`;
      await showChanges();
    } catch (error) {
      toast(error.message || 'Speichern fehlgeschlagen.', { error: true });
    }
  };

  days.addEventListener('change', (event) => rebuild(() => saveTraining({ daysPerWeek: Number(event.target.value) })));
  phase.addEventListener('change', (event) => rebuild(() => setPhase(Number(event.target.value))));
  const fields = trainingFields(training, { onChange: (value) => rebuild(() => saveTraining(value)) });

  const done = el('a', 'button button--primary', 'Fertig');
  done.href = '#/training';

  section.append(intro, changesSlot, days, phase, fields.node, status, done);
  await loadPlans(lib);
  await showChanges();
}
