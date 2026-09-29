/*
  Aura je Screen: zwei bis drei große, weiche Verläufe hinter dem oberen Bereich,
  höchstens vier. Jedes Modul hat eine feste Kombination, Startseite und Check-in
  bauen ihre Aura aus den Werten des Tages. Einstellungen bleiben nur Creme.
  Positionen x und y in Prozent der Aura-Fläche, intensity 0 bis 1 steuert Größe und Deckkraft.
*/

import { el } from './ui.js';

const MAX_BLOBS = 4;

export const AURAS = {
  heute: [
    { tone: 'butter', x: 12, y: 16, intensity: 0.6 },
    { tone: 'rose', x: 58, y: 4, intensity: 0.5 },
    { tone: 'periwinkle', x: 94, y: 30, intensity: 0.65 },
  ],
  willkommen: [
    { tone: 'butter', x: 12, y: 16, intensity: 0.6 },
    { tone: 'rose', x: 58, y: 4, intensity: 0.5 },
    { tone: 'periwinkle', x: 94, y: 30, intensity: 0.65 },
  ],
  // Dezent, oben hinter der Kopfzeile
  training: [
    { tone: 'mandarine', x: 16, y: -6, intensity: 0.45 },
    { tone: 'butter', x: 82, y: -8, intensity: 0.4 },
  ],
  // Während der Einheit nur ein Blob, damit nichts vom Loggen ablenkt
  'training/einheit': [
    { tone: 'mandarine', x: 84, y: -10, intensity: 0.3 },
  ],
  // Großzügig oben
  medis: [
    { tone: 'butter', x: 10, y: 6, intensity: 1 },
    { tone: 'mandarine', x: 90, y: 4, intensity: 0.85 },
  ],
  essen: [
    { tone: 'salbei', x: 12, y: 8, intensity: 0.8 },
    { tone: 'butter', x: 88, y: 8, intensity: 0.65 },
  ],
  // Check-in baut seine Aura beim Antippen selbst auf
  checkin: [],
  // Auswertung: Schlaf und Zyklus, von oben auslaufend wie ein Himmel
  'checkin/auswertung': [
    { tone: 'periwinkle', x: 40, y: -14, intensity: 0.9 },
    { tone: 'rose', x: 70, y: 24, intensity: 0.7 },
  ],
  // Zyklus: Rosé großzügig, Butter dezent
  zyklus: [
    { tone: 'rose', x: 18, y: 4, intensity: 0.85 },
    { tone: 'butter', x: 86, y: 10, intensity: 0.45 },
  ],
  einstellungen: [],
  profil: [],
};

let current = '';

// Ersetzt die Aura. Mit animate blendet sie in 400 ms ein, ohne wird nur aktualisiert.
export function setAura(blobs = [], { animate = true } = {}) {
  const container = document.getElementById('aura');
  if (!container) return;
  const list = blobs.slice(0, MAX_BLOBS);
  const signature = JSON.stringify(list);
  if (signature === current && container.firstChild) return;
  current = signature;

  let layer = container.querySelector('.aura-layer');
  if (animate || !layer || layer.children.length !== list.length) {
    layer = el('div', 'aura-layer');
    container.replaceChildren(layer);
    for (const blob of list) layer.append(el('div'));
  }
  [...layer.children].forEach((node, index) => {
    const blob = list[index];
    node.className = `blob blob--${blob.tone}`;
    node.style.setProperty('--x', `${blob.x}%`);
    node.style.setProperty('--y', `${blob.y}%`);
    node.style.setProperty('--intensity', String(blob.intensity ?? 0.7));
  });
}

export function auraForRoute(route, sub = '') {
  return AURAS[`${route}/${sub}`] ?? AURAS[route] ?? [];
}
