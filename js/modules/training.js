/*
  Trainingsmodul: Übersicht (#/training), laufende Einheit (#/training/einheit)
  und Fortschritt (#/training/fortschritt).
  Pläne erzeugt js/planner.js aus profile.training, die Übungen stehen in data/exercises.json.
  Eine laufende Einheit liegt als workouts-Datensatz ohne finishedAt in IndexedDB,
  jeder geloggte Satz wird sofort gespeichert.
*/

import * as db from '../db.js';
import { getProfile } from '../profile.js';
import { generatePlans, prescription, suggestProgression, shouldSuggestPhaseChange, estimate1RM, isAllowed, SESSIONS_PER_PHASE } from '../planner.js';
import { toast, confirmDialog, todayISO, el } from '../ui.js';

const YOUTUBE_SEARCH = 'https://www.youtube.com/results?search_query=';
const WEIGHT_STEP = 1.25;
const SNOOZE_SESSIONS = 8;
const BODYWEIGHT = new Set(['koerpergewicht', 'matte']);

let library = null;

/* Daten */

async function loadLibrary() {
  if (!library) {
    const response = await fetch('./data/exercises.json');
    const data = await response.json();
    library = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  }
  return library;
}

async function loadPrefs() {
  const list = await db.getAll('exercisePrefs');
  return Object.fromEntries(list.map((pref) => [pref.exerciseId, pref]));
}

async function savePref(exerciseId, changes) {
  const current = (await db.get('exercisePrefs', exerciseId)) ?? { exerciseId, disliked: false, replacedBy: null, lastWeight: null, lastReps: null };
  return db.put('exercisePrefs', { ...current, ...changes });
}

async function currentPhase() {
  const stored = await db.getSetting('trainingPhase');
  return stored ?? (getProfile().training.startPhase === 2 ? 2 : 1);
}

// Handgeschriebene data/plans.json hat Vorrang, sonst aus dem Profil erzeugen
async function loadPlans(lib) {
  try {
    const response = await fetch('./data/plans.json', { cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.plans) && data.plans.length) return { ...data, source: 'datei' };
    }
  } catch {
    // keine Überschreibung vorhanden
  }
  const result = generatePlans({ training: getProfile().training, exercises: [...lib.values()], prefs: await loadPrefs(), phase: await currentPhase() });
  return { ...result, source: 'profil' };
}

async function loadWorkouts() {
  const list = await db.getAll('workouts');
  return list.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

const finishedOf = (list) => list.filter((workout) => workout.finishedAt);
const activeOf = (list) => list.filter((workout) => !workout.finishedAt).at(-1) ?? null;

/* Datum und Zahlen */

function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function mondayOf(iso) {
  const date = isoToUTC(iso);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = isoToUTC(todayISO());
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(isoToUTC(iso));
}

const formatNumber = (value, digits = 2) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits });

function minutesBetween(start, end) {
  return Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000));
}

function repLabel(exercise, [min, max]) {
  return exercise.unit === 'seconds' ? `${min} bis ${max} s` : `${min} bis ${max} Wdh.`;
}

const isWeighted = (exercise) => !BODYWEIGHT.has(exercise.equipment);

// Letzte Sätze einer Übung aus der jüngsten abgeschlossenen Einheit
function lastSetsFor(exerciseId, finished) {
  for (let i = finished.length - 1; i >= 0; i--) {
    const sets = finished[i].sets.filter((set) => set.exerciseId === exerciseId);
    if (sets.length) return sets;
  }
  return [];
}

function nextPlan(plans, finished) {
  const last = finished.at(-1);
  if (!last) return plans[0];
  const index = plans.findIndex((plan) => plan.id === last.planId);
  return plans[(index + 1) % plans.length] ?? plans[0];
}

/* Kleine Bausteine */

function icon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
const ICON_PLAY = '<path d="M8 5.5v13l10.5-6.5z"/>';
const ICON_SWAP = '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>';
const ICON_NO = '<circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/>';

function button(label, className, action) {
  const node = el('button', className, label);
  node.type = 'button';
  if (action) node.dataset.action = action;
  return node;
}

// Stepper mit großen Tap-Flächen
function stepper({ value, step, min = 0, unit, label, format = formatNumber, onChange }) {
  const wrap = el('div', 'stepper');
  const minus = button('', 'stepper-button');
  const plus = button('', 'stepper-button');
  minus.append(icon('<path d="M6 12h12"/>'));
  plus.append(icon('<path d="M6 12h12M12 6v12"/>'));
  minus.setAttribute('aria-label', `${label} verringern`);
  plus.setAttribute('aria-label', `${label} erhöhen`);
  const output = el('output', 'stepper-value');
  output.setAttribute('aria-label', label);
  let current = value;
  const show = () => { output.textContent = `${format(current)} ${unit}`; };
  const change = (delta) => {
    current = Math.max(min, Math.round((current + delta) * 100) / 100);
    show();
    onChange(current);
  };
  minus.addEventListener('click', () => change(-step));
  plus.addEventListener('click', () => change(step));
  show();
  wrap.append(minus, output, plus);
  return wrap;
}

/* Dialoge */

function openSheet(build) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'dialog sheet');
    let result = null;
    const done = (value) => { result = value; dialog.close(); };
    build(dialog, done);
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

function chooseAlternative(exercise, options) {
  return openSheet((dialog, done) => {
    dialog.append(el('h2', null, 'Alternative wählen'), el('p', 'secondary', `Statt ${exercise.name}, gleiche Muskelgruppe und gleiches Level.`));
    if (!options.length) dialog.append(el('p', null, 'Für diese Übung gibt es keine passende Alternative.'));
    for (const option of options) {
      const row = el('div', 'alt-row');
      row.append(el('span', 'alt-name', option.name));
      const today = button('Nur heute', 'button');
      const always = button('Dauerhaft', 'button button--primary');
      today.addEventListener('click', () => done({ id: option.id, permanent: false }));
      always.addEventListener('click', () => done({ id: option.id, permanent: true }));
      const actions = el('div', 'button-row');
      actions.append(today, always);
      row.append(actions);
      dialog.append(row);
    }
    const cancel = button('Abbrechen', 'button');
    cancel.addEventListener('click', () => done(null));
    dialog.append(cancel);
  });
}

function finishDialog() {
  return openSheet((dialog, done) => {
    const form = el('form', 'stack-tight');
    form.append(el('h2', null, 'Einheit beenden'), el('span', 'label', 'Wie war es insgesamt?'));
    const feel = el('div', 'feel-options');
    feel.setAttribute('role', 'radiogroup');
    for (let value = 1; value <= 5; value++) {
      const option = el('label', 'feel-option');
      const input = el('input');
      input.type = 'radio';
      input.name = 'feel';
      input.value = String(value);
      input.required = true;
      option.append(input, el('span', null, String(value)));
      feel.append(option);
    }
    const scale = el('div', 'feel-scale');
    scale.append(el('span', 'hint', 'schwer'), el('span', 'hint', 'richtig gut'));
    const note = el('textarea', 'input textarea');
    note.name = 'note';
    note.rows = 3;
    note.placeholder = 'Notiz, optional';
    const actions = el('div', 'button-row');
    const back = button('Weiter trainieren', 'button');
    const save = el('button', 'button button--primary', 'Speichern');
    save.type = 'submit';
    actions.append(back, save);
    back.addEventListener('click', () => done(null));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const choice = form.querySelector('input[name="feel"]:checked');
      if (!choice) {
        toast('Bitte wähle, wie es war.', { error: true });
        return;
      }
      done({ feel: Number(choice.value), note: note.value.trim() });
    });
    form.append(feel, scale, note, actions);
    dialog.append(form);
  });
}

/* Pausentimer: groß, einhändig, Farbwechsel am Ende */

const rest = { node: null, end: 0, interval: null };

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function stopRest() {
  clearInterval(rest.interval);
  rest.node?.remove();
  rest.node = null;
}

function startRest(seconds) {
  if (!(seconds > 0)) return;
  stopRest();
  const node = el('div', 'rest-timer');
  node.setAttribute('role', 'timer');
  node.setAttribute('aria-live', 'polite');
  const blob = el('div', 'blob blob--sonne');
  const label = el('p', 'label', 'Pause');
  const time = el('p', 'number rest-time');
  const actions = el('div', 'button-row');
  const more = button('+15 s', 'button');
  const skip = button('Weiter', 'button button--primary');
  actions.append(more, skip);
  node.append(blob, label, time, actions);
  document.body.append(node);
  rest.node = node;
  rest.end = Date.now() + seconds * 1000;

  const tick = () => {
    const left = (rest.end - Date.now()) / 1000;
    time.textContent = formatClock(left);
    // Je näher das Ende, desto satter die Fläche
    blob.style.setProperty('--intensity', String(Math.min(1, Math.max(0.3, 1 - left / seconds))));
    if (left <= 0 && !node.classList.contains('rest-timer--done')) {
      node.classList.add('rest-timer--done');
      blob.className = 'blob blob--salbei';
      label.textContent = "Weiter geht's";
      clearInterval(rest.interval);
    }
  };
  more.addEventListener('click', () => {
    rest.end = Math.max(rest.end, Date.now()) + 15000;
    if (node.classList.contains('rest-timer--done')) {
      node.classList.remove('rest-timer--done');
      blob.className = 'blob blob--sonne';
      label.textContent = 'Pause';
      rest.interval = setInterval(tick, 250);
    }
    tick();
  });
  skip.addEventListener('click', stopRest);
  tick();
  rest.interval = setInterval(tick, 250);
}

/* Wake Lock: Bildschirm bleibt während der Einheit an */

const screen = { lock: null, wanted: false };

async function keepScreenOn() {
  screen.wanted = true;
  try {
    screen.lock = await navigator.wakeLock?.request('screen');
  } catch {
    screen.lock = null;
  }
}

function releaseScreen() {
  screen.wanted = false;
  screen.lock?.release().catch(() => {});
  screen.lock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && screen.wanted) keepScreenOn();
});

/* Übersicht */

const OVERVIEW = `
  <section class="stack training">
    <div class="card phase-card" data-phase-card hidden>
      <div class="blob blob--sonne"></div>
      <p class="label">Vorschlag</p>
      <p data-phase-text></p>
      <div class="button-row">
        <button class="button" type="button" data-action="snooze">Später</button>
        <button class="button button--primary" type="button" data-action="phase-up">Wechseln</button>
      </div>
    </div>

    <div class="card active-card" data-active hidden>
      <p class="label">Einheit läuft</p>
      <h2 data-active-name></h2>
      <a class="button button--primary" href="#/training/einheit">Fortsetzen</a>
    </div>

    <div class="week">
      <div class="blob blob--sonne" data-week-blob></div>
      <p class="label">Diese Woche</p>
      <div class="ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="ring-sonne" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" class="ring-stop-from"/>
              <stop offset="1" class="ring-stop-to"/>
            </linearGradient>
          </defs>
          <circle class="ring-track" cx="100" cy="100" r="84"/>
          <circle class="ring-value" cx="100" cy="100" r="84" data-ring/>
        </svg>
        <div class="ring-center">
          <span class="number" data-week-done></span>
          <span class="label" data-week-goal></span>
        </div>
      </div>
    </div>

    <div class="card next-card">
      <p class="label">Nächste Einheit</p>
      <h2 data-next-name></h2>
      <p class="secondary" data-next-meta></p>
      <ol class="plan-list" data-next-list></ol>
      <button class="button button--primary button--large" type="button" data-action="start">Einheit starten</button>
    </div>

    <div class="card" data-last hidden>
      <p class="label">Letzte Einheit</p>
      <div class="last-row">
        <div>
          <h2 data-last-name></h2>
          <p class="secondary" data-last-meta></p>
        </div>
        <div class="last-feel">
          <span class="card-number" data-last-feel></span>
          <span class="label">Gefühl</span>
        </div>
      </div>
    </div>

    <div class="button-row">
      <a class="button" href="#/training/fortschritt">Fortschritt</a>
      <button class="button" type="button" data-action="plans">Alle Pläne</button>
    </div>
    <div class="stack-tight" data-all-plans hidden></div>
    <p class="hint" data-source></p>
  </section>
`;

function planList(plan, lib) {
  const list = el('ol', 'plan-list');
  for (const entry of plan.exercises) {
    const exercise = lib.get(entry.exerciseId);
    const item = el('li');
    item.append(el('span', null, exercise?.name ?? entry.exerciseId), el('span', 'secondary', `${entry.sets} × ${exercise ? repLabel(exercise, entry.repRange) : ''}`));
    list.append(item);
  }
  return list;
}

async function renderOverview(root, lib) {
  root.innerHTML = OVERVIEW;
  const $ = (selector) => root.querySelector(selector);
  const [plansData, workouts] = await Promise.all([loadPlans(lib), loadWorkouts()]);
  const plans = plansData.plans;
  const finished = finishedOf(workouts);
  const active = activeOf(workouts);
  const goal = Math.max(1, Number(getProfile().training.daysPerWeek) || 2);

  // Wochenziel als Ring
  const monday = mondayOf(todayISO());
  const doneThisWeek = finished.filter((workout) => workout.date >= monday).length;
  const circumference = 2 * Math.PI * 84;
  const ring = $('[data-ring]');
  ring.setAttribute('stroke-dasharray', circumference.toFixed(2));
  ring.setAttribute('stroke-dashoffset', (circumference * (1 - Math.min(1, doneThisWeek / goal))).toFixed(2));
  $('[data-week-done]').textContent = String(doneThisWeek);
  $('[data-week-goal]').textContent = `von ${goal} ${goal === 1 ? 'Einheit' : 'Einheiten'}`;
  $('[data-week-blob]').style.setProperty('--intensity', String(Math.min(1, 0.25 + doneThisWeek / goal * 0.75)));

  // Laufende Einheit
  if (active) {
    $('[data-active]').hidden = false;
    $('[data-active-name]').textContent = active.planName ?? `Plan ${active.planId}`;
  }

  // Nächster Plan
  const next = nextPlan(plans, finished);
  $('[data-next-name]').textContent = next.name;
  $('[data-next-meta]').textContent = `${next.exercises.length} Übungen, dazu ${Math.round(next.mobility.reduce((sum, m) => sum + m.seconds, 0) / 60)} Minuten Mobility`;
  $('[data-next-list]').replaceWith(planList(next, lib));
  const startButton = $('[data-action="start"]');
  if (active) startButton.textContent = 'Einheit fortsetzen';
  startButton.addEventListener('click', async () => {
    if (!active) await startWorkout(next, lib);
    location.hash = '#/training/einheit';
  });

  // Letzte Einheit
  const last = finished.at(-1);
  if (last) {
    $('[data-last]').hidden = false;
    $('[data-last-name]').textContent = last.planName ?? `Plan ${last.planId}`;
    const setCount = last.sets.length;
    $('[data-last-meta]').textContent = `${formatDate(last.date)}, ${minutesBetween(last.startedAt, last.finishedAt)} Minuten, ${setCount} ${setCount === 1 ? 'Satz' : 'Sätze'}`;
    $('[data-last-feel]').textContent = last.overallFeel ? String(last.overallFeel) : '';
  }

  // Phasenwechsel vorschlagen, nie erzwingen
  const phase = await currentPhase();
  const since = await db.getSetting('trainingPhaseSince');
  const inPhase = finished.filter((workout) => !since || workout.date >= since).length;
  const snoozedAt = await db.getSetting('phaseSuggestionSnoozedAt', -Infinity);
  if (shouldSuggestPhaseChange(phase, inPhase) && inPhase >= snoozedAt + SNOOZE_SESSIONS) {
    $('[data-phase-card]').hidden = false;
    $('[data-phase-text]').textContent = `Du hast ${inPhase} Einheiten in Phase 1 geschafft. Bereit für Phase 2 mit freien Gewichten? Dein Plan wird dann neu zusammengestellt.`;
    $('[data-action="phase-up"]').addEventListener('click', async () => {
      await db.setSetting('trainingPhase', 2);
      await db.setSetting('trainingPhaseSince', todayISO());
      toast('Phase 2 aktiv');
      renderOverview(root, lib);
    });
    $('[data-action="snooze"]').addEventListener('click', async () => {
      await db.setSetting('phaseSuggestionSnoozedAt', inPhase);
      $('[data-phase-card]').hidden = true;
    });
  }
  root.querySelectorAll('.phase-card .blob').forEach((blob) => blob.style.setProperty('--intensity', '0.5'));

  // Alle Pläne
  const allPlans = $('[data-all-plans]');
  for (const plan of plans) {
    const card = el('div', 'card');
    card.append(el('h2', null, plan.name), planList(plan, lib));
    allPlans.append(card);
  }
  $('[data-action="plans"]').addEventListener('click', (event) => {
    allPlans.hidden = !allPlans.hidden;
    event.currentTarget.textContent = allPlans.hidden ? 'Alle Pläne' : 'Pläne ausblenden';
  });

  $('[data-source]').textContent = plansData.source === 'datei'
    ? 'Pläne aus data/plans.json.'
    : `Pläne aus deinem Profil erzeugt, Phase ${plansData.phase}. Nach ${SESSIONS_PER_PHASE} Einheiten schlagen wir den nächsten Schritt vor.`;
}

async function startWorkout(plan, lib) {
  const workout = {
    id: db.newId(),
    date: todayISO(),
    planId: plan.id,
    planName: plan.name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    entries: plan.exercises.map((entry) => ({ ...entry })),
    mobility: plan.mobility.map((item) => ({ ...item })),
    mobilityDone: [],
    sets: [],
    overallFeel: null,
    note: '',
  };
  await db.put('workouts', workout);
  return workout;
}

/* Laufende Einheit */

const SESSION = `
  <section class="stack session">
    <div class="session-head">
      <p class="label" data-plan-name></p>
      <div class="day-line"><span class="number" data-progress></span><span class="month" data-progress-total></span></div>
      <p class="secondary">Sätze erledigt</p>
    </div>
    <div class="card">
      <h2>Mobility</h2>
      <p class="secondary">Etwa 5 Minuten zum Aufwärmen.</p>
      <div class="check-list" data-mobility></div>
    </div>
    <div class="stack" data-exercises></div>
    <button class="button button--primary button--large" type="button" data-action="finish">Einheit beenden</button>
    <button class="button" type="button" data-action="discard">Einheit verwerfen</button>
  </section>
`;

async function renderSession(root, lib) {
  const workouts = await loadWorkouts();
  const workout = activeOf(workouts);
  if (!workout) {
    location.hash = '#/training';
    return;
  }
  const finished = finishedOf(workouts);
  const prefs = await loadPrefs();
  const training = getProfile().training;
  const phase = await currentPhase();

  root.innerHTML = SESSION;
  const $ = (selector) => root.querySelector(selector);
  $('[data-plan-name]').textContent = workout.planName ?? `Plan ${workout.planId}`;

  keepScreenOn();
  const leave = () => {
    if (!location.hash.startsWith('#/training/einheit')) {
      releaseScreen();
      stopRest();
      window.removeEventListener('hashchange', leave);
    }
  };
  window.addEventListener('hashchange', leave);

  const save = () => db.put('workouts', workout);
  const totalSets = () => workout.entries.reduce((sum, entry) => sum + entry.sets, 0);
  const updateProgress = () => {
    $('[data-progress]').textContent = String(workout.sets.length);
    $('[data-progress-total]').textContent = `von ${totalSets()}`;
  };
  updateProgress();

  // Mobility-Block
  const mobility = $('[data-mobility]');
  for (const item of workout.mobility) {
    const exercise = lib.get(item.exerciseId);
    if (!exercise) continue;
    const row = el('label', 'check-row');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = workout.mobilityDone.includes(item.exerciseId);
    input.addEventListener('change', () => {
      workout.mobilityDone = input.checked
        ? [...new Set([...workout.mobilityDone, item.exerciseId])]
        : workout.mobilityDone.filter((id) => id !== item.exerciseId);
      save();
    });
    const text = el('span', 'check-text');
    text.append(el('span', null, exercise.name), el('span', 'secondary', `${item.seconds} s`));
    row.append(input, text);
    mobility.append(row);
  }

  // Übungskarten
  const list = $('[data-exercises]');
  const rerender = () => renderSession(root, lib);
  workout.entries.forEach((entry, index) => {
    const exercise = lib.get(entry.exerciseId);
    if (!exercise) return;
    list.append(exerciseCard({ workout, entry, index, exercise, lib, prefs, training, phase, finished, save, updateProgress, rerender }));
  });

  $('[data-action="finish"]').addEventListener('click', async () => {
    if (!workout.sets.length) {
      const ok = await confirmDialog({ title: 'Noch keine Sätze', text: 'Du hast noch keinen Satz abgehakt. Einheit trotzdem beenden?', confirmLabel: 'Beenden' });
      if (!ok) return;
    }
    const result = await finishDialog();
    if (!result) return;
    await finishWorkout(workout, result);
    toast('Einheit gespeichert');
    location.hash = '#/training';
  });

  $('[data-action="discard"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Einheit verwerfen?', text: 'Alle Sätze dieser Einheit werden gelöscht.', confirmLabel: 'Verwerfen', danger: true });
    if (!ok) return;
    await db.remove('workouts', workout.id);
    toast('Einheit verworfen');
    location.hash = '#/training';
  });
}

function exerciseCard(ctx) {
  const { workout, entry, exercise, lib, prefs, training, phase, finished, save, updateProgress, rerender } = ctx;
  const card = el('article', 'card exercise-card');

  const image = el('img', 'exercise-image');
  image.src = `assets/exercises/${exercise.svg}`;
  image.alt = `${exercise.name}, Start- und Endposition`;
  image.width = 200;
  image.height = 135;

  const head = el('div', 'exercise-head');
  head.append(el('h2', null, exercise.name), el('p', 'secondary', `${entry.sets} Sätze, ${repLabel(exercise, entry.repRange)}${entry.restSeconds ? `, Pause ${entry.restSeconds} s` : ''}`));

  // Progressionsvorschlag aus der letzten Einheit
  const suggestion = suggestProgression(entry, lastSetsFor(exercise.id, finished));
  const hint = el('p', 'progression', suggestion.text);

  // Aktionen
  const actions = el('div', 'exercise-actions');
  const video = el('a', 'button button--small');
  video.href = YOUTUBE_SEARCH + encodeURIComponent(exercise.youtubeSearch);
  video.target = '_blank';
  video.rel = 'noopener noreferrer';
  video.append(icon(ICON_PLAY), el('span', null, 'Video'));
  const alternative = button('', 'button button--small');
  alternative.append(icon(ICON_SWAP), el('span', null, 'Alternative'));
  const dislike = button('', 'button button--small');
  dislike.append(icon(ICON_NO), el('span', null, 'Mag ich nicht'));
  actions.append(video, alternative, dislike);

  // Erlaubte Alternativen, ohne Belastungs-Tags und aus der aktuellen Phase zuerst
  const allowedAlternatives = () => exercise.alternatives
    .map((id) => lib.get(id))
    .filter((alt) => alt && isAllowed(alt, training.avoidTags ?? [], prefs) && !workout.entries.some((other) => other.exerciseId === alt.id))
    .sort((a, b) => (a.tags.length > 0) - (b.tags.length > 0) || (a.phase > phase) - (b.phase > phase));

  const swap = async (altId) => {
    const alt = lib.get(altId);
    Object.assign(entry, { exerciseId: alt.id, originalId: entry.originalId ?? exercise.id, ...prescription(alt, Math.min(2, Number(training.level) || 1), phase) });
    await save();
    rerender();
  };

  alternative.addEventListener('click', async () => {
    const choice = await chooseAlternative(exercise, allowedAlternatives());
    if (!choice) return;
    if (choice.permanent) await savePref(entry.originalId ?? exercise.id, { replacedBy: choice.id });
    toast(choice.permanent ? 'Dauerhaft getauscht' : 'Für heute getauscht');
    swap(choice.id);
  });

  dislike.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: `${exercise.name} nicht mehr vorschlagen?`, text: 'Die Übung wird künftig automatisch ersetzt. Das kannst du später wieder ändern.', confirmLabel: 'Nicht mehr vorschlagen' });
    if (!ok) return;
    await savePref(exercise.id, { disliked: true });
    prefs[exercise.id] = { ...(prefs[exercise.id] ?? {}), disliked: true };
    const [first] = allowedAlternatives();
    if (first) {
      toast(`Ersetzt durch ${first.name}`);
      swap(first.id);
    } else {
      toast('Gemerkt. Für heute gibt es keine passende Alternative.');
    }
  });

  // Einstellen, Cues, Fehler
  const setup = el('details', 'details');
  setup.append(el('summary', null, 'Einstellen'));
  const setupList = el('ul', 'hint-list');
  exercise.setupHints.forEach((text) => setupList.append(el('li', null, text)));
  setup.append(setupList);

  const cues = el('ul', 'cue-list');
  exercise.cues.forEach((text) => cues.append(el('li', null, text)));

  const mistakes = el('details', 'details');
  mistakes.append(el('summary', null, 'Häufige Fehler'));
  const mistakeList = el('ul', 'hint-list');
  exercise.commonMistakes.forEach((text) => mistakeList.append(el('li', null, text)));
  mistakes.append(mistakeList);

  // Sätze
  const sets = el('div', 'set-list');
  const prefill = () => {
    const done = workout.sets.filter((set) => set.exerciseId === exercise.id).sort((a, b) => a.setNo - b.setNo).at(-1);
    if (done) return { weight: done.weight, reps: done.reps };
    const pref = prefs[exercise.id];
    return {
      weight: suggestion.weight ?? pref?.lastWeight ?? 0,
      reps: suggestion.reps ?? pref?.lastReps ?? entry.repRange[0],
    };
  };
  const renderSets = () => {
    sets.replaceChildren();
    for (let setNo = 1; setNo <= entry.sets; setNo++) sets.append(setRow(setNo));
  };

  const setRow = (setNo) => {
    const existing = workout.sets.find((set) => set.exerciseId === exercise.id && set.setNo === setNo);
    const state = existing ? { ...existing } : { ...prefill(), rpe: null };
    const row = el('div', `set-row${existing ? ' set-row--done' : ''}`);

    const top = el('div', 'set-top');
    top.append(el('span', 'label', `Satz ${setNo}`));
    const rpe = el('select', 'rpe');
    rpe.setAttribute('aria-label', `RPE Satz ${setNo}`);
    rpe.append(new Option('RPE', ''));
    for (let value = 6; value <= 10; value++) rpe.append(new Option(`RPE ${value}`, String(value)));
    rpe.value = state.rpe ? String(state.rpe) : '';
    const check = button('', 'set-check');
    check.setAttribute('aria-label', `Satz ${setNo} erledigt`);
    check.setAttribute('aria-pressed', existing ? 'true' : 'false');
    check.append(icon(ICON_CHECK));
    top.append(rpe, check);

    const persist = () => {
      const record = workout.sets.find((set) => set.exerciseId === exercise.id && set.setNo === setNo);
      if (record) {
        Object.assign(record, { weight: state.weight, reps: state.reps, rpe: state.rpe });
        save();
      }
    };

    const steppers = el('div', 'set-steppers');
    if (isWeighted(exercise)) {
      steppers.append(stepper({ value: state.weight, step: WEIGHT_STEP, unit: 'kg', label: 'Gewicht', onChange: (value) => { state.weight = value; persist(); } }));
    }
    const seconds = exercise.unit === 'seconds';
    steppers.append(stepper({ value: state.reps, step: seconds ? 5 : 1, min: seconds ? 5 : 1, unit: seconds ? 's' : 'Wdh.', label: seconds ? 'Sekunden' : 'Wiederholungen', format: (v) => String(v), onChange: (value) => { state.reps = value; persist(); } }));

    rpe.addEventListener('change', () => { state.rpe = rpe.value ? Number(rpe.value) : null; persist(); });

    check.addEventListener('click', async () => {
      const index = workout.sets.findIndex((set) => set.exerciseId === exercise.id && set.setNo === setNo);
      if (index >= 0) {
        workout.sets.splice(index, 1);
        row.classList.remove('set-row--done');
        check.setAttribute('aria-pressed', 'false');
      } else {
        workout.sets.push({ exerciseId: exercise.id, setNo, weight: isWeighted(exercise) ? state.weight : 0, reps: state.reps, rpe: state.rpe, note: '', at: new Date().toISOString() });
        row.classList.add('set-row--done');
        check.setAttribute('aria-pressed', 'true');
        startRest(entry.restSeconds);
      }
      await save();
      updateProgress();
      // Offene Sätze übernehmen den zuletzt geloggten Wert
      renderSets();
    });

    row.append(top, steppers);
    return row;
  };
  renderSets();

  const addSet = button('Satz hinzufügen', 'button button--small add-set');
  addSet.addEventListener('click', async () => {
    entry.sets += 1;
    await save();
    sets.append(setRow(entry.sets));
    updateProgress();
  });

  card.append(image, head, hint, actions, cues, setup, mistakes, sets, addSet);
  return card;
}

async function finishWorkout(workout, { feel, note }) {
  workout.finishedAt = new Date().toISOString();
  workout.overallFeel = feel;
  workout.note = note;
  await db.put('workouts', workout);

  // Letzte Werte je Übung merken, sie belegen beim nächsten Mal die Stepper vor
  const lastByExercise = new Map();
  for (const set of [...workout.sets].sort((a, b) => a.setNo - b.setNo)) lastByExercise.set(set.exerciseId, set);
  for (const [exerciseId, set] of lastByExercise) await savePref(exerciseId, { lastWeight: set.weight, lastReps: set.reps });

  // Check-in des Tages: trainedToday setzen
  const [checkin] = await db.getByDate('checkins', workout.date);
  await db.put('checkins', checkin
    ? { ...checkin, trainedToday: true }
    : { id: db.newId(), date: workout.date, cycleDay: null, energy: null, digestion: null, pain: null, painLeftSide: false, sleep: null, trainedToday: true, note: '' });

  releaseScreen();
  stopRest();
}

/* Fortschritt */

const PROGRESS = `
  <section class="stack progress">
    <label class="field">
      <span class="label">Übung</span>
      <select class="input" data-exercise></select>
    </label>
    <div class="segmented" role="radiogroup" aria-label="Zeitraum" data-range></div>
    <div class="card chart-card">
      <p class="label" data-first-label></p>
      <div class="day-line"><span class="number" data-first-value></span><span class="month" data-first-unit></span></div>
      <p class="secondary" data-first-delta></p>
      <div data-first-chart></div>
      <div class="chart-axis"><span data-axis-start></span><span data-axis-end></span></div>
    </div>
    <div class="card chart-card">
      <p class="label" data-second-label></p>
      <div class="day-line"><span class="card-number" data-second-value></span><span class="month" data-second-unit></span></div>
      <div data-second-chart></div>
    </div>
    <p class="secondary" data-empty hidden>Für diesen Zeitraum gibt es noch keine Sätze.</p>
    <a class="button" href="#/training">Zurück zur Übersicht</a>
  </section>
`;

// Linie ohne Gitter, Endpunkt markiert
function lineChart(points, label) {
  const width = 300;
  const height = 120;
  const pad = 8;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (t) => (maxX === minX ? width / 2 : pad + ((t - minX) / (maxX - minX)) * (width - 2 * pad));
  const sy = (v) => (maxY === minY ? height / 2 : height - pad - ((v - minY) / (maxY - minY)) * (height - 2 * pad));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.t).toFixed(1)} ${sy(p.v).toFixed(1)}`).join('');
  const last = points.at(-1);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.innerHTML = `<path class="chart-line" d="${d}"/><circle class="chart-dot" cx="${sx(last.t).toFixed(1)}" cy="${sy(last.v).toFixed(1)}" r="4"/>`;
  return svg;
}

async function renderProgress(root, lib) {
  root.innerHTML = PROGRESS;
  const $ = (selector) => root.querySelector(selector);
  const finished = finishedOf(await loadWorkouts());

  // Nur Übungen mit Einträgen anbieten, zuletzt trainierte zuerst
  const seen = [];
  for (const workout of [...finished].reverse()) {
    for (const set of workout.sets) if (!seen.includes(set.exerciseId) && lib.has(set.exerciseId)) seen.push(set.exerciseId);
  }
  const select = $('[data-exercise]');
  if (!seen.length) {
    root.querySelectorAll('.chart-card, .segmented, .field').forEach((node) => { node.hidden = true; });
    $('[data-empty]').hidden = false;
    $('[data-empty]').textContent = 'Noch keine Einheit abgeschlossen. Nach deinem ersten Training siehst du hier deinen Verlauf.';
    return;
  }
  seen.forEach((id) => select.append(new Option(lib.get(id).name, id)));

  let weeks = 12;
  const range = $('[data-range]');
  for (const value of [4, 12, 26]) {
    const option = el('label', 'segment');
    const input = el('input');
    input.type = 'radio';
    input.name = 'range';
    input.value = String(value);
    input.checked = value === weeks;
    input.addEventListener('change', () => { weeks = value; update(); });
    option.append(input, el('span', null, `${value} Wochen`));
    range.append(option);
  }

  const update = () => {
    const exercise = lib.get(select.value);
    const from = daysAgo(weeks * 7);
    const seconds = exercise.unit === 'seconds';
    const series = finished
      .filter((workout) => workout.date >= from)
      .map((workout) => {
        const sets = workout.sets.filter((set) => set.exerciseId === exercise.id);
        if (!sets.length) return null;
        const t = isoToUTC(workout.date).getTime();
        if (seconds) return { t, date: workout.date, first: Math.max(...sets.map((s) => s.reps)), second: sets.reduce((sum, s) => sum + s.reps, 0) };
        const weighted = isWeighted(exercise);
        return {
          t,
          date: workout.date,
          first: weighted ? Math.max(...sets.map((s) => estimate1RM(s.weight, s.reps))) : Math.max(...sets.map((s) => s.reps)),
          second: sets.reduce((sum, s) => sum + (weighted ? s.weight * s.reps : s.reps), 0),
        };
      })
      .filter(Boolean);

    const weighted = !seconds && isWeighted(exercise);
    $('[data-first-label]').textContent = seconds ? 'Längster Satz' : weighted ? 'Geschätztes Maximum (1RM, Epley)' : 'Beste Wiederholungszahl';
    $('[data-second-label]').textContent = seconds ? 'Gesamtzeit pro Einheit' : 'Volumen pro Einheit';
    const unitFirst = seconds ? 's' : weighted ? 'kg' : 'Wdh.';
    const unitSecond = seconds ? 's' : weighted ? 'kg' : 'Wdh.';

    const empty = !series.length;
    $('[data-empty]').hidden = !empty;
    root.querySelectorAll('.chart-card').forEach((node) => { node.hidden = empty; });
    if (empty) return;

    const first = series.map((p) => ({ t: p.t, v: p.first }));
    const second = series.map((p) => ({ t: p.t, v: p.second }));
    const latest = series.at(-1);
    $('[data-first-value]').textContent = formatNumber(latest.first, 1);
    $('[data-first-unit]').textContent = unitFirst;
    const delta = latest.first - series[0].first;
    $('[data-first-delta]').textContent = series.length > 1
      ? `${delta >= 0 ? 'Plus' : 'Minus'} ${formatNumber(Math.abs(delta), 1)} ${unitFirst} in ${weeks} Wochen`
      : 'Ein Eintrag im Zeitraum';
    $('[data-first-chart]').replaceChildren(lineChart(first, $('[data-first-label]').textContent));
    $('[data-second-value]').textContent = formatNumber(latest.second, 0);
    $('[data-second-unit]').textContent = unitSecond;
    $('[data-second-chart]').replaceChildren(lineChart(second, $('[data-second-label]').textContent));
    $('[data-axis-start]').textContent = formatDate(series[0].date);
    $('[data-axis-end]').textContent = formatDate(latest.date);
  };
  select.addEventListener('change', update);
  update();
}

/* Einstieg aus dem Router */

export async function render(root) {
  const sub = location.hash.replace(/^#\/?/, '').split('/')[1] ?? '';
  const lib = await loadLibrary();
  if (sub === 'einheit') return renderSession(root, lib);
  releaseScreen();
  stopRest();
  if (sub === 'fortschritt') return renderProgress(root, lib);
  return renderOverview(root, lib);
}
