/*
  App-Shell und Hash-Router.
  Routen mit load() rendern ihr Modul aus js/modules/,
  alle anderen zeigen bis dahin eine leere Platzhalter-Ansicht.
  Ohne Profil führt jede Route zum Onboarding, außer den Einstellungen
  (dort lässt sich eine Sicherung mit Profil wiederherstellen).
*/

import { initSync } from './sync.js';
import { loadProfile, getProfile, hasProfile, appTitle, onProfileChange } from './profile.js';

// Linien-Icons, 24er Raster, Strichstärke kommt aus CSS (1.5 px)
const ICONS = {
  heute: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  training: '<path d="M3 12h18M6 8v8M3.5 10v4M18 8v8M20.5 10v4"/>',
  medis: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9 9 6 6"/>',
  checkin: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  essen: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19 13 11"/>',
  einstellungen: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
};

// Routen: Titel, Farbwelt des Verlaufs, Platz in der Tab-Bar
const ROUTES = {
  heute: { title: 'Heute', tone: 'sonne', tab: true },
  training: { title: 'Training', tone: 'sonne', tab: true, load: () => import('./modules/training.js') },
  medis: { title: 'Medis', tone: 'zitrone', tab: true },
  checkin: { title: 'Check-in', tone: 'himmel', tab: true },
  essen: { title: 'Essen', tone: 'salbei', tab: true },
  einstellungen: { title: 'Einstellungen', tone: 'flieder', tab: false, load: () => import('./modules/settings.js') },
  profil: { title: 'Profil', tone: 'flieder', tab: false, load: () => import('./modules/profile-form.js') },
  willkommen: { title: 'Willkommen', tone: 'sonne', tab: false, load: () => import('./modules/profile-form.js') },
};

const DEFAULT_ROUTE = 'heute';
const TIME_ZONE = 'Europe/Berlin';

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Kalendertag in Berlin, unabhängig von der Zeitzone des Geräts
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

function renderShell(root) {
  const tabs = Object.entries(ROUTES)
    .filter(([, route]) => route.tab)
    .map(([id, route]) => `<a class="tab" href="#/${id}" data-route="${id}">${icon(id)}<span>${route.title}</span></a>`)
    .join('');

  root.innerHTML = `
    <header class="app-header">
      <h1 id="view-title"></h1>
      <a class="icon-button" href="#/einstellungen" data-route="einstellungen" aria-label="Einstellungen">${icon('einstellungen')}</a>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Hauptnavigation">${tabs}</nav>
  `;
}

function renderPlaceholder(id, route) {
  if (id === 'heute') {
    const { day, weekday, month } = todayParts();
    return `
      <section class="placeholder">
        <div class="blob blob--${route.tone}"></div>
        <h2 data-greeting></h2>
        <p class="label">${weekday}</p>
        <p class="number">${day}</p>
        <p class="secondary">${month}</p>
      </section>`;
  }
  return `
    <section class="placeholder">
      <div class="blob blob--${route.tone}"></div>
      <p class="label">${route.title}</p>
      <p class="secondary">Hier entsteht bald etwas.</p>
    </section>`;
}

// Routen, die auch ohne Profil erreichbar sind
const WITHOUT_PROFILE = new Set(['willkommen', 'einstellungen']);

function currentRoute() {
  const id = location.hash.replace(/^#\/?/, '').split('/')[0];
  const route = ROUTES[id] ? id : DEFAULT_ROUTE;
  if (!hasProfile()) return WITHOUT_PROFILE.has(route) ? route : 'willkommen';
  return route === 'willkommen' ? DEFAULT_ROUTE : route;
}

async function navigate() {
  const id = currentRoute();
  const route = ROUTES[id];
  const view = document.getElementById('view');
  // Hash angleichen, wenn umgeleitet wurde (ohne neuen hashchange). Unterpfade wie #/training/einheit bleiben.
  const segment = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (segment !== id) history.replaceState(null, '', `#/${id}`);
  document.getElementById('app').classList.toggle('shell--onboarding', !hasProfile());

  document.getElementById('view-title').textContent = route.title;
  document.title = `${route.title} · ${appTitle()}`;

  // Neu einsetzen, damit die Einblend-Animation jedes Mal läuft
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);

  document.querySelectorAll('[data-route]').forEach((link) => {
    if (link.dataset.route === id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);

  if (route.load) {
    try {
      const module = await route.load();
      await module.render(fresh, { route: id });
    } catch (error) {
      console.error('Ansicht konnte nicht geladen werden:', error.message);
      fresh.textContent = 'Diese Ansicht konnte nicht geladen werden.';
    }
    return;
  }

  fresh.innerHTML = renderPlaceholder(id, route);
  // Name aus dem Profil nur als Text einsetzen, nie als HTML
  const greetingEl = fresh.querySelector('[data-greeting]');
  if (greetingEl) greetingEl.textContent = greeting(todayParts().hour);
  // Intensität per CSSOM setzen (Inline-Styles sind per CSP gesperrt)
  fresh.querySelectorAll('.blob').forEach((blob) => blob.style.setProperty('--intensity', '0.6'));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('Service Worker nicht registriert:', error.message);
  });
}

async function start() {
  renderShell(document.getElementById('app'));
  // Profil vor der ersten Ansicht laden, Titel und Begrüßung hängen davon ab
  try {
    await loadProfile();
  } catch (error) {
    console.warn('Profil nicht geladen:', error.message);
  }
  if (!location.hash) history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
  window.addEventListener('hashchange', navigate);
  // Nach Import oder Wiederherstellung Titel und Umleitung neu bewerten
  onProfileChange(() => {
    document.title = `${ROUTES[currentRoute()].title} · ${appTitle()}`;
    document.getElementById('app').classList.toggle('shell--onboarding', !hasProfile());
  });
  navigate();
  registerServiceWorker();
  initSync();
}

start();
