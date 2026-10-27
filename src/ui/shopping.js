// Regelmaessige Einkaeufe: was laut Kassenbons immer wieder im Korb landet,
// wie oft, wo und zu welchem Preis.

import { formatDay, todayISO } from '../dates.js';
import { mealPlanText, regularItems, stockItems } from '../shopping.js';
import { update } from '../store.js';
import { esc, eur } from './dom.js';
import { linkPanel, meal, mealActions, mealList, mealStatus, sendButton } from './mealsend.js';
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

// Was eingekauft wurde, als Liste fuer den Essensplan im Sternenplan, um
// daraus Abendessen zu planen: per Knopf hinueberschicken oder kopieren.
function mealCard(data) {
  const r = mealList(data);
  return `<article class="card">
    <h2>🍽 Für den Essensplan</h2>
    <p class="muted">Was in den letzten Tagen fürs Essen eingekauft wurde (Artikel mit 🍽) – mit Anzahl, ohne Preise und Läden, für den Essensplan im Sternenplan.</p>
    ${linkPanel(data)}
    <div class="btn-row">
      <label>Zeitraum <select data-action="meal-days">
        ${[3, 7, 14].map((d) => `<option value="${d}"${d === meal.days ? ' selected' : ''}>letzte ${d} Tage</option>`).join('')}
      </select></label>
      <label><input type="checkbox" data-action="meal-food"${meal.mealOnly ? ' checked' : ''}> nur mit 🍽 markierte Artikel</label>
    </div>
    ${r.items.length || r.stock.length
      ? `<pre class="meal-list">${esc(mealPlanText(r))}</pre>
        <div class="btn-row">
          ${sendButton(data)}
          <button type="button" class="btn${sendButton(data) ? ' ghost' : ' primary'}" data-action="meal-copy">${meal.copied ? '✓ Kopiert' : '📋 Liste kopieren'}</button>
          ${typeof navigator !== 'undefined' && navigator.share ? '<button type="button" class="btn ghost" data-action="meal-share">↗ Teilen</button>' : ''}
        </div>
        ${mealStatus(data)}`
      : `<p class="hint">${meal.mealOnly
        ? 'In diesem Zeitraum ist nichts mit 🍽 markiert. Setz beim Bon-Prüfen oder unter Ausgaben den Punkt „🍽 Essensplan“ bei allem, was fürs Essen gedacht ist – nur das kommt auf diese Liste.'
        : 'In diesem Zeitraum keine Einkäufe mit Artikeln. Scanne einen Kassenbon, dann erscheint hier die Liste.'}</p>`}
  </article>`;
}

// Was kuerzlich auf Vorrat gekauft wurde: nicht doppelt kaufen.
function stockCard(data) {
  const stock = stockItems(data.log, { used: data.stockUsed || {} });
  if (!stock.length) return '';
  return `<article class="card">
    <h2>📦 Auf Vorrat gekauft</h2>
    <p class="muted">Aus den letzten 6 Wochen: mit „Vorrat“ markiert oder mindestens 3 Stück auf einem Bon. Steht so etwas im Angebot, erinnert die App daran.
      Abhaken musst du nichts – nur wenn etwas schon leer ist, kannst du es herausnehmen.</p>
    <ul class="mini">${stock.map((s) => `<li><span>${esc(s.name)} <span class="muted">· ${s.pieces > 1 ? `${s.pieces}× ` : ""}am ${formatDay(s.date)} · ${esc(s.shop)}</span></span>
      <button type="button" class="link-btn" data-action="stock-used" data-key="${esc(s.key)}">aufgebraucht</button></li>`).join('')}</ul>
  </article>`;
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
  ${mealCard(data)}
  ${stockCard(data)}
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Aeltere Browser: ueber ein unsichtbares Textfeld kopieren.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const mealText = (data) => mealPlanText(mealList(data));

export const actions = {
  ...mealActions,
  'stock-used'(el) {
    update((data) => { data.stockUsed = { ...(data.stockUsed || {}), [el.dataset.key]: todayISO() }; });
  },
  'meal-days'(el, _event, ctx) {
    meal.days = Number(el.value) || 7;
    meal.copied = false;
    ctx.rerender();
  },
  'meal-food'(el, _event, ctx) {
    meal.mealOnly = el.checked;
    meal.copied = false;
    ctx.rerender();
  },
  async 'meal-copy'(_el, _event, ctx) {
    if (!(await copyText(mealText(ctx.data)))) return;
    meal.copied = true;
    ctx.rerender();
    setTimeout(() => { meal.copied = false; ctx.rerender(); }, 2500);
  },
  async 'meal-share'(_el, _event, ctx) {
    try {
      await navigator.share({ title: 'Eingekauft', text: mealText(ctx.data) });
    } catch {
      // Abgebrochen - nichts zu tun.
    }
  },
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
