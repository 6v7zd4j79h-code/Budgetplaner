// Speicher: alles liegt im localStorage dieses Geraets, nichts verlaesst es.
// Damit die Daten einen Gerätewechsel oder geloeschte Browserdaten
// ueberleben, gibt es in den Einstellungen Sicherung und Wiederherstellung.

import { emptyData, validateData } from './budget.js';

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
  budgets: [{ id: MAIN_ID, name: 'Privat' }],
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
    // Standard: nur das private Budget
  }
}

function writeBudgets() {
  try {
    localStorage.setItem(STORAGE_BUDGETS, JSON.stringify({ list: store.budgets, active: store.active }));
  } catch {
    store.saveFailed = true;
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

export function switchBudget(id) {
  if (!store.budgets.some((b) => b.id === id)) return;
  store.active = id;
  store.data = readData(id);
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
  store.data = readData(store.active);
  // Den Browser bitten, die Daten nicht bei Platzmangel wegzuraeumen.
  navigator.storage?.persist?.().catch(() => {});
  return store.data;
}

function save() {
  try {
    localStorage.setItem(dataKey(store.active), JSON.stringify(store.data));
    store.saveFailed = false;
  } catch {
    store.saveFailed = true;
  }
}

// Jede Aenderung laeuft hier durch: veraendern, speichern, neu zeichnen.
export function update(mutator) {
  mutator(store.data);
  save();
  emit();
}

export function exportJson() {
  try {
    localStorage.setItem(backupKey(store.active), new Date().toISOString());
  } catch {
    // ohne Speicher eben ohne Erinnerung
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
