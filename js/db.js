/*
  IndexedDB-Datenschicht.
  Regel: jede Datenänderung landet zuerst hier und erzeugt im selben
  Schreibvorgang einen Eintrag in der Sync-Queue. Der Sync selbst darf
  scheitern, die lokalen Daten nie.
*/

import { openDB } from './vendor/idb.js';

const DB_NAME = 'healthapp';
// Version 2: Store cycleSymptoms. Das Upgrade legt nur fehlende Stores an, Daten bleiben.
const DB_VERSION = 2;
export const EXPORT_VERSION = 1;

// Schema: Primärschlüssel und Indizes je Store
const SCHEMA = {
  checkins: { keyPath: 'id', indexes: ['date'] },
  medLog: { keyPath: 'id', indexes: ['date'] },
  meds: { keyPath: 'id', indexes: [] },
  workouts: { keyPath: 'id', indexes: ['date'] },
  exercisePrefs: { keyPath: 'exerciseId', indexes: [] },
  mealFeedback: { keyPath: 'id', indexes: ['date'] },
  cycleSymptoms: { keyPath: 'id', indexes: ['date'] },
  settings: { keyPath: 'key', indexes: [] },
  syncQueue: { keyPath: 'id', indexes: ['status'] },
};

// Stores, die gesichert und exportiert werden (die Queue ist rein lokal)
export const DATA_STORES = Object.keys(SCHEMA).filter((name) => name !== 'syncQueue');

// Einstellungen, die das Gerät nie verlassen: weder Sicherung noch Export.
// Das Profil (key "profile") gehört bewusst nicht dazu, es wandert mit der Sicherung.
export const LOCAL_SETTINGS = new Set(['syncOwner', 'syncToken', 'syncRepo', 'syncShas', 'lastSync', 'cryptoCheck', 'pushEndpoint', 'vapidPublicKey', 'pushStatus']);

const changeListeners = new Set();
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        for (const [name, { keyPath, indexes }] of Object.entries(SCHEMA)) {
          if (database.objectStoreNames.contains(name)) continue;
          const store = database.createObjectStore(name, { keyPath });
          indexes.forEach((index) => store.createIndex(index, index));
        }
      },
      // Andere Tabs mit neuer Version nicht blockieren
      blocking() {
        dbPromise?.then((database) => database.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/*
  Löscht die ganze Datenbank auf diesem Gerät (Zurücksetzen in den Einstellungen).
  Die eigene Verbindung wird vorher geschlossen, sonst blockiert sie das Löschen.
*/
export async function deleteEverything() {
  if (dbPromise) {
    const database = await dbPromise.catch(() => null);
    database?.close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Andere offene Tabs: die Löschung läuft, sobald sie schließen
    request.onblocked = () => resolve();
  });
}

export function newId() {
  return crypto.randomUUID();
}

// Beobachter für Datenänderungen, z. B. den automatischen Sync
export function onChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitChange(store) {
  changeListeners.forEach((listener) => listener(store));
}

function needsSync(store, value) {
  if (store === 'syncQueue') return false;
  if (store === 'settings' && LOCAL_SETTINGS.has(value?.key)) return false;
  return true;
}

function queueEntry(store) {
  return { id: newId(), createdAt: new Date().toISOString(), status: 'pending', store };
}

/* Lesen */

export async function get(store, key) {
  return (await open()).get(store, key);
}

export async function getAll(store) {
  return (await open()).getAll(store);
}

export async function getByDate(store, date) {
  return (await open()).getAllFromIndex(store, 'date', date);
}

/* Schreiben: Store und Queue in einer Transaktion */

export async function put(store, value) {
  const database = await open();
  const sync = needsSync(store, value);
  const tx = database.transaction(sync ? [store, 'syncQueue'] : [store], 'readwrite');
  tx.objectStore(store).put(value);
  if (sync) tx.objectStore('syncQueue').put(queueEntry(store));
  await tx.done;
  if (sync) emitChange(store);
  return value;
}

export async function remove(store, key) {
  const database = await open();
  const sync = needsSync(store, { key });
  const tx = database.transaction(sync ? [store, 'syncQueue'] : [store], 'readwrite');
  tx.objectStore(store).delete(key);
  if (sync) tx.objectStore('syncQueue').put(queueEntry(store));
  await tx.done;
  if (sync) emitChange(store);
}

// Markiert eine Änderung ohne Datensatz, z. B. nach Passwortwechsel
export async function markDirty(reason) {
  await (await open()).put('syncQueue', queueEntry(reason));
  emitChange(reason);
}

/* Einstellungen */

export async function getSetting(key, fallback = null) {
  const entry = await get('settings', key);
  return entry === undefined ? fallback : entry.value;
}

export function setSetting(key, value) {
  return put('settings', { key, value });
}

/* Sync-Queue */

export async function pendingCount() {
  return (await open()).countFromIndex('syncQueue', 'status', 'pending');
}

// Entfernt alle Einträge bis zum Zeitpunkt des gesicherten Stands
export async function clearQueueUntil(isoTime) {
  const tx = (await open()).transaction('syncQueue', 'readwrite');
  for await (const cursor of tx.store) {
    if (cursor.value.createdAt <= isoTime) cursor.delete();
  }
  await tx.done;
}

/* Export und Import */

export async function exportData() {
  const database = await open();
  const tx = database.transaction(DATA_STORES, 'readonly');
  const stores = {};
  for (const name of DATA_STORES) {
    stores[name] = await tx.objectStore(name).getAll();
  }
  await tx.done;
  stores.settings = stores.settings.filter((entry) => !LOCAL_SETTINGS.has(entry.key));
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), stores };
}

export function recordCounts(data) {
  return Object.fromEntries(Object.entries(data.stores).map(([name, records]) => [name, records.length]));
}

// Prüft grob, ob ein Objekt ein gültiger Export ist
export function validateExport(data) {
  if (!data || typeof data !== 'object' || typeof data.stores !== 'object' || data.stores === null) {
    throw new Error('Die Datei enthält keine gültigen Daten.');
  }
  if (data.version > EXPORT_VERSION) {
    throw new Error('Die Datei stammt aus einer neueren App-Version.');
  }
  for (const name of DATA_STORES) {
    const records = data.stores[name] ?? [];
    if (!Array.isArray(records) || records.some((record) => !record || record[SCHEMA[name].keyPath] === undefined)) {
      throw new Error('Die Datei enthält fehlerhafte Datensätze.');
    }
  }
}

/*
  Ersetzt alle gesicherten Stores durch den Inhalt eines Exports.
  Lokale Einstellungen (Token, Sync-Stand) bleiben erhalten.
  enqueue: true, wenn der neue Stand danach gesichert werden soll (Import aus Datei).
*/
export async function replaceAll(data, { enqueue = false } = {}) {
  validateExport(data);
  const database = await open();
  const tx = database.transaction([...DATA_STORES, 'syncQueue'], 'readwrite');

  const settingsStore = tx.objectStore('settings');
  const keptSettings = (await settingsStore.getAll()).filter((entry) => LOCAL_SETTINGS.has(entry.key));

  for (const name of DATA_STORES) {
    const store = tx.objectStore(name);
    await store.clear();
    for (const record of data.stores[name] ?? []) {
      if (name === 'settings' && LOCAL_SETTINGS.has(record.key)) continue;
      store.put(record);
    }
  }
  keptSettings.forEach((entry) => settingsStore.put(entry));

  const queue = tx.objectStore('syncQueue');
  await queue.clear();
  if (enqueue) queue.put(queueEntry('import'));
  await tx.done;
  if (enqueue) emitChange('import');
}
