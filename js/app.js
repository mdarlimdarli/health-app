/*
  App-Shell und Hash-Router.
  Routen mit load() rendern ihr Modul aus js/modules/,
  alle anderen zeigen bis dahin eine leere Platzhalter-Ansicht.
  Ohne Profil führt jede Route zum Onboarding, außer den Einstellungen
  (dort lässt sich eine Sicherung mit Profil wiederherstellen).
*/

import { initSync } from './sync.js';
import { loadProfile, hasProfile, appTitle, onProfileChange } from './profile.js';
import { onChange } from './db.js';
import { openItems } from './meds-store.js';
import { setAppBadge, scheduleStatusUpdate } from './push.js';
import { setAura, auraForRoute } from './aura.js';

// Linien-Icons, 24er Raster, Strichstärke kommt aus CSS (Tab-Bar 1.75 px, sonst 1.5 px)
const ICONS = {
  heute: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  training: '<path d="M3 12h18M6 8v8M3.5 10v4M18 8v8M20.5 10v4"/>',
  medis: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9 9 6 6"/>',
  checkin: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  essen: '<path d="M6 3v5.5a2 2 0 0 0 4 0V3M8 3v18"/><path d="M17.5 21V3c-2.2 1.4-3.5 4.2-3.5 8.5h3.5"/>',
  einstellungen: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  zurueck: '<path d="M15 5 8 12l7 7"/>',
};

// Routen: Titel, Farbwelt des Verlaufs, Platz in der Tab-Bar
const ROUTES = {
  heute: { title: 'Heute', tone: 'mandarine', tab: true, load: () => import('./modules/home.js') },
  training: { title: 'Training', tone: 'mandarine', tab: true, load: () => import('./modules/training.js') },
  medis: { title: 'Medis', tone: 'butter', tab: true, load: () => import('./modules/meds.js') },
  checkin: { title: 'Check-in', tone: 'periwinkle', tab: true, load: () => import('./modules/checkin.js') },
  essen: { title: 'Essen', tone: 'salbei', tab: true, load: () => import('./modules/food.js') },
  zyklus: { title: 'Zyklus', tone: 'rose', tab: false, load: () => import('./modules/cycle.js') },
  einstellungen: { title: 'Einstellungen', tone: 'rose', tab: false, load: () => import('./modules/settings.js') },
  profil: { title: 'Profil', tone: 'rose', tab: false, load: () => import('./modules/profile-form.js') },
  willkommen: { title: 'Willkommen', tone: 'mandarine', tab: false, load: () => import('./modules/profile-form.js') },
};

const DEFAULT_ROUTE = 'heute';

// Modulfarbe für Buttons, Zahlen und aktive Elemente, neutral ist Periwinkle
const MODULE_TONES = { training: 'mandarine', medis: 'butter', checkin: 'koralle', essen: 'salbei', zyklus: 'rose' };
const BADGE_INTERVAL_MS = 60000;

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function renderShell(root) {
  const tabs = Object.entries(ROUTES)
    .filter(([, route]) => route.tab)
    .map(([id, route]) => `<a class="tab" href="#/${id}" data-route="${id}" aria-label="${route.title}">${icon(id)}${id === 'medis' ? '<span class="tab-badge" data-badge hidden></span>' : ''}</a>`)
    .join('');

  root.innerHTML = `
    <div class="aura" id="aura" aria-hidden="true"></div>
    <header class="app-header">
      <a class="icon-button icon-button--back" href="#/heute" data-back aria-label="Zurück" hidden>${icon('zurueck')}</a>
      <h1 id="view-title"></h1>
      <a class="icon-button" href="#/einstellungen" data-route="einstellungen" aria-label="Einstellungen">${icon('einstellungen')}</a>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Hauptnavigation">${tabs}</nav>
  `;
}

function renderPlaceholder(route) {
  return `
    <section class="placeholder">
      <div class="blob blob--${route.tone}"></div>
      <p class="label">${route.title}</p>
      <p class="secondary">Hier entsteht bald etwas.</p>
    </section>`;
}

// Routen, die auch ohne Profil erreichbar sind
const WITHOUT_PROFILE = new Set(['willkommen', 'einstellungen']);

/*
  Eigene Zurück-Navigation, weil die App im Standalone-Modus keine Browserleiste hat.
  Ziel ist immer die übergeordnete Ansicht, nicht der Browserverlauf, damit
  der Pfeil auch nach einem Start direkt auf einer Unterseite funktioniert.
  Unteransichten mit eigener Umschaltung (Auswertung, Lebensmittel) brauchen keinen Pfeil.
*/
let returnTo = `#/${DEFAULT_ROUTE}`;
const isDay = (part) => /^\d{4}-\d{2}-\d{2}$/.test(part);

function parentOf(id, sub) {
  if (id === 'einstellungen') return hasProfile() ? returnTo : null;
  // Zyklus erreicht man von der Startseite oder aus dem Check-in, zurück geht es dorthin
  if (id === 'zyklus') return isDay(sub) ? '#/zyklus' : returnTo;
  if (id === 'profil') return '#/einstellungen';
  if (id === 'training' && (sub === 'einheit' || sub === 'fortschritt' || sub === 'anpassen')) return '#/training';
  if (id === 'medis' && (sub === 'neu' || sub === 'bearbeiten')) return '#/medis/verwalten';
  if (id === 'medis' && (sub === 'verwalten' || sub === 'uebersicht' || isDay(sub))) return '#/medis';
  if ((id === 'checkin' || id === 'essen') && isDay(sub)) return `#/${id}`;
  return null;
}

function updateBack(id, sub) {
  const back = document.querySelector('[data-back]');
  const target = parentOf(id, sub);
  back.hidden = !target;
  if (target) back.href = target;
  // Rücksprung aus den Einstellungen: zuletzt besuchte Ansicht außerhalb von Einstellungen und Profil
  if (!['einstellungen', 'profil', 'willkommen', 'zyklus'].includes(id)) returnTo = location.hash || `#/${id}`;
}

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
  document.body.dataset.tone = MODULE_TONES[id] ?? 'periwinkle';
  updateBack(id, location.hash.replace(/^#\/?/, '').split('/')[1] ?? '');
  // Aura des Moduls, Startseite und Check-in überschreiben sie mit ihren Werten
  setAura(auraForRoute(id, location.hash.replace(/^#\/?/, '').split('/')[1] ?? ''));
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

  fresh.innerHTML = renderPlaceholder(route);
  // Intensität per CSSOM setzen (Inline-Styles sind per CSP gesperrt)
  fresh.querySelectorAll('.blob').forEach((blob) => blob.style.setProperty('--intensity', '0.6'));
}

// Zahl fälliger, offener Einträge am Tab Medis und am App-Symbol
async function updateBadge() {
  const badge = document.querySelector('[data-badge]');
  if (!badge) return;
  let count = 0;
  try {
    count = hasProfile() ? (await openItems()).length : 0;
  } catch {
    count = 0;
  }
  badge.hidden = count === 0;
  badge.textContent = String(count);
  badge.setAttribute('aria-label', `${count} fällig`);
  // Der Tab hat nur ein Icon, die Zahl gehört deshalb in sein Label
  badge.closest('a')?.setAttribute('aria-label', count ? `Medis, ${count} fällig` : 'Medis');
  setAppBadge(count);
}

// Standalone: fremde Links nie im App-Fenster öffnen (dort gäbe es keinen Weg zurück), sondern in Safari
function openExternalLinksOutside() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.protocol === 'blob:' || link.hasAttribute('download')) return;
    if (link.origin === location.origin) return;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
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
  openExternalLinksOutside();
  registerServiceWorker();
  initSync();

  // Kopfzeile liegt transparent über der Aura, beim Scrollen bekommt sie Creme
  const header = document.querySelector('.app-header');
  const onScroll = () => header.classList.toggle('app-header--scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  updateBadge();
  onChange((store) => { if (store === 'medLog' || store === 'meds' || store === 'import') updateBadge(); });
  onProfileChange(updateBadge);
  setInterval(updateBadge, BADGE_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    updateBadge();
    scheduleStatusUpdate();
  });
  // Status für das Nachhaken um 22 Uhr einmal je Start aktuell halten (nur mit aktivem Push)
  scheduleStatusUpdate();
}

start();
