/*
  Einstellungsbereich "Zurücksetzen": löscht alle Daten auf diesem Gerät
  (IndexedDB mit Profil, allen Stores, Token und Sync-Stand), meldet den Service Worker ab,
  leert den Cache und startet die App neu im Onboarding.
  Die verschlüsselte Sicherung auf GitHub bleibt unangetastet.
  Zweistufig: erst der Button, dann das Wort LÖSCHEN, dann der zweite Button.
*/

import { deleteEverything } from '../db.js';
import { toast, el } from '../ui.js';

const CONFIRM_WORD = 'LÖSCHEN';

async function wipeDevice() {
  await deleteEverything();
  if ('serviceWorker' in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  }
  if ('caches' in window) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Speicher nicht verfügbar
  }
}

export function renderResetSection(container) {
  container.replaceChildren();
  container.className = 'stack-tight';
  container.append(
    el('h2', null, 'Zurücksetzen'),
    el('p', 'secondary', 'Löscht alles auf diesem Gerät: Profil, Einträge, Essensplan, Token und Sync-Stand. Danach startet die App mit der Einrichtung.'),
    el('p', 'hint', 'Deine verschlüsselte Sicherung auf GitHub bleibt erhalten. Mit Owner, Repo, Token und Passwort kannst du sie wiederherstellen.'),
  );

  const start = el('button', 'button button--danger', 'Alle Daten auf diesem Gerät löschen');
  start.type = 'button';

  const confirm = el('div', 'stack-tight');
  confirm.hidden = true;
  const field = el('label', 'field');
  const input = el('input', 'input');
  input.type = 'text';
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.spellcheck = false;
  field.append(el('span', 'label', `Zum Bestätigen ${CONFIRM_WORD} eingeben`), input);
  const wipe = el('button', 'button button--danger', 'Endgültig löschen');
  wipe.type = 'button';
  wipe.disabled = true;
  const cancel = el('button', 'button', 'Abbrechen');
  cancel.type = 'button';
  const actions = el('div', 'button-row');
  actions.append(cancel, wipe);
  confirm.append(field, actions);

  start.addEventListener('click', () => {
    start.hidden = true;
    confirm.hidden = false;
    input.focus();
  });
  cancel.addEventListener('click', () => {
    input.value = '';
    wipe.disabled = true;
    confirm.hidden = true;
    start.hidden = false;
  });
  input.addEventListener('input', () => {
    wipe.disabled = input.value.trim() !== CONFIRM_WORD;
  });
  wipe.addEventListener('click', async () => {
    if (input.value.trim() !== CONFIRM_WORD) return;
    wipe.disabled = true;
    cancel.disabled = true;
    try {
      await wipeDevice();
      // Neu laden, damit kein Zustand im Speicher übrig bleibt
      location.replace(`${location.pathname}#/willkommen`);
      location.reload();
    } catch (error) {
      toast('Löschen fehlgeschlagen. Schließ die App ganz und versuch es noch einmal.', { error: true });
      wipe.disabled = false;
      cancel.disabled = false;
    }
  });

  container.append(start, confirm);
}
