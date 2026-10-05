// Gepruefte Vorschlaege ins Budget uebernehmen. Rein rechnerisch, ohne
// Oberflaeche, damit es sich testen laesst.

import { ensureMonth, newId } from '../budget.js';
import { fingerprint } from './classify.js';

function findOrCreateLine(lines, name) {
  const wanted = name.trim().toLowerCase();
  let line = lines.find((l) => l.name.trim().toLowerCase() === wanted);
  if (!line) {
    line = { id: newId(), name, budget: 0, actual: null, done: false };
    lines.push(line);
  }
  return line;
}

function ceilTo10Euro(cents) {
  return Math.ceil(cents / 1000) * 1000;
}

// groups: Ergebnis von suggest(), nach der Pruefung durch die Nutzerin.
// Liefert eine kurze Zusammenfassung fuer die Bestaetigung.
export function applyImport(data, key, groups) {
  ensureMonth(data, key);
  const month = data.months[key];
  data.imported = data.imported || [];
  data.learned = data.learned || {};
  const seen = new Set(data.imported);
  const summary = { entries: 0, lines: 0, subscriptions: 0, total: 0 };
  const touchedExpenseLines = new Set();

  for (const g of groups) {
    // Gewaehlte Zuordnung merken - beim naechsten Import ist sie Vorschlag.
    data.learned[g.normalized] = { section: g.section, name: g.name, category: g.category };
    if (!g.include || g.section === 'ignore') continue;

    const fresh = g.transactions.filter((t) => !seen.has(fingerprint(t)));
    if (!fresh.length) continue;
    fresh.forEach((t) => seen.add(fingerprint(t)));
    const total = fresh.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    summary.total += total;

    if (g.section === 'expenses') {
      const line = findOrCreateLine(month.lines.expenses, g.name);
      touchedExpenseLines.add(line);
      for (const t of fresh) {
        data.log.push({ id: newId(), date: t.date, lineId: line.id, note: g.label, amount: Math.abs(t.amount), source: t.source });
        summary.entries += 1;
      }
      continue;
    }

    const section = g.section === 'subscription' ? 'bills' : g.section;
    const line = findOrCreateLine(month.lines[section], g.section === 'subscription' ? g.label : g.name);
    line.actual = (line.actual || 0) + total;
    line.done = true;
    if (!line.budget) line.budget = line.actual;
    summary.lines += 1;

    if (g.section === 'subscription') {
      const exists = data.subscriptions.some((s) => s.name.trim().toLowerCase() === g.label.trim().toLowerCase());
      if (!exists) {
        data.subscriptions.push({
          id: newId(),
          name: g.label,
          category: g.category || 'Sonstiges',
          interval: 'monthly',
          amount: Math.round(total / fresh.length),
          active: true,
        });
        summary.subscriptions += 1;
      }
    }
  }

  // Ausgaben-Kategorien ohne Budget bekommen die Monatssumme, aufgerundet
  // auf volle 10 Euro - ein realistischer Startwert statt 0.
  for (const line of touchedExpenseLines) {
    if (line.budget) continue;
    const spent = data.log
      .filter((e) => e.lineId === line.id && e.date.startsWith(key))
      .reduce((sum, e) => sum + e.amount, 0);
    line.budget = ceilTo10Euro(spent);
  }

  data.imported = [...seen];
  return summary;
}

export function alreadyImported(data, transactions) {
  const seen = new Set(data.imported || []);
  return transactions.filter((t) => seen.has(fingerprint(t))).length;
}
