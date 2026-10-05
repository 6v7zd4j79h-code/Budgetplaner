---
description: Session sauber beenden — Stand sichern (GitHub + intern), committen und pushen
---

Beende die Arbeitssitzung sauber, damit nichts verloren geht.

Führe folgende Schritte aus:

1. `git status` ausführen und alle geänderten Dateien ansehen.
2. `PROJEKT-STATUS.md` aktualisieren:
   - Datum der Sitzung
   - Was in dieser Sitzung tatsächlich gemacht wurde (nur Fakten, keine Pläne)
   - Was als Nächstes ansteht
   - Bekannte offene Probleme
3. Wenn Code geändert wurde: `npm test` laufen lassen. Schlägt ein Test fehl,
   das melden und trotzdem sichern, aber im Commit erwähnen.
4. Alle Änderungen committen mit einer beschreibenden Commit-Nachricht auf
   Deutsch (kein generisches "update").
5. **Externe Sicherung:** auf den aktuellen Branch pushen:
   `git push -u origin <branch>`.
   Bei Netzwerkfehlern bis zu 4-mal mit wachsender Wartezeit erneut versuchen.
6. **Interne Sicherung:** ein ZIP des Projekts auf diesem Mac ablegen
   (ohne `node_modules` und `dist`, aber mit Git-Verlauf):
   ```
   mkdir -p ~/Budgetplan-Sicherungen
   cd .. && zip -rq ~/Budgetplan-Sicherungen/Budgetplan-$(date +%Y-%m-%d_%H-%M).zip "$(basename "$OLDPWD")" -x "*/node_modules/*" "*/dist/*" "*/.DS_Store"
   ```
   Danach nur die 20 neuesten ZIPs behalten, ältere in diesem Ordner löschen.
7. Mit `git status -sb` bestätigen, dass der Arbeitsbereich sauber ist und
   nichts mehr ungepusht aussteht.

Berichte am Ende auf Deutsch in vier Zeilen:
- Was committet und gepusht wurde (mit Commit-Hash)
- Name der internen Sicherungsdatei
- Ob der Arbeitsbereich jetzt sauber ist
- Was beim nächsten `/start` als Erstes ansteht

**Wichtig:** Melde den Abschluss nur, wenn Push und interne Sicherung wirklich
erfolgreich waren. Wenn etwas fehlschlägt, sage das deutlich, statt die
Sitzung als gesichert zu melden.
