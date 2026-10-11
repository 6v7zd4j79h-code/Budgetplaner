// Tests fuer das genaue Lesen mit Claude. Claude wird nachgebaut - es
// entstehen keine Kosten. Alle Bon-Daten erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, handleReceiptAi, normalize } from '../server/receipt-ai-core.js';

const IMG = { media_type: 'image/jpeg', data: 'QUJD' };

function fakeClient(reply, log = []) {
  return {
    messages: {
      create: async (params) => {
        log.push(params);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], ...(reply.__stop ? { stop_reason: reply.__stop } : {}) };
      },
    },
  };
}

function memoryLimiter() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? { data: m.get(k) } : null), set: async (k, v) => { m.set(k, v); } };
}

test('Claude liest den Bon: Bilder und Schema gehen raus, saubere Werte kommen zurueck', async () => {
  const log = [];
  const client = fakeClient({
    shop: 'ALDI SÜD', date: '2026-10-09', total_cents: 1166,
    items: [
      { name: 'XXL Pommes Frit.', amount_cents: 299, article_no: '444704' },
      { name: 'Kürbis Mix lose', amount_cents: 303, article_no: '774986' },
      { name: 'Pfand', amount_cents: 25, article_no: '' },
      { name: 'Bio Knödel', amount_cents: 329, article_no: '520576' },
      { name: 'Coupon', amount_cents: -50, article_no: '' },
      { name: 'Leergut', amount_cents: -25, article_no: '' },
      { name: 'Light Chips', amount_cents: 285, article_no: '' },
    ],
  }, log);
  const r = await handleReceiptAi({ images: [IMG, IMG] }, { client, limiter: memoryLimiter(), now: Date.UTC(2026, 9, 11) });
  assert.equal(r.status, 200);
  assert.equal(log[0].model, MODEL);
  assert.equal(log[0].messages[0].content.filter((c) => c.type === 'image').length, 2);
  assert.equal(log[0].output_config.format.type, 'json_schema');
  // Coupon wird vom Artikel davor abgezogen, Leergut bleibt als Minusbetrag.
  assert.deepEqual(r.body.items.map((i) => [i.name, i.amount]), [
    ['XXL Pommes Frit.', 299], ['Kürbis Mix lose', 303], ['Pfand', 25], ['Bio Knödel', 279], ['Leergut', -25], ['Light Chips', 285],
  ]);
  assert.equal(r.body.total, 1166);
  assert.equal(r.body.items[0].artNo, '444704');
});

test('Ohne Schluessel, falsche Bilder, Tageslimit, Ablehnung', async () => {
  assert.equal((await handleReceiptAi({ images: [IMG] }, { apiKey: '' })).status, 503);
  const client = fakeClient({ shop: '', date: '', total_cents: 0, items: [] });
  assert.equal((await handleReceiptAi({ images: [] }, { client })).status, 400);
  assert.equal((await handleReceiptAi({ images: [{ media_type: 'application/pdf', data: 'x' }] }, { client })).status, 400);
  const limiter = memoryLimiter();
  const now = Date.UTC(2026, 9, 11);
  assert.equal((await handleReceiptAi({ images: [IMG] }, { client, limiter, limit: 1, now })).status, 200);
  const second = await handleReceiptAi({ images: [IMG] }, { client, limiter, limit: 1, now });
  assert.equal(second.status, 429);
  assert.equal((await handleReceiptAi({ images: [IMG] }, { client, limiter, limit: 1, now: now + 86400000 })).status, 200);
  const refused = fakeClient({ __stop: 'refusal', shop: '', date: '', total_cents: 0, items: [] });
  assert.equal((await handleReceiptAi({ images: [IMG] }, { client: refused })).status, 422);
});

test('Normalisieren: ungueltige Werte werden leer', () => {
  const n = normalize({ shop: '  REWE ', date: '09.10.2026', total_cents: -5, items: [{ name: '', amount_cents: 100 }, { name: 'Milch', amount_cents: 1.5 }] });
  assert.deepEqual(n, { shop: 'REWE', date: null, total: null, items: [{ name: 'Milch', amount: 0 }], model: MODEL });
});
