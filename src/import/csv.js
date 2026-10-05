// Kontoauszuege als CSV lesen - komplett im Browser, nichts verlaesst das
// Geraet. Jede Bank exportiert anders: Trennzeichen, Zeichensatz, Datums-
// und Zahlenformat, Spaltennamen. Deshalb wird alles erkannt statt
// vorausgesetzt; bekannte Banken bekommen zusaetzlich eine feste Zuordnung.

// --- Rohtext -------------------------------------------------------------

// Sparkasse und Commerzbank liefern oft Windows-1252 statt UTF-8. Ohne
// diese Erkennung wird aus "Lastschrift Müller" ein "M�ller".
export function decodeBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return stripBom(new TextDecoder('windows-1252').decode(bytes));
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n');
  const counts = [';', ',', '\t'].map((d) => [d, sample.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

// RFC-4180-artig: Anfuehrungszeichen, verdoppelte "" und Zeilenumbrueche
// innerhalb von Feldern (kommt im Verwendungszweck vor).
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

// --- Werte ---------------------------------------------------------------

// Betrag in Cent. Versteht "-1.234,56", "-1234.56", "1,234.56", "-12,5",
// "12,50 EUR", "+3.000,00". null, wenn nichts Lesbares drinsteht.
export function parseAmount(raw) {
  if (raw == null) return null;
  let text = String(raw).replace(/[€\s ]|EUR/gi, '');
  if (text === '') return null;
  let sign = 1;
  if (text.startsWith('-') || text.startsWith('−')) { sign = -1; text = text.slice(1); }
  else if (text.startsWith('+')) text = text.slice(1);
  if (text.endsWith('-')) { sign = -1; text = text.slice(0, -1); }

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma >= 0) {
    text = text.replace(/,/g, '');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return sign * Math.round(Number(text) * 100);
}

// Datum als "JJJJ-MM-TT". Versteht 03.09.26, 03.09.2026, 2026-09-03,
// 2026-09-03 14:22:01, 2026-09-03T14:22:01Z und 09/03/2026 (Stripe, PayPal US).
export function parseDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  let m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, m[2], m[1]);
  }
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(m[1], m[2], m[3]);
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return iso(m[3], m[1], m[2]);
  return null;
}

function iso(year, month, day) {
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// --- Banken ----------------------------------------------------------------

const norm = (s) => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Jede Bank: woran man sie erkennt und welche Spalte was enthaelt. Die
// Spaltennamen werden normalisiert verglichen (ohne Umlaute, Leerzeichen,
// Gross/klein), damit "Begünstigter/Zahlungspflichtiger" und
// "Beguenstigter/Zahlungspflichtiger" gleich behandelt werden.
const BANKS = [
  {
    id: 'sparkasse',
    label: 'Sparkasse',
    detect: ['auftragskonto', 'buchungstag', 'beguenstigterzahlungspflichtiger'],
    columns: {
      date: ['buchungstag'],
      amount: ['betrag'],
      payee: ['beguenstigterzahlungspflichtiger', 'beguenstigterzahlungspflichtiger'],
      purpose: ['verwendungszweck'],
      kind: ['buchungstext'],
      currency: ['waehrung'],
      status: ['info'],
    },
    // "Umsatz vorgemerkt" ist noch nicht gebucht und kann sich aendern.
    skip: (r) => /vorgemerkt/i.test(r.status || ''),
  },
  {
    id: 'commerzbank',
    label: 'Commerzbank',
    detect: ['buchungstag', 'wertstellung', 'umsatzart', 'buchungstext'],
    columns: {
      date: ['buchungstag'],
      amount: ['betrag'],
      payee: [],
      purpose: ['buchungstext'],
      kind: ['umsatzart'],
      currency: ['waehrung'],
      category: ['kategorie'],
    },
  },
  {
    id: 'revolut',
    label: 'Revolut',
    detect: ['type', 'product', 'starteddate', 'completeddate', 'description'],
    altDetect: ['art', 'produkt', 'startdatum', 'abschlussdatum', 'beschreibung'],
    columns: {
      date: ['completeddate', 'abschlussdatum', 'starteddate', 'startdatum'],
      amount: ['amount', 'betrag'],
      fee: ['fee', 'gebuehr'],
      payee: ['description', 'beschreibung'],
      purpose: [],
      kind: ['type', 'art'],
      currency: ['currency', 'waehrung'],
      status: ['state', 'status'],
    },
    skip: (r) => r.status && !/completed|abgeschlossen/i.test(r.status),
  },
  {
    id: 'paypal',
    label: 'PayPal',
    detect: ['datum', 'zeitzone', 'name', 'typ', 'brutto', 'netto'],
    altDetect: ['date', 'timezone', 'name', 'type', 'gross', 'net'],
    columns: {
      date: ['datum', 'date'],
      amount: ['brutto', 'gross'],
      payee: ['name'],
      purpose: ['artikelbezeichnung', 'itemtitle', 'betreff', 'subject', 'hinweis', 'note'],
      kind: ['typ', 'type'],
      currency: ['waehrung', 'currency'],
      status: ['status'],
    },
    // Aufladungen vom Bankkonto und Waehrungsumrechnungen sind keine echten
    // Ausgaben - die eigentliche Zahlung steht in einer eigenen Zeile.
    skip: (r) => (r.status && !/abgeschlossen|completed/i.test(r.status))
      || /bankgutschrift|bank deposit|allgemeine abbuchung|general withdrawal|waehrungsumrechnung|wahrungsumrechnung|currency conversion|autorisierung|authorization|ruckbuchung|reversal/i.test(norm(r.kind || '') + ' ' + (r.kind || '')),
  },
  {
    id: 'stripe',
    label: 'Stripe',
    detect: ['id', 'type', 'amount', 'fee', 'net', 'currency', 'createdutc'],
    columns: {
      date: ['createdutc', 'created', 'availableonutc'],
      amount: ['net', 'amount'],
      payee: ['description'],
      purpose: ['source'],
      kind: ['type', 'reportingcategory'],
      currency: ['currency'],
    },
    // Auszahlungen aufs Bankkonto tauchen dort noch einmal als Eingang auf.
    skip: (r) => /payout/i.test(r.kind || ''),
  },
];

const GENERIC = {
  id: 'csv',
  label: 'CSV',
  columns: {
    date: ['buchungstag', 'buchungsdatum', 'datum', 'date', 'valuta', 'wertstellung', 'bookingdate', 'transactiondate', 'zahlungsdatum'],
    amount: ['betrag', 'betrageur', 'betraginEUR'.toLowerCase(), 'amount', 'umsatz', 'brutto', 'gross', 'value', 'summe'],
    payee: ['empfaenger', 'zahlungsempfaenger', 'beguenstigterzahlungspflichtiger', 'auftraggeberempfaenger', 'name', 'payee', 'counterparty', 'merchant', 'description', 'beschreibung', 'gegenseite'],
    purpose: ['verwendungszweck', 'buchungstext', 'reference', 'referenz', 'memo', 'details', 'betreff'],
    kind: ['typ', 'type', 'umsatzart', 'transactiontype'],
    currency: ['waehrung', 'currency'],
    status: ['status', 'state'],
  },
};

function findHeaderRow(rows) {
  // Manche Banken schreiben Kontoinfos ueber die Tabelle. Die Kopfzeile ist
  // die erste Zeile mit einer Datums- und einer Betragsspalte.
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const cells = rows[i].map(norm);
    const hasDate = cells.some((c) => GENERIC.columns.date.includes(c) || /datum|date|created/.test(c));
    const hasAmount = cells.some((c) => GENERIC.columns.amount.includes(c) || /betrag|amount|brutto|gross/.test(c));
    if (hasDate && hasAmount) return i;
  }
  return -1;
}

function detectBank(headers) {
  const set = new Set(headers);
  const matches = (list) => list && list.every((h) => set.has(h));
  return BANKS.find((b) => matches(b.detect) || matches(b.altDetect)) || GENERIC;
}

function columnIndex(headers, names) {
  for (const name of names || []) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

// Liest eine Datei und gibt Buchungen in einheitlicher Form zurueck:
//   { date, amount (Cent, Ausgaben negativ), payee, purpose, kind, source }
export function readStatement(text, fileName = '') {
  const rows = parseCsv(text);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) {
    return { bank: null, transactions: [], skipped: 0, error: 'In der Datei wurde keine Umsatztabelle gefunden (Datum und Betrag fehlen).' };
  }
  const headers = rows[headerIndex].map(norm);
  const bank = detectBank(headers);
  const col = {};
  for (const [key, names] of Object.entries(bank.columns)) {
    col[key] = columnIndex(headers, names);
    // Bekannte Bank, aber Spalte anders benannt: auf allgemeine Namen zurueckfallen.
    if (col[key] < 0 && GENERIC.columns[key]) col[key] = columnIndex(headers, GENERIC.columns[key]);
  }
  if (col.date < 0 || col.amount < 0) {
    return { bank, transactions: [], skipped: 0, error: 'Datums- oder Betragsspalte nicht erkannt.' };
  }

  const pick = (row, key) => (col[key] >= 0 ? row[col[key]] || '' : '');
  const transactions = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const raw = {
      date: parseDate(pick(row, 'date')),
      amount: parseAmount(pick(row, 'amount')),
      payee: pick(row, 'payee'),
      purpose: pick(row, 'purpose'),
      kind: pick(row, 'kind'),
      currency: pick(row, 'currency'),
      status: pick(row, 'status'),
      category: pick(row, 'category'),
    };
    if (!raw.date || raw.amount == null || raw.amount === 0) { skipped += 1; continue; }
    if (raw.currency && !/^(eur|€)?$/i.test(raw.currency)) { skipped += 1; continue; }
    if (bank.skip && bank.skip(raw)) { skipped += 1; continue; }
    const fee = col.fee >= 0 ? parseAmount(pick(row, 'fee')) : null;
    // Revolut fuehrt Gebuehren getrennt und positiv.
    const amount = fee ? raw.amount - Math.abs(fee) : raw.amount;
    transactions.push({
      date: raw.date,
      amount,
      payee: cleanPayee(raw.payee || raw.purpose || raw.kind),
      purpose: raw.purpose,
      kind: raw.kind,
      source: bank.label,
      file: fileName,
    });
  }
  return { bank, transactions, skipped, error: null };
}

// Commerzbank hat keine eigene Empfaengerspalte - der Empfaenger steht am
// Anfang des Buchungstexts. Lange Referenzen und Kartennummern stoeren
// beim Gruppieren und werden abgeschnitten.
export function cleanPayee(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(End-to-End-Ref\.?|Mandatsref\.?|Gläubiger-ID|Kartenzahlung|Kartennr\.?|SEPA-?Lastschrift|Lastschrift|Überweisung|Dauerauftrag|Folgelastschrift|Erstlastschrift)\b.*$/i, '').trim();
  s = s.replace(/\/\/.*$/, '').trim();
  s = s.replace(/\b\d{6,}\b.*$/, '').trim();
  return s.slice(0, 60) || 'Unbekannt';
}
