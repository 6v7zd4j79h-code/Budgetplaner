// Abgleich zwischen Geraeten - mit dem echten Server-Code (server/vault-core.js)
// und einer Ablage im Speicher statt Netlify Blobs.
// Geprueft wird, was wirklich wehtun wuerde: Der Server sieht nie Klartext,
// Passwort oder E-Mail, ein zweites Geraet bekommt dieselben Daten, bei
// gleichzeitigen Aenderungen geht der neuere Server-Stand nicht verloren, und
// ein gemeinsames Budget sehen nur eingeladene Personen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, memoryStore } from '../server/vault-core.js';

// --- Umgebung: localStorage pro "Geraet" ----------------------------------------
function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

// --- Server im Speicher ----------------------------------------------------------
const blobs = memoryStore();
const sent = [];
const server = async (body) => {
  sent.push(JSON.stringify(body));
  // Wie ueber das Netz: nur JSON hin und zurueck.
  const result = await handle(blobs, JSON.parse(JSON.stringify(body)));
  return JSON.parse(JSON.stringify(result));
};
const serverText = () => JSON.stringify([...blobs.items.entries()]);

const cloud = await import('../src/cloud.js');
cloud.useServerForTests(server);

// Jedes "Geraet" ist eine eigene Instanz von store.js und cloud.js.
async function device(name) {
  globalThis.localStorage = storage();
  const c = await import(`../src/cloud.js?device=${name}`);
  c.useServerForTests(server);
  const s = await import(`../src/store.js?device=${name}`);
  return { s, ls: globalThis.localStorage };
}
const use = (d) => { globalThis.localStorage = d.ls; return d.s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// store.js importiert './cloud.js' - pro Geraet soll es eine eigene Anmeldung
// geben. Darum bekommt jedes Geraet seine eigene Kopie beider Module.
test.before(async () => {
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(specifier, context, next) {
      const parent = context.parentURL || '';
      const tag = parent.match(/[?&]device=([^&]+)/);
      if (tag && specifier === './cloud.js') {
        const r = await next(specifier, context);
        return { ...r, url: r.url + '?device=' + tag[1] };
      }
      return next(specifier, context);
    }`));
});

let a; let b;

test('Konto anlegen, Tresor hochladen: Server sieht weder Passwort, E-Mail noch Klartext', async () => {
  a = await device('a');
  const s = use(a);
  s.load();
  assert.equal(s.store.mode, 'signedout');
  assert.deepEqual(await s.cloudSignUp('m@example.org', 'geheim-123'), { needsConfirmation: false });
  assert.match((await s.cloudSignUp('m@example.org', 'anders-456')).error, /schon ein Konto/);
  assert.deepEqual(await s.cloudSignIn('m@example.org', 'geheim-123', false), {});
  assert.equal(s.store.mode, 'vault');
  s.createBudget('Haushalt');
  await wait(50);
  s.update((d) => { d.goals.push({ id: 'g1', name: 'Urlaub Lissabon', target: 100000, saved: 2500 }); });
  await wait(1500); // Hochladen ist verzoegert
  const vault = [...blobs.items.entries()].find(([k]) => k.startsWith('vault/'))[1].data;
  assert.ok(vault.rev >= 2, 'Aenderung hochgeladen');
  const text = serverText();
  assert.ok(!text.includes('Lissabon') && !text.includes('Haushalt'), 'nur verschluesselt auf dem Server');
  assert.ok(!text.includes('geheim-123') && !text.includes('m@example.org'), 'weder Passwort noch E-Mail gespeichert');
  assert.ok(!sent.join().includes('geheim-123'), 'Passwort nie verschickt');
  assert.ok(!JSON.stringify(a.ls.dump()).includes('Lissabon'), 'auch auf dem Geraet nur verschluesselt');
});

test('Zweites Geraet sieht nach dem Anmelden dieselben Budgets', async () => {
  b = await device('b');
  const s = use(b);
  s.load();
  assert.deepEqual(await s.cloudSignIn('m@example.org', 'geheim-123', false), {});
  assert.deepEqual(s.store.budgets.map((x) => x.name), ['Mein Budget', 'Haushalt']);
  await s.switchBudget(s.store.budgets[1].id);
  assert.equal(s.store.data.goals[0].name, 'Urlaub Lissabon');
});

test('Falsches Passwort oeffnet nichts, ohne Anmeldung gibt es keine Daten', async () => {
  const c = await device('c');
  const s = use(c);
  s.load();
  const r = await s.cloudSignIn('m@example.org', 'falsch-999', false);
  assert.match(r.error, /stimmt nicht/);
  assert.equal(s.store.mode, 'signedout');
  const direct = await handle(blobs, { action: 'vault-get', email: 'm@example.org', secret: 'geraten' });
  assert.equal(direct.status, 401);
});

test('Gleichzeitig geaendert: neuerer Server-Stand gewinnt, mit Hinweis', async () => {
  // Geraet B aendert und laedt hoch
  use(b).update((d) => { d.goals.push({ id: 'g2', name: 'Von B', target: 100, saved: 0 }); });
  await wait(1500);
  // Geraet A kennt den neuen Stand nicht und aendert ebenfalls
  const s = use(a);
  s.update((d) => { d.goals.push({ id: 'g3', name: 'Von A', target: 100, saved: 0 }); });
  await wait(1700);
  assert.ok(s.store.cloud.notice, 'Hinweis auf Konflikt');
  assert.ok(s.store.data.goals.some((g) => g.name === 'Von B'), 'Stand von B ist da');
  s.dismissNotice();
});

test('Offline entsperren mit der Kopie auf dem Geraet', async () => {
  const s = use(a);
  await s.cloudLock();
  assert.equal(s.store.mode, 'signedout');
  assert.match((await s.cloudUnlock('falsch', false)).error, /stimmt nicht/);
  assert.deepEqual(await s.cloudUnlock('geheim-123', false), {});
  assert.equal(s.store.mode, 'vault');
  await wait(50);
  assert.equal(s.store.cloud.error, null, 'Abgleich klappt nach dem Entsperren ohne neue Anmeldung');
});

test('Gemeinsames Budget: Einladung per Code, beide sehen Aenderungen, sonst niemand', async () => {
  const sa = use(a);
  const haushalt = sa.store.budgets.find((x) => x.name === 'Haushalt');
  await sa.switchBudget(haushalt.id);
  assert.deepEqual(await sa.shareBudget(haushalt.id), {});
  assert.ok(haushalt.shared, 'freigegeben');
  const invite = await sa.inviteToBudget(haushalt.id);
  assert.match(invite.code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
  assert.ok(!serverText().includes(invite.code.replace(/-/g, '')), 'Code liegt nicht auf dem Server');

  // Klas: eigenes Konto auf eigenem Geraet
  const k = await device('k');
  let sk = use(k);
  sk.load();
  await sk.cloudSignUp('k@example.org', 'klas-geheim-1');
  assert.deepEqual(await sk.cloudSignIn('k@example.org', 'klas-geheim-1', false), {});
  assert.match((await sk.joinBudget('AAAA-BBBB-CCCC-DDDD-EEEE')).error, /gibt es nicht/);
  const joined = await sk.joinBudget(invite.code.toLowerCase());
  assert.ok(joined.id, joined.error);
  assert.deepEqual(sk.store.budgets.map((x) => x.name), ['Mein Budget', 'Haushalt']);
  assert.equal(sk.store.active, joined.id);
  assert.ok(sk.store.data.goals.some((g) => g.name === 'Urlaub Lissabon'), 'Klas sieht den Inhalt');

  // Code gilt nur einmal
  const again = await use(b).joinBudget(invite.code);
  assert.match(again.error, /gibt es nicht/);

  // Klas aendert, Mareike holt es sich
  sk = use(k);
  sk.update((d) => { d.goals.push({ id: 'g9', name: 'Neues Sofa', target: 90000, saved: 0 }); });
  await wait(1500);
  const sa2 = use(a);
  await sa2.pull();
  assert.ok(sa2.store.data.goals.some((g) => g.name === 'Neues Sofa'), 'Aenderung von Klas angekommen');

  // Mareikes privates Budget bleibt privat: Klas' Tresor kennt es nicht,
  // und ohne Mitgliedschaft gibt der Server den Bereich nicht heraus.
  const spaceId = haushalt.shared.space;
  const stranger = await device('x');
  const sx = use(stranger);
  sx.load();
  await sx.cloudSignUp('x@example.org', 'fremd-geheim-1');
  const denied = await handle(blobs, { action: 'space-get', email: 'x@example.org', secret: 'egal', space: spaceId });
  assert.equal(denied.status, 401);

  // Geraet B (Mareikes zweites Geraet) bekommt das gemeinsame Budget ueber den Tresor
  const sb = use(b);
  await sb.pull();
  const shared = sb.store.budgets.find((x) => x.shared);
  assert.ok(shared, 'Freigabe ist auf dem zweiten Geraet angekommen');
  await sb.switchBudget(shared.id);
  assert.ok(sb.store.data.goals.some((g) => g.name === 'Neues Sofa'));

  // Klas verlaesst das Budget - danach kein Zugriff mehr
  use(k).deleteBudget(joined.id);
  await wait(50);
  assert.equal(blobs.items.get(`space/${spaceId}`).data.members.length, 1, 'nur noch Mareike ist Mitglied');
});

test('Server: Mitgliedschaft wird geprueft', async () => {
  const sec = 'login-wert-y';
  await handle(blobs, { action: 'signup', email: 'y@example.org', secret: sec });
  const spaceKey = [...blobs.items.keys()].find((k) => k.startsWith('space/'));
  const r = await handle(blobs, { action: 'space-get', email: 'y@example.org', secret: sec, space: spaceKey.slice(6) });
  assert.equal(r.status, 403);
  const w = await handle(blobs, { action: 'space-put', email: 'y@example.org', secret: sec, space: spaceKey.slice(6), rev: 5, row: { iv: 'a', data: 'b' } });
  assert.equal(w.status, 403);
  assert.equal((await handle(blobs, { action: 'gibts-nicht' })).status, 400);
  assert.equal((await handle(blobs, { action: 'constructor' })).status, 400);
});
