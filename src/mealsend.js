// Einkaufsliste direkt an den Essensplan im Sternenplan schicken, statt sie
// zu kopieren und dort einzufuegen. Der Sternenplan hat dafuer einen
// "Briefkasten" (Netlify-Funktion); einmal pro Budget wird dessen Adresse und
// der Verbindungscode eingetragen, den der Sternenplan anzeigt.
//
//   data.mealPlanLink = { url: 'https://…netlify.app', code: '…', sentAt: ISO }
//
// Schnittstelle (im Sternenplan umzusetzen, siehe docs/essensplan-briefkasten.md):
//   POST {url}/.netlify/functions/einkauf-briefkasten
//   Authorization: Bearer {code}
//   { version: 1, source: 'budgetplaner', sentAt, from, to, text,
//     items: [{ name, count }], stock: [{ name, pieces, date }] }
//   Antwort 200 { ok: true }, 401 bei falschem Code.

import { mealPlanText } from './shopping.js';

export const DEFAULT_URL = 'https://miras-sternenplan.netlify.app';
export const PATH = '/.netlify/functions/einkauf-briefkasten';

export function mealLink(data) {
  const l = data.mealPlanLink || {};
  return { url: l.url || DEFAULT_URL, code: l.code || '', sentAt: l.sentAt || null };
}

export const linked = (data) => Boolean(mealLink(data).code);

// Adresse vereinheitlichen: https ergaenzen, Pfad und Schraegstrich am Ende weg.
export function cleanUrl(value) {
  let s = String(value || '').trim();
  if (!s) return DEFAULT_URL;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

export function mealPayload(r, now = new Date()) {
  return {
    version: 1,
    source: 'budgetplaner',
    sentAt: now.toISOString(),
    from: r.from,
    to: r.to,
    text: mealPlanText(r),
    items: r.items.map((i) => ({ name: i.name, count: i.count })),
    stock: r.stock.map((s) => ({ name: s.name, pieces: s.pieces, date: s.date })),
  };
}

// Schickt die Liste ab; wirft einen Fehler mit verstaendlicher Meldung.
export async function sendMealPlan(link, payload, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(link.url + PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${link.code}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Der Essensplan ist nicht erreichbar – kein Internet, oder der Sternenplan nimmt noch keine Listen an.');
  }
  if (response.status === 401 || response.status === 403) throw new Error('Der Verbindungscode passt nicht. Bitte im Sternenplan nachsehen und neu eintragen.');
  if (response.status === 404) throw new Error('Der Essensplan nimmt noch keine Listen an (Briefkasten fehlt).');
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Fehler ${response.status} beim Essensplan.`);
  }
  return true;
}
