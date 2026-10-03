// Die gesamte Rechenlogik. Keine Oberflaeche, kein Speicher - dadurch laesst
// sich alles mit `npm test` pruefen.
//
// Aufbau eines Monats:
//   { startBalance: Cent | null, lines: { income: [...], bills: [...], ... } }
// Eine Zeile:
//   { id, name, budget: Cent, actual: Cent | null, done: boolean }
//
// startBalance null heisst: automatisch der Ist-Restbetrag des Vormonats.
// Ausgaben haben kein eigenes Ist-Feld, ihr Ist ist die Summe der
// Buchungen im Ausgaben-Log.

import { addMonths } from './dates.js';

export const SECTIONS = [
  { id: 'income', label: 'Einkommen', sign: 1 },
  { id: 'bills', label: 'Rechnungen', sign: -1 },
  { id: 'expenses', label: 'Ausgaben', sign: -1 },
  { id: 'savings', label: 'Ersparnisse', sign: -1 },
  { id: 'debts', label: 'Schulden', sign: -1 },
];

export const OUTGOING = SECTIONS.filter((s) => s.sign < 0).map((s) => s.id);

export const INTERVALS = [
  { id: 'monthly', label: 'Monatlich', months: 1 },
  { id: 'quarterly', label: 'Vierteljährlich', months: 3 },
  { id: 'halfyearly', label: 'Halbjährlich', months: 6 },
  { id: 'yearly', label: 'Jährlich', months: 12 },
];

export const SUBSCRIPTION_CATEGORIES = [
  'Unterhaltung',
  'Produktivität',
  'Geschäft',
  'Persönlichkeitsentwicklung',
  'Datenspeicher',
  'Sicherheit',
  'Sonstiges',
];

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function line(name, budget) {
  return { id: newId(), name, budget, actual: null, done: false };
}

// Startvorlage fuer den allerersten Monat - angelehnt an die Vorlage aus
// dem Video, alle Betraege auf 0, damit nichts Erfundenes im Budget steht.
export function templateMonth() {
  return {
    startBalance: null,
    lines: {
      income: [line('Gehalt', 0)],
      bills: ['Miete', 'Strom', 'Internet', 'Handyvertrag', 'Versicherungen', 'GEZ-Beitrag']
        .map((n) => line(n, 0)),
      expenses: ['Lebensmittel', 'Drogerie', 'Tanken / Fahrkarten', 'Freizeit', 'Kleidung']
        .map((n) => line(n, 0)),
      savings: [line('Notgroschen', 0)],
      debts: [],
    },
  };
}

// Neuer Monat aus dem Vormonat: gleiche Zeilen, gleiche IDs (damit Buchungen
// ihrer Kategorie treu bleiben), gleiche Budgets - aber nichts abgehakt.
export function monthFromPrevious(previous) {
  const lines = {};
  for (const { id } of SECTIONS) {
    lines[id] = (previous.lines[id] || []).map((l) => ({
      id: l.id,
      name: l.name,
      budget: l.budget,
      actual: null,
      done: false,
    }));
  }
  return { startBalance: null, lines };
}

// --- Ist-Werte -----------------------------------------------------------

export function logForMonth(log, key) {
  return log.filter((entry) => entry.date.startsWith(key));
}

export function expenseActuals(month, log, key) {
  const known = new Set(month.lines.expenses.map((l) => l.id));
  const byLine = {};
  let uncategorized = 0;
  for (const entry of logForMonth(log, key)) {
    if (known.has(entry.lineId)) byLine[entry.lineId] = (byLine[entry.lineId] || 0) + entry.amount;
    else uncategorized += entry.amount;
  }
  return { byLine, uncategorized };
}

// Ist einer Zeile: eingetragener Betrag, sonst bei Haken das Budget, sonst 0.
export function lineActual(entry) {
  if (entry.actual != null) return entry.actual;
  return entry.done ? entry.budget : 0;
}

export function sectionTotals(month, log, key) {
  const totals = {};
  const expenses = expenseActuals(month, log, key);
  for (const { id } of SECTIONS) {
    const lines = month.lines[id] || [];
    const budget = lines.reduce((sum, l) => sum + l.budget, 0);
    const actual = id === 'expenses'
      ? lines.reduce((sum, l) => sum + (expenses.byLine[l.id] || 0), 0) + expenses.uncategorized
      : lines.reduce((sum, l) => sum + lineActual(l), 0);
    totals[id] = { budget, actual };
  }
  return totals;
}

// Startbetrag eines Monats. Ohne eigenen Eintrag wird der Ist-Restbetrag des
// Vormonats uebernommen, rekursiv bis zum ersten erfassten Monat. Iterativ
// gerechnet, damit auch Jahre an Verlauf keinen Stapelueberlauf ausloesen.
export function startBalanceFor(data, key) {
  const keys = Object.keys(data.months).filter((k) => k <= key).sort();
  let carry = 0;
  let previousKey = null;
  for (const k of keys) {
    const month = data.months[k];
    // Eine Luecke von mehr als einem Monat unterbricht die Kette.
    const continuous = previousKey !== null && addMonths(previousKey, 1) === k;
    const start = month.startBalance != null ? month.startBalance : (continuous ? carry : 0);
    if (k === key) return start;
    carry = available(start, sectionTotals(month, data.log, k), 'actual');
    previousKey = k;
  }
  return 0;
}

function available(start, totals, field) {
  let result = start + totals.income[field];
  for (const id of OUTGOING) result -= totals[id][field];
  return result;
}

export function monthSummary(data, key) {
  const month = data.months[key];
  const totals = sectionTotals(month, data.log, key);
  const start = startBalanceFor(data, key);
  return {
    start,
    totals,
    availableBudget: available(start, totals, 'budget'),
    availableActual: available(start, totals, 'actual'),
  };
}

// Anteil der Ausgaben am Einkommen fuer das Ringdiagramm "Uebersicht".
export function distribution(totals, field = 'actual') {
  return OUTGOING
    .map((id) => ({ id, label: SECTIONS.find((s) => s.id === id).label, value: Math.max(0, totals[id][field]) }))
    .filter((part) => part.value > 0);
}

// --- Abos ------------------------------------------------------------------

export function intervalMonths(intervalId) {
  return (INTERVALS.find((i) => i.id === intervalId) || INTERVALS[0]).months;
}

export function subscriptionMonthly(sub) {
  return Math.round(sub.amount / intervalMonths(sub.interval));
}

export function subscriptionSummary(subscriptions) {
  const active = subscriptions.filter((s) => s.active !== false);
  const byCategory = {};
  for (const sub of active) {
    const category = sub.category || 'Sonstiges';
    byCategory[category] = (byCategory[category] || 0) + subscriptionMonthly(sub);
  }
  // Jahressumme aus den echten Betraegen, nicht aus den gerundeten Monatswerten.
  const yearly = active.reduce((sum, s) => sum + s.amount * (12 / intervalMonths(s.interval)), 0);
  return {
    monthly: active.reduce((sum, s) => sum + subscriptionMonthly(s), 0),
    yearly: Math.round(yearly),
    byCategory,
    count: active.length,
  };
}

// --- Sparziele ---------------------------------------------------------------

export function goalProgress(goal) {
  if (!goal.target || goal.target <= 0) return 0;
  return Math.max(0, Math.min(1, goal.saved / goal.target));
}

export function goalRemaining(goal) {
  return Math.max(0, (goal.target || 0) - (goal.saved || 0));
}

// --- Monat anlegen ---------------------------------------------------------------

// Liefert den Monat; fehlt er, wird er aus dem juengsten frueheren Monat
// (oder der Vorlage) angelegt. Gibt zurueck, ob etwas angelegt wurde.
export function ensureMonth(data, key) {
  if (data.months[key]) return false;
  const earlier = Object.keys(data.months).filter((k) => k < key).sort();
  const later = Object.keys(data.months).filter((k) => k > key).sort();
  const source = earlier.length
    ? data.months[earlier[earlier.length - 1]]
    : later.length ? data.months[later[0]] : null;
  data.months[key] = source ? monthFromPrevious(source) : templateMonth();
  return true;
}

export function emptyData() {
  return { version: 1, months: {}, log: [], subscriptions: [], goals: [] };
}

// Prueft eine importierte Sicherung, bevor sie die vorhandenen Daten ersetzt.
export function validateData(candidate) {
  if (!candidate || typeof candidate !== 'object') return 'Die Datei enthält keine Budgetdaten.';
  if (candidate.version !== 1) return 'Diese Sicherung stammt aus einer unbekannten Version.';
  if (!candidate.months || typeof candidate.months !== 'object') return 'Die Monatsdaten fehlen.';
  for (const field of ['log', 'subscriptions', 'goals']) {
    if (!Array.isArray(candidate[field])) return `Der Teil „${field}" fehlt oder ist beschädigt.`;
  }
  for (const [key, month] of Object.entries(candidate.months)) {
    if (!/^\d{4}-\d{2}$/.test(key) || !month || !month.lines) return `Der Monat ${key} ist beschädigt.`;
    for (const { id } of SECTIONS) {
      if (!Array.isArray(month.lines[id])) return `Im Monat ${key} fehlt der Bereich ${id}.`;
    }
  }
  for (const entry of candidate.log) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isInteger(entry.amount)) {
      return 'Eine Buchung im Ausgaben-Log ist beschädigt.';
    }
  }
  return null;
}
