-- Budgetplaner - Datenbankschema fuer den Abgleich zwischen Geraeten
--
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausfuehren.
-- Wiederholbar: ein zweiter Lauf aendert nichts kaputt.
--
-- Pro Person genau eine Zeile: der verschluesselte Tresor mit allen Budgets.
-- Verschluesselt wird im Browser (AES-GCM, Schluessel aus dem Passwort).
-- Die Datenbank sieht nur Salt, IV und unlesbare Daten - nie Betraege,
-- Namen oder das Passwort.

create table if not exists public.vaults (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salt        text not null,
  iv          text not null,
  data        text not null,
  rev         integer not null default 1,
  updated_at  timestamptz not null default now()
);

alter table public.vaults enable row level security;

-- Jede Person sieht und aendert nur ihre eigene Zeile.
drop policy if exists "vault lesen" on public.vaults;
create policy "vault lesen" on public.vaults
  for select using (auth.uid() = user_id);

drop policy if exists "vault anlegen" on public.vaults;
create policy "vault anlegen" on public.vaults
  for insert with check (auth.uid() = user_id);

drop policy if exists "vault aendern" on public.vaults;
create policy "vault aendern" on public.vaults
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vault loeschen" on public.vaults;
create policy "vault loeschen" on public.vaults
  for delete using (auth.uid() = user_id);
