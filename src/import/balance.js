// Startbetrag eines Monats aus Kontoauszuegen: Kontostand am Morgen des
// Monatsersten, ueber alle eingelesenen Konten zusammen.
//
// Drei Wege, je nachdem was die Bank liefert:
//   1. Saldo je Zeile (Revolut): Saldo nach der ersten Buchung im Monat
//      minus deren Betrag.
//   2. Kontostand ueber der Tabelle mit Datum: von dort aus zurueck- oder
//      vorwaertsrechnen.
//   3. Nichts davon (Sparkasse, Commerzbank): Die Nutzerin nennt den
//      heutigen Kontostand, die App rechnet die Umsaetze seit dem
//      Monatsersten heraus.

const sum = (list) => list.reduce((s, t) => s + t.amount, 0);

// Buchungen in zeitlicher Reihenfolge. Banken exportieren mal aufsteigend,
// mal absteigend - innerhalb eines Tages bleibt die Dateireihenfolge.
function chronological(transactions) {
  if (transactions.length < 2) return transactions;
  const first = transactions[0].date;
  const last = transactions[transactions.length - 1].date;
  return first > last ? [...transactions].reverse() : transactions;
}

export function openingBalance(file, key) {
  if (!file.account) return { value: null, how: 'none' };
  const monthStart = `${key}-01`;
  const list = chronological(file.transactions);

  const withBalance = list.filter((t) => t.balance != null);
  if (withBalance.length) {
    const firstInMonth = withBalance.find((t) => t.date >= monthStart);
    if (firstInMonth) return { value: firstInMonth.balance - firstInMonth.amount, how: 'column' };
    // Nur Buchungen vor dem Monat: Stand nach der letzten davon.
    const lastBefore = [...withBalance].reverse().find((t) => t.date < monthStart);
    if (lastBefore) return { value: lastBefore.balance, how: 'column' };
  }

  const pre = file.preamble;
  if (pre && pre.balance != null && pre.date) {
    if (pre.date >= monthStart) {
      // Stand am Stichtag minus alles, was seit dem Monatsersten bis dahin gebucht wurde.
      return { value: pre.balance - sum(list.filter((t) => t.date >= monthStart && t.date <= pre.date)), how: 'preamble' };
    }
    return { value: pre.balance + sum(list.filter((t) => t.date > pre.date && t.date < monthStart)), how: 'preamble' };
  }
  return { value: null, how: 'ask' };
}

// Weg 3: heutiger Kontostand laut Banking-App.
export function openingFromToday(file, key, todayBalance) {
  const monthStart = `${key}-01`;
  return todayBalance - sum(file.transactions.filter((t) => t.date >= monthStart));
}
