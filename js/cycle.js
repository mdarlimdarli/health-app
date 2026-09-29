/*
  Zyklusphase für die Startseite, rein funktional.
  Grundlage sind die eigenen Daten: Periodenbeginne aus den Check-ins ergeben die
  durchschnittliche Zykluslänge (ohne Daten 28 Tage), die Dauer der Periode kommt aus
  der ersten Phase in profile.checkin.cyclePhases. Der Eisprung ist nur geschätzt
  (Zykluslänge minus 14), deshalb heißt die Phase "Ovulation ca.".
*/

export const DEFAULT_CYCLE_LENGTH = 28;
const MIN_LENGTH = 18;
const MAX_LENGTH = 45;
const MAX_CYCLES = 6;
const LUTEAL_DAYS = 14;

const toUTC = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const daysBetween = (from, to) => Math.round((toUTC(to) - toUTC(from)) / 86400000);

/*
  Durchschnitt der letzten abgeschlossenen Zyklen (höchstens sechs).
  Abstände außerhalb von 18 bis 45 Tagen zählen nicht, etwa ein vergessener Eintrag.
*/
export function averageCycleLength(startDates, { fallback = DEFAULT_CYCLE_LENGTH } = {}) {
  const starts = [...new Set(startDates)].sort();
  const lengths = [];
  for (let i = 1; i < starts.length; i++) lengths.push(daysBetween(starts[i - 1], starts[i]));
  const valid = lengths.filter((length) => length >= MIN_LENGTH && length <= MAX_LENGTH).slice(-MAX_CYCLES);
  if (!valid.length) return fallback;
  return Math.round(valid.reduce((sum, length) => sum + length, 0) / valid.length);
}

// Dauer der Periode aus der ersten Phase des Profils, sonst 5 Tage
export function periodLength(cyclePhases = []) {
  const first = cyclePhases[0];
  return Number.isInteger(first?.to) && first.to > 0 ? first.to : 5;
}

/*
  Phase in Worten: Menstruation, Follikelphase, Ovulation ca. (geschätzter Eisprung
  plus minus einen Tag), Lutealphase. Nach dem erwarteten Ende bleibt es Lutealphase.
*/
export function cyclePhaseName(cycleDay, cycleLength = DEFAULT_CYCLE_LENGTH, periodDays = 5) {
  if (!Number.isInteger(cycleDay) || cycleDay < 1) return null;
  const ovulation = Math.max(periodDays + 2, cycleLength - LUTEAL_DAYS);
  if (cycleDay <= periodDays) return 'Menstruation';
  if (cycleDay < ovulation - 1) return 'Follikelphase';
  if (cycleDay <= ovulation + 1) return 'Ovulation ca.';
  return 'Lutealphase';
}
