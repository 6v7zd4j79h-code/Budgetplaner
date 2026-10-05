// Abgleich zwischen Geraeten ueber Supabase - Ende-zu-Ende-verschluesselt.
//
// Pro Person liegt in der Tabelle "vaults" genau eine Zeile: der Tresor mit
// allen Budgets, im Browser verschluesselt (siehe crypto.js). Aus dem
// Passwort entstehen zwei getrennte Werte:
//   - ein Login-Wert fuer Supabase (deriveLoginSecret)
//   - der Datenschluessel (deriveKey mit dem Salt aus der Zeile)
// Supabase kennt also weder Passwort noch Schluessel.
//
// Fehlen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, gibt es keinen Abgleich
// und die App laeuft wie bisher nur auf dem Geraet.

import { createClient } from '@supabase/supabase-js';
import { deriveKey, deriveLoginSecret, newSalt, seal, unseal } from './crypto.js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export let cloudConfigured = Boolean(url && anonKey);
let supabase = cloudConfigured ? createClient(url, anonKey) : null;

// Nur fuer Tests: einen nachgebauten Server einsetzen.
export function useClientForTests(client) {
  supabase = client;
  cloudConfigured = Boolean(client);
}

// --- "Auf diesem Geraet angemeldet bleiben" -----------------------------------
// Der Schluessel ist nicht exportierbar: Er laesst sich zum Ver- und
// Entschluesseln benutzen, aber nicht auslesen. Er liegt in IndexedDB.

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
  try { await idbDo('readwrite', (s) => s.put(entry, 'vault')); } catch { /* ohne IndexedDB eben nicht */ }
}

export async function rememberedKey() {
  try { return (await idbDo('readonly', (s) => s.get('vault'))) || null; } catch { return null; }
}

export async function forgetKey() {
  try { await idbDo('readwrite', (s) => s.delete('vault')); } catch { /* nichts zu vergessen */ }
}

// --- Anmeldung ----------------------------------------------------------------

function friendly(error) {
  const text = String(error?.message || error || '');
  if (/Invalid login credentials/i.test(text)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/Email not confirmed/i.test(text)) return 'Bitte zuerst die E-Mail bestätigen – der Link kam per Mail.';
  if (/already registered|already been registered/i.test(text)) return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (/rate limit/i.test(text)) return 'Zu viele Versuche. Bitte kurz warten.';
  if (/fetch|network/i.test(text)) return 'Keine Verbindung zum Server.';
  return text || 'Das hat nicht geklappt.';
}

export async function signUp(email, password) {
  const secret = await deriveLoginSecret(password, email);
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: secret });
  if (error) return { error: friendly(error) };
  return { needsConfirmation: !data.session };
}

export async function signIn(email, password) {
  const secret = await deriveLoginSecret(password, email);
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: secret });
  return error ? { error: friendly(error) } : {};
}

export async function signOut() {
  await forgetKey();
  if (supabase) await supabase.auth.signOut().catch(() => {});
}

export async function currentEmail() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email || null;
}

// --- Tresor -------------------------------------------------------------------

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

// Liest die Zeile vom Server: { salt, iv, data, rev } oder null.
export async function fetchVault() {
  const uid = await userId();
  if (!uid) throw new Error('Nicht angemeldet.');
  const { data, error } = await supabase.from('vaults').select('salt, iv, data, rev').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(friendly(error));
  return data;
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
  const uid = await userId();
  if (!uid) throw new Error('Nicht angemeldet.');
  const sealed = await seal(key, salt, content);
  const row = { salt, iv: sealed.iv, data: sealed.data, updated_at: new Date().toISOString() };
  if (!rev) {
    const { error } = await supabase.from('vaults').insert({ ...row, user_id: uid, rev: 1 });
    if (error) {
      if (/duplicate|conflict/i.test(error.message)) return { conflict: true };
      throw new Error(friendly(error));
    }
    return { rev: 1 };
  }
  const { data, error } = await supabase.from('vaults')
    .update({ ...row, rev: rev + 1 }).eq('user_id', uid).eq('rev', rev).select('rev');
  if (error) throw new Error(friendly(error));
  if (!data.length) return { conflict: true };
  return { rev: data[0].rev };
}

export { seal, unseal };
