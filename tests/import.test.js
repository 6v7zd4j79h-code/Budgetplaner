// Tests fuer das Einlesen von Kontoauszuegen. Alle Beispieldaten sind
// erfunden und folgen nur dem Spaltenaufbau der jeweiligen Bank.

import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeBytes, parseAmount, parseCsv, parseDate, readStatement } from '../src/import/csv.js';
import { classify, suggest, monthsIn } from '../src/import/classify.js';
import { applyImport, alreadyImported } from '../src/import/apply.js';
import { emptyData, monthSummary } from '../src/budget.js';

const SPARKASSE = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE00123";"01.09.26";"01.09.26";"GUTSCHR. UEBERW. DAUERAUFTR";"Gehalt September";"";"";"";"";"";"";"Muster GmbH";"DE11";"BIC";"2.980,00";"EUR";"Umsatz gebucht"
"DE00123";"02.09.26";"02.09.26";"DAUERAUFTRAG";"Miete Wohnung";"";"";"";"";"";"";"Hausverwaltung Beispiel";"DE22";"BIC";"-750,00";"EUR";"Umsatz gebucht"
"DE00123";"05.09.26";"05.09.26";"FOLGELASTSCHRIFT";"Abschlag";"";"";"";"";"";"";"Stadtwerke Musterstadt";"DE33";"BIC";"-85,00";"EUR";"Umsatz gebucht"
"DE00123";"06.09.26";"06.09.26";"KARTENZAHLUNG";"REWE SAGT DANKE";"";"";"";"";"";"";"REWE Markt GmbH";"DE44";"BIC";"-45,12";"EUR";"Umsatz gebucht"
"DE00123";"13.09.26";"13.09.26";"KARTENZAHLUNG";"REWE SAGT DANKE";"";"";"";"";"";"";"REWE Markt GmbH";"DE44";"BIC";"-38,40";"EUR";"Umsatz gebucht"
"DE00123";"15.09.26";"15.09.26";"FOLGELASTSCHRIFT";"Netflix";"";"";"";"";"";"";"Netflix International B.V.";"DE55";"BIC";"-13,99";"EUR";"Umsatz gebucht"
"DE00123";"20.09.26";"20.09.26";"UMBUCHUNG";"Übertrag Sparkonto";"";"";"";"";"";"";"Mareike Muster";"DE66";"BIC";"-200,00";"EUR";"Umsatz gebucht"
"DE00123";"30.09.26";"30.09.26";"KARTENZAHLUNG";"vorgemerkt";"";"";"";"";"";"";"dm-drogerie markt";"DE77";"BIC";"-9,95";"EUR";"Umsatz vorgemerkt"
"DE00123";"02.10.26";"02.10.26";"KARTENZAHLUNG";"";"";"";"";"";"";"";"EDEKA Center";"DE88";"BIC";"-61,30";"EUR";"Umsatz gebucht"
`;

const COMMERZBANK = `Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;Auftraggeberkonto;Bankleitzahl Auftraggeberkonto;IBAN Auftraggeberkonto;Kategorie
03.09.2026;03.09.2026;Lastschrift;Vodafone GmbH Kundennr 123456789 Rechnung;-39,99;EUR;111;222;DE99;Telefon
10.09.2026;10.09.2026;Kartenzahlung;ALDI SUED 1234 Musterstadt 2026-09-10;-23,5;EUR;111;222;DE99;Lebensmittel
`;

const REVOLUT = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-04 12:01:00,2026-09-05 08:00:00,Spotify,-10.99,0.00,EUR,COMPLETED,100.00
CARD_PAYMENT,Current,2026-09-08 18:30:00,2026-09-09 08:00:00,Lieferando,-27.80,0.00,EUR,COMPLETED,72.20
TOPUP,Current,2026-09-01 09:00:00,2026-09-01 09:00:00,Top-Up by *1234,200.00,0.00,EUR,COMPLETED,272.20
CARD_PAYMENT,Current,2026-09-12 10:00:00,,Zalando,-59.95,0.00,EUR,PENDING,12.25
CARD_PAYMENT,Current,2026-09-14 10:00:00,2026-09-14 10:00:00,Hotel London,-120.00,1.20,GBP,COMPLETED,0.00
`;

const PAYPAL = `"Datum","Uhrzeit","Zeitzone","Name","Typ","Status","Währung","Brutto","Gebühr","Netto","Absender E-Mail-Adresse","Empfänger E-Mail-Adresse","Transaktionscode","Artikelbezeichnung"
"07.09.2026","10:12:00","Europe/Berlin","KoRo Handels GmbH","Express-Zahlung","Abgeschlossen","EUR","-24,90","0,00","-24,90","a@b.de","koro@example.com","1AB","Erdnussbutter"
"07.09.2026","10:12:00","Europe/Berlin","","Bankgutschrift auf PayPal-Konto","Abgeschlossen","EUR","24,90","0,00","24,90","","","2AB",""
"21.09.2026","19:00:00","Europe/Berlin","Etsy Ireland","Zahlung im Einzugsverfahren mit Zahlungsrechnung","Ausstehend","EUR","-15,00","0,00","-15,00","","","3AB",""
`;

const STRIPE = `id,Type,Source,Amount,Fee,Net,Currency,Created (UTC),Available On (UTC),Description
txn_1,charge,ch_1,97.00,3.07,93.93,eur,2026-09-11 09:00,2026-09-18 00:00,Wohlfühl-Look PREMIUM
txn_2,payout,po_1,-93.93,0.00,-93.93,eur,2026-09-20 00:00,2026-09-20 00:00,STRIPE PAYOUT
`;

// --- Grundlagen -----------------------------------------------------------

test('Betraege in allen Bankformaten', () => {
  assert.equal(parseAmount('-1.234,56'), -123456);
  assert.equal(parseAmount('2.980,00'), 298000);
  assert.equal(parseAmount('-23,5'), -2350);
  assert.equal(parseAmount('-10.99'), -1099);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('12,50 EUR'), 1250);
  assert.equal(parseAmount('+3.000,00'), 300000);
  assert.equal(parseAmount('5,00-'), -500);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('Datum in allen Bankformaten', () => {
  assert.equal(parseDate('01.09.26'), '2026-09-01');
  assert.equal(parseDate('1.9.2026'), '2026-09-01');
  assert.equal(parseDate('2026-09-05 08:00:00'), '2026-09-05');
  assert.equal(parseDate('2026-09-05T08:00:00Z'), '2026-09-05');
  assert.equal(parseDate('09/05/2026'), '2026-09-05');
  assert.equal(parseDate('32.13.2026'), null);
  assert.equal(parseDate(''), null);
});

test('CSV mit Anfuehrungszeichen, Semikolon im Feld und Zeilenumbruch', () => {
  const rows = parseCsv('a;b;c\n"x;y";"zeile\neins";"sagt ""hallo"""\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x;y', 'zeile\neins', 'sagt "hallo"']]);
});

test('Windows-1252 der Sparkasse wird richtig gelesen', () => {
  const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]); // "Müller" in Windows-1252
  assert.equal(decodeBytes(bytes), 'Müller');
  assert.equal(decodeBytes(new TextEncoder().encode('﻿Müller')), 'Müller');
});

// --- Banken -----------------------------------------------------------------

test('Sparkasse: erkannt, vorgemerkte Umsaetze uebersprungen', () => {
  const r = readStatement(SPARKASSE);
  assert.equal(r.bank.label, 'Sparkasse');
  assert.equal(r.transactions.length, 8);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.transactions[0], {
    date: '2026-09-01', amount: 298000, payee: 'Muster GmbH', purpose: 'Gehalt September',
    kind: 'GUTSCHR. UEBERW. DAUERAUFTR', source: 'Sparkasse', file: '',
  });
});

test('Commerzbank: Empfaenger aus dem Buchungstext, ohne Kundennummer', () => {
  const r = readStatement(COMMERZBANK);
  assert.equal(r.bank.label, 'Commerzbank');
  assert.equal(r.transactions.length, 2);
  assert.equal(r.transactions[0].payee, 'Vodafone GmbH Kundennr');
  assert.equal(r.transactions[1].amount, -2350);
});

test('Revolut: nur abgeschlossene Euro-Umsaetze', () => {
  const r = readStatement(REVOLUT);
  assert.equal(r.bank.label, 'Revolut');
  assert.deepEqual(r.transactions.map((t) => t.payee), ['Spotify', 'Lieferando', 'Top-Up by *1234']);
  assert.equal(r.transactions[0].date, '2026-09-05');
});

test('PayPal: Bankgutschriften und ausstehende Zahlungen fallen raus', () => {
  const r = readStatement(PAYPAL);
  assert.equal(r.bank.label, 'PayPal');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].payee, 'KoRo Handels GmbH');
  assert.equal(r.transactions[0].amount, -2490);
});

test('Stripe: Nettoeinnahmen ja, Auszahlungen nein', () => {
  const r = readStatement(STRIPE);
  assert.equal(r.bank.label, 'Stripe');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].amount, 9393);
});

test('unbekannte Bank wird ueber allgemeine Spaltennamen gelesen', () => {
  const r = readStatement('Kontoinhaber: Test\n\nDatum;Empfänger;Verwendungszweck;Betrag (EUR)\n12.09.2026;Thalia;Buch;-18,00\n');
  assert.equal(r.bank.label, 'CSV');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].payee, 'Thalia');
});

test('Datei ohne Umsatztabelle meldet einen verstaendlichen Fehler', () => {
  const r = readStatement('nur;irgendwas\n1;2\n');
  assert.match(r.error, /keine Umsatztabelle/);
});

// --- Sortieren ----------------------------------------------------------------

test('Vorschlaege fuer typische Buchungen', () => {
  const sec = (payee, amount, purpose = '') => classify({ payee, purpose, kind: '', amount }).section;
  assert.equal(sec('Muster GmbH', 298000, 'Gehalt September'), 'income');
  assert.equal(sec('Hausverwaltung Beispiel', -75000, 'Miete'), 'bills');
  assert.equal(sec('Netflix International', -1399), 'subscription');
  assert.equal(sec('REWE Markt', -4512), 'expenses');
  assert.equal(sec('Mareike Muster', -20000, 'Übertrag Sparkonto'), 'ignore');
  assert.equal(sec('Klarna', -4990), 'debts');
  assert.equal(sec('Irgendein Laden', -500), 'expenses');
  assert.equal(classify({ payee: 'REWE', purpose: '', kind: '', amount: -100 }).name, 'Lebensmittel');
});

test('Vorschlaege buendeln Buchungen je Empfaenger und Monat', () => {
  const { transactions } = readStatement(SPARKASSE);
  assert.deepEqual(monthsIn(transactions), [{ key: '2026-09', count: 7 }, { key: '2026-10', count: 1 }]);
  const groups = suggest(transactions, '2026-09');
  const rewe = groups.find((g) => g.label.startsWith('REWE'));
  assert.equal(rewe.transactions.length, 2);
  assert.equal(rewe.total, 4512 + 3840);
  assert.equal(groups.find((g) => g.section === 'ignore').include, false);
});

// --- Uebernehmen --------------------------------------------------------------------

test('Import fuellt Budget, Log und Abos - und zaehlt beim zweiten Mal nichts doppelt', () => {
  const data = emptyData();
  const { transactions } = readStatement(SPARKASSE);
  const groups = suggest(transactions, '2026-09');
  const first = applyImport(data, '2026-09', groups);
  assert.equal(first.entries, 2);
  assert.equal(first.subscriptions, 1);

  const s = monthSummary(data, '2026-09');
  assert.equal(s.totals.income.actual, 298000);
  assert.equal(s.totals.bills.actual, 75000 + 8500 + 1399);
  assert.equal(s.totals.expenses.actual, 4512 + 3840);
  const food = data.months['2026-09'].lines.expenses.find((l) => l.name === 'Lebensmittel');
  assert.equal(food.budget, 9000); // 83,52 € aufgerundet auf 90 €
  assert.equal(data.subscriptions[0].name, 'Netflix International B.V.');

  const again = applyImport(data, '2026-09', suggest(transactions, '2026-09'));
  assert.equal(again.entries + again.lines + again.subscriptions, 0);
  assert.equal(monthSummary(data, '2026-09').totals.income.actual, 298000);
  // 7 Buchungen im September, davon eine ignorierte Umbuchung - die gilt nicht als uebernommen.
  assert.equal(alreadyImported(data, transactions.filter((t) => t.date.startsWith('2026-09'))), 6);
});

test('gewaehlte Zuordnung wird gelernt und beim naechsten Mal vorgeschlagen', () => {
  const data = emptyData();
  const { transactions } = readStatement(SPARKASSE);
  const groups = suggest(transactions, '2026-09');
  const rewe = groups.find((g) => g.label.startsWith('REWE'));
  rewe.name = 'Wocheneinkauf';
  applyImport(data, '2026-09', groups);
  const next = suggest(transactions, '2026-09', data.learned);
  assert.equal(next.find((g) => g.label.startsWith('REWE')).name, 'Wocheneinkauf');
});

// --- Startbetrag ----------------------------------------------------------------------

import { openingBalance, openingFromToday } from '../src/import/balance.js';

const fileOf = (text) => {
  const r = readStatement(text);
  return { account: r.bank.account === true, transactions: r.transactions, preamble: r.preamble };
};

test('Startbetrag aus dem Saldo je Zeile (Revolut)', () => {
  // Erste September-Buchung: Top-Up +200 am 01.09., Saldo danach 272,20.
  assert.deepEqual(openingBalance(fileOf(REVOLUT), '2026-09'), { value: 7220, how: 'column' });
});

test('Startbetrag aus dem Kontostand ueber der Tabelle', () => {
  const csv = 'Kontostand vom 15.09.2026:;1.000,00 EUR\n\nBuchungstag;Empfänger;Betrag\n05.09.2026;REWE;-50,00\n10.09.2026;Gehalt;2.000,00\n20.09.2026;Miete;-700,00\n';
  // 1.000 am 15.09. minus (−50 + 2.000) seit dem 1. = −950
  assert.deepEqual(openingBalance(fileOf(csv), '2026-09'), { value: -95000, how: 'preamble' });
  const later = 'Saldo;31.08.2026;500,00\n\nDatum;Name;Betrag\n01.09.2026;X;-10,00\n';
  assert.equal(openingBalance(fileOf(later), '2026-09').value, 50000);
});

test('ohne Kontostand: fragen und aus dem heutigen Stand zurueckrechnen', () => {
  const file = fileOf(SPARKASSE);
  assert.equal(openingBalance(file, '2026-09').how, 'ask');
  // Heute 1.500 €; seit 1.9. gebucht: +2.980 −750 −85 −45,12 −38,40 −13,99 −200 −61,30
  const moves = 298000 - 75000 - 8500 - 4512 - 3840 - 1399 - 20000 - 6130;
  assert.equal(openingFromToday(file, '2026-09', 150000), 150000 - moves);
});

test('PayPal und Stripe zaehlen nicht zum Startbetrag', () => {
  assert.equal(openingBalance(fileOf(PAYPAL), '2026-09').how, 'none');
  assert.equal(openingBalance(fileOf(STRIPE), '2026-09').how, 'none');
});
