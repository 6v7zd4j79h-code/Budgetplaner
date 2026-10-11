// Anlaesse: Geburtstage, Feiertage und Ferien, vor denen mehr oder anderes
// eingekauft wird (Kuchen, Plaetzchen, Mittagessen fuer die Kinder). Ein paar
// Wochen vorher erinnert die App daran, damit man haltbare Zutaten schon
// kaufen kann, wenn sie im Angebot sind.
//
// Im Budget gespeichert:
//   data.occasions = [
//     { id, kind: 'birthday', name, day: 'MM-TT', lead, note },
//     { id, kind: 'period', name, from: 'JJJJ-MM-TT', to: 'JJJJ-MM-TT', lead, note },
//   ]
//   data.holidaysOff = ['nikolaus', ...]   ausgeschaltete Feiertage
// lead = Vorlauf in Tagen.

import { todayISO } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

// Ostersonntag nach der Gaussschen Osterformel (gregorianischer Kalender).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export const HOLIDAYS = [
  { id: 'ostern', name: 'Ostern', date: (y) => easterSunday(y), lead: 21, note: 'Eier, Backzutaten, Süßes fürs Osternest' },
  { id: 'nikolaus', name: 'Nikolaus', date: (y) => `${y}-12-06`, lead: 21, note: 'Schokolade, Mandarinen, Nüsse' },
  { id: 'weihnachten', name: 'Weihnachten', date: (y) => `${y}-12-24`, lead: 42, note: 'Plätzchen-Zutaten, Festessen, Getränke' },
  { id: 'silvester', name: 'Silvester', date: (y) => `${y}-12-31`, lead: 14, note: 'Raclette oder Fondue, Snacks, Getränke' },
];

// Naechster Termin eines jaehrlichen Datums ("MM-TT") ab heute. Der 29.02.
// faellt in Nicht-Schaltjahren auf den 28.02.
export function nextYearly(day, today) {
  const year = Number(today.slice(0, 4));
  const at = (y) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${day === '02-29' && !leap ? '02-28' : day}`;
  };
  return at(year) >= today ? at(year) : at(year + 1);
}

export function nextHoliday(h, today) {
  const year = Number(today.slice(0, 4));
  const date = h.date(year);
  return date >= today ? date : h.date(year + 1);
}

// Alle Anlaesse, die noch kommen oder gerade laufen, nach Datum sortiert.
// "soon" heisst: Der Vorlauf hat begonnen - jetzt bei Angeboten daran denken.
export function upcomingOccasions(data, { today = todayISO(), horizon = 120 } = {}) {
  const now = dayNumber(today);
  const list = [];
  const add = (o) => {
    const daysLeft = dayNumber(o.date) - now;
    const running = o.until ? daysLeft <= 0 && dayNumber(o.until) >= now : false;
    if (!running && (daysLeft < 0 || daysLeft > horizon)) return;
    list.push({ ...o, daysLeft: Math.max(0, daysLeft), running, soon: running || daysLeft <= o.lead });
  };

  const off = new Set(data.holidaysOff || []);
  for (const h of HOLIDAYS) {
    if (!off.has(h.id)) add({ id: h.id, kind: 'holiday', name: h.name, date: nextHoliday(h, today), lead: h.lead, note: h.note });
  }
  for (const o of data.occasions || []) {
    const lead = Number.isFinite(o.lead) ? o.lead : 21;
    if (o.kind === 'birthday' && /^\d{2}-\d{2}$/.test(o.day || '')) {
      add({ id: o.id, kind: 'birthday', name: o.name, date: nextYearly(o.day, today), lead, note: o.note || '' });
    } else if (o.kind === 'period' && o.from && o.to && o.to >= o.from) {
      add({ id: o.id, kind: 'period', name: o.name, date: o.from, until: o.to, lead, note: o.note || '' });
    }
  }
  return list.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, 'de') : a.date < b.date ? -1 : 1));
}
