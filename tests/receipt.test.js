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
