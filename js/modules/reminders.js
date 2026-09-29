/*
  Einstellungsbereich Erinnerungen: Uhrzeiten (profile.reminders.times),
  Web Push aktivieren oder abschalten, Zeitplan für die GitHub Action,
  Hinweise zu iOS. Texte ohne Gedankenstriche, Nutzerdaten nur als Text.
*/

import * as db from '../db.js';
import { getProfile, saveProfile } from '../profile.js';
import { loadMeds } from '../meds-store.js';
import { pushSupport, currentSubscription, enablePush, disablePush, writeReminders, writeStatus, reminderTimes, nudgeTime, workflowSnippet, vapidKey, sendTestNotification } from '../push.js';
import { toast, el } from '../ui.js';
import { DEFAULT_REPO } from '../sync.js';

function errorText(error) {
  return error instanceof Error && error.message ? error.message : 'Etwas ist schiefgelaufen.';
}

async function busy(button, task) {
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}

export async function renderReminders(container) {
  const support = pushSupport();
  const subscription = await currentSubscription().catch(() => null);
  const active = Boolean(subscription);
  const configured = Boolean((await db.getSetting('syncOwner')) && (await db.getSetting('syncToken')));
  const critical = (await loadMeds()).filter((med) => med.critical && med.active !== false);
  const repo = (await db.getSetting('syncRepo')) || DEFAULT_REPO;

  container.replaceChildren();
  container.className = 'stack-tight';
  container.append(el('h2', null, 'Erinnerungen'), el('p', 'secondary', 'In der App siehst du fällige Einträge auf der Startseite und als Zahl am Tab Medis. Mitteilungen kommen zusätzlich zu diesen Uhrzeiten.'));

  // Uhrzeiten
  const times = el('div', 'time-list');
  const addRow = (value = '') => {
    const row = el('div', 'time-row');
    const input = el('input', 'input');
    input.type = 'time';
    input.value = value;
    input.setAttribute('aria-label', 'Uhrzeit');
    const remove = el('button', 'button', 'Entfernen');
    remove.type = 'button';
    remove.addEventListener('click', () => row.remove());
    row.append(input, remove);
    times.append(row);
  };
  reminderTimes().forEach(addRow);
  // Nachhaken: nur wenn heute noch etwas offen ist, ohne Namen
  const nudgeField = el('label', 'field');
  const nudgeInput = el('input', 'input');
  nudgeInput.type = 'time';
  nudgeInput.value = nudgeTime();
  nudgeField.append(el('span', 'label', 'Nachhaken'), nudgeInput);
  const nudgeHint = el('p', 'hint', 'Um diese Uhrzeit kommt nur eine Mitteilung, wenn heute noch etwas offen ist. Sie nennt nur die Anzahl, die Namen siehst du in der App. Ab dann ist der Abschnitt Medikamente auf der Startseite in Koralle markiert.');

  const timeActions = el('div', 'button-row');
  const addTime = el('button', 'button', 'Zeit hinzufügen');
  addTime.type = 'button';
  addTime.addEventListener('click', () => addRow('12:00'));
  const saveTimes = el('button', 'button button--primary', 'Zeiten speichern');
  saveTimes.type = 'button';
  saveTimes.addEventListener('click', () => busy(saveTimes, async () => {
    const values = [...times.querySelectorAll('input')].map((input) => input.value).filter((value) => /^\d{2}:\d{2}$/.test(value));
    const profile = getProfile();
    const nudge = /^\d{2}:\d{2}$/.test(nudgeInput.value) ? nudgeInput.value : profile.reminders.nudgeTime;
    await saveProfile({ ...profile, reminders: { ...profile.reminders, times: [...new Set(values)].sort(), nudgeTime: nudge } });
    try {
      if (active) {
        await writeReminders();
        await writeStatus();
      }
      toast(active ? 'Zeiten gespeichert und an GitHub übertragen' : 'Zeiten gespeichert');
    } catch (error) {
      toast(`Gespeichert, aber nicht übertragen: ${errorText(error)}`, { error: true });
    }
    renderReminders(container);
  }));
  timeActions.append(addTime, saveTimes);
  container.append(el('span', 'label', 'Uhrzeiten'), times, nudgeField, nudgeHint, timeActions);

  // Mitteilungen: Status aktiv, nicht erlaubt, nicht unterstützt oder aus
  const key = await vapidKey();
  const permission = support.permission;
  let statusText;
  if (!support.supported) statusText = 'Nicht unterstützt: Dieses Gerät oder dieser Browser kann keine Web-Push-Mitteilungen empfangen.';
  else if (active) statusText = 'Aktiv: Mitteilungen kommen auf dieses Gerät.';
  else if (permission === 'denied') statusText = 'Nicht erlaubt: Mitteilungen sind für diese App gesperrt. Du kannst sie in den iOS-Einstellungen unter Mitteilungen wieder erlauben.';
  else statusText = 'Aus: Auf diesem Gerät sind Mitteilungen noch nicht aktiviert.';
  const statusLine = el('p', `push-status push-status--${!support.supported ? 'unsupported' : active ? 'active' : permission === 'denied' ? 'denied' : 'off'}`, statusText);
  container.append(el('span', 'label', 'Mitteilungen'), statusLine);
  if (!support.standalone) container.append(el('p', 'hint', 'Dafür muss die App auf dem Home-Bildschirm liegen: in Safari Teilen, dann Zum Home-Bildschirm, und die App von dort öffnen. Auf dem iPhone ab iOS 16.4.'));

  // Nur ohne Schlüssel in js/config.js (z. B. in einem Fork) ein Eingabefeld
  const keyInput = el('input', 'input');
  if (!key) {
    const keyField = el('label', 'field');
    keyInput.type = 'text';
    keyInput.autocapitalize = 'off';
    keyInput.spellcheck = false;
    keyInput.placeholder = 'Öffentlicher VAPID-Schlüssel';
    keyField.append(el('span', 'label', 'VAPID public key'), keyInput);
    if (!active) container.append(keyField, el('p', 'hint', `Den Schlüssel erzeugst du einmal, die Anleitung steht in ONBOARDING.md. Der private Schlüssel gehört nur in die Secrets von ${repo}.`));
  }

  const pushButton = el('button', active ? 'button' : 'button button--primary', active ? 'Mitteilungen abschalten' : 'Mitteilungen aktivieren');
  pushButton.type = 'button';
  pushButton.disabled = !support.supported || !configured || permission === 'denied' && !active;
  pushButton.addEventListener('click', () => busy(pushButton, async () => {
    try {
      if (active) {
        await disablePush();
        toast('Mitteilungen abgeschaltet');
      } else {
        await enablePush(key || keyInput.value);
        toast('Mitteilungen aktiv');
      }
    } catch (error) {
      toast(errorText(error), { error: true });
    }
    renderReminders(container);
  }));
  container.append(pushButton);

  // Test: stößt die Action im Daten-Repo an, sie schickt sofort eine Mitteilung an alle Abos
  if (active) {
    const testButton = el('button', 'button', 'Test-Mitteilung senden');
    testButton.type = 'button';
    testButton.addEventListener('click', () => busy(testButton, async () => {
      try {
        await sendTestNotification();
        toast('Angestoßen. Die Mitteilung kommt in etwa einer Minute.');
      } catch (error) {
        toast(errorText(error), { error: true });
      }
    }));
    container.append(testButton, el('p', 'hint', `Dafür braucht der Token zusätzlich die Berechtigung Actions: Read and write für ${repo}.`));
  }
  if (!configured) container.append(el('p', 'hint', 'Für Mitteilungen brauchst du zuerst GitHub-Owner und Token weiter unten.'));

  // Zeitplan für die Action
  const details = el('details', 'details');
  details.append(el('summary', null, 'Zeitplan für die GitHub Action'));
  const explain = el('p', 'hint', `GitHub liest den Zeitplan nur aus der Workflow-Datei. Ersetze die cron-Zeilen in .github/workflows/reminders.yml im Repo ${repo} durch diese, sie enthalten auch die Nachhak-Zeit. Die Zeiten sind in UTC, je eine Zeile für Winter- und Sommerzeit. Das Script schickt trotzdem nur einmal pro Uhrzeit und Tag.`);
  const pre = el('pre', 'code', workflowSnippet() || '    # Noch keine Uhrzeiten');
  const copy = el('button', 'button button--small', 'Kopieren');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      toast('Kopiert');
    } catch {
      toast('Kopieren nicht möglich, bitte markieren.', { error: true });
    }
  });
  details.append(explain, pre, copy);
  container.append(details);

  // Hinweis iOS
  const note = el('div', 'card warning-card');
  note.append(el('p', null, 'iOS stellt Web-Push nur zu, wenn die App über den Home-Bildschirm installiert ist (ab iOS 16.4). Mitteilungen können sich verspäten oder ausbleiben, und GitHub startet geplante Actions oft einige Minuten zu spät.'));
  note.append(el('p', null, critical.length
    ? `Stell für wichtige Einträge zusätzlich eine Erinnerung in der iOS-App Erinnerungen ein: ${critical.map((med) => med.name).join(', ')}.`
    : 'Stell für wichtige Einträge zusätzlich eine Erinnerung in der iOS-App Erinnerungen ein.'));
  container.append(note);
}
