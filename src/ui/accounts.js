// Konten: Kontostand, Dispo-Rahmen und Stand am Monatsersten je Konto.
// Der Dispo ist Spielraum, kein Geld - er wird getrennt gezeigt und
// nie zum verfuegbaren Betrag gezaehlt.

import { newId } from '../budget.js';
import { accountId, accountsOf, balancesSummary, isLoan, loanProgress, overdraftRoom } from '../accounts.js';
import { formatDay, monthName, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur, moneyInput, signClass } from './dom.js';

function accountCard(a, key, goals) {
  const room = overdraftRoom(a);
  const hasGoal = goals.some((g) => g.accountId === a.id);
  return `<article class="card account${a.closed ? ' closed' : ''}">
    <header class="section-head">
      <input class="name" type="text" data-action="acc-name" data-key="${esc(a.id)}" value="${esc(a.name)}" aria-label="Name des Kontos">
      <button type="button" class="del" data-action="acc-del" data-key="${esc(a.id)}" aria-label="${esc(a.name)} löschen" title="Konto löschen">×</button>
    </header>
    <p class="account-balance ${signClass(a.balance ?? 0)}">${a.balance == null ? '<span class="muted">Kontostand unbekannt</span>' : eur(a.balance)}</p>
    <p class="muted">${a.balanceDate ? `Stand ${esc(formatDay(a.balanceDate))}` : 'Noch kein Stand eingetragen'}${
      a.overdraft && room != null ? ` · <span class="${room < a.overdraft * 0.25 ? 'neg' : ''}">noch ${eur(room)} bis zur Dispo-Grenze</span>` : ''}</p>
    <div class="account-fields">
      <label>Kontostand heute ${moneyInput({ action: 'acc-balance', key: a.id, value: a.balance, label: `Kontostand ${a.name}`, placeholder: 'z. B. -2.726,10' })}</label>
      <label>Stand am 1. ${esc(monthName(key))} ${moneyInput({ action: 'acc-opening', key: a.id, value: a.openings?.[key], label: `Stand am Monatsersten ${a.name}`, placeholder: '–' })}</label>
      <label>Dispo-Rahmen ${moneyInput({ action: 'acc-overdraft', key: a.id, value: a.overdraft || null, label: `Dispo-Rahmen ${a.name}`, placeholder: 'keiner' })}</label>
    </div>
    <div class="account-flags">
      <label class="waste-toggle"><input type="checkbox" data-action="acc-business" data-key="${esc(a.id)}" ${a.business ? 'checked' : ''}><span>Geschäftskonto</span></label>
      <label class="waste-toggle"><input type="checkbox" data-action="acc-closed" data-key="${esc(a.id)}" ${a.closed ? 'checked' : ''}><span>nicht mehr genutzt</span></label>
    </div>
    ${a.balance < 0 && !hasGoal
      ? `<button type="button" class="btn ghost" data-action="acc-goal" data-key="${esc(a.id)}">Minus ausgleichen als Sparziel anlegen</button>`
      : ''}
  </article>`;
}

function loanCard(l) {
  return `<article class="card account loan">
    <header class="section-head">
      <input class="name" type="text" data-action="acc-name" data-key="${esc(l.id)}" value="${esc(l.name)}" aria-label="Name des Kredits">
      <button type="button" class="del" data-action="acc-del" data-key="${esc(l.id)}" aria-label="${esc(l.name)} löschen" title="Kredit löschen">×</button>
    </header>
    <p class="account-balance neg">${eur(-(l.balance || 0))} <span class="muted small">offen</span></p>
    <p class="muted">${Math.round(loanProgress(l) * 100)} % von ${eur(l.original || 0)} getilgt${l.payer ? ` · zahlt ${esc(l.payer)}` : ''}${l.balanceDate ? ` · Stand ${esc(formatDay(l.balanceDate))}` : ''}</p>
    <div class="account-fields">
      <label>Restschuld ${moneyInput({ action: 'loan-rest', key: l.id, value: l.balance == null ? null : -l.balance, label: `Restschuld ${l.name}` })}</label>
      <label>Rate pro Monat ${moneyInput({ action: 'loan-rate', key: l.id, value: l.rate, label: `Rate ${l.name}` })}</label>
      <label>Ende <input type="month" data-action="loan-end" data-key="${esc(l.id)}" value="${esc(l.end || '')}" aria-label="Ende ${esc(l.name)}"></label>
    </div>
    ${l.endNote ? `<p class="hint">${esc(l.endNote)}</p>` : ''}
  </article>`;
}

export function render({ data, key }) {
  const all = accountsOf(data);
  const accounts = all.filter((a) => !isLoan(a));
  const loans = all.filter(isLoan);
  const sum = balancesSummary(accounts.filter((a) => !a.closed));
  return `
  <article class="card">
    <h2>Alle Konten</h2>
    ${sum.known ? `
    <p class="account-balance ${signClass(sum.total)}">${eur(sum.total)}</p>
    <p class="muted">Summe aller Kontostände${sum.overdraftUsed ? ` · ${eur(sum.overdraftUsed)} im Dispo` : ''}${sum.otherDebt ? ` · ${eur(sum.otherDebt)} offene Schulden` : ''}</p>
    ${sum.overdraftUsed ? `<p class="warn">Der Dispo ist Spielraum, kein Guthaben. Bis zur Grenze bleiben ${eur(sum.room)} – das zählt nicht als verfügbar.</p>` : ''}`
    : '<p class="muted">Trag bei jedem Konto den heutigen Stand aus der Banking-App ein. Der Stand am Monatsersten wird zum Startbetrag des Monats.</p>'}
  </article>

  ${accounts.length ? `<section class="grid accounts">${accounts.map((a) => accountCard(a, key, data.goals)).join('')}</section>` : ''}

  ${loans.length ? `<h2 class="section-title">Kredite</h2><section class="grid accounts">${loans.map(loanCard).join('')}</section>` : ''}

  <article class="card">
    <h2>Konto hinzufügen</h2>
    <form class="entry-form" data-action="acc-add" autocomplete="off">
      <label>Name<input type="text" name="name" required maxlength="30" placeholder="z. B. Sparkasse, PayPal, Klarna"></label>
      <label>Dispo-Rahmen<input class="money" type="text" name="overdraft" inputmode="decimal" placeholder="keiner" autocomplete="off"></label>
      <button type="submit" class="btn primary">Anlegen</button>
    </form>
  </article>

  <article class="card">
    <h2>Kredit hinzufügen</h2>
    <form class="entry-form" data-action="loan-add" autocomplete="off">
      <label>Name<input type="text" name="name" required maxlength="40" placeholder="z. B. Hauskredit"></label>
      <label>Ursprünglicher Betrag<input class="money" type="text" name="original" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      <label>Restschuld heute<input class="money" type="text" name="rest" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      <label>Rate pro Monat<input class="money" type="text" name="rate" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
      <label>Ende<input type="month" name="end"></label>
      <label>Wer zahlt<input type="text" name="payer" maxlength="30" placeholder="z. B. Gemeinschaftskonto"></label>
      <button type="submit" class="btn primary">Anlegen</button>
    </form>
  </article>`;
}

function edit(id, change) {
  update((data) => {
    const account = accountsOf(data).find((a) => a.id === id);
    if (account) change(account, data);
  });
}

export const actions = {
  'acc-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get('name')).trim();
    if (!name) return;
    const overdraft = Math.abs(parseMoney(String(fields.get('overdraft'))) ?? 0);
    update((data) => {
      data.accounts = accountsOf(data);
      data.accounts.push({ id: accountId(name, data.accounts), name, overdraft, balance: null, balanceDate: null, openings: {} });
    });
    ctx.focus('form[data-action="acc-add"] input[name="name"]');
  },
  'loan-add'(form, event, ctx) {
    event.preventDefault();
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    const original = parseMoney(String(f.get('original')));
    const rest = parseMoney(String(f.get('rest')));
    if (!name || original == null || rest == null) return;
    update((data) => {
      data.accounts = accountsOf(data);
      data.accounts.push({
        id: accountId(name, data.accounts), name, kind: 'loan', original: Math.abs(original), balance: -Math.abs(rest),
        balanceDate: todayISO(), rate: Math.abs(parseMoney(String(f.get('rate'))) ?? 0),
        end: String(f.get('end') || '') || null, payer: String(f.get('payer') || '').trim() || null, overdraft: 0, openings: {},
      });
    });
    ctx.focus('form[data-action="loan-add"] input[name="name"]');
  },
  'loan-rest'(el) {
    edit(el.dataset.key, (a) => {
      const value = parseMoney(el.value);
      a.balance = value == null ? null : -Math.abs(value);
      a.balanceDate = todayISO();
    });
  },
  'loan-rate'(el) { edit(el.dataset.key, (a) => { a.rate = Math.abs(parseMoney(el.value) ?? 0); }); },
  'loan-end'(el) { edit(el.dataset.key, (a) => { a.end = el.value || null; }); },
  'acc-name'(el) { edit(el.dataset.key, (a) => { a.name = el.value.trim() || a.name; }); },
  'acc-balance'(el) {
    edit(el.dataset.key, (a) => {
      a.balance = parseMoney(el.value);
      a.balanceDate = a.balance == null ? null : todayISO();
    });
  },
  'acc-opening'(el, _event, { key }) {
    edit(el.dataset.key, (a) => {
      a.openings = a.openings || {};
      const value = parseMoney(el.value);
      if (value == null) delete a.openings[key];
      else a.openings[key] = value;
    });
  },
  'acc-overdraft'(el) { edit(el.dataset.key, (a) => { a.overdraft = Math.abs(parseMoney(el.value) ?? 0); }); },
  'acc-business'(el) { edit(el.dataset.key, (a) => { a.business = el.checked; }); },
  'acc-closed'(el) { edit(el.dataset.key, (a) => { a.closed = el.checked; }); },
  'acc-goal'(el) {
    edit(el.dataset.key, (a, data) => {
      data.goals.push({ id: newId(), name: `${a.name}: Minus ausgleichen`, target: -a.balance, saved: 0, accountId: a.id });
    });
  },
  'acc-del'(el, _event, { data: current }) {
    const account = accountsOf(current).find((a) => a.id === el.dataset.key);
    if (!account) return;
    const used = current.log.filter((e) => e.accountId === account.id).length;
    if (!window.confirm(`Konto „${account.name}" löschen?${used ? ` ${used} Buchung(en) bleiben erhalten, aber ohne Konto.` : ''}`)) return;
    update((data) => {
      data.accounts = accountsOf(data).filter((a) => a.id !== account.id);
      for (const entry of data.log) if (entry.accountId === account.id) delete entry.accountId;
      for (const month of Object.values(data.months)) {
        for (const list of Object.values(month.lines)) for (const l of list) if (l.accountId === account.id) delete l.accountId;
      }
      data.goals = data.goals.filter((g) => g.accountId !== account.id);
    });
  },
};
