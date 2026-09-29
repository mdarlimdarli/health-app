/*
  Kopf der Startseite: Begrüßung nach Tageszeit, Datum und Uhrzeit.
  Rein funktional, alles in der lokalen Zeit des Geräts (getHours, getMinutes),
  ohne UTC-Umrechnung und ohne Text-Parsing aus Intl.
*/

// 5 bis 10 Uhr Morgen, 10 bis 17 Hallo, 17 bis 22 Abend, 22 bis 5 Nacht
export function greetingPhrase(hour) {
  if (hour >= 5 && hour < 10) return 'Guten Morgen';
  if (hour >= 10 && hour < 17) return 'Hallo';
  if (hour >= 17 && hour < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

export function greeting(date, name = '') {
  const phrase = greetingPhrase(date.getHours());
  return name ? `${phrase}, ${name}` : phrase;
}

// "08:05"
export function timeText(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Wochentag, Tageszahl und Monat in der lokalen Zeit des Geräts
export function dayParts(date) {
  const fmt = (options) => new Intl.DateTimeFormat('de-DE', options).format(date);
  return { weekday: fmt({ weekday: 'long' }), day: String(date.getDate()), month: fmt({ month: 'long' }) };
}

// Millisekunden bis zum nächsten Minutenwechsel, damit die Uhr genau umspringt
export function msToNextMinute(date) {
  return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
