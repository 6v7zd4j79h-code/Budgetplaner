// Regelmaessige Einkaeufe: was laut Kassenbons immer wieder im Korb landet,
// wie oft, wo und zu welchem Preis.

import { formatDay } from '../dates.js';
import { regularItems } from '../shopping.js';
import { esc, eur } from './dom.js';

const MONTHS = 6;

function rhythm(days) {
  if (days == null) return '';
  if (days <= 1) return 'fast täglich';
  if (days <= 10) return `ca. alle ${days} Tage`;
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? 'ca. wöchentlich' : `ca. alle ${weeks} Wochen`;
}

function itemRow(i) {
  const where = i.shops.length > 1
    ? i.shops.map((s) => `${esc(s.shop)} ${s.count}×`).join(' · ')
    : esc(i.lastShop);
  return `<li class="regular-item">
    <div class="regular-head">
      <span class="regular-name">${esc(i.name)}</span>
      <span class="regular-price">${eur(i.lastPrice)}</span>
    </div>
    <p class="muted small">${i.count}× gekauft${i.everyDays != null ? ` · ${rhythm(i.everyDays)}` : ''} · zuletzt ${formatDay(i.lastDate)} · ${where}</p>
    ${i.cheaper ? `<p class="regular-tip">💡 Bei ${esc(i.cheaper.shop)} zuletzt ${eur(i.cheaper.price)} – ${eur(i.cheaper.saving)} günstiger als bei ${esc(i.cheaper.usual)}</p>` : ''}
  </li>`;
}

export function render({ data }) {
  const r = regularItems(data.log, { months: MONTHS });

  if (!r.receipts) {
    return `<article class="card">
      <h2>Regelmäßige Einkäufe</h2>
      <p>Hier siehst du, was immer wieder im Einkaufskorb landet – wie oft, in welchem Laden und zu welchem Preis.</p>
      <p class="hint">Dafür braucht die App Artikel: Scanne ein paar Kassenbons oder trag bei einer Buchung unter „Artikel“ ein, was du gekauft hast.</p>
      <button type="button" class="btn primary" data-action="goto" data-view="receipt">📷 Kassenbon scannen</button>
    </article>`;
  }

  const tips = r.items.filter((i) => i.cheaper);
  return `
  <article class="card">
    <header class="section-head"><h2>Regelmäßige Einkäufe</h2>
      <button type="button" class="btn ghost" data-action="goto" data-view="receipt">📷 Scannen</button></header>
    <p class="muted">${r.receipts} ${r.receipts === 1 ? 'Einkauf' : 'Einkäufe'} mit Artikeln seit ${formatDay(r.from)} ausgewertet,
      ${r.articles} verschiedene Artikel. Als regelmäßig zählt, was mindestens zweimal gekauft wurde.</p>
    ${r.items.length
      ? `<ul class="regular-list">${r.items.map(itemRow).join('')}</ul>`
      : '<p class="hint">Noch nichts mehrfach gekauft. Je mehr Bons du scannst, desto besser wird die Liste.</p>'}
  </article>

  ${tips.length ? `<article class="card">
    <h2>Woanders günstiger</h2>
    <p class="muted">Diese Artikel gab es zuletzt in einem anderen Laden billiger als dort, wo du sie meistens kaufst.</p>
    <ul class="mini">${tips.map((i) => `<li><span>${esc(i.name)} <span class="muted">· ${esc(i.cheaper.shop)}</span></span><span>−${eur(i.cheaper.saving)}</span></li>`).join('')}</ul>
  </article>` : ''}

  <article class="card">
    <h2>Wo du einkaufst</h2>
    <ul class="mini">${r.shops.map((s) => `<li><span>${esc(s.shop)} <span class="muted">· ${s.receipts}×</span></span><span>${eur(s.spent)}</span></li>`).join('')}</ul>
    <p class="hint">Gezählt werden nur Einkäufe mit Artikeln aus diesem Budget.</p>
  </article>`;
}

export const actions = {};
