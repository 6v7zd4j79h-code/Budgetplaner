// Weitere Blickwinkel auf die Ausgaben eines Monats:
// - Fuer wen? Eine Buchung (z. B. aus dem Kontoauszug) kann einer Person
//   oder Gruppe zugeordnet werden: entry.forWhom = 'Kinder'.
// - Im Angebot / auf Vorrat: einzelne Artikel tragen deal: true und/oder
//   stock: true (mehr gekauft, weil es guenstig war).
// - Einzelne Artikel koennen eine eigene Person haben (die Kinderjacke im
//   ALDI-Einkauf) und Geschenke sein (gift: true) - ganze Buchungen auch.

import { logForMonth } from './budget.js';

export const DEFAULT_PEOPLE = ['mich', 'Partner', 'Kinder', 'Familie'];

export const peopleOf = (data) => (Array.isArray(data.people) && data.people.length ? data.people : DEFAULT_PEOPLE);

export function monthForWhom(log, key, people) {
  const entries = logForMonth(log, key);
  const sums = new Map(people.map((p) => [p, 0]));
  let open = 0;
  const add = (person, amount) => sums.set(person, (sums.get(person) || 0) + amount); // auch inzwischen entfernte Personen
  for (const e of entries) {
    // Artikel mit eigener Person zaehlen dort, der Rest der Buchung bei der Buchung.
    let rest = e.amount;
    for (const item of e.items || []) {
      if (item.forWhom && item.amount > 0) {
        add(item.forWhom, item.amount);
        rest -= item.amount;
      }
    }
    if (rest <= 0) continue;
    if (e.forWhom) add(e.forWhom, rest);
    else open += rest;
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

// Geschenke im Monat: ganze Buchungen oder einzelne Artikel.
export function monthGifts(log, key) {
  const items = [];
  for (const e of logForMonth(log, key)) {
    if (e.gift) {
      items.push({ name: e.note || 'Geschenk', amount: e.amount, forWhom: e.forWhom || '', date: e.date });
      continue;
    }
    for (const item of e.items || []) {
      if (item.gift) items.push({ name: item.name, amount: item.amount, forWhom: item.forWhom || e.forWhom || '', date: e.date, shop: e.note || '' });
    }
  }
  return { total: items.reduce((s, i) => s + i.amount, 0), items: items.sort((a, b) => b.amount - a.amount) };
}

// Spezielle Ernaehrung: kein "unnoetig", sondern bewusst gekauft
// (Proteinriegel statt Schokolade, glutenfrei, ...). item.diet = id.
export const DIETS = [
  { id: 'protein', name: 'Protein / Sport', match: /protein|whey|eiwei(ß|ss)/i },
  { id: 'lowcarb', name: 'Low Carb', match: /low\s*-?carb|keto/i },
  { id: 'kalorienarm', name: 'Kalorienarm', match: /kalorienarm|kalorienreduziert/i },
  { id: 'zuckerfrei', name: 'Zuckerfrei', match: /zuckerfrei|ohne zucker|\bzero\b/i },
  { id: 'glutenfrei', name: 'Glutenfrei', match: /glutenfrei|gluten-?free|ohne gluten/i },
  { id: 'laktosefrei', name: 'Laktosefrei', match: /laktosefrei|lactosefrei|lactose-?free/i },
  { id: 'vegan', name: 'Vegan / vegetarisch', match: /vegan|vegetar|veggie/i },
  { id: 'diaet', name: 'Diät / Sonstiges', match: /^$/ },
];

export const dietName = (id) => DIETS.find((d) => d.id === id)?.name || '';

// Vorschlag aus dem Artikelnamen ("Protein Riegel" -> protein).
export function guessDiet(name) {
  return DIETS.find((d) => d.match.test(String(name || '')))?.id || null;
}

export function monthDiet(log, key) {
  const byDiet = new Map();
  const items = [];
  for (const e of logForMonth(log, key)) {
    for (const item of e.items || []) {
      if (!item.diet) continue;
      byDiet.set(item.diet, (byDiet.get(item.diet) || 0) + item.amount);
      items.push({ name: item.name, amount: item.amount, diet: item.diet, shop: e.note || '' });
    }
  }
  return {
    total: items.reduce((s, i) => s + i.amount, 0),
    rows: [...byDiet].map(([diet, amount]) => ({ diet, name: dietName(diet), amount })).sort((a, b) => b.amount - a.amount),
    items: items.sort((a, b) => b.amount - a.amount),
  };
}
