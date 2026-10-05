// Speicher. Zwei Betriebsarten:
//
// - "local": alles liegt im localStorage dieses Geraets (wie bisher). Fuer
//   Gerätewechsel gibt es die Sicherungsdatei.
// - "vault": Abgleich zwischen Geraeten ueber Supabase (siehe cloud.js).
//   Alle Budgets liegen zusammen in einem verschluesselten Tresor - auf dem
//   Geraet und auf dem Server. Entschluesselt existieren sie nur im
//   Arbeitsspeicher.
//
// Solange bei eingerichtetem Abgleich niemand angemeldet ist, steht die App
// auf "signedout" und zeigt die Anmeldung.

import { emptyData, validateData } from './budget.js';
import { deriveKey, newSalt, seal, unseal } from './crypto.js';
import * as cloud from './cloud.js';

// Passwortschutz im lokalen Modus: Ein geschuetztes Budget (protected: true)
// liegt im Speicher nur verschluesselt als { sealed: { salt, iv, data } }.
const keys = new Map(); // Budget-ID -> { key, salt }

function isSealed(parsed) {
  const s = parsed && parsed.sealed;
  return Boolean(s && [s.salt, s.iv, s.data].every((v) => typeof v === 'string' && v));
}

// Mehrere getrennte Budgets. Das erste heisst intern "privat" und nutzt die
// urspruenglichen Schluessel, damit vorhandene Daten ohne Umzug erhalten bleiben.
const MAIN_ID = 'privat';
const STORAGE_BUDGETS = 'budgetplaner.budgets';
const STORAGE_VAULT = 'budgetplaner.vault';
const STORAGE_LOCAL_ONLY = 'budgetplaner.localOnly';
const dataKey = (id) => (id === MAIN_ID ? 'budgetplaner.data' : `budgetplaner.data.${id}`);
const backupKey = (id) => (id === MAIN_ID ? 'budgetplaner.lastBackup' : `budgetplaner.lastBackup.${id}`);

const listeners = new Set();

// Neutrale Vorgabe: Die Seite ist oeffentlich, Namen legt jede Person selbst fest.
const defaultBudgets = () => [{ id: MAIN_ID, name: 'Mein Budget' }];

export const store = {
  data: emptyData(),
  saveFailed: false,
  locked: false,
  mode: 'local',
  budgets: defaultBudgets(),
  active: MAIN_ID,
  // Zustand des Abgleichs fuer die Anzeige.
  cloud: { email: null, lastSync: null, pending: false, error: null, notice: null, busy: false },
};

// --- Tresor (Betriebsart "vault") ----------------------------------------------

let vault = null;     // { budgets, active, books: { id: data } }
let vaultKey = null;  // { key, salt }
let vaultRev = 0;     // Stand auf dem Server, auf dem der Tresor beruht

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_VAULT) || 'null');
    return raw && raw.salt && raw.iv && raw.data ? raw : null;
  } catch {
    return null;
  }
}

function useVault(content) {
  vault = {
    budgets: Array.isArray(content.budgets) && content.budgets.length ? content.budgets : defaultBudgets(),
    active: content.active,
    books: content.books || {},
  };
  store.mode = 'vault';
  store.budgets = vault.budgets;
  store.active = vault.budgets.some((b) => b.id === vault.active) ? vault.active : vault.budgets[0].id;
  store.locked = false;
  store.data = vault.books[store.active] || emptyData();
  vault.books[store.active] = store.data;
}

function vaultContent() {
  vault.budgets = store.budgets;
  vault.active = store.active;
  return vault;
}

// Verschluesselt auf dem Geraet ablegen, dann (verzoegert) hochladen.
async function persistVault() {
  if (!vault || !vaultKey) return;
  try {
    const sealed = await seal(vaultKey.key, vaultKey.salt, vaultContent());
    localStorage.setItem(STORAGE_VAULT, JSON.stringify({ ...sealed, rev: vaultRev, email: store.cloud.email }));
    store.saveFailed = false;
  } catch {
    store.saveFailed = true;
  }
  store.cloud.pending = true;
  schedulePush();
}

let pushTimer = null;
function schedulePush(delay = 1200) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, delay);
}

let pushing = null;
async function push() {
  if (!vault || !vaultKey || !cloud.cloudConfigured) return;
  if (pushing) { schedulePush(); return; }
  pushing = (async () => {
    try {
      const result = await cloud.storeVault(vaultKey, vaultContent(), vaultRev);
      if (result.conflict) {
        await pull({ force: true });
        store.cloud.notice = 'Auf einem anderen Gerät wurde inzwischen etwas geändert. Der neueste Stand ist geladen – bitte deine letzte Änderung prüfen.';
      } else {
        vaultRev = result.rev;
        store.cloud.pending = false;
        store.cloud.lastSync = new Date().toISOString();
        store.cloud.error = null;
        await persistCacheOnly();
      }
    } catch (error) {
      store.cloud.error = error.message;
    } finally {
      pushing = null;
      emit();
    }
  })();
  return pushing;
}

async function persistCacheOnly() {
  try {
    const sealed = await seal(vaultKey.key, vaultKey.salt, vaultContent());
    localStorage.setItem(STORAGE_VAULT, JSON.stringify({ ...sealed, rev: vaultRev, email: store.cloud.email }));
  } catch {
    store.saveFailed = true;
  }
}

// Neueren Stand vom Server holen. Ungespeicherte Aenderungen auf diesem
// Geraet werden zuerst hochgeladen - ausser force (nach einem Konflikt).
export async function pull({ force = false } = {}) {
  if (store.mode !== 'vault' || !vaultKey || !cloud.cloudConfigured) return;
  if (store.cloud.pending && !force) { await push(); return; }
  try {
    const row = await cloud.fetchVault();
    if (row && row.rev > vaultRev) {
      const content = await unseal(vaultKey.key, row);
      vaultRev = row.rev;
      const active = store.active;
      useVault({ ...content, active });
      store.cloud.pending = false;
      await persistCacheOnly();
    }
    store.cloud.lastSync = new Date().toISOString();
    store.cloud.error = null;
  } catch (error) {
    store.cloud.error = error.message;
  }
  emit();
}

// Lokale Budgets beim ersten Anmelden in den Tresor uebernehmen.
// Geschuetzte Budgets lassen sich ohne ihr Passwort nicht lesen - sie
// bleiben auf dem Geraet und werden gemeldet.
function localContent() {
  readBudgets();
  const books = {};
  const skipped = [];
  for (const b of store.budgets) {
    if (b.protected) { skipped.push(b.name); continue; }
    books[b.id] = readData(b.id);
  }
  const budgets = store.budgets.filter((b) => !b.protected).map(({ id, name }) => ({ id, name }));
  return { content: { budgets: budgets.length ? budgets : defaultBudgets(), active: store.active, books }, skipped };
}

function clearLocalPlain(ids) {
  for (const id of ids) {
    try { localStorage.removeItem(dataKey(id)); } catch { /* egal */ }
  }
  try { localStorage.removeItem(STORAGE_BUDGETS); } catch { /* egal */ }
}

export function cloudAvailable() {
  return cloud.cloudConfigured;
}

export function cachedEmail() {
  return readCache()?.email || null;
}

export async function cloudSignUp(email, password) {
  return cloud.signUp(email, password);
}

// Anmelden: Server-Login, Tresor holen (oder beim ersten Mal anlegen).
export async function cloudSignIn(email, password, remember) {
  const login = await cloud.signIn(email, password);
  if (login.error) return login;
  store.cloud.email = email.trim();
  try {
    const row = await cloud.fetchVault();
    if (row) {
      vaultKey = { key: await deriveKey(password, row.salt), salt: row.salt };
      let content;
      try {
        content = await unseal(vaultKey.key, row);
      } catch {
        return { error: 'Die Daten lassen sich mit diesem Passwort nicht öffnen.' };
      }
      vaultRev = row.rev;
      useVault(content);
      await persistCacheOnly();
    } else {
      const salt = newSalt();
      vaultKey = { key: await deriveKey(password, salt), salt };
      const { content, skipped } = localContent();
      const migrated = content.budgets.map((b) => b.id);
      vaultRev = 0;
      useVault(content);
      const result = await cloud.storeVault(vaultKey, vaultContent(), 0);
      if (result.conflict) return { error: 'Auf einem anderen Gerät wurde gerade ein Tresor angelegt. Bitte nochmal anmelden.' };
      vaultRev = result.rev;
      await persistCacheOnly();
      clearLocalPlain(migrated);
      if (skipped.length) store.cloud.notice = `Nicht übernommen (eigenes Passwort): ${skipped.join(', ')}. Dort Passwort entfernen und erneut anmelden.`;
    }
  } catch (error) {
    return { error: error.message };
  }
  if (remember) await cloud.rememberKey({ ...vaultKey, email: store.cloud.email });
  store.cloud.lastSync = new Date().toISOString();
  emit();
  return {};
}

// Entsperren ohne Server (z. B. offline) mit dem Tresor auf dem Geraet.
export async function cloudUnlock(password, remember) {
  const cache = readCache();
  if (!cache) return { error: 'Auf diesem Gerät liegt noch nichts – bitte anmelden.' };
  try {
    const key = await deriveKey(password, cache.salt);
    const content = await unseal(key, cache);
    vaultKey = { key, salt: cache.salt };
    vaultRev = cache.rev || 0;
    store.cloud.email = cache.email || null;
    useVault(content);
  } catch {
    return { error: 'Das Passwort stimmt nicht.' };
  }
  if (remember) await cloud.rememberKey({ ...vaultKey, email: store.cloud.email });
  emit();
  pull();
  return {};
}

// Sperren: Schluessel und Daten aus dem Arbeitsspeicher werfen.
export async function cloudLock() {
  if (store.cloud.pending) await push();
  await cloud.forgetKey();
  vault = null;
  vaultKey = null;
  store.mode = 'signedout';
  store.locked = true;
  store.data = emptyData();
  emit();
}

// Abmelden: zusaetzlich die Kopie auf diesem Geraet loeschen.
export async function cloudSignOut() {
  if (store.cloud.pending) await push();
  await cloud.signOut();
  try { localStorage.removeItem(STORAGE_VAULT); } catch { /* egal */ }
  vault = null;
  vaultKey = null;
  vaultRev = 0;
  store.cloud = { email: null, lastSync: null, pending: false, error: null, notice: null, busy: false };
  store.budgets = defaultBudgets();
  store.mode = 'signedout';
  store.locked = true;
  store.data = emptyData();
  emit();
}

export function useLocalOnly() {
  try { localStorage.setItem(STORAGE_LOCAL_ONLY, '1'); } catch { /* egal */ }
  store.mode = 'local';
  readBudgets();
  openActive();
  emit();
}

export function showSignIn() {
  try { localStorage.removeItem(STORAGE_LOCAL_ONLY); } catch { /* egal */ }
  store.mode = 'signedout';
  store.locked = true;
  emit();
}

export function dismissNotice() {
  store.cloud.notice = null;
  emit();
}

// Beim Start: mit gemerktem Schluessel direkt oeffnen, sonst Anmeldung zeigen.
async function bootVault() {
  const remembered = await cloud.rememberedKey();
  const cache = readCache();
  if (remembered && cache && cache.salt === remembered.salt) {
    try {
      const content = await unseal(remembered.key, cache);
      vaultKey = { key: remembered.key, salt: remembered.salt };
      vaultRev = cache.rev || 0;
      store.cloud.email = remembered.email || cache.email || null;
      useVault(content);
      emit();
      pull();
      return;
    } catch {
      await cloud.forgetKey();
    }
  }
  emit();
}

// Beim Zurueckkehren in die App und bei wiederhergestellter Verbindung abgleichen.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    else if (store.cloud.pending) push();
  });
  window.addEventListener('online', () => pull());
}

// --- Budgets -----------------------------------------------------------------

function readBudgets() {
  store.budgets = defaultBudgets();
  store.active = MAIN_ID;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_BUDGETS) || 'null');
    if (raw && Array.isArray(raw.list) && raw.list.some((b) => b.id === MAIN_ID)) {
      store.budgets = raw.list;
      store.active = raw.list.some((b) => b.id === raw.active) ? raw.active : MAIN_ID;
    }
  } catch {
    // Standard: nur "Mein Budget"
  }
}

function writeBudgets() {
  if (store.mode === 'vault') { persistVault(); return; }
  try {
    localStorage.setItem(STORAGE_BUDGETS, JSON.stringify({ list: store.budgets, active: store.active }));
  } catch {
    store.saveFailed = true;
  }
}

function readRaw(id) {
  try {
    const raw = localStorage.getItem(dataKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readData(id) {
  if (store.mode === 'vault') return vault.books[id] || (vault.books[id] = emptyData());
  try {
    const raw = localStorage.getItem(dataKey(id));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!validateData(parsed)) return parsed;
    }
  } catch {
    // Kein Zugriff auf den Speicher (privater Modus) - die App laeuft leer weiter.
  }
  return emptyData();
}

export function activeBudget() {
  return store.budgets.find((b) => b.id === store.active) || store.budgets[0];
}

// Im Tresor ist ohnehin alles verschluesselt - dort gibt es keinen
// zusaetzlichen Passwortschutz pro Budget.
export function isProtected(id = store.active) {
  if (store.mode === 'vault') return false;
  return Boolean(store.budgets.find((b) => b.id === id)?.protected);
}

// Daten des aktiven Budgets laden - geschuetzte bleiben gesperrt, bis das
// Passwort eingegeben ist. Solange steht ein leerer Platzhalter in store.data,
// der nie gespeichert wird.
function openActive() {
  if (isProtected()) {
    store.locked = true;
    store.data = emptyData();
  } else {
    store.locked = false;
    store.data = readData(store.active);
  }
}

export async function switchBudget(id) {
  if (!store.budgets.some((b) => b.id === id)) return;
  if (id !== store.active && store.mode === 'local') {
    await queue;
    keys.delete(store.active);
  }
  store.active = id;
  openActive();
  writeBudgets();
  emit();
}

// Gibt true zurueck, wenn das Passwort stimmt.
export async function unlock(password) {
  const sealed = readRaw(store.active);
  if (!isSealed(sealed)) return false;
  try {
    const key = await deriveKey(password, sealed.sealed.salt);
    const data = await unseal(key, sealed.sealed);
    if (validateData(data)) return false;
    keys.set(store.active, { key, salt: sealed.sealed.salt });
    store.data = data;
    store.locked = false;
  } catch {
    return false;
  }
  emit();
  return true;
}

export async function lock() {
  if (store.mode === 'vault') { await cloudLock(); return; }
  if (!isProtected() || store.locked) return;
  await queue;
  keys.delete(store.active);
  openActive();
  emit();
}

// Setzt oder aendert das Passwort des aktiven (entsperrten) Budgets.
export async function setPassword(password) {
  if (store.locked || store.mode === 'vault') return;
  const salt = newSalt();
  keys.set(store.active, { key: await deriveKey(password, salt), salt });
  activeBudget().protected = true;
  await save();
  writeBudgets();
  emit();
}

export async function removePassword() {
  if (store.locked || store.mode === 'vault') return;
  keys.delete(store.active);
  delete activeBudget().protected;
  await save();
  writeBudgets();
  emit();
}

export function createBudget(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'budget';
  let id = base;
  for (let n = 2; store.budgets.some((b) => b.id === id) || id === MAIN_ID; n += 1) id = `${base}-${n}`;
  store.budgets.push({ id, name });
  switchBudget(id);
  return id;
}

export function renameBudget(id, name) {
  const budget = store.budgets.find((b) => b.id === id);
  if (!budget || !name) return;
  budget.name = name;
  writeBudgets();
  emit();
}

export function deleteBudget(id) {
  if (id === MAIN_ID) return;
  keys.delete(id);
  if (store.mode === 'vault') {
    delete vault.books[id];
  } else {
    try {
      localStorage.removeItem(dataKey(id));
      localStorage.removeItem(backupKey(id));
    } catch {
      // nichts zu loeschen
    }
  }
  store.budgets = store.budgets.filter((b) => b.id !== id);
  switchBudget(MAIN_ID);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener(store);
}

export function load() {
  let localOnly = false;
  try { localOnly = localStorage.getItem(STORAGE_LOCAL_ONLY) === '1'; } catch { /* egal */ }
  if (cloud.cloudConfigured && !localOnly) {
    store.mode = 'signedout';
    store.locked = true;
    store.cloud.email = cachedEmail();
    bootVault();
  } else {
    store.mode = 'local';
    readBudgets();
    openActive();
  }
  // Den Browser bitten, die Daten nicht bei Platzmangel wegzuraeumen.
  navigator.storage?.persist?.().catch(() => {});
  return store.data;
}

// Speichern laeuft der Reihe nach (Verschluesseln ist asynchron), damit ein
// aelterer Stand nie einen neueren ueberschreibt.
let queue = Promise.resolve();
function save() {
  if (store.mode === 'vault') {
    vault.books[store.active] = store.data;
    queue = queue.then(persistVault);
    return queue;
  }
  const id = store.active;
  const data = store.data;
  queue = queue.then(async () => {
    try {
      let text;
      if (isProtected(id)) {
        const unlocked = keys.get(id);
        if (!unlocked) return; // gesperrt: nichts zu speichern
        text = JSON.stringify({ sealed: await seal(unlocked.key, unlocked.salt, data) });
      } else {
        text = JSON.stringify(data);
      }
      localStorage.setItem(dataKey(id), text);
      store.saveFailed = false;
    } catch {
      store.saveFailed = true;
    }
  });
  return queue;
}

// Jede Aenderung laeuft hier durch: veraendern, speichern, neu zeichnen.
export function update(mutator) {
  if (store.locked) return;
  mutator(store.data);
  save();
  emit();
}

// Ein geschuetztes Budget (oder eines im Tresor) wird verschluesselt
// exportiert - die Sicherungsdatei laesst sich dann nur mit demselben
// Passwort wieder oeffnen.
export async function exportJson() {
  try {
    localStorage.setItem(backupKey(store.active), new Date().toISOString());
  } catch {
    // ohne Speicher eben ohne Erinnerung
  }
  await queue;
  if (store.mode === 'vault') {
    return JSON.stringify({ sealed: await seal(vaultKey.key, vaultKey.salt, store.data) }, null, 2);
  }
  if (isProtected()) {
    const stored = readRaw(store.active);
    if (isSealed(stored)) return JSON.stringify(stored, null, 2);
  }
  return JSON.stringify(store.data, null, 2);
}

export function lastBackupAt() {
  try {
    return localStorage.getItem(backupKey(store.active));
  } catch {
    return null;
  }
}

// Gibt eine Fehlermeldung zurueck oder null, wenn der Import geklappt hat.
export async function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Die Datei ist keine gültige Sicherung.';
  }
  if (isSealed(parsed) && store.mode === 'vault') {
    // Verschluesselte Sicherung im Tresor: nur lesbar, wenn sie aus diesem
    // Tresor stammt (gleiches Salt, gleicher Schluessel).
    try {
      if (parsed.sealed.salt !== vaultKey.salt) throw new Error('fremd');
      parsed = await unseal(vaultKey.key, parsed.sealed);
    } catch {
      return 'Diese Sicherung wurde mit einem anderen Passwort verschlüsselt. Bitte eine unverschlüsselte Sicherung oder eine aus diesem Konto wählen.';
    }
  } else if (isSealed(parsed)) {
    // Verschluesselte Sicherung: so uebernehmen und sperren - geoeffnet wird
    // sie mit dem Passwort, mit dem sie gespeichert wurde.
    try {
      localStorage.setItem(dataKey(store.active), JSON.stringify({ sealed: parsed.sealed }));
    } catch {
      return 'Die Sicherung konnte nicht gespeichert werden.';
    }
    keys.delete(store.active);
    activeBudget().protected = true;
    writeBudgets();
    openActive();
    emit();
    return null;
  }
  if (store.locked) return 'Bitte das Budget zuerst entsperren.';
  const problem = validateData(parsed);
  if (problem) return problem;
  update((data) => {
    Object.keys(data).forEach((k) => delete data[k]);
    Object.assign(data, parsed);
  });
  return null;
}

export function resetAll() {
  update((data) => {
    Object.keys(data).forEach((k) => delete data[k]);
    Object.assign(data, emptyData());
  });
}
