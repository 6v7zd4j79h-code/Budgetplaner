// Server fuer den Abgleich zwischen Geraeten - laeuft als Netlify-Funktion
// (netlify/functions/vault.mjs) und beim Entwickeln in Vite.
//
// Der Server ist bewusst dumm: Er legt nur verschluesselte Tresore ab und
// prueft, wer welchen lesen und schreiben darf. Er sieht nie Passwort,
// Schluessel oder Klartext.
//
// Ablage (Schluessel -> Inhalt):
//   user/<uid>     { login }                      Pruefwert fuer die Anmeldung
//   vault/<uid>    { salt, iv, data, rev }        privater Tresor einer Person
//   space/<sid>    { iv, data, rev, members }     gemeinsames Budget
//   invite/<hash>  { space, sealed, expires }     Einladung zu einem gemeinsamen Budget
//
// uid ist ein Hash der E-Mail - die Adresse selbst wird nicht gespeichert.
// login ist ein Hash des Login-Werts, den der Browser aus dem Passwort
// ableitet (crypto.js: deriveLoginSecret). Der Einladungscode erreicht den
// Server nur als Hash; der Schluessel des gemeinsamen Budgets liegt in der
// Einladung mit einem Schluessel aus dem Code verschluesselt.
//
// store: { get(key) -> { data, etag } | null,
//          set(key, data, { onlyIfNew } | { onlyIfMatch }) -> { modified },
//          delete(key) }

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const INVITE_DAYS = 7;
const MAX_TEXT = 4 * 1024 * 1024; // verschluesselte Daten, grosszuegig
const RETRIES = 5;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const userId = (email) => sha256(`budgetplaner-user:${String(email).trim().toLowerCase()}`);

class Fail extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const isText = (v, max = MAX_TEXT) => typeof v === 'string' && v.length > 0 && v.length <= max;
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{16,64}$/.test(v);

function sameHash(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function login(store, body) {
  if (!isText(body.email, 320) || !isText(body.secret, 200)) throw new Fail(400, 'Anmeldedaten fehlen.');
  const uid = userId(body.email);
  const user = await store.get(`user/${uid}`);
  if (!user || !sameHash(user.data.login, sha256(body.secret))) throw new Fail(401, 'E-Mail oder Passwort stimmt nicht.');
  return uid;
}

function sealedRow(row, withSalt) {
  if (!row || !isText(row.iv, 100) || !isText(row.data) || (withSalt && !isText(row.salt, 100))) {
    throw new Fail(400, 'Ungültige Daten.');
  }
  return withSalt ? { salt: row.salt, iv: row.iv, data: row.data } : { iv: row.iv, data: row.data };
}

// Schreiben nur, wenn sich der Stand seit dem Lesen nicht geaendert hat.
// rev ist der Stand, auf dem das Geraet seine Aenderung aufgebaut hat.
async function writeIfRev(store, key, rev, next) {
  if (!rev) {
    const { modified } = await store.set(key, { ...next, rev: 1 }, { onlyIfNew: true });
    if (!modified) throw new Fail(409, 'Konflikt', { conflict: true });
    return { rev: 1 };
  }
  const current = await store.get(key);
  if (!current || current.data.rev !== rev) throw new Fail(409, 'Konflikt', { conflict: true });
  const { modified } = await store.set(key, { ...current.data, ...next, rev: rev + 1 }, { onlyIfMatch: current.etag });
  if (!modified) throw new Fail(409, 'Konflikt', { conflict: true });
  return { rev: rev + 1 };
}

async function member(store, uid, sid) {
  if (!isId(sid)) throw new Fail(400, 'Unbekanntes gemeinsames Budget.');
  const space = await store.get(`space/${sid}`);
  if (!space) throw new Fail(404, 'Dieses gemeinsame Budget gibt es nicht mehr.');
  if (!space.data.members.includes(uid)) throw new Fail(403, 'Kein Zugriff auf dieses gemeinsame Budget.');
  return space;
}

const actions = {
  async signup(store, body) {
    if (!isText(body.email, 320) || !/^[^\s@]+@[^\s@]+$/.test(body.email.trim()) || !isText(body.secret, 200)) {
      throw new Fail(400, 'Bitte eine gültige E-Mail-Adresse angeben.');
    }
    const uid = userId(body.email);
    const { modified } = await store.set(`user/${uid}`, { login: sha256(body.secret), created: new Date().toISOString() }, { onlyIfNew: true });
    if (!modified) throw new Fail(409, 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.');
    return {};
  },

  async check(store, body) {
    await login(store, body);
    return {};
  },

  async 'vault-get'(store, body) {
    const uid = await login(store, body);
    const found = await store.get(`vault/${uid}`);
    if (!found) return { row: null };
    const { salt, iv, data, rev } = found.data;
    return { row: { salt, iv, data, rev } };
  },

  async 'vault-put'(store, body) {
    const uid = await login(store, body);
    return writeIfRev(store, `vault/${uid}`, body.rev, sealedRow(body.row, true));
  },

  async 'space-create'(store, body) {
    const uid = await login(store, body);
    const row = sealedRow(body.row, false);
    const sid = randomBytes(16).toString('hex');
    await store.set(`space/${sid}`, { ...row, rev: 1, members: [uid] }, { onlyIfNew: true });
    return { space: sid, rev: 1 };
  },

  async 'space-get'(store, body) {
    const uid = await login(store, body);
    const space = await member(store, uid, body.space);
    const { iv, data, rev, members } = space.data;
    return { row: { iv, data, rev }, members: members.length };
  },

  async 'space-put'(store, body) {
    const uid = await login(store, body);
    await member(store, uid, body.space);
    return writeIfRev(store, `space/${body.space}`, body.rev, sealedRow(body.row, false));
  },

  // Eine Person verlaesst das gemeinsame Budget. Ist sie die letzte, wird es geloescht.
  async 'space-leave'(store, body) {
    const uid = await login(store, body);
    for (let i = 0; i < RETRIES; i += 1) {
      let space;
      try { space = await member(store, uid, body.space); } catch (e) { if (e.status === 404 || e.status === 403) return {}; throw e; }
      const members = space.data.members.filter((m) => m !== uid);
      if (!members.length) { await store.delete(`space/${body.space}`); return {}; }
      const { modified } = await store.set(`space/${body.space}`, { ...space.data, members }, { onlyIfMatch: space.etag });
      if (modified) return {};
    }
    throw new Fail(503, 'Gerade viel los – bitte gleich nochmal versuchen.');
  },

  async 'invite-create'(store, body) {
    const uid = await login(store, body);
    await member(store, uid, body.space);
    if (!isId(body.code)) throw new Fail(400, 'Ungültiger Einladungscode.');
    const sealed = sealedRow(body.sealed, true);
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
    const { modified } = await store.set(`invite/${body.code}`, { space: body.space, sealed, expires }, { onlyIfNew: true });
    if (!modified) throw new Fail(409, 'Diesen Code gibt es schon – bitte nochmal erzeugen.');
    return { expires };
  },

  // Einladung einloesen: als Mitglied eintragen, verschluesselten Schluessel
  // herausgeben, Einladung loeschen (gilt nur einmal).
  async 'invite-accept'(store, body) {
    const uid = await login(store, body);
    if (!isId(body.code)) throw new Fail(400, 'Ungültiger Einladungscode.');
    const invite = await store.get(`invite/${body.code}`);
    if (!invite) throw new Fail(404, 'Diesen Einladungscode gibt es nicht (mehr). Bitte einen neuen erzeugen lassen.');
    if (invite.data.expires < new Date().toISOString()) {
      await store.delete(`invite/${body.code}`);
      throw new Fail(410, 'Der Einladungscode ist abgelaufen. Bitte einen neuen erzeugen lassen.');
    }
    const sid = invite.data.space;
    for (let i = 0; i < RETRIES; i += 1) {
      const space = await store.get(`space/${sid}`);
      if (!space) throw new Fail(404, 'Dieses gemeinsame Budget gibt es nicht mehr.');
      if (space.data.members.includes(uid)) break;
      const { modified } = await store.set(`space/${sid}`, { ...space.data, members: [...space.data.members, uid] }, { onlyIfMatch: space.etag });
      if (modified) break;
      if (i === RETRIES - 1) throw new Fail(503, 'Gerade viel los – bitte gleich nochmal versuchen.');
    }
    await store.delete(`invite/${body.code}`);
    return { space: sid, sealed: invite.data.sealed };
  },
};

// Eine Anfrage beantworten: { status, body }.
export async function handle(store, body) {
  try {
    if (!body || typeof body !== 'object') throw new Fail(400, 'Ungültige Anfrage.');
    const action = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
    if (!action) throw new Fail(400, 'Unbekannte Aktion.');
    return { status: 200, body: await action(store, body) };
  } catch (error) {
    if (error instanceof Fail) return { status: error.status, body: { error: error.message, ...error.extra } };
    console.error(error);
    return { status: 500, body: { error: 'Der Server hat gerade ein Problem. Bitte später nochmal versuchen.' } };
  }
}

// Ablage im Arbeitsspeicher - fuer Tests und den Vite-Entwicklungsserver.
export function memoryStore() {
  const items = new Map();
  let n = 0;
  return {
    items,
    async get(key) {
      const item = items.get(key);
      return item ? { data: structuredClone(item.data), etag: item.etag } : null;
    },
    async set(key, data, options = {}) {
      const item = items.get(key);
      if (options.onlyIfNew && item) return { modified: false };
      if (options.onlyIfMatch && (!item || item.etag !== options.onlyIfMatch)) return { modified: false };
      n += 1;
      items.set(key, { data: structuredClone(data), etag: `e${n}` });
      return { modified: true, etag: `e${n}` };
    },
    async delete(key) { items.delete(key); },
  };
}
