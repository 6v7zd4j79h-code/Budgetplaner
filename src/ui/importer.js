// Kontoauszug einlesen: Dateien waehlen, Vorschlaege pruefen, uebernehmen.
// Die Dateien werden nur im Browser gelesen und nirgendwohin geschickt.
// Der Zwischenstand lebt nur im Speicher dieser Ansicht.

import { decodeBytes, readStatement } from '../import/csv.js';
import { monthsIn, suggest } from '../import/classify.js';
import { alreadyImported, applyImport } from '../import/apply.js';
import { openingBalance, openingFromToday } from '../import/balance.js';
import { parseMoney } from '../money.js';
import { formatDay } from '../dates.js';
import { monthLabel } from '../dates.js';
import { update } from '../store.js';
import { esc, eur, moneyInput } from './dom.js';

const SECTION_OPTIONS = [
  ['income', 'Einkommen'],
  ['bills', 'Rechnung'],
  ['subscription', 'Abo'],
  ['expenses', 'Ausgabe'],
  ['savings', 'Sparen'],
  ['debts', 'Schulden'],
  ['ignore', 'Ignorieren'],
];

const DEFAULT_CATEGORIES = ['Lebensmittel', 'Drogerie', 'Tanken / Fahrkarten', 'Freizeit', 'Kleidung',
  'Haushalt / Wohnen', 'Online-Shopping', 'Sonstiges'];

let session = null;

function reset() {
  session = { files: [], transactions: [], key: null, groups: [], result: null, busy: false, takeStart: true };
}

// Startbetrag je Konto und zusammen. complete ist false, solange bei einem
// Konto ohne Saldo der heutige Kontostand fehlt.
function startBalance() {
  const rows = session.files
    .filter((f) => !f.error && f.account)
    .map((f, i) => {
      const auto = openingBalance(f, session.key);
      if (auto.value != null) return { file: f, index: i, value: auto.value, how: auto.how };
      const value = f.today != null ? openingFromToday(f, session.key, f.today) : null;
      return { file: f, index: i, value, how: 'today' };
    });
  const complete = rows.length > 0 && rows.every((r) => r.value != null);
  return { rows, complete, total: rows.reduce((s, r) => s + (r.value || 0), 0) };
}

function renderOpening(start) {
  if (!start.rows.length) return '';
  const monthStart = `${session.key}-01`;
  return `
    <section class="start-import">
      <h3 class="sub-h">Startbetrag am ${formatDay(monthStart)}</h3>
      <ul class="start-rows">${start.rows.map((r) => {
        const lastDate = r.file.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
        return `<li>
        <span><strong>${esc(r.file.bank)}</strong> <span class="muted">· ${esc(r.file.name)}</span></span>
        ${r.how === 'today' ? `
          <label class="today-balance">Kontostand heute laut Banking-App
            ${moneyInput({ action: 'start-today', key: String(session.files.indexOf(r.file)), value: r.file.today, label: `Kontostand heute ${r.file.bank}`, placeholder: 'z. B. 1.234,56' })}</label>
          <span class="hint">Die App rechnet die Umsätze seit dem ${formatDay(monthStart)} heraus. Die Datei sollte dafür bis heute reichen${lastDate ? ` (letzte Buchung: ${formatDay(lastDate)})` : ''}.</span>`
          : `<span class="muted">${r.how === 'column' ? 'aus dem Saldo im Auszug' : 'aus dem Kontostand im Auszug'}</span>`}
        <strong class="start-value">${r.value != null ? eur(r.value) : '–'}</strong>
      </li>`;
      }).join('')}</ul>
      <label class="waste-toggle start-take"><input type="checkbox" data-action="start-take" ${session.takeStart && start.complete ? 'checked' : ''} ${start.complete ? '' : 'disabled'}>
        <span>${start.complete ? `${eur(start.total)} als Startbetrag übernehmen` : 'Startbetrag übernehmen – erst Kontostand eintragen'}</span></label>
    </section>`;
}

function regroup(data) {
  const pending = session.transactions;
  session.groups = suggest(pending, session.key, data.learned || {});
  session.duplicates = alreadyImported(data, pending.filter((t) => t.date.startsWith(session.key)));
}

const HELP = `
  <details class="help">
    <summary>Wo finde ich die CSV-Datei bei meiner Bank?</summary>
    <ul>
      <li><strong>Sparkasse:</strong> Online-Banking → Umsätze → Zeitraum wählen → „Export“ → <em>CSV-CAMT V2</em></li>
      <li><strong>Commerzbank:</strong> Umsätze → Symbol „Exportieren“ → <em>CSV</em></li>
      <li><strong>Revolut:</strong> Konto → … → Kontoauszug → Format <em>Excel/CSV</em></li>
      <li><strong>PayPal:</strong> Aktivitäten → Kontoauszüge → Aktivitätsdownload → <em>CSV</em></li>
      <li><strong>Stripe:</strong> Berichte → Saldo → Saldo-Transaktionen → <em>CSV herunterladen</em></li>
      <li><strong>Andere (z. B. PayQuicker):</strong> jede CSV-Datei mit Spalten für Datum und Betrag</li>
    </ul>
    <p>Am besten einen ganzen Monat exportieren. Mehrere Dateien auf einmal sind kein Problem.</p>
  </details>`;

function renderStart() {
  return `
  <article class="card">
    <h2>Kontoauszug einlesen</h2>
    <p>Wähle eine oder mehrere CSV-Dateien aus dem Online-Banking. Die App sortiert die Umsätze vor,
      du prüfst und übernimmst sie.</p>
    <p class="privacy">🔒 Die Dateien werden nur hier auf dem Gerät gelesen und nirgendwohin geschickt.</p>
    <label class="btn primary file-btn">CSV-Dateien wählen
      <input type="file" accept=".csv,text/csv,text/plain" multiple data-action="import-files" hidden>
    </label>
    ${session.busy ? '<p class="muted">Lese Dateien …</p>' : ''}
    ${session.files.filter((f) => f.error).map((f) => `<p class="form-error">${esc(f.name)}: ${esc(f.error)}</p>`).join('')}
    ${HELP}
  </article>`;
}

function categoryOptions(month, selected) {
  const names = [...new Set([...month.lines.expenses.map((l) => l.name).filter(Boolean), ...DEFAULT_CATEGORIES, selected])];
  return names.map((n) => `<option ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
}

function renderReview(data) {
  const month = data.months[session.key] || { lines: { expenses: [] } };
  const months = monthsIn(session.transactions);
  const groups = session.groups;
  const included = groups.filter((g) => g.include && g.section !== 'ignore');
  const totalIn = included.filter((g) => g.section === 'income').reduce((s, g) => s + g.total, 0);
  const totalOut = included.filter((g) => g.section !== 'income').reduce((s, g) => s + g.total, 0);

  const rows = groups.map((g, i) => `
    <li class="sugg${g.include && g.section !== 'ignore' ? '' : ' off'}">
      <input type="checkbox" class="check" data-action="sugg-include" data-key="${i}" ${g.include && g.section !== 'ignore' ? 'checked' : ''} aria-label="${esc(g.label)} übernehmen">
      <div class="sugg-who">
        <strong>${esc(g.label)}</strong>
        <span class="muted">${g.transactions.length}× · ${esc(g.sources.join(', '))}</span>
      </div>
      <span class="sugg-amount ${g.incoming ? 'pos' : ''}">${g.incoming ? '+' : '−'}${eur(g.total)}</span>
      <select data-action="sugg-section" data-key="${i}" aria-label="Bereich für ${esc(g.label)}">
        ${SECTION_OPTIONS.map(([id, label]) => `<option value="${id}" ${id === g.section ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      ${g.section === 'expenses'
        ? `<select data-action="sugg-name" data-key="${i}" aria-label="Kategorie">${categoryOptions(month, g.name)}</select>`
        : g.section === 'ignore' ? '<span></span>'
          : `<input type="text" data-action="sugg-name" data-key="${i}" value="${esc(g.section === 'subscription' ? g.label : g.name)}" aria-label="Bezeichnung im Budget" ${g.section === 'subscription' ? 'disabled' : ''}>`}
    </li>`).join('');

  return `
  <article class="card">
    <header class="section-head">
      <h2>Prüfen und übernehmen</h2>
      <button type="button" class="btn ghost" data-action="import-reset">Andere Dateien</button>
    </header>
    <ul class="file-list">${session.files.map((f) => `<li>${f.error
      ? `<span class="neg">${esc(f.name)}: ${esc(f.error)}</span>`
      : `<strong>${esc(f.bank)}</strong> · ${esc(f.name)} · ${f.count} ${f.count === 1 ? 'Umsatz' : 'Umsätze'}${f.skipped ? ` <span class="muted">· ${f.skipped} ausgelassen</span>` : ''}`}</li>`).join('')}</ul>
    ${session.files.some((f) => f.skipped) ? '<p class="hint">Ausgelassen werden vorgemerkte Umsätze, Fremdwährungen und PayPal-Aufladungen vom Bankkonto – die stehen sonst doppelt drin.</p>' : ''}
    <label class="month-pick">Monat
      <select data-action="import-month">${months.map((m) => `<option value="${m.key}" ${m.key === session.key ? 'selected' : ''}>${monthLabel(m.key)} (${m.count})</option>`).join('')}</select>
    </label>
    ${session.duplicates ? `<p class="hint">${session.duplicates} Umsätze aus diesem Monat wurden schon früher übernommen und werden nicht doppelt gezählt.</p>` : ''}
    <p class="hint">Die App schlägt vor, du entscheidest. Was du hier wählst, merkt sie sich für das nächste Mal.</p>
    <ul class="suggs">${rows}</ul>
    ${renderOpening(startBalance())}
    <div class="import-foot">
      <span>Einnahmen <strong class="pos">${eur(totalIn)}</strong> · Ausgaben <strong>${eur(totalOut)}</strong></span>
      <button type="button" class="btn primary" data-action="import-apply" ${included.length ? '' : 'disabled'}>In ${esc(monthLabel(session.key))} übernehmen</button>
    </div>
  </article>`;
}

function renderResult() {
  const r = session.result;
  return `
  <article class="card">
    <h2>Übernommen</h2>
    <p>${r.total
      ? `${r.lines} Posten im Budget, ${r.entries} Ausgaben im Log${r.subscriptions ? `, ${r.subscriptions} neue Abos` : ''} – zusammen ${eur(r.total)}.`
      : 'Nichts Neues – alle Umsätze waren schon übernommen.'}${r.start != null ? ` Startbetrag: ${eur(r.start)}.` : ''}</p>
    <div class="btn-row">
      <button type="button" class="btn primary" data-action="import-show">${esc(monthLabel(r.key))} ansehen</button>
      <button type="button" class="btn" data-action="import-reset">Weitere Datei einlesen</button>
    </div>
  </article>`;
}

export function render({ data }) {
  if (!session) reset();
  if (session.result) return renderResult();
  if (session.groups.length || (session.transactions.length && session.key)) return renderReview(data);
  return renderStart();
}

export const actions = {
  async 'import-files'(el, _event, ctx) {
    const files = [...(el.files || [])];
    if (!files.length) return;
    session.busy = true;
    ctx.rerender();
    const results = [];
    for (const file of files) {
      const text = decodeBytes(await file.arrayBuffer());
      const r = readStatement(text, file.name);
      results.push({
        name: file.name, bank: r.bank?.label || '–', count: r.transactions.length, skipped: r.skipped, error: r.error,
        transactions: r.transactions, account: r.bank?.account === true, preamble: r.preamble, today: null,
      });
    }
    session.busy = false;
    session.files = results;
    session.transactions = results.flatMap((r) => r.transactions);
    const months = monthsIn(session.transactions);
    if (months.length) {
      // Vorauswahl: der Monat mit den meisten Umsaetzen - meist der gewollte.
      session.key = [...months].sort((a, b) => b.count - a.count || (a.key < b.key ? 1 : -1))[0].key;
      regroup(ctx.data);
    }
    ctx.rerender();
  },
  'import-month'(el, _event, ctx) {
    session.key = el.value;
    regroup(ctx.data);
    ctx.rerender();
  },
  'sugg-include'(el, _event, ctx) {
    const g = session.groups[Number(el.dataset.key)];
    g.include = el.checked;
    if (el.checked && g.section === 'ignore') g.section = 'expenses';
    ctx.rerender();
  },
  'sugg-section'(el, _event, ctx) {
    const g = session.groups[Number(el.dataset.key)];
    g.section = el.value;
    g.include = el.value !== 'ignore';
    if (el.value === 'expenses' && !DEFAULT_CATEGORIES.includes(g.name)) g.name = 'Sonstiges';
    if (el.value !== 'expenses' && DEFAULT_CATEGORIES.includes(g.name)) g.name = g.label;
    ctx.rerender();
  },
  'sugg-name'(el) {
    session.groups[Number(el.dataset.key)].name = el.value.trim() || session.groups[Number(el.dataset.key)].label;
  },
  'start-today'(el, _event, ctx) {
    session.files[Number(el.dataset.key)].today = parseMoney(el.value);
    ctx.rerender();
  },
  'start-take'(el, _event, ctx) {
    session.takeStart = el.checked;
    ctx.rerender();
  },
  'import-apply'(_el, _event, ctx) {
    let summary;
    const start = startBalance();
    update((data) => {
      summary = applyImport(data, session.key, session.groups);
      if (session.takeStart && start.complete) {
        data.months[session.key].startBalance = start.total;
        summary.start = start.total;
      }
    });
    session.result = { ...summary, key: session.key };
    ctx.rerender();
  },
  'import-show'(_el, _event, ctx) {
    const key = session.result.key;
    reset();
    ctx.show('overview', key);
  },
  'import-reset'(_el, _event, ctx) {
    reset();
    ctx.rerender();
  },
};
