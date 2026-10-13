// Tests fuer das Schicken der Einkaufsliste an den Essensplan. Alles erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_URL, PATH, cleanUrl, linked, mealLink, mealPayload, sendMealPlan } from '../src/mealsend.js';

const R = {
  from: '2026-10-07', to: '2026-10-13',
  items: [{ name: 'Butter', count: 2 }, { name: 'Bananen', count: 1 }],
  stock: [{ key: 'nudeln', name: 'Nudeln', pieces: 4, date: '2026-09-20', shop: 'Lidl' }],
};

test('Verbindung: Vorgabe-Adresse, ohne Code nicht verbunden', () => {
  assert.deepEqual(mealLink({}), { url: DEFAULT_URL, code: '', sentAt: null });
  assert.equal(linked({}), false);
  assert.equal(linked({ mealPlanLink: { code: 'abc' } }), true);
});

test('Adresse vereinheitlichen', () => {
  assert.equal(cleanUrl(''), DEFAULT_URL);
  assert.equal(cleanUrl('beispiel.netlify.app/'), 'https://beispiel.netlify.app');
  assert.equal(cleanUrl('https://beispiel.netlify.app/essen?x=1'), 'https://beispiel.netlify.app');
  assert.equal(cleanUrl('http://localhost:8888'), 'http://localhost:8888');
  assert.equal(cleanUrl('https://'), null);
});

test('Nutzlast: Text wie beim Kopieren, Artikel und Vorrat ohne Laden', () => {
  const p = mealPayload(R, new Date('2026-10-13T10:00:00Z'));
  assert.equal(p.version, 1);
  assert.equal(p.sentAt, '2026-10-13T10:00:00.000Z');
  assert.match(p.text, /^Eingekauft 07\.10\.–13\.10\.:\n- Butter \(2×\)\n- Bananen/);
  assert.match(p.text, /Auf Vorrat/);
  assert.deepEqual(p.items, [{ name: 'Butter', count: 2 }, { name: 'Bananen', count: 1 }]);
  assert.deepEqual(p.stock, [{ name: 'Nudeln', pieces: 4, date: '2026-09-20' }]);
  assert.ok(!JSON.stringify(p).includes('Lidl'));
});

test('Abschicken: Adresse, Code im Kopf, Fehlermeldungen', async () => {
  let seen;
  const ok = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  await sendMealPlan({ url: 'https://plan.example', code: 'geheim' }, { text: 'x' }, ok);
  assert.equal(seen.url, `https://plan.example${PATH}`);
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.Authorization, 'Bearer geheim');
  assert.deepEqual(JSON.parse(seen.opts.body), { text: 'x' });

  const status = (code) => async () => ({ ok: false, status: code, json: async () => ({}) });
  await assert.rejects(sendMealPlan({ url: 'u', code: 'c' }, {}, status(401)), /Verbindungscode passt nicht/);
  await assert.rejects(sendMealPlan({ url: 'u', code: 'c' }, {}, status(404)), /Briefkasten fehlt/);
  await assert.rejects(sendMealPlan({ url: 'u', code: 'c' }, {}, status(500)), /Fehler 500/);
  await assert.rejects(sendMealPlan({ url: 'u', code: 'c' }, {}, async () => { throw new TypeError('offline'); }), /nicht erreichbar/);
});
