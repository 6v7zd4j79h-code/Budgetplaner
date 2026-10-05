// Speicher: alles liegt im localStorage dieses Geraets, nichts verlaesst es.
// Damit die Daten einen Gerätewechsel oder geloeschte Browserdaten
// ueberleben, gibt es in den Einstellungen Sicherung und Wiederherstellung.

import { emptyData, validateData } from './budget.js';
import { deriveKey, newSalt, seal, unseal } from './crypto.js';

// Passwortschutz: Ein geschuetztes Budget (protected: true) liegt im Speicher
// nur verschluesselt als { sealed: { salt, iv, data } }. Nach dem Entsperren
// stehen Daten und Schluessel nur im Arbeitsspeicher. Wechsel zu einem
// anderen Budget und Neuladen sperren wieder.
const keys = new Map(); // Budget-ID -> { key, salt }

function isSealed(parsed) {
  const s = parsed && parsed.sealed;
  return Boolean(s && [s.salt, s.iv, s.data].every((v) => typeof v === 'string' && v));
}

// Mehrere getrennte Budgets (z. B. privat und Gemeinschaftskonto). Das
// erste heisst intern "privat" und nutzt die urspruenglichen Schluessel,
// damit vorhandene Daten ohne Umzug erhalten bleiben.
const MAIN_ID = 'privat';
const STORAGE_BUDGETS = 'budgetplaner.budgets';
const dataKey = (id) => (id === MAIN_ID ? 'budgetplaner.data' : `budgetplaner.data.${id}`);
const backupKey = (id) => (id === MAIN_ID ? 'budgetplaner.lastBackup' : `budgetplaner.lastBackup.${id}`);

const listeners = new Set();

export const store = {
  data: emptyData(),
  saveFailed: false,
  locked: false,
  budgets: [{ id: MAIN_ID, name: 'Mareike' }, { id: 'gemeinsam', name: 'Gemeinschaftskonto' }],
  active: MAIN_ID,
};

function readBudgets() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_BUDGETS) || 'null');
    if (raw && Array.isArray(raw.list) && raw.list.some((b) => b.id === MAIN_ID)) {
      store.budgets = raw.list;
      store.active = raw.list.some((b) => b.id === raw.active) ? raw.active : MAIN_ID;
    }
  } catch {
    // Standard: Mareike und Gemeinschaftskonto
  }
}

function writeBudgets() {
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

export function isProtected(id = store.active) {
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
  if (id !== store.active) {
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
  if (!isProtected() || store.locked) return;
  await queue;
  keys.delete(store.active);
  openActive();
  emit();
}

// Setzt oder aendert das Passwort des aktiven (entsperrten) Budgets.
export async function setPassword(password) {
  if (store.locked) return;
  const salt = newSalt();
  keys.set(store.active, { key: await deriveKey(password, salt), salt });
  activeBudget().protected = true;
  await save();
  writeBudgets();
  emit();
}

export async function removePassword() {
  if (store.locked) return;
  keys.delete(store.active);
  delete activeBudget().protected;
  await save();
  writeBudgets();
  emit();
}

export function createBudget(name) {
  const base = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'budget';
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
  try {
    localStorage.removeItem(dataKey(id));
    localStorage.removeItem(backupKey(id));
  } catch {
    // nichts zu loeschen
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
  readBudgets();
  openActive();
  // Den Browser bitten, die Daten nicht bei Platzmangel wegzuraeumen.
  navigator.storage?.persist?.().catch(() => {});
  return store.data;
}

// Speichern laeuft der Reihe nach (Verschluesseln ist asynchron), damit ein
// aelterer Stand nie einen neueren ueberschreibt.
let queue = Promise.resolve();
function save() {
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

// Ein geschuetztes Budget wird verschluesselt exportiert - die Sicherungsdatei
// laesst sich dann nur mit demselben Passwort wieder oeffnen.
export async function exportJson() {
  try {
    localStorage.setItem(backupKey(store.active), new Date().toISOString());
  } catch {
    // ohne Speicher eben ohne Erinnerung
  }
  await queue;
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
export function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Die Datei ist keine gültige Sicherung.';
  }
  // Verschluesselte Sicherung: so uebernehmen und sperren - geoeffnet wird
  // sie mit dem Passwort, mit dem sie gespeichert wurde.
  if (isSealed(parsed)) {
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
