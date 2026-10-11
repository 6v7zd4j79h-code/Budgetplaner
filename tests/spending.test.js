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

test('Einzelne Artikel mit eigener Person, Geschenke', async () => {
  const { monthGifts } = await import('../src/spending.js');
  const log = [
    { id: 'x', date: '2026-10-08', amount: 5000, forWhom: 'Familie', note: 'ALDI SÜD', items: [
      { id: '1', name: 'Kinderjacke', amount: 1999, forWhom: 'Kinder', deal: true },
      { id: '2', name: 'Lego', amount: 1499, forWhom: 'Kinder', gift: true },
      { id: '3', name: 'Milch', amount: 119 },
    ] },
    { id: 'y', date: '2026-10-09', amount: 3000, note: 'Online-Bestellung', gift: true, forWhom: 'Partner' },
    { id: 'z', date: '2026-10-10', amount: 800, note: 'REWE', items: [{ id: '4', name: 'Socken', amount: 500, forWhom: 'mich' }] },
  ];
  const f = monthForWhom(log, '2026-10', peopleOf({}));
  assert.deepEqual(f.rows, [
    { person: 'Kinder', amount: 3498 },
    { person: 'Partner', amount: 3000 },
    { person: 'Familie', amount: 1502 },
    { person: 'mich', amount: 500 },
  ]);
  assert.equal(f.open, 300);

  const g = monthGifts(log, '2026-10');
  assert.equal(g.total, 4499);
  assert.deepEqual(g.items.map((i) => [i.name, i.forWhom]), [['Online-Bestellung', 'Partner'], ['Lego', 'Kinder']]);
});

test('Spezielle Ernaehrung: Vorschlag aus dem Namen und Monatsuebersicht', async () => {
  const { guessDiet, monthDiet } = await import('../src/spending.js');
  assert.equal(guessDiet('Protein Riegel Cookie'), 'protein');
  assert.equal(guessDiet('Glutenfreie Nudeln'), 'glutenfrei');
  assert.equal(guessDiet('Nudeln glutenfrei'), 'glutenfrei');
  assert.equal(guessDiet('Milch laktosefrei'), 'laktosefrei');
  assert.equal(guessDiet('Butter'), null);
  const d = monthDiet([
    { id: '1', date: '2026-10-02', amount: 900, note: 'dm', items: [
      { id: 'a', name: 'Proteinriegel', amount: 199, diet: 'protein' },
      { id: 'b', name: 'Proteinriegel', amount: 199, diet: 'protein' },
      { id: 'c', name: 'Brot glutenfrei', amount: 349, diet: 'glutenfrei' },
      { id: 'd', name: 'Butter', amount: 153 },
    ] },
  ], '2026-10');
  assert.equal(d.total, 747);
  assert.deepEqual(d.rows.map((r) => [r.name, r.amount]), [['Protein / Sport', 398], ['Glutenfrei', 349]]);
});
