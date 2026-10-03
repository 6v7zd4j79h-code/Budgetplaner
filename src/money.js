// Geldbetraege werden intern als ganze Cent gespeichert. Mit Kommazahlen
// wuerde aus 0,10 + 0,20 irgendwann 0,30000000000000004 - bei einem
// Haushaltsbuch ist das genau der Fehler, der Vertrauen kostet.

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euroRound = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function formatCents(cents, { round = false } = {}) {
  const value = (Number.isFinite(cents) ? cents : 0) / 100;
  return (round ? euroRound : euro).format(value);
}

// Zahl fuer ein Eingabefeld: "1234,5" statt "1.234,50 €", leer bei null.
export function centsToInput(cents) {
  if (cents == null || !Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const text = rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

// Liest, was Menschen in ein Betragsfeld tippen: "12,50", "12.50",
// "1.234,56", "1234", "€ 9,99". Gibt null zurueck, wenn nichts Sinnvolles
// drinsteht - leer ist etwas anderes als 0.
export function parseMoney(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  if (typeof input !== 'string') return null;
  let text = input.replace(/[€\s ]/g, '');
  if (text === '' || text === '-') return null;
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);

  if (text.includes(',')) {
    // Deutsches Format: Punkte sind Tausendertrenner, Komma ist das Dezimalzeichen.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // "1.234" oder "12.345.678" - nur Tausenderpunkte.
    text = text.replace(/\./g, '');
  }
  if (!/^\d*\.?\d*$/.test(text) || text === '.') return null;

  const cents = Math.round(Number(text) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}
