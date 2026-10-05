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
