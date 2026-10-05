// Budget: die Monatstabelle zum Bearbeiten. Pro Bereich Zeilen mit Haken,
// Name, Budget und Ist. Aenderungen gelten nur fuer den angezeigten Monat;
// neue Monate uebernehmen die Zeilen des Vormonats.

import { SECTIONS, expenseActuals, lineActual, newId } from '../budget.js';
import { centsToInput, parseMoney } from '../money.js';
import { update } from '../store.js';
import { esc, eur, moneyInput } from './dom.js';

const HINTS = {
  income: 'Haken setzen, sobald das Geld da ist. Weicht der Betrag ab, trage ihn unter Ist ein.',
  bills: 'Haken setzen, sobald bezahlt. Ohne eigenen Ist-Betrag zählt das Budget.',
  expenses: 'Das Ist kommt automatisch aus den gebuchten Ausgaben.',
  savings: 'Haken setzen, sobald überwiesen.',
  debts: 'Raten, Kredite, Ratenkäufe – Haken setzen, sobald gezahlt.',
};

function lineRow(section, l, expenses) {
  const key = `${section}:${l.id}`;
  const isExpense = section === 'expenses';
  const actual = isExpense ? (expenses.byLine[l.id] || 0) : lineActual(l);
  const over = isExpense && actual > l.budget;
  return `<li class="line${l.done ? ' done' : ''}">
    ${isExpense
      ? '<span class="check-spacer" aria-hidden="true"></span>'
      : `<input type="checkbox" class="check" data-action="line-done" data-key="${esc(key)}"
          ${l.done ? 'checked' : ''} aria-label="${esc(l.name || 'Zeile')} erledigt">`}
    <input class="name" type="text" data-action="line-name" data-key="${esc(key)}"
      value="${esc(l.name)}" placeholder="Bezeichnung" aria-label="Bezeichnung">
    <span class="cell cell-budget"><span class="cell-label" aria-hidden="true">Budget</span>${moneyInput({ action: 'line-budget', key, value: l.budget, label: `Budget ${l.name}` })}</span>
    <span class="cell cell-actual"><span class="cell-label" aria-hidden="true">Ist</span>${isExpense
      ? `<span class="money readonly${over ? ' neg' : ''}" title="aus dem Ausgaben-Log">${eur(actual)}</span>`
      : moneyInput({
        action: 'line-actual',
        key,
        value: l.actual,
        label: `Ist ${l.name}`,
        placeholder: l.done ? centsToInput(l.budget) : '–',
      })}</span>
    <button type="button" class="del" data-action="line-del" data-key="${esc(key)}"
      aria-label="${esc(l.name || 'Zeile')} löschen" title="Zeile löschen">×</button>
  </li>`;
}

export function render({ data, key, summary }) {
  const month = data.months[key];
  const expenses = expenseActuals(month, data.log, key);
  const auto = month.startBalance == null;

  const sections = SECTIONS.map((s) => {
    const t = summary.totals[s.id];
    return `<article class="card section sec-${s.id}">
      <header class="section-head">
        <h2><span class="dot seg-${s.id}"></span>${esc(s.label)}</h2>
        <span class="section-sum">${eur(t.actual)} <span class="muted">/ ${eur(t.budget)}</span></span>
      </header>
      <p class="hint">${HINTS[s.id]}</p>
      <div class="line-head" aria-hidden="true"><span></span><span>Bezeichnung</span><span>Budget</span><span>Ist</span><span></span></div>
      <ul class="lines">${month.lines[s.id].map((l) => lineRow(s.id, l, expenses)).join('')}</ul>
      <button type="button" class="btn ghost" data-action="line-add" data-section="${s.id}">+ Zeile</button>
    </article>`;
  }).join('');

  return `
  <article class="card import-teaser">
    <div><h2>Kontoauszug einlesen</h2>
      <p class="hint">CSV aus dem Online-Banking wählen – die App füllt das Budget vor. Bleibt auf dem Gerät.</p></div>
    <button type="button" class="btn primary" data-action="goto" data-view="import">Einlesen</button>
  </article>
  <article class="card start-card">
    <label for="startInput"><h2>Startbetrag</h2></label>
    <p class="hint">${auto
      ? 'Automatisch der Restbetrag aus dem Vormonat. Trage einen Betrag ein, um ihn zu überschreiben.'
      : 'Fest eingetragen. Feld leeren, um wieder den Restbetrag aus dem Vormonat zu nehmen.'}</p>
    ${moneyInput({
      action: 'start',
      key: 'start',
      value: month.startBalance,
      label: 'Startbetrag',
      placeholder: centsToInput(summary.start) || '0',
      attrs: 'id="startInput"',
    })}
  </article>
  <div class="sections">${sections}</div>`;
}

function findLine(data, ctxKey, compound) {
  const [section, id] = compound.split(':');
  const lines = data.months[ctxKey].lines[section];
  return { section, lines, line: lines.find((l) => l.id === id) };
}

export const actions = {
  start(el, _event, { key }) {
    const value = parseMoney(el.value);
    update((data) => { data.months[key].startBalance = value; });
  },
  'line-name'(el, _event, { key }) {
    update((data) => {
      const { line } = findLine(data, key, el.dataset.key);
      if (line) line.name = el.value.trim();
    });
  },
  'line-budget'(el, _event, { key }) {
    const value = parseMoney(el.value);
    update((data) => {
      const { line } = findLine(data, key, el.dataset.key);
      if (line) line.budget = value ?? 0;
    });
  },
  'line-actual'(el, _event, { key }) {
    const value = parseMoney(el.value);
    update((data) => {
      const { line } = findLine(data, key, el.dataset.key);
      if (!line) return;
      line.actual = value;
      // Wer einen Ist-Betrag eintraegt, hat die Sache erledigt.
      if (value != null) line.done = true;
    });
  },
  'line-done'(el, _event, { key }) {
    update((data) => {
      const { line } = findLine(data, key, el.dataset.key);
      if (line) line.done = el.checked;
    });
  },
  'line-del'(el, _event, { key, data: current }) {
    const { section, line } = findLine(current, key, el.dataset.key);
    if (!line) return;
    const booked = section === 'expenses' ? current.log.filter((e) => e.lineId === line.id && e.date.startsWith(key)).length : 0;
    const question = booked
      ? `„${line.name}" löschen? ${booked} Buchung(en) in diesem Monat erscheinen dann unter „Ohne Kategorie".`
      : `„${line.name || 'Zeile'}" in diesem Monat löschen?`;
    if (!window.confirm(question)) return;
    update((data) => {
      const found = findLine(data, key, el.dataset.key);
      found.lines.splice(found.lines.indexOf(found.line), 1);
    });
  },
  'line-add'(el, _event, ctx) {
    const id = newId();
    update((data) => {
      data.months[ctx.key].lines[el.dataset.section].push({ id, name: '', budget: 0, actual: null, done: false });
    });
    ctx.focus(`[data-action="line-name"][data-key="${el.dataset.section}:${id}"]`);
  },
};
