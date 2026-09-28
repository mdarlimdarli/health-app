/*
  Profil-Formular: Onboarding beim ersten Start (#/willkommen) und
  "Profil bearbeiten" in den Einstellungen (#/profil). Gleiche Felder.
  Die Auswahllisten sind neutrales Vokabular, welche Werte gelten, steht nur im Profil.
  Werte aus einem importierten Profil, die hier nicht vorkommen, bleiben als zusätzliche Option erhalten.
*/

import { getProfile, saveProfile, parseProfileFile, importProfile } from '../profile.js';
import { toast, el } from '../ui.js';

// Schonungs-Tags: Übungen mit diesen Tags schlägt die App nie vor
const AVOID_OPTIONS = [
  ['bauchdruck', 'Bauchraum schonen'],
  ['last-hinter-kopf', 'Nichts hinter dem Kopf'],
  ['schweres-kreuzheben', 'Kein schweres Kreuzheben'],
  ['crunches', 'Keine Crunches'],
  ['nackendruecken', 'Kein Nackendrücken'],
];

const INTOLERANCE_OPTIONS = [
  ['fructose', 'Fruktose'],
  ['lactose', 'Laktose'],
  ['histamine', 'Histamin'],
  ['gluten', 'Gluten'],
  ['sorbit', 'Sorbit'],
];

const CUISINE_OPTIONS = [
  ['indisch', 'Indisch'],
  ['japanisch', 'Japanisch'],
  ['thai', 'Thailändisch'],
  ['koreanisch', 'Koreanisch'],
  ['vietnamesisch', 'Vietnamesisch'],
  ['italienisch', 'Italienisch'],
  ['mediterran', 'Mediterran'],
  ['levantinisch', 'Levantinisch'],
  ['mexikanisch', 'Mexikanisch'],
  ['deutsch', 'Deutsch'],
];

const LEVEL_NAMES = ['Einstieg', 'Etwas Erfahrung', 'Erfahren'];

// Freitext zu Tag: "Grüne Oliven" wird "gruene-oliven"
function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function tagLabel(tag) {
  const text = tag.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Optionsliste plus unbekannte Werte aus dem Profil
function withExtras(options, selected) {
  const known = new Set(options.map(([value]) => value));
  return [...options, ...selected.filter((value) => !known.has(value)).map((value) => [value, tagLabel(value)])];
}

function choiceGroup(container, name, options, selected, className) {
  for (const [value, label] of withExtras(options, selected)) {
    const wrapper = el('label', className);
    const input = el('input');
    input.type = 'checkbox';
    input.name = name;
    input.value = value;
    input.checked = selected.includes(value);
    wrapper.append(input, el('span', null, label));
    container.append(wrapper);
  }
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

const TEMPLATE = `
  <form class="stack profile-form" novalidate>
    <div class="intro" data-onboarding hidden>
      <p class="label">Willkommen</p>
      <h2>Richte deine App ein</h2>
      <p class="secondary">Deine Angaben bleiben auf diesem Gerät und in deiner verschlüsselten Sicherung. Medikamente legst du später im Tab Medis an.</p>
    </div>

    <section class="stack-tight">
      <h2>Über dich</h2>
      <label class="field">
        <span class="label">Name</span>
        <input class="input" name="displayName" type="text" autocomplete="given-name" required>
      </label>
      <label class="field">
        <span class="label">Geburtsjahr, optional</span>
        <input class="input" name="birthYear" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="bday-year">
      </label>
      <label class="switch-row">
        <span>Zyklus mitverfolgen</span>
        <input class="switch" name="cycleTracking" type="checkbox">
      </label>
    </section>

    <section class="stack-tight">
      <h2>Training</h2>
      <div class="range-block card">
        <div class="blob blob--mandarine" data-blob="daysPerWeek"></div>
        <span class="label">Tage pro Woche</span>
        <output class="number" data-output="daysPerWeek"></output>
        <input class="range" name="daysPerWeek" type="range" min="1" max="6" step="1" aria-label="Trainingstage pro Woche">
      </div>
      <div class="range-block card">
        <div class="blob blob--mandarine" data-blob="level"></div>
        <span class="label">Level</span>
        <output class="number" data-output="level"></output>
        <p class="secondary" data-level-name></p>
        <input class="range" name="level" type="range" min="1" max="3" step="1" aria-label="Trainingslevel">
      </div>
      <fieldset class="fieldset">
        <legend class="label">Schonen</legend>
        <div class="check-list" data-group="avoidTags"></div>
      </fieldset>
    </section>

    <section class="stack-tight">
      <h2>Ernährung</h2>
      <fieldset class="fieldset">
        <legend class="label">Unverträglichkeiten</legend>
        <div class="chips" data-group="intolerances"></div>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="label">Lieblingsküchen</legend>
        <div class="chips" data-group="cuisines"></div>
      </fieldset>
      <label class="field">
        <span class="label">Abneigungen</span>
        <input class="input" name="dislikes" type="text" autocapitalize="off">
      </label>
      <p class="hint">Mehrere mit Komma trennen, zum Beispiel Pilze, Oliven.</p>
    </section>

    <div class="stack-tight">
      <button class="button button--primary" type="submit" data-submit>Speichern</button>
      <div class="stack-tight" data-onboarding hidden>
        <p class="hint">Du hast schon ein vorbereitetes Profil oder eine Sicherung?</p>
        <div class="button-row">
          <button class="button" type="button" data-action="import">Profil importieren</button>
          <a class="button" href="#/einstellungen">Sicherung laden</a>
        </div>
        <input type="file" accept="application/json,.json" data-import-input hidden>
      </div>
    </div>
  </form>
`;

export async function render(root, { route } = {}) {
  const onboarding = route === 'willkommen';
  const profile = getProfile();
  root.innerHTML = TEMPLATE;
  const form = root.querySelector('form');
  const $ = (selector) => root.querySelector(selector);

  root.querySelectorAll('[data-onboarding]').forEach((node) => { node.hidden = !onboarding; });
  $('[data-submit]').textContent = onboarding ? "Los geht's" : 'Speichern';

  // Werte eintragen, immer als Eigenschaft, nie als HTML
  form.displayName.value = profile.displayName;
  form.birthYear.value = profile.birthYear ?? '';
  form.cycleTracking.checked = profile.cycleTracking;
  form.daysPerWeek.value = String(profile.training.daysPerWeek);
  form.level.value = String(profile.training.level);
  form.dislikes.value = profile.diet.dislikes.map(tagLabel).join(', ');
  choiceGroup($('[data-group="avoidTags"]'), 'avoidTags', AVOID_OPTIONS, profile.training.avoidTags, 'check-row');
  choiceGroup($('[data-group="intolerances"]'), 'intolerances', INTOLERANCE_OPTIONS, profile.diet.intolerances, 'chip chip--salbei');
  choiceGroup($('[data-group="cuisines"]'), 'cuisines', CUISINE_OPTIONS, profile.diet.cuisines, 'chip chip--salbei');

  // Regler: Zahl groß, Wert zusätzlich als Farbfläche
  const updateRange = (name) => {
    const input = form[name];
    const value = Number(input.value);
    $(`[data-output="${name}"]`).textContent = String(value);
    const intensity = (value - Number(input.min)) / (Number(input.max) - Number(input.min));
    $(`[data-blob="${name}"]`).style.setProperty('--intensity', intensity.toFixed(2));
    if (name === 'level') $('[data-level-name]').textContent = LEVEL_NAMES[value - 1] ?? '';
  };
  ['daysPerWeek', 'level'].forEach((name) => {
    updateRange(name);
    form[name].addEventListener('input', () => updateRange(name));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = form.displayName.value.trim();
    if (!displayName) {
      toast('Bitte trag einen Namen ein.', { error: true });
      form.displayName.focus();
      return;
    }
    const yearText = form.birthYear.value.trim();
    const birthYear = yearText ? Number(yearText) : null;
    const currentYear = new Date().getFullYear();
    if (yearText && (!/^\d{4}$/.test(yearText) || birthYear < 1900 || birthYear > currentYear)) {
      toast('Das Geburtsjahr sieht nicht richtig aus.', { error: true });
      form.birthYear.focus();
      return;
    }

    // Vom bestehenden Profil ausgehen, damit Felder außerhalb des Formulars erhalten bleiben
    const next = structuredClone(getProfile());
    next.displayName = displayName;
    next.birthYear = birthYear;
    next.cycleTracking = form.cycleTracking.checked;
    next.training.daysPerWeek = Number(form.daysPerWeek.value);
    next.training.level = Number(form.level.value);
    next.training.avoidTags = checkedValues(form, 'avoidTags');
    next.diet.intolerances = checkedValues(form, 'intolerances');
    next.diet.cuisines = checkedValues(form, 'cuisines');
    next.diet.dislikes = [...new Set(form.dislikes.value.split(',').map(slugify).filter(Boolean))];

    try {
      await saveProfile(next);
      toast(onboarding ? `Willkommen, ${displayName}` : 'Profil gespeichert');
      location.hash = onboarding ? '#/heute' : '#/einstellungen';
    } catch (error) {
      toast(error.message || 'Speichern fehlgeschlagen.', { error: true });
    }
  });

  // Onboarding: vorbereitetes Profil aus Datei übernehmen
  const importInput = $('[data-import-input]');
  $('[data-action="import"]').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const parsed = parseProfileFile(await file.text());
      const added = await importProfile(parsed);
      toast(added ? `Profil importiert, ${added} ${added === 1 ? 'Medikament' : 'Medikamente'} angelegt` : 'Profil importiert');
      location.hash = '#/heute';
    } catch (error) {
      toast(error.message || 'Import fehlgeschlagen.', { error: true });
    }
  });
}
