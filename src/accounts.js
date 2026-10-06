// Konten innerhalb eines Budgets (Sparkasse, Consors, PayPal, Klarna ...).
// Rein rechnerisch, ohne Oberflaeche - laesst sich mit `npm test` pruefen.
//
// Ein Konto:
//   { id, name, overdraft: Cent, business: bool, closed: bool,
//     balance: Cent | null, balanceDate: 'JJJJ-MM-TT' | null,
//     openings: { 'JJJJ-MM': Cent } }   // Kontostand am Monatsersten
//
// Buchungen (log) und Budgetzeilen koennen ein accountId tragen. Ohne
// accountId zaehlen sie nur in der Ansicht "Alle Konten".

export const ALL = 'alle';

export function accountsOf(data) {
  return Array.isArray(data.accounts) ? data.accounts : [];
}

// Kredite sind Konten mit kind: 'loan' und zusaetzlich
//   { original: Cent, rate: Cent pro Monat, interest: Prozent, end: 'JJJJ-MM',
//     endNote: Text, payer: Text }
// Sie stehen getrennt von den Konten - sonst verschwaende der Dispo in einer
// Summe aus Hauskredit und Girokonto.
export function isLoan(account) {
  return account.kind === 'loan';
}

export function activeAccounts(data) {
  return accountsOf(data).filter((a) => !a.closed && !isLoan(a));
}

export function loansOf(data) {
  return accountsOf(data).filter((a) => isLoan(a) && !a.closed);
}

export function loansSummary(loans) {
  return {
    total: loans.reduce((s, l) => s + Math.max(0, -(l.balance || 0)), 0),
    monthly: loans.reduce((s, l) => s + (l.rate || 0), 0),
    count: loans.length,
  };
}

// Anteil, der schon getilgt ist (0..1).
export function loanProgress(loan) {
  if (!loan.original || loan.balance == null) return 0;
  return Math.max(0, Math.min(1, 1 - (-loan.balance) / loan.original));
}

// Spielraum bis zur Dispo-Grenze. Bei 4.500 € Dispo und -3.000 € Stand: 1.500 €.
export function overdraftRoom(account) {
  if (account.balance == null) return null;
  return account.balance + (account.overdraft || 0);
}

export function balancesSummary(accounts) {
  const known = accounts.filter((a) => a.balance != null && !isLoan(a));
  return {
    total: known.reduce((s, a) => s + a.balance, 0),
    room: known.reduce((s, a) => s + overdraftRoom(a), 0),
    // Minus auf Konten mit Dispo-Rahmen ...
    overdraftUsed: known.filter((a) => a.overdraft > 0).reduce((s, a) => s + Math.max(0, -a.balance), 0),
    // ... und Minus ohne Dispo, z. B. offene Klarna-Betraege.
    otherDebt: known.filter((a) => !(a.overdraft > 0)).reduce((s, a) => s + Math.max(0, -a.balance), 0),
    known: known.length,
  };
}

// Startbetrag eines Monats aus den Kontostaenden am Monatsersten. null, wenn
// fuer diesen Monat kein Konto einen Stand hat.
export function openingSum(accounts, key) {
  const withOpening = accounts.filter((a) => a.openings && a.openings[key] != null);
  if (!withOpening.length) return null;
  return withOpening.reduce((s, a) => s + a.openings[key], 0);
}

// Sparziel, das an ein Konto gebunden ist ("Dispo ausgleichen"): gespart ist,
// was vom Minus seit dem Anlegen schon weg ist.
export function resolveGoal(goal, accounts) {
  if (!goal.accountId) return goal;
  const account = accounts.find((a) => a.id === goal.accountId);
  if (!account || account.balance == null) return goal;
  const debt = Math.max(0, -account.balance);
  return { ...goal, saved: Math.max(0, goal.target - debt), linked: account.name };
}

// Sicht auf ein Budget, eingeschraenkt auf ein Konto. Die Zeilen- und
// Buchungsobjekte bleiben dieselben, nur die Auswahl ist gefiltert - so
// rechnet budget.js unveraendert, und Aenderungen wirken aufs Original.
export function viewFor(data, accountId) {
  const accounts = accountsOf(data);
  const goals = data.goals.map((g) => resolveGoal(g, accounts));
  if (!accountId || accountId === ALL) {
    if (!accounts.length) return { ...data, goals };
    // Ohne fest eingetragenen Startbetrag: Summe der Kontostaende am Monatsersten.
    const months = {};
    for (const [key, month] of Object.entries(data.months)) {
      const opening = month.startBalance == null ? openingSum(accounts, key) : null;
      months[key] = opening == null ? month : { ...month, startBalance: opening };
    }
    return { ...data, months, goals };
  }

  const account = accounts.find((a) => a.id === accountId);
  const months = {};
  for (const [key, month] of Object.entries(data.months)) {
    const lines = {};
    for (const [section, list] of Object.entries(month.lines)) {
      lines[section] = list.filter((l) => l.accountId === accountId || (section === 'expenses' && !l.accountId));
    }
    const opening = account?.openings?.[key];
    months[key] = { ...month, startBalance: opening != null ? opening : null, lines };
  }
  return {
    ...data,
    months,
    log: data.log.filter((e) => e.accountId === accountId),
    goals: goals.filter((g) => !g.accountId || g.accountId === accountId),
  };
}

export function accountId(name, existing) {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'konto';
  let id = base;
  for (let n = 2; existing.some((a) => a.id === id) || id === ALL; n += 1) id = `${base}-${n}`;
  return id;
}
