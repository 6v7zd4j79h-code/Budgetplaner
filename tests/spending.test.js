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

test('Gruende fuer Unnoetiges: Summen pro Grund, offene zaehlen', async () => {
  const { monthWaste } = await import('../src/waste.js');
  const log = [
    { id: 'a', date: '2026-10-05', lineId: 'food', note: 'EDEKA', amount: 900, items: [
      { id: '1', name: 'Schokolade', amount: 199, waste: true, why: 'need' },
      { id: '2', name: 'Special Joghurt', amount: 129, waste: true, why: 'try' },
      { id: '3', name: 'Chips', amount: 179, waste: true },
      { id: '4', name: 'Milch', amount: 119 }] },
    { id: 'b', date: '2026-10-07', lineId: 'out', note: 'Lieferando', amount: 2500, waste: true, why: 'need' },
  ];
  const w = monthWaste(log, '2026-10');
  assert.deepEqual(w.byWhy.map((r) => [r.id, r.count, r.amount]), [['need', 2, 2699], ['try', 1, 129]]);
  assert.equal(w.open, 1);
  assert.equal(w.items.find((i) => i.name === 'Chips').ref, 'a:3');
  assert.equal(w.items.find((i) => i.whole).ref, 'b');
});

test('Erinnerung am Monatsende: nur mit offenen Gruenden, wegklickbar', async () => {
  const { wasteReminder } = await import('../src/waste.js');
  const log = [{ id: 'a', date: '2026-10-05', amount: 199, items: [{ id: '1', name: 'Chips', amount: 199, waste: true }] }];
  assert.equal(wasteReminder(log, { today: '2026-10-15' }), null); // Monatsmitte
  assert.deepEqual(wasteReminder(log, { today: '2026-10-29' }), { month: '2026-10', open: 1 });
  assert.deepEqual(wasteReminder(log, { today: '2026-11-03' }), { month: '2026-10', open: 1 });
  assert.equal(wasteReminder(log, { today: '2026-11-03', off: { '2026-10': true } }), null);
  assert.equal(wasteReminder(log, { today: '2026-11-09' }), null);
  log[0].items[0].why = 'impulse';
  assert.equal(wasteReminder(log, { today: '2026-10-30' }), null);
});

test('Wofuer eingekauft: jeder Artikel einmal, Rest ist Verbrauch nach Kategorie', async () => {
  const { monthUse } = await import('../src/spending.js');
  const log = [
    { id: 'a', date: '2026-10-05', lineId: 'food', amount: 2000, items: [
      { id: '1', name: 'Schmand', amount: 238, qty: 2, meal: true },
      { id: '2', name: 'Joghurt', amount: 294, qty: 6 },
      { id: '3', name: 'Zahnpasta', amount: 195, lineId: 'drug' },
      { id: '4', name: 'Schokolade', amount: 199, waste: true, meal: true },
      { id: '5', name: 'Pralinen', amount: 399, gift: true, waste: true },
      { id: '6', name: 'Nudeln', amount: 396, stock: true, deal: true },
      { id: '7', name: 'Pfand', amount: -25 }] },
    { id: 'b', date: '2026-10-06', lineId: 'tank', amount: 5000 }, // ohne Artikel: zaehlt nicht
  ];
  const u = monthUse(log, '2026-10', { food: 'Lebensmittel', drug: 'Drogerie' });
  assert.equal(u.total, 238 + 294 + 195 + 199 + 399 + 396);
  assert.equal(u.deal, 396);
  assert.deepEqual(u.rows.map((r) => [r.id, r.amount]), [['use', 489], ['meal', 238], ['stock', 396], ['gift', 399], ['waste', 199]]);
  assert.deepEqual(u.use.byLine, [{ name: 'Lebensmittel', amount: 294 }, { name: 'Drogerie', amount: 195 }]);
  assert.deepEqual(u.use.items.map((i) => [i.name, i.pieces]), [['Joghurt', 6], ['Zahnpasta', 1]]);
});
