// Eingelesene Buchungen vorsortieren: Wer bekommt Geld, wofuer, und in
// welchen Bereich des Budgets gehoert das? Die Regeln sind bewusst einfach
// und gut lesbar - die App schlaegt nur vor, entschieden wird in der
// Pruefansicht.

const RULES = [
  // Reihenfolge zaehlt: der erste Treffer gewinnt.
  { section: 'ignore', test: /umbuchung|übertrag|uebertrag|eigene[s]? konto|kontoübertrag|top-?up|aufladung|to eur|exchanged|zwischen eigenen/i },
  { section: 'bills', name: 'Rundfunkbeitrag', test: /rundfunk|beitragsservice|ard zdf|gez/i },
  { section: 'bills', name: 'Miete', test: /\bmiete\b|wohnungsbau|hausverwaltung|vermiet|kaltmiete|nebenkosten/i },
  { section: 'bills', name: 'Strom / Gas', test: /stadtwerke|strom|energie|eon\b|e\.on|vattenfall|enbw|rwe|gasag|tibber|octopus|ewr\b|pfalzwerke/i },
  { section: 'bills', name: 'Internet / Handy', test: /telekom|vodafone|o2\b|telefonica|1&1|congstar|freenet|unitymedia|aldi talk|fraenk|winsim|drillisch/i },
  { section: 'bills', name: 'Versicherungen', test: /versicherung|allianz|huk|debeka|ergo|axa|signal iduna|devk|r\+v|lvm|barmenia|generali|cosmos|hanse ?merkur|adac/i },
  { section: 'bills', name: 'Krankenkasse', test: /\baok\b|\btk\b|techniker krankenkasse|barmer|dak|ikk|bkk/i },
  { section: 'bills', name: 'Kontogebühren', test: /entgelt|kontoführung|kontofuehrung|kartengebühr|abschluss|rechnungsabschluss/i },
  { section: 'subscription', category: 'Unterhaltung', test: /netflix|spotify|disney|dazn|sky\b|wow\b|joyn|rtl\+|paramount|apple\.com\/bill|apple music|youtube|audible|kindle unlimited|deezer|amazon prime|prime video/i },
  { section: 'subscription', category: 'Produktivität', test: /microsoft|office 365|adobe|canva|notion|dropbox|google one|google workspace|chatgpt|openai|anthropic|claude/i },
  { section: 'subscription', category: 'Datenspeicher', test: /icloud|google storage/i },
  { section: 'subscription', category: 'Persönlichkeitsentwicklung', test: /blinkist|headspace|calm\b|babbel|duolingo|masterclass|udemy|skillshare|7mind/i },
  { section: 'subscription', category: 'Sicherheit', test: /nordvpn|expressvpn|surfshark|1password|bitwarden|norton|kaspersky/i },
  { section: 'subscription', category: 'Geschäft', test: /netlify|github|wix|squarespace|shopify|zapier|mailchimp|brevo|calendly|zoom\b|later\.com|linktree|elopage|digistore|copecart|ablefy/i },
  { section: 'savings', name: 'Sparen', test: /sparplan|tagesgeld|depot|trade republic|scalable|comdirect|sparkonto|bausparen|wertpapier|etf/i },
  { section: 'debts', name: 'Raten / Kredite', test: /klarna|ratenkauf|kredit|darlehen|tilgung|ratenzahlung|paypal ratenzahlung|santander|targobank|easycredit|barclays|advanzia/i },
  { section: 'expenses', name: 'Lebensmittel', test: /rewe|edeka|aldi|lidl|netto|penny|kaufland|globus|tegut|norma|real\b|hit\b|marktkauf|famila|denn'?s|alnatura|bäcker|baecker|metzger|wochenmarkt|hellofresh|flink|gorillas|knuspr|picnic/i },
  { section: 'expenses', name: 'Drogerie', test: /\bdm\b|dm-drogerie|rossmann|müller|mueller|budni|douglas|apotheke/i },
  { section: 'expenses', name: 'Tanken / Fahrkarten', test: /aral|shell|esso|total|jet\b|avia|agip|star tankstelle|tankstelle|deutsche bahn|db vertrieb|\bdb\b|flixbus|bvg|mvv|hvv|rnv|vrn|deutschlandticket|uber|bolt|free now|parken|parkhaus|easypark|apcoa/i },
  { section: 'expenses', name: 'Kleidung', test: /zalando|h&m|hm\.com|zara|c&a|primark|about you|tk maxx|deichmann|snipes|vinted|uniqlo|mango|esprit|s\.oliver|peek/i },
  { section: 'expenses', name: 'Freizeit', test: /kino|cinemaxx|cineplex|restaurant|cafe|café|bar\b|mcdonald|burger king|lieferando|wolt|starbucks|vapiano|eventim|ticket|thalia|hugendubel|steam|playstation|nintendo|fitness|mcfit|clever fit|urban sports/i },
  { section: 'expenses', name: 'Haushalt / Wohnen', test: /ikea|bauhaus|obi\b|hornbach|toom|tedi|action\b|depot\b|kik\b|woolworth|jysk|poco|xxxlutz|höffner/i },
  { section: 'expenses', name: 'Online-Shopping', test: /amazon|amzn|ebay|otto\b|temu|shein|aliexpress|etsy|koro|paypal/i },
];

export function normalizeName(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[0-9]{2,}/g, ' ')
    .replace(/\b(gmbh|ag|kg|se|co|ohg|e\.?k\.?|mbh|europe|s\.?a\.?r\.?l\.?|sarl|ltd|inc|deutschland|germany|de)\b/g, ' ')
    .replace(/[^a-zäöüß&+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Anzeigename: bekannte Marke ("REWE"), sonst der bereinigte Empfaenger.
function displayName(payee) {
  const words = String(payee || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
  return words || 'Unbekannt';
}

export function classify(transaction) {
  const haystack = `${transaction.payee} ${transaction.purpose} ${transaction.kind}`;
  if (transaction.amount > 0) {
    // Eingaenge: Gehalt, Honorar, Erstattung. Umbuchungen bleiben Umbuchungen.
    if (RULES[0].test.test(haystack)) return { section: 'ignore' };
    if (/gehalt|lohn|bezüge|bezuege|besoldung/i.test(haystack)) return { section: 'income', name: 'Gehalt' };
    if (/kindergeld|familienkasse/i.test(haystack)) return { section: 'income', name: 'Kindergeld' };
    if (/stripe|honorar|rechnung|invoice|elopage|digistore|copecart|ablefy/i.test(haystack)) return { section: 'income', name: 'Selbstständig' };
    if (/erstattung|rückzahlung|rueckzahlung|refund|gutschrift/i.test(haystack)) return { section: 'income', name: 'Erstattungen' };
    return { section: 'income', name: displayName(transaction.payee) };
  }
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return { section: rule.section, name: rule.name, category: rule.category };
  }
  return { section: 'expenses', name: 'Sonstiges' };
}

// Buchungen eines Monats zu Vorschlaegen buendeln: eine Zeile pro Empfaenger
// und Bereich. Eine Zeile mit drei REWE-Einkaeufen ist leichter zu pruefen
// als drei einzelne.
export function suggest(transactions, key, learned = {}) {
  const groups = new Map();
  for (const t of transactions) {
    if (!t.date.startsWith(key)) continue;
    const normalized = normalizeName(t.payee) || 'unbekannt';
    const auto = classify(t);
    // Was die Nutzerin frueher fuer diesen Empfaenger gewaehlt hat, geht vor.
    const remembered = learned[normalized];
    const guess = remembered ? { ...auto, ...remembered } : auto;
    const groupKey = `${normalized}|${t.amount > 0 ? 'in' : 'out'}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        normalized,
        label: displayName(t.payee),
        section: guess.section,
        name: guess.name || displayName(t.payee),
        category: guess.category || 'Sonstiges',
        include: guess.section !== 'ignore',
        incoming: t.amount > 0,
        total: 0,
        transactions: [],
        sources: new Set(),
      });
    }
    const g = groups.get(groupKey);
    g.total += Math.abs(t.amount);
    g.transactions.push(t);
    g.sources.add(t.source);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sources: [...g.sources] }))
    .sort((a, b) => b.total - a.total);
}

// Fingerabdruck einer Buchung, damit ein zweiter Import derselben Datei
// nichts doppelt eintraegt.
export function fingerprint(t) {
  return `${t.source}|${t.date}|${t.amount}|${normalizeName(t.payee)}`;
}

export function monthsIn(transactions) {
  const counts = {};
  for (const t of transactions) counts[t.date.slice(0, 7)] = (counts[t.date.slice(0, 7)] || 0) + 1;
  return Object.keys(counts).sort().map((key) => ({ key, count: counts[key] }));
}
