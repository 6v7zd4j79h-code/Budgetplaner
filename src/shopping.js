// Regelmaessige Einkaeufe: Aus den Artikeln der gescannten Kassenbons (und
// von Hand eingetragenen Artikeln) wird abgelesen, was immer wieder gekauft
// wird - wie oft, wo und zu welchem Preis. Das ist die Grundlage fuer
// spaetere Spartipps (z. B. "Butter ist diese Woche bei Lidl im Angebot").

import { addMonths, monthKey, todayISO } from './dates.js';
import { detectShop } from './receipt.js';
import { itemKey } from './waste.js';

// Was auf dem Bon steht, aber kein Artikel ist, den man "kauft".
const SKIP = /^(pfand|leergut|einweg|mehrweg|tragetasche|tasche|tüte|tuete|papiertüte|papiertuete)\b/;

const dayNumber = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

// "REWE Markt GmbH Neustadt" (aus dem Kontoauszug) und "REWE" (vom Bon)
// sollen derselbe Laden sein.
export function shopName(note) {
  const text = String(note || '').trim();
  return text ? detectShop([text]) || text : 'Unbekannt';
}

export function regularItems(log, { today = todayISO(), months = 6, minCount = 2 } = {}) {
  const from = `${addMonths(monthKey(today), -(months - 1))}-01`;
  const entries = (log || []).filter((e) => Array.isArray(e.items) && e.items.length && e.date >= from && e.date <= today);

  const byKey = new Map();
  const shops = new Map();
  for (const entry of entries) {
    const shop = shopName(entry.note);
    const s = shops.get(shop) || { shop, receipts: 0, spent: 0 };
    s.receipts += 1;
    s.spent += entry.amount || 0;
    shops.set(shop, s);

    const seen = new Set(); // Artikel, die in diesem Einkauf schon gezaehlt sind
    for (const item of entry.items) {
      const key = itemKey(item.name);
      if (!key || SKIP.test(key) || !(item.amount > 0)) continue;
      let stat = byKey.get(key);
      if (!stat) {
        stat = { key, name: item.name, entries: new Set(), dates: new Set(), pieces: 0, spent: 0, lastDate: '', lastPrice: 0, lastShop: '', byShop: new Map() };
        byKey.set(key, stat);
      }
      stat.entries.add(entry.id);
      stat.dates.add(entry.date);
      stat.pieces += 1;
      stat.spent += item.amount;
      if (entry.date >= stat.lastDate) {
        stat.lastDate = entry.date;
        stat.lastPrice = item.amount;
        stat.lastShop = shop;
        stat.name = item.name;
      }
      const at = stat.byShop.get(shop) || { shop, count: 0, lastDate: '', lastPrice: 0 };
      if (!seen.has(key)) { seen.add(key); at.count += 1; }
      if (entry.date >= at.lastDate) { at.lastDate = entry.date; at.lastPrice = item.amount; }
      stat.byShop.set(shop, at);
    }
  }

  const all = [...byKey.values()].map((stat) => {
    const dates = [...stat.dates].sort();
    const count = stat.entries.size;
    const shopsList = [...stat.byShop.values()].sort((a, b) => b.count - a.count || a.lastPrice - b.lastPrice);
    const usual = shopsList[0];
    const cheapest = shopsList.reduce((best, s) => (s.lastPrice < best.lastPrice ? s : best), usual);
    const saving = usual.lastPrice - cheapest.lastPrice;
    return {
      key: stat.key,
      name: stat.name,
      count,
      pieces: stat.pieces,
      spent: stat.spent,
      lastDate: stat.lastDate,
      lastPrice: stat.lastPrice,
      lastShop: stat.lastShop,
      // Durchschnittlicher Abstand zwischen zwei Einkaeufen in Tagen.
      everyDays: dates.length > 1 ? Math.round((dayNumber(dates.at(-1)) - dayNumber(dates[0])) / (dates.length - 1)) : null,
      shops: shopsList.map(({ shop, count: c, lastPrice }) => ({ shop, count: c, lastPrice })),
      // Zuletzt woanders guenstiger gekauft als im ueblichen Laden?
      cheaper: cheapest !== usual && saving >= 5 ? { shop: cheapest.shop, price: cheapest.lastPrice, saving, usual: usual.shop } : null,
    };
  });

  const items = all
    .filter((i) => i.count >= minCount)
    .sort((a, b) => b.count - a.count || b.spent - a.spent || a.name.localeCompare(b.name, 'de'));

  return {
    from,
    receipts: entries.length,
    articles: all.length,
    items,
    shops: [...shops.values()].sort((a, b) => b.receipts - a.receipts || b.spent - a.spent),
  };
}
