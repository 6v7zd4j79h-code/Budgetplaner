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

// hidden: Artikel (itemKey), die jemand als "kein regelmaessiger Einkauf"
// markiert hat - z. B. Halloween-Deko aus dem Angebot.
export function regularItems(log, { today = todayISO(), months = 6, minCount = 2, hidden = [] } = {}) {
  const hiddenKeys = new Set(hidden);
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
    .filter((i) => i.count >= minCount && !hiddenKeys.has(i.key))
    .sort((a, b) => b.count - a.count || b.spent - a.spent || a.name.localeCompare(b.name, 'de'));

  return {
    from,
    receipts: entries.length,
    articles: all.length,
    items,
    hiddenItems: all.filter((i) => hiddenKeys.has(i.key)).map((i) => ({ key: i.key, name: i.name })),
    shops: [...shops.values()].sort((a, b) => b.receipts - a.receipts || b.spent - a.spent),
  };
}

// Fuer den Essensplan (z. B. im Familienplaner): was in den letzten Tagen
// eingekauft wurde, als schlichte Liste ohne Preise, Laeden oder Konten -
// zum Kopieren und Einfuegen. Geschenke, Pfand und Tueten fallen weg.
// foodOnly: nur Artikel aus Kategorien wie "Lebensmittel"; Artikel ohne
// Kategorie bleiben drin, damit nichts verloren geht.
const FOOD = /lebensmittel|essen|nahrung|einkauf|supermarkt|getränk|getraenk|haushalt|food/i;

// Vorrat: was in den letzten Wochen auf Vorrat gekauft wurde - mit dem Haken
// "Vorrat" oder mindestens BULK Stueck auf einem Bon. Die App zaehlt nicht
// mit, was verbraucht ist; sie erinnert nur, damit nichts doppelt gekauft
// wird. used: { itemKey: Datum } - "ist aufgebraucht", gilt bis zum naechsten
// Vorratskauf.
const BULK = 3;

export function stockItems(log, { today = todayISO(), days = 42, used = {} } = {}) {
  const from = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - (days - 1)))
    .toISOString().slice(0, 10);
  const byKey = new Map();
  for (const entry of log || []) {
    if (!Array.isArray(entry.items) || entry.date < from || entry.date > today || entry.gift) continue;
    const here = new Map();
    for (const item of entry.items) {
      const key = itemKey(item.name);
      if (!key || SKIP.test(key) || item.gift || !(item.amount > 0)) continue;
      const h = here.get(key) || { key, name: item.name, pieces: 0, flagged: false, lineId: item.lineId || entry.lineId || null };
      h.pieces += 1;
      if (item.stock) h.flagged = true;
      here.set(key, h);
    }
    for (const h of here.values()) {
      if (!h.flagged && h.pieces < BULK) continue;
      if (used[h.key] && used[h.key] >= entry.date) continue;
      const prev = byKey.get(h.key);
      if (!prev || entry.date > prev.date) byKey.set(h.key, { ...h, date: entry.date, shop: shopName(entry.note) });
    }
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'de'));
}

// Passt ein Suchwort wie "Nudeln" zu einem Vorratsartikel ("Bio Nudeln 500g")?
export function stockFor(term, stock) {
  const word = String(term || '').toLowerCase();
  return word ? stock.find((s) => s.key.split(' ').includes(word)) || null : null;
}

export function mealPlanItems(data, { today = todayISO(), days = 7, foodOnly = true } = {}) {
  const from = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - (days - 1)))
    .toISOString().slice(0, 10);
  const lineName = (date, id) => (id && data.months?.[monthKey(date)]?.lines?.expenses?.find((l) => l.id === id)?.name) || '';
  const entries = (data.log || [])
    .filter((e) => Array.isArray(e.items) && e.items.length && e.date >= from && e.date <= today && !e.gift)
    .sort((a, b) => a.date.localeCompare(b.date));

  const byKey = new Map();
  for (const entry of entries) {
    for (const item of entry.items) {
      const key = itemKey(item.name);
      if (!key || SKIP.test(key) || item.gift) continue;
      const category = lineName(entry.date, item.lineId || entry.lineId);
      if (foodOnly && category && !FOOD.test(category)) continue;
      const stat = byKey.get(key) || { name: item.name, count: 0 };
      stat.count += 1;
      stat.name = item.name;
      byKey.set(key, stat);
    }
  }
  const items = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  // Was frueher auf Vorrat gekauft wurde und vermutlich noch da ist.
  const stock = stockItems(data.log, { today, used: data.stockUsed || {} })
    .filter((s) => s.date < from && !byKey.has(s.key))
    .filter((s) => { const c = lineName(s.date, s.lineId); return !foodOnly || !c || FOOD.test(c); });
  return { from, to: today, receipts: entries.length, items, stock };
}

export function mealPlanText({ from, to, items, stock = [] }) {
  const day = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  const lines = items.length ? [`Eingekauft ${day(from)}–${day(to)}:`, ...items.map((i) => `- ${i.name}${i.count > 1 ? ` (${i.count}×)` : ''}`)] : [];
  if (stock.length) {
    if (lines.length) lines.push('');
    lines.push('Auf Vorrat (vermutlich noch da):', ...stock.map((s) => `- ${s.name} (${s.pieces > 1 ? `${s.pieces}×, ` : ""}${day(s.date)})`));
  }
  return lines.join('\n');
}
