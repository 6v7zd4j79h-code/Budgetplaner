// Konten im Budget: Kontostaende, Dispo, Filter nach Konto, Dispo-Sparziel.

import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyData, monthSummary, monthFromPrevious } from '../src/budget.js';
import { ALL, accountId, activeAccounts, balancesSummary, loanProgress, loansOf, loansSummary, openingSum, overdraftRoom, resolveGoal, viewFor } from '../src/accounts.js';

const line = (id, budget, extra = {}) => ({ id, name: id, budget, actual: null, done: false, ...extra });

function book() {
  const data = emptyData();
  data.accounts = [
    { id: 'spk', name: 'Sparkasse', overdraft: 400000, balance: -250000, balanceDate: '2026-09-01', openings: { '2026-10': -100000 } },
    { id: 'pp', name: 'PayPal', overdraft: 0, balance: 1500, openings: { '2026-10': 2000 } },
  ];
  data.months['2026-10'] = {
    startBalance: null,
    lines: {
      income: [line('gehalt', 300000, { accountId: 'spk', actual: 300000, done: true })],
      bills: [line('miete', 100000, { accountId: 'spk', done: true }), line('canva', 1200, { accountId: 'pp', done: true })],
      expenses: [line('essen', 40000)],
      savings: [],
      debts: [],
    },
  };
  data.log = [
    { id: 'a', date: '2026-10-02', lineId: 'essen', amount: 5000, accountId: 'spk' },
    { id: 'b', date: '2026-10-03', lineId: 'essen', amount: 700, accountId: 'pp' },
  ];
  return data;
}

test('Dispo-Spielraum ist Kontostand plus Rahmen, nicht verfuegbares Geld', () => {
  assert.equal(overdraftRoom({ balance: -250000, overdraft: 400000 }), 150000);
  const s = balancesSummary(book().accounts);
  assert.equal(s.total, -248500);
  assert.equal(s.overdraftUsed, 250000);
  const withKlarna = balancesSummary([...book().accounts, { id: 'k', name: 'Klarna', overdraft: 0, balance: -100000 }]);
  assert.equal(withKlarna.overdraftUsed, 250000);
  assert.equal(withKlarna.otherDebt, 100000);
});

test('Startbetrag aus den Kontostaenden am Monatsersten', () => {
  assert.equal(openingSum(book().accounts, '2026-10'), -98000);
  assert.equal(openingSum(book().accounts, '2026-11'), null);
});

test('Filter auf ein Konto rechnet nur dessen Zeilen, Buchungen und Startbetrag', () => {
  const view = viewFor(book(), 'spk');
  const s = monthSummary(view, '2026-10');
  assert.equal(s.start, -100000);
  assert.equal(s.totals.income.actual, 300000);
  assert.equal(s.totals.bills.actual, 100000);
  assert.equal(s.totals.expenses.actual, 5000);
  assert.equal(s.availableActual, 95000);
});

test('Alle Konten zeigt alles', () => {
  const data = book();
  assert.equal(viewFor(data, ALL).log.length, 2);
  assert.equal(viewFor(data, ALL).months['2026-10'].lines.bills.length, 2);
});

test('Dispo-Sparziel folgt dem Kontostand', () => {
  const accounts = [{ id: 'spk', name: 'Sparkasse', balance: -200000 }];
  const goal = resolveGoal({ id: 'g', name: 'Dispo ausgleichen', target: 300000, saved: 0, accountId: 'spk' }, accounts);
  assert.equal(goal.saved, 100000);
  accounts[0].balance = 5000;
  assert.equal(resolveGoal({ id: 'g', target: 300000, saved: 0, accountId: 'spk' }, accounts).saved, 300000);
});

test('Neuer Monat behaelt Konto und geschaeftlich der Zeile', () => {
  const next = monthFromPrevious(book().months['2026-10']);
  assert.equal(next.lines.bills[1].accountId, 'pp');
  const prev = { lines: { income: [], bills: [line('zoom', 1903, { business: true })], expenses: [], savings: [], debts: [] } };
  assert.equal(monthFromPrevious(prev).lines.bills[0].business, true);
});

test('Konto-ID eindeutig und nie "alle"', () => {
  assert.equal(accountId('Alle', []), 'alle-2');
  assert.equal(accountId('Sparkasse', [{ id: 'sparkasse' }]), 'sparkasse-2');
});

test('Alle Konten nimmt die Summe der Monatsanfangsstaende als Startbetrag', () => {
  assert.equal(monthSummary(viewFor(book(), ALL), '2026-10').start, -98000);
  const data = book();
  data.months['2026-10'].startBalance = 5000;
  assert.equal(monthSummary(viewFor(data, ALL), '2026-10').start, 5000);
});

test('Kredite zaehlen nicht zu den Kontostaenden, sondern eigen', () => {
  const data = book();
  data.accounts.push({ id: 'kredit', name: 'Beispielkredit', kind: 'loan', balance: -9000000, original: 10000000, rate: 50000 });
  assert.equal(balancesSummary(data.accounts).total, -248500);
  assert.ok(!activeAccounts(data).some((a) => a.id === 'kredit'));
  assert.deepEqual(loansSummary(loansOf(data)), { total: 9000000, monthly: 50000, count: 1 });
  assert.equal(Math.round(loanProgress(loansOf(data)[0]) * 100), 10);
});
