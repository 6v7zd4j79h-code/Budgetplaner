# Projektstand

> Diese Datei ist das Gedächtnis des Projekts. `/start` liest sie,
> `/shutdown` schreibt sie fort. Immer aktuell halten.

## Aktueller Stand

**Letzte Sitzung:** 2026-10-07, abgeschlossen am 23.10. (Mac: Kredite aus PDFs in die Mareike-Importdatei, Abgleich über Netlify Blobs, gemeinsame Budgets – Inhalt siehe 07.10.; beim Abschluss kein Code geändert). Davor 2026-10-13, zweite Sitzung, abgeschlossen am 23.10. (Mac: nur Beratung, wie Klas ans Gemeinschaftskonto kommt; kein Code geändert). Davor 2026-10-13 (Mac: Einkaufsliste per Knopf an den Essensplan im Sternenplan, Deploy), 2026-10-11 (Mac: Essensplan-Liste, Vorrat-Warnung, Deploy; Cloud parallel: regelmäßige Einkäufe, Anlässe, Angebote, Bon-Leser), 2026-10-07 (Mac: Abgleich über Netlify Blobs, gemeinsame Budgets, Deploy; Cloud: graue Variante, Fehlerkorrektur „Öffnen“)

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

Am 10./11.10. (Cloud-Sitzung, Branch `regelmaessige-einkaeufe`, **noch nicht
in main/nicht deployt**) – Vorbereitung für wöchentliche Angebots-Tipps:
- **Regelmäßige Einkäufe** (`src/shopping.js`, Seite über Ausgaben →
  „🛒 Regelmäßige Einkäufe“): was laut Bon-Artikeln in 6 Monaten mind. zweimal
  gekauft wurde, Rhythmus, Läden, letzter Preis; „woanders günstiger“-Hinweis.
  Pfand/Tüten zählen nicht, Läden aus Bon und Kontoauszug werden vereinheitlicht.
- **Anlässe** (`src/occasions.js`, Seite „Anlässe“): Geburtstage (jährlich),
  Ferien/Zeiträume, Feiertage (Ostern berechnet, Nikolaus, Weihnachten,
  Silvester; einzeln abschaltbar), je mit Vorlauf und Notiz („Kuchenzutaten“,
  „Kinder mittags zu Hause“). Ab dem Vorlauf Karte „Bald steht an“ in der
  Übersicht. Gespeichert im Budget (`data.occasions`, `data.holidaysOff`),
  also verschlüsselt mit abgeglichen – echte Geburtstage NICHT ins Repo.
- **Angebote der Woche** (`src/offers.js`, Seite „Angebote“, Karte in der
  Übersicht): Merkliste aus Stammartikeln (🛒), Anlass-Notizen (🎂, z. B.
  „Kuchenzutaten“ → Mehl, Zucker, Butter …) und eigenen Wörtern (⭐, optional
  „nur Bio/Fairtrade“, z. B. Schokolade). Netlify-Funktion
  `netlify/functions/offers.mjs` (Logik `server/offers-core.js`) fragt
  **marktguru.de** (inoffizielle Schnittstelle, Schlüssel von der Startseite)
  nach PLZ + Suchwort, Zwischenspeicher 6 h in Netlify Blobs. Filter in der
  App: gewählte Läden, Bio bevorzugen/nur Bio, Ausschlusswörter, Vergleich
  mit dem üblichen Bon-Preis. Prüft einmal pro Kalenderwoche automatisch beim
  Öffnen; Ergebnis nur im localStorage. Einstellungen in `data.offerSettings`.
  Mareikes Wunsch: PLZ 56759 (Kaisersesch = ALDI SÜD), Läden ALDI SÜD, Lidl,
  EDEKA, REWE, Penny, Netto, Kaufland, HIT, Globus, Rossmann, dm, TEDi,
  CENTERSHOP (alle vorab angehakt; Woolworth, Thomas Philipps, Mäc-Geiz,
  Pfennigpfeiffer u. a. wählbar); viel Bio (ALDI „Nur Nur
  Natur“), Schokolade nur hochwertig. PLZ steht bewusst nicht im Code –
  einmal in der App eintragen.
- **Noch nicht mit echten Daten geprüft:** Die Cloud-Sitzung durfte
  marktguru.de nicht erreichen; getestet mit nachgebauten Antworten. Erster
  echter Test nach dem Deploy (oder `npm run dev` am Mac).
- **Karten & Apps** (Einstellungen der Angebote): Payback (EDEKA, Netto, dm –
  REWE/PENNY sind 2025 ausgestiegen), Lidl Plus, REWE Bonus, PENNY App,
  Kaufland Card, Rossmann App. Angebote nur mit fremder App: „nur mit …“ und
  nach hinten; Payback-Extrapunkte markiert; Hinweis „Coupons in der
  Payback-App aktivieren“. Payback-Coupons selbst sind persönlich und für die
  App nicht sichtbar.
- **Automatische Aktualisierung**: `registerSW({ immediate: true })` in
  `main.js` – nach einem Deploy lädt die App sich einmal selbst neu.
- **Bon in mehreren Fotos** (`joinParts` in `src/receipt.js`): nach jedem
  Foto „Bon geht weiter / ist vollständig“, Überlappung wird (fehlertolerant)
  nur einmal gezählt; mit echter Texterkennung geprüft. ALDI SÜD/SUED wird
  jetzt als „ALDI SÜD“ erkannt, dazu HIT, TEDi, CENTERSHOP.
- **Bons korrigieren**: Artikel einer Buchung bearbeitbar (Name, Preis),
  „Weiteren Bon-Teil scannen“ mit Wahl anhängen/ersetzen, „Alle
  Bon-Artikel entfernen“ (Buchung bleibt), Warnung bei gleichem Tag + Summe.
- **Artikel-Haken „🏷 Angebot“ und „📦 Vorrat“** (`item.deal`, `item.stock`),
  Karte „Im Angebot & auf Vorrat“ unter Ausgaben.
- **Für wen?** pro Buchung (`entry.forWhom`, Liste `data.people`, Vorgabe
  mich/Partner/Kinder/Familie, änderbar), Karte „Für wen ausgegeben“.
- **Pro Artikel „für wen?“ und „🎁 Geschenk“** (`item.forWhom`, `item.gift`),
  Geschenk auch für ganze Buchungen (`entry.gift`). „Für wen ausgegeben“
  teilt Buchungen auf (Artikel mit eigener Person zählen dort, der Rest bei
  der Buchung); Karte „🎁 Geschenke“ unter Ausgaben.
- **PDF-Kassenbons und Rechnungen** (`src/pdf.js` mit pdfjs-dist, lädt erst
  beim ersten PDF; Zeilenaufbau in `src/pdf-lines.js`): eBons aus EDEKA-,
  REWE-, Lidl-Plus-, dm-App und heruntergeladene Rechnungen – Text direkt aus
  dem PDF, keine Texterkennung. Bon-Leser kann jetzt Steuerkennzeichen „AW“
  und „*A“, „1,69 € x 4“ im Namen, Tausenderpunkt, Rechnungstabellen
  (Pos./Menge/Einzelpreis), Zwischensumme/Summe netto ≠ Endbetrag.
  Auslöser: Mareikes EDEKA-eBon (PDF) wurde nicht angenommen.
- **Buchung bearbeiten** („✎ Bearbeiten“ bzw. Tipp auf die Kategorie):
  Datum, Kategorie, Konto, Notiz, Betrag; **in anderes Budget verschieben**
  (`moveEntry` in `store.js`, z. B. privat → Gemeinschaftskonto; Kategorie
  über den Namen, Konto fällt weg; bei passwortgeschütztem Ziel im lokalen
  Modus Hinweis statt Verschieben).
- **Bon nachrechnen** (`parseParts`, `checkSum` in `src/receipt.js`): Fotos
  einzeln lesen, am Übergang gleiche Zeile (gleicher Preis, ähnlicher oder
  angeschnittener Name) nur einmal; Gegenprobe mit der Bon-Summe (echte
  Doppelkäufe bleiben). Prüfen zeigt „geht auf“ / „X zu viel“ mit Vorschlag
  und Ein-Tipp-Korrektur / „X fehlen“; Foto-Grenzen in der Liste;
  Rückfrage beim Speichern. Auslöser: langer ALDI-Bon mit doppelten Zeilen.
- **Spezielle Ernährung pro Artikel** (`item.diet`: Protein/Sport, Low Carb,
  kalorienarm, zuckerfrei, glutenfrei, laktosefrei, vegan, Diät), nicht
  „unnötig“; Vorschlag aus dem Namen, wird pro Artikel gemerkt
  (`data.dietRules`); Karte „🥗 Spezielle Ernährung“.
- **Eigene Kategorie pro Artikel** (`item.lineId`): z. B. Tee bei dm →
  Lebensmittel, Schlafanzug bei ALDI → Kleidung; `expenseActuals` teilt
  die Buchung im Budget entsprechend auf.
- Artikel-Optionen eingeklappt („＋ mehr“), gesetzte Haken als Chips.
- **Echter ALDI-Bon (3 Fotos) untersucht** (12.10.): Die eingebaute
  Texterkennung (Tesseract) liest auf Handyfotos von Thermobons die
  Preisspalte nicht (0 von 73 Preisen), Fotos überlappen 20–35 Zeilen,
  Sofortstorno. Bon-Leser jetzt: Artikel ohne Preis bleiben sichtbar
  („Preis?“), Storno über Fotogrenzen, Überlappung per längster gemeinsamer
  Teilfolge, Summe auch ohne „Betrag“.
- **Genau lesen mit Claude** (`server/receipt-ai-core.js`, Funktion
  `netlify/functions/receipt-ai.mjs`, App `src/receipt-ai.js`): Mareikes
  Wunsch – **immer zuerst die eingebaute Erkennung**, nur wenn Preise fehlen
  oder die Summe nicht aufgeht, automatisch Claude (Modell
  `claude-haiku-5-5`, günstig, effort low, strukturierte JSON-Ausgabe).
  Fotos werden auf 1600 px verkleinert. Tageslimit 40 (Netlify Blobs,
  `RECEIPT_AI_DAILY_LIMIT`). **Einrichtung nötig:** API-Schlüssel von
  console.anthropic.com (Guthaben aufladen) als Umgebungsvariable
  `ANTHROPIC_API_KEY` bei Netlify, danach neu deployen. Noch nicht mit
  echtem Claude getestet (kein Schlüssel in der Cloud-Sitzung); Laufzeit
  bei langen Bons vs. Netlify-Zeitlimit beim ersten echten Test prüfen.
- **Digitaler Rossmann-Bon (Screenshot)**: Coupons im eigenen Block nach
  der Zwischensumme wurden vom letzten Artikel abgezogen (Tee fiel auf 0 €
  und verschwand). Jetzt eigene Minus-Zeilen; Laden an Eigenmarken erkannt
  (enerBiO/Prokudent → Rossmann, Balea/dmBio → dm, …); ISO-Datum; Preise
  dürfen negativ sein (Coupon, Leergut).
- **Regelmäßige Einkäufe ausblenden** (× pro Artikel, `data.regularHidden`),
  zählt dann auch nicht mehr für die Angebote.
- Offen: ein Laden in der Nähe, dessen Name Mareike entfallen ist („Name
  ist Programm“?), Schulferien RLP automatisch.
- 105 Tests grün, im Browser (Handy + Desktop) geprüft.
- PR #1 am 11.10. nach main übernommen (Deploy).

Am 11.10. am Mac (auf `main`, **deployt** und live geprüft):
- **„🍽 Für den Essensplan“** (Karte oben unter Regelmäßige Einkäufe,
  `mealPlanItems`/`mealPlanText` in `src/shopping.js`): Liste der Einkäufe
  der letzten 3/7/14 Tage ohne Preise, Läden, Konten; ohne Pfand, Tüten,
  Geschenke; Haken „nur Lebensmittel“ (Kategorien wie Lebensmittel, Artikel
  ohne Kategorie bleiben drin). „📋 Liste kopieren“, auf dem Handy „↗ Teilen“.
  Zum Einfügen in den Essensplan des Sternenplans (siehe Offene Punkte).
- **Vorrat erkennen** (`stockItems`, `stockFor`): Artikel mit Haken „📦 Vorrat“
  oder ≥ 3 Stück auf einem Bon, 6 Wochen lang. Kein Abhaken nötig (Mareikes
  Wunsch); optional „ist aufgebraucht“ (`data.stockUsed`, gilt bis zum
  nächsten Vorratskauf).
- Vorrat wird genutzt: gelber Hinweis bei passenden **Angeboten** („am 01.10.
  4× Weiße Bohnen gekauft – vielleicht noch genug da?“), solche Angebote nach
  hinten, „noch Vorrat“ in der Übersicht; Abschnitt „Auf Vorrat (vermutlich
  noch da)“ in der Essensplan-Liste; Karte „📦 Auf Vorrat gekauft“.
  Zuordnung über das Wort („Nudeln“ findet „Bio Nudeln 500g“, nicht
  „Spaghetti“).
- Mit dem Cloud-Stand (Bon-Leser, „Bon genau lesen mit Claude“) ohne
  Konflikte zusammengeführt und gemeinsam deployt. 109 Tests grün, im
  Browser (Handy + Desktop) mit erfundenen Daten geprüft.

Am 13.10. am Mac (auf `main`, **deployt**, von Mareike live bestätigt):
- **„🍽 An den Essensplan schicken“** statt Kopieren/Einfügen: Knopf in der
  Übersicht (Karte „Für den Essensplan“, nur wenn es Artikel gibt), unter
  Ausgaben und auf der Essensplan-Karte (Regelmäßige Einkäufe). Schickt die
  Liste der letzten 7 Tage (nur Lebensmittel, plus Vorrat) an den
  **Briefkasten im Sternenplan** (`/.netlify/functions/einkauf-briefkasten`,
  Bearer-Verbindungscode). Logik `src/mealsend.js`, UI `src/ui/mealsend.js`,
  Schnittstelle in `docs/essensplan-briefkasten.md`.
- Einrichtung einmal pro Budget: Verbindungscode aus dem Sternenplan in der
  Essensplan-Karte eintragen (`data.mealPlanLink` = Adresse, Code, zuletzt
  geschickt; Vorgabe-Adresse miras-sternenplan.netlify.app). „Liste kopieren“
  bleibt als Notlösung.
- Briefkasten im Projekt Sternenplan parallel gebaut und deployt; Mareike hat
  verbunden und erfolgreich geschickt. 113 Tests grün, im Browser (Handy)
  mit erfundenen Daten und nachgebautem Briefkasten geprüft.

Am 13.10., zweite Sitzung am Mac (nur Beratung, kein Code geändert):
- Mareike kommt nicht mehr in ihr Budgetplaner-Konto (Passwort vergessen).
  Klas hat schon ein eigenes Konto. Geklärt: Den Einladungscode für das
  Gemeinschaftskonto kann nur jemand erzeugen, der das Budget schon hat, also
  Mareike. Ein Passwort lässt sich nicht zurücksetzen (Ende-zu-Ende), und eine
  Funktion zum Ändern des Konto-Passworts gibt es nicht (nur für das
  Budget-Schloss).
- Die unverschlüsselten Importdateien in `~/Budgetplan-Sicherungen` sind noch
  da (Gemeinschaftskonto und Mareike, Stand 06./07.10.).
- `.claude/commands/start.md` und `shutdown.md`: Schritt für den
  Session-Status (🟡/✅) ergänzt (von Mareike).

Nicht übernommen aus der Vorlage: Kalender-Ansicht und das Gewohnheits-Raster.

## Was als Nächstes ansteht

0. **Klas ans Gemeinschaftskonto:** Ist Mareike noch auf einem Gerät
   angemeldet? Ja → dort unter „Sicherung“ → „Gemeinsam nutzen“ das
   Gemeinschaftskonto freigeben, Code erzeugen, Klas gibt ihn unter „Mit Code
   beitreten“ ein. Nein → neues Konto anlegen (andere E-Mail, oder altes Konto
   in Netlify Blobs löschen, nur auf ausdrücklichen Wunsch), Sicherungsdateien
   einspielen, dann freigeben und einladen. Was nach dem 07.10. eingetragen
   wurde, fehlt in den Dateien. Passwort im Passwort-Manager speichern.
   Antwort von Mareike steht noch aus.
0. **Repo auf privat stellen (dringend):** Am 23.10. sind mit den Commits
   `f3a3660` und `de962f1` (Branch `arbeitsstand`) Kreditdetails öffentlich auf
   GitHub gelandet. Aus der Datei sind sie wieder entfernt, in diesen beiden
   Commits stehen sie aber noch. Mareike stellt das Repo selbst auf privat
   (GitHub → Settings → Danger Zone → Change visibility), danach prüfen, ob
   Netlify weiter deployt. Das Bereinigen der Historie per Force-Push hat der
   Sicherheitsfilter von Claude Code blockiert.
   Mögliche Ergänzung: Konto-Passwort ändern, solange man angemeldet ist.
0. Vorrat-Warnung mit echten Bons ausprobieren; Angebote der Woche
   erstmals echt (PLZ eintragen). Schicken an den Essensplan läuft (13.10.).
1. Am Mac auf budget-kompass.netlify.app **Konto erstellen**, Importdateien
   (Sept + Okt, beide Budgets, inkl. Kredite) einspielen, Gemeinschaftskonto
   **freigeben** und Klas einladen. Danach die unverschlüsselten `.json` in
   `~/Budgetplan-Sicherungen` löschen.
   Die Mareike-Datei (`…mareike-sept-okt-2026.json`) enthält seit 07.10. drei
   weitere Kredite (Einzelheiten nur in der Datei, nicht im Repo). Alte
   Fassung daneben als `….vor-krediten.json`.
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

- **Für das Projekt Sternenplan (dort umsetzen, nicht hier):** Essensplan mit
  Feld zum Einfügen der Liste aus „🍽 Für den Essensplan“ (Budgetplaner →
  Regelmäßige Einkäufe), eigene Gerichte mit Zutaten, Vorschläge
  „Abendessen 1/2/3“ aus dem Eingekauften und dem Vorrat. Verbrauch nur über
  „gekocht“ im Essensplan, kein eigenes Abhaken (Mareike, 11.10.).
  Brücke per Knopf seit 13.10. (Briefkasten im Sternenplan). Ändert sich dort
  die Schnittstelle, muss `src/mealsend.js` mitziehen.
- Liegt nach neuem Verbindungscode im Sternenplan der alte noch im
  Budgetplaner, meldet der Knopf „Verbindungscode passt nicht“ → neu eintragen.

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
