// Abgleich zwischen Geraeten mit einem nachgebauten Supabase im Speicher.
// Geprueft wird, was wirklich wehtun wuerde: Der Server sieht nie Klartext
// oder Passwort, ein zweites Geraet bekommt dieselben Daten, und bei
// gleichzeitigen Aenderungen geht der neuere Server-Stand nicht verloren.

import test from 'node:test';
import assert from 'node:assert/strict';

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

// --- Nachgebauter Server -------------------------------------------------------
function fakeSupabase() {
  const users = new Map(); // email -> { id, password }
  const rows = new Map();  // user_id -> row
  let session = null;
  const client = {
    seen: [],
    rows,
    auth: {
      async signUp({ email, password }) {
        client.seen.push(password);
        if (users.has(email)) return { error: { message: 'User already registered' } };
        users.set(email, { id: `u-${users.size + 1}`, password });
        return { data: { session: null } };
      },
      async signInWithPassword({ email, password }) {
        client.seen.push(password);
        const u = users.get(email);
        if (!u || u.password !== password) return { error: { message: 'Invalid login credentials' } };
        session = { user: { id: u.id, email } };
        return { data: { session } };
      },
      async getSession() { return { data: { session } }; },
      async signOut() { session = null; },
    },
    from() {
      const q = { filters: {}, op: 'select', payload: null };
      const api = {
        select() { if (q.op === 'select') q.op = 'select'; return api; },
        eq(col, val) { q.filters[col] = val; return api; },
        async maybeSingle() { return { data: rows.get(q.filters.user_id) || null, error: null }; },
        async insert(row) {
          if (rows.has(row.user_id)) return { error: { message: 'duplicate key' } };
          rows.set(row.user_id, { ...row });
          return { error: null };
        },
        update(payload) { q.op = 'update'; q.payload = payload; return api; },
        then(resolve) {
          // update(...).eq().eq().select() wird awaited
          const row = rows.get(q.filters.user_id);
          if (!row || row.rev !== q.filters.rev) return resolve({ data: [], error: null });
          Object.assign(row, q.payload);
          return resolve({ data: [{ rev: row.rev }], error: null });
        },
      };
      return api;
    },
  };
  return client;
}

const cloud = await import('../src/cloud.js');
const server = fakeSupabase();
cloud.useClientForTests(server);

async function device(name) {
  globalThis.localStorage = storage();
  const s = await import(`../src/store.js?device=${name}`);
  s.load();
  return { s, ls: globalThis.localStorage };
}
const use = (d) => { globalThis.localStorage = d.ls; return d.s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Konto anlegen, Tresor hochladen: Server sieht weder Passwort noch Klartext', async () => {
  const a = await device('a');
  let s = use(a);
  assert.equal(s.store.mode, 'signedout');
  assert.deepEqual(await s.cloudSignUp('m@example.org', 'geheim-123'), { needsConfirmation: true });
  assert.deepEqual(await s.cloudSignIn('m@example.org', 'geheim-123', false), {});
  assert.equal(s.store.mode, 'vault');
  s.createBudget('Haushalt');
  await wait(50);
  s.update((d) => { d.goals.push({ id: 'g1', name: 'Urlaub Lissabon', target: 100000, saved: 2500 }); });
  await wait(1500); // Hochladen ist verzoegert
  const row = [...server.rows.values()][0];
  assert.ok(row.rev >= 2, 'Aenderung hochgeladen');
  assert.ok(!row.data.includes('Lissabon') && !row.data.includes('Haushalt'), 'nur verschluesselt auf dem Server');
  assert.ok(!server.seen.includes('geheim-123'), 'Server hat das Passwort nie gesehen');
  s = use(a);
  assert.ok(!JSON.stringify(a.ls.dump()).includes('Lissabon'), 'auch auf dem Geraet nur verschluesselt');
});

test('Zweites Geraet sieht nach dem Anmelden dieselben Budgets', async () => {
  const b = await device('b');
  const s = use(b);
  assert.deepEqual(await s.cloudSignIn('m@example.org', 'geheim-123', false), {});
  assert.deepEqual(s.store.budgets.map((x) => x.name), ['Mein Budget', 'Haushalt']);
  await s.switchBudget(s.store.budgets[1].id);
  assert.equal(s.store.data.goals[0].name, 'Urlaub Lissabon');
});

test('Falsches Passwort oeffnet nichts', async () => {
  const c = await device('c');
  const s = use(c);
  const r = await s.cloudSignIn('m@example.org', 'falsch-999', false);
  assert.match(r.error, /stimmt nicht/);
  assert.equal(s.store.mode, 'signedout');
});

test('Gleichzeitig geaendert: neuerer Server-Stand gewinnt, mit Hinweis', async () => {
  const a = await import('../src/store.js?device=a');
  const b = await import('../src/store.js?device=b');
  // Geraet B aendert und laedt hoch
  b.update((d) => { d.goals.push({ id: 'g2', name: 'Von B', target: 100, saved: 0 }); });
  await wait(1500);
  // Geraet A kennt den neuen Stand nicht und aendert ebenfalls
  a.update((d) => { d.goals.push({ id: 'g3', name: 'Von A', target: 100, saved: 0 }); });
  await wait(1700);
  assert.ok(a.store.cloud.notice, 'Hinweis auf Konflikt');
  assert.ok(a.store.data.goals.some((g) => g.name === 'Von B'), 'Stand von B ist da');
});

test('Offline entsperren mit der Kopie auf dem Geraet', async () => {
  const a = await import('../src/store.js?device=a');
  await a.cloudLock();
  assert.equal(a.store.mode, 'signedout');
  assert.match((await a.cloudUnlock('falsch', false)).error, /stimmt nicht/);
  assert.deepEqual(await a.cloudUnlock('geheim-123', false), {});
  assert.equal(a.store.mode, 'vault');
});
