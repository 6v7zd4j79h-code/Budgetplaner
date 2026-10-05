// Ausgaben-Log: jede Ausgabe einzeln buchen. Die Summen fliessen als Ist in
// die Ausgaben-Kategorien des Budgets.

import { expenseActuals, logForMonth, newId } from '../budget.js';
import { clampToMonth, formatDay, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur } from './dom.js';

let lastLineId = null;

export function render({ data, key }) {
  const month = data.months[key];
  const lines = month.lines.expenses;
  const names = Object.fromEntries(lines.map((l) => [l.id, l.name]));
  const entries = logForMonth(data.log, key)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const actuals = expenseActuals(month, data.log, key);
  const selected = lines.some((l) => l.id === lastLineId) ? lastLineId : lines[0]?.id;

  const chips = lines.map((l) => {
    const rest = l.budget - (actuals.byLine[l.id] || 0);
    return `<li class="chip${rest < 0 ? ' neg' : ''}"><span>${esc(l.name)}</span><strong>${eur(rest)}</strong></li>`;
  }).join('');

  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.items.push(entry);
    else groups.push({ date: entry.date, items: [entry] });
  }

  const list = groups.map((g) => `
    <li class="day">
      <div class="day-head"><span>${formatDay(g.date)}</span><span>${eur(g.items.reduce((s, e) => s + e.amount, 0))}</span></div>
      <ul>${g.items.map((e) => `
        <li class="entry">
          <span class="entry-cat">${esc(names[e.lineId] || 'Ohne Kategorie')}</span>
          <span class="entry-note">${esc(e.note)}</span>
          <span class="entry-amount">${eur(e.amount)}</span>
          <button type="button" class="del" data-action="entry-del" data-key="${esc(e.id)}" aria-label="Buchung löschen" title="Buchung löschen">×</button>
        </li>`).join('')}</ul>
    </li>`).join('');

  const total = entries.reduce((s, e) => s + e.amount, 0);

  return `
  <article class="card">
    <h2>Ausgabe eintragen</h2>
    ${lines.length ? `
    <form class="entry-form" data-action="entry-add">
      <label>Datum<input type="date" name="date" value="${clampToMonth(todayISO(), key)}" required></label>
      <label>Kategorie<select name="lineId" required>${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === selected ? 'selected' : ''}>${esc(l.name || 'ohne Namen')}</option>`).join('')}</select></label>
      <label>Notiz<input type="text" name="note" placeholder="z. B. Wocheneinkauf" autocomplete="off"></label>
      <label>Betrag<input class="money" type="text" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" required></label>
      <button type="submit" class="btn primary">Buchen</button>
      <p class="form-error" role="alert" hidden></p>
    </form>` : '<p class="empty">Lege zuerst im Budget unter „Ausgaben" eine Kategorie an.</p>'}
    <p class="hint import-link">Viele Umsätze auf einmal? <button type="button" class="link-btn" data-action="goto" data-view="import">Kontoauszug einlesen</button></p>
  </article>

  ${lines.length ? `<article class="card">
    <h2>Noch übrig in diesem Monat</h2>
    <ul class="chips">${chips}</ul>
  </article>` : ''}

  <article class="card">
    <header class="section-head"><h2>Buchungen</h2><span class="section-sum">${eur(total)}</span></header>
    ${entries.length ? `<ul class="days">${list}</ul>` : '<p class="empty">In diesem Monat ist noch nichts gebucht.</p>'}
  </article>`;
}

export const actions = {
  'entry-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const amount = parseMoney(String(fields.get('amount')));
    const error = form.querySelector('.form-error');
    if (amount == null || amount === 0) {
      error.textContent = 'Bitte einen Betrag eintragen, z. B. 12,50.';
      error.hidden = false;
      form.elements.amount.focus();
      return;
    }
    const date = String(fields.get('date'));
    lastLineId = String(fields.get('lineId'));
    update((data) => {
      data.log.push({ id: newId(), date, lineId: lastLineId, note: String(fields.get('note')).trim(), amount });
    });
    ctx.focus('.entry-form input[name="amount"]');
  },
  'entry-del'(el) {
    if (!window.confirm('Diese Buchung löschen?')) return;
    update((data) => {
      const index = data.log.findIndex((e) => e.id === el.dataset.key);
      if (index >= 0) data.log.splice(index, 1);
    });
  },
};
