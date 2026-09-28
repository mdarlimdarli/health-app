/*
  Einstellungsbereich "Essensplan": eigener Plan aus Datei importieren (mit Schema-Prüfung
  und Versionsanzeige) und exportieren. Der Plan ist persönlich, er lebt nur in IndexedDB
  (settings, key "meals") und in der verschlüsselten Sicherung, nie im Repo.
*/

import { storedMeals, parseMealsFile, importMeals } from '../food-data.js';
import { confirmDialog, toast, todayISO, el } from '../ui.js';

const german = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

function describe(plan) {
  return `Version ${plan.version}${plan.updatedAt ? ` vom ${german(plan.updatedAt)}` : ''}, ${plan.meals.length} Gerichte, ${plan.foods.length} Lebensmittel`;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function renderMealsSection(container) {
  const plan = await storedMeals();
  container.replaceChildren();
  container.className = 'stack-tight';
  container.append(el('h2', null, 'Essensplan'));
  container.append(el('p', 'secondary', plan
    ? `Eigener Plan: ${describe(plan)}. Importiert am ${german(plan.importedAt)}.`
    : 'Kein eigener Plan. Der Tab Essen zeigt den neutralen Beispielplan.'));
  container.append(el('p', 'hint', 'Der Plan ist persönlich. Er bleibt auf diesem Gerät und kommt verschlüsselt in die Sicherung, nie ins Repo.'));

  const input = el('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.hidden = true;

  const importButton = el('button', 'button button--primary', 'Essensplan aus Datei importieren');
  importButton.type = 'button';
  importButton.addEventListener('click', () => input.click());

  // Export vorab erzeugen, damit der Teilen-Dialog direkt im Tap startet
  const file = plan ? new File([`${JSON.stringify(plan, null, 2)}\n`], `essensplan-${todayISO()}.json`, { type: 'application/json' }) : null;
  const exportButton = el('button', 'button', 'Essensplan exportieren');
  exportButton.type = 'button';
  exportButton.disabled = !plan;
  exportButton.addEventListener('click', () => {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: 'Essensplan' }).catch((error) => {
        if (error.name !== 'AbortError') download(file);
      });
    } else {
      download(file);
    }
  });

  const errorBox = el('details', 'details');
  errorBox.hidden = true;

  input.addEventListener('change', async () => {
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) return;
    errorBox.hidden = true;
    try {
      const data = parseMealsFile(await chosen.text());
      const next = { version: data.version ?? 1, updatedAt: data.updatedAt ?? null, meals: data.meals, foods: data.foods };
      const ok = await confirmDialog({
        title: plan ? 'Essensplan ersetzen?' : 'Essensplan importieren?',
        text: plan
          ? `Neu: ${describe(next)}. Bisher: ${describe(plan)}. Eigene Tausche und Feedback bleiben erhalten.`
          : `Neu: ${describe(next)}.`,
        confirmLabel: plan ? 'Ersetzen' : 'Importieren',
      });
      if (!ok) return;
      await importMeals(data);
      toast(`Essensplan Version ${next.version} importiert`);
      renderMealsSection(container);
    } catch (error) {
      toast(error.message || 'Import fehlgeschlagen.', { error: true });
      if (error.details?.length) {
        const list = el('ul', 'hint-list');
        error.details.forEach((detail) => list.append(el('li', null, detail)));
        errorBox.replaceChildren(el('summary', null, `${error.details.length} Fehler in der Datei`), list);
        errorBox.hidden = false;
        errorBox.open = true;
      }
    }
  });

  const actions = el('div', 'stack-tight');
  actions.append(importButton, exportButton);
  container.append(actions, errorBox, input);
}
