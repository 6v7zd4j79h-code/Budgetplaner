// Angebote aus den Prospekten der Laeden in der Naehe - ueber marktguru.de,
// das die Prospekte aller grossen Ketten nach Postleitzahl sammelt. Es gibt
// keine offizielle Schnittstelle; die Schluessel stehen auf der Startseite
// von marktguru.de (so machen es auch bekannte freie Bibliotheken). Aendert
// marktguru etwas, kommt hier ein Fehler statt Angeboten.
//
// Der Server bekommt nur Postleitzahl und Suchwoerter ("Butter", "Mehl") -
// nichts aus dem verschluesselten Budget. Gefiltert (Laeden, Bio) wird in
// der App. Ergebnisse werden einige Stunden zwischengespeichert, damit
// marktguru nicht bei jedem Oeffnen gefragt wird.

const HOME = 'https://www.marktguru.de/';
const API = 'https://api.marktguru.de/api/v1/offers/search';
const KEYS_TTL = 6 * 3600 * 1000;
const RESULT_TTL = 6 * 3600 * 1000;
export const MAX_TERMS = 40;
const PER_TERM = 60;

let memoryKeys = null; // { apiKey, clientKey, at }

export function parseKeys(html) {
  const regex = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      const config = JSON.parse(m[1])?.config;
      if (config?.apiKey && config?.clientKey) return { apiKey: config.apiKey, clientKey: config.clientKey };
    } catch { /* naechstes Skript */ }
  }
  return null;
}

async function getKeys(fetchFn, now) {
  if (memoryKeys && now - memoryKeys.at < KEYS_TTL) return memoryKeys;
  const response = await fetchFn(HOME, { headers: { 'User-Agent': 'Mozilla/5.0 (Budgetplaner)', Accept: 'text/html' } });
  if (!response.ok) throw new Error(`marktguru.de antwortet mit ${response.status}`);
  const keys = parseKeys(await response.text());
  if (!keys) throw new Error('Schlüssel auf marktguru.de nicht gefunden');
  memoryKeys = { ...keys, at: now };
  return memoryKeys;
}

const cents = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null);

// Nur das, was die App braucht.
export function compactOffer(o) {
  const advertiser = (o.advertisers || [])[0] || {};
  const validity = (o.validityDates || [])[0] || {};
  const unit = o.unit?.shortName || o.unit?.name || '';
  return {
    id: String(o.id),
    title: o.product?.name || o.description || '',
    brand: o.brand?.name || '',
    description: o.description || '',
    retailer: advertiser.name || '',
    retailerKey: advertiser.uniqueName || '',
    price: cents(o.price),
    oldPrice: cents(o.oldPrice),
    refPrice: cents(o.referencePrice),
    unit,
    from: validity.from ? String(validity.from).slice(0, 10) : null,
    to: validity.to ? String(validity.to).slice(0, 10) : null,
    card: Boolean(o.requiresLoyalityMembership || o.requiresLoyaltyMembership),
    image: o.id ? `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/small.jpg` : null,
  };
}

export function cleanTerms(terms) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(terms) ? terms : []) {
    const term = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = term.toLowerCase();
    if (term.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

// cache: { get(key) -> {data} | null, set(key, data) } (Netlify Blobs oder Speicher)
export async function handleOffers(body, { fetch: fetchFn = fetch, cache = null, now = Date.now() } = {}) {
  const zip = String(body?.zip || '');
  if (!/^\d{5}$/.test(zip)) return { status: 400, body: { error: 'Bitte eine fünfstellige Postleitzahl angeben.' } };
  const terms = cleanTerms(body?.terms);
  if (!terms.length) return { status: 400, body: { error: 'Keine Suchbegriffe.' } };

  const results = {};
  const failed = [];
  let keys = null;

  const lookup = async (term) => {
    const cacheKey = `offers/${zip}/${term.toLowerCase()}`;
    const hit = cache ? await cache.get(cacheKey).catch(() => null) : null;
    if (hit?.data && now - hit.data.at < RESULT_TTL) {
      results[term] = hit.data.offers;
      return;
    }
    try {
      keys = keys || await getKeys(fetchFn, now);
      const url = `${API}?${new URLSearchParams({ as: 'web', q: term, zipCode: zip, limit: String(PER_TERM), offset: '0' })}`;
      const response = await fetchFn(url, { headers: { 'x-apikey': keys.apiKey, 'x-clientkey': keys.clientKey, Accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) memoryKeys = null; // beim naechsten Mal neue Schluessel holen
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      const offers = (data?.results || []).map(compactOffer);
      results[term] = offers;
      if (cache) await cache.set(cacheKey, { at: now, offers }).catch(() => {});
    } catch (error) {
      failed.push(term);
      results[term] = [];
      if (/Schlüssel|marktguru\.de antwortet/.test(error.message)) throw error;
    }
  };

  try {
    // Hoechstens vier Anfragen gleichzeitig.
    const queue = [...terms];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) await lookup(queue.shift());
    }));
  } catch (error) {
    return { status: 502, body: { error: `Die Angebote sind gerade nicht erreichbar (${error.message}).` } };
  }
  if (failed.length === terms.length) {
    return { status: 502, body: { error: 'Die Angebote sind gerade nicht erreichbar. Bitte später noch einmal versuchen.' } };
  }
  return { status: 200, body: { zip, at: new Date(now).toISOString(), results, failed } };
}

// Fuer Tests.
export function resetKeys() {
  memoryKeys = null;
}
