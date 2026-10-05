// Unnoetige Ausgaben: Was haette nicht sein muessen? Eine Buchung kann als
// Ganzes unnoetig sein (Lieferando aus Langeweile) oder einzelne Artikel
// enthalten, von denen manche unnoetig waren (die 18-Euro-Gewuerzmischung
// im EDEKA-Einkauf).
//
// Buchung im Log, erweitert:
//   { ..., waste: true }                       ganze Buchung unnoetig
//   { ..., items: [{ id, name, amount, waste }] }  einzelne Artikel

import { logForMonth } from './budget.js';

export function entryWaste(entry) {
  if (entry.waste) return entry.amount;
  if (!Array.isArray(entry.items)) return 0;
  return entry.items.reduce((sum, item) => sum + (item.waste ? item.amount : 0), 0);
}

// Betrag der Buchung, der keinem Artikel zugeordnet ist.
export function entryRest(entry) {
  if (!Array.isArray(entry.items)) return entry.amount;
  return entry.amount - entry.items.reduce((sum, item) => sum + item.amount, 0);
}

export function monthWaste(log, key, names = {}) {
  const entries = logForMonth(log, key);
  const spent = entries.reduce((sum, e) => sum + e.amount, 0);
  const items = [];
  for (const entry of entries) {
    const shop = entry.note || names[entry.lineId] || 'Ohne Notiz';
    if (entry.waste) {
      items.push({ name: shop, shop, amount: entry.amount, date: entry.date, whole: true });
    } else if (Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (item.waste) items.push({ name: item.name, shop, amount: item.amount, date: entry.date, whole: false });
      }
    }
  }
  items.sort((a, b) => b.amount - a.amount);
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const byShop = {};
  for (const item of items) byShop[item.shop] = (byShop[item.shop] || 0) + item.amount;
  return {
    total,
    spent,
    share: spent > 0 ? total / spent : 0,
    items,
    byShop: Object.entries(byShop).map(([shop, amount]) => ({ shop, amount })).sort((a, b) => b.amount - a.amount),
  };
}

// Artikelnamen fuer das Merken vereinheitlichen: "KoRo Erdnussbutter 500g"
// und "KORO ERDNUSSBUTTER" sollen derselbe Artikel sein.
export function itemKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\d+([.,]\d+)?\s*(g|kg|ml|l|st|stk|x)\b/g, ' ')
    .replace(/[^a-zäöüß ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hat die Nutzerin diesen Artikel schon einmal eingeordnet?
export function rememberedWaste(rules, name) {
  const key = itemKey(name);
  return key && Object.prototype.hasOwnProperty.call(rules || {}, key) ? rules[key] : null;
}
