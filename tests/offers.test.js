// Tests fuer den Angebots-Check. marktguru wird nachgebaut, alle Angebote
// und Preise sind erfunden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTerms, handleOffers, parseKeys, resetKeys } from '../server/offers-core.js';
import { isBio, isQuality, matchOffers, occasionTerms, searchTerm, shopOf, watchlist, weekKey } from '../src/offers.js';

const HOME_HTML = `<html><script type="application/json">{"other":1}</script>
<script type="application/json">{"config":{"apiKey":"KEY","clientKey":"CLIENT"}}</script></html>`;

function raw(id, name, price, retailer, extra = {}) {
  return {
    id, price, oldPrice: extra.oldPrice ?? null, referencePrice: null,
    product: { name }, brand: { name: extra.brand || '' }, description: extra.description || '',
    advertisers: [{ name: retailer, uniqueName: retailer.toLowerCase().replace(/\s+/g, '-') }],
    validityDates: [{ from: '2026-10-12T00:00:00Z', to: extra.to || '2026-10-17T23:59:59Z' }],
    unit: { shortName: 'Stück' },
  };
}

function fakeMarktguru(byTerm, log = []) {
  return async (url, options) => {
    log.push({ url: String(url), headers: options?.headers });
    if (String(url).startsWith('https://www.marktguru.de')) return new Response(HOME_HTML, { status: 200 });
    const q = new URL(url).searchParams.get('q');
    return Response.json({ results: byTerm[q] || [] });
  };
}

test('Server: Schluessel von der Startseite lesen', () => {
  assert.deepEqual(parseKeys(HOME_HTML), { apiKey: 'KEY', clientKey: 'CLIENT' });
  assert.equal(parseKeys('<html></html>'), null);
});

test('Server: Suchbegriffe bereinigen und begrenzen', () => {
  assert.deepEqual(cleanTerms([' Butter ', 'butter', 'x', '', 'Mehl']), ['Butter', 'Mehl']);
  assert.equal(cleanTerms(Array.from({ length: 80 }, (_, i) => `Wort${i}`)).length, 40);
});

test('Server: Angebote holen, kompakt zurueckgeben, zwischenspeichern', async () => {
  resetKeys();
  const log = [];
  const memory = new Map();
  const cache = { get: async (k) => (memory.has(k) ? { data: memory.get(k) } : null), set: async (k, v) => { memory.set(k, v); } };
  const fetchFn = fakeMarktguru({ Butter: [raw(1, 'Deutsche Markenbutter', 1.79, 'Lidl', { oldPrice: 2.29 })] }, log);

  const r = await handleOffers({ zip: '12345', terms: ['Butter', 'Mehl'] }, { fetch: fetchFn, cache, now: 1000 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results.Mehl, []);
  const butter = r.body.results.Butter[0];
  assert.equal(butter.title, 'Deutsche Markenbutter');
  assert.equal(butter.price, 179);
  assert.equal(butter.oldPrice, 229);
  assert.equal(butter.retailer, 'Lidl');
  assert.equal(butter.to, '2026-10-17');

  const search = log.find((l) => l.url.includes('/offers/search'));
  assert.equal(search.headers['x-apikey'], 'KEY');
  assert.equal(new URL(search.url).searchParams.get('zipCode'), '12345');

  // Zweiter Aufruf kommt aus dem Zwischenspeicher.
  const before = log.length;
  await handleOffers({ zip: '12345', terms: ['Butter'] }, { fetch: fetchFn, cache, now: 2000 });
  assert.equal(log.length, before);
});

test('Server: falsche Postleitzahl und marktguru nicht erreichbar', async () => {
  resetKeys();
  assert.equal((await handleOffers({ zip: '123', terms: ['Butter'] })).status, 400);
  assert.equal((await handleOffers({ zip: '12345', terms: [] })).status, 400);
  const down = async () => new Response('nein', { status: 503 });
  const r = await handleOffers({ zip: '12345', terms: ['Butter'] }, { fetch: down });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /nicht erreichbar/);
});

test('Suchbegriff aus Bon-Namen', () => {
  assert.equal(searchTerm('Koro Erdnussbutter Gesalzen'), 'Erdnussbutter');
  assert.equal(searchTerm('Gouda Jung Scheiben'), 'Gouda');
  assert.equal(searchTerm('Bio Vollmilch 3,8%'), 'Vollmilch');
  assert.equal(searchTerm('Zahnpasta Sensitive'), 'Zahnpasta');
  assert.equal(searchTerm('BANANEN'), 'Bananen');
  assert.equal(searchTerm('12 x'), '');
});

test('Was hinter Notizen zu Anlaessen steckt', () => {
  assert.deepEqual(occasionTerms('Kuchenzutaten, Deko'), ['Mehl', 'Zucker', 'Butter', 'Eier', 'Backpulver', 'Sahne']);
  assert.deepEqual(occasionTerms('Kinder mittags zu Hause – mehr fürs Mittagessen'), ['Nudeln', 'Reis', 'Kartoffeln', 'Tomatensoße', 'Hackfleisch']);
  assert.deepEqual(occasionTerms('Luftballons'), ['Luftballons']);
});

test('Bio, Qualitaet und Laden erkennen', () => {
  const o = (title, brand = '', retailer = 'ALDI SÜD') => ({ title, brand, description: '', retailer, retailerKey: '' });
  assert.ok(isBio(o('Nur Nur Natur Bio-Vollmilch')));
  assert.ok(isBio(o('Vollmilch', 'Nur Nur Natur')));
  assert.ok(isBio(o('Haferflocken', 'dmBio')));
  assert.ok(isBio(o('Butter', 'Bioland')));
  assert.ok(!isBio(o('Biotin Kapseln')));
  assert.ok(!isBio(o('Vollmilchschokolade', 'Milka')));
  assert.ok(isQuality(o('Zartbitter 70 %', 'GEPA')));
  assert.equal(shopOf(o('x', '', 'ALDI SÜD')).id, 'aldi-sued');
  assert.equal(shopOf(o('x', '', 'Aldi Nord')).id, 'aldi-nord');
  assert.equal(shopOf(o('x', '', 'dm-drogerie markt')).id, 'dm');
  assert.equal(shopOf(o('x', '', 'E center')).id, 'edeka');
  assert.equal(shopOf(o('x', '', 'Globus Baumarkt')).id, 'globus');
  assert.equal(shopOf(o('x', '', 'HIT')).id, 'hit');
  assert.equal(shopOf(o('x', '', 'Netto Marken-Discount')).id, 'netto');
  assert.equal(shopOf(o('x', '', 'Thomas Philipps')).id, 'thomas-philipps');
  assert.equal(shopOf(o('x', '', 'White Hit Records')), null);
});

const offer = (id, title, price, retailer, extra = {}) => ({
  id: String(id), title, brand: extra.brand || '', description: '', retailer, retailerKey: '', price,
  oldPrice: null, unit: '', from: '2026-10-12', to: extra.to || '2026-10-17', card: false,
});

test('Treffer: eigene Laeden, Bio zuerst, Qualitaetswunsch, Ersparnis', () => {
  const list = [
    { term: 'Butter', key: 'butter', sources: ['regular'], occasions: [], usual: { price: 229, shop: 'REWE' }, quality: false },
    { term: 'Schokolade', key: 'schokolade', sources: ['own'], occasions: [], usual: null, quality: true },
    { term: 'Mehl', key: 'mehl', sources: ['occasion'], occasions: ['Geburtstag'], usual: null, quality: false },
  ];
  const results = {
    Butter: [
      offer(1, 'Markenbutter', 179, 'Lidl'),
      offer(2, 'Bio-Butter', 249, 'ALDI SÜD', { brand: 'Nur Nur Natur' }),
      offer(3, 'Butter', 149, 'Globus'),
      offer(4, 'Butter alt', 99, 'Lidl', { to: '2026-10-01' }),
    ],
    Schokolade: [offer(5, 'Vollmilch', 99, 'REWE', { brand: 'Milka' }), offer(6, 'Zartbitter', 229, 'REWE', { brand: 'GEPA' })],
    Mehl: [offer(7, 'Weizenmehl 405', 59, 'EDEKA')],
  };
  const settings = { shops: ['aldi-sued', 'lidl', 'rewe', 'edeka'], bio: 'prefer', exclude: '' };
  const groups = matchOffers(results, list, settings, { today: '2026-10-11' });

  assert.deepEqual(groups.map((g) => g.term), ['Butter', 'Mehl', 'Schokolade']);
  assert.deepEqual(groups[0].offers.map((o) => [o.title, o.bio, o.saving]), [['Bio-Butter', true, 0], ['Markenbutter', false, 50]]);
  assert.deepEqual(groups[2].offers.map((o) => o.title), ['Zartbitter']);

  const onlyBio = matchOffers(results, list, { ...settings, bio: 'only' }, { today: '2026-10-11' });
  assert.deepEqual(onlyBio.find((g) => g.term === 'Butter').offers.map((o) => o.title), ['Bio-Butter']);

  const noLidl = matchOffers(results, list, { ...settings, exclude: 'markenbutter, weizen' }, { today: '2026-10-11' });
  assert.deepEqual(noLidl.map((g) => g.term), ['Schokolade', 'Butter']);
});

test('Merkliste aus Stammartikeln, Anlaessen und eigenen Woertern', () => {
  const data = {
    offerSettings: { terms: [{ term: 'Schokolade', quality: true }], hidden: ['bananen'] },
    occasions: [{ id: 'g', kind: 'birthday', name: 'Kind', day: '10-20', lead: 21, note: 'Kuchenzutaten' }],
    holidaysOff: ['ostern', 'nikolaus', 'weihnachten', 'silvester'],
  };
  const regular = { items: [
    { name: 'Butter', lastPrice: 229, lastShop: 'REWE' },
    { name: 'Bananen', lastPrice: 159, lastShop: 'REWE' },
  ] };
  const list = watchlist(data, regular, { today: '2026-10-11' });
  const butter = list.find((e) => e.key === 'butter');
  assert.deepEqual(butter.sources, ['regular', 'occasion']);
  assert.deepEqual(butter.usual, { price: 229, shop: 'REWE', name: 'Butter' });
  assert.ok(list.find((e) => e.key === 'schokolade').quality);
  assert.ok(list.some((e) => e.key === 'mehl'));
  assert.ok(!list.some((e) => e.key === 'bananen'));
});

test('Kalenderwoche', () => {
  assert.equal(weekKey('2026-10-11'), '2026-W41');
  assert.equal(weekKey('2026-10-12'), '2026-W42');
  assert.equal(weekKey('2027-01-01'), '2026-W53');
  assert.equal(weekKey('2024-12-30'), '2025-W01');
});

test('Karten & Apps: Payback-Extrapunkte, Angebote nur mit fremder App nach hinten', () => {
  const list = [{ term: 'Kaffee', key: 'kaffee', sources: ['own'], occasions: [], usual: null, quality: false }];
  const withCard = (o) => ({ ...o, card: true });
  const results = { Kaffee: [
    withCard(offer(1, 'Kaffee Crema', 399, 'Lidl')),
    offer(2, 'Kaffee Gold 10fach Punkte', 549, 'EDEKA'),
    withCard(offer(3, 'Kaffee Bohnen', 699, 'EDEKA')),
  ] };
  const settings = { shops: ['lidl', 'edeka'], bio: 'any', exclude: '', cards: ['payback'] };
  const [group] = matchOffers(results, list, settings, { today: '2026-10-11' });
  assert.deepEqual(group.offers.map((o) => [o.title, o.program, o.needsCard, o.points]), [
    ['Kaffee Gold 10fach Punkte', 'Payback', false, true],
    ['Kaffee Bohnen', 'Payback', false, false],
    ['Kaffee Crema', 'Lidl Plus', true, false],
  ]);

  // Mit Lidl Plus zaehlt das Lidl-Angebot normal mit.
  const [all] = matchOffers(results, list, { ...settings, cards: ['payback', 'lidl-plus'] }, { today: '2026-10-11' });
  assert.equal(all.offers[0].title, 'Kaffee Crema');
  assert.equal(all.offers[0].needsCard, false);

  // Ohne Payback keine Extrapunkte-Markierung.
  const [none] = matchOffers(results, list, { ...settings, cards: [] }, { today: '2026-10-11' });
  assert.ok(none.offers.every((o) => !o.points));
});
