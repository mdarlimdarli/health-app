/*
  Kleine UI-Bausteine: Dialoge und visuelle Bestätigung.
  Texte immer über textContent setzen, nie als HTML.
*/

const TIME_ZONE = 'Europe/Berlin';

// Zeitpunkt lesbar in Berliner Zeit, z. B. "28.09.2026, 14:32"
export function formatDateTime(iso) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

// Kalendertag in Berlin als YYYY-MM-DD
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label, className, value) {
  const node = el('button', className, label);
  node.value = value;
  return node;
}

// Baut einen modalen Dialog und liefert ihn nach dem Schließen wieder ab
function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'dialog');
    const form = el('form');
    form.method = 'dialog';
    const collect = build(form);
    dialog.append(form);
    document.body.append(dialog);

    dialog.addEventListener('close', () => {
      const result = collect(dialog.returnValue);
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('cancel', () => { dialog.returnValue = 'cancel'; });
    dialog.showModal();
  });
}

// Fragt ein Passwort ab. Liefert den String oder null bei Abbruch.
export function askPassword({ title = 'Passwort', text = '', confirmLabel = 'Entsperren' } = {}) {
  return openDialog((form) => {
    const input = el('input', 'input');
    input.type = 'password';
    input.name = 'password';
    input.autocomplete = 'current-password';
    input.required = true;
    input.setAttribute('aria-label', 'Passwort');

    const actions = el('div', 'dialog-actions');
    const cancel = button('Später', 'button', 'cancel');
    cancel.formNoValidate = true;
    // Bestätigen steht im DOM zuerst, damit Enter es auslöst. Optisch rechts per CSS.
    actions.append(button(confirmLabel, 'button button--primary', 'ok'), cancel);

    form.append(el('h2', null, title));
    if (text) form.append(el('p', 'secondary', text));
    form.append(input, actions);
    requestAnimationFrame(() => input.focus());

    return (value) => (value === 'ok' && input.value ? input.value : null);
  });
}

// Bestätigung für folgenreiche Aktionen. Liefert true oder false.
export function confirmDialog({ title, text = '', confirmLabel = 'OK', danger = false }) {
  return openDialog((form) => {
    const actions = el('div', 'dialog-actions');
    actions.append(
      button(confirmLabel, danger ? 'button button--danger' : 'button button--primary', 'ok'),
      button('Abbrechen', 'button', 'cancel')
    );
    form.append(el('h2', null, title));
    if (text) form.append(el('p', 'secondary', text));
    form.append(actions);
    return (value) => value === 'ok';
  });
}

// Kurze Rückmeldung am unteren Rand, ersetzt fehlende Haptik
let toastTimer;
export function toast(text, { error = false } = {}) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', 'toast');
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.textContent = text;
  node.classList.toggle('toast--error', error);
  node.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('toast--visible'), error ? 4000 : 2400);
}
