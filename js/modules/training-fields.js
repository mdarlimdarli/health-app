/*
  Gemeinsame Felder für die Trainingsanpassung: Regionen schonen (mit optionalem Enddatum),
  Bewegungen vermeiden, Aufbauen und optional die Vorgaben von Arzt, Physio oder Osteopath.
  Genutzt vom Onboarding, von "Profil bearbeiten" und von "Anpassen" im Trainings-Tab.
  Werte aus einem importierten Profil, die hier nicht vorkommen, bleiben als Option erhalten.
*/

import { REGIONS, MOVEMENTS, FOCUS, regionLabel, movementLabel, focusLabel } from '../training-options.js';
import { el } from '../ui.js';

// Optionsliste plus unbekannte Werte aus dem Profil
function withExtras(options, selected, label) {
  const known = new Set(options.map(([value]) => value));
  return [...options, ...selected.filter((value) => !known.has(value)).map((value) => [value, label(value), ''])];
}

function checkbox(name, value, checked) {
  const input = el('input');
  input.type = 'checkbox';
  input.name = name;
  input.value = value;
  input.checked = checked;
  return input;
}

function chipGroup(name, options, selected, tone) {
  const group = el('div', 'chips');
  for (const [value, label] of options) {
    const chip = el('label', `chip chip--${tone}`);
    chip.append(checkbox(name, value, selected.includes(value)), el('span', null, label));
    group.append(chip);
  }
  return group;
}

function fieldset(legend, hint, content) {
  const node = el('fieldset', 'fieldset');
  node.append(el('legend', 'label', legend));
  if (hint) node.append(el('p', 'hint', hint));
  node.append(content);
  return node;
}

export function trainingFields(training, { guidance = false, onChange = () => {} } = {}) {
  const node = el('div', 'stack-tight training-fields');
  const regions = training.protectRegions ?? [];
  const untilByRegion = new Map(regions.map((entry) => [entry.region, entry.until]));

  // a) Körperregionen schonen
  const regionChips = chipGroup('protectRegions', withExtras(REGIONS, regions.map((entry) => entry.region), regionLabel), regions.map((entry) => entry.region), 'koralle');
  const untilList = el('div', 'until-list');
  const renderUntil = () => {
    untilList.replaceChildren();
    for (const input of regionChips.querySelectorAll('input:checked')) {
      const row = el('label', 'until-row');
      const date = el('input', 'input input--date');
      date.type = 'date';
      date.name = `until-${input.value}`;
      date.dataset.region = input.value;
      date.value = untilByRegion.get(input.value) ?? '';
      date.setAttribute('aria-label', `${regionLabel(input.value)} schonen bis, optional`);
      date.addEventListener('change', () => {
        untilByRegion.set(input.value, date.value || null);
        onChange(value());
      });
      row.append(el('span', null, `${regionLabel(input.value)} bis`), date);
      untilList.append(row);
    }
    untilList.hidden = !untilList.children.length;
  };
  const regionBlock = el('div', 'stack-tight');
  regionBlock.append(regionChips, untilList);
  node.append(fieldset('Körperregionen schonen', 'Übungen, die diese Regionen belasten, fallen weg. Dazu kommt leichte Mobility. Mit Datum gilt die Schonung nur bis dahin.', regionBlock));

  // b) Bewegungen vermeiden
  const movementList = el('div', 'check-list');
  const avoided = training.avoidMovements ?? [];
  for (const [value, label, example] of withExtras(MOVEMENTS, avoided, movementLabel)) {
    const row = el('label', 'check-row');
    const text = el('span', 'check-label');
    text.append(el('span', null, label));
    if (example) text.append(el('span', 'secondary', example));
    row.append(checkbox('avoidMovements', value, avoided.includes(value)), text);
    movementList.append(row);
  }
  node.append(fieldset('Bewegungen vermeiden', null, movementList));

  // c) Aufbauen
  const focus = training.focus ?? [];
  node.append(fieldset('Aufbauen', 'Übungen mit diesem Schwerpunkt kommen bevorzugt in den Plan.', chipGroup('focus', withExtras(FOCUS, focus, focusLabel), focus, 'mandarine')));

  // Vorgaben als Freitext, ohne Logik
  let notes = null;
  if (guidance) {
    const field = el('label', 'field');
    notes = el('textarea', 'input textarea');
    notes.name = 'guidance';
    notes.rows = 4;
    notes.value = training.guidance ?? '';
    field.append(el('span', 'label', 'Vorgaben von Arzt, Physio oder Osteopath'), notes);
    node.append(field, el('p', 'hint', 'Steht im Trainings-Tab unter „Meine Vorgaben“, damit du sie im Studio nachlesen kannst. Die App wertet den Text nicht aus.'));
  }

  const checked = (name) => [...node.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  function value() {
    const result = {
      protectRegions: checked('protectRegions').map((region) => ({ region, until: untilByRegion.get(region) ?? null })),
      avoidMovements: checked('avoidMovements'),
      focus: checked('focus'),
    };
    if (notes) result.guidance = notes.value.trim();
    return result;
  }

  regionChips.addEventListener('change', () => { renderUntil(); onChange(value()); });
  movementList.addEventListener('change', () => onChange(value()));
  node.querySelector('fieldset:nth-of-type(3)').addEventListener('change', () => onChange(value()));
  notes?.addEventListener('change', () => onChange(value()));
  renderUntil();

  return { node, value };
}
