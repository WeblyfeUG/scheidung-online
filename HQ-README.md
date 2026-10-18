# HQ — internes Backoffice von Scheidung-Online

Alle Website-Formulare (Online-Antrag, Kosteneinschätzung, Nachricht, Checklisten-Versand) senden an `/api/lead`.
Dort wird validiert und die Anfrage in der Datenbank gespeichert. Make.com und Typeform werden nicht mehr verwendet.

## Aufbau

| Pfad | Zweck |
|---|---|
| `hq.html`, `hq.css`, `hq.js` | Oberfläche (`/hq`, noindex). Drei Module: „Übersicht“ (Startansicht), „Anfragen“, „Antragsentwurf“. Cache-Buster `?v=2`. |
| `api/lead.js` | Eingang der Formulare: Validierung (strenge E-Mail-Regel aus `form-guard.js`), Steuerzeichen-Filter, Whitelist je Typ, Rate-Limit, Speichern. |
| `api/hq/login.js` | Anmeldung (POST), Abmeldung (DELETE), Sitzung prüfen (GET). Sperre nach 6 Fehlversuchen je IP in 10 Minuten (produktiv persistent in `so_login_versuche`). |
| `api/hq/anfragen.js` | Übersicht, Liste (mit Treffern/Offset), Detail, Status/Notizen/Wiedervorlage/Antragsfelder/Ereignisse, Löschen mit Nachweis. |
| `api/hq/dokument.js` | Word-Dokument (Antragsentwurf oder Vollmacht) aus einer Anfrage; Header `X-Offene-Felder`. |
| `api/_lib/store.js` | Datenzugriff (Supabase per REST; lokal JSON-Datei über `SO_STORE_FILE`). Gemeinsamer Aggregator `uebersichtAusZeilen()` für beide Speicher. |
| `api/_lib/auth.js` | Benutzer aus `HQ_USERS`, HMAC-signierte Sitzung (`HQ_SECRET`), HttpOnly-Cookie `so_hq` (12 h). |
| `api/_lib/antrag.js` | Felder des Antragsentwurfs, Vorbelegung aus der Anfrage, Hinweise (z. B. Einkommensspanne), nicht zutreffende Felder. |
| `api/_lib/docx.js` | Minimaler ZIP-Leser/-Schreiber + Platzhalter-Ersetzung (`{{feld}}`), Zeilenumbrüche als `<w:br/>`. |
| `api/_templates/*.docx` | Kanzlei-Vorlagen mit Platzhaltern (Antragsentwurf, Vollmacht). |
| `.vercelignore` | Schließt `*.md`, `.claude/` und die internen Prüflisten `pruefliste-*.html` vom Deploy aus (diese Datei ist produktiv nicht abrufbar). |

Datenbank (Supabase, Schema `public`): `so_anfragen` (eine Zeile je Anfrage, laufende Nummer `SO-JJ-0001`, Status, Kontakt,
kompletter Payload in `daten`, Antragsfelder in `antrag`, Notizen, `wiedervorlage`), `so_ereignisse` (Verlauf),
`so_loeschungen` (Löschnachweis ohne Personendaten), `so_login_versuche` (Fehlversuche), View `so_anfragen_zaehler` (exakte Zähler).
RLS ist aktiv ohne Policies — Zugriff nur mit dem service_role-Key vom Server.

## Module und Reiter im HQ

- **Übersicht** (Startansicht nach dem Login, Hash `#m=uebersicht`): fünf Kennzahl-Kacheln (Neu · In Bearbeitung · Rückfrage offen · Mandate · Überfällig),
  Eingänge (Heute / 7 Tage / 30 Tage, Balken je Tag, Verteilung nach Formulartyp), Handlungsbedarf (neu, Rückfrage offen, fällige Wiedervorlage,
  Checkliste senden — überfällig zuerst), Letzte Eingänge, Fußzeile mit Datenquelle und Stand. Klick auf eine Kachel öffnet das Modul Anfragen mit passendem Status-Filter.
- **Anfragen** (`#m=anfragen[&a=<id>][&t=<reiter>]`): Liste (Suche, Status-Chips mit Zählern, Formular-Select, Tagestrenner, Alters- und Wiedervorlage-Badges,
  „Weitere 200 laden“) und Detail mit drei Reitern: **Anfrage** (Nachricht, Kontakt mit DSGVO-Zeile, Formularangaben, Notizen, bei Checklisten-Anfragen
  „Checkliste senden“), **Antragsentwurf** (Fortschritt, Gruppen, offene Felder, Dokumente), **Verlauf** (Ereignisse, Löschen mit Grund).
  Kopfzeile: Status, Wiedervorlage, E-Mail, Drucken, Nummer kopieren.
- **Antragsentwurf** (`#m=antrag`): dieselbe Ansicht, Liste fest auf Online-Anträge gefiltert, Reiter „Antragsentwurf“ vorgewählt.
- Tastatur: `/` fokussiert die Suche, `↑/↓` wechseln in der Liste, `Enter` öffnet, `Esc` schließt das Detail auf dem Handy.
- Zustände: Boot-Hinweis mit „Erneut versuchen“, Skeleton beim ersten Laden, Inline-Banner bei Ladefehlern (Daten bleiben gedimmt sichtbar),
  Toasts nur für Aktionen, Login-Overlay bei abgelaufener Sitzung (ungespeicherte Eingaben bleiben erhalten), Dirty-Abfrage vor Wechsel/Abmelden,
  Auto-Aktualisierung alle 60 s mit Hinweis „N neue Anfragen“ und Tab-Titel „(N neu) HQ · Scheidung-Online“.

## API-Vertrag (`/api/hq/*`, alle Antworten JSON mit `ok`)

| Aufruf | Antwort |
|---|---|
| `GET /api/hq/login` | `{ ok, user, exp }` oder `401 unauthorized` |
| `POST /api/hq/login` `{ name, passwort }` | `{ ok, user }`; `401 invalid_login`, `429 locked`, `503 hq_not_configured` |
| `DELETE /api/hq/login` | `{ ok }` (Cookie gelöscht) |
| `GET /api/hq/anfragen?uebersicht=1` | `{ ok, stand, speicher, zaehler, eingaenge{heute,tage7,tage30,nach_typ_30,je_tag_30[30]}, handlungsbedarf[≤50], handlungsbedarf_gesamt, ueberfaellig, heute_faellig, letzte[5] }` |
| `GET /api/hq/anfragen?status=&typ=&q=&offset=` | `{ ok, anfragen, treffer, offset, limit, zaehler, stand }` — `zaehler.gesamt/status` nach `typ` gefiltert, `zaehler.typ` global |
| `GET /api/hq/anfragen?id=…` | `{ ok, anfrage, verlauf, antragsfelder, antragswerte, vorbelegt, nichtZutreffend, hinweise }` |
| `PATCH /api/hq/anfragen?id=…` | Body `{ status \| notizen \| antrag{…} \| wiedervorlage ("JJJJ-MM-TT" oder null) \| ereignis:"checkliste_gesendet" }` → `{ ok, anfrage, antragswerte, … }`; Ereignisse nur bei tatsächlicher Änderung |
| `DELETE /api/hq/anfragen?id=…` | Body `{ grund }` → `{ ok }`; schreibt Löschnachweis |
| `GET /api/hq/dokument?id=…&typ=antragsentwurf\|vollmacht` | `.docx` mit `Content-Disposition` und `X-Offene-Felder` (kommagetrennt); Fehler als JSON |

Regeln für `handlungsbedarf.grund` / `ueberfaellig` (Zeitzone Europe/Berlin): `neu` bei Online-Antrag/Nachricht überfällig nach 48 h, bei Kosteneinschätzung
nach zwei Werktagen, Checkliste nie (bleibt bis „Als gesendet markieren“); `rueckfrage` überfällig nach 7 Tagen ohne Änderung; `wiedervorlage` hat Vorrang,
`faellig_heute`/`ueberfaellig` nach Datum. Fehlercodes sind Snake-Case-Strings; `hq.js` übersetzt sie zentral (`FEHLER`).

## Umgebungsvariablen (Vercel)

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Speicher. Fehlen sie, antwortet `/api/lead` mit `503 store_not_configured` (sichtbarer Fehler im Formular).
- `SO_DEMO=1` — nur für Vorschau-Deployments ohne Datenbank: `/api/lead` antwortet `200 { ok, demo:true }`, nichts wird gespeichert.
- `HQ_USERS` — `name:passwort;name2:passwort2`
- `HQ_SECRET` — lange Zufallszeichenfolge (≥ 16 Zeichen)
- `SO_STORE_FILE` — nur lokal: Pfad einer JSON-Datei statt Supabase.

## Supabase-Migration (am 18.10.2026 im Projekt `ixczixhykdvjxvgajcid` eingespielt — nur bei einer neuen Datenbank erneut nötig)

```sql
alter table public.so_anfragen
  alter column vorname set default '', alter column nachname set default '', alter column telefon set default '';
alter table public.so_anfragen add column if not exists wiedervorlage date;
create index if not exists so_anfragen_wv_idx on public.so_anfragen (wiedervorlage) where wiedervorlage is not null;
create index if not exists so_anfragen_status_created_idx on public.so_anfragen (status, created_at desc);
create or replace view public.so_anfragen_zaehler
  with (security_invoker = on) as
  select status, typ, count(*)::int as n from public.so_anfragen group by 1, 2;
revoke all on public.so_anfragen_zaehler from anon, authenticated;
create table if not exists public.so_loeschungen (
  id bigserial primary key, nummer text not null, typ text not null,
  benutzer text not null, zeit timestamptz not null default now(), grund text not null default '');
alter table public.so_loeschungen enable row level security;
create table if not exists public.so_login_versuche (
  id bigserial primary key, ip text not null, benutzer text not null default '', zeit timestamptz not null default now());
create index if not exists so_login_versuche_ip_zeit_idx on public.so_login_versuche (ip, zeit desc);
alter table public.so_login_versuche enable row level security;
-- Rechte: öffentliche Rollen bekommen nichts, nur service_role (Server)
revoke all on public.so_loeschungen, public.so_login_versuche, public.so_anfragen_zaehler from anon, authenticated;
grant select, insert, update, delete on public.so_anfragen, public.so_ereignisse, public.so_loeschungen, public.so_login_versuche to service_role;
grant select on public.so_anfragen_zaehler to service_role;
grant usage, select on sequence public.so_loeschungen_id_seq, public.so_login_versuche_id_seq, public.so_ereignisse_id_seq, public.so_anfragen_nr_seq to service_role;
```

Ohne die View fällt `counts()` auf die Zeilen zurück (Warnung im Log); ohne die Spalte `wiedervorlage` scheitern Übersicht und Wiedervorlage.

## Lokal testen

```bash
SO_STORE_FILE=/pfad/hq-dev.json HQ_USERS="name:passwort" HQ_SECRET="<zufall, mindestens 16 zeichen>" node <pfad>/devserver.js . 8742
```

`devserver.js` spielt Vercel nach: statische Dateien mit cleanUrls, `api/*.js` als Functions (Module werden je Request neu geladen;
die In-Memory-Login-Sperre ist deshalb lokal nicht testbar). Der Testplan (curl-Schritte, Browser Desktop/Mobil, Produktion) steht in der
Spezifikation „HQ Scheidung-Online — Spezifikation zur Fertigstellung“, Abschnitt 4.

Schnellprüfungen vor einem Deploy:

```bash
node --check hq.js
grep -n 'style=' hq.html hq.js            # muss leer sein (CSP ohne unsafe-inline)
grep -nE '#[0-9A-Fa-f]{3,8}\b' hq.css      # nur Zeilen innerhalb von :root
```
