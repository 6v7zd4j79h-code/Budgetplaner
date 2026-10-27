// Kleine Helfer fuer die Ansichten.

import { centsToInput, formatCents } from '../money.js';
import { DIETS } from '../spending.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const eur = (cents, opts) => esc(formatCents(cents, opts));

// Betragsfeld: Texteingabe mit Zahlentastatur, damit "12,50" auf dem Handy
// mit Komma getippt werden kann (type=number verweigert das je nach Geraet).
export function moneyInput({ action, key, value, label, placeholder = '0', attrs = '' }) {
  return `<input class="money" type="text" inputmode="decimal" autocomplete="off"
    data-action="${action}" data-key="${esc(key)}" aria-label="${esc(label)}"
    placeholder="${esc(placeholder)}" value="${esc(centsToInput(value))}" ${attrs}>`;
}

export function signClass(cents) {
  if (cents < 0) return 'neg';
  if (cents > 0) return 'pos';
  return '';
}

// Auswahl "fuer wen?" (Buchung oder einzelner Artikel).
export function forSelect(action, key, value, people) {
  const known = people.includes(value);
  return `<select class="for-select${value ? ' set' : ''}" data-action="${action}" data-key="${esc(key)}" aria-label="Für wen?">
    <option value="">für wen?</option>${people.map((p) => `<option value="${esc(p)}" ${p === value ? 'selected' : ''}>für ${esc(p)}</option>`).join('')}
    ${value && !known ? `<option value="${esc(value)}" selected>für ${esc(value)}</option>` : ''}</select>`;
}

// Anzahl eines Artikels ("2 x 1,19" auf dem Bon); leer = 1 Stueck.
export function qtyInput({ action, key, value, label }) {
  return `<label class="qty-field" title="Anzahl"><input class="qty" type="text" inputmode="numeric" autocomplete="off" maxlength="2"
    data-action="${action}" data-key="${esc(key)}" aria-label="${esc(label)}" placeholder="1" value="${value > 1 ? value : ''}"><span aria-hidden="true">×</span></label>`;
}

// Anzahl aus dem Feld: 2-99, sonst 1 Stueck (null).
export function parseQty(value) {
  const n = Number(String(value || '').trim());
  return Number.isInteger(n) && n >= 2 && n <= 99 ? n : null;
}

// Haekchen "🍽 Essensplan": nur angehakte Artikel gehen an den Essensplan.
const mealTag = (action, key, item) => `<label class="meal-check"><input type="checkbox" data-action="${action}-meal" data-key="${esc(key)}" ${item.meal ? 'checked' : ''}><span>🍽 Essensplan</span></label>`;

// Haken fuer einen Artikel: im Angebot / auf Vorrat / Geschenk, dazu fuer
// wen, spezielle Ernaehrung und eine eigene Kategorie (z. B. Kleidung im
// Lebensmitteleinkauf).
export function itemTags(action, key, item, people, lines = [], open = false) {
  const lineName = lines.find((l) => l.id === item.lineId)?.name;
  const diet = DIETS.find((d) => d.id === item.diet);
  // Eingeklappt: nur zeigen, was gesetzt ist - lange Bons bleiben uebersichtlich.
  if (!open) {
    const set = [
      item.deal && '🏷 Angebot', item.stock && '📦 Vorrat', item.gift && '🎁 Geschenk',
      item.forWhom && `für ${esc(item.forWhom)}`, diet && `🥗 ${esc(diet.name)}`, lineName && `📂 ${esc(lineName)}`,
    ].filter(Boolean);
    return `<span class="item-tags">
      ${mealTag(action, key, item)}
      ${set.map((t) => `<span class="pill small">${t}</span>`).join('')}
      <button type="button" class="tag more" data-action="${action}-more" data-key="${esc(key)}" aria-expanded="false">＋ ${set.length ? 'ändern' : 'mehr'}</button>
    </span>`;
  }
  return `<span class="item-tags">
    ${mealTag(action, key, item)}
    <button type="button" class="tag${item.deal ? ' on' : ''}" data-action="${action}" data-key="${esc(key)}:deal" aria-pressed="${!!item.deal}">🏷 Angebot</button>
    <button type="button" class="tag${item.stock ? ' on' : ''}" data-action="${action}" data-key="${esc(key)}:stock" aria-pressed="${!!item.stock}">📦 Vorrat</button>
    <button type="button" class="tag${item.gift ? ' on' : ''}" data-action="${action}" data-key="${esc(key)}:gift" aria-pressed="${!!item.gift}">🎁 Geschenk</button>
    ${forSelect(`${action}-for`, key, item.forWhom || '', people)}
    <select class="for-select${item.diet ? ' set' : ''}" data-action="${action}-diet" data-key="${esc(key)}" aria-label="Spezielle Ernährung">
      <option value="">🥗 Ernährung?</option>${DIETS.map((d) => `<option value="${d.id}" ${d.id === item.diet ? 'selected' : ''}>🥗 ${esc(d.name)}</option>`).join('')}</select>
    ${lines.length ? `<select class="for-select${item.lineId ? ' set' : ''}" data-action="${action}-line" data-key="${esc(key)}" aria-label="Kategorie des Artikels">
      <option value="">📂 Kategorie wie Einkauf</option>${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === item.lineId ? 'selected' : ''}>📂 ${esc(l.name || 'ohne Namen')}</option>`).join('')}</select>` : ''}
    <button type="button" class="tag more" data-action="${action}-more" data-key="${esc(key)}" aria-expanded="true">✓ fertig</button>
  </span>`;
}
