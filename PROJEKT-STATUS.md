# Projektstand

> Diese Datei ist das Gedächtnis des Projekts. `/start` liest sie,
> `/shutdown` schreibt sie fort. Immer aktuell halten.

## Aktueller Stand

**Letzte Sitzung:** 2026-10-03 / 05 (05.10.: Mac-Arbeitskopie und interne Sicherung eingerichtet)

Neue, eigenständige App, unabhängig von Miras Sternenplan. Vorbild ist ein
Instagram-Reel von *budget.profi.store*, das eine Budget-Tabelle zeigt
(Monats-Dashboard, Rechnungen zum Abhaken, Ausgaben-Log, Ringdiagramme,
Sparziele, Abo-Tracker).

Entscheidungen:
- **Nur ein Gerät, keine Datenbank.** Alles liegt im localStorage, gesichert
  wird per Sicherungsdatei. Kein Login, keine Zugangsdaten nötig.
- Gleicher Technik-Stapel wie beim Sternenplan: Vite, reines JavaScript, PWA.

Erledigt:
- Übersicht, Budget, Ausgaben-Log, Abo-Tracker, Sparziele, Sicherung
- Startbetrag wird automatisch aus dem Ist-Rest des Vormonats übernommen
- Heller und dunkler Modus, Handy-Layout mit Navigation unten
- Tests der Rechenlogik (`npm test`)
- Im Browser durchgespielt (Handy 390 px und Desktop 1280 px): Budget
  ausfüllen, abhaken, Ausgaben buchen, Abos, Sparziele, Neuladen,
  Monatswechsel mit Übertrag, Sicherung exportieren und auf einem
  zweiten „Gerät“ importieren. Kein Querscrollen, keine Konsolenfehler.

Farben: zuerst Blau, dann auf Wunsch **Pflaume/Rosé** als Standard, dazu eine
**blaue Variante** („Männer-Version“) und eine **graue im Büro-Stil** (eckiger, ohne Schatten). Umschaltbar in der App unter „Sicherung“
(gilt pro Gerät). Mit `VITE_FARBE=blau` beim Build startet die App blau,
inklusive blauem Icon und blauer Statusleiste.

Am 05.10. ergänzt (Wunsch: sehen, wo Geld für Unnötiges hingeht):
- **Kontoauszug einlesen** (CSV, nur im Browser): Sparkasse, Commerzbank,
  Revolut, PayPal, Stripe, jede andere CSV mit Datum und Betrag (z. B.
  PayQuicker). Vorsortieren, prüfen, lernen, keine Doppelzählung.
  **Startbetrag** aus Saldo-Spalte, Kontostand im Dateikopf oder aus dem
  heutigen Kontostand zurückgerechnet (Sparkasse/Commerzbank).
- **Unnötig markieren**: ganze Buchung oder einzelne Artikel; Überblick
  im Ausgaben-Bereich und als Kachel; App merkt sich Artikel.
- **Kassenbon scannen** mit Texterkennung auf dem Gerät (Tesseract,
  deutsches Sprachpaket), hängt sich an passende Buchung an.
- **Mehrere Budgets** (z. B. Gemeinschaftskonto), getrennt gespeichert.
- `docs/claude-am-pc.md`: Auftrag für Claude am Mac/PC, falls die
  Auszüge dort ausgewertet werden sollen (Weg B).
- 44 Tests; Import, Bon-Scan (mit echtem Bild), Budgets im Browser geprüft.

Nicht übernommen aus der Vorlage: Kalender-Ansicht und das Gewohnheits-Raster.

## Was als Nächstes ansteht

1. ~~Repository auf GitHub anlegen und den Code hochladen~~ erledigt am 03.10.:
   https://github.com/6v7zd4j79h-code/Budgetplaner (privat, Branch `main`)
2. ~~Bei Netlify verbinden~~ erledigt am 05.10.:
   **https://budget-kompass.netlify.app** (Pflaume, keine Umgebungsvariablen).
   Für eine zweite, blaue Seite `VITE_FARBE=blau` setzen.
3. Auf dem Handy zum Home-Bildschirm hinzufügen
4. Echte Beträge eintragen und gleich die erste Sicherung speichern

## Offene Punkte / Hinweise

- **Kopie auf dem PC** unter `Downloads/Projekte/Budgetplaner` (entpackte ZIP).
  Nur Sicherung – maßgeblich ist GitHub. Am PC weiterarbeiten:
  `git clone https://github.com/6v7zd4j79h-code/Budgetplaner`
- **Arbeitskopie auf dem Mac** unter `~/Budgetplan` (seit 05.10., mit GitHub
  verbunden). `/start` holt dort den neuesten Stand von GitHub,
  `/shutdown` pusht nach GitHub (externe Sicherung) und legt zusätzlich ein
  ZIP in `~/Budgetplan-Sicherungen` ab (interne Sicherung, die 20 neuesten
  bleiben).

- **Daten hängen an Gerät und Adresse.** Browserdaten löschen = Daten weg,
  wenn keine Sicherung existiert. Die App erinnert nach 30 Tagen.
- Budget-Änderungen gelten nur für den angezeigten Monat. Spätere, schon
  angelegte Monate ändern sich nicht mit.

## Arbeitsweise

- Vor dem Committen `npm test` laufen lassen
- Jede Sitzung beginnt mit `/start`
- Jede Sitzung endet mit `/shutdown`
