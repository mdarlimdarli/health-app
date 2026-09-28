/*
  Web Push ohne eigenen Server: Die App abonniert Push im Browser und legt
  reminders.json (Uhrzeiten) und subscriptions.json (Push-Adressen) im
  Daten-Repo ab (Standard health-data, in den Einstellungen änderbar). Eine GitHub Action dort verschickt die Erinnerungen.
  Die Nachricht ist bewusst allgemein und nennt keine Medikamente.
*/

import * as db from './db.js';
import { readPlainJSON, writePlainJSON } from './sync.js';
import { getProfile } from './profile.js';

const REMINDERS_FILE = 'reminders.json';
const SUBSCRIPTIONS_FILE = 'subscriptions.json';

export function pushSupport() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return { supported, standalone, ios, permission: 'Notification' in window ? Notification.permission : 'unsupported' };
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager ? registration.pushManager.getSubscription() : null;
}

export function reminderTimes() {
  const times = getProfile().reminders?.times ?? [];
  return [...new Set(times.filter((time) => /^\d{2}:\d{2}$/.test(time)))].sort();
}

export function reminderTimezone() {
  return getProfile().reminders?.timezone || 'Europe/Berlin';
}

// Abweichung der Zeitzone von UTC in Minuten an einem Datum (Winter und Sommer getrennt)
function offsetMinutes(timezone, date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((local - date.getTime()) / 60000);
}

/*
  Cron-Zeilen in UTC für die Action. Pro Uhrzeit eine Zeile für Winter- und eine für
  Sommerzeit, das Script sendet trotzdem nur einmal pro Tag und Uhrzeit.
*/
export function cronLines(times = reminderTimes(), timezone = reminderTimezone()) {
  const year = new Date().getUTCFullYear();
  const offsets = [...new Set([offsetMinutes(timezone, new Date(Date.UTC(year, 0, 15, 12))), offsetMinutes(timezone, new Date(Date.UTC(year, 6, 15, 12)))])];
  const lines = new Set();
  for (const time of times) {
    const [h, m] = time.split(':').map(Number);
    for (const offset of offsets) {
      const utc = (((h * 60 + m - offset) % 1440) + 1440) % 1440;
      lines.add(`${utc % 60} ${Math.floor(utc / 60)} * * *`);
    }
  }
  return [...lines].sort((a, b) => {
    const [am, ah] = a.split(' ').map(Number);
    const [bm, bh] = b.split(' ').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });
}

export function workflowSnippet() {
  return cronLines().map((line) => `    - cron: '${line}'`).join('\n');
}

export async function writeReminders() {
  await writePlainJSON(REMINDERS_FILE, {
    version: 1,
    timezone: reminderTimezone(),
    times: reminderTimes(),
    updatedAt: new Date().toISOString(),
  }, 'Erinnerungszeiten');
}

async function updateSubscriptions(change) {
  const current = (await readPlainJSON(SUBSCRIPTIONS_FILE)) ?? { version: 1, subscriptions: [] };
  const list = Array.isArray(current.subscriptions) ? current.subscriptions : [];
  await writePlainJSON(SUBSCRIPTIONS_FILE, { version: 1, subscriptions: change(list) }, 'Push-Abo');
}

export async function enablePush(vapidPublicKey) {
  const key = vapidPublicKey.trim();
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(key)) throw new Error('Der öffentliche VAPID-Schlüssel sieht nicht richtig aus.');
  const { supported } = pushSupport();
  if (!supported) throw new Error('Dieses Gerät unterstützt Web Push nicht. Auf dem iPhone geht es nur in der installierten App ab iOS 16.4.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Mitteilungen sind nicht erlaubt. Du kannst sie in den iOS-Einstellungen für diese App freigeben.');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  }
  const json = subscription.toJSON();
  await writeReminders();
  await updateSubscriptions((list) => [
    ...list.filter((entry) => entry.endpoint !== json.endpoint),
    { endpoint: json.endpoint, keys: json.keys, createdAt: new Date().toISOString() },
  ]);
  await db.setSetting('vapidPublicKey', key);
  await db.setSetting('pushEndpoint', json.endpoint);
}

export async function disablePush() {
  const subscription = await currentSubscription();
  const endpoint = subscription?.endpoint ?? (await db.getSetting('pushEndpoint'));
  if (endpoint) await updateSubscriptions((list) => list.filter((entry) => entry.endpoint !== endpoint));
  await subscription?.unsubscribe();
  await db.setSetting('pushEndpoint', null);
}

// App-Badge am Home-Bildschirm-Symbol, wo unterstützt
export function setAppBadge(count) {
  try {
    if (count > 0) navigator.setAppBadge?.(count)?.catch?.(() => {});
    else navigator.clearAppBadge?.()?.catch?.(() => {});
  } catch {
    // nicht unterstützt
  }
}
