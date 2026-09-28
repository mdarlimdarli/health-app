/*
  Auszug für eine Beratung: unverschlüsseltes Markdown über 4, 8 oder 12 Wochen.
  Profil-Kurzfassung, Check-ins, Training verdichtet, Einnahme, Mahlzeiten-Feedback, Messwerte.
  Mit "anonymize" erscheinen Medikamente nur als Medikament 1, 2 und so weiter.
  Keine Interpretation, nur Daten.
*/

import * as db from './db.js';
import { getProfile } from './profile.js';
import { todayISO } from './ui.js';
import { SLIDER_META, activeSliders, cycleDayFor } from './checkin-core.js';
import { adherence, isMeasurement, describeSchedule } from './meds-schedule.js';
import { estimate1RM } from './planner.js';
import { INTOLERANCE_LABELS } from './food-rules.js';

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const german = (iso) => iso.split('-').reverse().join('.');
const num = (value, digits = 1) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits });
const cell = (value) => String(value ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ').trim();
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n');
const tagText = (tag) => tag.replace(/-/g, ' ');

export async function buildReport({ weeks = 4, anonymize = true } = {}) {
  const profile = getProfile();
  const today = todayISO();
  const from = addDays(today, -(weeks * 7 - 1));
  const inRange = (date) => date >= from && date <= today;

  const [checkins, workouts, meds, medLog, feedback] = await Promise.all([
    db.getAll('checkins'), db.getAll('workouts'), db.getAll('meds'), db.getAll('medLog'), db.getAll('mealFeedback'),
  ]);
  let library = new Map();
  let foods = { meals: [] };
  try {
    library = new Map((await (await fetch('./data/exercises.json')).json()).exercises.map((e) => [e.id, e]));
  } catch { /* ohne Bibliothek nur IDs */ }
  try {
    foods = await (await fetch('./data/meals.json')).json();
  } catch { /* ohne Essensplan nur IDs */ }

  // Medikamente nummerieren, Messungen behalten ihren Namen
  const drugs = meds.filter((med) => !isMeasurement(med));
  const medName = (med) => (anonymize && !isMeasurement(med) ? `Medikament ${drugs.indexOf(med) + 1}` : med.name);

  const lines = [];
  lines.push(`# Auszug Gesundheitsdaten`, '', `Zeitraum: ${german(from)} bis ${german(today)} (${weeks} Wochen). Erstellt am ${german(today)}.`, '');

  // Profil
  const t = profile.training;
  const d = profile.diet;
  lines.push('## Profil');
  const profileLines = [
    profile.birthYear ? `Geburtsjahr: ${profile.birthYear}` : null,
    `Zyklus-Tracking: ${profile.cycleTracking ? 'ja' : 'nein'}`,
    `Training: ${t.daysPerWeek} Tage pro Woche, Level ${t.level}, Phase ${(await db.getSetting('trainingPhase')) ?? t.startPhase}`,
    t.avoidTags.length ? `Schonungen: ${t.avoidTags.map(tagText).join(', ')}` : null,
    d.intolerances.length ? `Unverträglichkeiten: ${d.intolerances.map((k) => INTOLERANCE_LABELS[k] ?? k).join(', ')}` : null,
    d.dislikes.length ? `Abneigungen: ${d.dislikes.map(tagText).join(', ')}` : null,
    drugs.length ? `Medikamente: ${drugs.filter((m) => m.active !== false).map((m) => `${medName(m)}${anonymize ? '' : m.dosage ? ` (${m.dosage})` : ''}, ${describeSchedule(m)}`).join('; ')}` : null,
    anonymize && drugs.length ? 'Medikamentennamen sind anonymisiert.' : null,
  ].filter(Boolean);
  lines.push(...profileLines.map((line) => `- ${line}`), '');

  // Check-ins
  const sliders = activeSliders(profile);
  const rows = [];
  const sortedCheckins = checkins.filter((c) => inRange(c.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const c of sortedCheckins) {
    const row = [german(c.date), ...sliders.map((key) => c[key] ?? '')];
    if (profile.cycleTracking) row.push((await cycleDayFor(c.date, checkins)) ?? '');
    row.push(c.trainedToday ? 'ja' : '', c.note ?? '');
    rows.push(row);
  }
  lines.push('## Check-ins', '', 'Skala 1 bis 5.', '');
  const head = ['Datum', ...sliders.map((key) => SLIDER_META[key].label), ...(profile.cycleTracking ? ['Zyklustag'] : []), 'Training', 'Notiz'];
  lines.push(rows.length ? table(head, rows) : 'Keine Check-ins im Zeitraum.', '');

  // Training verdichtet
  const done = workouts.filter((w) => w.finishedAt && inRange(w.date)).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  lines.push('## Training', '');
  if (!done.length) {
    lines.push('Keine Einheiten im Zeitraum.', '');
  } else {
    const feels = done.map((w) => w.overallFeel).filter(Number.isInteger);
    lines.push(`- Einheiten: ${done.length}, im Schnitt ${num(done.length / weeks)} pro Woche`);
    if (feels.length) lines.push(`- Gesamtgefühl im Schnitt: ${num(feels.reduce((a, b) => a + b, 0) / feels.length)} von 5`);
    lines.push('');
    const byExercise = new Map();
    for (const w of done) {
      for (const set of w.sets) {
        const entry = byExercise.get(set.exerciseId) ?? { sessions: new Map() };
        const best = Math.max(entry.sessions.get(w.date) ?? 0, estimate1RM(set.weight, set.reps) || set.reps);
        entry.sessions.set(w.date, best);
        byExercise.set(set.exerciseId, entry);
      }
    }
    const trainingRows = [...byExercise].map(([id, entry]) => {
      const values = [...entry.sessions.values()];
      const exercise = library.get(id);
      const unit = exercise?.unit === 'seconds' ? 's' : exercise && ['koerpergewicht', 'matte'].includes(exercise.equipment) ? 'Wdh.' : 'kg 1RM';
      return [exercise?.name ?? id, entry.sessions.size, `${num(values[0])} ${unit}`, `${num(values.at(-1))} ${unit}`];
    });
    lines.push(table(['Übung', 'Einheiten', 'Anfang', 'Ende'], trainingRows), '', 'Anfang und Ende: bester Satz der ersten und letzten Einheit, bei Gewichten geschätztes Maximum nach Epley.', '');
  }

  // Einnahme
  const logs = new Map(medLog.map((log) => [log.id, log]));
  const firstLog = new Map();
  for (const log of medLog) if (!firstLog.has(log.medId) || log.date < firstLog.get(log.medId)) firstLog.set(log.medId, log.date);
  const adherenceRows = meds.filter((med) => med.active !== false).map((med) => {
    const result = adherence(med, logs, today, { days: weeks * 7, firstLogDate: firstLog.get(med.id) });
    return [medName(med), result.due ? `${result.percent} %` : 'nicht fällig', `${result.done} von ${result.due}`];
  });
  lines.push('## Einnahme und Messungen, erledigt', '');
  lines.push(adherenceRows.length ? table(['Eintrag', 'Anteil', 'Erledigt'], adherenceRows) : 'Keine Einträge.', '');

  // Mahlzeiten-Feedback
  const mealNames = new Map((foods.meals ?? []).map((m) => [m.id, m.name]));
  const feedbackRows = feedback.filter((f) => inRange(f.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((f) => [german(f.date), mealNames.get(f.mealId) ?? f.mealId, f.tolerated ?? '', f.liked === true ? 'schmeckt' : f.liked === false ? 'schmeckt nicht' : '', f.note ?? '']);
  lines.push('## Mahlzeiten-Feedback', '');
  lines.push(feedbackRows.length ? table(['Datum', 'Gericht', 'Vertragen', 'Geschmack', 'Notiz'], feedbackRows) : 'Kein Feedback im Zeitraum.', '');

  // Messwerte
  const measureNames = new Map(meds.filter(isMeasurement).map((m) => [m.id, m.name]));
  const measureRows = medLog.filter((log) => log.values && inRange(log.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((log) => [german(log.date), measureNames.get(log.medId) ?? log.medId, `${log.values.systolic}/${log.values.diastolic}`, log.values.pulse ?? '']);
  lines.push('## Messwerte', '');
  lines.push(measureRows.length ? table(['Datum', 'Messung', 'Blutdruck', 'Puls'], measureRows) : 'Keine Messwerte im Zeitraum.', '');

  return lines.join('\n');
}
