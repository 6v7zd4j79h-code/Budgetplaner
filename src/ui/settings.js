// Einstellungen: Sicherung, Wiederherstellung, alles loeschen.
//
// Die Daten liegen nur auf diesem Geraet. Die Sicherungsdatei ist deshalb
// der einzige Schutz gegen verlorene Daten - die Ansicht erinnert daran,
// wenn die letzte Sicherung lange her ist.

import {
  activeBudget, canShare, cloudAvailable, cloudSignOut, createBudget, deleteBudget, exportJson, importJson, inviteToBudget,
  isProtected, joinBudget, lastBackupAt, lock, pull, removePassword, renameBudget, resetAll, setPassword, shareBudget,
  showSignIn, store, switchBudget,
} from '../store.js';
import { todayISO, formatDay } from '../dates.js';
import { esc } from './dom.js';
import { PALETTES, currentPalette, setPalette } from '../palette.js';

const REMIND_AFTER_DAYS = 30;

export function backupOverdue() {
  if (store.locked) return false;
  const { months, log, subscriptions, goals } = store.data;
  // Ein frisch angelegter Monat mit lauter Nullen zaehlt nicht als Daten.
  const hasData = log.length > 0 || subscriptions.length > 0 || goals.length > 0
    || Object.values(months).some((m) => Object.values(m.lines).some((lines) => lines.some((l) => l.budget > 0)));
  if (!hasData) return false;
  const last = lastBackupAt();
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) / 86400000 > REMIND_AFTER_DAYS;
}

function passwordCard(current, guarded) {
  return `
  <article class="card">
    <h2>Passwort · ${esc(current.name)}</h2>
    ${guarded
    ? `<p>Dieses Budget ist mit einem Passwort geschützt und wird verschlüsselt gespeichert – auch die Sicherungsdatei.
        Beim Wechsel zu einem anderen Budget und beim Neuladen wird es wieder gesperrt.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="lock">Jetzt sperren</button>
        <button type="button" class="btn" data-action="remove-password">Passwort entfernen</button>
      </div>`
    : '<p>Dieses Budget ist nicht geschützt. Wer die App auf diesem Gerät öffnet, kann es sehen.</p>'}
    <form class="entry-form" data-action="set-password" autocomplete="off" style="margin-top:12px">
      <label>${guarded ? 'Neues Passwort' : 'Passwort festlegen'}<input type="password" name="password" required minlength="4" autocomplete="new-password"></label>
      <label>Passwort wiederholen<input type="password" name="repeat" required autocomplete="new-password"></label>
      <button type="submit" class="btn primary">${guarded ? 'Passwort ändern' : 'Budget schützen'}</button>
      <p class="form-error" id="passwordError" role="alert" hidden></p>
    </form>
    <p class="hint" style="margin:10px 0 0"><strong>Wichtig:</strong> Das Passwort kann niemand zurücksetzen – auch nicht über die
      Sicherungsdatei. Wer es vergisst, kommt an die Daten dieses Budgets nicht mehr heran. Am besten im Passwort-Manager notieren.</p>
  </article>`;
}

function syncTime(iso) {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  return `${formatDay(iso.slice(0, 10))}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

// Konto und Abgleich zwischen Geraeten.
function accountCard() {
  if (!cloudAvailable()) return '';
  if (store.mode !== 'vault') {
    return `<article class="card">
      <h2>Auf allen Geräten</h2>
      <p>Melde dich an, damit deine Budgets auf Handy und PC gleich sind – verschlüsselt, nur du kannst sie lesen.
        Die Budgets auf diesem Gerät werden beim ersten Anmelden übernommen.</p>
      <button type="button" class="btn primary" data-action="show-sign-in">Anmelden oder Konto erstellen</button>
    </article>`;
  }
  const c = store.cloud;
  const status = c.error
    ? `<p class="warn">Abgleich gerade nicht möglich: ${esc(c.error)}${c.pending ? ' Deine Änderungen sind auf diesem Gerät gespeichert und werden nachgeholt.' : ''}</p>`
    : `<p class="muted">${c.pending ? 'Änderungen werden hochgeladen …' : `Abgeglichen: ${esc(syncTime(c.lastSync))}`}</p>`;
  return `<article class="card">
    <h2>Konto &amp; Abgleich</h2>
    <p>Angemeldet als <strong>${esc(c.email || '–')}</strong>. Alle Budgets werden verschlüsselt auf deinen Geräten abgeglichen.</p>
    ${status}
    <div class="btn-row">
      <button type="button" class="btn" data-action="sync-now">Jetzt abgleichen</button>
      <button type="button" class="btn" data-action="lock">Sperren</button>
      <button type="button" class="btn" data-action="sign-out">Abmelden</button>
    </div>
    <p class="hint" style="margin:10px 0 0">„Sperren“ fragt beim nächsten Öffnen das Passwort ab. „Abmelden“ entfernt die Daten zusätzlich von diesem Gerät – auf dem Server und deinen anderen Geräten bleiben sie.</p>
  </article>`;
}

// Gemeinsame Budgets: freigeben, Einladungscode erzeugen, mit Code beitreten.
let invite = null;      // { id, code, expires } - nur bis zum Neuladen sichtbar
let shareMessage = null; // { ok, text }

function shareCard(current) {
  if (store.mode !== 'vault') return '';
  const info = shareMessage ? `<p class="${shareMessage.ok ? 'notice-ok' : 'form-error'}" role="alert">${esc(shareMessage.text)}</p>` : '';
  let body;
  if (current.shared) {
    const shown = invite && invite.id === current.id;
    body = `<p>„${esc(current.name)}“ ist <strong>gemeinsam</strong>: Alle Eingeladenen sehen und ändern dieselben Daten. Deine anderen Budgets bleiben privat.</p>
      ${shown ? `<div class="invite-code">
          <p class="muted small">Einladungscode – gilt einmal und bis ${esc(formatDay(invite.expires.slice(0, 10)))}:</p>
          <p class="code" aria-label="Einladungscode">${esc(invite.code)}</p>
          <p class="hint">Die andere Person meldet sich mit ihrem eigenen Konto an und gibt den Code hier unter „Mit Code beitreten“ ein. Den Code am besten mündlich oder per Nachricht weitergeben – wer ihn hat, kommt an dieses Budget.</p>
        </div>` : ''}
      <div class="btn-row"><button type="button" class="btn${shown ? '' : ' primary'}" data-action="share-invite" data-key="${esc(current.id)}">${shown ? 'Neuen Code erzeugen' : 'Jemanden einladen'}</button></div>`;
  } else if (canShare(current.id)) {
    body = `<p>„${esc(current.name)}“ ist privat. Freigeben, z. B. fürs Gemeinschaftskonto: Dann können andere mit eigenem Konto per Einladungscode dazukommen.</p>
      <div class="btn-row"><button type="button" class="btn primary" data-action="share-budget" data-key="${esc(current.id)}">„${esc(current.name)}“ freigeben</button></div>`;
  } else {
    body = `<p class="muted">„${esc(current.name)}“ bleibt immer privat. Für ein gemeinsames Budget oben ein eigenes Budget anlegen oder auswählen und dann freigeben.</p>`;
  }
  return `<article class="card">
    <h2>Gemeinsam nutzen</h2>
    ${body}
    <p class="hint share-join-label">Von jemandem eingeladen? Code hier eingeben:</p>
    <form class="budget-add" data-action="share-join" autocomplete="off">
      <input type="text" name="code" placeholder="Einladungscode" aria-label="Einladungscode" autocapitalize="characters" spellcheck="false" required>
      <button type="submit" class="btn">Mit Code beitreten</button>
    </form>
    ${info}
  </article>`;
}

export function render() {
  const last = lastBackupAt();
  const active = currentPalette();
  const current = activeBudget();
  const guarded = isProtected();
  return `
  ${accountCard()}
  ${store.mode === 'vault' ? '' : passwordCard(current, guarded)}

  <article class="card">
    <h2>Budgets</h2>
    <p class="hint">Getrennte Budgets, z. B. für dein Konto und das Gemeinschaftskonto. Jedes hat eigene Monate, Ausgaben, Abos und Sparziele. Umschalten oben im Kopf.</p>
    <ul class="budget-list">${store.budgets.map((b) => `
      <li class="budget-row${b.id === store.active ? ' active' : ''}">
        <span class="budget-name"><input type="text" data-action="budget-rename" data-key="${esc(b.id)}" value="${esc(b.name)}" aria-label="Name des Budgets">${b.shared ? '<span class="shared-mark" title="gemeinsam" aria-label="gemeinsam">👥</span>' : ''}</span>
        ${b.id === store.active ? '<span class="pill">aktiv</span>' : `<button type="button" class="btn" data-action="budget-switch" data-key="${esc(b.id)}">Öffnen</button>`}
        ${b.id === 'privat' ? '<span></span>' : `<button type="button" class="del" data-action="budget-delete" data-key="${esc(b.id)}" aria-label="${esc(b.name)} löschen" title="Budget löschen">×</button>`}
      </li>`).join('')}</ul>
    <form class="budget-add" data-action="budget-add">
      <input type="text" name="name" placeholder="z. B. Gemeinsam" aria-label="Name des neuen Budgets" required autocomplete="off">
      <button type="submit" class="btn">+ Neues Budget</button>
    </form>
  </article>

  ${shareCard(current)}

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
    ${store.mode === 'vault'
    ? `<p>Deine Budgets liegen verschlüsselt auf deinen Geräten und auf dem Server. Eine Sicherungsdatei ist trotzdem
      gut für den Notfall. Sie ist mit deinem Passwort verschlüsselt und lässt sich nur in deinem Konto wiederherstellen.</p>`
    : `<p>Alle Daten liegen <strong>nur auf diesem Gerät</strong>. Nichts wird ins Internet geschickt.
      Damit nichts verloren geht, wenn das Gerät kaputtgeht oder die Browserdaten gelöscht werden,
      speichere ab und zu eine Sicherungsdatei – z. B. in iCloud, Google Drive oder per Mail an dich selbst.</p>`}
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
    if (budget.shared) {
      if (!window.confirm(`Gemeinsames Budget „${budget.name}“ verlassen? Es verschwindet bei dir; die anderen behalten es. Bist du die letzte Person, wird es gelöscht.`)) return;
      deleteBudget(budget.id);
      return;
    }
    if (!window.confirm(`Budget „${budget.name}“ mit allen Daten löschen?`)) return;
    if (!window.confirm('Ganz sicher? Ohne Sicherungsdatei ist das endgültig.')) return;
    deleteBudget(budget.id);
  },
  async 'share-budget'(el, _event, ctx) {
    el.disabled = true;
    const result = await shareBudget(el.dataset.key);
    shareMessage = result.error ? { text: result.error } : { ok: true, text: 'Freigegeben. Jetzt kannst du jemanden einladen.' };
    ctx.rerender();
  },
  async 'share-invite'(el, _event, ctx) {
    el.disabled = true;
    const result = await inviteToBudget(el.dataset.key);
    if (result.error) shareMessage = { text: result.error };
    else { invite = { id: el.dataset.key, ...result }; shareMessage = null; }
    ctx.rerender();
  },
  async 'share-join'(form, event, ctx) {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    const result = await joinBudget(form.elements.code.value);
    shareMessage = result.error ? { text: result.error } : { ok: true, text: `Beigetreten: „${activeBudget().name}“ ist jetzt auch bei dir.` };
    ctx.rerender();
  },
  palette(el, _event, ctx) {
    setPalette(el.dataset.key);
    ctx.rerender();
  },
  async export(_el, _event, ctx) {
    const blob = new Blob([await exportJson()], { type: 'application/json' });
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
    const problem = await importJson(await file.text());
    if (problem) {
      const error = document.getElementById('importError');
      error.textContent = problem;
      error.hidden = false;
    } else {
      window.alert('Sicherung wiederhergestellt.');
    }
  },
  async 'set-password'(form, event) {
    event.preventDefault();
    const { password, repeat } = form.elements;
    const error = document.getElementById('passwordError');
    if (password.value !== repeat.value) {
      error.textContent = 'Die beiden Passwörter sind nicht gleich.';
      error.hidden = false;
      return;
    }
    form.querySelector('button').disabled = true;
    await setPassword(password.value);
    window.alert('Passwort gespeichert. Das Budget ist jetzt geschützt.');
  },
  async 'remove-password'() {
    if (!window.confirm('Passwortschutz entfernen? Die Daten werden dann unverschlüsselt gespeichert.')) return;
    await removePassword();
  },
  lock() {
    lock();
  },
  'show-sign-in'() {
    showSignIn();
  },
  async 'sync-now'(_el, _event, ctx) {
    await pull();
    ctx.rerender();
  },
  async 'sign-out'() {
    if (!window.confirm('Abmelden und die Daten von diesem Gerät entfernen? Auf deinen anderen Geräten und auf dem Server bleiben sie.')) return;
    await cloudSignOut();
  },
  reset() {
    if (!window.confirm('Wirklich alle Daten auf diesem Gerät löschen?')) return;
    if (!window.confirm('Ganz sicher? Das lässt sich ohne Sicherungsdatei nicht rückgängig machen.')) return;
    resetAll();
  },
};
