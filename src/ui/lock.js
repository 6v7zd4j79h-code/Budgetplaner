// Sperrseite fuer ein Konto mit Passwort.

import { activeBudget, unlock } from '../store.js';
import { esc } from './dom.js';

export function render() {
  const { name } = activeBudget();
  return `
  <article class="card lock-card">
    <div class="lock-icon" aria-hidden="true">🔒</div>
    <h2>${esc(name)} ist geschützt</h2>
    <p class="muted">Gib das Passwort ein, um dieses Budget zu öffnen.</p>
    <form class="entry-form" data-action="unlock" autocomplete="off">
      <label>Passwort<input type="password" name="password" required autocomplete="current-password" autofocus></label>
      <button type="submit" class="btn primary">Öffnen</button>
      <p class="form-error" id="unlockError" role="alert" hidden>Das Passwort stimmt nicht.</p>
    </form>
  </article>`;
}

export const actions = {
  async unlock(form, event) {
    event.preventDefault();
    const field = form.elements.password;
    const button = form.querySelector('button');
    button.disabled = true;
    const ok = await unlock(field.value);
    if (!ok) {
      button.disabled = false;
      field.value = '';
      field.focus();
      document.getElementById('unlockError').hidden = false;
    }
  },
};
