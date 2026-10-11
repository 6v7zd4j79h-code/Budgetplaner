// Netlify-Funktion fuer die Angebote: erreichbar unter /.netlify/functions/offers.
// Die Logik steht in server/offers-core.js; hier wird nur der Zwischenspeicher
// (Netlify Blobs) angeschlossen.

import { getStore } from '@netlify/blobs';
import { handleOffers } from '../../server/offers-core.js';

function cache() {
  const store = getStore({ name: 'angebote' });
  return {
    get: async (key) => {
      const data = await store.get(key, { type: 'json' });
      return data ? { data } : null;
    },
    set: (key, data) => store.setJSON(key, data),
  };
}

export default async (request) => {
  if (request.method !== 'POST') return new Response('Nur POST', { status: 405 });
  let body;
  try {
    const text = await request.text();
    if (text.length > 20 * 1024) return Response.json({ error: 'Zu viele Suchbegriffe.' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const result = await handleOffers(body, { cache: cache() });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
};
