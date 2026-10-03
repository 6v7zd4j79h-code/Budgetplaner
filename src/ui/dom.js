// Kleine Helfer fuer die Ansichten.

import { centsToInput, formatCents } from '../money.js';

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
