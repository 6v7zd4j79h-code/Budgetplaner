// Kassenbon scannen: Foto -> Texterkennung -> Artikel pruefen und als
// nötig/unnötig einordnen -> als Ausgabe buchen oder an eine vorhandene
// Buchung (z. B. aus dem Kontoauszug) anhaengen.

import { newId } from '../budget.js';
import { addMonths, formatDay, todayISO } from '../dates.js';
import { parseMoney } from '../money.js';
import { joinParts, parseReceipt } from '../receipt.js';
import { isPdf } from '../pdf-lines.js';
import { update } from '../store.js';
import { itemKey, rememberedWaste } from '../waste.js';
import { esc, eur, itemTags, moneyInput } from './dom.js';
import { peopleOf } from '../spending.js';

let scan = null;
// Von aussen gesetzt, wenn der Scan zu einer bestimmten Buchung gehoert.
let presetEntryId = null;

export function startFor(entryId) {
  presetEntryId = entryId;
  scan = null;
}

function reset() {
  scan = { phase: 'pick', progress: 0, status: '', imageUrl: null, error: null, parts: [] };
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
    <h2>Kassenbon oder Rechnung</h2>
    <p>Fotografiere den Bon von oben, möglichst gerade und gut beleuchtet. Lange Bons gern in zwei Fotos.</p>
    <p class="privacy">🔒 Das Foto wird nur hier auf dem Gerät gelesen. Es wird weder hochgeladen noch gespeichert.</p>
    ${photoButtons(true)}
    <p class="hint">Langer Bon? Einfach in mehreren Fotos von oben nach unten – die App fragt nach jedem Foto, ob noch etwas fehlt.</p>
    <p class="hint">📄 <strong>Digitaler Bon oder Rechnung als PDF</strong> (z. B. aus der EDEKA-, REWE-, Lidl-Plus- oder dm-App, oder eine heruntergeladene Rechnung)? Über „Bild oder PDF wählen“ – der Text wird direkt gelesen, ganz ohne Lesefehler.</p>
    ${scan.error ? `<p class="form-error">${esc(scan.error)}</p>` : ''}
    <p class="hint">Beim ersten Scan lädt die App einmalig die Texterkennung (ca. 5 MB). Danach geht es auch ohne Internet.</p>
  </article>`;
}

function photoButtons(first) {
  return `<div class="btn-row">
      <label class="btn ${first ? 'primary' : ''} file-btn">📷 ${first ? 'Foto aufnehmen' : 'Nächstes Stück fotografieren'}
        <input type="file" accept="image/*" capture="environment" data-action="receipt-photo" hidden>
      </label>
      <label class="btn file-btn">Bild oder PDF wählen
        <input type="file" accept="image/*,application/pdf,.pdf" data-action="receipt-photo" hidden>
      </label>
    </div>`;
}

const thumb = (part, i) => (part.imageUrl
  ? `<img class="receipt-thumb" src="${part.imageUrl}" alt="Foto ${i + 1} des Kassenbons">`
  : '<div class="receipt-thumb pdf-thumb" aria-label="PDF-Kassenbon">📄 PDF</div>');

// Nach jedem Foto: Geht der Bon weiter oder ist er vollstaendig?
function renderMore() {
  const r = scan.result;
  const n = scan.parts.length;
  return `
  <article class="card">
    <h2>${n === 1 ? 'Foto gelesen' : `${n} Fotos gelesen`}</h2>
    <div class="receipt-parts">${scan.parts.map((p, i) => `<figure>${thumb(p, i)}<figcaption class="muted small">Teil ${i + 1}</figcaption></figure>`).join('')}</div>
    <p>${r.items.length} Artikel erkannt${r.total ? ` · <strong>Summe ${eur(r.total)} gefunden</strong> – der Bon ist wahrscheinlich vollständig` : ' · noch keine Summe gefunden'}.</p>
    ${scan.error ? `<p class="form-error">${esc(scan.error)}</p>` : ''}
    <h3 class="sub-h">Geht der Bon noch weiter?</h3>
    <p class="hint">Fotografiere das nächste Stück von oben nach unten. Es darf ruhig ein, zwei Zeilen überlappen – doppelte Zeilen zählt die App nur einmal.</p>
    ${photoButtons(false)}
    <div class="btn-row more-done">
      <button type="button" class="btn ${r.total ? 'primary' : ''}" data-action="receipt-complete">✓ Bon ist vollständig – weiter</button>
      <button type="button" class="btn ghost" data-action="receipt-drop-part">Letztes Foto verwerfen</button>
    </div>
  </article>`;
}

function renderReading() {
  return `
  <article class="card">
    <h2>${scan.parts.length ? `Teil ${scan.parts.length + 1} wird gelesen …` : 'Bon wird gelesen …'}</h2>
    ${scan.imageUrl ? `<img class="receipt-thumb" src="${scan.imageUrl}" alt="Foto des Kassenbons">` : ''}
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(scan.progress * 100)}">
      <div style="width:${(scan.progress * 100).toFixed(0)}%"></div></div>
    <p class="muted">${esc(scan.status)} · ${Math.round(scan.progress * 100)} %</p>
  </article>`;
}

function renderReview(data) {
  const r = scan.result;
  const lines = expenseLines(data, r.date);
  const people = peopleOf(data);
  const sum = r.items.reduce((s, i) => s + i.amount, 0);
  const waste = r.items.reduce((s, i) => s + (i.waste ? i.amount : 0), 0);
  const diff = (r.total || 0) - sum;
  const matches = candidates(data.log, r.total, r.date);
  if (scan.target === undefined) scan.target = presetEntryId || matches[0]?.id || 'new';
  const preset = presetEntryId ? data.log.find((e) => e.id === presetEntryId) : null;
  const targetEntry = scan.target && scan.target !== 'new' ? data.log.find((e) => e.id === scan.target) : null;
  const options = [...(preset && !matches.includes(preset) ? [preset] : []), ...matches];

  return `
  <article class="card">
    <header class="section-head"><h2>Bon prüfen</h2>
      <button type="button" class="btn ghost" data-action="receipt-reset">Neu anfangen</button></header>
    <div class="receipt-head${scan.imageUrl ? '' : ' no-thumb'}">
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
    ${targetEntry?.items?.length ? `<label class="waste-toggle append-toggle"><input type="checkbox" data-action="receipt-append" ${scan.append ? 'checked' : ''}>
      <span>Die Buchung hat schon ${targetEntry.items.length} Artikel. Neue Artikel <strong>dazunehmen</strong> (z. B. zweiter Teil des Bons) statt ersetzen</span></label>` : ''}

    <h3 class="sub-h">Artikel <span class="muted">· Haken = unnötig · 🏷 im Angebot · 📦 auf Vorrat · 🎁 Geschenk · für wen</span></h3>
    ${r.items.length ? '' : '<p class="hint">Keine Artikel erkannt. Trag sie unten selbst ein oder versuch ein schärferes Foto.</p>'}
    <ul class="item-list receipt-items">${r.items.map((it, i) => `
      <li class="item${it.waste ? ' is-waste' : ''}">
        <input type="checkbox" class="waste-check" data-action="receipt-item-waste" data-key="${i}" ${it.waste ? 'checked' : ''} aria-label="${esc(it.name)} unnötig">
        <input type="text" class="item-name-input" data-action="receipt-item-name" data-key="${i}" value="${esc(it.name)}" aria-label="Artikel">
        ${moneyInput({ action: 'receipt-item-amount', key: String(i), value: it.amount, label: `Preis ${it.name}` })}
        <button type="button" class="del" data-action="receipt-item-del" data-key="${i}" aria-label="${esc(it.name)} entfernen">×</button>
        ${itemTags('receipt-item-tag', String(i), it, people)}
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
  if (scan.phase === 'more') return renderMore();
  if (scan.phase === 'review') return renderReview(data);
  if (scan.phase === 'done') return renderDone();
  return renderPick();
}

export const actions = {
  async 'receipt-photo'(el, _event, ctx) {
    const file = el.files?.[0];
    if (!file) return;
    // Weitere Fotos haengen sich an die bisherigen Teile an.
    const parts = scan.phase === 'more' ? scan.parts : [];
    if (!parts.length) scan.parts?.forEach((part) => part.imageUrl && URL.revokeObjectURL(part.imageUrl));
    const pdf = isPdf(file);
    const imageUrl = pdf ? null : URL.createObjectURL(file);
    scan = { phase: 'reading', progress: 0, status: pdf ? 'PDF wird geöffnet' : 'Bild wird vorbereitet', imageUrl, parts };
    ctx.rerender();
    try {
      let last = 0;
      const progress = (p, status) => {
        scan.progress = p;
        scan.status = status;
        // Nicht bei jedem Prozentpunkt neu zeichnen.
        if (p - last > 0.04 || p === 1) { last = p; ctx.rerender(); }
      };
      // Digitaler Bon (PDF): Text direkt auslesen. Foto: Texterkennung.
      const text = pdf
        ? await (await import('../pdf.js')).pdfText(file, progress)
        : await (await import('../ocr.js')).recognize(file, progress);
      if (pdf && !text.trim()) throw new Error('Im PDF steht kein lesbarer Text – ist es vielleicht ein eingescanntes Bild? Dann bitte als Foto aufnehmen');
      parts.push({ text, imageUrl });
      scan.text = joinParts(parts.map((part) => part.text));
      scan.imageUrl = parts.find((part) => part.imageUrl)?.imageUrl || null;
      const parsed = parseReceipt(scan.text);
      scan.result = {
        ...parsed,
        items: parsed.items.map((it) => ({ ...it, waste: rememberedWaste(ctx.data.wasteRules, it.name) === true })),
      };
      const lines = expenseLines(ctx.data, parsed.date);
      scan.lineId = (lines.find((l) => /lebensmittel/i.test(l.name)) || lines[0])?.id;
      // Ein digitaler Bon ist vollstaendig - direkt zum Pruefen.
      scan.phase = pdf && parts.length === 1 && parsed.total ? 'review' : 'more';
    } catch (error) {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      scan.imageUrl = parts[0]?.imageUrl || null;
      scan.phase = parts.length ? 'more' : 'pick';
      scan.error = pdf
        ? `Das PDF konnte nicht gelesen werden (${error?.message || error}).`
        : `Der Bon konnte nicht gelesen werden (${error?.message || error}). Ist das Internet für den ersten Scan da?`;
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
  'receipt-append'(el, _event, ctx) {
    scan.append = el.checked;
    ctx.rerender();
  },
  'receipt-target'(el, _event, ctx) {
    scan.target = el.dataset.key;
    ctx.rerender();
  },
  'receipt-item-tag'(el, _event, ctx) {
    const [index, tag] = el.dataset.key.split(':');
    const item = scan.result.items[Number(index)];
    item[tag] = !item[tag];
    ctx.rerender();
  },
  'receipt-item-tag-for'(el, _event, ctx) {
    scan.result.items[Number(el.dataset.key)].forWhom = el.value || undefined;
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
    const items = r.items.filter((i) => i.name && i.amount > 0).map((i) => ({ id: newId(), name: i.name, amount: i.amount, waste: !!i.waste, ...(i.deal ? { deal: true } : {}), ...(i.stock ? { stock: true } : {}), ...(i.gift ? { gift: true } : {}), ...(i.forWhom ? { forWhom: i.forWhom } : {}) }));
    const total = r.total || items.reduce((s, i) => s + i.amount, 0);
    if (!total) {
      const error = document.getElementById('receiptError');
      error.textContent = 'Bitte die Summe eintragen.';
      error.hidden = false;
      return;
    }
    // Versehentlich zweimal eingelesen? Gleicher Tag, gleiche Summe, schon mit Artikeln.
    if (scan.target === 'new') {
      const date = r.date || todayISO();
      const twin = ctx.data.log.find((e) => e.date === date && e.amount === total && e.items?.length);
      if (twin && !window.confirm(`Am ${formatDay(date)} gibt es schon einen Einkauf über ${eur(total)} mit Artikeln (${twin.note || 'ohne Notiz'}). Trotzdem noch einmal speichern?`)) return;
    }
    update((data) => {
      data.wasteRules = data.wasteRules || {};
      for (const item of items) data.wasteRules[itemKey(item.name)] = item.waste;
      const existing = scan.target !== 'new' ? data.log.find((e) => e.id === scan.target) : null;
      if (existing) {
        // Zweiter Teil eines Bons: anhaengen. Sonst ersetzen, damit derselbe
        // Bon nicht doppelt zaehlt, wenn er noch einmal gescannt wird.
        existing.items = scan.append ? [...(existing.items || []), ...items] : items;
      } else {
        data.log.push({ id: newId(), date: r.date || todayISO(), lineId: scan.lineId, note: r.shop || 'Einkauf', amount: total, items });
      }
    });
    presetEntryId = null;
    scan = { phase: 'done', saved: { count: items.length, waste: items.reduce((s, i) => s + (i.waste ? i.amount : 0), 0) } };
    ctx.rerender();
  },
  'receipt-complete'(_el, _event, ctx) {
    scan.error = null;
    scan.phase = 'review';
    ctx.rerender();
  },
  'receipt-drop-part'(_el, _event, ctx) {
    const part = scan.parts.pop();
    if (part?.imageUrl) URL.revokeObjectURL(part.imageUrl);
    if (!scan.parts.length) {
      reset();
    } else {
      scan.text = joinParts(scan.parts.map((p) => p.text));
      const parsed = parseReceipt(scan.text);
      scan.result = { ...parsed, items: parsed.items.map((it) => ({ ...it, waste: rememberedWaste(ctx.data.wasteRules, it.name) === true })) };
      scan.imageUrl = scan.parts.find((p) => p.imageUrl)?.imageUrl || null;
    }
    ctx.rerender();
  },
  'receipt-reset'(_el, _event, ctx) {
    scan?.parts?.forEach((part) => part.imageUrl && URL.revokeObjectURL(part.imageUrl));
    if (scan?.imageUrl && !scan?.parts?.length) URL.revokeObjectURL(scan.imageUrl);
    reset();
    ctx.rerender();
  },
};

// Fuer Tests und Fehlersuche: zuletzt erkannter Rohtext.
export function lastText() {
  return scan?.text || '';
}
