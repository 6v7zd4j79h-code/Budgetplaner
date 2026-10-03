// Abo-Tracker: alle Abos mit Abrechnungsrhythmus, umgerechnet auf den Monat.

import { INTERVALS, SUBSCRIPTION_CATEGORIES, newId, subscriptionMonthly, subscriptionSummary } from '../budget.js';
import { parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur, moneyInput } from './dom.js';

function options(list, selected) {
  return list.map((o) => {
    const value = typeof o === 'string' ? o : o.id;
    const label = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export function render({ data }) {
  const summary = subscriptionSummary(data.subscriptions);
  const categories = SUBSCRIPTION_CATEGORIES
    .filter((c) => summary.byCategory[c])
    .concat(Object.keys(summary.byCategory).filter((c) => !SUBSCRIPTION_CATEGORIES.includes(c)));

  const rows = data.subscriptions.map((s) => `
    <li class="sub${s.active === false ? ' paused' : ''}">
      <input type="checkbox" class="check" data-action="sub-active" data-key="${esc(s.id)}"
        ${s.active !== false ? 'checked' : ''} aria-label="${esc(s.name)} aktiv" title="aktiv">
      <input class="name" type="text" data-action="sub-name" data-key="${esc(s.id)}" value="${esc(s.name)}" placeholder="Name" aria-label="Name">
      <select data-action="sub-category" data-key="${esc(s.id)}" aria-label="Kategorie">${options(SUBSCRIPTION_CATEGORIES, s.category)}</select>
      <select data-action="sub-interval" data-key="${esc(s.id)}" aria-label="Abrechnung" class="interval-${esc(s.interval)}">${options(INTERVALS, s.interval)}</select>
      ${moneyInput({ action: 'sub-amount', key: s.id, value: s.amount, label: `Betrag ${s.name}` })}
      <span class="per-month" title="pro Monat">${eur(subscriptionMonthly(s))}<small>/Monat</small></span>
      <button type="button" class="del" data-action="sub-del" data-key="${esc(s.id)}" aria-label="${esc(s.name)} löschen" title="Abo löschen">×</button>
    </li>`).join('');

  return `
  <section class="grid grid-hero">
    <article class="card hero">
      <h2>Monatliche Abonnements</h2>
      <p class="hero-number">${eur(summary.monthly)}</p>
      <p class="hero-note">${summary.count} aktiv · ${eur(summary.yearly)} im Jahr</p>
    </article>
    <article class="card">
      <h2>Übersicht</h2>
      ${categories.length ? `<table class="cash">
        <thead><tr><th>Kategorie</th><th>Monatlich</th></tr></thead>
        <tbody>${categories.map((c) => `<tr><th scope="row">${esc(c)}</th><td>${eur(summary.byCategory[c])}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="empty">Noch keine Abos eingetragen.</p>'}
    </article>
  </section>

  <article class="card">
    <h2>Abo hinzufügen</h2>
    <form class="entry-form" data-action="sub-add">
      <label>Name<input type="text" name="name" placeholder="z. B. Netflix" required autocomplete="off"></label>
      <label>Kategorie<select name="category">${options(SUBSCRIPTION_CATEGORIES, 'Unterhaltung')}</select></label>
      <label>Abrechnung<select name="interval">${options(INTERVALS, 'monthly')}</select></label>
      <label>Betrag pro Abrechnung<input class="money" type="text" name="amount" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      <button type="submit" class="btn primary">Hinzufügen</button>
      <p class="form-error" role="alert" hidden></p>
    </form>
  </article>

  ${data.subscriptions.length ? `<article class="card">
    <h2>Alle Abos</h2>
    <p class="hint">Haken entfernen, um ein Abo zu pausieren – es zählt dann nicht mehr mit.</p>
    <ul class="subs">${rows}</ul>
  </article>` : ''}`;
}

function edit(id, change) {
  update((data) => {
    const sub = data.subscriptions.find((s) => s.id === id);
    if (sub) change(sub);
  });
}

export const actions = {
  'sub-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const amount = parseMoney(String(fields.get('amount')));
    const name = String(fields.get('name')).trim();
    if (amount == null || amount <= 0 || !name) {
      const error = form.querySelector('.form-error');
      error.textContent = 'Bitte Name und Betrag eintragen.';
      error.hidden = false;
      return;
    }
    update((data) => {
      data.subscriptions.push({
        id: newId(),
        name,
        category: String(fields.get('category')),
        interval: String(fields.get('interval')),
        amount,
        active: true,
      });
    });
    ctx.focus('.entry-form input[name="name"]');
  },
  'sub-name'(el) { edit(el.dataset.key, (s) => { s.name = el.value.trim(); }); },
  'sub-category'(el) { edit(el.dataset.key, (s) => { s.category = el.value; }); },
  'sub-interval'(el) { edit(el.dataset.key, (s) => { s.interval = el.value; }); },
  'sub-amount'(el) { edit(el.dataset.key, (s) => { s.amount = Math.max(0, parseMoney(el.value) ?? 0); }); },
  'sub-active'(el) { edit(el.dataset.key, (s) => { s.active = el.checked; }); },
  'sub-del'(el, _event, { data: current }) {
    const sub = current.subscriptions.find((s) => s.id === el.dataset.key);
    if (!sub || !window.confirm(`Abo „${sub.name}" löschen?`)) return;
    update((data) => {
      data.subscriptions = data.subscriptions.filter((s) => s.id !== el.dataset.key);
    });
  },
};
