import './styles.css';
import { ensureMonth, monthSummary } from './budget.js';
import { addMonths, monthKey, monthLabel } from './dates.js';
import { activeBudget, dismissNotice, isProtected, load, lock, store, subscribe, switchBudget, update } from './store.js';
import * as lockView from './ui/lock.js';
import * as accountView from './ui/account.js';
import * as accountsView from './ui/accounts.js';
import { ALL, activeAccounts, viewFor } from './accounts.js';
import * as overview from './ui/overview.js';
import * as plan from './ui/plan.js';
import * as log from './ui/log.js';
import * as subs from './ui/subscriptions.js';
import * as goals from './ui/goals.js';
import * as settings from './ui/settings.js';
import * as importer from './ui/importer.js';
import * as receipt from './ui/receipt.js';
import { backupOverdue } from './ui/settings.js';
import { applyPalette } from './palette.js';

const VIEWS = {
  overview: { module: overview, title: 'Übersicht', icon: '◔', monthly: true },
  plan: { module: plan, title: 'Budget', icon: '☰', monthly: true },
  log: { module: log, title: 'Ausgaben', icon: '＋', monthly: true },
  subs: { module: subs, title: 'Abos', icon: '↻', monthly: false },
  goals: { module: goals, title: 'Sparziele', icon: '◎', monthly: false },
  settings: { module: settings, title: 'Sicherung', icon: '⚙', monthly: false },
  // Nicht in der Navigation - erreichbar ueber Budget und Ausgaben.
  import: { module: importer, title: 'Kontoauszug einlesen', icon: '⇩', monthly: false, hidden: true },
  receipt: { module: receipt, title: 'Kassenbon scannen', icon: '📷', monthly: false, hidden: true },
  accounts: { module: accountsView, title: 'Konten', icon: '🏦', monthly: true, hidden: true },
};

const ui = {
  view: 'overview',
  key: monthKey(),
  pendingFocus: null,
  // Kontofilter: "alle" oder eine Konto-ID. Gilt fuer Uebersicht, Budget und Ausgaben.
  account: ALL,
};

const FILTERED_VIEWS = new Set(['overview', 'plan', 'log']);

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const monthEl = document.getElementById('monthLabel');
const monthBar = document.getElementById('monthBar');
const bannerEl = document.getElementById('banner');
const brandName = document.getElementById('brandName');
const budgetSelect = document.getElementById('budgetSelect');
const lockBtn = document.getElementById('lockBtn');

// Mehrere Budgets: Auswahl im Kopf statt des App-Namens.
function renderBudgetSwitch() {
  const several = store.budgets.length > 1;
  brandName.hidden = several;
  budgetSelect.hidden = !several;
  if (several) {
    budgetSelect.innerHTML = store.budgets.map((b) => `<option value="${b.id}" ${b.id === store.active ? 'selected' : ''}>${b.protected ? '🔒 ' : ''}${b.name.replace(/</g, '&lt;')}</option>`).join('');
  }
  lockBtn.hidden = store.mode === 'vault' ? false : (!isProtected() || store.locked);
}
lockBtn.addEventListener('click', () => lock());
budgetSelect.addEventListener('change', () => { ui.account = ALL; switchBudget(budgetSelect.value); });

function readHash() {
  const [view, key] = location.hash.replace(/^#\/?/, '').split('/');
  if (VIEWS[view]) ui.view = view;
  if (/^\d{4}-\d{2}$/.test(key || '')) ui.key = key;
}

function writeHash() {
  const next = `#/${ui.view}/${ui.key}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function currentAccount() {
  if (ui.account !== ALL && !activeAccounts(store.data).some((a) => a.id === ui.account)) ui.account = ALL;
  return FILTERED_VIEWS.has(ui.view) ? ui.account : ALL;
}

function context() {
  const account = currentAccount();
  const data = viewFor(store.data, account);
  return {
    data,
    raw: store.data,
    account,
    key: ui.key,
    summary: monthSummary(data, ui.key),
    focus(selector) { ui.pendingFocus = selector; scheduleRender(); },
    show(view, key) { ui.view = view; if (key) ui.key = key; scheduleRender(); window.scrollTo({ top: 0 }); },
    rerender: scheduleRender,
  };
}

// Fokus ueber das Neuzeichnen hinweg behalten. Wer mit Tab von Feld zu Feld
// springt, loest "change" aus, bevor der Fokus ins naechste Feld wandert.
// Deshalb wird erst im naechsten Frame gezeichnet - dann steht der Fokus
// schon im Zielfeld und laesst sich dort wiederherstellen.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function activeSelector() {
  const el = document.activeElement;
  if (!el || !viewEl.contains(el)) return null;
  if (el.dataset.action && el.dataset.key) return `[data-action="${el.dataset.action}"][data-key="${CSS.escape(el.dataset.key)}"]`;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name && el.form?.dataset.action) return `form[data-action="${el.form.dataset.action}"] [name="${el.name}"]`;
  return null;
}

function noticeBar() {
  if (!store.cloud.notice) return '';
  return `<div class="banner notice" role="status"><span>${store.cloud.notice.replace(/</g, '&lt;')}</span>
    <button type="button" class="btn" data-action="dismiss-notice">OK</button></div>`;
}

function render() {
  if (store.mode === 'signedout') {
    renderBudgetSwitch();
    budgetSelect.hidden = true;
    brandName.hidden = false;
    lockBtn.hidden = true;
    monthBar.hidden = true;
    bannerEl.hidden = true;
    document.title = 'Anmelden · Budgetplaner';
    navEl.hidden = true;
    viewEl.innerHTML = accountView.render();
    return;
  }
  if (store.locked) {
    renderBudgetSwitch();
    monthBar.hidden = true;
    bannerEl.hidden = true;
    document.title = `Gesperrt · ${activeBudget().name}`;
    viewEl.innerHTML = lockView.render();
    viewEl.querySelector('input[type=password]')?.focus();
    return;
  }
  if (!store.data.months[ui.key]) {
    // Fehlender Monat wird angelegt; update() ruft render() erneut auf.
    update((data) => ensureMonth(data, ui.key));
    return;
  }
  navEl.hidden = false;
  const selector = ui.pendingFocus || activeSelector();
  ui.pendingFocus = null;
  const view = VIEWS[ui.view];

  renderBudgetSwitch();
  monthEl.textContent = monthLabel(ui.key);
  monthBar.hidden = !view.monthly;
  document.title = `${view.title} · ${store.budgets.length > 1 ? activeBudget().name : 'Budgetplaner'}`;
  navEl.querySelectorAll('[data-view]').forEach((btn) => {
    btn.setAttribute('aria-current', btn.dataset.view === ui.view ? 'page' : 'false');
  });
  bannerEl.hidden = !backupOverdue() || ui.view === 'settings';

  viewEl.innerHTML = noticeBar() + accountFilter() + view.module.render(context());
  writeHash();

  if (selector) {
    const target = viewEl.querySelector(selector);
    if (target) {
      target.focus({ preventScroll: true });
      if (target.select && target.type === 'text') target.select();
    }
  }
}

// Kontofilter ueber den Monatsansichten, sobald es Konten gibt.
function accountFilter() {
  const accounts = activeAccounts(store.data);
  if (!accounts.length || !FILTERED_VIEWS.has(ui.view)) return '';
  const current = currentAccount();
  const option = (id, name) => `<option value="${id}" ${id === current ? 'selected' : ''}>${name.replace(/</g, '&lt;')}</option>`;
  return `<div class="account-filter">
    <label>Konto <select data-action="account-filter" aria-label="Konto auswählen">${option(ALL, 'Alle Konten')}${accounts.map((a) => option(a.id, a.name)).join('')}</select></label>
    <button type="button" class="btn ghost" data-action="goto" data-view="accounts">Kontostände</button>
  </div>`;
}

function goto(view) {
  ui.view = view;
  render();
  window.scrollTo({ top: 0 });
}

// --- Navigation ----------------------------------------------------------

navEl.innerHTML = Object.entries(VIEWS).filter(([, v]) => !v.hidden).map(([id, v]) => `
  <button type="button" data-view="${id}"><span class="nav-icon" aria-hidden="true">${v.icon}</span><span>${v.title}</span></button>`).join('');
navEl.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-view]');
  if (btn) goto(btn.dataset.view);
});

document.getElementById('prevMonth').addEventListener('click', () => { ui.key = addMonths(ui.key, -1); render(); });
document.getElementById('nextMonth').addEventListener('click', () => { ui.key = addMonths(ui.key, 1); render(); });
monthEl.addEventListener('click', () => { ui.key = monthKey(); render(); });
document.getElementById('bannerBtn').addEventListener('click', () => goto('settings'));

// --- Aktionen der Ansichten ------------------------------------------------

function dispatch(el, event) {
  if (el.dataset.action === 'dismiss-notice') { dismissNotice(); return; }
  if (store.mode === 'signedout') {
    accountView.actions[el.dataset.action]?.(el, event, { rerender: scheduleRender });
    return;
  }
  if (store.locked) {
    // Gesperrt gibt es keine Daten, also auch keinen Monat zum Berechnen.
    lockView.actions[el.dataset.action]?.(el, event);
    return;
  }
  if (el.dataset.action === 'account-filter') {
    ui.account = el.value;
    render();
    return;
  }
  const handler = VIEWS[ui.view].module.actions[el.dataset.action];
  if (handler) handler(el, event, context());
}

viewEl.addEventListener('click', (event) => {
  const el = event.target.closest('button[data-action]');
  if (!el) return;
  if (el.dataset.action === 'goto') goto(el.dataset.view);
  else dispatch(el, event);
});

viewEl.addEventListener('change', (event) => {
  const el = event.target;
  if (el.matches('input[data-action], select[data-action]')) dispatch(el, event);
});

viewEl.addEventListener('submit', (event) => {
  // Kein Formular der App wird je an eine Adresse geschickt - sonst landen
  // Eingaben (etwa ein Passwort) in der Adresszeile.
  event.preventDefault();
  const form = event.target.closest('form[data-action]');
  if (form) dispatch(form, event);
});

// Enter in einem Tabellenfeld uebernimmt den Wert wie in einer Tabelle.
viewEl.addEventListener('keydown', (event) => {
  const el = event.target;
  if (event.key === 'Enter' && el.matches('input[data-action]:not([type=checkbox])')) {
    event.preventDefault();
    el.blur();
  }
});

window.addEventListener('hashchange', () => { readHash(); render(); });

applyPalette();
subscribe(scheduleRender);
load();
readHash();
render();
