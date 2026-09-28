#!/usr/bin/env node
/*
  Verschickt Push-Erinnerungen. Läuft als GitHub Action im privaten Repo health-data.
  Liest reminders.json (Uhrzeiten, Zeitzone) und subscriptions.json (Push-Adressen),
  die die App dort ablegt. Jede Uhrzeit wird höchstens einmal pro Tag verschickt,
  auch wenn die Action mehrfach oder verspätet läuft (Zustand in reminders-state.json).
  Die Nachricht ist allgemein und enthält keine Gesundheitsdaten.
*/

import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';

// Wie spät eine Erinnerung noch verschickt wird, falls GitHub die Action verzögert startet
const LATE_LIMIT_MINUTES = 120;

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY und VAPID_SUBJECT müssen als Secrets gesetzt sein.');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const reminders = await readJSON('reminders.json', null);
if (!reminders || !Array.isArray(reminders.times) || !reminders.times.length) {
  console.log('Keine Erinnerungszeiten in reminders.json.');
  process.exit(0);
}
const subscriptions = await readJSON('subscriptions.json', { version: 1, subscriptions: [] });
const state = await readJSON('reminders-state.json', { lastSent: {} });

// Lokales Datum und Uhrzeit in der Zeitzone der Erinnerungen
const timezone = reminders.timezone || 'Europe/Berlin';
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
const get = (type) => parts.find((part) => part.type === type).value;
const localDate = `${get('year')}-${get('month')}-${get('day')}`;
const nowMinutes = Number(get('hour')) * 60 + Number(get('minute'));
const minutesOf = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const due = reminders.times.filter((time) => {
  const diff = nowMinutes - minutesOf(time);
  return diff >= 0 && diff <= LATE_LIMIT_MINUTES && state.lastSent?.[time] !== localDate;
});

if (!due.length) {
  console.log(`Nichts fällig (${localDate}, ${get('hour')}:${get('minute')} ${timezone}).`);
  process.exit(0);
}

const payload = JSON.stringify({
  title: 'Health',
  body: 'Zeit für deine Medis. Schau kurz in die App.',
  url: './#/medis',
  tag: `medis-${localDate}-${due.at(-1)}`,
});

const keep = [];
let sent = 0;
for (const subscription of subscriptions.subscriptions ?? []) {
  try {
    await webpush.sendNotification(subscription, payload, { TTL: 3600, urgency: 'high' });
    sent++;
    keep.push(subscription);
  } catch (error) {
    // 404 und 410: Abo existiert nicht mehr, wird entfernt. Adressen nicht ins Log schreiben.
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log('Abgelaufenes Abo entfernt.');
    } else {
      console.log(`Versand fehlgeschlagen (Status ${error.statusCode ?? 'unbekannt'}).`);
      keep.push(subscription);
    }
  }
}

state.lastSent = { ...(state.lastSent ?? {}) };
for (const time of due) state.lastSent[time] = localDate;
await writeFile('reminders-state.json', `${JSON.stringify(state, null, 2)}\n`);
if (keep.length !== (subscriptions.subscriptions ?? []).length) {
  await writeFile('subscriptions.json', `${JSON.stringify({ ...subscriptions, subscriptions: keep }, null, 2)}\n`);
}
console.log(`${sent} Mitteilung(en) für ${due.join(', ')} verschickt.`);
