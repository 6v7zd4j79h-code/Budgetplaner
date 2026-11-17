// Feste Abbuchungen: was regelmaessig (monatlich, vierteljaehrlich,
// halbjaehrlich, jaehrlich) mit festem Betrag vom Konto geht - Haftpflicht,
// Versicherungen, Abschlaege, Abos. Erkannt aus den eingelesenen
// Kontoauszuegen (data.imported, je Buchung "Bank|Datum|Betrag|Empfaenger"),
// bestaetigt von Hand. Daraus: was geht diesen Monat noch ab?
//
// Bewusst nur feste Betraege. Was jeden Monat anders ausfaellt (Tanken,
// Einkaufen), wird nicht geschaetzt (Mareike, 17.11.2026).

import { INTERVALS, intervalMonths, newId } from './budget.js';
import { monthKey, todayISO } from './dates.js';

// Abstand zwischen zwei Abbuchungen in Tagen -> Rhythmus in Monaten.
const GAPS = [
  { months: 1, min: 24, max: 38 },
  { months: 3, min: 80, max: 100 },
  { months: 6, min: 170, max: 195 },
  { months: 12, min: 345, max: 385 },
];
// "Fester Betrag": bei Vertraegen (Rechnung, Abo, Kredit, Sparen laut
// Import) bis 10 % Unterschied (Preiserhoehung), sonst auf den Cent gleich -
// sonst rutscht die Tankstelle mit fast gleichen Betraegen durch.
const CONTRACT_AMOUNT = 0.10;
const MATCH_AMOUNT = 0.25; // bestaetigter Eintrag findet seine Buchungen trotz Preiserhoehung

const DAY = 24 * 60 * 60 * 1000;
const toTime = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / DAY);

export function intervalId(months) {
  return (INTERVALS.find((i) => i.months === months) || INTERVALS[0]).id;
}

export function intervalLabel(id) {
  return (INTERVALS.find((i) => i.id === id) || INTERVALS[0]).label;
}

// Datum + n Monate, der Tag bleibt (31. -> letzter Tag im kuerzeren Monat).
export function addMonthsToDate(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// Eingelesene Abbuchungen aus den Fingerabdruecken zurueckgewinnen.
export function importedDebits(data) {
  const out = [];
  for (const fp of data.imported || []) {
    const parts = String(fp).split('|');
    if (parts.length < 4) continue;
    const [source, date, amountText] = parts;
    const payee = parts.slice(3).join('|');
    const amount = Number(amountText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount >= 0 || !payee) continue;
    out.push({ source, date, amount: -amount, payee });
  }
  return out;
}

// Bis wann sind Auszuege eingelesen (je Bank)?
export function importedUntil(data) {
  const until = {};
  for (const fp of data.imported || []) {
    const [source, date] = String(fp).split('|');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '') && (!until[source] || date > until[source])) until[source] = date;
  }
  return until;
}

function groupKey(source, payee) {
  return `${source}|${payee}`;
}

function byPayee(debits) {
  const groups = new Map();
  for (const d of debits) {
    const key = groupKey(d.source, d.payee);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return groups;
}

// Buchungen eines Empfaengers nach Betrag buendeln (eine Versicherung kann
// Haftpflicht und Hausrat getrennt abbuchen).
function clusters(debits, tolerance) {
  const sorted = [...debits].sort((a, b) => a.amount - b.amount);
  const out = [];
  for (const d of sorted) {
    const c = out.find((x) => Math.abs(d.amount - x.ref) <= x.ref * tolerance);
    if (c) c.items.push(d);
    else out.push({ ref: d.amount, items: [d] });
  }
  return out.map((c) => c.items.sort((a, b) => a.date.localeCompare(b.date)));
}

function rhythm(items) {
  const dates = [...new Set(items.map((i) => i.date))];
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  const classes = gaps.map((g) => GAPS.find((x) => g >= x.min && g <= x.max)?.months || 0);
  const counts = {};
  classes.forEach((c) => { if (c) counts[c] = (counts[c] || 0) + 1; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const months = Number(best[0]);
  if (best[1] / gaps.length < 2 / 3) return null;
  // Monatlich braucht drei Abbuchungen, sonst reichen zwei.
  if (months === 1 && dates.length < 3) return null;
  return months;
}

// Vorschlaege: regelmaessig, fester Betrag, noch nicht entschieden.
export function detectRecurring(data, { today = todayISO() } = {}) {
  const decided = data.recurring || [];
  const learned = data.learned || {};
  const labels = data.payeeLabels || {};
  const found = [];
  for (const [key, debits] of byPayee(importedDebits(data))) {
    const contract = ['bills', 'subscription', 'debts', 'savings'].includes(learned[debits[0].payee]?.section);
    for (const items of clusters(debits, contract ? CONTRACT_AMOUNT : 0)) {
      const months = rhythm(items);
      if (!months) continue;
      // Ein Laden mit vielen anderen Abbuchungen ist kein Vertrag.
      if (!contract && (debits.length - items.length) * 2 > items.length) continue;
      const last = items[items.length - 1];
      // Seit mehr als anderthalb Rhythmen nichts mehr: vermutlich gekuendigt.
      if (daysBetween(last.date, today) > months * 30.5 * 1.5 + 10) continue;
      const taken = decided.some((r) => r.key === key && Math.abs(r.amount - last.amount) <= last.amount * MATCH_AMOUNT);
      if (taken) continue;
      found.push({
        key,
        source: last.source,
        payee: last.payee,
        name: labels[last.payee] || prettyName(last.payee),
        amount: last.amount,
        interval: intervalId(months),
        last: last.date,
        count: items.length,
      });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function prettyName(payee) {
  return payee.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// Letzte Abbuchung eines bestaetigten Eintrags laut Auszuegen.
function lastSeen(item, groups) {
  const debits = groups.get(item.key) || [];
  const matching = debits.filter((d) => Math.abs(d.amount - item.amount) <= item.amount * MATCH_AMOUNT);
  if (!matching.length) return null;
  return matching.sort((a, b) => a.date.localeCompare(b.date))[matching.length - 1];
}

// Naechste Abbuchung je bestaetigtem Eintrag.
export function scheduled(data) {
  const groups = byPayee(importedDebits(data));
  return (data.recurring || []).filter((r) => r.status === 'on').map((r) => {
    if (r.manual) return { ...r, next: r.next, lastDate: null, lastAmount: null };
    const seen = lastSeen(r, groups);
    const from = seen?.date || r.last;
    return {
      ...r,
      amount: seen?.amount ?? r.amount,
      lastDate: seen?.date || r.last || null,
      next: from ? addMonthsToDate(from, intervalMonths(r.interval)) : null,
    };
  });
}

// Was geht im Monat `key` noch ab? Alles mit naechster Abbuchung bis
// Monatsende, auch Ueberfaelliges (vielleicht noch nicht eingelesen).
// Schon in diesem Monat Abgebuchtes steht getrennt.
export function dueThisMonth(data, { today = todayISO() } = {}) {
  const key = monthKey(today);
  const end = addMonthsToDate(`${key}-01`, 1);
  const all = scheduled(data);
  const open = all.filter((r) => r.next && r.next < end).sort((a, b) => a.next.localeCompare(b.next));
  const done = all.filter((r) => r.lastDate && r.lastDate.startsWith(key) && !(r.next && r.next < end));
  return {
    key,
    open,
    done,
    openSum: open.reduce((s, r) => s + r.amount, 0),
    doneSum: done.reduce((s, r) => s + r.amount, 0),
  };
}

// --- Aenderungen (rein, ohne Oberflaeche) ---------------------------------

export function confirmSuggestion(data, suggestion, status = 'on') {
  data.recurring = data.recurring || [];
  data.recurring.push({
    id: newId(),
    key: suggestion.key,
    name: suggestion.name,
    amount: suggestion.amount,
    interval: suggestion.interval,
    last: suggestion.last,
    status,
  });
}

export function addManual(data, { name, amount, interval, next }) {
  data.recurring = data.recurring || [];
  data.recurring.push({ id: newId(), manual: true, name, amount, interval, next, status: 'on' });
}

// Von Hand eingetragen: "ist abgebucht" schiebt auf den naechsten Termin.
export function markPaid(data, id) {
  const r = (data.recurring || []).find((x) => x.id === id);
  if (r?.manual && r.next) r.next = addMonthsToDate(r.next, intervalMonths(r.interval));
}
