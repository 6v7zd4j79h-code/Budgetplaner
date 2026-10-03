// Speicher: alles liegt im localStorage dieses Geraets, nichts verlaesst es.
// Damit die Daten einen Gerätewechsel oder geloeschte Browserdaten
// ueberleben, gibt es in den Einstellungen Sicherung und Wiederherstellung.

import { emptyData, validateData } from './budget.js';

const STORAGE_KEY = 'budgetplaner.data';
const STORAGE_BACKUP_AT = 'budgetplaner.lastBackup';

const listeners = new Set();

export const store = {
  data: emptyData(),
  saveFailed: false,
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener(store);
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!validateData(parsed)) store.data = parsed;
    }
  } catch {
    // Kein Zugriff auf den Speicher (privater Modus) - die App laeuft leer weiter.
  }
  // Den Browser bitten, die Daten nicht bei Platzmangel wegzuraeumen.
  navigator.storage?.persist?.().catch(() => {});
  return store.data;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.data));
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
    localStorage.setItem(STORAGE_BACKUP_AT, new Date().toISOString());
  } catch {
    // ohne Speicher eben ohne Erinnerung
  }
  return JSON.stringify(store.data, null, 2);
}

export function lastBackupAt() {
  try {
    return localStorage.getItem(STORAGE_BACKUP_AT);
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
