// Ausgaben-Log: jede Ausgabe einzeln buchen. Die Summen fliessen als Ist in
// die Ausgaben-Kategorien des Budgets.

import { expenseActuals, logForMonth, newId } from '../budget.js';
import { clampToMonth, formatDay, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur } from './dom.js';
import { entryRest, entryWaste, itemKey, monthWaste, rememberedWaste } from '../waste.js';
import { startFor } from './receipt.js';
import { ALL, activeAccounts, accountsOf } from '../accounts.js';

let lastLineId = null;
let lastAccountId = null;
// Welche Buchung gerade aufgeklappt ist (Artikel bearbeiten).
let openId = null;

function itemsPanel(e) {
  const items = e.items || [];
  const rest = entryRest(e);
  return `<div class="items">
    ${items.length ? `<p class="item-legend">Haken = unnötig</p><ul class="item-list">${items.map((it) => `
      <li class="item${it.waste ? ' is-waste' : ''}">
        <input type="checkbox" class="waste-check" data-action="item-waste" data-key="${esc(e.id)}:${esc(it.id)}" ${it.waste ? 'checked' : ''}
          aria-label="${esc(it.name)} unnötig" title="unnötig">
        <span class="item-name">${esc(it.name)}</span>
        <span class="item-amount">${eur(it.amount)}</span>
        <button type="button" class="del" data-action="item-del" data-key="${esc(e.id)}:${esc(it.id)}" aria-label="${esc(it.name)} entfernen">×</button>
      </li>`).join('')}</ul>` : '<p class="hint">Trag die Artikel ein, die du einordnen möchtest – den Rest zählt die App als nötig.</p>'}
    <form class="item-form" data-action="item-add" data-key="${esc(e.id)}">
      <input type="text" name="name" placeholder="Artikel, z. B. Gewürzmischung" aria-label="Artikel" autocomplete="off" data-action="item-hint" data-key="${esc(e.id)}" required>
      <input class="money" type="text" name="amount" inputmode="decimal" placeholder="0,00" aria-label="Preis" autocomplete="off" required>
      <label class="waste-toggle"><input type="checkbox" name="waste" checked><span>unnötig</span></label>
      <button type="submit" class="btn">+ Artikel</button>
    </form>
    <button type="button" class="link-btn" data-action="entry-scan" data-key="${esc(e.id)}">📷 Bon zu dieser Buchung scannen</button>
    <p class="item-rest ${rest < 0 ? 'neg' : 'muted'}">${rest < 0
      ? `Die Artikel sind ${eur(-rest)} teurer als die Buchung – Preis prüfen.`
      : `Rest (nötig): ${eur(rest)}`}</p>
  </div>`;
}

function wasteCard(w) {
  if (!w.total) {
    return `<article class="card waste-card">
      <h2>Unnötig ausgegeben</h2>
      <p class="hint">Noch nichts markiert. Tippe bei einer Buchung auf <strong>„unnötig?“</strong> oder öffne <strong>„Artikel“</strong>,
        um einzelne Sachen aus einem Einkauf einzuordnen – z. B. die Gewürzmischung zum Ausprobieren.</p>
    </article>`;
  }
  return `<article class="card waste-card">
    <header class="section-head"><h2>Unnötig ausgegeben</h2>
      <span class="section-sum waste-sum">${eur(w.total)}</span></header>
    <p class="muted">${Math.round(w.share * 100)} % deiner Ausgaben in diesem Monat</p>
    <div class="meter waste-meter" role="img" aria-label="${Math.round(w.share * 100)} Prozent unnötig"><div style="width:${Math.min(100, w.share * 100).toFixed(1)}%"></div></div>
    <ul class="mini waste-list">${w.items.slice(0, 6).map((i) => `<li><span>${esc(i.name)}${i.whole ? '' : ` <span class="muted">· ${esc(i.shop)}</span>`}</span><span>${eur(i.amount)}</span></li>`).join('')}</ul>
  </article>`;
}

export function render({ data, key, account }) {
  const month = data.months[key];
  const lines = month.lines.expenses;
  const names = Object.fromEntries(lines.map((l) => [l.id, l.name]));
  const entries = logForMonth(data.log, key)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const actuals = expenseActuals(month, data.log, key);
  const selected = lines.some((l) => l.id === lastLineId) ? lastLineId : lines[0]?.id;
  const accounts = activeAccounts(data);
  const accountNames = Object.fromEntries(accountsOf(data).map((a) => [a.id, a.name]));
  const preset = account && account !== ALL ? account : lastAccountId;

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
      <ul>${g.items.map((e) => {
        const waste = entryWaste(e);
        const count = (e.items || []).length;
        return `
        <li class="entry${e.waste ? ' is-waste' : ''}">
          <span class="entry-cat">${esc(names[e.lineId] || 'Ohne Kategorie')}</span>
          <span class="entry-note">${esc(e.note)}${e.accountId && accountNames[e.accountId] ? ` <span class="muted small">· ${esc(accountNames[e.accountId])}</span>` : ''}</span>
          <span class="entry-amount">${eur(e.amount)}</span>
          <div class="entry-actions">
            <button type="button" class="tag${e.waste ? ' on' : ''}" data-action="entry-waste" data-key="${esc(e.id)}" aria-pressed="${!!e.waste}">${e.waste ? 'unnötig' : 'unnötig?'}</button>
            <button type="button" class="tag" data-action="entry-open" data-key="${esc(e.id)}" aria-expanded="${openId === e.id}">Artikel${count ? ` (${count})` : ''}</button>
            ${waste && !e.waste ? `<span class="waste-part">davon unnötig ${eur(waste)}</span>` : ''}
            <button type="button" class="del" data-action="entry-del" data-key="${esc(e.id)}" aria-label="Buchung löschen" title="Buchung löschen">×</button>
          </div>
          ${openId === e.id ? itemsPanel(e) : ''}
        </li>`;
      }).join('')}</ul>
    </li>`).join('');

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const waste = monthWaste(data.log, key, names);

  return `
  <article class="card scan-teaser">
    <div><h2>Kassenbon scannen</h2>
      <p class="hint">Foto machen – die App liest die Artikel, du markierst, was unnötig war.</p></div>
    <button type="button" class="btn primary" data-action="goto" data-view="receipt">📷 Scannen</button>
  </article>

  <article class="card">
    <h2>Ausgabe eintragen</h2>
    ${lines.length ? `
    <form class="entry-form" data-action="entry-add">
      <label>Datum<input type="date" name="date" value="${clampToMonth(todayISO(), key)}" required></label>
      <label>Kategorie<select name="lineId" required>${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === selected ? 'selected' : ''}>${esc(l.name || 'ohne Namen')}</option>`).join('')}</select></label>
      ${accounts.length ? `<label>Konto<select name="accountId"><option value="">ohne Konto</option>${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === preset ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}
      <label>Notiz<input type="text" name="note" placeholder="z. B. Wocheneinkauf" autocomplete="off"></label>
      <label>Betrag<input class="money" type="text" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off" required></label>
      <label class="waste-toggle form-waste"><input type="checkbox" name="waste"><span>unnötig / nur ausprobiert</span></label>
      <button type="submit" class="btn primary">Buchen</button>
      <p class="form-error" role="alert" hidden></p>
    </form>` : '<p class="empty">Lege zuerst im Budget unter „Ausgaben" eine Kategorie an.</p>'}
    <p class="hint import-link">Viele Umsätze auf einmal? <button type="button" class="link-btn" data-action="goto" data-view="import">Kontoauszug einlesen</button></p>
  </article>

  ${lines.length ? `<article class="card">
    <h2>Noch übrig in diesem Monat</h2>
    <ul class="chips">${chips}</ul>
  </article>` : ''}

  ${wasteCard(waste)}

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
      const entry = { id: newId(), date, lineId: lastLineId, note: String(fields.get('note')).trim(), amount };
      if (fields.get('waste')) entry.waste = true;
      lastAccountId = String(fields.get('accountId') || '') || null;
      if (lastAccountId) entry.accountId = lastAccountId;
      data.log.push(entry);
    });
    ctx.focus('.entry-form input[name="amount"]');
  },
  'entry-waste'(el) {
    update((data) => {
      const entry = data.log.find((e) => e.id === el.dataset.key);
      if (entry) entry.waste = !entry.waste;
    });
  },
  'entry-scan'(el, _event, ctx) {
    startFor(el.dataset.key);
    ctx.show('receipt');
  },
  'entry-open'(el, _event, ctx) {
    openId = openId === el.dataset.key ? null : el.dataset.key;
    if (openId) ctx.focus(`form[data-key="${openId}"] input[name="name"]`);
    else ctx.rerender();
  },
  // Beim Verlassen des Namensfelds: Kennt die App den Artikel schon?
  'item-hint'(el, _event, { data }) {
    const known = rememberedWaste(data.wasteRules, el.value);
    if (known != null) el.form.elements.waste.checked = known;
  },
  'item-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get('name')).trim();
    const amount = parseMoney(String(fields.get('amount')));
    if (!name || amount == null || amount <= 0) return;
    const waste = Boolean(fields.get('waste'));
    update((data) => {
      const entry = data.log.find((e) => e.id === form.dataset.key);
      if (!entry) return;
      entry.items = entry.items || [];
      entry.items.push({ id: newId(), name, amount, waste });
      data.wasteRules = data.wasteRules || {};
      data.wasteRules[itemKey(name)] = waste;
    });
    ctx.focus(`form[data-key="${form.dataset.key}"] input[name="name"]`);
  },
  'item-waste'(el) {
    const [entryId, itemId] = el.dataset.key.split(':');
    update((data) => {
      const item = data.log.find((e) => e.id === entryId)?.items?.find((i) => i.id === itemId);
      if (!item) return;
      item.waste = el.checked;
      data.wasteRules = data.wasteRules || {};
      data.wasteRules[itemKey(item.name)] = el.checked;
    });
  },
  'item-del'(el) {
    const [entryId, itemId] = el.dataset.key.split(':');
    update((data) => {
      const entry = data.log.find((e) => e.id === entryId);
      if (entry?.items) entry.items = entry.items.filter((i) => i.id !== itemId);
    });
  },
  'entry-del'(el) {
    if (!window.confirm('Diese Buchung löschen?')) return;
    update((data) => {
      const index = data.log.findIndex((e) => e.id === el.dataset.key);
      if (index >= 0) data.log.splice(index, 1);
    });
  },
};
