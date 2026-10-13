# Auftrag für das Projekt Sternenplan: Briefkasten für die Einkaufsliste

> Diesen Text in einer Session im Projekt **Sternenplan** einfügen.
> Der Budgetplaner-Teil (Knopf „🍽 An den Essensplan schicken“) ist fertig.

## Ziel

Mareike drückt im Budgetplaner (budget-kompass.netlify.app) auf
„🍽 An den Essensplan schicken“. Die Liste landet im Sternenplan und steht
dort in der Karte **„🧾 Das haben wir da“**, auf jedem Gerät der Familie,
ohne Kopieren und Einfügen. Eine neue Liste **ersetzt** wie bisher beim
Einfügen den alten Stand.

## Was im Sternenplan zu bauen ist

1. **Netlify-Funktion `einkauf-briefkasten`**
   (`netlify/functions/einkauf-briefkasten.js`), erreichbar unter
   `https://miras-sternenplan.netlify.app/.netlify/functions/einkauf-briefkasten`.
2. **Verbindungscode:** zufällig, lang genug (z. B. 24 Zeichen), wird im
   Sternenplan beim Essensplan angezeigt („Mit Budgetplaner verbinden“),
   mit „Kopieren“ und „Neuen Code erzeugen“ (alter Code gilt dann nicht
   mehr). Gespeichert wird serverseitig nur ein Hash.
3. **Ablage:** die eingegangene Liste in Supabase (gehört zur Familie), so
   dass alle Geräte sie sehen.
4. **Anzeige:** Beim Öffnen/Zurückkehren holt der Essensplan die neue Liste
   und übernimmt sie wie ein Einfügen in „Das haben wir da“ (gleiche
   Zuordnung Bon-Name → Zutat, gleiche Nachfrage bei Unbekanntem). Hinweis
   „Neue Einkaufsliste vom 13.10., 14:05“.

## Schnittstelle (so schickt der Budgetplaner)

```
POST /.netlify/functions/einkauf-briefkasten
Content-Type: application/json
Authorization: Bearer <Verbindungscode>

{
  "version": 1,
  "source": "budgetplaner",
  "sentAt": "2026-10-13T12:05:00.000Z",
  "from": "2026-10-07",
  "to": "2026-10-13",
  "text": "Eingekauft 07.10.–13.10.:\n- Butter (2×)\n…\n\nAuf Vorrat (vermutlich noch da):\n- Nudeln (4×, 20.09.)",
  "items": [{ "name": "Butter", "count": 2 }],
  "stock": [{ "name": "Nudeln", "pieces": 4, "date": "2026-09-20" }]
}
```

- `text` ist genau das, was bisher kopiert wurde – der vorhandene
  Einfüge-Leser kann es unverändert verarbeiten. `items`/`stock` sind
  dieselben Daten strukturiert, falls das einfacher ist.
- Keine Preise, Läden oder Konten.

Antworten, die der Budgetplaner versteht:

| Status | Bedeutung | Anzeige im Budgetplaner |
|---|---|---|
| 200 `{ "ok": true }` | angekommen | „✓ Im Essensplan angekommen“ |
| 401 | Code falsch/abgelaufen | „Der Verbindungscode passt nicht …“ |
| 400 / 413 `{ "error": "…" }` | Inhalt ungültig / zu groß | Text aus `error` |

## CORS (wichtig)

Der Aufruf kommt aus dem Browser von einer anderen Adresse. Die Funktion muss
`OPTIONS` beantworten und bei allen Antworten (auch Fehlern) senden:

```
Access-Control-Allow-Origin: https://budget-kompass.netlify.app
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

Zum Testen am Mac zusätzlich `http://localhost:5173` erlauben.

## Grenzen

- Größe begrenzen (z. B. 50 KB), nur `version: 1` annehmen.
- Code mit konstantem Vergleich prüfen (Hash vergleichen).
- Kein Abhaken im Budgetplaner, Verbrauch weiter nur über „✓ Gekocht“.

## Im Budgetplaner einrichten

Ausgaben → Regelmäßige Einkäufe → Karte „🍽 Für den Essensplan“:
Verbindungscode eintragen (Adresse ist schon vorausgefüllt) → „Verbinden“.
Danach gibt es den Knopf in der Übersicht, unter Ausgaben und auf dieser Karte.
