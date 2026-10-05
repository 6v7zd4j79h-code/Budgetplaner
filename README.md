# Budgetplaner

Live: https://budget-kompass.netlify.app

Persönlicher Budgetplaner als Web-App (PWA). Vorbild ist eine Budget-Tabelle
im Stil von *budget.profi.store*, nur eben als App fürs Handy, Tablet und den PC.

**Alle Daten bleiben auf dem Gerät.** Es gibt keinen Login, keine Datenbank
und keinen Server, der Finanzdaten sieht. Gegen Datenverlust gibt es unter
„Sicherung“ eine Sicherungsdatei zum Herunterladen und Wiederherstellen.

## Was die App kann

| Bereich | Inhalt |
|---|---|
| **Übersicht** | Monats-Dashboard: verfügbarer Betrag als Ring, Cashflow *Budget gegen Ist* (Startbetrag, Einkommen, Rechnungen, Ausgaben, Ersparnisse, Schulden), Verteilung der Abgänge, Ausgaben je Kategorie mit Balken, offene Rechnungen, Abo-Summe, Sparziele |
| **Budget** | Monatstabelle zum Bearbeiten. Pro Zeile Haken, Name, Budget, Ist. Ein Haken ohne Ist-Betrag zählt das Budget. Zeilen hinzufügen und löschen |
| **Ausgaben** | Einzelne Ausgaben buchen (Datum, Kategorie, Notiz, Betrag). Die Summen landen automatisch als Ist im Budget. „Noch übrig“ je Kategorie |
| **Abos** | Abo-Tracker mit Kategorie und Abrechnung (monatlich, vierteljährlich, halbjährlich, jährlich), umgerechnet auf den Monat, Summe je Kategorie und im Jahr, Abos pausierbar |
| **Sparziele** | Ziel, gespart, Fortschritt in Prozent, schnell einzahlen |
| **Kontoauszug einlesen** | CSV von Sparkasse, Commerzbank, Revolut, PayPal, Stripe (und jede CSV mit Datum und Betrag). Die App sortiert vor, du prüfst. Zuordnungen werden gelernt, nichts wird doppelt gezählt. Startbetrag aus dem Saldo oder aus dem heutigen Kontostand. Alles nur im Browser. |
| **Kassenbon scannen** | Foto → Texterkennung auf dem Gerät (Tesseract) → Artikel prüfen, unnötige markieren, an vorhandene Buchung anhängen |
| **Unnötig** | Ganze Ausgaben oder einzelne Artikel als unnötig markieren; Überblick mit Summe, Anteil und größten Posten. Die App merkt sich Artikel. |
| **Budgets** | Mehrere getrennte Budgets, z. B. privat und Gemeinschaftskonto |
| **Sicherung** | Farbe wählen (Pflaume oder Blau), Sicherung als JSON-Datei speichern und wiederherstellen, Erinnerung nach 30 Tagen, alles löschen |

Monatswechsel oben im Kopf. Ein neuer Monat übernimmt die Zeilen und Budgets
des Vormonats ohne Haken, und als Startbetrag den tatsächlichen Restbetrag
des Vormonats. Der Startbetrag lässt sich auch fest eintragen.

Beträge werden intern in Cent gerechnet, also ohne Rundungsfehler. Eingaben
wie `12,50`, `12.50`, `1.234,56` oder `€ 9,99` werden verstanden.

## Lokal starten

```bash
npm install
npm test        # Rechenlogik, ohne Browser
npm run dev     # http://localhost:5173
```

## Veröffentlichen (Netlify)

1. Repository bei Netlify verbinden (*Add new site → Import an existing project*)
2. Die Einstellungen kommen aus `netlify.toml`. Umgebungsvariablen braucht es keine.
   Optional: `VITE_FARBE=blau` startet die App in Blau, mit blauem App-Icon
   und blauer Statusleiste. Ohne Angabe gilt Pflaume. Für beide Varianten
   lassen sich zwei Netlify-Seiten aus demselben Repository anlegen.
   Umschalten lässt sich die Farbe in der App jederzeit unter „Sicherung“.
3. Nach dem Deployment die Seite auf dem Handy öffnen und
   - **iPhone/iPad:** Safari → Teilen → „Zum Home-Bildschirm“
   - **Android:** Chrome → Menü ⋮ → „App installieren“

Wichtig: Die Daten hängen an der Adresse (Domain). Wer später auf eine andere
Adresse umzieht, nimmt die Daten per Sicherungsdatei mit.

## Aufbau

```
src/
  money.js        Beträge lesen und anzeigen (Cent)
  dates.js        Monate und Tage
  budget.js       die gesamte Rechenlogik, ohne Oberfläche
  store.js        Speicher (localStorage), Sicherung, Wiederherstellung
  palette.js      Farbschema Pflaume oder Blau, pro Gerät
  waste.js        unnötige Ausgaben: Summen, Lernen je Artikel
  receipt.js      Kassenbon-Text in Laden, Datum, Summe, Artikel zerlegen
  ocr.js          Texterkennung (Tesseract, lädt aus /ocr)
  import/         Kontoauszüge: CSV lesen, vorsortieren, übernehmen, Startbetrag
  main.js         Navigation, Monatswechsel, Ereignisse
  ui/             eine Datei pro Ansicht, dazu Diagramme (SVG) und Helfer
tests/            node --test
scripts/          Icons neu erzeugen (beide Farben)
```

Einzige Laufzeit-Abhängigkeit ist `tesseract.js` für den Bon-Scan. Programm und deutsches Sprachpaket
kopiert `scripts/copy-ocr.mjs` vor jedem Build nach `public/ocr` (nicht im Repository) und die App lädt
sie erst beim ersten Scan von der eigenen Adresse. Die App selbst ist rund 100 KB groß und läuft offline.
