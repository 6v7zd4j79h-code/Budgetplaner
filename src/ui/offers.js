// Angebote der Woche: Merkliste (Stammartikel, Anlaesse, eigene Woerter)
// gegen die Prospekte der Laeden in der Naehe. Einmal pro Woche wird beim
// Oeffnen automatisch geprueft; das Ergebnis bleibt auf dem Geraet.

import { formatDay, todayISO } from '../dates.js';
import { DEFAULT_SHOPS, PROGRAMS, SHOPS, matchOffers, offerSettings, watchlist, weekKey } from '../offers.js';
import { regularItems } from '../shopping.js';
import { store, update } from '../store.js';
import { esc, eur } from './dom.js';

const ENDPOINT = '/.netlify/functions/offers';
const cacheKey = () => `budgetplaner.offers.${store.active}`;

let state = { busy: false, error: null, showSettings: false, autoTried: null };

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey()) || 'null');
  } catch {
    return null;
  }
}

function writeCache(value) {
  try { localStorage.setItem(cacheKey(), JSON.stringify(value)); } catch { /* egal */ }
}

function currentCache(settings) {
  const cache = readCache();
  return cache && cache.week === weekKey() && cache.zip === settings.zip ? cache : null;
}

function results(data) {
  const settings = offerSettings(data);
  const list = watchlist(data, regularItems(data.log, { hidden: data.regularHidden || [] }));
  const cache = currentCache(settings);
  return { settings, list, cache, groups: cache ? matchOffers(cache.results, list, settings) : [] };
}

async function check(data, rerender) {
  const settings = offerSettings(data);
  const list = watchlist(data, regularItems(data.log, { hidden: data.regularHidden || [] }));
  if (!settings.zip || !list.length) return;
  state.busy = true;
  state.error = null;
  rerender();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip: settings.zip, terms: list.map((e) => e.term) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Fehler ${response.status}`);
    writeCache({ week: weekKey(), zip: settings.zip, at: body.at, results: body.results, failed: body.failed || [] });
  } catch (error) {
    state.error = /fetch|network/i.test(error.message) ? 'Keine Verbindung. Bitte später noch einmal versuchen.' : error.message;
  }
  state.busy = false;
  rerender();
}

const SOURCE_LABEL = { regular: '🛒', occasion: '🎂', own: '⭐' };

function reason(g) {
  const parts = [];
  if (g.usual) parts.push(`sonst ${eur(g.usual.price)} bei ${esc(g.usual.shop)}`);
  if (g.occasions.length) parts.push(`für ${g.occasions.map(esc).join(', ')}`);
  if (g.quality) parts.push('nur Bio/Fairtrade');
  return parts.join(' · ');
}

// Kuerzlich auf Vorrat gekauft - nicht doppelt kaufen.
function stockNote(g) {
  if (!g.stock) return '';
  return `<p class="stock-note">📦 Vorrat: am ${formatDay(g.stock.date)} ${g.stock.pieces > 1 ? `${g.stock.pieces}× ` : ""}${esc(g.stock.name)} gekauft – vielleicht noch genug da?
    <button type="button" class="link-btn" data-action="stock-used" data-key="${esc(g.stock.key)}">ist aufgebraucht</button></p>`;
}

function offerRow(o) {
  return `<li class="offer">
    <div class="offer-main">
      <span class="offer-title">${o.bio ? '<span class="pill small bio">Bio</span> ' : ''}${esc(o.title)}${o.brand && !o.title.toLowerCase().includes(o.brand.toLowerCase()) ? ` <span class="muted">· ${esc(o.brand)}</span>` : ''}</span>
      <span class="offer-price">${eur(o.price)}${o.oldPrice && o.oldPrice > o.price ? ` <s class="muted">${eur(o.oldPrice)}</s>` : ''}</span>
    </div>
    <p class="muted small">${esc(o.shop)}${o.unit ? ` · ${esc(o.unit)}` : ''}${o.to ? ` · bis ${formatDay(o.to)}` : ''}${o.card ? (o.needsCard ? ` · <span class="warn-text">nur mit ${esc(o.program || 'Kundenkarte/App')}</span>` : ` · mit ${esc(o.program || 'Kundenkarte/App')} ✓`) : ''}${o.points ? ' · <span class="pill small points">Payback-Extrapunkte</span>' : ''}${o.saving ? ` · <strong class="pos">${eur(o.saving)} günstiger als sonst</strong>` : ''}</p>
  </li>`;
}

// Erinnerung: Payback-Coupons vor dem Einkauf in der App aktivieren.
function paybackHint(settings, groups) {
  if (!settings.cards.includes('payback')) return '';
  const payback = PROGRAMS.find((p) => p.id === 'payback');
  const shops = SHOPS.filter((s) => payback.shops.includes(s.id) && settings.shops.includes(s.id));
  if (!shops.length) return '';
  const points = groups.some((g) => g.offers.some((o) => o.points));
  return `<p class="privacy">💳 Payback bei ${shops.map((s) => esc(s.name)).join(', ')}: vor dem Einkauf die Coupons in der Payback-App aktivieren${points ? ' – diese Woche sind Extrapunkte dabei' : ''}.</p>`;
}

function settingsCard(settings) {
  return `<article class="card">
    <header class="section-head"><h2>Einstellungen</h2>
      ${settings.zip ? '<button type="button" class="btn ghost" data-action="offers-settings">Schließen</button>' : ''}</header>
    <form class="offer-settings" data-action="offers-save">
      <label>Postleitzahl<input type="text" name="zip" inputmode="numeric" pattern="\\d{5}" maxlength="5" value="${esc(settings.zip)}" placeholder="z. B. 12345" required></label>
      <fieldset><legend>Läden in der Nähe</legend>
        <div class="shop-checks">${SHOPS.map((s) => `<label class="shop-check"><input type="checkbox" name="shops" value="${s.id}" ${settings.shops.includes(s.id) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset><legend>Bio</legend>
        ${[['prefer', 'Bio bevorzugen (zuerst zeigen)'], ['only', 'Nur Bio-Angebote'], ['any', 'Egal']].map(([v, l]) => `<label class="radio"><input type="radio" name="bio" value="${v}" ${settings.bio === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </fieldset>
      <fieldset><legend>Eure Karten &amp; Apps</legend>
        <div class="shop-checks">${PROGRAMS.map((c) => `<label class="shop-check"><input type="checkbox" name="cards" value="${c.id}" ${settings.cards.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>
      </fieldset>
      <label>Nicht anzeigen (Wörter, mit Komma)<input type="text" name="exclude" value="${esc(settings.exclude)}" placeholder="z. B. Light, Milka" autocomplete="off"></label>
      <p class="privacy">🔒 Zum Suchen werden nur Postleitzahl und Suchwörter (z. B. „Butter“) an marktguru.de geschickt – nichts aus deinem Budget.</p>
      <button type="submit" class="btn primary">Speichern</button>
      <p class="form-error" role="alert" hidden></p>
    </form>
  </article>`;
}

function listCard(list, settings) {
  return `<article class="card">
    <h2>Merkliste</h2>
    <p class="muted">Danach wird gesucht: 🛒 regelmäßig gekauft · 🎂 für einen Anlass · ⭐ selbst eingetragen. Mit × aus der Suche nehmen.</p>
    ${list.length ? `<ul class="term-chips">${list.map((e) => `<li class="term-chip">${e.sources.map((s) => SOURCE_LABEL[s]).join('')} ${esc(e.term)}${e.quality ? ' <span class="pill small bio">Bio/Fair</span>' : ''}
      <button type="button" class="del" data-action="offers-hide" data-key="${esc(e.term)}" aria-label="${esc(e.term)} nicht mehr suchen">×</button></li>`).join('')}</ul>`
      : '<p class="hint">Noch leer. Scanne Kassenbons, trag Anlässe ein oder füge unten eigene Wörter hinzu.</p>'}
    <form class="term-form" data-action="offers-term-add">
      <input type="text" name="term" placeholder="z. B. Schokolade" aria-label="Suchwort" autocomplete="off" required>
      <label class="waste-toggle"><input type="checkbox" name="quality"><span>nur Bio/Fairtrade</span></label>
      <button type="submit" class="btn">+ Suchen</button>
    </form>
    ${settings.hidden.length ? `<p class="hint">Ausgeblendet: ${settings.hidden.map((h) => `<button type="button" class="link-btn" data-action="offers-unhide" data-key="${esc(h)}">${esc(h)} ↺</button>`).join(' ')}</p>` : ''}
  </article>`;
}

// Kurzfassung fuer die Uebersicht.
export function offersCard(data) {
  const { settings, cache, groups } = results(data);
  if (!settings.zip) {
    return `<article class="card scan-teaser">
      <div><h2>Angebote der Woche</h2><p class="hint">Postleitzahl eintragen – dann sucht die App jede Woche Angebote zu dem, was ihr wirklich kauft.</p></div>
      <button type="button" class="btn" data-action="goto" data-view="offers">Einrichten</button>
    </article>`;
  }
  if (!cache) {
    return `<article class="card scan-teaser">
      <div><h2>Angebote der Woche</h2><p class="hint">Diese Woche noch nicht geprüft.</p></div>
      <button type="button" class="btn primary" data-action="goto" data-view="offers">Jetzt prüfen</button>
    </article>`;
  }
  const top = groups.slice(0, 4).map((g) => ({ g, o: g.offers[0] }));
  return `<article class="card">
    <header class="section-head"><h2>Angebote der Woche</h2>
      <button type="button" class="btn ghost" data-action="goto" data-view="offers">Alle ${groups.length}</button></header>
    ${top.length ? `<ul class="mini">${top.map(({ g, o }) => `<li><span>${g.stock ? '📦 ' : ''}${o.bio ? '🌿 ' : ''}${esc(g.term)} <span class="muted">· ${esc(o.shop)}${g.stock ? ' · noch Vorrat' : ''}</span></span><span>${eur(o.price)}</span></li>`).join('')}</ul>`
      : '<p class="muted">Diese Woche nichts Passendes im Angebot.</p>'}
  </article>`;
}

export function render(ctx) {
  const { data } = ctx;
  const { settings, list, cache, groups } = results(data);
  const week = weekKey();
  // Einmal pro Woche von selbst pruefen.
  if (settings.zip && list.length && !cache && !state.busy && !state.error && state.autoTried !== week) {
    state.autoTried = week;
    queueMicrotask(() => check(data, ctx.rerender));
  }

  if (!settings.zip || state.showSettings) {
    return `${!settings.zip ? `<article class="card"><h2>Angebote der Woche</h2>
      <p>Die App sucht einmal pro Woche in den Prospekten der Läden in deiner Nähe nach dem, was ihr regelmäßig kauft,
        und nach dem, was für anstehende Geburtstage und Feiertage gebraucht wird.</p></article>` : ''}
      ${settingsCard({ ...settings, shops: settings.shops.length ? settings.shops : DEFAULT_SHOPS })}`;
  }

  const shopNames = SHOPS.filter((s) => settings.shops.includes(s.id)).map((s) => s.name).join(', ');
  return `
  <article class="card">
    <header class="section-head"><h2>Angebote der Woche</h2>
      <button type="button" class="btn ghost" data-action="offers-settings">Einstellungen</button></header>
    <p class="muted">PLZ ${esc(settings.zip)} · ${esc(shopNames)}${settings.bio === 'only' ? ' · nur Bio' : settings.bio === 'prefer' ? ' · Bio zuerst' : ''}</p>
    ${state.busy ? '<p>Suche läuft …</p>' : ''}
    ${state.error ? `<p class="form-error">${esc(state.error)}</p>` : ''}
 ${paybackHint(settings, groups)}
    ${cache ? `<p class="hint">Stand: ${formatDay(String(cache.at).slice(0, 10))}${cache.failed?.length ? ` · nicht gefunden: ${cache.failed.map(esc).join(', ')}` : ''}</p>` : ''}
    <button type="button" class="btn ${cache ? '' : 'primary'}" data-action="offers-check" ${state.busy || !list.length ? 'disabled' : ''}>${cache ? 'Neu prüfen' : 'Jetzt prüfen'}</button>
  </article>

  ${cache ? (groups.length ? groups.map((g) => `<article class="card offer-group">
    <header class="section-head"><h2>${g.sources.map((s) => SOURCE_LABEL[s]).join('')} ${esc(g.term)}</h2>
      <span class="muted small">${g.offers.length} ${g.offers.length === 1 ? 'Angebot' : 'Angebote'}</span></header>
    ${reason(g) ? `<p class="muted small">${reason(g)}</p>` : ''}
    ${stockNote(g)}
    <ul class="offer-list">${g.offers.slice(0, 5).map(offerRow).join('')}</ul>
  </article>`).join('') : `<article class="card"><p class="empty">Diese Woche nichts Passendes in euren Läden${settings.bio === 'only' ? ' (nur Bio)' : ''}.</p></article>`) : ''}

  ${listCard(list, settings)}
  <p class="hint">Angebote von marktguru.de, ohne Gewähr – maßgeblich ist der Prospekt im Laden. Regionale Abweichungen möglich.</p>`;
}

function saveSettings(change) {
  update((data) => {
    const s = offerSettings(data);
    change(s);
    data.offerSettings = s;
  });
}

export const actions = {
  'stock-used'(el) {
    update((data) => { data.stockUsed = { ...(data.stockUsed || {}), [el.dataset.key]: todayISO() }; });
  },
  'offers-save'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const zip = String(fields.get('zip') || '').trim();
    const shops = fields.getAll('shops').map(String);
    const error = form.querySelector('.form-error');
    if (!/^\d{5}$/.test(zip) || !shops.length) {
      error.textContent = !shops.length ? 'Bitte mindestens einen Laden wählen.' : 'Bitte eine fünfstellige Postleitzahl eintragen.';
      error.hidden = false;
      return;
    }
    saveSettings((s) => {
      s.zip = zip;
      s.shops = shops;
      s.bio = String(fields.get('bio') || 'prefer');
      s.exclude = String(fields.get('exclude') || '').trim();
      s.cards = fields.getAll('cards').map(String);
    });
    state = { ...state, showSettings: false, error: null, autoTried: null };
    ctx.rerender();
  },
  'offers-settings'(_el, _event, ctx) {
    state.showSettings = !state.showSettings;
    ctx.rerender();
  },
  'offers-check'(_el, _event, ctx) {
    check(ctx.data, ctx.rerender);
  },
  'offers-term-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const term = String(fields.get('term') || '').trim();
    if (!term) return;
    saveSettings((s) => {
      s.terms = s.terms.filter((t) => t.term.toLowerCase() !== term.toLowerCase());
      s.terms.push({ term, quality: Boolean(fields.get('quality')) });
      s.hidden = s.hidden.filter((h) => h.toLowerCase() !== term.toLowerCase());
    });
    ctx.focus('.term-form input[name="term"]');
  },
  'offers-hide'(el) {
    const term = el.dataset.key;
    saveSettings((s) => {
      const own = s.terms.some((t) => t.term.toLowerCase() === term.toLowerCase());
      s.terms = s.terms.filter((t) => t.term.toLowerCase() !== term.toLowerCase());
      // Eigene Woerter einfach loeschen, Vorschlaege merken, damit sie nicht wiederkommen.
      if (!own && !s.hidden.includes(term.toLowerCase())) s.hidden.push(term.toLowerCase());
    });
  },
  'offers-unhide'(el) {
    saveSettings((s) => { s.hidden = s.hidden.filter((h) => h !== el.dataset.key); });
  },
};
