// Tests fuer "fuer wen" und "im Angebot / auf Vorrat". Betraege erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDeals, monthForWhom, peopleOf } from '../src/spending.js';

const LOG = [
  { id: '1', date: '2026-10-02', amount: 4000, forWhom: 'Kinder', note: 'Schuhe' },
  { id: '2', date: '2026-10-03', amount: 1500, forWhom: 'mich', note: 'Friseur' },
  { id: '3', date: '2026-10-05', amount: 2500, forWhom: 'Kinder', note: 'Schwimmkurs' },
  { id: '4', date: '2026-10-06', amount: 3000, note: 'ALDI SÜD', items: [
    { id: 'a', name: 'Hackfleisch', amount: 899, deal: true, stock: true },
    { id: 'b', name: 'Butter', amount: 229, deal: true },
    { id: 'c', name: 'Milch', amount: 119 },
  ] },
  { id: '5', date: '2026-09-30', amount: 999, forWhom: 'mich', note: 'Vormonat' },
];

test('Fuer wen: Summen pro Person, Rest nicht zugeordnet, nur der Monat', () => {
  const f = monthForWhom(LOG, '2026-10', peopleOf({}));
  assert.equal(f.total, 11000);
  assert.equal(f.open, 3000);
  assert.deepEqual(f.rows, [{ person: 'Kinder', amount: 6500 }, { person: 'mich', amount: 1500 }]);
});

test('Eigene Personenliste, entfernte Person zaehlt weiter', () => {
  assert.deepEqual(peopleOf({ people: ['Lena', 'Tom'] }), ['Lena', 'Tom']);
  const f = monthForWhom(LOG, '2026-10', ['Lena']);
  assert.deepEqual(f.rows.map((r) => r.person), ['Kinder', 'mich']);
});

test('Im Angebot und auf Vorrat', () => {
  const d = monthDeals(LOG, '2026-10');
  assert.equal(d.deal, 1128);
  assert.equal(d.stock, 899);
  assert.deepEqual(d.items.map((i) => i.name), ['Hackfleisch', 'Butter']);
});
