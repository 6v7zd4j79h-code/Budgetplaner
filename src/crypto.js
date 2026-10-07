// Passwortschutz fuer ein Konto. Das Haushaltsbuch eines geschuetzten Kontos
// wird nur verschluesselt gespeichert (AES-GCM, Schluessel per PBKDF2 aus dem
// Passwort). Ohne Passwort ist es weder im Browser-Speicher noch in der
// Sicherungsdatei lesbar - und ohne Passwort auch nicht wiederherstellbar.

const ITERATIONS = 310000;

function toBase64(bytes) {
  let text = '';
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function deriveKey(password, saltBase64) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(saltBase64), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function newSalt() {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

// Ergebnis ist das, was gespeichert wird: { salt, iv, data } als Base64.
export async function seal(key, salt, book) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(book)),
  );
  return { salt, iv: toBase64(iv), data: toBase64(data) };
}

// Wirft bei falschem Passwort (AES-GCM erkennt das an der Pruefsumme).
export async function unseal(key, sealed) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// Fuer die Anmeldung beim Server: ein eigener Wert, aus dem Passwort
// abgeleitet, aber mit anderem Salt als der Datenschluessel. Der Server
// bekommt so nie das echte Passwort und kann die Daten nicht entschluesseln.
export async function deriveLoginSecret(password, email) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(`budgetplaner-login:${email.trim().toLowerCase()}`), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return toBase64(bits);
}

// --- Gemeinsame Budgets ---------------------------------------------------------
// Ein gemeinsames Budget hat einen eigenen, zufaelligen Schluessel. Er liegt
// (als Text) in den privaten Tresoren aller Mitglieder - dort ist er durch
// deren Passwort geschuetzt.

export async function newSpaceKey() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return toBase64(await crypto.subtle.exportKey('raw', key));
}

export function importSpaceKey(raw) {
  return crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Einladungscode: 20 Zeichen aus einem Alphabet ohne Verwechsler (kein 0/O, 1/I/L),
// also rund 100 Bit Zufall. Angezeigt in Vierergruppen.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

export function normalizeCode(code) {
  return String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Was der Server vom Code sieht: nur dieser Hash.
export async function inviteCodeHash(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`budgetplaner-einladung:${normalizeCode(code)}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Schluessel, mit dem der Budget-Schluessel in der Einladung verschluesselt ist.
export function inviteCodeKey(code, salt) {
  return deriveKey(normalizeCode(code), salt);
}
