// Tests fuer die Auswertung regelmaessiger Einkaeufe. Alle Preise erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { regularItems, shopName } from '../src/shopping.js';

const item = (name, amount) => ({ id: `${name}-${amount}`, name, amount, waste: false });

const LOG = [
  { id: 'a', date: '2026-09-05', note: 'REWE Markt GmbH Neustadt', amount: 1200, items: [item('Butter', 229), item('Bio Vollmilch 3,8%', 119), item('Bio Vollmilch 3,8%', 119), item('Pfand', 25)] },
  { id: 'b', date: '2026-09-12', note: 'REWE', amount: 900, items: [item('BUTTER', 229), item('Bananen', 149)] },
  { id: 'c', date: '2026-09-19', note: 'Lidl', amount: 700, items: [item('Butter', 179), item('Bio Vollmilch 3,8 %', 109)] },
  { id: 'd', date: '2026-09-26', note: 'REWE', amount: 500, items: [item('Butter', 229)] },
  // Ohne Artikel: zaehlt nicht.
  { id: 'e', date: '2026-09-27', note: 'Tankstelle', amount: 6000 },
  // Zu alt fuer den Zeitraum.
  { id: 'f', date: '2025-01-10', note: 'REWE', amount: 300, items: [item('Butter', 199)] },
];

test('Laden aus Kontoauszug-Text und Bon vereinheitlichen', () => {
  assert.equal(shopName('REWE Markt GmbH Neustadt'), 'REWE');
  assert.equal(shopName('LIDL DIENSTLEISTUNG'), 'LIDL');
  assert.equal(shopName(''), 'Unbekannt');
});

test('Regelmaessige Artikel: Anzahl, Rhythmus, letzter Preis', () => {
  const r = regularItems(LOG, { today: '2026-10-10' });
  assert.equal(r.receipts, 4);
  assert.deepEqual(r.items.map((i) => [i.name, i.count]), [['Butter', 4], ['Bio Vollmilch 3,8 %', 2]]);

  const butter = r.items[0];
  assert.equal(butter.everyDays, 7);
  assert.equal(butter.lastPrice, 229);
  assert.equal(butter.lastShop, 'REWE');
  assert.deepEqual(butter.shops, [{ shop: 'REWE', count: 3, lastPrice: 229 }, { shop: 'LIDL', count: 1, lastPrice: 179 }]);
  assert.deepEqual(butter.cheaper, { shop: 'LIDL', price: 179, saving: 50, usual: 'REWE' });

  // Zwei Packungen in einem Einkauf zaehlen als ein Einkauf, aber zwei Stueck.
  const milk = r.items[1];
  assert.equal(milk.pieces, 3);
  assert.equal(milk.shops.find((s) => s.shop === 'REWE').count, 1);
});

test('Pfand, Einmalkaeufe und alte Bons zaehlen nicht als regelmaessig', () => {
  const r = regularItems(LOG, { today: '2026-10-10' });
  assert.ok(!r.items.some((i) => /pfand|bananen/i.test(i.name)));
  assert.equal(r.articles, 3); // Butter, Milch, Bananen
  assert.equal(r.from, '2026-05-01');
  assert.deepEqual(r.shops.map((s) => [s.shop, s.receipts]), [['REWE', 3], ['LIDL', 1]]);
});

test('Ohne Bons: leere Auswertung', () => {
  const r = regularItems([], { today: '2026-10-10' });
  assert.equal(r.receipts, 0);
  assert.deepEqual(r.items, []);
});
