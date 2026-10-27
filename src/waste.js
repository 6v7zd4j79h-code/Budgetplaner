// Unnoetige Ausgaben: Was haette nicht sein muessen? Eine Buchung kann als
// Ganzes unnoetig sein (Lieferando aus Langeweile) oder einzelne Artikel
// enthalten, von denen manche unnoetig waren (die 18-Euro-Gewuerzmischung
// im EDEKA-Einkauf).
//
// Buchung im Log, erweitert:
//   { ..., waste: true }                       ganze Buchung unnoetig
//   { ..., items: [{ id, name, amount, waste }] }  einzelne Artikel
//
// Warum unnoetig? Den Grund (why) traegt Mareike spaeter ein, wann sie
// moechte (z. B. sonntags alles durchgehen) - nie beim Anhaken. Freiwillig.
//   { ..., waste: true, why: 'need' } bzw. item.why

import { logForMonth } from './budget.js';
import { addMonths, todayISO } from './dates.js';

export const WASTE_REASONS = [
  { id: 'need', name: 'Bedürfnis', icon: '💗', hint: 'z. B. Schokolade an schweren Tagen' },
  { id: 'try', name: 'Ausprobieren', icon: '🧪', hint: 'mal probieren wollen' },
  { id: 'deal', name: 'Angebot', icon: '🏷', hint: 'weil es günstig war' },
  { id: 'impulse', name: 'Spontan', icon: '⚡', hint: 'einfach mitgenommen' },
  { id: 'reward', name: 'Belohnung', icon: '🎉', hint: 'sich etwas gönnen' },
  { id: 'other', name: 'Sonstiges', icon: '💭', hint: '' },
];

export const reasonOf = (id) => WASTE_REASONS.find((r) => r.id === id) || null;

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
      items.push({ name: shop, shop, amount: entry.amount, date: entry.date, whole: true, why: entry.why || null, ref: entry.id });
    } else if (Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (item.waste) items.push({ name: item.name, shop, amount: item.amount, date: entry.date, whole: false, why: item.why || null, ref: `${entry.id}:${item.id}` });
      }
    }
  }
  items.sort((a, b) => b.amount - a.amount);
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const byShop = {};
  for (const item of items) byShop[item.shop] = (byShop[item.shop] || 0) + item.amount;
  // Gruende: wie oft und wie viel - nur die, die schon eingetragen sind.
  const byWhy = WASTE_REASONS.map((r) => {
    const mine = items.filter((i) => i.why === r.id);
    return { ...r, count: mine.length, amount: mine.reduce((sum, i) => sum + i.amount, 0) };
  }).filter((r) => r.count);
  return {
    total,
    spent,
    share: spent > 0 ? total / spent : 0,
    items,
    byWhy,
    open: items.filter((i) => !reasonOf(i.why)).length,
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

// Erinnerung zum Monatsende: Gibt es unnoetige Kaeufe ohne Grund? Gilt in den
// letzten drei Tagen eines Monats (fuer diesen Monat) und in der ersten Woche
// des naechsten (fuer den Vormonat). off: { '2026-10': true } = weggeklickt.
export function wasteReminder(log, { today = todayISO(), off = {} } = {}) {
  const day = Number(today.slice(8, 10));
  const key = today.slice(0, 7);
  const last = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  const month = day >= last - 2 ? key : day <= 7 ? addMonths(key, -1) : null;
  if (!month || off[month]) return null;
  const open = monthWaste(log || [], month).open;
  return open ? { month, open } : null;
}
