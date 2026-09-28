/*
  Einstellungen: Profil, GitHub-Zugang, Passwort, Sicherung, Export und Import.
  Nutzereingaben werden nur als Werte gesetzt, nie als HTML.
*/

import * as db from '../db.js';
import * as sync from '../sync.js';
import { confirmDialog, toast, formatDateTime, todayISO } from '../ui.js';
import { appTitle, hasProfile, getProfile, loadProfile, parseProfileFile, importProfile, exportProfile } from '../profile.js';

const TEMPLATE = `
  <section class="stack">
    <div class="stack-tight" data-no-profile hidden>
      <p class="secondary">Stell hier deine Sicherung wieder her. Das Profil kommt dabei mit.</p>
      <a class="button" href="#/willkommen">Zurück zur Einrichtung</a>
    </div>

    <div class="stack-tight" data-profile-section>
      <h2>Profil</h2>
      <p class="secondary" data-profile-name></p>
      <a class="button" href="#/profil">Profil bearbeiten</a>
      <button class="button" type="button" data-action="profile-export">Profil als Datei exportieren</button>
      <button class="button" type="button" data-action="profile-import">Profil aus Datei importieren</button>
      <p class="hint">Die Profildatei ist nicht verschlüsselt. Sie enthält auch deine Medikamente.</p>
      <input type="file" accept="application/json,.json" data-profile-input hidden>
    </div>

    <div class="card status-card">
      <div class="blob" data-status-blob></div>
      <p class="label">Sicherung</p>
      <p class="number" data-pending>0</p>
      <p data-pending-text></p>
      <p class="secondary" data-last-sync></p>
      <p class="error-text" data-error hidden></p>
      <div class="button-row">
        <button class="button button--primary" type="button" data-action="sync">Jetzt sichern</button>
        <button class="button" type="button" data-action="restore">Wiederherstellen</button>
      </div>
    </div>

    <form class="stack-tight" data-form="github" autocomplete="off">
      <h2>GitHub</h2>
      <p class="secondary">Gesichert wird verschlüsselt ins private Repo health-data.</p>
      <label class="field">
        <span class="label">Owner</span>
        <input class="input" name="owner" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" required>
      </label>
      <label class="field">
        <span class="label">Token</span>
        <input class="input" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
      </label>
      <p class="hint">Der Token bleibt auf diesem Gerät. Er wird weder gesichert noch exportiert.</p>
      <button class="button" type="submit">Speichern</button>
    </form>

    <form class="stack-tight" data-form="password">
      <h2>Passwort</h2>
      <p class="secondary" data-password-state></p>
      <label class="field" data-current-field>
        <span class="label">Aktuelles Passwort</span>
        <input class="input" name="current" type="password" autocomplete="current-password">
      </label>
      <label class="field">
        <span class="label">Neues Passwort</span>
        <input class="input" name="next" type="password" autocomplete="new-password" minlength="8" required>
      </label>
      <label class="field">
        <span class="label">Wiederholen</span>
        <input class="input" name="repeat" type="password" autocomplete="new-password" minlength="8" required>
      </label>
      <div class="card warning-card">
        <div class="blob blob--rose"></div>
        <p>Verlierst du das Passwort, kann niemand die Sicherung mehr lesen. Auch du nicht. Es wird nirgends gespeichert.</p>
      </div>
      <button class="button" type="submit" data-password-submit>Passwort setzen</button>
    </form>

    <div class="stack-tight">
      <h2>Datei</h2>
      <p class="hint">Der Export ist nicht verschlüsselt. Teile ihn nur mit dir selbst.</p>
      <div class="button-row">
        <button class="button" type="button" data-action="export">Export als Datei</button>
        <button class="button" type="button" data-action="import">Import aus Datei</button>
      </div>
      <input type="file" accept="application/json,.json" data-import-input hidden>
    </div>
  </section>
`;

// Bestätigung sichtbar machen, solange eine Aktion läuft
async function busy(buttonEl, task) {
  buttonEl.disabled = true;
  try {
    return await task();
  } finally {
    buttonEl.disabled = false;
  }
}

function errorText(error) {
  return error instanceof Error && error.message ? error.message : 'Etwas ist schiefgelaufen.';
}

/* Export: Datei wird vorbereitet, damit der Teilen-Dialog direkt im Tap startet */

function jsonFile(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return new File([blob], name, { type: 'application/json' });
}

async function buildExportFile() {
  return jsonFile(await db.exportData(), `health-export-${todayISO()}.json`);
}

async function buildProfileFile() {
  return jsonFile(await exportProfile(), `health-profil-${todayISO()}.json`);
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

function shareOrDownload(file) {
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: `${appTitle()} Export` }).catch((error) => {
      if (error.name !== 'AbortError') download(file);
    });
  } else {
    download(file);
  }
}

export async function render(root) {
  root.innerHTML = TEMPLATE;
  const $ = (selector) => root.querySelector(selector);
  const githubForm = $('[data-form="github"]');
  const passwordForm = $('[data-form="password"]');
  const importInput = $('[data-import-input]');
  const profileInput = $('[data-profile-input]');
  let exportFile = null;
  let profileFile = null;

  const prepareExport = async () => {
    exportFile = await buildExportFile();
    profileFile = hasProfile() ? await buildProfileFile() : null;
  };

  const updateStatus = async () => {
    const status = await sync.getStatus();

    $('[data-no-profile]').hidden = hasProfile();
    $('[data-profile-section]').hidden = !hasProfile();
    $('[data-profile-name]').textContent = hasProfile() ? `Profil von ${getProfile().displayName}` : '';

    $('[data-pending]').textContent = String(status.pending);
    $('[data-pending-text]').textContent = status.pending === 0
      ? 'Alles gesichert'
      : status.pending === 1 ? 'Änderung wartet auf Sicherung' : 'Änderungen warten auf Sicherung';
    $('[data-last-sync]').textContent = status.running
      ? 'Sicherung läuft'
      : status.lastSync ? `Letzte Sicherung: ${formatDateTime(status.lastSync)}` : 'Noch keine Sicherung';

    const errorEl = $('[data-error]');
    errorEl.hidden = !status.lastError;
    errorEl.textContent = status.lastError ?? '';

    // Farbfläche zeigt den Zustand: Rose bei Fehler, Zitrone bei offenen Änderungen, sonst Himmel
    const blob = $('[data-status-blob]');
    const tone = status.lastError ? 'rose' : status.pending > 0 ? 'zitrone' : 'himmel';
    blob.className = `blob blob--${tone}`;
    blob.style.setProperty('--intensity', String(Math.min(1, 0.35 + status.pending * 0.1)));

    githubForm.owner.value ||= status.owner;
    githubForm.token.placeholder = status.hasToken ? 'Gespeichert' : 'github_pat_...';

    $('[data-current-field]').hidden = !status.hasPassword;
    passwordForm.current.required = status.hasPassword;
    $('[data-password-submit]').textContent = status.hasPassword ? 'Passwort ändern' : 'Passwort setzen';
    $('[data-password-state]').textContent = !status.hasPassword
      ? 'Noch kein Passwort gesetzt. Ohne Passwort gibt es keine Sicherung.'
      : status.unlocked ? 'Gesetzt und für diese Sitzung entsperrt.' : 'Gesetzt. Wird bei der nächsten Sicherung abgefragt.';
  };

  const refresh = () => {
    if (!root.isConnected) {
      offStatus();
      return;
    }
    updateStatus();
    prepareExport();
  };
  const offStatus = sync.onStatus(refresh);

  /* Aktionen */

  $('[data-action="sync"]').addEventListener('click', (event) => busy(event.currentTarget, async () => {
    try {
      await sync.syncNow({ interactive: true });
      toast('Gesichert');
    } catch (error) {
      toast(errorText(error), { error: true });
    }
  }));

  $('[data-action="restore"]').addEventListener('click', (event) => busy(event.currentTarget, async () => {
    try {
      if (await sync.restore()) {
        // Die Sicherung enthält das Profil, also neu laden
        await loadProfile();
        toast('Wiederhergestellt');
        refresh();
      }
    } catch (error) {
      toast(errorText(error), { error: true });
    }
  }));

  githubForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sync.saveCredentials(githubForm.owner.value, githubForm.token.value);
    githubForm.token.value = '';
    toast('Gespeichert');
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { current, next, repeat } = passwordForm;
    if (next.value !== repeat.value) {
      toast('Die Passwörter stimmen nicht überein.', { error: true });
      return;
    }
    const hadPassword = !$('[data-current-field]').hidden;
    if (hadPassword) {
      const ok = await confirmDialog({
        title: 'Passwort ändern?',
        text: 'Die nächste Sicherung wird mit dem neuen Passwort verschlüsselt. Das alte öffnet sie dann nicht mehr.',
        confirmLabel: 'Ändern',
      });
      if (!ok) return;
    }
    await busy(event.submitter ?? $('[data-password-submit]'), async () => {
      try {
        await sync.setPassword(next.value, current.value);
        passwordForm.reset();
        toast(hadPassword ? 'Passwort geändert' : 'Passwort gesetzt');
      } catch (error) {
        toast(errorText(error), { error: true });
      }
    });
  });

  $('[data-action="export"]').addEventListener('click', async () => {
    // Ohne await vor share, sonst verwirft Safari die Nutzergeste
    if (exportFile) shareOrDownload(exportFile);
    else shareOrDownload(await buildExportFile());
  });

  $('[data-action="import"]').addEventListener('click', () => importInput.click());

  $('[data-action="profile-export"]').addEventListener('click', async () => {
    // Wie beim Datenexport: Datei liegt schon bereit, damit Safari die Geste behält
    shareOrDownload(profileFile ?? await buildProfileFile());
  });

  $('[data-action="profile-import"]').addEventListener('click', () => profileInput.click());

  profileInput.addEventListener('change', async () => {
    const file = profileInput.files?.[0];
    profileInput.value = '';
    if (!file) return;
    try {
      const parsed = parseProfileFile(await file.text());
      const ok = await confirmDialog({
        title: 'Profil ersetzen?',
        text: 'Dein Profil wird durch die Datei ersetzt. Medikamente aus der Datei kommen dazu, vorhandene bleiben unverändert.',
        confirmLabel: 'Ersetzen',
      });
      if (!ok) return;
      const added = await importProfile(parsed);
      toast(added ? `Profil importiert, ${added} ${added === 1 ? 'Medikament' : 'Medikamente'} angelegt` : 'Profil importiert');
      refresh();
    } catch (error) {
      toast(errorText(error), { error: true });
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      db.validateExport(data);
      const ok = await confirmDialog({
        title: 'Import aus Datei?',
        text: 'Lokale Daten werden überschrieben. Danach wird der neue Stand gesichert.',
        confirmLabel: 'Überschreiben',
        danger: true,
      });
      if (!ok) return;
      await db.replaceAll(data, { enqueue: true });
      await loadProfile();
      toast('Importiert');
      refresh();
    } catch (error) {
      toast(error instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : errorText(error), { error: true });
    }
  });

  await updateStatus();
  prepareExport();
}
