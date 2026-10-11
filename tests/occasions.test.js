// Tests fuer Anlaesse. Namen und Daten erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, nextYearly, upcomingOccasions } from '../src/occasions.js';

test('Ostersonntag', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2038), '2038-04-25');
});

test('Jaehrliches Datum: dieses oder naechstes Jahr, 29.02. im Nicht-Schaltjahr', () => {
  assert.equal(nextYearly('10-23', '2026-10-11'), '2026-10-23');
  assert.equal(nextYearly('03-11', '2026-10-11'), '2027-03-11');
  assert.equal(nextYearly('10-11', '2026-10-11'), '2026-10-11');
  assert.equal(nextYearly('02-29', '2026-10-11'), '2027-02-28');
  assert.equal(nextYearly('02-29', '2027-10-11'), '2028-02-29');
});

const DATA = {
  occasions: [
    { id: 'a', kind: 'birthday', name: 'Kind A', day: '10-30', lead: 21, note: 'Kuchen' },
    { id: 'b', kind: 'birthday', name: 'Kind B', day: '03-01', lead: 21, note: '' },
    { id: 'c', kind: 'period', name: 'Herbstferien', from: '2026-10-12', to: '2026-10-23', lead: 7, note: 'Mittagessen' },
    { id: 'd', kind: 'period', name: 'Vorbei', from: '2026-08-01', to: '2026-08-10', lead: 7 },
  ],
};

test('Anstehende Anlaesse mit Vorlauf', () => {
  const list = upcomingOccasions(DATA, { today: '2026-10-11', horizon: 366 });
  assert.deepEqual(list.map((o) => [o.name, o.date, o.daysLeft, o.soon]), [
    ['Herbstferien', '2026-10-12', 1, true],
    ['Kind A', '2026-10-30', 19, true],
    ['Nikolaus', '2026-12-06', 56, false],
    ['Weihnachten', '2026-12-24', 74, false],
    ['Silvester', '2026-12-31', 81, false],
    ['Kind B', '2027-03-01', 141, false],
    ['Ostern', '2027-03-28', 168, false],
  ]);
});

test('Laufende Ferien bleiben sichtbar, ausgeschaltete Feiertage nicht', () => {
  const list = upcomingOccasions({ ...DATA, holidaysOff: ['nikolaus', 'silvester'] }, { today: '2026-10-20', horizon: 70 });
  const ferien = list.find((o) => o.id === 'c');
  assert.equal(ferien.running, true);
  assert.equal(ferien.soon, true);
  assert.equal(ferien.daysLeft, 0);
  assert.ok(!list.some((o) => o.id === 'nikolaus' || o.id === 'silvester'));
  assert.ok(list.some((o) => o.id === 'weihnachten'));
});

test('Ohne eigene Anlaesse: nur Feiertage', () => {
  const list = upcomingOccasions({}, { today: '2026-11-20', horizon: 40 });
  assert.deepEqual(list.map((o) => [o.id, o.soon]), [['nikolaus', true], ['weihnachten', true]]);
});
