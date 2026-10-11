// Weitere Blickwinkel auf die Ausgaben eines Monats:
// - Fuer wen? Eine Buchung (z. B. aus dem Kontoauszug) kann einer Person
//   oder Gruppe zugeordnet werden: entry.forWhom = 'Kinder'.
// - Im Angebot / auf Vorrat: einzelne Artikel tragen deal: true und/oder
//   stock: true (mehr gekauft, weil es guenstig war).

import { logForMonth } from './budget.js';

export const DEFAULT_PEOPLE = ['mich', 'Partner', 'Kinder', 'Familie'];

export const peopleOf = (data) => (Array.isArray(data.people) && data.people.length ? data.people : DEFAULT_PEOPLE);

export function monthForWhom(log, key, people) {
  const entries = logForMonth(log, key);
  const sums = new Map(people.map((p) => [p, 0]));
  let open = 0;
  for (const e of entries) {
    if (e.forWhom && sums.has(e.forWhom)) sums.set(e.forWhom, sums.get(e.forWhom) + e.amount);
    else if (e.forWhom) sums.set(e.forWhom, (sums.get(e.forWhom) || 0) + e.amount); // Person inzwischen entfernt
    else open += e.amount;
  }
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return {
    total,
    open,
    rows: [...sums].filter(([, amount]) => amount > 0).map(([person, amount]) => ({ person, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export function monthDeals(log, key) {
  const items = [];
  for (const e of logForMonth(log, key)) {
    for (const item of e.items || []) {
      if (item.deal || item.stock) items.push({ name: item.name, amount: item.amount, deal: !!item.deal, stock: !!item.stock, shop: e.note || '', date: e.date });
    }
  }
  const sum = (filter) => items.filter(filter).reduce((s, i) => s + i.amount, 0);
  return {
    deal: sum((i) => i.deal),
    stock: sum((i) => i.stock),
    items: items.sort((a, b) => b.amount - a.amount),
  };
}
