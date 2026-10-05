// Kassenbon scannen: Foto -> Texterkennung -> Artikel pruefen und als
// nötig/unnötig einordnen -> als Ausgabe buchen oder an eine vorhandene
// Buchung (z. B. aus dem Kontoauszug) anhaengen.

import { newId } from '../budget.js';
import { addMonths, formatDay, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { parseReceipt } from '../receipt.js';
import { update } from '../store.js';
import { itemKey, rememberedWaste } from '../waste.js';
import { esc, eur, moneyInput } from './dom.js';

let scan = null;
// Von aussen gesetzt, wenn der Scan zu einer bestimmten Buchung gehoert.
let presetEntryId = null;

export function startFor(entryId) {
  presetEntryId = entryId;
  scan = null;
}

function reset() {
  scan = { phase: 'pick', progress: 0, status: '', imageUrl: null, error: null };
}

// Passende Buchung zum Bon: gleicher Betrag, hoechstens 4 Tage Abstand.
function candidates(log, total, date) {
  if (!total || !date) return [];
  const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  return log
    .filter((e) => e.amount === total && Math.abs(day(e.date) - day(date)) <= 4)
    .sort((a, b) => Math.abs(day(a.date) - day(date)) - Math.abs(day(b.date) - day(date)));
}

function expenseLines(data, date) {
  const key = (date || todayISO()).slice(0, 7);
  const month = data.months[key] || data.months[addMonths(key, -1)] || Object.values(data.months)[0];
  return month ? month.lines.expenses : [];
}

function renderPick() {
  return `
  <article class="card">
    <h2>Kassenbon scannen</h2>
    <p>Fotografiere den Bon von oben, möglichst gerade und gut beleuchtet. Lange Bons gern in zwei Fotos.</p>
    <p class="privacy">🔒 Das Foto wird nur hier auf dem Gerät gelesen. Es wird weder hochgeladen noch gespeichert.</p>
    <div class="btn-row">
      <label class="btn primary file-btn">📷 Foto aufnehmen
        <input type="file" accept="image/*" capture="environment" data-action="receipt-photo" hidden>
      </label>
      <label class="btn file-btn">Bild aus Galerie
        <input type="file" accept="image/*" data-action="receipt-photo" hidden>
      </label>
    </div>
    ${scan.error ? `<p class="form-error">${esc(scan.error)}</p>` : ''}
    <p class="hint">Beim ersten Scan lädt die App einmalig die Texterkennung (ca. 5 MB). Danach geht es auch ohne Internet.</p>
  </article>`;
}

function renderReading() {
  return `
  <article class="card">
    <h2>Bon wird gelesen …</h2>
    ${scan.imageUrl ? `<img class="receipt-thumb" src="${scan.imageUrl}" alt="Foto des Kassenbons">` : ''}
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(scan.progress * 100)}">
      <div style="width:${(scan.progress * 100).toFixed(0)}%"></div></div>
    <p class="muted">${esc(scan.status)} · ${Math.round(scan.progress * 100)} %</p>
  </article>`;
}

function renderReview(data) {
  const r = scan.result;
  const lines = expenseLines(data, r.date);
  const sum = r.items.reduce((s, i) => s + i.amount, 0);
  const waste = r.items.reduce((s, i) => s + (i.waste ? i.amount : 0), 0);
  const diff = (r.total || 0) - sum;
  const matches = candidates(data.log, r.total, r.date);
  if (scan.target === undefined) scan.target = presetEntryId || matches[0]?.id || 'new';
  const preset = presetEntryId ? data.log.find((e) => e.id === presetEntryId) : null;
  const options = [...(preset && !matches.includes(preset) ? [preset] : []), ...matches];

  return `
  <article class="card">
    <header class="section-head"><h2>Bon prüfen</h2>
      <button type="button" class="btn ghost" data-action="receipt-reset">Neues Foto</button></header>
    <div class="receipt-head">
      ${scan.imageUrl ? `<img class="receipt-thumb" src="${scan.imageUrl}" alt="Foto des Kassenbons">` : ''}
      <div class="receipt-fields">
        <label>Laden<input type="text" data-action="receipt-field" data-key="shop" value="${esc(r.shop)}" placeholder="z. B. EDEKA"></label>
        <label>Datum<input type="date" data-action="receipt-field" data-key="date" value="${esc(r.date || todayISO())}"></label>
        <label>Summe laut Bon${moneyInput({ action: 'receipt-field', key: 'total', value: r.total, label: 'Summe' })}</label>
      </div>
    </div>

    <h3 class="sub-h">Wohin damit?</h3>
    <div class="target-list">
      ${options.map((e) => `<label class="target"><input type="radio" name="target" value="${esc(e.id)}" data-action="receipt-target" data-key="${esc(e.id)}" ${scan.target === e.id ? 'checked' : ''}>
        <span>An Buchung <strong>${esc(e.note || 'ohne Notiz')}</strong> vom ${formatDay(e.date)} (${eur(e.amount)}) anhängen
        <span class="muted">– z. B. aus dem Kontoauszug, dann zählt nichts doppelt</span></span></label>`).join('')}
      <label class="target"><input type="radio" name="target" value="new" data-action="receipt-target" data-key="new" ${scan.target === 'new' ? 'checked' : ''}>
        <span>Als neue Ausgabe buchen in
          <select data-action="receipt-field" data-key="lineId" aria-label="Kategorie">${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === scan.lineId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></span></label>
    </div>

    <h3 class="sub-h">Artikel <span class="muted">· Haken = unnötig</span></h3>
    ${r.items.length ? '' : '<p class="hint">Keine Artikel erkannt. Trag sie unten selbst ein oder versuch ein schärferes Foto.</p>'}
    <ul class="item-list receipt-items">${r.items.map((it, i) => `
      <li class="item${it.waste ? ' is-waste' : ''}">
        <input type="checkbox" class="waste-check" data-action="receipt-item-waste" data-key="${i}" ${it.waste ? 'checked' : ''} aria-label="${esc(it.name)} unnötig">
        <input type="text" class="item-name-input" data-action="receipt-item-name" data-key="${i}" value="${esc(it.name)}" aria-label="Artikel">
        ${moneyInput({ action: 'receipt-item-amount', key: String(i), value: it.amount, label: `Preis ${it.name}` })}
        <button type="button" class="del" data-action="receipt-item-del" data-key="${i}" aria-label="${esc(it.name)} entfernen">×</button>
      </li>`).join('')}</ul>
    <button type="button" class="btn ghost" data-action="receipt-item-add">+ Artikel</button>

    <div class="receipt-sums">
      <span>Artikel ${eur(sum)}${r.total ? ` von ${eur(r.total)}` : ''}</span>
      ${r.total && diff !== 0 ? `<span class="${diff < 0 ? 'neg' : 'muted'}">${diff > 0 ? `${eur(diff)} nicht zugeordnet – zählt als nötig` : `Artikel sind ${eur(-diff)} mehr als die Summe – Preise prüfen`}</span>` : ''}
      <strong class="waste-sum">Unnötig: ${eur(waste)}</strong>
    </div>
    <p class="form-error" id="receiptError" hidden></p>
    <button type="button" class="btn primary" data-action="receipt-save">Speichern</button>
  </article>`;
}

function renderDone() {
  return `
  <article class="card">
    <h2>Gespeichert</h2>
    <p>${scan.saved.count} Artikel eingeordnet, davon unnötig: <strong class="waste-sum">${eur(scan.saved.waste)}</strong>.</p>
    <div class="btn-row">
      <button type="button" class="btn primary" data-action="receipt-reset">Nächsten Bon scannen</button>
      <button type="button" class="btn" data-action="goto" data-view="log">Zu den Ausgaben</button>
    </div>
  </article>`;
}

export function render({ data }) {
  if (!scan) reset();
  if (scan.phase === 'reading') return renderReading();
  if (scan.phase === 'review') return renderReview(data);
  if (scan.phase === 'done') return renderDone();
  return renderPick();
}

export const actions = {
  async 'receipt-photo'(el, _event, ctx) {
    const file = el.files?.[0];
    if (!file) return;
    if (scan.imageUrl) URL.revokeObjectURL(scan.imageUrl);
    scan = { phase: 'reading', progress: 0, status: 'Bild wird vorbereitet', imageUrl: URL.createObjectURL(file) };
    ctx.rerender();
    try {
      const { recognize } = await import('../ocr.js');
      let last = 0;
      const text = await recognize(file, (p, status) => {
        scan.progress = p;
        scan.status = status;
        // Nicht bei jedem Prozentpunkt neu zeichnen.
        if (p - last > 0.04 || p === 1) { last = p; ctx.rerender(); }
      });
      const parsed = parseReceipt(text);
      scan.text = text;
      scan.result = {
        ...parsed,
        items: parsed.items.map((it) => ({ ...it, waste: rememberedWaste(ctx.data.wasteRules, it.name) === true })),
      };
      const lines = expenseLines(ctx.data, parsed.date);
      scan.lineId = (lines.find((l) => /lebensmittel/i.test(l.name)) || lines[0])?.id;
      scan.phase = 'review';
    } catch (error) {
      scan.phase = 'pick';
      scan.error = `Der Bon konnte nicht gelesen werden (${error?.message || error}). Ist das Internet für den ersten Scan da?`;
    }
    ctx.rerender();
  },
  'receipt-field'(el, _event, ctx) {
    const field = el.dataset.key;
    if (field === 'total') scan.result.total = parseMoney(el.value);
    else if (field === 'lineId') scan.lineId = el.value;
    else scan.result[field] = el.value.trim();
    if (field === 'total' || field === 'date') scan.target = undefined;
    ctx.rerender();
  },
  'receipt-target'(el, _event, ctx) {
    scan.target = el.dataset.key;
    ctx.rerender();
  },
  'receipt-item-waste'(el, _event, ctx) {
    scan.result.items[Number(el.dataset.key)].waste = el.checked;
    ctx.rerender();
  },
  'receipt-item-name'(el, _event, ctx) {
    const item = scan.result.items[Number(el.dataset.key)];
    item.name = el.value.trim();
    const known = rememberedWaste(ctx.data.wasteRules, item.name);
    if (known != null) item.waste = known;
    ctx.rerender();
  },
  'receipt-item-amount'(el, _event, ctx) {
    scan.result.items[Number(el.dataset.key)].amount = Math.max(0, parseMoney(el.value) ?? 0);
    ctx.rerender();
  },
  'receipt-item-del'(el, _event, ctx) {
    scan.result.items.splice(Number(el.dataset.key), 1);
    ctx.rerender();
  },
  'receipt-item-add'(_el, _event, ctx) {
    scan.result.items.push({ name: '', amount: 0, waste: true });
    ctx.focus(`[data-action="receipt-item-name"][data-key="${scan.result.items.length - 1}"]`);
  },
  'receipt-save'(_el, _event, ctx) {
    const r = scan.result;
    const items = r.items.filter((i) => i.name && i.amount > 0).map((i) => ({ id: newId(), name: i.name, amount: i.amount, waste: !!i.waste }));
    const total = r.total || items.reduce((s, i) => s + i.amount, 0);
    if (!total) {
      const error = document.getElementById('receiptError');
      error.textContent = 'Bitte die Summe eintragen.';
      error.hidden = false;
      return;
    }
    update((data) => {
      data.wasteRules = data.wasteRules || {};
      for (const item of items) data.wasteRules[itemKey(item.name)] = item.waste;
      const existing = scan.target !== 'new' ? data.log.find((e) => e.id === scan.target) : null;
      if (existing) {
        // Doppelte Artikel vermeiden, falls derselbe Bon zweimal gescannt wird.
        existing.items = items;
      } else {
        data.log.push({ id: newId(), date: r.date || todayISO(), lineId: scan.lineId, note: r.shop || 'Einkauf', amount: total, items });
      }
    });
    presetEntryId = null;
    scan = { phase: 'done', saved: { count: items.length, waste: items.reduce((s, i) => s + (i.waste ? i.amount : 0), 0) } };
    ctx.rerender();
  },
  'receipt-reset'(_el, _event, ctx) {
    if (scan?.imageUrl) URL.revokeObjectURL(scan.imageUrl);
    reset();
    ctx.rerender();
  },
};

// Fuer Tests und Fehlersuche: zuletzt erkannter Rohtext.
export function lastText() {
  return scan?.text || '';
}
