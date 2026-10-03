// Sparziele: Zielbetrag, bisher gespart, Fortschritt in Prozent.

import { goalProgress, goalRemaining, newId } from '../budget.js';
import { parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur, moneyInput } from './dom.js';
import { meter } from './charts.js';

export function render({ data }) {
  const cards = data.goals.map((g) => {
    const pct = Math.round(goalProgress(g) * 1000) / 10;
    const reached = goalRemaining(g) === 0 && g.target > 0;
    return `<article class="card goal${reached ? ' reached' : ''}">
      <header class="section-head">
        <input class="name goal-name" type="text" data-action="goal-name" data-key="${esc(g.id)}" value="${esc(g.name)}" aria-label="Name des Sparziels">
        <button type="button" class="del" data-action="goal-del" data-key="${esc(g.id)}" aria-label="${esc(g.name)} löschen" title="Sparziel löschen">×</button>
      </header>
      <p class="goal-pct">${pct.toLocaleString('de-DE')} %${reached ? ' 🎉' : ''}</p>
      ${meter(g.saved, g.target, { invert: true })}
      <p class="muted">${eur(g.saved)} von ${eur(g.target)} · ${reached ? 'Ziel erreicht' : `noch ${eur(goalRemaining(g))}`}</p>
      <div class="goal-fields">
        <label>Ziel ${moneyInput({ action: 'goal-target', key: g.id, value: g.target, label: 'Zielbetrag' })}</label>
        <label>Gespart ${moneyInput({ action: 'goal-saved', key: g.id, value: g.saved, label: 'Bisher gespart' })}</label>
      </div>
      <form class="deposit" data-action="goal-deposit" data-key="${esc(g.id)}">
        <input class="money" type="text" name="amount" inputmode="decimal" placeholder="Betrag" aria-label="Einzahlung für ${esc(g.name)}" autocomplete="off">
        <button type="submit" class="btn">+ Einzahlen</button>
      </form>
    </article>`;
  }).join('');

  return `
  <article class="card">
    <h2>Neues Sparziel</h2>
    <form class="entry-form" data-action="goal-add">
      <label>Wofür<input type="text" name="name" placeholder="z. B. Sommerurlaub 2027" required autocomplete="off"></label>
      <label>Zielbetrag<input class="money" type="text" name="target" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      <label>Schon gespart<input class="money" type="text" name="saved" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
      <button type="submit" class="btn primary">Anlegen</button>
      <p class="form-error" role="alert" hidden></p>
    </form>
  </article>
  ${data.goals.length ? `<section class="grid goals">${cards}</section>` : '<p class="empty center">Noch kein Sparziel. Leg oben eins an.</p>'}`;
}

function edit(id, change) {
  update((data) => {
    const goal = data.goals.find((g) => g.id === id);
    if (goal) change(goal);
  });
}

export const actions = {
  'goal-add'(form, event) {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get('name')).trim();
    const target = parseMoney(String(fields.get('target')));
    if (!name || target == null || target <= 0) {
      const error = form.querySelector('.form-error');
      error.textContent = 'Bitte Name und Zielbetrag eintragen.';
      error.hidden = false;
      return;
    }
    update((data) => {
      data.goals.push({ id: newId(), name, target, saved: Math.max(0, parseMoney(String(fields.get('saved'))) ?? 0) });
    });
  },
  'goal-deposit'(form, event, ctx) {
    event.preventDefault();
    const amount = parseMoney(String(new FormData(form).get('amount')));
    if (amount == null || amount === 0) return;
    const id = form.dataset.key;
    edit(id, (g) => { g.saved = Math.max(0, g.saved + amount); });
    ctx.focus(`form[data-key="${id}"] input[name="amount"]`);
  },
  'goal-name'(el) { edit(el.dataset.key, (g) => { g.name = el.value.trim(); }); },
  'goal-target'(el) { edit(el.dataset.key, (g) => { g.target = Math.max(0, parseMoney(el.value) ?? 0); }); },
  'goal-saved'(el) { edit(el.dataset.key, (g) => { g.saved = Math.max(0, parseMoney(el.value) ?? 0); }); },
  'goal-del'(el, _event, { data: current }) {
    const goal = current.goals.find((g) => g.id === el.dataset.key);
    if (!goal || !window.confirm(`Sparziel „${goal.name}" löschen?`)) return;
    update((data) => { data.goals = data.goals.filter((g) => g.id !== el.dataset.key); });
  },
};
