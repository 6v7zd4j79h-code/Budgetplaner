// Kassenbon genau lesen mit Claude - nur als zweiter Schritt, wenn die
// eingebaute Texterkennung auf dem Geraet Preise nicht lesen konnte oder die
// Summe nicht aufgeht. Die App schickt die (verkleinerten) Fotos; zurueck
// kommen Laden, Datum, Summe und Artikel als JSON.
//
// Der API-Schluessel liegt nur als Umgebungsvariable ANTHROPIC_API_KEY bei
// Netlify. Damit niemand ueber die oeffentliche Seite das Guthaben
// verbraucht, gibt es ein Tageslimit (RECEIPT_AI_DAILY_LIMIT, Vorgabe 40).

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-haiku-5-5';
const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 6 * 1024 * 1024; // Base64
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shop', 'date', 'total_cents', 'items'],
  properties: {
    shop: { type: 'string', description: 'Laden, z. B. "ALDI SÜD"; leer, wenn nicht erkennbar' },
    date: { type: 'string', description: 'Datum des Einkaufs als JJJJ-MM-TT; leer, wenn nicht erkennbar' },
    total_cents: { type: 'integer', description: 'Endsumme des Bons in Cent; 0, wenn nicht erkennbar' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount_cents', 'article_no'],
        properties: {
          name: { type: 'string' },
          amount_cents: { type: 'integer' },
          article_no: { type: 'string' },
        },
      },
    },
  },
};

const PROMPT = `Lies diesen deutschen Kassenbon. Die Fotos zeigen ihn von oben nach unten; sie überlappen sich.

Regeln:
- Jeden gekauften Artikel genau einmal, in der Reihenfolge des Bons. Zeilen, die auf zwei Fotos zu sehen sind, nur einmal.
- Stornierte Artikel (Storno, Sofortstorno) weglassen – den stornierten Artikel und die Stornozeile.
- Mengen- und Gewichtszeilen ("2 x 1,19", "0,512 kg x 1,99 EUR/kg") gehören zum Artikel darüber: nimm den Zeilenbetrag des Artikels.
- Rabatte und Coupons direkt vom betreffenden Artikel abziehen. Pfand als eigener Artikel "Pfand", Leergut-Rückgabe als negativer Betrag.
- Keine Zahlungs-, Steuer-, Payback- oder Kundeninformationen.
- name: Artikelname so wie auf dem Bon, ohne Artikelnummer. article_no: die Artikelnummer vor dem Namen, sonst "".
- Beträge in Cent als ganze Zahl. total_cents: die Endsumme (SUMME, Betrag, zu zahlen).
- Prüfe zum Schluss, ob die Artikel zusammen die Endsumme ergeben. Wenn nicht, lies die betroffenen Zeilen noch einmal genau.`;

function today(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// limiter: { get(key) -> {data} | null, set(key, data) } (Netlify Blobs oder Speicher)
export async function handleReceiptAi(body, { apiKey = process.env.ANTHROPIC_API_KEY, client = null, limiter = null, limit = Number(process.env.RECEIPT_AI_DAILY_LIMIT) || 40, now = Date.now() } = {}) {
  if (!apiKey && !client) return { status: 503, body: { error: 'Das genaue Lesen ist noch nicht eingerichtet (kein API-Schlüssel bei Netlify).' } };
  const images = Array.isArray(body?.images) ? body.images : [];
  if (!images.length || images.length > MAX_IMAGES) return { status: 400, body: { error: `Bitte 1 bis ${MAX_IMAGES} Fotos schicken.` } };
  for (const img of images) {
    if (!TYPES.has(img?.media_type) || typeof img?.data !== 'string' || !img.data || img.data.length > MAX_IMAGE_CHARS) {
      return { status: 400, body: { error: 'Ein Foto ist ungültig oder zu groß.' } };
    }
  }

  if (limiter) {
    const key = `ki/${today(now)}`;
    const used = (await limiter.get(key).catch(() => null))?.data?.count || 0;
    if (used >= limit) return { status: 429, body: { error: 'Für heute ist das Tageslimit fürs genaue Lesen erreicht.' } };
    await limiter.set(key, { count: used + 1 }).catch(() => {});
  }

  const anthropic = client || new Anthropic({ apiKey });
  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // effort low: Ablesen braucht wenig Nachdenken, und Netlify-Funktionen
      // haben nur wenige Sekunden Zeit.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } })),
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { status: 503, body: { error: 'Der API-Schlüssel bei Netlify ist ungültig.' } };
    if (error instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'Gerade zu viele Anfragen – bitte gleich noch einmal versuchen.' } };
    if (error instanceof Anthropic.APIError && error.status === 400 && /credit|balance/i.test(error.message)) {
      return { status: 503, body: { error: 'Das Guthaben fürs genaue Lesen ist aufgebraucht.' } };
    }
    if (error instanceof Anthropic.APIError) return { status: 502, body: { error: `Claude ist gerade nicht erreichbar (${error.status}).` } };
    return { status: 502, body: { error: 'Claude ist gerade nicht erreichbar.' } };
  }

  if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'Der Bon konnte nicht gelesen werden.' } };
  if (response.stop_reason === 'max_tokens') return { status: 422, body: { error: 'Der Bon ist zu lang zum Lesen.' } };
  const text = response.content.find((b) => b.type === 'text')?.text || '';
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: 502, body: { error: 'Die Antwort war unleserlich.' } };
  }
  return { status: 200, body: normalize(data) };
}

// Nur saubere Werte an die App; negative Zeilen (Leergut, Rabatt ohne
// Artikel) werden vom Artikel davor abgezogen.
export function normalize(data) {
  const items = [];
  for (const it of Array.isArray(data?.items) ? data.items : []) {
    const amount = Number.isInteger(it?.amount_cents) ? it.amount_cents : 0;
    const name = String(it?.name || '').trim().slice(0, 80);
    if (amount < 0) {
      const prev = items[items.length - 1];
      if (prev && !/leergut|pfand/i.test(name)) { prev.amount = Math.max(0, prev.amount + amount); continue; }
    }
    if (!name) continue;
    items.push({ name, amount, ...(it.article_no ? { artNo: String(it.article_no).slice(0, 12) } : {}) });
  }
  return {
    shop: String(data?.shop || '').trim().slice(0, 40),
    date: /^\d{4}-\d{2}-\d{2}$/.test(data?.date || '') ? data.date : null,
    total: Number.isInteger(data?.total_cents) && data.total_cents > 0 ? data.total_cents : null,
    items,
    model: MODEL,
  };
}
