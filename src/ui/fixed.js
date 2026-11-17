// Feste Abbuchungen: erkannte bestaetigen, selbst eintragen, und die Karte
// "Geht diesen Monat noch ab" fuer die Uebersicht.

import { INTERVALS } from '../budget.js';
import { formatDay, monthName, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { addManual, confirmSuggestion, detectRecurring, dueThisMonth, importedUntil, intervalLabel, markPaid, scheduled } from '../recurring.js';
import { update } from '../store.js';
import { esc, eur, moneyInput } from './dom.js';

function untilNote(data) {
  const until = Object.entries(importedUntil(data));
  if (!until.length) return '';
  return `<p class="muted small">Auszüge eingelesen bis: ${until.map(([s, d]) => `${esc(s)} ${formatDay(d)}`).join(' · ')}</p>`;
}

function dueRow(r, today) {
  const late = r.next < today;
  return `<li><span>${esc(r.name)} <span class="muted small">${late ? `fällig seit ${formatDay(r.next)}` : `am ${formatDay(r.next)}`}</span></span>
    <span>${eur(r.amount)}</span></li>`;
}

// Karte fuer die Uebersicht (nur im laufenden Monat sinnvoll).
export function dueCard(data) {
  const today = todayISO();
  const suggestions = detectRecurring(data, { today });
  const due = dueThisMonth(data, { today });
  const anyConfirmed = (data.recurring || []).some((r) => r.status === 'on');
  if (!anyConfirmed && !suggestions.length) return '';
  return `<article class="card fixed-card">
    <header class="section-head"><h2>Geht im ${monthName(due.key)} noch ab</h2>
      ${due.open.length ? `<span class="section-sum neg">${eur(due.openSum)}</span>` : ''}</header>
    ${due.open.length
      ? `<ul class="mini">${due.open.map((r) => dueRow(r, today)).join('')}</ul>`
      : anyConfirmed ? '<p class="muted">Diesen Monat geht nichts Festes mehr ab.</p>' : ''}
    ${due.done.length ? `<p class="muted small">Schon abgebucht: ${due.done.map((r) => esc(r.name)).join(', ')} (${eur(due.doneSum)})</p>` : ''}
    ${anyConfirmed && due.open.some((r) => r.next < today) ? '<p class="muted small">„Fällig seit“: vermutlich schon abgebucht, aber noch nicht eingelesen.</p>' : ''}
    ${suggestions.length ? `<p class="hint">${suggestions.length} regelmäßige ${suggestions.length === 1 ? 'Abbuchung' : 'Abbuchungen'} erkannt – bitte kurz prüfen.</p>` : ''}
    <button type="button" class="btn ghost" data-action="goto" data-view="fixed">${suggestions.length ? 'Jetzt prüfen' : 'Feste Abbuchungen'}</button>
  </article>`;
}

function intervalOptions(selected) {
  return INTERVALS.map((i) => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
}

export function render({ data }) {
  const today = todayISO();
  const suggestions = detectRecurring(data, { today });
  const confirmed = scheduled(data).sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
  const rejected = (data.recurring || []).filter((r) => r.status === 'off');

  const suggestionRows = suggestions.map((s, i) => `
    <li class="occasion-edit">
      <span class="occasion-text"><span><strong>${esc(s.name)}</strong> <span class="muted">· ${esc(intervalLabel(s.interval))} · ${eur(s.amount)}</span></span>
        <span class="muted small">${s.count}× gesehen, zuletzt ${formatDay(s.last)} · ${esc(s.source)}</span></span>
      <span class="fixed-buttons">
        <button type="button" class="btn primary small" data-action="fixed-yes" data-key="${i}">✓ Fest</button>
        <button type="button" class="btn ghost small" data-action="fixed-no" data-key="${i}">Nein</button>
      </span>
    </li>`).join('');

  const confirmedRows = confirmed.map((r) => `
    <li class="occasion-edit">
      <span class="occasion-text">
        <input type="text" data-action="fixed-name" data-key="${esc(r.id)}" value="${esc(r.name)}" aria-label="Name">
        <span class="muted small">${esc(intervalLabel(r.interval))} · ${eur(r.amount)} · ${r.next ? `nächste am ${formatDay(r.next)}` : 'Termin unbekannt'}${r.manual ? ' · selbst eingetragen' : ''}</span>
        ${r.manual ? `<span class="fixed-manual">${moneyInput({ action: 'fixed-amount', key: r.id, value: r.amount, label: 'Betrag' })}
          <select data-action="fixed-interval" data-key="${esc(r.id)}" aria-label="Rhythmus">${intervalOptions(r.interval)}</select>
          ${r.next && r.next <= today ? `<button type="button" class="btn ghost small" data-action="fixed-paid" data-key="${esc(r.id)}">✓ ist abgebucht</button>` : ''}</span>` : ''}
      </span>
      <button type="button" class="del" data-action="fixed-del" data-key="${esc(r.id)}" aria-label="${esc(r.name)} entfernen" title="Entfernen">×</button>
    </li>`).join('');

  return `
  <article class="card">
    <h2>Feste Abbuchungen</h2>
    <p class="muted">Was regelmäßig mit festem Betrag abgeht – Haftpflicht, Versicherungen, Abschläge, Abos. Die App erkennt das
      aus den eingelesenen Kontoauszügen; du bestätigst nur. Daraus entsteht in der Übersicht „Geht diesen Monat noch ab“.
      Was jedes Mal anders ausfällt (Tanken, Einkaufen), zählt nicht dazu.</p>
    ${untilNote(data)}
  </article>

  ${suggestions.length ? `<article class="card">
    <h2>Neu erkannt – stimmt das?</h2>
    <ul class="occasion-list">${suggestionRows}</ul>
  </article>` : ''}

  <article class="card">
    <h2>Bestätigt</h2>
    ${confirmed.length ? `<ul class="occasion-list">${confirmedRows}</ul>`
      : '<p class="empty">Noch nichts bestätigt. Lies Kontoauszüge ein (am besten die letzten 12 Monate, damit auch Jährliches auffällt) oder trag selbst etwas ein.</p>'}
  </article>

  <article class="card">
    <h2>Selbst eintragen</h2>
    <p class="muted">Für etwas, das noch nicht in den Auszügen steht – z. B. eine jährliche Zahlung.</p>
    <form class="entry-form fixed-form" data-action="fixed-add">
      <label>Was?<input type="text" name="name" placeholder="z. B. Kfz-Steuer" required autocomplete="off"></label>
      <label>Betrag<input class="money" type="text" name="amount" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      <label>Rhythmus<select name="interval">${intervalOptions('yearly')}</select></label>
      <label>Nächste Abbuchung<input type="date" name="next" required></label>
      <button type="submit" class="btn primary">Hinzufügen</button>
      <p class="form-error" role="alert" hidden></p>
    </form>
  </article>

  ${rejected.length ? `<article class="card">
    <h2>Abgelehnt</h2>
    <ul class="mini">${rejected.map((r) => `<li><span>${esc(r.name)} <span class="muted small">${eur(r.amount)}</span></span>
      <button type="button" class="btn ghost small" data-action="fixed-undo" data-key="${esc(r.id)}">Doch fest</button></li>`).join('')}</ul>
  </article>` : ''}`;
}

function edit(id, change) {
  update((data) => {
    const r = (data.recurring || []).find((x) => x.id === id);
    if (r) change(r, data);
  });
}

export const actions = {
  'fixed-yes'(el, event, ctx) {
    const s = detectRecurring(ctx.data)[Number(el.dataset.key)];
    if (s) update((data) => confirmSuggestion(data, s, 'on'));
  },
  'fixed-no'(el, event, ctx) {
    const s = detectRecurring(ctx.data)[Number(el.dataset.key)];
    if (s) update((data) => confirmSuggestion(data, s, 'off'));
  },
  'fixed-undo'(el) { edit(el.dataset.key, (r) => { r.status = 'on'; }); },
  'fixed-del'(el) {
    // Erkannte werden "abgelehnt" (sonst tauchen sie wieder als Vorschlag auf),
    // selbst eingetragene ganz geloescht.
    update((data) => {
      const r = (data.recurring || []).find((x) => x.id === el.dataset.key);
      if (!r) return;
      if (r.manual) data.recurring = data.recurring.filter((x) => x !== r);
      else r.status = 'off';
    });
  },
  'fixed-name'(el) {
    const name = el.value.trim();
    if (name) edit(el.dataset.key, (r) => { r.name = name; });
  },
  'fixed-amount'(el) {
    const amount = parseMoney(el.value);
    if (amount != null && amount > 0) edit(el.dataset.key, (r) => { r.amount = amount; });
  },
  'fixed-interval'(el) { edit(el.dataset.key, (r) => { r.interval = el.value; }); },
  'fixed-paid'(el) { update((data) => markPaid(data, el.dataset.key)); },
  'fixed-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get('name') || '').trim();
    const amount = parseMoney(String(fields.get('amount') || ''));
    const next = String(fields.get('next') || '');
    let problem = '';
    if (!name) problem = 'Bitte eintragen, was abgeht.';
    else if (amount == null || amount <= 0) problem = 'Bitte einen Betrag eintragen.';
    else if (!next) problem = 'Bitte das Datum der nächsten Abbuchung eintragen.';
    if (problem) {
      const error = form.querySelector('.form-error');
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    update((data) => addManual(data, { name, amount, interval: String(fields.get('interval')), next }));
    ctx.focus('.fixed-form input[name="name"]');
  },
};
