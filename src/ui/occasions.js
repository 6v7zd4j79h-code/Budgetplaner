// Anlaesse verwalten: Geburtstage, Ferien/Zeitraeume und Feiertage, vor denen
// rechtzeitig (und gern im Angebot) eingekauft werden soll.

import { newId } from '../budget.js';
import { formatDay, todayISO } from '../dates.js';
import { HOLIDAYS, nextHoliday, upcomingOccasions } from '../occasions.js';
import { update } from '../store.js';
import { esc } from './dom.js';

const LEADS = [1, 2, 3, 4, 6, 8];
const ICONS = { birthday: '🎂', holiday: '🎄', period: '🏠' };

function leadOptions(selectedDays) {
  return LEADS.map((w) => `<option value="${w * 7}" ${w * 7 === selectedDays ? 'selected' : ''}>${w} ${w === 1 ? 'Woche' : 'Wochen'} vorher</option>`).join('');
}

function when(o) {
  if (o.running) return `läuft bis ${formatDay(o.until)}`;
  if (o.daysLeft === 0) return 'heute';
  if (o.daysLeft === 1) return 'morgen';
  if (o.daysLeft < 14) return `in ${o.daysLeft} Tagen`;
  return `in ${Math.round(o.daysLeft / 7)} Wochen`;
}

function row(o) {
  const icon = o.kind === 'holiday' && o.id === 'ostern' ? '🐣' : ICONS[o.kind];
  return `<li class="occasion${o.soon ? ' is-soon' : ''}">
    <span class="occasion-icon" aria-hidden="true">${icon}</span>
    <span class="occasion-text"><span><strong>${esc(o.name)}</strong> <span class="muted">· ${formatDay(o.date)} · ${when(o)}</span></span>
      ${o.note ? `<span class="occasion-note">${esc(o.note)}</span>` : ''}</span>
  </li>`;
}

// Kurzer Hinweis fuer Uebersicht und Einkaufsseite: was jetzt im Vorlauf ist.
export function soonCard(data) {
  const soon = upcomingOccasions(data).filter((o) => o.soon);
  if (!soon.length) return '';
  return `<article class="card occasions-card">
    <header class="section-head"><h2>Bald steht an</h2>
      <button type="button" class="btn ghost" data-action="goto" data-view="occasions">Anlässe</button></header>
    <p class="muted">Haltbares schon kaufen, wenn es im Angebot ist.</p>
    <ul class="occasion-list">${soon.map(row).join('')}</ul>
  </article>`;
}

export function render({ data }) {
  const today = todayISO();
  const upcoming = upcomingOccasions(data, { today, horizon: 366 });
  const own = data.occasions || [];
  const off = new Set(data.holidaysOff || []);

  const ownRows = own.map((o) => `
    <li class="occasion-edit">
      <span class="occasion-icon" aria-hidden="true">${ICONS[o.kind]}</span>
      <span class="occasion-text"><span><strong>${esc(o.name)}</strong>
        <span class="muted">· ${o.kind === 'birthday' ? `jedes Jahr am ${o.day.slice(3)}.${o.day.slice(0, 2)}.` : `${formatDay(o.from)} – ${formatDay(o.to)}`}</span></span>
        <input type="text" data-action="occasion-note" data-key="${esc(o.id)}" value="${esc(o.note || '')}" placeholder="Was wird gebraucht?" aria-label="Notiz zu ${esc(o.name)}">
        <select data-action="occasion-lead" data-key="${esc(o.id)}" aria-label="Vorlauf">${leadOptions(o.lead)}</select></span>
      <button type="button" class="del" data-action="occasion-del" data-key="${esc(o.id)}" aria-label="${esc(o.name)} löschen" title="Löschen">×</button>
    </li>`).join('');

  return `
  <article class="card">
    <h2>Anlässe</h2>
    <p class="muted">Geburtstage, Feiertage und Ferien, vor denen mehr eingekauft wird. Ab dem Vorlauf erinnert die App
      in der Übersicht daran – damit Haltbares schon im Angebot gekauft werden kann.</p>
    ${upcoming.length ? `<ul class="occasion-list">${upcoming.map(row).join('')}</ul>` : '<p class="empty">Noch nichts eingetragen.</p>'}
  </article>

  <section class="grid">
    <article class="card">
      <h2>Geburtstag hinzufügen</h2>
      <form class="entry-form occasion-form" data-action="occasion-add" data-key="birthday">
        <label>Wer?<input type="text" name="name" placeholder="z. B. Mama" required autocomplete="off"></label>
        <label>Datum<input type="date" name="day" required></label>
        <label>Erinnern<select name="lead">${leadOptions(21)}</select></label>
        <label>Was wird gebraucht?<input type="text" name="note" placeholder="z. B. Kuchenzutaten, Deko" autocomplete="off"></label>
        <button type="submit" class="btn primary">Hinzufügen</button>
        <p class="form-error" role="alert" hidden></p>
      </form>
    </article>

    <article class="card">
      <h2>Ferien oder Zeitraum</h2>
      <form class="entry-form occasion-form" data-action="occasion-add" data-key="period">
        <label>Was?<input type="text" name="name" placeholder="z. B. Herbstferien" required autocomplete="off"></label>
        <label>Von<input type="date" name="from" required></label>
        <label>Bis<input type="date" name="to" required></label>
        <label>Erinnern<select name="lead">${leadOptions(7)}</select></label>
        <label>Was wird gebraucht?<input type="text" name="note" placeholder="z. B. Kinder mittags zu Hause – mehr fürs Mittagessen" autocomplete="off"></label>
        <button type="submit" class="btn primary">Hinzufügen</button>
        <p class="form-error" role="alert" hidden></p>
      </form>
    </article>
  </section>

  ${own.length ? `<article class="card">
    <h2>Eingetragen</h2>
    <ul class="occasion-list">${ownRows}</ul>
  </article>` : ''}

  <article class="card">
    <h2>Feiertage</h2>
    <p class="hint">Haken entfernen, wenn ihr einen Feiertag nicht braucht.</p>
    <ul class="occasion-list">${HOLIDAYS.map((h) => `<li class="occasion-edit">
      <input type="checkbox" class="check" data-action="holiday-toggle" data-key="${h.id}" ${off.has(h.id) ? '' : 'checked'} aria-label="${esc(h.name)} beachten">
      <span class="occasion-text"><span><strong>${esc(h.name)}</strong> <span class="muted">· ${formatDay(nextHoliday(h, today))} · ${h.lead / 7} Wochen vorher</span></span>
        <span class="occasion-note">${esc(h.note)}</span></span>
    </li>`).join('')}</ul>
  </article>`;
}

function edit(id, change) {
  update((data) => {
    const o = (data.occasions || []).find((x) => x.id === id);
    if (o) change(o);
  });
}

export const actions = {
  'occasion-add'(form, event, ctx) {
    event.preventDefault();
    const fields = new FormData(form);
    const kind = form.dataset.key;
    const name = String(fields.get('name') || '').trim();
    const occasion = { id: newId(), kind, name, lead: Number(fields.get('lead')) || 21, note: String(fields.get('note') || '').trim() };
    let problem = name ? '' : 'Bitte einen Namen eintragen.';
    if (kind === 'birthday') {
      const day = String(fields.get('day') || '');
      if (!problem && !day) problem = 'Bitte das Datum eintragen.';
      occasion.day = day.slice(5);
    } else {
      occasion.from = String(fields.get('from') || '');
      occasion.to = String(fields.get('to') || '');
      if (!problem && (!occasion.from || !occasion.to)) problem = 'Bitte Anfang und Ende eintragen.';
      if (!problem && occasion.to < occasion.from) problem = 'Das Ende liegt vor dem Anfang.';
    }
    if (problem) {
      const error = form.querySelector('.form-error');
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    update((data) => {
      data.occasions = data.occasions || [];
      data.occasions.push(occasion);
    });
    ctx.focus(`.occasion-form[data-key="${kind}"] input[name="name"]`);
  },
  'occasion-note'(el) { edit(el.dataset.key, (o) => { o.note = el.value.trim(); }); },
  'occasion-lead'(el) { edit(el.dataset.key, (o) => { o.lead = Number(el.value); }); },
  'occasion-del'(el, _event, { data: current }) {
    const o = (current.occasions || []).find((x) => x.id === el.dataset.key);
    if (!o || !window.confirm(`„${o.name}" löschen?`)) return;
    update((data) => {
      data.occasions = (data.occasions || []).filter((x) => x.id !== el.dataset.key);
    });
  },
  'holiday-toggle'(el) {
    update((data) => {
      const off = new Set(data.holidaysOff || []);
      if (el.checked) off.delete(el.dataset.key);
      else off.add(el.dataset.key);
      data.holidaysOff = [...off];
    });
  },
};
