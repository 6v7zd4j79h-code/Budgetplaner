// Knopf "An den Essensplan schicken" - in der Uebersicht, unter Ausgaben und
// auf der Seite Regelmaessige Einkaeufe. Einrichten (Adresse + Code) nur dort.

import { cleanUrl, linked, mealLink, mealPayload, sendMealPlan } from '../mealsend.js';
import { mealPlanItems } from '../shopping.js';
import { update } from '../store.js';
import { esc } from './dom.js';

// Auswahl fuer die Essensplan-Liste; gilt nur, solange die App offen ist.
export const meal = { days: 7, foodOnly: true, copied: false };

const state = { busy: false, error: null, sent: null, setup: false, setupError: null };

export const mealList = (data) => mealPlanItems(data, { days: meal.days, foodOnly: meal.foodOnly });

const time = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function status(data) {
  if (state.busy) return '<p class="hint">Wird geschickt …</p>';
  if (state.error) return `<p class="warn">${esc(state.error)}</p>`;
  if (state.sent) return `<p class="hint">✓ Im Essensplan angekommen (${state.sent.items} Artikel). Dort unter „Das haben wir da“.</p>`;
  const { sentAt } = mealLink(data);
  return sentAt ? `<p class="muted small">Zuletzt geschickt: ${esc(time(sentAt))}</p>` : '';
}

export function sendButton(data, { primary = true } = {}) {
  if (!linked(data)) return '';
  return `<button type="button" class="btn${primary ? ' primary' : ''}" data-action="meal-send"${state.busy ? ' disabled' : ''}>🍽 An den Essensplan schicken</button>`;
}

// Kleine Karte fuer die Uebersicht: nur, wenn es etwas zu schicken gibt.
export function mealTeaser(data) {
  const r = mealList(data);
  if (!r.items.length && !r.stock.length) return '';
  if (!linked(data)) {
    return `<article class="card scan-teaser">
      <div><h2>🍽 Für den Essensplan</h2><p class="hint">${r.items.length} Artikel eingekauft. Einmal mit dem Sternenplan verbinden – dann schickt ein Knopf die Liste hinüber.</p></div>
      <button type="button" class="btn" data-action="goto" data-view="shopping">Einrichten</button>
    </article>`;
  }
  return `<article class="card scan-teaser">
    <div><h2>🍽 Für den Essensplan</h2><p class="hint">${r.items.length} Artikel aus den letzten ${meal.days} Tagen${r.stock.length ? `, ${r.stock.length} auf Vorrat` : ''}.</p>${status(data)}</div>
    ${sendButton(data)}
  </article>`;
}

// Verbindung einrichten bzw. anzeigen (Seite Regelmaessige Einkaeufe).
export function linkPanel(data) {
  const link = mealLink(data);
  if (linked(data) && !state.setup) {
    return `<p class="muted small">Verbunden mit ${esc(link.url.replace(/^https:\/\//, ''))} ·
      <button type="button" class="link-btn" data-action="meal-setup">ändern</button></p>`;
  }
  return `<div class="meal-link">
    <p class="hint">Den <strong>Verbindungscode</strong> zeigt dir der Sternenplan beim Essensplan an. Einmal hier eintragen, dann geht die Liste mit einem Knopf hinüber.</p>
    <label>Verbindungscode <input id="meal-code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(link.code)}"></label>
    <label>Adresse des Sternenplans <input id="meal-url" type="url" inputmode="url" value="${esc(link.url)}"></label>
    ${state.setupError ? `<p class="warn">${esc(state.setupError)}</p>` : ''}
    <div class="btn-row">
      <button type="button" class="btn primary" data-action="meal-link-save">Verbinden</button>
      ${linked(data) ? `<button type="button" class="btn ghost" data-action="meal-unlink">Trennen</button>
        <button type="button" class="btn ghost" data-action="meal-setup">Abbrechen</button>` : ''}
    </div>
  </div>`;
}

export { status as mealStatus };

export const mealActions = {
  async 'meal-send'(_el, _event, ctx) {
    if (state.busy) return;
    const r = mealList(ctx.data);
    if (!r.items.length && !r.stock.length) {
      state.error = 'In diesem Zeitraum gibt es nichts zu schicken.';
      ctx.rerender();
      return;
    }
    state.busy = true;
    state.error = null;
    state.sent = null;
    ctx.rerender();
    try {
      const payload = mealPayload(r);
      await sendMealPlan(mealLink(ctx.data), payload);
      state.sent = { items: r.items.length };
      update((data) => { data.mealPlanLink = { ...(data.mealPlanLink || {}), sentAt: payload.sentAt }; });
    } catch (err) {
      state.error = err.message;
    } finally {
      state.busy = false;
      ctx.rerender();
    }
  },
  'meal-setup'(_el, _event, ctx) {
    state.setup = !state.setup;
    state.setupError = null;
    ctx.rerender();
  },
  'meal-link-save'(_el, _event, ctx) {
    const code = document.getElementById('meal-code')?.value.trim() || '';
    const url = cleanUrl(document.getElementById('meal-url')?.value);
    if (!code) { state.setupError = 'Bitte den Verbindungscode eintragen.'; ctx.rerender(); return; }
    if (!url) { state.setupError = 'Die Adresse sieht nicht richtig aus.'; ctx.rerender(); return; }
    state.setup = false;
    state.setupError = null;
    state.error = null;
    update((data) => { data.mealPlanLink = { ...(data.mealPlanLink || {}), url, code }; });
  },
  'meal-unlink'() {
    state.setup = false;
    state.error = null;
    update((data) => { delete data.mealPlanLink; });
  },
};
