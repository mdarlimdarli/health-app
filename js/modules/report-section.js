/*
  Einstellungsbereich "Auszug für die Beratung": Zeitraum wählen, Medikamente anonymisieren,
  Markdown über den Teilen-Dialog weitergeben oder in die Zwischenablage kopieren.
  Der Text wird vorab erzeugt, damit der Teilen-Dialog direkt im Tap startet.
*/

import { buildReport } from '../report.js';
import { toast, todayISO, el } from '../ui.js';

export function renderReportSection(container) {
  const state = { weeks: 4, anonymize: true, text: '' };
  container.replaceChildren();
  container.className = 'stack-tight';
  container.append(el('h2', null, 'Auszug für die Beratung'), el('p', 'hint', 'Erzeugt eine unverschlüsselte Zusammenfassung als Markdown: Profil in Kurzform, Check-ins, Training, Einnahme, Mahlzeiten-Feedback und Messwerte. Teile sie nur mit Menschen, denen du vertraust.'));

  const range = el('div', 'segmented');
  range.setAttribute('role', 'radiogroup');
  range.setAttribute('aria-label', 'Zeitraum');
  for (const weeks of [4, 8, 12]) {
    const option = el('label', 'segment');
    const input = el('input');
    input.type = 'radio';
    input.name = 'report-range';
    input.checked = weeks === state.weeks;
    input.addEventListener('change', () => { state.weeks = weeks; prepare(); });
    option.append(input, el('span', null, `${weeks} Wochen`));
    range.append(option);
  }

  const anonymize = el('label', 'switch-row');
  const anonymizeInput = el('input', 'switch');
  anonymizeInput.type = 'checkbox';
  anonymizeInput.checked = true;
  anonymizeInput.addEventListener('change', () => { state.anonymize = anonymizeInput.checked; prepare(); });
  anonymize.append(el('span', null, 'Medikamente anonymisieren'), anonymizeInput);

  const create = el('button', 'button button--primary', 'Auszug erstellen');
  create.type = 'button';
  const preview = el('details', 'details');
  const pre = el('pre', 'code report-preview');
  preview.append(el('summary', null, 'Vorschau'), pre);

  const prepare = async () => {
    create.disabled = true;
    state.text = await buildReport({ weeks: state.weeks, anonymize: state.anonymize });
    pre.textContent = state.text;
    create.disabled = false;
  };

  create.addEventListener('click', async () => {
    const text = state.text || await buildReport(state);
    const file = new File([text], `auszug-${todayISO()}.md`, { type: 'text/markdown' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Auszug Gesundheitsdaten' });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Auszug Gesundheitsdaten', text });
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Auszug in die Zwischenablage kopiert');
    } catch {
      toast('Teilen und Kopieren nicht möglich. Öffne die Vorschau und markiere den Text.', { error: true });
    }
  });

  container.append(range, anonymize, create, preview);
  prepare();
}
