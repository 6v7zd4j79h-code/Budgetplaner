// Tests fuer das Lesen von Kassenbons. Die Texte sind erfunden und ahmen
// nach, was die Texterkennung typischerweise liefert - samt ihrer Fehler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt } from '../src/receipt.js';

const EDEKA = `
EDEKA Center Muster
Hauptstraße 1
67433 Neustadt
EUR
BIO VOLLMILCH 3,8% 1,19 B
2 x 1,19
BIO VOLLMILCH 3,8% 1,19 B
KORO ERDNUSSBUTTER GESALZEN 8,99 A
GEWUERZMISCHUNG BBQ 18,00 A
BROETCHEN 6 STK 2,34 B
TOMATEN RISPEN 2,49 B
Rabatt Tomaten -0,50
PFAND 0,25 A
----------------------------------
SUMME EUR 33,95
Geg. EC-Cash EUR 33,95
MwSt% Netto Steuer Brutto
A= 19,0% 23,15 4,40 27,55
B= 7,0% 5,98 0,42 6,40
04.10.26 11:42 Bon-Nr. 4711
Vielen Dank für Ihren Einkauf
`;

test('Kassenbon: Laden, Datum, Summe und Artikel', () => {
  const r = parseReceipt(EDEKA);
  assert.equal(r.shop, 'EDEKA');
  assert.equal(r.date, '2026-10-04');
  assert.equal(r.total, 3395);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [
    ['Bio Vollmilch 3,8%', 119],
    ['Bio Vollmilch 3,8%', 119],
    ['Koro Erdnussbutter Gesalzen', 899],
    ['Gewuerzmischung Bbq', 1800],
    ['Broetchen 6 Stk', 234],
    ['Tomaten Rispen', 199],
    ['Pfand', 25],
  ]);
  assert.equal(r.sum, r.total);
});

test('Lesefehler der Texterkennung: Punkt statt Komma, Leerzeichen, Steuerzeichen', () => {
  const r = parseReceipt('REWE Markt\nAPFEL BRAEBURN 2.99 B\nSPUELMITTEL 1 ,49 A*\nSCHOKOLADE 1,99B\nZU ZAHLEN 6.47\n');
  assert.equal(r.shop, 'REWE');
  assert.deepEqual(r.items.map((i) => i.amount), [299, 149, 199]);
  assert.equal(r.total, 647);
});

test('ohne erkannte Summe gilt die Summe der Artikel', () => {
  const r = parseReceipt('dm-drogerie markt\nZAHNPASTA 1,45 A\nDUSCHGEL 0,95 A\n');
  assert.equal(r.shop, 'dm');
  assert.equal(r.total, 240);
});

test('Zeichensalat und Fusszeilen werden keine Artikel', () => {
  const r = parseReceipt('ALDI SÜD\n1234 5678 9,99\n=== 1,00\nMILCH 0,99 B\nSUMME 0,99\nTSE-Signatur 12,34\nVISA 0,99\n');
  assert.deepEqual(r.items.map((i) => i.name), ['Milch']);
});

test('Artikelnamen mit "tel", "bar" oder "tse" sind keine Fusszeilen', () => {
  const r = parseReceipt('SPUELMITTEL 1,49 A\nRHABARBER 2,99 B\nMOSTSENF 0,89 B\nTel. 06321 12345\nSUMME 5,37\n');
  assert.deepEqual(r.items.map((i) => i.amount), [149, 299, 89]);
});

test('Langer Bon in zwei Fotos: Ueberlappung wird nur einmal gezaehlt', async () => {
  const { joinParts } = await import('../src/receipt.js');
  const teil1 = `ALDI SÜD
Koblenzer Str. 1
NUR NUR NATUR MILCH 1,19 A
BUTTER 2,29 A
HACKFLEISCH GEM. 5,49 A
BANANEN 1,59 A`;
  // Zweites Foto beginnt mit den letzten zwei Zeilen des ersten - leicht anders gelesen.
  const teil2 = `HACKFLEISCH GEM 5,49 A
BANANEN 1.59 A
HAFERFLOCKEN 0,89 A
SUMME EUR 11,45`;
  const r = parseReceipt(joinParts([teil1, teil2]));
  assert.equal(r.shop, 'ALDI SÜD');
  assert.equal(r.total, 1145);
  assert.deepEqual(r.items.map((i) => i.name), ['Nur Nur Natur Milch', 'Butter', 'Hackfleisch Gem.', 'Bananen', 'Haferflocken']);
  assert.equal(r.sum, 1145);
});

test('Zwei Fotos ohne Ueberlappung und gleiche Artikel nacheinander bleiben erhalten', async () => {
  const { joinParts } = await import('../src/receipt.js');
  // Zweimal Milch direkt hintereinander ist echter Kauf, kein Ueberlapp.
  const joined = joinParts(['REWE\nMILCH 1,19 A', 'BROT 2,49 A\nSUMME 3,68']);
  assert.deepEqual(parseReceipt(joined).items.map((i) => i.name), ['Milch', 'Brot']);
});

// Erfundener Bon im Format der digitalen EDEKA-Bons (eBon/PDF): Steuer-
// kennzeichen "AW" und "*A", Stueckpreis x Menge in der Artikelzeile,
// Gewichtszeile, Payback-Text nach der Summe.
const EDEKA_EBON = `EDEKA Muster
Musterstr. 1
12345 Musterstadt
EUR
BIO ALNA.HAFERKEKSE  2,49  A
BIO SKYR NATUR  1,59 € x  3  4,77  AW
KINDERBUCH  1,50 € x  2  3,00*A
BIO VIVANI ZARTBITTER  2,99  A
WIRSING  1,19  A
0,512 kg x  1,99 €/kg
BIO SCHNITTKR.  0,79  A
Coupon: 12345678
Posten: 9  ----------
SUMME  €  15,23
Karte  €  15,23
MwSt  NETTO  MwSt  UMSATZ
A 7%  14,23  1,00  15,23
PAYBACK - ******0000
22 °P Basispunkte
09.10.26 17:35  0000000 102 038 8100`;

test('Digitaler EDEKA-Bon: AW, *A und Stueckpreis x Menge', () => {
  const r = parseReceipt(EDEKA_EBON);
  assert.equal(r.shop, 'EDEKA');
  assert.equal(r.date, '2026-10-09');
  assert.equal(r.total, 1523);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [
    ['Bio Alna.Haferkekse', 249],
    ['Bio Skyr Natur', 477],
    ['Kinderbuch', 300],
    ['Bio Vivani Zartbitter', 299],
    ['Wirsing', 119],
    ['Bio Schnittkr.', 79],
  ]);
  assert.equal(r.sum, r.total);
});

// Erfundene Rechnung (PDF zum Herunterladen): Zwischensumme und Netto
// duerfen nicht als Endbetrag gelten, Tausenderpunkt wird verstanden.
const RECHNUNG = `Muster Moebel GmbH
Rechnung Nr. 2026-1234
Rechnungsdatum: 05.10.2026
Pos. Artikel Menge Einzelpreis Gesamt
1 Kinderschreibtisch 1 1.149,00 € 1.149,00 €
2 Schreibtischlampe 2 24,95 € 49,90 €
Zwischensumme 1.198,90 €
Versand 19,90 €
Summe netto 1.024,20 €
MwSt. 19 % 194,60 €
Gesamtbetrag 1.218,80 €
Zahlbar bis 19.10.2026`;

test('Rechnung als PDF: Endbetrag, Tausenderpunkt, Zwischensummen', () => {
  const r = parseReceipt(RECHNUNG);
  assert.equal(r.date, '2026-10-05');
  assert.equal(r.total, 121880);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [
    ['Kinderschreibtisch', 114900],
    ['Schreibtischlampe', 4990],
    ['Versand', 1990],
  ]);
});

test('Mehrere Fotos: angeschnittene Zeile am Uebergang zaehlt nur einmal, Summe geht auf', async () => {
  const { parseParts, checkSum } = await import('../src/receipt.js');
  const foto1 = `ALDI SÜD
Koblenzer Str. 1
MILCH 1,19 A
BUTTER 2,29 A
CASHEWKERNE 3,49 A
NUESSE GEMISCHT 1,99 A`;
  // Oberste Zeile angeschnitten und anders gelesen.
  const foto2 = `ESSE GEMISCHT 1,99 A
BANANEN 1,59 A
SUMME EUR 10,55`;
  const r = parseParts([foto1, foto2]);
  assert.equal(r.shop, 'ALDI SÜD');
  assert.deepEqual(r.items.map((i) => [i.name, i.part]), [
    ['Milch', 0], ['Butter', 0], ['Cashewkerne', 0], ['Nuesse Gemischt', 0], ['Bananen', 1],
  ]);
  assert.equal(r.total, 1055);
  assert.equal(checkSum(r.items, r.total).status, 'ok');
});

test('Mehrere Fotos: zweimal dieselben Nuesse wirklich gekauft - Summe entscheidet', async () => {
  const { parseParts } = await import('../src/receipt.js');
  const r = parseParts(['ALDI SÜD\nMILCH 1,19 A\nNUESSE 1,99 A', 'NUESSE 1,99 A\nNUESSE 1,99 A\nSUMME 5,17']);
  assert.deepEqual(r.items.map((i) => i.name), ['Milch', 'Nuesse', 'Nuesse']);
  assert.equal(r.sum, 517);
});

test('Nachrechnen: zu viel, zu wenig, verdaechtige doppelte Zeile', async () => {
  const { checkSum } = await import('../src/receipt.js');
  const items = [
    { name: 'Milch', amount: 119, part: 0 },
    { name: 'Nuesse', amount: 199, part: 0 },
    { name: 'Nüsse', amount: 199, part: 1 },
    { name: 'Zahnpasta', amount: 199, part: 1 },
  ];
  const over = checkSum(items, 517);
  assert.equal(over.status, 'over');
  assert.equal(over.diff, 199);
  assert.equal(over.suspects[0], 2); // erste Zeile von Foto 2, gleich wie davor
  assert.deepEqual(checkSum(items, 716), { status: 'ok', sum: 716, diff: 0, suspects: [], missingPrices: 0 });
  assert.equal(checkSum(items, 800).status, 'missing');
  assert.equal(checkSum(items, null).status, 'unknown');
});

// Nachgebaut nach einem echten langen ALDI-Bon in drei Fotos: grosse
// Ueberlappung, angeschnittene erste Zeilen, Sofortstorno ueber die
// Fotogrenze, Artikelzeilen ohne gelesenen Preis.
test('Langer Bon in drei Fotos: Storno, lange Ueberlappung, fehlende Preise', async () => {
  const { parseParts, checkSum } = await import('../src/receipt.js');
  const foto1 = `ALDI SÜD
Koblenzer Straße
444704 XXL Pommes Frit. 2,99 A
485282 Haferdrink B. 1l 1,25 B
720743 Veganer Aufschnitt
589737 Bio NL Reibekaese 1,89 A
473301 Flammkuchenboden 2,99 A
319562 Bio-Landbrötchen 1,29 A
543670 Butternut BIO NL 3,03 A
Sofortstorno
BIO NL`;
  const foto2 = `485282 Hat ar AUTSCHN{ ++
985005 Vega? Reibekaese
473301 F1ammkuchenboden 2,99 A
319562 Bio-Landbrötchen 1,29 A
543670 Butternut BIO NL 3,03 A
1,522 kg x 1,99 EUR/kg
Sofortstorno
=     543670 Butternut BIO NL
774986 Kürbis Mix lose 3,03 A
185021 Light Chips 1,39 A
720743 Veganer Aufschnitt 1,19 A`;
  const foto3 = `774986 Kürbis Mix )ose 3,03 A
185021 Light Chips 1,39 A
720743 Veganer Aufschnitt 1,19 A
520576 Bio Knödel 3,29 A
Bezahlung AMERICAN EXPRESS
21,50 EUR`;
  const r = parseParts([foto1, foto2, foto3]);
  assert.deepEqual(r.items.map((i) => i.name), [
    'XXL Pommes Frit.', 'Haferdrink B. 1l', 'Veganer Aufschnitt', 'Bio NL Reibekaese', 'Flammkuchenboden', 'Bio-Landbrötchen',
    'Kürbis Mix lose', 'Light Chips', 'Veganer Aufschnitt', 'Bio Knödel',
  ]);
  // "Veganer Aufschnitt" auf Foto 1 ohne Preis -> bleibt in der Liste, Preis fehlt.
  assert.equal(r.items[2].missingPrice, true);
  assert.equal(r.printedTotal, 2150);
  const c = checkSum(r.items, r.printedTotal);
  assert.equal(c.status, 'missing');
  assert.equal(c.missingPrices, 1);
});

test('Storno auf einem einzelnen Bon entfernt den Artikel ganz', () => {
  const r = parseReceipt(`ALDI SÜD
543670 Butternut BIO NL 3,03 A
Sofortstorno
- 543670 Butternut BIO NL -3,03 A
774986 Kürbis Mix lose 3,03 A
Betrag 3,03 EUR`);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [['Kürbis Mix lose', 303]]);
  assert.equal(r.printedTotal, 303);
});

// Nachgebaut nach einem digitalen Rossmann-Bon (Screenshot aus der App):
// kein Ladenname, Coupons in eigenem Block nach der Zwischensumme, Datum
// nur im ISO-Format.
test('Digitaler Bon: Coupon-Block wird zu Minus-Zeilen, Laden an Eigenmarke erkannt', () => {
  const r = parseReceipt(`13:55
Digitaler Bon 000
Du hast insgesamt €1,00 gespart!
4068134181497 ENERBIO BRENNNESSE €1,59 B
4068134036193 PROKUDENT BRUSH-ST €1,99 A
5060229014122 PUKKA DREI MINZE T €3,99 B
Zwischensumme: €7,57
Deine Coupon-Ersparnis heute:
9823284955580 Coupon 20% Pukka €0,80
9823219992277 10% COUPONAKTION €0,20
Summe: €6,57
American Express €6,57
Start: 2026-10-07T12:04:26+02:00`);
  assert.equal(r.shop, 'Rossmann');
  assert.equal(r.date, '2026-10-07');
  assert.equal(r.printedTotal, 657);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [
    ['Enerbio Brennnesse', 159], ['Prokudent Brush-St', 199], ['Pukka Drei Minze T', 399],
    ['Coupon 20% Pukka', -80], ['10% Couponaktion', -20],
  ]);
  assert.equal(r.sum, 657);
});

test('Rabatt direkt unter dem Artikel wird weiter abgezogen', () => {
  const r = parseReceipt('REWE\nTOMATEN 2,49 B\nRabatt Tomaten -0,50\nSUMME 1,99');
  assert.deepEqual(r.items.map((i) => [i.name, i.amount]), [['Tomaten', 199]]);
});

test('Anzahl: Mengenzeile unter dem Artikel (EDEKA, REWE), darueber (Kaufland), im Namen (Lidl), Gewicht zaehlt nicht', () => {
  const r = parseReceipt(`EDEKA
SCHMAND 24% 2,38 B
  2 x 1,19
JOGHURT NATUR 1,96 B
  4 Stk x 0,49
3 x 0,89
SAHNE 2,67 B
ZWIEBELN 0,99 x 2 1,98 B
BANANEN 1,10 B
  0,856 kg x 1,29 EUR/kg
GURKE
  2 x 0,69 1,38 B
BROETCHEN 0,45 B
SUMME 11,92`);
  assert.deepEqual(r.items.map((i) => [i.name, i.amount, i.qty || 1]), [
    ['Schmand 24%', 238, 2],
    ['Joghurt Natur', 196, 4],
    ['Sahne', 267, 3],
    ['Zwiebeln', 198, 2],
    ['Bananen', 110, 1],
    ['Gurke', 138, 2],
    ['Broetchen', 45, 1],
  ]);
  assert.equal(r.sum, r.total);
});

test('Anzahl: passt der Betrag nicht, wird nichts geraten', () => {
  const r = parseReceipt(`EDEKA
BIO VOLLMILCH 1,19 B
2 x 1,19
BIO VOLLMILCH 1,19 B
SUMME 2,38`);
  assert.deepEqual(r.items.map((i) => i.qty || 1), [1, 1]);
});

test('Anzahl: "2 x Broetchen" vorne und Rechnungstabelle', () => {
  const r = parseReceipt(`Bäckerei
2 x Brötchen 0,90
1 Kinderschreibtisch 1 1.149,00 € 1.149,00 €
2 Schreibtischlampe 2 24,95 € 49,90 €
Summe 1.199,80 €`);
  assert.deepEqual(r.items.map((i) => [i.name, i.qty || 1]), [['Brötchen', 2], ['Kinderschreibtisch', 1], ['Schreibtischlampe', 2]]);
});
