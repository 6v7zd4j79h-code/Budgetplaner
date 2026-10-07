# Abgleich zwischen Geräten

Seit 07.10.2026 ohne zusätzlichen Anbieter: Die App speichert über eine
eigene Netlify-Funktion (`netlify/functions/vault.mjs`, Logik in
`server/vault-core.js`) in **Netlify Blobs**. Es muss nichts eingerichtet
werden – nach dem Deploy ist der Abgleich da.

## Wie sicher ist das?

- Alles wird **im Browser verschlüsselt** (AES-GCM, Schlüssel per PBKDF2 aus
  dem Passwort). Auf dem Server liegen nur unlesbare Daten.
- Der Server bekommt **nie das Passwort**, sondern einen daraus abgeleiteten
  Login-Wert, und speichert davon nur einen Hash. Die E-Mail-Adresse wird
  ebenfalls nur als Hash gespeichert.
- **Passwort vergessen = Daten weg.** Es gibt keine Bestätigungs-Mail und
  kein Zurücksetzen. Passwort im Passwort-Manager speichern.

## Konto und Geräte

1. In der App „Konto erstellen“ (E-Mail + Passwort). Budgets, die schon auf
   dem Gerät liegen, werden dabei übernommen.
2. Auf jedem weiteren Gerät mit denselben Daten anmelden.

## Gemeinsames Budget (z. B. Gemeinschaftskonto)

- Jede Person hat ihr **eigenes Konto** und ihre privaten Budgets.
- Unter „Sicherung“ → „Gemeinsam nutzen“ ein Budget **freigeben** und
  „Jemanden einladen“: Es erscheint ein Code (gilt einmal, 7 Tage).
- Die andere Person gibt den Code in ihrer App unter „Mit Code beitreten“
  ein. Danach sehen beide dieselben Daten.
- Technisch: Das gemeinsame Budget hat einen eigenen Schlüssel, der in den
  Tresoren beider Personen liegt. Der Code erreicht den Server nur als Hash.
- „Mein Budget“ bleibt immer privat. Wer ein gemeinsames Budget löscht,
  verlässt es nur; die anderen behalten es.

## Daten auf dem Server ansehen / löschen

Netlify → Site → **Blobs** → Store `budgetplaner`. Dort liegen `user/…`,
`vault/…`, `space/…` und `invite/…` – alles ohne lesbare Inhalte.
