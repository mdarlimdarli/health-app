/*
  Verschlüsselte Sicherung in ein privates Daten-Repo (Standard health-data, in den
  Einstellungen änderbar) über die GitHub Contents API.
  data.json.enc: alle Stores, AES-GCM verschlüsselt.
  manifest.json: unverschlüsselt, nur Zeitpunkt und Anzahl der Einträge.
  Der Token wird nie geloggt und taucht in keiner Fehlermeldung auf.
*/

import * as db from './db.js';
import * as vault from './crypto.js';
import { askPassword, confirmDialog, toast, formatDateTime } from './ui.js';

const API = 'https://api.github.com';
export const DEFAULT_REPO = 'health-data';
const DATA_PATH = 'data.json.enc';
const MANIFEST_PATH = 'manifest.json';
const DEBOUNCE_MS = 30000;
const CHECK_VALUE = 'health-app';

export class SyncError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

// Verständliche Meldung zu einem HTTP-Status, ohne Details aus der Anfrage
export function httpErrorMessage(status, repo = DEFAULT_REPO) {
  if (status === 401 || status === 403) return 'Token ungültig oder abgelaufen.';
  if (status === 404) return `Repo ${repo} nicht gefunden oder der Token hat keinen Zugriff.`;
  if (status === 409 || status === 422) return 'Die Sicherung auf GitHub wurde zwischenzeitlich geändert.';
  if (status >= 500) return 'GitHub ist gerade nicht erreichbar.';
  return `GitHub meldet Fehler ${status}.`;
}

/* Zustand */

const events = new EventTarget();
let running = null;
let timer = null;
let promptDeclined = false;
let lastError = null;

function emitStatus() {
  events.dispatchEvent(new Event('status'));
}

export function onStatus(listener) {
  events.addEventListener('status', listener);
  return () => events.removeEventListener('status', listener);
}

/* Zugangsdaten */

// GitHub-Regeln für Repo-Namen: Buchstaben, Ziffern, Punkt, Minus, Unterstrich, höchstens 100 Zeichen
export function isValidRepoName(name) {
  return /^[A-Za-z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..';
}

async function credentials() {
  const [owner, token, repo] = await Promise.all([db.getSetting('syncOwner', ''), db.getSetting('syncToken', ''), db.getSetting('syncRepo', DEFAULT_REPO)]);
  return { owner: owner.trim(), token: token.trim(), repo: (repo || DEFAULT_REPO).trim() };
}

// Leerer Token lässt den gespeicherten unverändert, leeres Repo heißt Standard
export async function saveCredentials(owner, token, repo = DEFAULT_REPO) {
  const current = await credentials();
  const nextOwner = owner.trim();
  const nextRepo = repo.trim() || DEFAULT_REPO;
  if (!isValidRepoName(nextRepo)) throw new SyncError('Der Repo-Name darf nur Buchstaben, Ziffern, Punkt, Minus und Unterstrich enthalten.');
  // Anderes Ziel: bekannte SHAs gelten nicht mehr
  if (nextOwner !== current.owner || nextRepo !== current.repo) await db.setSetting('syncShas', {});
  if (nextOwner !== current.owner) await db.setSetting('syncOwner', nextOwner);
  if (nextRepo !== current.repo) await db.setSetting('syncRepo', nextRepo);
  if (token.trim()) await db.setSetting('syncToken', token.trim());
  lastError = null;
  emitStatus();
}

export async function getStatus() {
  const creds = await credentials();
  return {
    owner: creds.owner,
    repo: creds.repo,
    hasToken: Boolean(creds.token),
    configured: Boolean(creds.owner && creds.token),
    hasPassword: await hasPassword(),
    unlocked: vault.isUnlocked(),
    pending: await db.pendingCount(),
    lastSync: await db.getSetting('lastSync'),
    running: Boolean(running),
    lastError,
  };
}

/* GitHub Contents API */

async function gh(creds, method, path, { body, accept = 'application/vnd.github+json' } = {}) {
  const headers = {
    Authorization: `Bearer ${creds.token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(`${API}/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}/contents/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    // Netzwerkfehler bewusst ohne Originalmeldung weitergeben
    throw new SyncError('Keine Verbindung zu GitHub.', 'offline');
  }
}

// SHA der Datei auf GitHub oder null, wenn sie nicht existiert (object-Format klappt auch über 1 MB)
async function remoteSha(creds, path) {
  const response = await gh(creds, 'GET', path, { accept: 'application/vnd.github.object+json' });
  if (response.status === 404) return null;
  if (!response.ok) throw new SyncError(httpErrorMessage(response.status, creds.repo), response.status);
  return (await response.json()).sha;
}

async function remoteText(creds, path) {
  const response = await gh(creds, 'GET', path, { accept: 'application/vnd.github.raw+json' });
  if (response.status === 404) return null;
  if (!response.ok) throw new SyncError(httpErrorMessage(response.status, creds.repo), response.status);
  return response.text();
}

async function putFile(creds, path, text, sha, label) {
  const body = {
    message: `${label} ${new Date().toISOString()}`,
    content: vault.toBase64(new TextEncoder().encode(text)),
  };
  if (sha) body.sha = sha;
  const response = await gh(creds, 'PUT', path, { body });
  // 409: SHA veraltet, 422: Datei existiert, aber kein SHA übergeben
  if (response.status === 409 || response.status === 422) throw new SyncError(httpErrorMessage(response.status, creds.repo), 'conflict');
  if (!response.ok) throw new SyncError(httpErrorMessage(response.status, creds.repo), response.status);
  return (await response.json()).content.sha;
}

/* Passwort: gespeichert wird nur ein verschlüsselter Prüfwert, nie das Passwort */

export async function hasPassword() {
  return Boolean(await db.getSetting('cryptoCheck'));
}

async function verifyPassword(password) {
  const check = await db.getSetting('cryptoCheck');
  if (!check) throw new SyncError('Es ist noch kein Passwort gesetzt.', 'no-password');
  const key = await vault.deriveKey(password, check.salt, check.iterations);
  const value = await vault.decrypt(check, key).catch(() => null);
  if (value?.check !== CHECK_VALUE) throw new SyncError('Passwort falsch.');
  return { key, salt: check.salt };
}

async function storeCheck(keyInfo) {
  await db.setSetting('cryptoCheck', await vault.encrypt({ check: CHECK_VALUE }, keyInfo));
}

export async function unlock(password) {
  const keyInfo = await verifyPassword(password);
  vault.useSession(keyInfo.key, keyInfo.salt);
  promptDeclined = false;
  emitStatus();
}

// Setzt oder ändert das Passwort. Beim Ändern muss das aktuelle stimmen.
export async function setPassword(newPassword, currentPassword = '') {
  if (newPassword.length < 8) throw new SyncError('Das Passwort braucht mindestens 8 Zeichen.');
  if (await hasPassword()) await verifyPassword(currentPassword);
  const keyInfo = await vault.unlock(newPassword);
  await storeCheck(keyInfo);
  // Neuer Schlüssel: die Sicherung muss neu verschlüsselt werden
  await db.markDirty('passwort');
  emitStatus();
}

async function ensureUnlocked() {
  if (vault.isUnlocked()) return true;
  if (!(await hasPassword())) throw new SyncError('Setze zuerst in den Einstellungen ein Passwort.', 'no-password');
  for (let attempt = 0; attempt < 3; attempt++) {
    const password = await askPassword({
      title: 'Passwort für die Sicherung',
      text: attempt ? 'Das Passwort war falsch. Versuch es noch einmal.' : 'Es gibt ungesicherte Änderungen. Mit deinem Passwort werden sie verschlüsselt gesichert.',
    });
    if (password === null) return false;
    try {
      await unlock(password);
      return true;
    } catch {
      // nächster Versuch
    }
  }
  throw new SyncError('Passwort falsch.');
}

/* Sicherung */

export function syncNow(options) {
  if (!running) {
    running = runSync(options).finally(() => {
      running = null;
      emitStatus();
    });
    emitStatus();
  }
  return running;
}

async function runSync({ interactive = false } = {}) {
  clearTimeout(timer);
  const creds = await credentials();
  if (!creds.owner || !creds.token) throw new SyncError('Trage zuerst GitHub-Owner und Token ein.', 'not-configured');
  if (!navigator.onLine) throw new SyncError('Du bist offline. Die Sicherung folgt, sobald du online bist.', 'offline');
  if (!(await ensureUnlocked())) throw new SyncError('Sicherung verschoben, das Passwort fehlt.', 'locked');

  const data = await db.exportData();
  const encrypted = JSON.stringify(await vault.encrypt(data));
  const shas = await db.getSetting('syncShas', {});

  let dataSha;
  try {
    dataSha = await putFile(creds, DATA_PATH, encrypted, shas.data, 'Sicherung');
  } catch (error) {
    if (error.code !== 'conflict') throw error;
    // Unbekannter Stand auf GitHub: nie stillschweigend überschreiben
    if (!interactive) throw new SyncError('Auf GitHub liegt eine Sicherung, die dieses Gerät nicht kennt. Bitte in den Einstellungen prüfen.', 'conflict');
    const overwrite = await confirmDialog({
      title: 'Sicherung überschreiben?',
      text: 'Auf GitHub liegt eine Sicherung, die dieses Gerät nicht kennt. Wenn du fortfährst, ersetzt der Stand dieses Geräts sie. Du kannst sie stattdessen zuerst wiederherstellen.',
      confirmLabel: 'Überschreiben',
      danger: true,
    });
    if (!overwrite) throw new SyncError('Sicherung abgebrochen.', 'cancelled');
    dataSha = await putFile(creds, DATA_PATH, encrypted, await remoteSha(creds, DATA_PATH), 'Sicherung');
  }

  // Manifest ist unkritisch: bei Konflikt aktuellen SHA holen und erneut schreiben
  const manifest = JSON.stringify({ version: data.version, exportedAt: data.exportedAt, recordCounts: db.recordCounts(data) }, null, 2);
  let manifestSha;
  try {
    manifestSha = await putFile(creds, MANIFEST_PATH, manifest, shas.manifest, 'Manifest');
  } catch (error) {
    if (error.code !== 'conflict') throw error;
    manifestSha = await putFile(creds, MANIFEST_PATH, manifest, await remoteSha(creds, MANIFEST_PATH), 'Manifest');
  }

  await db.setSetting('syncShas', { data: dataSha, manifest: manifestSha });
  await db.setSetting('lastSync', data.exportedAt);
  // Nur Änderungen bis zum gesicherten Stand abhaken, spätere bleiben in der Queue
  await db.clearQueueUntil(data.exportedAt);
  lastError = null;
}

/* Automatischer Sync: 30 Sekunden nach der letzten Änderung, nur online */

function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(autoSync, DEBOUNCE_MS);
  emitStatus();
}

async function autoSync() {
  if (!navigator.onLine || running) return;
  const creds = await credentials();
  if (!creds.owner || !creds.token || !(await hasPassword())) return;
  if ((await db.pendingCount()) === 0) return;
  if (!vault.isUnlocked() && promptDeclined) return;
  // Die Passwortabfrage unterbricht weder einen offenen Dialog noch eine laufende Einheit
  if (!vault.isUnlocked() && (document.querySelector('dialog[open]') || location.hash.startsWith('#/training/einheit'))) {
    scheduleSync();
    return;
  }
  try {
    await syncNow();
  } catch (error) {
    if (error.code === 'locked') {
      // Nicht bei jeder Änderung erneut fragen, bis zur nächsten manuellen Sicherung
      promptDeclined = true;
      return;
    }
    lastError = error instanceof SyncError ? error.message : 'Sicherung fehlgeschlagen.';
    toast(lastError, { error: true });
    emitStatus();
  }
}

export function initSync() {
  db.onChange(scheduleSync);
  window.addEventListener('online', autoSync);
  // Beim Start fragen wir nur nach dem Passwort, wenn eine Sicherung ansteht
  autoSync();
}

/* Wiederherstellen */

export async function restore() {
  const creds = await credentials();
  if (!creds.owner || !creds.token) throw new SyncError('Trage zuerst GitHub-Owner und Token ein.', 'not-configured');
  if (!navigator.onLine) throw new SyncError('Zum Wiederherstellen musst du online sein.', 'offline');

  const sha = await remoteSha(creds, DATA_PATH);
  const text = sha ? await remoteText(creds, DATA_PATH) : null;
  if (!text) throw new SyncError('Auf GitHub gibt es noch keine Sicherung.', 'empty');

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new SyncError('Die Sicherung auf GitHub ist beschädigt.');
  }

  // Passt das Salt zur Session, reicht der vorhandene Schlüssel
  let data = null;
  let keyInfo = null;
  if (vault.sessionSalt() === payload.salt) {
    data = await vault.decrypt(payload);
  } else {
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      const password = await askPassword({
        title: 'Passwort der Sicherung',
        text: attempt ? 'Das Passwort war falsch. Versuch es noch einmal.' : 'Gib das Passwort ein, mit dem die Sicherung erstellt wurde.',
        confirmLabel: 'Weiter',
      });
      if (password === null) return false;
      try {
        const key = await vault.deriveKey(password, payload.salt, payload.iterations);
        data = await vault.decrypt(payload, key);
        keyInfo = { key, salt: payload.salt };
      } catch {
        // nächster Versuch
      }
    }
    if (!data) throw new SyncError('Passwort falsch.');
  }

  db.validateExport(data);
  const total = Object.values(db.recordCounts(data)).reduce((sum, count) => sum + count, 0);
  const confirmed = await confirmDialog({
    title: 'Wiederherstellen?',
    text: `Lokale Daten werden überschrieben. Die Sicherung vom ${formatDateTime(data.exportedAt)} enthält ${total} Einträge.`,
    confirmLabel: 'Überschreiben',
    danger: true,
  });
  if (!confirmed) return false;

  await db.replaceAll(data);
  // Ab jetzt gilt das Passwort der wiederhergestellten Sicherung
  if (keyInfo) {
    vault.useSession(keyInfo.key, keyInfo.salt);
    await storeCheck(keyInfo);
  }
  const shas = await db.getSetting('syncShas', {});
  await db.setSetting('syncShas', { ...shas, data: sha });
  await db.setSetting('lastSync', data.exportedAt);
  lastError = null;
  emitStatus();
  return true;
}

/*
  Startet einen Workflow im Daten-Repo per workflow_dispatch, z. B. die Test-Mitteilung.
  Braucht im Token zusätzlich die Berechtigung Actions: Read and write für das Daten-Repo.
*/
export async function dispatchWorkflow(workflow, inputs = {}) {
  const creds = await requireCredentials();
  const base = `${API}/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}`;
  const headers = { Authorization: `Bearer ${creds.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const request = async (url, options = {}) => {
    try {
      return await fetch(url, { ...options, headers: { ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch {
      throw new SyncError('Keine Verbindung zu GitHub.', 'offline');
    }
  };
  // Standard-Branch des Daten-Repos, meist main
  const repoResponse = await request(base);
  if (!repoResponse.ok) throw new SyncError(httpErrorMessage(repoResponse.status, creds.repo), repoResponse.status);
  const { default_branch: ref = 'main' } = await repoResponse.json();
  const response = await request(`${base}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs }) });
  if (response.status === 204) return true;
  if (response.status === 401) throw new SyncError('Token ungültig oder abgelaufen.', 401);
  if (response.status === 403) throw new SyncError(`Dem Token fehlt die Berechtigung Actions: Read and write für ${creds.repo}.`, 403);
  if (response.status === 404) throw new SyncError(`Workflow ${workflow} im Repo ${creds.repo} nicht gefunden.`, 404);
  if (response.status === 422) throw new SyncError(`Der Workflow ${workflow} lässt sich nicht manuell starten.`, 422);
  throw new SyncError(httpErrorMessage(response.status, creds.repo), response.status);
}

/*
  Unverschlüsselte Hilfsdateien für Push-Erinnerungen (reminders.json, subscriptions.json).
  Sie enthalten nur Uhrzeiten und Push-Adressen, keine Gesundheitsdaten,
  denn die GitHub Action muss sie ohne Passwort lesen können.
*/

async function requireCredentials() {
  const creds = await credentials();
  if (!creds.owner || !creds.token) throw new SyncError('Trage zuerst GitHub-Owner und Token ein.', 'not-configured');
  if (!navigator.onLine) throw new SyncError('Dafür musst du online sein.', 'offline');
  return creds;
}

export async function readPlainJSON(path) {
  const creds = await requireCredentials();
  const text = await remoteText(creds, path);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncError(`${path} auf GitHub ist kein gültiges JSON.`);
  }
}

export async function writePlainJSON(path, data, label) {
  const creds = await requireCredentials();
  const text = `${JSON.stringify(data, null, 2)}\n`;
  try {
    await putFile(creds, path, text, await remoteSha(creds, path), label);
  } catch (error) {
    // Zwischenzeitlich geändert (z. B. durch die Action): aktuellen Stand holen und erneut schreiben
    if (error.code !== 'conflict') throw error;
    await putFile(creds, path, text, await remoteSha(creds, path), label);
  }
}
