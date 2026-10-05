// Uebersicht: das Monats-Dashboard aus der Vorlage - Cashflow Budget gegen
// Ist, verfuegbarer Betrag, Verteilung und Ausgaben nach Kategorie.

import { SECTIONS, distribution, expenseActuals, subscriptionSummary, goalProgress } from '../budget.js';
import { monthName } from '../dates.js';
import { donut, legend, meter } from './charts.js';
import { esc, eur, signClass } from './dom.js';
import { monthWaste } from '../waste.js';

export function render({ data, key, summary }) {
  const { totals, start, availableActual, availableBudget } = summary;
  const month = data.months[key];
  const inflow = start + totals.income.actual;
  const spent = inflow - availableActual;

  const hero = donut(
    [
      { id: 'spent', label: 'Ausgegeben', value: Math.max(0, Math.min(spent, inflow)) },
      { id: 'left', label: 'Verfügbar', value: Math.max(0, availableActual) },
    ],
    {
      center: eur(availableActual, { round: true }),
      caption: 'verfügbar',
      label: `Verfügbar im ${monthName(key)}: ${eur(availableActual)}`,
    },
  );

  const parts = distribution(totals, 'actual');
  const cashRows = SECTIONS.map((s) => `
    <tr>
      <th scope="row"><span class="row-label"><span class="dot seg-${s.id}"></span>${s.sign > 0 ? '+' : '−'}&nbsp;${esc(s.label)}</span></th>
      <td>${eur(totals[s.id].budget)}</td>
      <td>${eur(totals[s.id].actual)}</td>
    </tr>`).join('');

  const expenses = expenseActuals(month, data.log, key);
  const categoryRows = month.lines.expenses.map((l) => {
    const actual = expenses.byLine[l.id] || 0;
    const rest = l.budget - actual;
    return `<li class="cat-row">
      <div class="cat-head"><span>${esc(l.name)}</span>
        <span class="${rest < 0 ? 'neg' : 'muted'}">${eur(actual)} von ${eur(l.budget)}</span></div>
      ${meter(actual, l.budget)}
    </li>`;
  }).join('') + (expenses.uncategorized
    ? `<li class="cat-row"><div class="cat-head"><span>Ohne Kategorie</span><span class="muted">${eur(expenses.uncategorized)}</span></div></li>`
    : '');

  const openBills = month.lines.bills.filter((l) => !l.done && l.budget > 0);
  const openSum = openBills.reduce((sum, l) => sum + l.budget, 0);
  const subs = subscriptionSummary(data.subscriptions);
  const goals = data.goals.slice(0, 3);
  const names = Object.fromEntries(month.lines.expenses.map((l) => [l.id, l.name]));
  const waste = monthWaste(data.log, key, names);

  return `
  <section class="grid grid-hero">
    <article class="card hero">
      <h2>Verfügbarer Betrag</h2>
      ${hero}
      <p class="hero-note">Geplant: <strong class="${signClass(availableBudget)}">${eur(availableBudget)}</strong></p>
    </article>

    <article class="card">
      <h2>Cashflow</h2>
      <table class="cash">
        <thead><tr><th></th><th>Budget</th><th>Ist</th></tr></thead>
        <tbody>
          <tr class="start"><th scope="row">Startbetrag</th><td colspan="2">${eur(start)}</td></tr>
          ${cashRows}
        </tbody>
        <tfoot><tr><th scope="row">Verfügbar</th>
          <td class="${signClass(availableBudget)}">${eur(availableBudget)}</td>
          <td class="${signClass(availableActual)}">${eur(availableActual)}</td></tr></tfoot>
      </table>
    </article>
  </section>

  <section class="grid">
    <article class="card">
      <h2>Wohin das Geld geht</h2>
      ${parts.length
        ? `<div class="split">${donut(parts, { center: eur(parts.reduce((s, p) => s + p.value, 0), { round: true }), caption: 'raus', label: 'Verteilung der Abgänge' })}${legend(parts)}</div>`
        : '<p class="empty">Noch nichts bezahlt oder gebucht. Hake im Budget Rechnungen ab oder trage unter „Ausgaben" etwas ein.</p>'}
    </article>

    <article class="card">
      <h2>Ausgaben nach Kategorie</h2>
      ${month.lines.expenses.length ? `<ul class="cats">${categoryRows}</ul>` : '<p class="empty">Keine Ausgaben-Kategorien angelegt.</p>'}
      <button type="button" class="btn ghost" data-action="goto" data-view="log">+ Ausgabe eintragen</button>
    </article>
  </section>

  <section class="grid grid-4">
    <article class="card tile waste-tile">
      <h2>Unnötig ausgegeben</h2>
      <p class="big">${eur(waste.total)}</p>
      <p class="muted">${waste.total ? `${Math.round(waste.share * 100)} % der Ausgaben` : 'noch nichts markiert'}</p>
      ${waste.items.length ? `<ul class="mini">${waste.items.slice(0, 3).map((i) => `<li>${esc(i.name)} <span>${eur(i.amount)}</span></li>`).join('')}</ul>` : ''}
      <button type="button" class="btn ghost" data-action="goto" data-view="log">Ausgaben einordnen</button>
    </article>

    <article class="card tile">
      <h2>Offene Rechnungen</h2>
      <p class="big">${openBills.length}</p>
      <p class="muted">${openBills.length ? `noch ${eur(openSum)} fällig` : 'alles bezahlt'}</p>
      ${openBills.length ? `<ul class="mini">${openBills.slice(0, 4).map((l) => `<li>${esc(l.name)} <span>${eur(l.budget)}</span></li>`).join('')}</ul>` : ''}
      <button type="button" class="btn ghost" data-action="goto" data-view="plan">Zum Budget</button>
    </article>

    <article class="card tile">
      <h2>Abos pro Monat</h2>
      <p class="big">${eur(subs.monthly)}</p>
      <p class="muted">${subs.count} aktiv · ${eur(subs.yearly)} im Jahr</p>
      <button type="button" class="btn ghost" data-action="goto" data-view="subs">Zum Abo-Tracker</button>
    </article>

    <article class="card tile">
      <h2>Sparziele</h2>
      ${goals.length
        ? `<ul class="mini goals-mini">${goals.map((g) => `<li><span>${esc(g.name)}</span><span>${Math.round(goalProgress(g) * 100)} %</span>${meter(g.saved, g.target, { invert: true })}</li>`).join('')}</ul>`
        : '<p class="muted">Noch kein Sparziel angelegt.</p>'}
      <button type="button" class="btn ghost" data-action="goto" data-view="goals">Zu den Sparzielen</button>
    </article>
  </section>`;
}

export const actions = {};

