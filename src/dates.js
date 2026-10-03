// Monate werden als "JJJJ-MM" gefuehrt, Tage als "JJJJ-MM-TT". Beides
// sortiert sich als Text richtig und hat keine Zeitzonen-Fallen.

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthKey(dateOrIso = new Date()) {
  if (typeof dateOrIso === 'string') return dateOrIso.slice(0, 7);
  return `${dateOrIso.getFullYear()}-${pad(dateOrIso.getMonth() + 1)}`;
}

export function addMonths(key, delta) {
  const [year, month] = key.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function monthName(key) {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1];
}

export function formatDay(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

// Ersten Tag des Monats, in dem sich ein Datum befindet, sonst das Datum selbst.
export function clampToMonth(iso, key) {
  return iso.startsWith(key) ? iso : `${key}-01`;
}
