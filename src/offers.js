// Angebots-Check: Aus Stammartikeln, anstehenden Anlaessen und eigenen
// Suchwoertern wird eine Merkliste. Die Netlify-Funktion holt dazu die
// Angebote der Woche (nur Postleitzahl + Suchwoerter verlassen das Geraet),
// gefiltert und sortiert wird hier: nur eigene Laeden, Bio bevorzugt oder
// verlangt, Ausschluesse.
//
// Einstellungen im Budget (verschluesselt mit abgeglichen):
//   data.offerSettings = {
//     zip: '12345',
//     shops: ['aldi-sued', 'lidl', ...],
//     bio: 'prefer' | 'only' | 'any',
//     terms: [{ term: 'Schokolade', quality: true }],   eigene Suchwoerter
//     hidden: ['bananen'],                               abgewaehlte Vorschlaege
//     exclude: 'Milka, Light',
//   }

import { todayISO } from './dates.js';
import { upcomingOccasions } from './occasions.js';

export const SHOPS = [
  { id: 'aldi-sued', name: 'ALDI SÜD', match: /aldi[\s-]*s(ü|ue|u)d/i },
  { id: 'aldi-nord', name: 'ALDI Nord', match: /aldi[\s-]*nord/i },
  { id: 'lidl', name: 'Lidl', match: /\blidl\b/i },
  { id: 'edeka', name: 'EDEKA', match: /edeka|e[\s-]?center/i },
  { id: 'rewe', name: 'REWE', match: /\brewe\b/i },
  { id: 'penny', name: 'PENNY', match: /\bpenny\b/i },
  { id: 'netto', name: 'Netto', match: /\bnetto\b/i },
  { id: 'kaufland', name: 'Kaufland', match: /kaufland/i },
  { id: 'norma', name: 'Norma', match: /\bnorma\b/i },
  { id: 'globus', name: 'Globus', match: /\bglobus\b/i },
  { id: 'rossmann', name: 'Rossmann', match: /rossmann/i },
  { id: 'dm', name: 'dm', match: /^dm\b|dm[\s-]*drogerie/i },
  { id: 'mueller', name: 'Müller', match: /m(ü|ue)ller/i },
  { id: 'tedi', name: 'TEDi', match: /\btedi\b/i },
  { id: 'centershop', name: 'CENTERSHOP', match: /center[\s-]*shop/i },
  { id: 'action', name: 'Action', match: /^action\b/i },
];

export const DEFAULT_SHOPS = ['aldi-sued', 'lidl', 'edeka', 'rewe', 'rossmann', 'dm'];

export function offerSettings(data) {
  const s = data.offerSettings || {};
  return {
    zip: s.zip || '',
    shops: Array.isArray(s.shops) ? s.shops : DEFAULT_SHOPS,
    bio: ['prefer', 'only', 'any'].includes(s.bio) ? s.bio : 'prefer',
    terms: Array.isArray(s.terms) ? s.terms : [],
    hidden: Array.isArray(s.hidden) ? s.hidden : [],
    exclude: s.exclude || '',
  };
}

// Bio-Siegel und Bio-Eigenmarken der Ketten (ALDI "Nur Nur Natur" und
// "GutBio", Lidl "Bioland", REWE Bio, dmBio, Rossmann enerBiO ...).
const BIO = /\bbio\b|\bbio[\s-]|[a-zäöü]bio\b|nur\s*nur\s*natur|gut\s*bio|demeter|bioland|naturland|biokreis|alnatura|ökologisch|oekologisch|öko\b|organic|enerbio|dmbio|biotrend/i;
// Fuer "hochwertig" (z. B. Schokolade) zaehlt neben Bio auch fairer Handel.
const QUALITY = /fair\s*trade|fairtrade|gepa|vivani|rapunzel|zotter|naturata|fairglobe|one\s*world/i;

export const isBio = (offer) => BIO.test(`${offer.title} ${offer.brand} ${offer.description}`);
export const isQuality = (offer) => isBio(offer) || QUALITY.test(`${offer.title} ${offer.brand} ${offer.description}`);

export function shopOf(offer) {
  const text = `${offer.retailer} ${offer.retailerKey}`;
  return SHOPS.find((s) => s.match.test(offer.retailer) || s.match.test(offer.retailerKey) || s.match.test(text)) || null;
}

// Woerter, die auf dem Bon stehen, aber nicht das Produkt sind.
const STOP = new Set(`bio jung mittelalt alt scheiben scheibe stk stueck stück st x gesalzen ungesalzen zart kernig fein
  grob frisch frische natur classic klassisch original mini maxi groß gross klein light extra premium hell dunkel
  rot gelb grün gruen weiss weiß und mit ohne der die das im in vom von fuer für pack packung beutel dose glas flasche
  becher tafel stange rispen lose kg g ml l sensitive sensitiv vollfett halbfett fettarm laktosefrei mild würzig
  wuerzig gerieben am stueck geschnitten tiefgekühlt tk nr`.split(/\s+/));

// "Koro Erdnussbutter Gesalzen" -> "Erdnussbutter", "Gouda Jung Scheiben" -> "Gouda".
export function searchTerm(name) {
  const words = String(name || '')
    .replace(/\d+([.,]\d+)?\s*(%|g|kg|ml|l|x|st|stk)?/gi, ' ')
    .split(/[^a-zA-ZäöüÄÖÜß]+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
  if (!words.length) return '';
  const best = words.reduce((a, b) => (b.length > a.length ? b : a));
  return best[0].toUpperCase() + best.slice(1).toLowerCase();
}

// Was hinter Notizen wie "Kuchenzutaten" steckt.
const NEEDS = [
  [/kuchen|backzutat|backen|torte/i, ['Mehl', 'Zucker', 'Butter', 'Eier', 'Backpulver', 'Sahne']],
  [/plätzchen|plaetzchen|kekse/i, ['Mehl', 'Butter', 'Zucker', 'Puderzucker', 'Mandeln', 'Kuvertüre']],
  [/süß|suess|süssigkeit|schoko|osternest|nikolaus/i, ['Schokolade']],
  [/mittagessen|mittags|kochen/i, ['Nudeln', 'Reis', 'Kartoffeln', 'Tomatensoße', 'Hackfleisch']],
  [/raclette/i, ['Raclettekäse']],
  [/fondue/i, ['Fondue']],
  [/getränk|getraenk/i, ['Saft', 'Mineralwasser']],
  [/snack/i, ['Chips', 'Nüsse']],
  [/eier\b/i, ['Eier']],
  [/mandarinen/i, ['Mandarinen']],
  [/nüsse|nuesse/i, ['Nüsse']],
  [/festessen|braten/i, ['Braten']],
  [/deko/i, []],
];

export function occasionTerms(note) {
  const out = [];
  for (const part of String(note || '').split(/[,;/+]|\bund\b|–|-\s/)) {
    const text = part.trim();
    if (!text) continue;
    const rules = NEEDS.filter(([re]) => re.test(text));
    if (rules.length) rules.forEach(([, words]) => out.push(...words));
    else if (text.split(/\s+/).length <= 2) out.push(text);
  }
  return [...new Set(out)];
}

// Die Merkliste: woher kommt welcher Suchbegriff?
//   { term, key, sources: ['regular'|'occasion'|'own'], usual: { price, shop }, occasions: [...], quality }
export function watchlist(data, regular, { today = todayISO(), maxRegular = 25 } = {}) {
  const s = offerSettings(data);
  const hidden = new Set(s.hidden.map((h) => h.toLowerCase()));
  const list = new Map();
  const add = (term, patch) => {
    const key = term.toLowerCase();
    if (!term || hidden.has(key)) return;
    const entry = list.get(key) || { term, key, sources: [], occasions: [], usual: null, quality: false };
    if (patch.source && !entry.sources.includes(patch.source)) entry.sources.push(patch.source);
    if (patch.usual && !entry.usual) entry.usual = patch.usual;
    if (patch.occasion && !entry.occasions.includes(patch.occasion)) entry.occasions.push(patch.occasion);
    if (patch.quality) entry.quality = true;
    list.set(key, entry);
  };

  for (const t of s.terms) add(String(t.term || '').trim(), { source: 'own', quality: !!t.quality });
  for (const item of (regular?.items || []).slice(0, maxRegular)) {
    add(searchTerm(item.name), { source: 'regular', usual: { price: item.lastPrice, shop: item.lastShop, name: item.name } });
  }
  for (const o of upcomingOccasions(data, { today }).filter((x) => x.soon)) {
    for (const term of occasionTerms(o.note)) add(term, { source: 'occasion', occasion: o.name });
  }
  return [...list.values()];
}

function excluded(offer, exclude) {
  const words = String(exclude || '').split(/[,;]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const text = `${offer.title} ${offer.brand} ${offer.description}`.toLowerCase();
  return words.some((w) => text.includes(w));
}

// Treffer pro Suchbegriff: nur gewaehlte Laeden, noch gueltig, Bio-Regel,
// Ausschluesse. Sortiert: Bio zuerst (falls bevorzugt), dann billigster Preis.
export function matchOffers(results, list, settings, { today = todayISO() } = {}) {
  const shops = new Set(settings.shops);
  const seen = new Set();
  const groups = [];
  for (const entry of list) {
    const offers = [];
    for (const raw of results?.[entry.term] || []) {
      const shop = shopOf(raw);
      if (!shop || !shops.has(shop.id)) continue;
      if (raw.to && raw.to < today) continue;
      if (raw.price == null) continue;
      if (excluded(raw, settings.exclude)) continue;
      const bio = isBio(raw);
      if (entry.quality ? !isQuality(raw) : settings.bio === 'only' && !bio) continue;
      const id = `${entry.key}:${raw.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const saving = entry.usual && raw.price < entry.usual.price ? entry.usual.price - raw.price : 0;
      offers.push({ ...raw, shop: shop.name, bio, saving });
    }
    offers.sort((a, b) => (settings.bio === 'prefer' && a.bio !== b.bio ? (a.bio ? -1 : 1) : a.price - b.price));
    if (offers.length) groups.push({ ...entry, offers });
  }
  // Erst was ihr regelmaessig kauft und guenstiger ist, dann Anlaesse, dann der Rest.
  const rank = (g) => (g.offers.some((o) => o.saving > 0) ? 0 : g.sources.includes('occasion') ? 1 : g.sources.includes('own') ? 2 : 3);
  return groups.sort((a, b) => rank(a) - rank(b));
}

// Kalenderwoche fuer "diese Woche schon geprueft?".
export function weekKey(iso = todayISO()) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
