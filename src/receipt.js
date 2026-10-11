// Kassenbon-Text (aus der Texterkennung) in Laden, Datum, Summe und Artikel
// zerlegen. Kassenbons sind sich ueberall aehnlich: eine Zeile pro Artikel
// mit dem Preis am Ende, darunter SUMME, dann Zahlung und Steuer. Die
// Texterkennung macht Fehler - deshalb wird grosszuegig gelesen und die
// Nutzerin prueft das Ergebnis.

import { parseDate } from './import/csv.js';

const SHOPS = [
  'EDEKA', 'REWE', 'ALDI SÜD', 'ALDI SUED', 'ALDI NORD', 'ALDI', 'LIDL', 'NETTO', 'PENNY', 'KAUFLAND', 'GLOBUS', 'TEGUT', 'NORMA', 'MARKTKAUF',
  'DM', 'ROSSMANN', 'MÜLLER', 'BUDNI', 'ALNATURA', "DENN'S", 'BIOMARKT', 'IKEA', 'ACTION', 'TEDI', 'KIK',
  'HIT', 'TEDI', 'CENTERSHOP', 'DEICHMANN', 'H&M', 'PRIMARK', 'THALIA', 'HORNBACH', 'OBI', 'BAUHAUS', 'TOOM', 'APOTHEKE', 'BÄCKEREI',
];

// Schreibweise wie auf dem Ladenschild; alles andere bleibt in Grossbuchstaben.
const SHOP_DISPLAY = {
  DM: 'dm', TEDI: 'TEDi', 'ALDI NORD': 'ALDI Nord', 'ALDI SUED': 'ALDI SÜD', ROSSMANN: 'Rossmann', MÜLLER: 'Müller', KAUFLAND: 'Kaufland', GLOBUS: 'Globus', TEGUT: 'tegut',
  MARKTKAUF: 'Marktkauf', ALNATURA: 'Alnatura', BIOMARKT: 'Biomarkt', ACTION: 'Action', DEICHMANN: 'Deichmann',
  PRIMARK: 'Primark', THALIA: 'Thalia', HORNBACH: 'Hornbach', BAUHAUS: 'Bauhaus', TOOM: 'toom',
  APOTHEKE: 'Apotheke', BÄCKEREI: 'Bäckerei', BUDNI: 'Budni', NORMA: 'Norma', PENNY: 'PENNY', NETTO: 'Netto',
};

// Zeilen, nach denen keine Artikel mehr kommen.
const TOTAL = /^(summe|zu zahlen|gesamt(betrag)?|total|endbetrag|endsumme|rechnungsbetrag|bruttobetrag|zahlbetrag|betrag\b|sum\b)/i;
// Zwischensummen (vor allem auf Rechnungen) sind weder Artikel noch Endbetrag.
const SUBTOTAL = /^(zwischensumme|warenwert|nettobetrag|netto)|^(summe|gesamt\w*)\s*\(?netto/i;
// Zeilen, die nie Artikel sind.
const NOISE = /(mwst|mw\.?-?st|\bust\b|steuer|netto|brutto|rückgeld|rueckgeld|gegeben|\bbar\b|ec-?cash|girocard|kartenzahlung|visa|mastercard|maestro|kontaktlos|terminal|beleg|\btse\b|signatur|transaktion|kassierer|bon-?nr|filiale|vielen dank|öffnungszeiten|www\.|\btel\b\.?|ust-?id|st\.?-?nr|payback|treuepunkte|^eur$|^€$|^\*+$)/i;
const QUANTITY = /^\s*-?\d+([.,]\d+)?\s*(x|stk|st\.?|kg)\s*[x*]?\s*\d+[.,]\d{2}/i;
const DISCOUNT = /(rabatt|nachlass|coupon|gutschein|aktion|preisvorteil|sie sparen|ersparnis|mitarbeiter)/i;

// "8,99", "8.99", "8 ,99", "8,99-", "-1,00" am Zeilenende, gefolgt
// hoechstens von einem Steuerkennzeichen (A, B, 1, 2, *, bei EDEKA auch "AW" oder "*A").
const PRICE_AT_END = /(-?)\s*(\d{1,3}(?:\.\d{3})+|\d{1,5})\s*[.,]\s*(\d{2})\s*(-?)\s*(?:[A-DW12*]{1,3}|€|EUR)?\s*$/i;

function toCents(sign1, euros, cents, sign2) {
  const value = Number(String(euros).replace(/\./g, '')) * 100 + Number(cents); // "1.234" = Tausenderpunkt
  return sign1 === '-' || sign2 === '-' ? -value : value;
}

// Rechnungstabelle: "1 Kinderschreibtisch 1 1.149,00 €" (Pos., Artikel,
// Menge, Einzelpreis) - nur der Artikel bleibt.
const INVOICE_ROW = /\s+\d+([.,]\d+)?\s+\d{1,3}(\.\d{3})*,\d{2}\s*(€|eur)?\s*$/i;

function cleanName(text) {
  const invoiceRow = INVOICE_ROW.test(text);
  return text
    .replace(INVOICE_ROW, '')
    .replace(invoiceRow ? /^\d{1,3}\s+(?=[A-Za-zÄÖÜäöü])/ : /^$/, '') // Positionsnummer
    .replace(/^\d{4,}\s+/, '') // Artikelnummer am Anfang
    .replace(/\s+\d+[.,]\d{2}\s*(€|eur)?\s*[x*]\s*\d+([.,]\d+)?\s*$/i, '') // "1,69 € x 4" (Stueckpreis x Menge)
    .replace(/\s{2,}/g, ' ')
    .replace(/[|_~]+/g, ' ')
    .replace(/\s+[A-D12*]$/i, '')
    .trim();
}

export function detectShop(lines) {
  for (const line of lines.slice(0, 8)) {
    const upper = line.toUpperCase();
    const shop = SHOPS.find((s) => new RegExp(`(^|[^A-ZÄÖÜ])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-ZÄÖÜ]|$)`).test(upper));
    if (shop) return SHOP_DISPLAY[shop] || shop;
  }
  const first = lines.find((l) => /[a-zäöü]{3,}/i.test(l));
  return first ? first.slice(0, 30) : '';
}

export function parseReceipt(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const shop = detectShop(lines);
  let date = null;
  let total = null;
  const items = [];
  let afterTotal = false;

  for (const line of lines) {
    if (!date) {
      const m = line.match(/\b(\d{1,2}\.\d{1,2}\.\d{2,4})\b/);
      if (m) date = parseDate(m[1]);
    }
    const price = line.match(PRICE_AT_END);
    if (SUBTOTAL.test(line)) continue;
    if (TOTAL.test(line)) {
      if (price && total == null) total = Math.abs(toCents(price[1], price[2], price[3], price[4]));
      afterTotal = true;
      continue;
    }
    if (afterTotal || !price) continue;
    if (QUANTITY.test(line)) continue; // "2 x 1,19" - der Gesamtpreis steht in der Artikelzeile
    const name = cleanName(line.slice(0, price.index));
    if (NOISE.test(line)) continue;
    const amount = toCents(price[1], price[2], price[3], price[4]);

    if (amount < 0 || DISCOUNT.test(name)) {
      // Rabatt gehoert zum Artikel davor.
      const previous = items[items.length - 1];
      if (previous) previous.amount = Math.max(0, previous.amount - Math.abs(amount));
      continue;
    }
    if (!/[a-zäöüß]{2,}/i.test(name)) continue; // nur Zahlen/Zeichensalat
    items.push({ name: titleCase(name), amount });
  }

  const sum = items.reduce((s, i) => s + i.amount, 0);
  // printedTotal: die Summe, die wirklich auf dem Bon steht (sonst null).
  return { shop, date, total: total ?? (sum || null), printedTotal: total, items, sum };
}

// Kassen drucken GROSS. "KORO ERDNUSSBUTTER" liest sich als
// "Koro Erdnussbutter" angenehmer; gemischte Schreibung bleibt, wie sie ist.
function titleCase(name) {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s/.-])([a-zäöü])/g, (m, pre, ch) => pre + ch.toUpperCase());
}

// Lange Bons werden in mehreren Fotos aufgenommen, von oben nach unten.
// Die Texte werden aneinandergehaengt; Zeilen, die durch Ueberlappung am
// Ende des einen und am Anfang des naechsten Fotos stehen, nur einmal.
// Die Texterkennung liest dieselbe Zeile nicht immer gleich - verglichen
// wird deshalb nur das Grobe (Buchstaben und Ziffern, ohne Gross/klein).
const roughLine = (line) => line.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

// Fast gleich: hoechstens jedes fuenfte Zeichen anders (Levenshtein).
function similar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) / 5) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length] <= Math.max(a.length, b.length) / 5;
}

export function joinParts(texts) {
  let lines = [];
  for (const text of texts) {
    const next = String(text || '').split(/\r?\n/).filter((l) => l.trim());
    let overlap = 0;
    for (let k = Math.min(12, lines.length, next.length); k > 0; k -= 1) {
      const tail = lines.slice(-k).map(roughLine);
      const head = next.slice(0, k).map(roughLine);
      if (tail.every((l, i) => similar(l, head[i]))) { overlap = k; break; }
    }
    lines = lines.concat(next.slice(overlap));
  }
  return lines.join('\n');
}

// Ist das dieselbe Bonzeile, nur auf zwei Fotos (und vielleicht angeschnitten
// oder leicht anders gelesen)? Der Preis zaehlt mehr als der Name.
function sameLine(a, b) {
  const na = roughLine(a.name);
  const nb = roughLine(b.name);
  const nameLoose = similarLoose(na, nb);
  if (a.amount === b.amount) return nameLoose || na.length < 4 || nb.length < 4;
  // Preis leicht verlesen (1,99 / 1,98), Name aber eindeutig gleich.
  return similar(na, nb) && Math.abs(a.amount - b.amount) <= Math.max(10, a.amount * 0.1);
}

// Locker aehnlich: angeschnittene Zeilen ("üsse" statt "nüsse") oder
// hoechstens jedes zweite Zeichen anders.
function similarLoose(a, b) {
  if (!a || !b) return false;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && (l.endsWith(s.slice(-4)) || l.startsWith(s.slice(0, 4)))) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length] <= Math.max(a.length, b.length) / 2;
}

// Mehrere Fotos eines Bons: jedes Foto einzeln lesen, Artikel aneinander-
// haengen und am Uebergang doppelte Zeilen (Ueberlappung) nur einmal zaehlen.
// Jeder Artikel weiss, von welchem Foto er stammt (part).
export function parseParts(texts) {
  const parsed = texts.map((t) => parseReceipt(t));
  const items = [];
  const boundaries = [];
  parsed.forEach((r, part) => {
    let next = r.items.map((it) => ({ ...it, part }));
    if (part > 0 && items.length) {
      // Laengste Ueberlappung: letzte k Artikel = erste k Artikel.
      let overlap = 0;
      for (let k = Math.min(6, items.length, next.length); k > 0; k -= 1) {
        const tail = items.slice(-k);
        if (tail.every((it, i) => sameLine(it, next[i]))) { overlap = k; break; }
      }
      boundaries.push({ part, index: items.length, removed: next.slice(0, overlap) });
      next = next.slice(overlap);
    }
    items.push(...next);
  });
  const printedTotal = parsed.map((r) => r.printedTotal).find((t) => t != null) ?? null;
  // Gegenprobe mit der Summe: Fehlt nach dem Entfernen genau eine entfernte
  // Zeile, war sie doch echt (z. B. zweimal dieselben Nuesse gekauft).
  let sum = items.reduce((s, i) => s + i.amount, 0);
  if (printedTotal != null && sum < printedTotal) {
    for (const b of [...boundaries].reverse()) {
      for (const it of b.removed) {
        if (sum + it.amount <= printedTotal && printedTotal - sum === it.amount) {
          items.splice(b.index, 0, it);
          sum += it.amount;
          b.restored = (b.restored || 0) + 1;
        }
      }
    }
  }
  for (const b of boundaries) b.removed = b.removed.length - (b.restored || 0);
  return {
    shop: parsed.find((r) => r.shop)?.shop || '',
    date: parsed.map((r) => r.date).find(Boolean) || null,
    total: printedTotal ?? (sum || null),
    printedTotal,
    items,
    sum,
    boundaries,
  };
}

// Nachrechnen: Ergeben die Artikel die Summe auf dem Bon? Wenn nicht, welche
// Zeile ist vermutlich doppelt (zu viel) - bevorzugt am Foto-Uebergang oder
// direkt hintereinander gleich?
export function checkSum(items, total) {
  const sum = items.reduce((s, i) => s + (i.amount || 0), 0);
  if (!total) return { status: 'unknown', sum, diff: 0, suspects: [] };
  const diff = sum - total;
  if (diff === 0) return { status: 'ok', sum, diff, suspects: [] };
  if (diff < 0) return { status: 'missing', sum, diff, suspects: [] };
  const score = (i) => {
    const it = items[i];
    const prev = items[i - 1];
    let s = 0;
    if (prev && prev.part !== it.part) s += 2; // erste Zeile eines neuen Fotos
    if (prev && sameLine(prev, it)) s += 2; // gleiche Zeile direkt davor
    if (items.some((o, j) => j !== i && o.amount === it.amount && similarLoose(roughLine(o.name), roughLine(it.name)))) s += 1;
    return s;
  };
  const suspects = items
    .map((it, i) => i)
    .filter((i) => items[i].amount === diff)
    .sort((a, b) => score(b) - score(a));
  return { status: 'over', sum, diff, suspects };
}
