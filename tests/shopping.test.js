// Tests fuer die Auswertung regelmaessiger Einkaeufe. Alle Preise erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mealPlanItems, mealPlanText, regularItems, shopName, stockFor, stockItems } from '../src/shopping.js';

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

test('ALDI SÜD vom Bon und ALDI SUED vom Kontoauszug sind derselbe Laden', () => {
  assert.equal(shopName('ALDI SUED SAGT DANKE 1234'), 'ALDI SÜD');
  assert.equal(shopName('ALDI SÜD'), 'ALDI SÜD');
});

test('Ausgeblendete Artikel zaehlen nicht als regelmaessig', () => {
  const r = regularItems(LOG, { today: '2026-10-10', hidden: ['butter'] });
  assert.deepEqual(r.items.map((i) => i.name), ['Bio Vollmilch 3,8 %']);
  assert.deepEqual(r.hiddenItems, [{ key: 'butter', name: 'Butter' }]);
});

test('Liste fuer den Essensplan: Zeitraum, nur Lebensmittel, ohne Geschenke und Pfand', () => {
  const data = {
    months: { '2026-10': { lines: { expenses: [{ id: 'food', name: 'Lebensmittel' }, { id: 'cloth', name: 'Kleidung' }] } } },
    log: [
      { id: 'a', date: '2026-10-06', lineId: 'food', amount: 1000, items: [
        item('Spaghetti', 99), item('Spaghetti', 99), item('Pfand', 25),
        { ...item('Schlafanzug', 799), lineId: 'cloth' }, { ...item('Pralinen', 399), gift: true }] },
      { id: 'b', date: '2026-10-10', amount: 500, items: [item('Tomaten', 199), item('Hackfleisch', 349)] },
      { id: 'c', date: '2026-10-11', lineId: 'food', gift: true, amount: 900, items: [item('Torte', 900)] },
      // Zu alt fuer sieben Tage.
      { id: 'd', date: '2026-10-01', lineId: 'food', amount: 300, items: [item('Butter', 229)] },
    ],
  };
  const r = mealPlanItems(data, { today: '2026-10-11', days: 7 });
  assert.equal(r.from, '2026-10-05');
  assert.equal(r.receipts, 2);
  assert.deepEqual(r.items, [{ name: 'Hackfleisch', count: 1 }, { name: 'Spaghetti', count: 2 }, { name: 'Tomaten', count: 1 }]);
  assert.equal(mealPlanText(r), 'Eingekauft 05.10.–11.10.:\n- Hackfleisch\n- Spaghetti (2×)\n- Tomaten');

  const all = mealPlanItems(data, { today: '2026-10-11', days: 7, foodOnly: false });
  assert.ok(all.items.some((i) => i.name === 'Schlafanzug'));
});

const STOCK_LOG = [
  { id: 'v1', date: '2026-10-02', note: 'ALDI SÜD', amount: 900, items: [
    item('Weiße Bohnen', 79), item('Weiße Bohnen', 79), item('Weiße Bohnen', 79),
    { ...item('Bio Nudeln 500g', 99), stock: true }, item('Butter', 229), item('Butter', 229)] },
  { id: 'v2', date: '2026-10-09', note: 'REWE', amount: 300, items: [item('Butter', 229), item('Pfand', 25), item('Pfand', 25), item('Pfand', 25)] },
  // Zu alt: sechs Wochen sind vorbei.
  { id: 'v3', date: '2026-08-01', note: 'Lidl', amount: 500, items: [item('Reis', 99), item('Reis', 99), item('Reis', 99)] },
];

test('Vorrat: markiert oder mindestens 3 Stueck, nur die letzten Wochen, ohne Pfand', () => {
  const stock = stockItems(STOCK_LOG, { today: '2026-10-11' });
  assert.deepEqual(stock.map((s) => [s.name, s.pieces, s.date]), [['Bio Nudeln 500g', 1, '2026-10-02'], ['Weiße Bohnen', 3, '2026-10-02']]);
  assert.equal(stockFor('Nudeln', stock).name, 'Bio Nudeln 500g');
  assert.equal(stockFor('Butter', stock), null);

  // "aufgebraucht" gilt bis zum naechsten Vorratskauf.
  const used = { 'weiße bohnen': '2026-10-05' };
  assert.deepEqual(stockItems(STOCK_LOG, { today: '2026-10-11', used }).map((s) => s.name), ['Bio Nudeln 500g']);
  const again = [...STOCK_LOG, { id: 'v4', date: '2026-10-10', note: 'ALDI', amount: 300, items: [item('Weiße Bohnen', 79), item('Weiße Bohnen', 79), item('Weiße Bohnen', 79)] }];
  assert.ok(stockItems(again, { today: '2026-10-11', used }).some((s) => s.name === 'Weiße Bohnen'));
});

test('Essensplan-Liste nennt aelteren Vorrat extra', () => {
  const r = mealPlanItems({ months: {}, log: STOCK_LOG }, { today: '2026-10-11', days: 7 });
  assert.equal(mealPlanText(r), 'Eingekauft 05.10.–11.10.:\n- Butter\n\nAuf Vorrat (vermutlich noch da):\n- Bio Nudeln 500g (02.10.)\n- Weiße Bohnen (3×, 02.10.)');
});
