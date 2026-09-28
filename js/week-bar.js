/*
  Wochentags-Leiste für Training, Medis und Essen: sieben Kreise von Montag bis Sonntag.
  Aktiver Tag in deep der Modulfarbe mit weißer Zahl, heute mit Ring, markierte Tage mit Punkt.
*/

import { el } from './ui.js';

const SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

function longLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function weekDays(date) {
  const start = addDays(date, 1 - weekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/*
  date: Tag, dessen Woche gezeigt wird. active: hervorgehobener Tag.
  href(day): Link je Tag oder null für eine reine Anzeige. marked: Tage mit Punkt.
*/
export function weekBar({ date, active = date, today, tone, href = null, marked = new Set(), label = 'Woche' }) {
  const bar = el('div', `week-bar week-bar--${tone}`);
  bar.setAttribute('role', href ? 'tablist' : 'list');
  bar.setAttribute('aria-label', label);
  weekDays(date).forEach((day, index) => {
    const classes = ['week-day'];
    if (day === active) classes.push('week-day--active');
    if (day === today) classes.push('week-day--today');
    if (marked.has(day)) classes.push('week-day--marked');
    const node = el(href ? 'a' : 'span', classes.join(' '));
    if (href) {
      node.href = href(day);
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(day === active));
    } else {
      node.setAttribute('role', 'listitem');
    }
    node.setAttribute('aria-label', `${longLabel(day)}${marked.has(day) ? ', erledigt' : ''}`);
    node.append(el('span', 'label', SHORT[index]), el('span', 'week-circle', String(Number(day.slice(8)))));
    bar.append(node);
  });
  return bar;
}
