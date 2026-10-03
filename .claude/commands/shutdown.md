---
description: Session sauber beenden — Stand sichern, committen und pushen
---

Beende die Arbeitssitzung sauber, damit nichts verloren geht.

Führe folgende Schritte aus:

1. `git status` ausführen und alle geänderten Dateien ansehen.
2. `PROJEKT-STATUS.md` aktualisieren:
   - Datum der Sitzung
   - Was in dieser Sitzung tatsächlich gemacht wurde (nur Fakten, keine Pläne)
   - Was als Nächstes ansteht
   - Bekannte offene Probleme
3. Alle Änderungen committen mit einer beschreibenden Commit-Nachricht auf
   Deutsch (kein generisches "update").
4. Auf den aktuellen Branch pushen: `git push -u origin <branch>`.
   Bei Netzwerkfehlern bis zu 4-mal mit wachsender Wartezeit erneut versuchen.
5. Mit `git status` bestätigen, dass der Arbeitsbereich sauber ist und nichts
   mehr ungepusht aussteht.

Berichte am Ende auf Deutsch in drei Zeilen:
- Was committet und gepusht wurde (mit Commit-Hash)
- Ob der Arbeitsbereich jetzt sauber ist
- Was beim nächsten `/start` als Erstes ansteht

**Wichtig:** Melde den Abschluss nur, wenn der Push wirklich erfolgreich war.
Wenn etwas fehlschlägt, sage das deutlich, statt die Sitzung als gesichert
zu melden.
