# Abgleich zwischen Geräten einrichten (Supabase)

Einmalig, ca. 10 Minuten. Danach meldest du dich in der App auf Handy und PC
mit derselben E-Mail und demselben Passwort an und siehst überall dieselben
Budgets.

**Wie sicher ist das?** Die App verschlüsselt alles auf deinem Gerät, bevor es
zu Supabase geht. Supabase speichert nur unlesbaren Datensalat und bekommt
dein Passwort nie zu sehen. Darum gilt auch: **Passwort vergessen = Daten weg.**
Bitte im Passwort-Manager speichern und ab und zu eine Sicherungsdatei
herunterladen.

## 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> anmelden (oder kostenlos registrieren).
2. **New project**
   - Name: `budgetplaner`
   - Database password: ein eigenes, starkes Passwort (wird für die App nicht
     gebraucht, aber gut aufheben)
   - Region: **Frankfurt (eu-central-1)**
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Tabelle anlegen

1. Links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von [`supabase/schema.sql`](../supabase/schema.sql)
   einfügen und **Run** klicken. Es muss „Success“ erscheinen.

## 3. Anmeldung einstellen

1. Links **Authentication** → **Sign In / Providers** → **Email**: muss
   aktiviert sein, „Confirm email“ eingeschaltet lassen.
2. **Authentication** → **URL Configuration**:
   - Site URL: `https://budget-kompass.netlify.app`
   - Redirect URLs: `https://budget-kompass.netlify.app/**` hinzufügen

## 4. Schlüssel zu Netlify bringen

1. In Supabase: **Project Settings** → **API** (bzw. „Data API“ / „API Keys“).
   Dort stehen die **Project URL** und der **anon public** Key.
2. In Netlify: Site **budget-kompass** → **Site configuration** →
   **Environment variables** → **Add a variable**:
   - `VITE_SUPABASE_URL` = die Project URL
   - `VITE_SUPABASE_ANON_KEY` = der anon public Key
3. **Deploys** → **Trigger deploy** → **Deploy site**.

Der anon-Key ist für den Browser gedacht und darf öffentlich sein. Geschützt
sind die Daten über die Zeilen-Sicherheit der Tabelle (jede Person sieht nur
ihre eigene Zeile) und die Verschlüsselung.

## 5. Loslegen

1. App öffnen → **Konto erstellen** → E-Mail und Passwort.
2. Bestätigungs-Mail öffnen, Link klicken.
3. In der App **Anmelden**. Budgets, die schon auf dem Gerät liegen, werden
   dabei in dein Konto übernommen.
4. Auf dem Handy dieselbe Seite öffnen und anmelden – fertig.

Hinweis: Supabase pausiert Gratis-Projekte nach etwa einer Woche ohne Zugriff.
Bei regelmäßiger Nutzung passiert das nicht; sonst im Supabase-Dashboard
„Restore“ klicken.
