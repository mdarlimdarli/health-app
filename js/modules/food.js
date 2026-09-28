/*
  Essen: Wochenplan (#/essen) und Ampelliste der Lebensmittel (#/essen/lebensmittel).
  Inhalte kommen aus data/meals.json. Ampel, Ausschlüsse und bevorzugte Küchen
  richten sich nach profile.diet, berechnet in js/food-rules.js.
*/

import { INTOLERANCE_LABELS, MEAL_SLOTS, RATING_LABELS, foodRating, mealRating, candidates, resolveMeal, excludedBy } from '../food-rules.js';
import { loadMeals, diet, weekdayOf, getSwaps, setSwap, getFeedback, saveFeedback } from '../food-data.js';
import { todayISO, toast, el } from '../ui.js';

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TOLERATED = [['gut', 'gut'], ['mittel', 'mittel'], ['schlecht', 'schlecht']];

/* Hilfen */

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function svgIcon(paths, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  svg.innerHTML = paths;
  return svg;
}

const ICON_THUMB = '<path d="M7 11v9H4v-9zM7 11l4-7c1.2 0 2 .9 2 2v3h5.3a2 2 0 0 1 2 2.3l-1.1 6.5a2 2 0 0 1-2 1.7H7"/>';

function ratingDot(level) {
  const dot = el('span', `rating-dot rating-dot--${level}`);
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function ratingBadge(level, text = RATING_LABELS[level]) {
  const badge = el('span', 'rating');
  badge.append(ratingDot(level), el('span', null, text));
  return badge;
}

function subnav(active) {
  const nav = el('nav', 'segmented segmented--links');
  nav.setAttribute('aria-label', 'Essen');
  for (const [id, label, href] of [['woche', 'Woche', '#/essen'], ['lebensmittel', 'Lebensmittel', '#/essen/lebensmittel']]) {
    const link = el('a', 'segment', label);
    link.href = href;
    if (id === active) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  return nav;
}

// Kurzes Markdown sicher als DOM: Absätze, Listen, fett. Nie innerHTML.
function renderMarkdown(text) {
  const wrap = el('div', 'recipe-text');
  let list = null;
  const inline = (node, line) => {
    line.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) node.append(el('strong', null, part.slice(2, -2)));
      else if (part) node.append(document.createTextNode(part));
    });
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(tag);
        wrap.append(list);
      }
      const item = el('li');
      inline(item, (bullet ?? numbered)[1]);
      list.append(item);
    } else if (line) {
      list = null;
      const p = el('p');
      inline(p, line);
      wrap.append(p);
    } else {
      list = null;
    }
  }
  return wrap;
}

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

/* Woche */

function weekStart(iso) {
  return addDays(iso, 1 - weekdayOf(iso));
}

async function renderWeek(root, date) {
  const data = await loadMeals();
  const today = todayISO();
  root.replaceChildren(subnav('woche'));

  const head = el('div', 'food-head');
  const version = el('p', 'hint');
  const refresh = el('button', 'button button--small', 'Essensplan aktualisieren');
  refresh.type = 'button';
  version.textContent = data ? `Version ${data.version}${data.updatedAt ? ` vom ${data.updatedAt.split('-').reverse().join('.')}` : ''}` : 'Noch kein Essensplan geladen';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    const before = data?.version;
    const next = await loadMeals({ fresh: true });
    refresh.disabled = false;
    if (!next) return toast('Essensplan nicht erreichbar. Bist du online?', { error: true });
    toast(next.version !== before ? `Neue Version ${next.version} geladen` : `Version ${next.version} ist aktuell`);
    renderWeek(root, date);
  });
  head.append(version, refresh);
  root.append(head);

  if (!data?.meals.length) {
    root.append(el('p', 'secondary', 'Noch kein Essensplan. Die Inhalte kommen später über data/meals.json.'));
    return;
  }

  // Tagesleiste der aktuellen Woche
  const start = weekStart(date);
  const bar = el('div', 'week-bar');
  bar.setAttribute('role', 'tablist');
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const link = el('a', `week-day${day === date ? ' week-day--active' : ''}${day === today ? ' week-day--today' : ''}`);
    link.href = `#/essen/${day}`;
    link.setAttribute('role', 'tab');
    link.setAttribute('aria-selected', String(day === date));
    link.setAttribute('aria-label', formatDay(day));
    link.append(el('span', 'label', WEEKDAY_SHORT[i]), el('span', 'week-circle', String(Number(day.slice(8)))));
    bar.append(link);
  }
  root.append(bar, el('h2', null, formatDay(date)));

  const swaps = await getSwaps();
  const profileDiet = diet();
  const foodsById = new Map(data.foods.map((food) => [food.id, food]));
  for (const slot of MEAL_SLOTS) {
    const resolved = resolveMeal(data, weekdayOf(date), slot.id, profileDiet, swaps[`${date}|${slot.id}`]);
    const section = el('section', 'slot');
    section.append(el('h2', 'slot-title', slot.label));
    section.append(await mealCard({ data, date, slot, resolved, profileDiet, foodsById, rerender: () => renderWeek(root, date) }));
    root.append(section);
  }
}

async function mealCard({ data, date, slot, resolved, profileDiet, foodsById, rerender }) {
  const card = el('article', 'card meal-card');
  const { meal } = resolved;
  if (!meal) {
    card.append(el('p', null, 'Kein passendes Gericht.'));
    if (resolved.replaced) card.append(el('p', 'secondary', `${resolved.replaced.name} ist ausgeschlossen (${excludedBy(resolved.replaced, profileDiet.dislikes).join(', ')}), und es gibt keine Alternative für diesen Slot.`));
    return card;
  }

  const rating = mealRating(meal, foodsById, profileDiet.intolerances);
  const head = el('div', 'meal-head');
  head.append(el('h2', null, meal.name), el('p', 'secondary', [capitalize(meal.cuisine), meal.prepMinutes ? `${meal.prepMinutes} Minuten` : ''].filter(Boolean).join(', ')));
  const badges = el('div', 'meal-badges');
  badges.append(ratingBadge(rating.level));
  if (meal.histamineTest) badges.append(el('span', 'test-tag', 'Histamin-Test'));
  card.append(head, badges);
  if (rating.flagged.length) {
    card.append(el('p', 'hint', rating.flagged.map((item) => `${item.food.name}: ${item.rating.reasons.join(', ')}`).join('. ')));
  }
  if (resolved.source === 'ersatz') card.append(el('p', 'hint', `Statt ${resolved.replaced.name}, das ist ausgeschlossen (${excludedBy(resolved.replaced, profileDiet.dislikes).join(', ')}).`));
  if (resolved.source === 'tausch') card.append(el('p', 'hint', 'Von dir getauscht.'));

  // Rezeptkarte: Zutaten mit Ampel, Rezept, Swaps
  const recipe = el('details', 'details');
  recipe.append(el('summary', null, 'Rezept'));
  const ingredients = el('ul', 'ingredient-list');
  for (const id of meal.ingredients ?? []) {
    const food = foodsById.get(id);
    const item = el('li');
    const level = food ? foodRating(food, profileDiet.intolerances).level : 'neutral';
    item.append(ratingDot(level), el('span', null, food?.name ?? id));
    ingredients.append(item);
  }
  recipe.append(ingredients, renderMarkdown(meal.recipe));
  if (meal.swaps?.length) {
    const swaps = el('div', 'swap-list');
    swaps.append(el('p', 'label', 'Austausch'));
    for (const swap of meal.swaps) {
      const row = el('p');
      row.append(el('strong', null, `Statt ${foodsById.get(swap.ingredient)?.name ?? swap.ingredient}: `), document.createTextNode(`${swap.alternative}. ${swap.why ?? ''}`));
      swaps.append(row);
    }
    recipe.append(swaps);
  }
  card.append(recipe);

  // Tauschen und Feedback
  const actions = el('div', 'button-row');
  const swapButton = el('button', 'button', 'Tauschen');
  swapButton.type = 'button';
  swapButton.addEventListener('click', async () => {
    const options = candidates(data, slot.id, profileDiet, meal.id);
    const choice = await openSheet((dialog, done) => {
      dialog.append(el('h2', null, `${slot.label} tauschen`), el('p', 'secondary', 'Bevorzugte Küchen aus deinem Profil stehen oben.'));
      if (!options.length) dialog.append(el('p', null, 'Für diesen Slot gibt es kein weiteres passendes Gericht.'));
      for (const option of options) {
        const row = el('button', 'alt-option');
        row.type = 'button';
        const text = el('span', 'med-body');
        text.append(el('span', 'med-name', option.meal.name), el('span', 'secondary', capitalize(option.meal.cuisine)));
        row.append(ratingDot(option.rating.level), text);
        row.addEventListener('click', () => done(option.meal.id));
        dialog.append(row);
      }
      const cancel = el('button', 'button', 'Abbrechen');
      cancel.type = 'button';
      cancel.addEventListener('click', () => done(null));
      dialog.append(cancel);
    });
    if (!choice) return;
    await setSwap(date, slot.id, choice);
    toast('Getauscht');
    rerender();
  });

  const feedback = await getFeedback(date, slot.id, meal.id);
  const feedbackButton = el('button', 'button', feedback ? 'Feedback ändern' : 'Feedback');
  feedbackButton.type = 'button';
  feedbackButton.disabled = date > todayISO();
  feedbackButton.addEventListener('click', async () => {
    const result = await feedbackSheet(meal, feedback);
    if (!result) return;
    await saveFeedback(date, slot.id, meal.id, result);
    toast('Feedback gespeichert');
    rerender();
  });
  actions.append(swapButton, feedbackButton);
  card.append(actions);

  if (feedback) {
    const parts = [feedback.tolerated ? `Vertragen: ${feedback.tolerated}` : '', feedback.liked === true ? 'schmeckt' : feedback.liked === false ? 'schmeckt nicht' : '', feedback.note].filter(Boolean);
    card.append(el('p', 'hint', parts.join(', ')));
  }
  return card;
}

function feedbackSheet(meal, current) {
  return openSheet((dialog, done) => {
    const state = { tolerated: current?.tolerated ?? null, liked: current?.liked ?? null };
    dialog.append(el('h2', null, meal.name), el('span', 'label', 'Wie hast du es vertragen?'));

    const tolerated = el('div', 'segmented');
    tolerated.setAttribute('role', 'radiogroup');
    for (const [value, label] of TOLERATED) {
      const option = el('label', 'segment');
      const input = el('input');
      input.type = 'radio';
      input.name = 'tolerated';
      input.checked = state.tolerated === value;
      input.addEventListener('change', () => { state.tolerated = value; });
      option.append(input, el('span', null, label));
      tolerated.append(option);
    }

    const taste = el('div', 'thumbs');
    const thumb = (value, label) => {
      const button = el('button', 'thumb');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(state.liked === value));
      button.append(svgIcon(ICON_THUMB, value ? '' : 'thumb-down'), el('span', null, label));
      button.addEventListener('click', () => {
        state.liked = state.liked === value ? null : value;
        taste.querySelectorAll('.thumb').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        if (state.liked === value) button.setAttribute('aria-pressed', 'true');
      });
      return button;
    };
    taste.append(thumb(true, 'Schmeckt mir'), thumb(false, 'Schmeckt mir nicht'));

    const note = el('textarea', 'input textarea');
    note.rows = 2;
    note.placeholder = 'Notiz, optional';
    note.value = current?.note ?? '';

    const actions = el('div', 'button-row');
    const cancel = el('button', 'button', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => done(null));
    const save = el('button', 'button button--primary', 'Speichern');
    save.type = 'button';
    save.addEventListener('click', () => done({ ...state, note: note.value.trim() }));
    actions.append(cancel, save);
    dialog.append(tolerated, el('span', 'label', 'Geschmack'), taste, note, actions);
  });
}

/* Ampelliste */

async function renderFoods(root) {
  const data = await loadMeals();
  const profileDiet = diet();
  root.replaceChildren(subnav('lebensmittel'));
  if (!data?.foods.length) {
    root.append(el('p', 'secondary', 'Noch keine Lebensmittel. Die Inhalte kommen später über data/meals.json.'));
    return;
  }

  const search = el('input', 'input');
  search.type = 'search';
  search.placeholder = 'Lebensmittel suchen';
  search.setAttribute('aria-label', 'Lebensmittel suchen');
  root.append(search);

  // Filter: nur die Unverträglichkeiten aus dem Profil
  const active = new Set(profileDiet.intolerances);
  const filters = el('div', 'chips');
  if (!profileDiet.intolerances.length) {
    root.append(el('p', 'hint', 'Im Profil sind keine Unverträglichkeiten eingetragen, die Ampel bleibt neutral.'));
  }
  for (const key of profileDiet.intolerances) {
    const chip = el('label', 'chip chip--salbei');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) active.add(key);
      else active.delete(key);
      update();
    });
    chip.append(input, el('span', null, INTOLERANCE_LABELS[key] ?? key));
    filters.append(chip);
  }
  const onlyGood = el('label', 'switch-row');
  const onlyGoodInput = el('input', 'switch');
  onlyGoodInput.type = 'checkbox';
  onlyGoodInput.addEventListener('change', () => update());
  onlyGood.append(el('span', null, 'Nur gut verträgliche'), onlyGoodInput);
  if (profileDiet.intolerances.length) root.append(filters, onlyGood);

  const list = el('div', 'card food-list');
  const count = el('p', 'hint');
  root.append(count, list);

  const update = () => {
    const query = search.value.trim().toLowerCase();
    const rows = data.foods
      .map((food) => ({ food, rating: foodRating(food, [...active]) }))
      .filter(({ food }) => !query || food.name.toLowerCase().includes(query) || (food.category ?? '').toLowerCase().includes(query))
      .filter(({ rating }) => !onlyGoodInput.checked || rating.level === 'gruen')
      .sort((a, b) => a.food.name.localeCompare(b.food.name, 'de'));
    list.replaceChildren();
    for (const { food, rating } of rows) {
      const row = el('div', 'food-row');
      const text = el('div', 'med-body');
      text.append(el('span', 'med-name', food.name), el('span', 'secondary', [food.category, rating.reasons.join(', '), food.note].filter(Boolean).join('. ')));
      row.append(ratingDot(rating.level), text, el('span', 'hint rating-text', RATING_LABELS[rating.level]));
      list.append(row);
    }
    if (!rows.length) list.append(el('p', 'secondary', 'Nichts gefunden.'));
    count.textContent = `${rows.length} von ${data.foods.length} Lebensmitteln`;
  };
  search.addEventListener('input', update);
  update();
}

/* Einstieg aus dem Router */

export async function render(root) {
  const [, sub = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const view = el('section', 'stack food');
  root.replaceChildren(view);
  if (sub === 'lebensmittel') return renderFoods(view);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : todayISO();
  return renderWeek(view, date);
}
