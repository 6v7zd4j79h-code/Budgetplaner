// Einstellungen: Sicherung, Wiederherstellung, alles loeschen.
//
// Die Daten liegen nur auf diesem Geraet. Die Sicherungsdatei ist deshalb
// der einzige Schutz gegen verlorene Daten - die Ansicht erinnert daran,
// wenn die letzte Sicherung lange her ist.

import { activeBudget, createBudget, deleteBudget, exportJson, importJson, lastBackupAt, renameBudget, resetAll, store } from '../store.js';
import { todayISO, formatDay } from '../dates.js';
import { esc } from './dom.js';
import { PALETTES, currentPalette, setPalette } from '../palette.js';

const REMIND_AFTER_DAYS = 30;

export function backupOverdue() {
  const { months, log, subscriptions, goals } = store.data;
  // Ein frisch angelegter Monat mit lauter Nullen zaehlt nicht als Daten.
  const hasData = log.length > 0 || subscriptions.length > 0 || goals.length > 0
    || Object.values(months).some((m) => Object.values(m.lines).some((lines) => lines.some((l) => l.budget > 0)));
  if (!hasData) return false;
  const last = lastBackupAt();
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) / 86400000 > REMIND_AFTER_DAYS;
}

export function render() {
  const last = lastBackupAt();
  const active = currentPalette();
  const current = activeBudget();
  return `
  <article class="card">
    <h2>Budgets</h2>
    <p class="hint">Getrennte Budgets, z. B. für dein Konto und das Gemeinschaftskonto. Jedes hat eigene Monate, Ausgaben, Abos und Sparziele. Umschalten oben im Kopf.</p>
    <ul class="budget-list">${store.budgets.map((b) => `
      <li class="budget-row${b.id === store.active ? ' active' : ''}">
        <input type="text" data-action="budget-rename" data-key="${esc(b.id)}" value="${esc(b.name)}" aria-label="Name des Budgets">
        ${b.id === store.active ? '<span class="pill">aktiv</span>' : `<button type="button" class="btn" data-action="budget-switch" data-key="${esc(b.id)}">Öffnen</button>`}
        ${b.id === 'privat' ? '<span></span>' : `<button type="button" class="del" data-action="budget-delete" data-key="${esc(b.id)}" aria-label="${esc(b.name)} löschen" title="Budget löschen">×</button>`}
      </li>`).join('')}</ul>
    <form class="budget-add" data-action="budget-add">
      <input type="text" name="name" placeholder="z. B. Gemeinsam" aria-label="Name des neuen Budgets" required autocomplete="off">
      <button type="submit" class="btn">+ Neues Budget</button>
    </form>
  </article>

  <article class="card">
    <h2>Farbe</h2>
    <div class="palettes">${PALETTES.map((p) => `
      <button type="button" class="palette-btn" data-action="palette" data-key="${p.id}" aria-pressed="${p.id === active}">
        <span class="swatch" aria-hidden="true">${p.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
        ${esc(p.label)}
      </button>`).join('')}
    </div>
    <p class="hint" style="margin:10px 0 0">Gilt nur für dieses Gerät.</p>
  </article>

  <article class="card">
    <h2>Sicherung${store.budgets.length > 1 ? ` · ${esc(current.name)}` : ''}</h2>
    <p>Alle Daten liegen <strong>nur auf diesem Gerät</strong>. Nichts wird ins Internet geschickt.
      Damit nichts verloren geht, wenn das Gerät kaputtgeht oder die Browserdaten gelöscht werden,
      speichere ab und zu eine Sicherungsdatei – z. B. in iCloud, Google Drive oder per Mail an dich selbst.</p>
    <p class="${backupOverdue() ? 'warn' : 'muted'}">Letzte Sicherung: ${last ? esc(formatDay(last.slice(0, 10))) : 'noch keine'}</p>
    <div class="btn-row">
      <button type="button" class="btn primary" data-action="export">Sicherung speichern</button>
      <label class="btn">Sicherung wiederherstellen
        <input type="file" accept="application/json,.json" data-action="import" hidden>
      </label>
    </div>
    <p class="form-error" id="importError" role="alert" hidden></p>
    ${store.saveFailed ? '<p class="warn">Achtung: Der Browser lässt gerade nicht speichern (privater Modus?). Änderungen gehen beim Schließen verloren.</p>' : ''}
  </article>

  <article class="card">
    <h2>Als App installieren</h2>
    <p><strong>iPhone/iPad:</strong> In Safari auf „Teilen" tippen, dann „Zum Home-Bildschirm".<br>
      <strong>Android:</strong> In Chrome im Menü ⋮ „App installieren" wählen.<br>
      Danach startet der Budgetplaner wie eine normale App und funktioniert auch ohne Internet.</p>
  </article>

  <article class="card danger-zone">
    <h2>Alles löschen</h2>
    <p>Löscht alle Monate, Buchungen, Abos und Sparziele ${store.budgets.length > 1 ? `im Budget „${esc(current.name)}“` : 'auf diesem Gerät'}. Vorher am besten eine Sicherung speichern.</p>
    <button type="button" class="btn danger" data-action="reset">Alle Daten löschen</button>
  </article>`;
}

export const actions = {
  'budget-add'(form, event) {
    event.preventDefault();
    const name = String(new FormData(form).get('name')).trim();
    if (name) createBudget(name);
  },
  'budget-switch'(el) { switchBudget(el.dataset.key); },
  'budget-rename'(el) { renameBudget(el.dataset.key, el.value.trim()); },
  'budget-delete'(el) {
    const budget = store.budgets.find((b) => b.id === el.dataset.key);
    if (!budget) return;
    if (!window.confirm(`Budget „${budget.name}“ mit allen Daten löschen?`)) return;
    if (!window.confirm('Ganz sicher? Ohne Sicherungsdatei ist das endgültig.')) return;
    deleteBudget(budget.id);
  },
  palette(el, _event, ctx) {
    setPalette(el.dataset.key);
    ctx.rerender();
  },
  export(_el, _event, ctx) {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = store.budgets.length > 1 ? `-${activeBudget().id}` : '';
    link.download = `budgetplaner${suffix}-sicherung-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ctx.rerender();
  },
  async import(el) {
    const file = el.files?.[0];
    if (!file) return;
    if (!window.confirm('Sicherung wiederherstellen? Die jetzigen Daten auf diesem Gerät werden dabei ersetzt.')) {
      el.value = '';
      return;
    }
    const problem = importJson(await file.text());
    if (problem) {
      const error = document.getElementById('importError');
      error.textContent = problem;
      error.hidden = false;
    } else {
      window.alert('Sicherung wiederhergestellt.');
    }
  },
  reset() {
    if (!window.confirm('Wirklich alle Daten auf diesem Gerät löschen?')) return;
    if (!window.confirm('Ganz sicher? Das lässt sich ohne Sicherungsdatei nicht rückgängig machen.')) return;
    resetAll();
  },
};
