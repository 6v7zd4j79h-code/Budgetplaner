// Anmeldung fuer den Abgleich zwischen Geraeten.

import { cachedEmail, cloudSignIn, cloudSignUp, cloudUnlock, useLocalOnly } from '../store.js';
import { esc } from './dom.js';

let tab = 'signin'; // 'signin' | 'signup'
let message = null;
let lastEmail = '';

const WARNING = `<p class="hint account-warning"><strong>Wichtig:</strong> Dein Passwort verschlüsselt deine Daten. Niemand kann es
  zurücksetzen – wer es vergisst, kommt nicht mehr an die Daten. Am besten im Passwort-Manager speichern.</p>`;

function remember() {
  return `<label class="remember-toggle"><input type="checkbox" name="remember" checked><span>Auf diesem Gerät angemeldet bleiben</span></label>`;
}

export function render() {
  const known = cachedEmail();
  const info = message ? `<p class="${message.ok ? 'notice-ok' : 'form-error'}" role="alert">${esc(message.text)}</p>` : '';

  if (known && tab !== 'switch') {
    return `
    <article class="card lock-card">
      <div class="lock-icon" aria-hidden="true">🔒</div>
      <h2>Willkommen zurück</h2>
      <p class="muted">${esc(known)}</p>
      <form class="entry-form" data-action="unlock-vault" autocomplete="on">
        <input type="email" name="email" value="${esc(known)}" autocomplete="username" hidden>
        <label>Passwort<input type="password" name="password" required autocomplete="current-password" autofocus></label>
        ${remember()}
        <button type="submit" class="btn primary">Öffnen</button>
        ${info}
      </form>
      <p class="hint"><button type="button" class="link-btn" data-action="account-tab" data-key="switch">Mit anderem Konto anmelden</button></p>
    </article>`;
  }

  const signup = tab === 'signup';
  return `
  <article class="card lock-card account-card">
    <h2>${signup ? 'Konto erstellen' : 'Anmelden'}</h2>
    <p class="muted">Mit Konto sind deine Budgets auf Handy und PC gleich – verschlüsselt, nur du kannst sie lesen.</p>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab" data-action="account-tab" data-key="signin" aria-selected="${!signup}">Anmelden</button>
      <button type="button" role="tab" class="tab" data-action="account-tab" data-key="signup" aria-selected="${signup}">Konto erstellen</button>
    </div>
    <form class="entry-form" data-action="${signup ? 'sign-up' : 'sign-in'}" autocomplete="on">
      <label>E-Mail<input type="email" name="email" required autocomplete="username" value="${esc(lastEmail)}"></label>
      <label>Passwort<input type="password" name="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
      ${signup ? '<label>Passwort wiederholen<input type="password" name="repeat" required autocomplete="new-password"></label>' : remember()}
      <button type="submit" class="btn primary">${signup ? 'Konto erstellen' : 'Anmelden'}</button>
      ${info}
    </form>
    ${WARNING}
    <p class="hint"><button type="button" class="link-btn" data-action="local-only">Ohne Konto nutzen – nur auf diesem Gerät</button></p>
  </article>`;
}

async function busy(form, work) {
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Einen Moment …';
  message = null;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export const actions = {
  'account-tab'(el, _event, ctx) {
    tab = el.dataset.key;
    message = null;
    ctx.rerender();
  },
  'local-only'() {
    useLocalOnly();
  },
  async 'sign-in'(form, event, ctx) {
    event.preventDefault();
    const f = form.elements;
    lastEmail = f.email.value;
    const result = await busy(form, () => cloudSignIn(f.email.value, f.password.value, f.remember.checked));
    if (result.error) { message = { text: result.error }; f.password.value = ''; ctx.rerender(); return; }
    tab = 'signin';
  },
  async 'sign-up'(form, event, ctx) {
    event.preventDefault();
    const f = form.elements;
    lastEmail = f.email.value;
    if (f.password.value !== f.repeat.value) { message = { text: 'Die beiden Passwörter sind nicht gleich.' }; ctx.rerender(); return; }
    const result = await busy(form, () => cloudSignUp(f.email.value, f.password.value));
    if (result.error) { message = { text: result.error }; ctx.rerender(); return; }
    if (result.needsConfirmation) {
      tab = 'signin';
      message = { ok: true, text: 'Fast geschafft: Bitte bestätige deine E-Mail über den Link, den du gleich bekommst. Danach hier anmelden.' };
      ctx.rerender();
      return;
    }
    const login = await cloudSignIn(f.email.value, f.password.value, true);
    if (login.error) { message = { text: login.error }; ctx.rerender(); }
  },
  // Gerät kennt den Tresor: online anmelden (holt den neuesten Stand),
  // ohne Verbindung mit der Kopie auf dem Geraet oeffnen.
  async 'unlock-vault'(form, event, ctx) {
    event.preventDefault();
    const f = form.elements;
    const result = await busy(form, async () => {
      if (navigator.onLine) {
        const online = await cloudSignIn(f.email.value, f.password.value, f.remember.checked);
        if (!online.error || !/Verbindung/.test(online.error)) return online;
      }
      return cloudUnlock(f.password.value, f.remember.checked);
    });
    if (result.error) { message = { text: result.error }; f.password.value = ''; ctx.rerender(); }
  },
};
