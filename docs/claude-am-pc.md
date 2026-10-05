# Auftrag für Claude auf dem PC: Startdatei aus Kontoauszügen

Diesen Text komplett in Claude auf dem PC einfügen und den Ordner mit den
Kontoauszügen freigeben.

---

Im freigegebenen Ordner liegen meine Kontoauszüge (Sparkasse, Commerzbank,
Revolut, PayQuicker, PayPal, Stripe). Bitte:

1. **Nimm nur den Monat {MONAT, z. B. September 2026}** und nur meine privaten
   Konten. Das **Gemeinschaftskonto** (zweite Sparkasse) bekommt eine eigene,
   getrennte Datei.
2. **Sortiere jede Buchung** in einen dieser Bereiche:
   - **Einkommen**: Gehalt, Honorare, sonstige Eingänge
   - **Rechnungen**: Miete, Strom, Gas, Internet, Handy, Versicherungen,
     Rundfunkbeitrag, und auch Abos
   - **Ausgaben**, mit Kategorie: Lebensmittel, Drogerie, Tanken / Fahrkarten,
     Freizeit, Kleidung, Sonstiges
   - **Ersparnisse**: Sparpläne, Überweisungen aufs Sparkonto
   - **Schulden**: Kredite, Raten, Klarna
   - **Ignorieren**: Umbuchungen zwischen meinen eigenen Konten, PayPal-
     Aufladungen von der Bank (sonst zählt alles doppelt)
3. **Zeig mir die Liste zur Kontrolle**, bevor du die Datei schreibst.
4. **Schreib die Datei `budget-start.json`** in genau diesem Format
   (Beträge in **ganzen Cent**, also 12,50 € = `1250`):

```json
{
  "version": 1,
  "months": {
    "2026-09": {
      "startBalance": 31000,
      "lines": {
        "income":   [{ "id": "gehalt", "name": "Gehalt", "budget": 298000, "actual": 298000, "done": true }],
        "bills":    [{ "id": "miete",  "name": "Miete",  "budget": 75000,  "actual": 75000,  "done": true }],
        "expenses": [{ "id": "lebensmittel", "name": "Lebensmittel", "budget": 40000, "actual": null, "done": false }],
        "savings":  [],
        "debts":    []
      }
    }
  },
  "log": [
    { "id": "b1", "date": "2026-09-03", "lineId": "lebensmittel", "note": "REWE", "amount": 4512 }
  ],
  "subscriptions": [
    { "id": "netflix", "name": "Netflix", "category": "Unterhaltung", "interval": "monthly", "amount": 1399, "active": true }
  ],
  "goals": []
}
```

Regeln für das Format:
- Jede `id` ist eindeutig (kurzer Text ohne Leerzeichen).
- **Ausgaben** stehen einzeln im `log`. `lineId` zeigt auf die `id` der
  Kategorie unter `expenses`. Das `actual` der Ausgaben-Kategorien bleibt
  `null`, die App rechnet es aus dem Log.
- Bei Einkommen, Rechnungen, Ersparnissen und Schulden gilt: `actual` ist der
  echte Betrag, `done: true`. Als `budget` dient derselbe Betrag.
- Als Budget je Ausgaben-Kategorie nimmst du die Summe des Monats, aufgerundet
  auf volle 10 €.
- `startBalance` ist der Kontostand am Monatsanfang, falls erkennbar, sonst `null`.
- Abo-Kategorien: Unterhaltung, Produktivität, Geschäft,
  Persönlichkeitsentwicklung, Datenspeicher, Sicherheit, Sonstiges.
  Intervall: `monthly`, `quarterly`, `halfyearly` oder `yearly`.
- Alle Beträge positiv, auch Ausgaben.

5. **Lade nichts hoch** und kopier die Auszüge nirgendwohin. Die Datei
   `budget-start.json` bleibt im Ordner.

Ich öffne danach https://budget-kompass.netlify.app und spiele die Datei unter
**Sicherung → „Sicherung wiederherstellen“** ein. Achtung: Das ersetzt alles,
was bis dahin in der App steht.
