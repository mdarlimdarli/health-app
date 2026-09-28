/*
  Startseite: Begrüßung, Tageszahl und fällige, noch nicht abgehakte Einträge.
  Wichtige Einträge (critical) stehen immer oben.
*/

import { getProfile } from '../profile.js';
import { openItems, setTaken } from '../meds-store.js';
import { isMeasurement, slotLabel } from '../meds-schedule.js';
import { todayISO, toast, el } from '../ui.js';

const TIME_ZONE = 'Europe/Berlin';

function todayParts() {
  const now = new Date();
  const fmt = (options) => new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, ...options }).format(now);
  return { day: fmt({ day: 'numeric' }), weekday: fmt({ weekday: 'long' }), month: fmt({ month: 'long' }), hour: Number(fmt({ hour: 'numeric', hourCycle: 'h23' })) };
}

// Begrüßung nach Tageszeit, mit Namen aus dem Profil, falls vorhanden
function greeting(hour) {
  const phrase = hour >= 5 && hour < 11 ? 'Guten Morgen' : hour >= 11 && hour < 17 ? 'Hallo' : hour >= 17 && hour < 23 ? 'Guten Abend' : 'Gute Nacht';
  const name = getProfile().displayName;
  return name ? `${phrase}, ${name}` : phrase;
}

function checkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
  return svg;
}

async function renderDue(container) {
  const items = await openItems();
  container.replaceChildren();
  if (!items.length) return;

  const card = el('div', 'card due-card');
  const blob = el('div', 'blob blob--zitrone');
  blob.style.setProperty('--intensity', String(Math.min(1, 0.3 + items.length * 0.15)));
  const head = el('div', 'due-head');
  head.append(el('p', 'label', 'Jetzt fällig'), el('span', 'card-number', String(items.length)));
  card.append(blob, head);

  for (const item of items) {
    const row = el('div', `med-row${item.med.critical ? ' med-row--critical' : ''}`);
    const body = el('div', 'med-body');
    const name = el('span', 'med-name', item.med.name);
    if (item.med.critical) name.append(' ', el('span', 'med-tag', 'Wichtig'));
    body.append(name, el('span', 'secondary', [slotLabel(item.slot), item.med.dosage].filter(Boolean).join(', ')));

    if (isMeasurement(item.med)) {
      const go = el('a', 'button button--small', 'Messen');
      go.href = '#/medis';
      row.append(body, go);
    } else {
      const check = el('button', 'med-check');
      check.type = 'button';
      check.setAttribute('aria-label', `${item.med.name} genommen`);
      check.append(checkIcon());
      check.addEventListener('click', async () => {
        await setTaken(item.med, item.slot, todayISO(), true);
        row.classList.add('med-row--done');
        toast(`${item.med.name} abgehakt`);
        setTimeout(() => renderDue(container), 600);
      });
      row.append(check, body);
    }
    card.append(row);
  }
  container.append(card);
}

export async function render(root) {
  const { day, weekday, month, hour } = todayParts();
  const section = el('section', 'stack home');
  const intro = el('div', 'home-intro');
  const blob = el('div', 'blob blob--sonne');
  blob.style.setProperty('--intensity', '0.6');
  const line = el('div', 'day-line');
  line.append(el('span', 'number', day), el('span', 'month', month));
  intro.append(blob, el('h2', null, greeting(hour)), el('p', 'label', weekday), line);

  const due = el('div');
  section.append(intro, due);
  root.replaceChildren(section);
  await renderDue(due);
}
