// Tests der Rechenlogik - laufen ohne Browser und ohne Netz.
//
//   npm test
//
// Geprueft wird das, wo ein Fehler wirklich wehtut: falsch gelesene Betraege,
// falsch gerechnete Restbetraege und falsch umgerechnete Abos.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMoney, formatCents, centsToInput } from '../src/money.js';
import { addMonths, monthLabel } from '../src/dates.js';
import {
  emptyData,
  ensureMonth,
  monthFromPrevious,
  sectionTotals,
  monthSummary,
  startBalanceFor,
  lineActual,
  distribution,
  subscriptionMonthly,
  subscriptionSummary,
  goalProgress,
  goalRemaining,
  validateData,
} from '../src/budget.js';

function row(id, budget, extra = {}) {
  return { id, name: id, budget, actual: null, done: false, ...extra };
}

function month(lines, startBalance = null) {
  return {
    startBalance,
    lines: { income: [], bills: [], expenses: [], savings: [], debts: [], ...lines },
  };
}

// --- Betraege lesen und anzeigen ------------------------------------------

test('Betraege werden so gelesen, wie man sie tippt', () => {
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('12.50'), 1250);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1.234'), 123400);
  assert.equal(parseMoney('1234'), 123400);
  assert.equal(parseMoney('€ 9,99'), 999);
  assert.equal(parseMoney('0,1'), 10);
  assert.equal(parseMoney('-5'), -500);
});

test('leere oder unsinnige Eingaben werden nicht zu 0', () => {
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('   '), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('1,2,3'), null);
  assert.equal(parseMoney('.'), null);
});

test('Cent-Rechnung kennt keine Rundungsfehler', () => {
  assert.equal(parseMoney('0,10') + parseMoney('0,20'), parseMoney('0,30'));
});

test('Anzeige im deutschen Format', () => {
  assert.equal(formatCents(123456).replace(/ /g, ' '), '1.234,56 €');
  assert.equal(formatCents(123456, { round: true }).replace(/ /g, ' '), '1.235 €');
  assert.equal(centsToInput(1250), '12,50');
  assert.equal(centsToInput(1200), '12');
  assert.equal(centsToInput(-5), '-0,05');
  assert.equal(centsToInput(null), '');
});

// --- Datum ------------------------------------------------------------------

test('Monate springen sauber ueber den Jahreswechsel', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', 15), '2028-01');
  assert.equal(monthLabel('2026-03'), 'März 2026');
});

// --- Ist-Werte --------------------------------------------------------------

test('abgehakte Rechnung zaehlt mit dem Budget, eingetragener Betrag hat Vorrang', () => {
  assert.equal(lineActual(row('a', 3000)), 0);
  assert.equal(lineActual(row('a', 3000, { done: true })), 3000);
  assert.equal(lineActual(row('a', 3000, { done: true, actual: 2800 })), 2800);
  assert.equal(lineActual(row('a', 3000, { actual: 0, done: true })), 0);
});

test('Ausgaben-Ist kommt aus dem Log, nur aus dem richtigen Monat', () => {
  const m = month({ expenses: [row('food', 40000), row('fuel', 10000)] });
  const log = [
    { id: '1', date: '2026-10-02', lineId: 'food', amount: 5000 },
    { id: '2', date: '2026-10-15', lineId: 'food', amount: 2550 },
    { id: '3', date: '2026-10-20', lineId: 'fuel', amount: 6000 },
    { id: '4', date: '2026-09-30', lineId: 'food', amount: 99999 },
    { id: '5', date: '2026-10-21', lineId: 'geloescht', amount: 1000 },
  ];
  const totals = sectionTotals(m, log, '2026-10');
  assert.deepEqual(totals.expenses, { budget: 50000, actual: 5000 + 2550 + 6000 + 1000 });
});

test('verfuegbarer Betrag = Start + Einkommen - alle Abgaenge', () => {
  const data = emptyData();
  data.months['2026-10'] = month({
    income: [row('gehalt', 298000, { done: true }), row('kleinanz', 8500, { actual: 8500 })],
    bills: [row('miete', 75000, { done: true }), row('strom', 20000, { done: true, actual: 17000 })],
    expenses: [row('food', 40000)],
    savings: [row('notgroschen', 10000, { done: true })],
    debts: [row('kredit', 18500)],
  }, 31000);
  data.log.push({ id: 'x', date: '2026-10-05', lineId: 'food', amount: 12345 });

  const s = monthSummary(data, '2026-10');
  assert.equal(s.start, 31000);
  assert.equal(s.availableBudget, 31000 + 298000 + 8500 - 75000 - 20000 - 40000 - 10000 - 18500);
  assert.equal(s.availableActual, 31000 + 298000 + 8500 - 75000 - 17000 - 12345 - 10000 - 0);
});

test('Startbetrag wird aus dem Vormonat uebernommen, auch ueber mehrere Monate', () => {
  const data = emptyData();
  data.months['2026-09'] = month({ income: [row('g', 100000, { done: true })], bills: [row('m', 60000, { done: true })] }, 5000);
  data.months['2026-10'] = month({ income: [row('g', 100000, { done: true })], bills: [row('m', 60000, { done: true })] });
  data.months['2026-11'] = month({});
  assert.equal(startBalanceFor(data, '2026-09'), 5000);
  assert.equal(startBalanceFor(data, '2026-10'), 45000);
  assert.equal(startBalanceFor(data, '2026-11'), 85000);
});

test('eigener Startbetrag ueberschreibt den Uebertrag, Luecke unterbricht die Kette', () => {
  const data = emptyData();
  data.months['2026-09'] = month({ income: [row('g', 100000, { done: true })] });
  data.months['2026-10'] = month({}, 123);
  data.months['2027-01'] = month({});
  assert.equal(startBalanceFor(data, '2026-10'), 123);
  assert.equal(startBalanceFor(data, '2027-01'), 0);
});

test('neuer Monat uebernimmt Zeilen und IDs, aber keine Haken und Ist-Werte', () => {
  const prev = month({ bills: [row('miete', 75000, { done: true, actual: 74000 })] }, 999);
  const next = monthFromPrevious(prev);
  assert.deepEqual(next.lines.bills, [{ id: 'miete', name: 'miete', budget: 75000, actual: null, done: false }]);
  assert.equal(next.startBalance, null);
  // Der Vormonat bleibt unberuehrt.
  assert.equal(prev.lines.bills[0].done, true);
});

test('ensureMonth legt einen fehlenden Monat einmal an und laesst vorhandene in Ruhe', () => {
  const data = emptyData();
  assert.equal(ensureMonth(data, '2026-10'), true);
  assert.ok(data.months['2026-10'].lines.bills.length > 0);
  data.months['2026-10'].lines.bills[0].budget = 4200;
  assert.equal(ensureMonth(data, '2026-10'), false);
  assert.equal(ensureMonth(data, '2026-12'), true);
  assert.equal(data.months['2026-12'].lines.bills[0].budget, 4200);
});

test('Verteilung laesst leere Bereiche weg', () => {
  const totals = {
    income: { budget: 0, actual: 0 },
    bills: { budget: 0, actual: 100 },
    expenses: { budget: 0, actual: 0 },
    savings: { budget: 0, actual: 50 },
    debts: { budget: 0, actual: -10 },
  };
  assert.deepEqual(distribution(totals).map((p) => p.id), ['bills', 'savings']);
});

// --- Abos ---------------------------------------------------------------------

test('Abos werden auf den Monat umgerechnet', () => {
  assert.equal(subscriptionMonthly({ amount: 1499, interval: 'monthly' }), 1499);
  assert.equal(subscriptionMonthly({ amount: 3000, interval: 'quarterly' }), 1000);
  assert.equal(subscriptionMonthly({ amount: 6900, interval: 'yearly' }), 575);
  assert.equal(subscriptionMonthly({ amount: 1000, interval: 'yearly' }), 83);
});

test('Abo-Uebersicht summiert nur aktive Abos, nach Kategorie', () => {
  const s = subscriptionSummary([
    { amount: 1499, interval: 'monthly', category: 'Unterhaltung' },
    { amount: 999, interval: 'monthly', category: 'Unterhaltung' },
    { amount: 3900, interval: 'yearly', category: 'Geschäft' },
    { amount: 5000, interval: 'monthly', category: 'Geschäft', active: false },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.byCategory['Unterhaltung'], 2498);
  assert.equal(s.byCategory['Geschäft'], 325);
  assert.equal(s.monthly, 2498 + 325);
  assert.equal(s.yearly, (1499 + 999) * 12 + 3900);
});

// --- Sparziele -------------------------------------------------------------------

test('Sparziel-Fortschritt bleibt zwischen 0 und 100 Prozent', () => {
  assert.equal(goalProgress({ target: 100000, saved: 46500 }), 0.465);
  assert.equal(goalProgress({ target: 100000, saved: 200000 }), 1);
  assert.equal(goalProgress({ target: 0, saved: 100 }), 0);
  assert.equal(goalRemaining({ target: 100000, saved: 46500 }), 53500);
  assert.equal(goalRemaining({ target: 100, saved: 500 }), 0);
});

// --- Sicherung ----------------------------------------------------------------------

test('Sicherung wird vor dem Import geprueft', () => {
  const good = emptyData();
  ensureMonth(good, '2026-10');
  assert.equal(validateData(JSON.parse(JSON.stringify(good))), null);
  assert.match(validateData(null), /keine Budgetdaten/);
  assert.match(validateData({ ...good, version: 2 }), /unbekannten Version/);
  assert.match(validateData({ ...good, log: 'kaputt' }), /log/);
  assert.match(validateData({ ...good, log: [{ date: 'gestern', amount: 1 }] }), /Buchung/);
  assert.match(validateData({ ...good, months: { 'Okt': {} } }), /beschädigt/);
});
