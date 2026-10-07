// Abgleich zwischen Geraeten ueber die eigene Netlify-Funktion
// (netlify/functions/vault.mjs, Logik in server/vault-core.js) -
// Ende-zu-Ende-verschluesselt.
//
// Pro Person gibt es einen privaten Tresor mit allen Budgets, im Browser
// verschluesselt (siehe crypto.js). Aus dem Passwort entstehen zwei
// getrennte Werte:
//   - ein Login-Wert fuer den Server (deriveLoginSecret)
//   - der Datenschluessel (deriveKey mit dem Salt des Tresors)
// Der Server kennt also weder Passwort noch Schluessel.
//
// Gemeinsame Budgets (z. B. Gemeinschaftskonto) liegen in einem eigenen
// Bereich mit eigenem Schluessel; den Schluessel tragen alle Mitglieder in
// ihrem privaten Tresor.
//
// Mit VITE_ABGLEICH=aus beim Build laeuft die App wie frueher nur auf dem Geraet.

import { deriveKey, deriveLoginSecret, newSalt, seal, unseal } from './crypto.js';

const ENDPOINT = '/.netlify/functions/vault';

const inBrowser = typeof window !== 'undefined' && typeof fetch === 'function';
export let cloudConfigured = inBrowser && import.meta.env?.VITE_ABGLEICH !== 'aus';

// Wie Anfragen den Server erreichen. Tests setzen hier einen Server im Speicher ein.
let send = async (body) => {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('Keine Verbindung zum Server.');
  }
  let json = {};
  try { json = await response.json(); } catch { /* leer */ }
  return { status: response.status, body: json };
};

export function useServerForTests(handler) {
  send = handler;
  cloudConfigured = Boolean(handler);
}

// Angemeldet = E-Mail und Login-Wert im Arbeitsspeicher. Jede Anfrage
// weist sich damit aus; Sitzungen auf dem Server gibt es nicht.
let auth = null;

async function call(action, payload = {}, { anonymous = false } = {}) {
  if (!anonymous && !auth) throw new Error('Nicht angemeldet.');
  const { status, body } = await send({ action, ...(anonymous ? {} : auth), ...payload });
  if (status === 409 && body.conflict) return { conflict: true };
  if (status >= 400) {
    const error = new Error(body.error || 'Das hat nicht geklappt.');
    error.status = status;
    throw error;
  }
  return body;
}

// --- "Auf diesem Geraet angemeldet bleiben" -----------------------------------
// Der Schluessel ist nicht exportierbar: Er laesst sich zum Ver- und
// Entschluesseln benutzen, aber nicht auslesen. Er liegt in IndexedDB,
// zusammen mit dem Login-Wert fuer den Server.

const DB = 'budgetplaner';
const STORE = 'keys';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function rememberKey(entry) {
  try { await idbDo('readwrite', (s) => s.put({ ...entry, secret: auth?.secret || null }, 'vault')); } catch { /* ohne IndexedDB eben nicht */ }
}

// Gibt den gemerkten Eintrag zurueck und meldet damit beim Server an.
export async function rememberedKey() {
  try {
    const entry = (await idbDo('readonly', (s) => s.get('vault'))) || null;
    if (entry?.email && entry.secret) auth = { email: entry.email, secret: entry.secret };
    return entry;
  } catch {
    return null;
  }
}

export async function forgetKey() {
  try { await idbDo('readwrite', (s) => s.delete('vault')); } catch { /* nichts zu vergessen */ }
}

// --- Anmeldung ----------------------------------------------------------------

function friendly(error) {
  return { error: error.message || 'Das hat nicht geklappt.' };
}

// Ohne Bestaetigungs-Mail: Das Konto ist sofort nutzbar.
export async function signUp(email, password) {
  try {
    const secret = await deriveLoginSecret(password, email);
    await call('signup', { email: email.trim(), secret }, { anonymous: true });
    return { needsConfirmation: false };
  } catch (error) {
    return friendly(error);
  }
}

export async function signIn(email, password) {
  try {
    const candidate = { email: email.trim(), secret: await deriveLoginSecret(password, email) };
    await call('check', candidate, { anonymous: true });
    auth = candidate;
    return {};
  } catch (error) {
    return friendly(error);
  }
}

// Offline entsperrt: Login-Wert trotzdem bereitlegen, damit der Abgleich
// spaeter ohne erneute Eingabe klappt.
export async function resumeLogin(email, password) {
  if (email) auth = { email: email.trim(), secret: await deriveLoginSecret(password, email) };
}

export async function signOut() {
  await forgetKey();
  auth = null;
}

export function currentEmail() {
  return auth?.email || null;
}

// --- Privater Tresor ----------------------------------------------------------

// Liest den Tresor vom Server: { salt, iv, data, rev } oder null.
export async function fetchVault() {
  return (await call('vault-get')).row;
}

// Schluessel fuer den Tresor. Gibt es noch keinen, wird ein neues Salt erzeugt.
export async function vaultKey(password, salt) {
  const useSalt = salt || newSalt();
  return { key: await deriveKey(password, useSalt), salt: useSalt };
}

export async function openVault(key, row) {
  return unseal(key, row);
}

// Speichert den Tresor. rev ist der Stand, auf dem die Aenderung beruht.
// Ergebnis: { rev } bei Erfolg, { conflict: true } wenn ein anderes Geraet
// inzwischen gespeichert hat.
export async function storeVault({ key, salt }, content, rev) {
  const row = await seal(key, salt, content);
  return call('vault-put', { row, rev: rev || 0 });
}

// --- Gemeinsame Budgets -------------------------------------------------------

export async function createSpace(key, book) {
  const { iv, data } = await seal(key, '', book);
  return call('space-create', { row: { iv, data } });
}

export async function fetchSpace(space) {
  return (await call('space-get', { space })).row;
}

export async function storeSpace(space, key, book, rev) {
  const { iv, data } = await seal(key, '', book);
  return call('space-put', { space, row: { iv, data }, rev });
}

export async function leaveSpace(space) {
  return call('space-leave', { space });
}

export async function createInvite(space, codeHash, sealed) {
  return call('invite-create', { space, code: codeHash, sealed });
}

export async function acceptInvite(codeHash) {
  return call('invite-accept', { code: codeHash });
}

export { seal, unseal };
