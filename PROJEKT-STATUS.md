# Projektstand

> Diese Datei ist das Gedächtnis des Projekts. `/start` liest sie,
> `/shutdown` schreibt sie fort. Immer aktuell halten.

## Aktueller Stand

**Letzte Sitzung:** 2026-10-07 (Mac: Abgleich über Netlify Blobs, gemeinsame Budgets, Deploy; Cloud: graue Variante, Fehlerkorrektur „Öffnen“)

Neue, eigenständige App, unabhängig von Miras Sternenplan. Vorbild ist ein
Instagram-Reel von *budget.profi.store*, das eine Budget-Tabelle zeigt
(Monats-Dashboard, Rechnungen zum Abhaken, Ausgaben-Log, Ringdiagramme,
Sparziele, Abo-Tracker).

Entscheidungen:
- Ursprünglich: **nur ein Gerät, keine Datenbank** (localStorage +
  Sicherungsdatei). Am 06.10. erweitert: optionaler **verschlüsselter
  Abgleich zwischen Geräten** (Ende-zu-Ende, der Server sieht nie Klartext
  oder Passwort). Ohne Server-Konfiguration läuft die App weiter nur lokal.
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
- Standard-Budgets für neue Geräte: am 06.10. ersetzt durch neutral „Mein Budget“.
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

Am 06./07.10. am Mac (lokal committet, auf Branch `arbeitsstand` gesichert,
**nicht deployt**):
- **Verschlüsselter Abgleich** (`src/cloud.js`, Tresor-Modus in `store.js`,
  Anmeldeseite `src/ui/account.js`): E-Mail + Passwort; aus dem Passwort
  entstehen getrennt ein Login-Wert und der Datenschlüssel. Alle Budgets in
  einem verschlüsselten Tresor, Abgleich beim Öffnen/Zurückkehren/nach
  Änderungen, Konflikt = neuerer Server-Stand gewinnt mit Hinweis,
  „angemeldet bleiben“ über nicht exportierbaren Schlüssel in IndexedDB.
  Seit 07.10. über eine eigene **Netlify-Funktion + Netlify Blobs** statt
  Supabase/Neon (kein weiteres Konto nötig, siehe `docs/abgleich.md`).
- **Gemeinsame Budgets** (07.10.): Budget freigeben, Einladungscode (einmalig,
  7 Tage), andere Person tritt mit eigenem Konto bei. Eigener Schlüssel pro
  gemeinsamem Budget, liegt in den Tresoren aller Mitglieder; der Server sieht
  den Code nur als Hash. Im Browser mit zwei „Geräten“ durchgespielt.
- Neutrale Vorgabe „Mein Budget“ statt persönlicher Namen (Seite ist öffentlich).
- **Kredite** als eigene Karte (Konten mit `kind: 'loan'`): Restschuld, Rate,
  Ende, wer zahlt, Tilgungsfortschritt; zählen nicht zu den Kontoständen.
- Tests nutzen nur noch erfundene Beträge (vorher standen echte Kontowerte in
  `tests/accounts.test.js` – in zwei älteren, schon gepushten Commits noch in
  der Historie).
- 60 Tests, darunter Abgleich mit nachgebautem Server.

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

1. Am Mac auf budget-kompass.netlify.app **Konto erstellen**, Importdateien
   (Sept + Okt, beide Budgets, inkl. Kredite) einspielen, Gemeinschaftskonto
   **freigeben** und Klas einladen. Danach die unverschlüsselten `.json` in
   `~/Budgetplan-Sicherungen` löschen.
2. Auf dem Handy anmelden und zum Home-Bildschirm hinzufügen.
3. Bon-Scan mit echtem Handyfoto ausprobieren; CSV-Import mit echten
   Auszügen (bei unbekannter Bank nur die Kopfzeile schicken lassen).
4. **Rückmeldung von Mareike:** Wird die Pflaumen-Version angezeigt? (Am
   05.10. gemeldet: „nicht da“ – Vermutung `VITE_FARBE` bei Netlify oder
   alte Version im Cache.)
5. Datenschutz: Repo auf **privat** stellen (GitHub → Settings) oder Historie
   bereinigen – Mareike entscheidet.

Erledigt: GitHub-Repo (03.10., https://github.com/6v7zd4j79h-code/Budgetplaner,
**öffentlich**), Netlify (05.10., **https://budget-kompass.netlify.app**),
Abgleich über Netlify Blobs statt Neon/Supabase (07.10.).

## Offene Punkte / Hinweise

- **Kopie auf dem PC** unter `Downloads/Projekte/Budgetplaner` (entpackte ZIP).
  Nur Sicherung – maßgeblich ist GitHub. Am PC weiterarbeiten:
  `git clone https://github.com/6v7zd4j79h-code/Budgetplaner`
- **Arbeitskopie auf dem Mac** unter `~/Budgetplan` (seit 05.10., mit GitHub
  verbunden). `/start` holt dort den neuesten Stand von GitHub,
  `/shutdown` pusht nach GitHub (externe Sicherung) und legt zusätzlich ein
  ZIP in `~/Budgetplan-Sicherungen` ab (interne Sicherung, die 20 neuesten
  bleiben).

- **Netlify Personal-Tarif** (1.000 Credits/Monat); ein Deploy kostet 15
  Credits → Änderungen sammeln, selten deployen.
- Seite **budget-kompass.netlify.app ist seit 06.10. öffentlich** (Team-Schutz
  von Mareike aufgehoben). Unkritisch, solange Daten nur im Browser bzw.
  verschlüsselt liegen.
- **Unfertige Commits liegen auf Branch `arbeitsstand`**, nicht auf `main`
  (`/shutdown` pusht dorthin, damit nichts ungewollt deployt wird).
  `/start` muss diesen Branch berücksichtigen.
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
