// Netlify-Funktion fuer den Abgleich: erreichbar unter /.netlify/functions/vault.
// Die eigentliche Logik steht in server/vault-core.js; hier wird nur die
// Ablage (Netlify Blobs) angeschlossen.

import { getStore } from '@netlify/blobs';
import { handle } from '../../server/vault-core.js';

function blobs() {
  const store = getStore({ name: 'budgetplaner', consistency: 'strong' });
  return {
    async get(key) {
      const found = await store.getWithMetadata(key, { type: 'json' });
      return found ? { data: found.data, etag: found.etag } : null;
    },
    set: (key, data, options) => store.setJSON(key, data, options),
    delete: (key) => store.delete(key),
  };
}

export default async (request) => {
  if (request.method !== 'POST') return new Response('Nur POST', { status: 405 });
  let body;
  try {
    const text = await request.text();
    if (text.length > 5 * 1024 * 1024) return Response.json({ error: 'Zu viele Daten.' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const result = await handle(blobs(), body);
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
};
