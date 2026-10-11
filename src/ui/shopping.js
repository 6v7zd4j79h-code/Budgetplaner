// Regelmaessige Einkaeufe: was laut Kassenbons immer wieder im Korb landet,
// wie oft, wo und zu welchem Preis.

import { formatDay } from '../dates.js';
import { regularItems } from '../shopping.js';
import { update } from '../store.js';
import { esc, eur } from './dom.js';
import { soonCard } from './occasions.js';

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
      <button type="button" class="del" data-action="regular-hide" data-key="${esc(i.key)}" aria-label="${esc(i.name)}: kein regelmäßiger Einkauf" title="kein regelmäßiger Einkauf">×</button>
    </div>
    <p class="muted small">${i.count}× gekauft${i.everyDays != null ? ` · ${rhythm(i.everyDays)}` : ''} · zuletzt ${formatDay(i.lastDate)} · ${where}</p>
    ${i.cheaper ? `<p class="regular-tip">💡 Bei ${esc(i.cheaper.shop)} zuletzt ${eur(i.cheaper.price)} – ${eur(i.cheaper.saving)} günstiger als bei ${esc(i.cheaper.usual)}</p>` : ''}
  </li>`;
}

export function render({ data }) {
  const r = regularItems(data.log, { months: MONTHS, hidden: data.regularHidden || [] });

  if (!r.receipts) {
    return `<article class="card">
      <h2>Regelmäßige Einkäufe</h2>
      <p>Hier siehst du, was immer wieder im Einkaufskorb landet – wie oft, in welchem Laden und zu welchem Preis.</p>
      <p class="hint">Dafür braucht die App Artikel: Scanne ein paar Kassenbons oder trag bei einer Buchung unter „Artikel“ ein, was du gekauft hast.</p>
      <button type="button" class="btn primary" data-action="goto" data-view="receipt">📷 Kassenbon scannen</button>
    </article>
    ${soonCard(data)}
    <p class="hint"><button type="button" class="link-btn" data-action="goto" data-view="occasions">🎂 Geburtstage, Feiertage und Ferien verwalten</button></p>`;
  }

  const tips = r.items.filter((i) => i.cheaper);
  return `
  ${soonCard(data)}
  <article class="card">
    <header class="section-head"><h2>Regelmäßige Einkäufe</h2>
      <div class="btn-row"><button type="button" class="btn" data-action="goto" data-view="offers">🏷 Angebote</button>
      <button type="button" class="btn ghost" data-action="goto" data-view="receipt">📷 Scannen</button></div></header>
    <p class="muted">${r.receipts} ${r.receipts === 1 ? 'Einkauf' : 'Einkäufe'} mit Artikeln seit ${formatDay(r.from)} ausgewertet,
      ${r.articles} verschiedene Artikel. Als regelmäßig zählt, was mindestens zweimal gekauft wurde.
      Mit × nimmst du etwas heraus, das nur zufällig mehrmals gekauft wurde (z. B. Deko aus dem Angebot).</p>
    ${r.items.length
      ? `<ul class="regular-list">${r.items.map(itemRow).join('')}</ul>`
      : '<p class="hint">Noch nichts mehrfach gekauft. Je mehr Bons du scannst, desto besser wird die Liste.</p>'}
    ${r.hiddenItems.length ? `<p class="hint">Ausgeblendet: ${r.hiddenItems.map((h) => `<button type="button" class="link-btn" data-action="regular-unhide" data-key="${esc(h.key)}">${esc(h.name)} ↺</button>`).join(' ')}</p>` : ''}
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
  </article>

  <p class="hint"><button type="button" class="link-btn" data-action="goto" data-view="occasions">🎂 Geburtstage, Feiertage und Ferien verwalten</button></p>`;
}

export const actions = {
  'regular-hide'(el) {
    update((data) => {
      data.regularHidden = [...new Set([...(data.regularHidden || []), el.dataset.key])];
    });
  },
  'regular-unhide'(el) {
    update((data) => {
      data.regularHidden = (data.regularHidden || []).filter((k) => k !== el.dataset.key);
    });
  },
};
