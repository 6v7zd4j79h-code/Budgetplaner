# Projektstand

> Diese Datei ist das Gedächtnis des Projekts. `/start` liest sie,
> `/shutdown` schreibt sie fort. Immer aktuell halten.

## Aktueller Stand

**Letzte Sitzung:** 2026-10-07 (Cloud: graue Variante, Fehlerkorrektur „Öffnen“; davor 05.10. Mac: Passwortschutz, Konten; Cloud: CSV-Import, Kassenbon, mehrere Budgets)

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
(gilt pro Gerät). Mit `VITE_FARBE=blau` bzw. `VITE_FARBE=grau` beim Build
startet die App in dieser Farbe, inklusive passendem Icon und Statusleiste.

Am 05.10. am Mac ergänzt (parallel zur PC-Sitzung, auf deren Stand aufgebaut):
- **Passwortschutz pro Budget.** Geschützte Budgets liegen nur verschlüsselt
  im Speicher (AES-GCM, Schlüssel per PBKDF2 aus dem Passwort), auch die
  Sicherungsdatei ist dann verschlüsselt. Sperrt beim Budgetwechsel und beim
  Neuladen, Schloss-Knopf im Kopf. Vergessenes Passwort = Daten weg.
- Standard-Budgets für neue Geräte: „Mareike“ und „Gemeinschaftskonto“.
- Kein Formular schickt mehr an eine Adresse (Passwort nie in der URL).
- Septemberdaten (beide Budgets) als Importdateien erzeugt – liegen bewusst
  NICHT im Repo, sondern unter `~/Budgetplan-Sicherungen` auf dem Mac.

Am 05.10. am Mac, zweiter Teil:
- **Konten im Budget** (neue Ansicht „Konten“, erreichbar über die
  Übersicht): Kontostand heute, Stand am Monatsersten, Dispo-Rahmen,
  Geschäftskonto, „nicht mehr genutzt“. Startbetrag eines Monats = Summe der
  Kontostände am Monatsersten.
- Dispo und andere Schulden (z. B. Klarna) werden getrennt gezeigt und nie
  als verfügbares Geld gezählt.
- **Kontofilter** über Übersicht, Budget und Ausgaben („Alle Konten“ oder
  ein Konto). Budgetzeilen und Buchungen tragen Konto und „geschäftlich“.
- Sparziel „Minus ausgleichen“ folgt automatisch dem Kontostand.
- Umsätze wurden einmalig mit Mareike gemeinsam aus dem Online-Banking
  gelesen (sie meldet sich selbst an). Importdateien liegen nur auf dem Mac
  unter `~/Budgetplan-Sicherungen`.

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

Am 07.10. (Cloud-Sitzung):
- **Graue Farbvariante im Büro-Stil** (neutrales Grau, Schiefer-Akzent,
  Radien 3–4 px, keine Schatten, Strich oben an jeder Karte; hell und dunkel;
  graues App-Icon unter `public/icons-grau`).
- Stand vom Mac (Passwortschutz, Konten, Dispo) übernommen, ohne Konflikte.
- **Fehler behoben:** Knopf „Öffnen“ unter Sicherung → Budgets stürzte ab
  (`switchBudget` war in `src/ui/settings.js` nicht importiert). Im Browser
  geprüft. Umschalten im Kopf war nicht betroffen.
- 54 Tests grün, Build läuft.

Nicht übernommen aus der Vorlage: Kalender-Ansicht und das Gewohnheits-Raster.

## Was als Nächstes ansteht

1. ~~Repository auf GitHub anlegen und den Code hochladen~~ erledigt am 03.10.:
   https://github.com/6v7zd4j79h-code/Budgetplaner (privat, Branch `main`)
2. ~~Bei Netlify verbinden~~ erledigt am 05.10.:
   **https://budget-kompass.netlify.app** (Pflaume, keine Umgebungsvariablen).
   Für eine zweite, blaue Seite `VITE_FARBE=blau` setzen.
3. Auf dem Handy zum Home-Bildschirm hinzufügen
4. Echte Beträge eintragen (oder Septemberdateien vom Mac einspielen) und
   gleich die erste Sicherung speichern
5. **Rückmeldung von Mareike abwarten:** Wird die Pflaumen-Version auf
   budget-kompass.netlify.app angezeigt? (Am 05.10. gemeldet: „nicht da“ –
   Ursache unklar, Vermutung: `VITE_FARBE` bei Netlify gesetzt oder alte
   Version im Cache. Screenshot erbeten.)
6. CSV-Import mit echten Auszügen ausprobieren; bei unbekannter Bank nur die
   Kopfzeile (Spaltennamen) schicken lassen, nie den Inhalt
7. Bon-Scan mit echtem Handyfoto ausprobieren

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
- **Ungetestet mit echten Daten:** CSV-Import (nur erfundene Dateien im
  Bankformat getestet; PayQuicker-Format unbekannt) und Bon-Scan (nur mit
  erzeugtem Bon-Bild, echte Thermopapier-Fotos werden schlechter erkannt).
- Die Texterkennung (ca. 12 MB in `public/ocr`) wird beim Build aus
  `node_modules` kopiert und ist nicht im Repository.

## Arbeitsweise

- Vor dem Committen `npm test` laufen lassen
- Jede Sitzung beginnt mit `/start`
- Jede Sitzung endet mit `/shutdown`
- **Deploy nur auf ausdrückliche Anweisung.** Push auf `main` = Netlify-Deploy.
- **Keine echten Kontodaten ins Repo** – das GitHub-Repo ist öffentlich.
- Am Mac und am PC wird parallel gearbeitet: vor dem Arbeiten immer `/start`
  (holt den Stand von GitHub), sonst entstehen doppelte Umsetzungen.
