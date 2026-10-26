-- ============================================================
-- HQ-Benutzer per Einladung (zusätzlich zu HQ_USERS).
-- Passwort nur als scrypt-Hash, Einladungslink nur als SHA-256-Hash.
-- RLS ohne Policies → nur service_role. Idempotent.
-- ============================================================
create table if not exists public.so_benutzer (
  id bigserial primary key,
  email text not null unique,
  name text not null default '',
  rolle text not null default 'mitarbeit' check (rolle in ('admin', 'mitarbeit')),
  aktiv boolean not null default true,
  passwort_hash text not null default '',
  passwort_gesetzt_am timestamptz,
  einladung_hash text unique,
  einladung_bis timestamptz,
  eingeladen_am timestamptz,
  eingeladen_von text not null default '',
  letzter_login timestamptz,
  created_at timestamptz not null default now());

alter table public.so_benutzer enable row level security;
revoke all on public.so_benutzer from anon, authenticated;
grant select, insert, update, delete on public.so_benutzer to service_role;
grant usage, select on sequence public.so_benutzer_id_seq to service_role;
