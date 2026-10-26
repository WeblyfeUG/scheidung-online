-- ============================================================
-- Automatisierung Scheidung-Online + Kanzlei-HQ v2
-- Neues Statusmodell, persönliche Links, Mandat, Fragebogen,
-- Dokumente, E-Mails, Termine, Vorlagen, Einstellungen.
-- Alle Tabellen: RLS aktiv ohne Policies → nur service_role (Server).
-- Idempotent (if not exists / on conflict), mehrfach ausführbar.
-- ============================================================

-- 1) Statusmodell: Altwerte überführen, neue Liste erzwingen
alter table public.so_anfragen drop constraint if exists so_anfragen_status_check;

insert into public.so_ereignisse (anfrage_id, benutzer, art, details)
  select id, 'migration', 'notiz', jsonb_build_object('text', 'Rückfrage offen (aus altem Status übernommen)')
  from public.so_anfragen where status = 'rueckfrage';

update public.so_anfragen set status = case status
  when 'in_bearbeitung' then 'in_pruefung'
  when 'rueckfrage' then 'in_pruefung'
  when 'mandat' then 'unterschrieben'
  when 'erledigt' then 'abgeschlossen'
  when 'abgelehnt' then 'abgesagt'
  else status end
where status in ('in_bearbeitung', 'rueckfrage', 'mandat', 'erledigt', 'abgelehnt');

alter table public.so_anfragen add constraint so_anfragen_status_check check (status in (
  'neu', 'in_pruefung', 'mandat_angeboten', 'unterschrieben', 'fragebogen_vollstaendig',
  'antrag_vorbereitung', 'eingereicht', 'termin', 'abgeschlossen',
  'erstgespraech', 'abgesagt', 'widerrufen'));

-- 2) Neue Spalten an der Anfrage
alter table public.so_anfragen
  add column if not exists az_kanzlei text not null default '',
  add column if not exists az_gericht text not null default '',
  add column if not exists gericht text not null default '',
  add column if not exists ki jsonb,
  add column if not exists spam boolean not null default false,
  add column if not exists spam_grund text not null default '',
  add column if not exists unterschrieben_am timestamptz,
  add column if not exists widerruf_bis date,
  add column if not exists fragebogen_vollstaendig_am timestamptz,
  add column if not exists eingereicht_am timestamptz,
  add column if not exists abgeschlossen_am timestamptz,
  add column if not exists kosten jsonb not null default '{}'::jsonb;

create index if not exists so_anfragen_status_created_idx on public.so_anfragen (status, created_at desc);
create index if not exists so_anfragen_spam_idx on public.so_anfragen (spam) where spam;

-- 3) Neue Tabellen
create table if not exists public.so_links (
  id bigserial primary key,
  anfrage_id uuid not null references public.so_anfragen (id) on delete cascade,
  token_hash text not null unique,
  zweck text not null check (zweck in ('mandat', 'fragebogen', 'status')),
  gueltig_bis timestamptz not null,
  zuletzt_verwendet timestamptz,
  widerrufen boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists so_links_anfrage_idx on public.so_links (anfrage_id, zweck);

create table if not exists public.so_mandate (
  id bigserial primary key,
  anfrage_id uuid not null unique references public.so_anfragen (id) on delete cascade,
  ort text not null default '',
  datum date not null,
  sofort_taetig boolean not null default false,
  dokumente_version text not null default '',
  unterschrift_pfad text not null default '',
  pdf_pfad text not null default '',
  ip text not null default '',
  user_agent text not null default '',
  bestaetigungen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());

create table if not exists public.so_fragebogen (
  id bigserial primary key,
  anfrage_id uuid not null unique references public.so_anfragen (id) on delete cascade,
  daten jsonb not null default '{}'::jsonb,
  schritt int not null default 0,
  vollstaendig_am timestamptz,
  kanzlei_aenderungen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

create table if not exists public.so_dokumente (
  id bigserial primary key,
  anfrage_id uuid not null references public.so_anfragen (id) on delete cascade,
  name text not null,
  art text not null check (art in ('heiratsurkunde', 'geburtsurkunde', 'ehevertrag', 'vollmacht_pdf', 'antrag_docx', 'antrag_pdf', 'sonstiges')),
  quelle text not null check (quelle in ('mandant', 'kanzlei', 'system')),
  pfad text not null,
  mime text not null default '',
  groesse int not null default 0,
  hochgeladen_von text not null default '',
  created_at timestamptz not null default now());
create index if not exists so_dokumente_anfrage_idx on public.so_dokumente (anfrage_id);

create table if not exists public.so_mails (
  id bigserial primary key,
  anfrage_id uuid references public.so_anfragen (id) on delete cascade,
  vorlage text not null default '',
  an text not null default '',
  betreff text not null default '',
  text text not null default '',
  status text not null check (status in ('gesendet', 'fehler', 'geplant')),
  provider_id text not null default '',
  fehler text not null default '',
  gesendet_am timestamptz,
  created_at timestamptz not null default now());
create index if not exists so_mails_anfrage_idx on public.so_mails (anfrage_id, created_at desc);

create table if not exists public.so_termine (
  id bigserial primary key,
  anfrage_id uuid not null references public.so_anfragen (id) on delete cascade,
  art text not null default 'scheidung' check (art in ('scheidung', 'erstgespraech', 'sonstiges')),
  datum date not null,
  uhrzeit text not null default '',
  ort text not null default '',
  hinweis text not null default '',
  created_at timestamptz not null default now());
create index if not exists so_termine_datum_idx on public.so_termine (datum);

create table if not exists public.so_vorlagen (
  id text primary key,
  name text not null default '',
  betreff text not null default '',
  text text not null default '',
  automatisch boolean not null default false,
  aktualisiert_am timestamptz not null default now(),
  aktualisiert_von text not null default '');

create table if not exists public.so_einstellungen (
  key text primary key,
  wert jsonb not null default '{}'::jsonb,
  aktualisiert_am timestamptz not null default now(),
  aktualisiert_von text not null default '');

-- 4) Rechte: nur service_role
alter table public.so_links enable row level security;
alter table public.so_mandate enable row level security;
alter table public.so_fragebogen enable row level security;
alter table public.so_dokumente enable row level security;
alter table public.so_mails enable row level security;
alter table public.so_termine enable row level security;
alter table public.so_vorlagen enable row level security;
alter table public.so_einstellungen enable row level security;
revoke all on public.so_links, public.so_mandate, public.so_fragebogen, public.so_dokumente, public.so_mails,
  public.so_termine, public.so_vorlagen, public.so_einstellungen from anon, authenticated;
grant select, insert, update, delete on public.so_links, public.so_mandate, public.so_fragebogen, public.so_dokumente,
  public.so_mails, public.so_termine, public.so_vorlagen, public.so_einstellungen to service_role;
grant usage, select on sequence public.so_links_id_seq, public.so_mandate_id_seq, public.so_fragebogen_id_seq,
  public.so_dokumente_id_seq, public.so_mails_id_seq, public.so_termine_id_seq to service_role;

-- 5) Speicher für Dokumente (privat, nur Server)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('so-dokumente', 'so-dokumente', false, 10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
