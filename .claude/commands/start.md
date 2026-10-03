---
description: Session starten — Projektstand laden und Überblick geben
---

Starte eine neue Arbeitssitzung an diesem Projekt.

Führe folgende Schritte aus, ohne Rückfragen:

1. Lies `PROJEKT-STATUS.md` im Projekt-Root vollständig.
2. Führe `git log --oneline -10` und `git status` aus, um den echten Stand
   des Repositories zu sehen.
3. Prüfe, ob der aktuelle Branch mit dem Remote synchron ist
   (`git fetch origin` und dann `git status -sb`).

Berichte danach kurz und konkret auf Deutsch:

- **Woran zuletzt gearbeitet wurde** (aus PROJEKT-STATUS.md und den Commits)
- **Was als Nächstes offen ist** (die offenen Punkte aus PROJEKT-STATUS.md)
- **Ob es uncommittete Änderungen gibt**, die noch von einer abgebrochenen
  Sitzung übrig sind

Halte dich kurz — maximal ein Bildschirm. Frage am Ende, woran heute
gearbeitet werden soll, und warte auf die Antwort.
