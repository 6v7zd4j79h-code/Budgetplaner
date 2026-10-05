---
description: Session starten — aktuellen Stand von GitHub holen und Überblick geben
---

Starte eine neue Arbeitssitzung an diesem Projekt.

Führe folgende Schritte aus, ohne Rückfragen:

1. Aktuellen Stand von GitHub (externe Sicherung) holen:
   `git fetch origin` und dann `git status -sb`.
   - Gibt es keine lokalen Änderungen und ist der Branch nur hinter dem
     Remote: `git pull --ff-only` ausführen.
   - Gibt es lokale, uncommittete Änderungen oder sind die Stände
     auseinandergelaufen: **nicht** pullen, sondern das im Bericht deutlich
     melden und fragen, wie weiter verfahren werden soll.
2. Lies `PROJEKT-STATUS.md` im Projekt-Root vollständig (nach dem Pull).
3. Führe `git log --oneline -10` aus, um die letzten Änderungen zu sehen.
4. Prüfe, wann die letzte interne Sicherung angelegt wurde:
   `ls -t ~/Budgetplan-Sicherungen | head -3`

Berichte danach kurz und konkret auf Deutsch:

- **Ob der Stand von GitHub geholt wurde** (und ob es neue Commits gab)
- **Woran zuletzt gearbeitet wurde** (aus PROJEKT-STATUS.md und den Commits)
- **Was als Nächstes offen ist** (die offenen Punkte aus PROJEKT-STATUS.md)
- **Ob es uncommittete Änderungen gibt**, die noch von einer abgebrochenen
  Sitzung übrig sind
- **Datum der letzten internen Sicherung**

Halte dich kurz — maximal ein Bildschirm. Frage am Ende, woran heute
gearbeitet werden soll, und warte auf die Antwort.
