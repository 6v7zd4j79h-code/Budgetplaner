// Feste Abbuchungen erkennen - nur erfundene Betraege.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addManual, addMonthsToDate, confirmSuggestion, detectRecurring, dueThisMonth, markPaid } from '../src/recurring.js';

const fp = (source, date, cents, payee) => `${source}|${date}|${-cents}|${payee}`;

function data(imported) {
  return { version: 1, months: {}, log: [], subscriptions: [], goals: [], imported, learned: {}, payeeLabels: {} };
}

test('Datum plus Monate bleibt im kuerzeren Monat', () => {
  assert.equal(addMonthsToDate('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsToDate('2025-12-01', 12), '2026-12-01');
  assert.equal(addMonthsToDate('2026-11-15', 3), '2027-02-15');
});

test('jaehrlich, vierteljaehrlich und monatlich werden erkannt, Laeden nicht', () => {
  const d = data([
    // Versicherung jaehrlich, mit Preiserhoehung
    fp('Sparkasse', '2024-12-02', 8500, 'muster versicherung'),
    fp('Sparkasse', '2025-12-01', 8900, 'muster versicherung'),
    fp('Sparkasse', '2026-02-15', 4500, 'wasserwerk'),
    fp('Sparkasse', '2026-05-15', 4500, 'wasserwerk'),
    fp('Sparkasse', '2026-08-14', 4500, 'wasserwerk'),
    fp('Sparkasse', '2026-08-03', 1299, 'streamingdienst'),
    fp('Sparkasse', '2026-09-03', 1299, 'streamingdienst'),
    fp('Sparkasse', '2026-10-03', 1299, 'streamingdienst'),
    // Tankstelle: wechselnde Betraege, mehrmals im Monat
    fp('Sparkasse', '2026-09-02', 6012, 'tankstelle'),
    fp('Sparkasse', '2026-09-20', 4870, 'tankstelle'),
    fp('Sparkasse', '2026-10-02', 6050, 'tankstelle'),
    fp('Sparkasse', '2026-10-25', 3900, 'tankstelle'),
    fp('Sparkasse', '2026-11-02', 6030, 'tankstelle'),
    // Eingang zaehlt nicht
    'Sparkasse|2026-10-01|250000|arbeitgeber',
  ]);
  d.payeeLabels['muster versicherung'] = 'Muster Versicherung AG';
  d.learned['muster versicherung'] = { section: 'bills', name: 'Versicherungen' };
  const found = detectRecurring(d, { today: '2026-11-17' });
  assert.deepEqual(found.map((f) => [f.name, f.interval, f.amount]), [
    ['Muster Versicherung AG', 'yearly', 8900],
    ['Streamingdienst', 'monthly', 1299],
    ['Wasserwerk', 'quarterly', 4500],
  ]);

  for (const f of found) confirmSuggestion(d, f);
  assert.equal(detectRecurring(d, { today: '2026-11-17' }).length, 0, 'bestaetigte kommen nicht wieder');

  const due = dueThisMonth(d, { today: '2026-11-17' });
  // Versicherung am 01.12. -> nicht im November. Wasser am 14.11. (noch nicht
  // eingelesen), Streaming am 03.11. (noch nicht eingelesen).
  assert.deepEqual(due.open.map((r) => [r.name, r.next]), [
    ['Streamingdienst', '2026-11-03'],
    ['Wasserwerk', '2026-11-14'],
  ]);
  assert.equal(due.openSum, 5799);

  // Neuer Auszug: Streaming ist abgebucht -> raus aus "offen", rein in "schon abgebucht".
  d.imported.push(fp('Sparkasse', '2026-11-03', 1399, 'streamingdienst'));
  const after = dueThisMonth(d, { today: '2026-11-17' });
  assert.deepEqual(after.open.map((r) => r.name), ['Wasserwerk']);
  assert.deepEqual(after.done.map((r) => [r.name, r.amount]), [['Streamingdienst', 1399]]);

  // Dezember: Versicherung faellig.
  const dec = dueThisMonth(d, { today: '2026-12-01' });
  assert.ok(dec.open.some((r) => r.name === 'Muster Versicherung AG' && r.next === '2026-12-01'));
});

test('abgelehnte bleiben weg, gekuendigte werden nicht vorgeschlagen', () => {
  const d = data([
    fp('PayPal', '2025-01-10', 999, 'altabo'),
    fp('PayPal', '2025-02-10', 999, 'altabo'),
    fp('PayPal', '2025-03-10', 999, 'altabo'),
    fp('PayPal', '2026-08-10', 500, 'verein'),
    fp('PayPal', '2026-09-10', 500, 'verein'),
    fp('PayPal', '2026-10-10', 500, 'verein'),
  ]);
  const found = detectRecurring(d, { today: '2026-11-17' });
  assert.deepEqual(found.map((f) => f.payee), ['verein']);
  confirmSuggestion(d, found[0], 'off');
  assert.equal(detectRecurring(d, { today: '2026-11-17' }).length, 0);
  assert.equal(dueThisMonth(d, { today: '2026-11-17' }).open.length, 0);
});

test('von Hand eingetragen: faellig und weiterschieben', () => {
  const d = data([]);
  addManual(d, { name: 'Kfz-Steuer', amount: 12000, interval: 'yearly', next: '2026-11-28' });
  const due = dueThisMonth(d, { today: '2026-11-17' });
  assert.deepEqual(due.open.map((r) => [r.name, r.next]), [['Kfz-Steuer', '2026-11-28']]);
  markPaid(d, d.recurring[0].id);
  assert.equal(d.recurring[0].next, '2027-11-28');
  assert.equal(dueThisMonth(d, { today: '2026-11-17' }).open.length, 0);
});
