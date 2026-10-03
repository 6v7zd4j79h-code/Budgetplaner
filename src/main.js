import './styles.css';
import { ensureMonth, monthSummary } from './budget.js';
import { addMonths, monthKey, monthLabel } from './dates.js';
import { load, store, subscribe, update } from './store.js';
import * as overview from './ui/overview.js';
import * as plan from './ui/plan.js';
import * as log from './ui/log.js';
import * as subs from './ui/subscriptions.js';
import * as goals from './ui/goals.js';
import * as settings from './ui/settings.js';
import { backupOverdue } from './ui/settings.js';

const VIEWS = {
  overview: { module: overview, title: 'Übersicht', icon: '◔', monthly: true },
  plan: { module: plan, title: 'Budget', icon: '☰', monthly: true },
  log: { module: log, title: 'Ausgaben', icon: '＋', monthly: true },
  subs: { module: subs, title: 'Abos', icon: '↻', monthly: false },
  goals: { module: goals, title: 'Sparziele', icon: '◎', monthly: false },
  settings: { module: settings, title: 'Sicherung', icon: '⚙', monthly: false },
};

const ui = {
  view: 'overview',
  key: monthKey(),
  pendingFocus: null,
};

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const monthEl = document.getElementById('monthLabel');
const monthBar = document.getElementById('monthBar');
const bannerEl = document.getElementById('banner');

function readHash() {
  const [view, key] = location.hash.replace(/^#\/?/, '').split('/');
  if (VIEWS[view]) ui.view = view;
  if (/^\d{4}-\d{2}$/.test(key || '')) ui.key = key;
}

function writeHash() {
  const next = `#/${ui.view}/${ui.key}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

function context() {
  return {
    data: store.data,
    key: ui.key,
    summary: monthSummary(store.data, ui.key),
    focus(selector) { ui.pendingFocus = selector; scheduleRender(); },
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

function render() {
  if (!store.data.months[ui.key]) {
    // Fehlender Monat wird angelegt; update() ruft render() erneut auf.
    update((data) => ensureMonth(data, ui.key));
    return;
  }
  const selector = ui.pendingFocus || activeSelector();
  ui.pendingFocus = null;
  const view = VIEWS[ui.view];

  monthEl.textContent = monthLabel(ui.key);
  monthBar.hidden = !view.monthly;
  document.title = `${view.title} · Budgetplaner`;
  navEl.querySelectorAll('[data-view]').forEach((btn) => {
    btn.setAttribute('aria-current', btn.dataset.view === ui.view ? 'page' : 'false');
  });
  bannerEl.hidden = !backupOverdue() || ui.view === 'settings';

  viewEl.innerHTML = view.module.render(context());
  writeHash();

  if (selector) {
    const target = viewEl.querySelector(selector);
    if (target) {
      target.focus({ preventScroll: true });
      if (target.select && target.type === 'text') target.select();
    }
  }
}

function goto(view) {
  ui.view = view;
  render();
  window.scrollTo({ top: 0 });
}

// --- Navigation ----------------------------------------------------------

navEl.innerHTML = Object.entries(VIEWS).map(([id, v]) => `
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

subscribe(scheduleRender);
load();
readHash();
render();
