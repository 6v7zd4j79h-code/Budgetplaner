// Konten im Budget: Kontostaende, Dispo, Filter nach Konto, Dispo-Sparziel.

import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyData, monthSummary, monthFromPrevious } from '../src/budget.js';
import { ALL, accountId, balancesSummary, openingSum, overdraftRoom, resolveGoal, viewFor } from '../src/accounts.js';

const line = (id, budget, extra = {}) => ({ id, name: id, budget, actual: null, done: false, ...extra });

function book() {
  const data = emptyData();
  data.accounts = [
    { id: 'spk', name: 'Sparkasse', overdraft: 450000, balance: -303140, balanceDate: '2026-09-01', openings: { '2026-10': -100000 } },
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
  assert.equal(overdraftRoom({ balance: -303140, overdraft: 450000 }), 146860);
  const s = balancesSummary(book().accounts);
  assert.equal(s.total, -301640);
  assert.equal(s.overdraftUsed, 303140);
  const withKlarna = balancesSummary([...book().accounts, { id: 'k', name: 'Klarna', overdraft: 0, balance: -441394 }]);
  assert.equal(withKlarna.overdraftUsed, 303140);
  assert.equal(withKlarna.otherDebt, 441394);
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
