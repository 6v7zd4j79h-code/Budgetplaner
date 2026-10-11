// Netlify-Funktion: Kassenbon genau lesen (Claude). Erreichbar unter
// /.netlify/functions/receipt-ai. Logik in server/receipt-ai-core.js; hier
// wird nur das Tageslimit (Netlify Blobs) angeschlossen.

import { getStore } from '@netlify/blobs';
import { handleReceiptAi } from '../../server/receipt-ai-core.js';

function limiter() {
  const store = getStore({ name: 'bon-ki', consistency: 'strong' });
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
    if (text.length > 30 * 1024 * 1024) return Response.json({ error: 'Die Fotos sind zu groß.' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  const result = await handleReceiptAi(body, { limiter: limiter() });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
};
