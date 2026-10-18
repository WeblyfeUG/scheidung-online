# HQ — internes Backoffice von Scheidung-Online

Alle Website-Formulare (Online-Antrag, Kosteneinschätzung, Nachricht, Checklisten-Versand) senden an `/api/lead`.
Dort wird validiert und die Anfrage in der Datenbank gespeichert. Make.com und Typeform werden nicht mehr verwendet.

## Aufbau

| Pfad | Zweck |
|---|---|
| `hq.html`, `hq.css`, `hq.js` | Oberfläche (`/hq`, noindex). Modul 1 „Anfragen“, Modul 2 „Antragsentwurf“. |
| `api/lead.js` | Eingang der Formulare: Validierung, Rate-Limit, Speichern. |
| `api/hq/login.js` | Anmeldung (POST), Abmeldung (DELETE), Sitzung prüfen (GET). |
| `api/hq/anfragen.js` | Liste/Detail/Status/Notizen/Antragsfelder/Löschen. |
| `api/hq/dokument.js` | Word-Dokument (Antragsentwurf oder Vollmacht) aus einer Anfrage. |
| `api/_lib/store.js` | Datenzugriff (Supabase per REST; lokal JSON-Datei über `SO_STORE_FILE`). |
| `api/_lib/auth.js` | Benutzer aus `HQ_USERS`, HMAC-signierte Sitzung (`HQ_SECRET`), HttpOnly-Cookie. |
| `api/_lib/antrag.js` | Felder des Antragsentwurfs + Vorbelegung aus der Anfrage. |
| `api/_lib/docx.js` | Minimaler ZIP-Leser/-Schreiber + Platzhalter-Ersetzung (`{{feld}}`). |
| `api/_templates/*.docx` | Kanzlei-Vorlagen mit Platzhaltern (Antragsentwurf 26 Felder, Vollmacht 4). |

Datenbank (Supabase, Schema `public`): `so_anfragen` (eine Zeile je Anfrage, laufende Nummer `SO-JJ-0001`,
Status, Kontakt, kompletter Payload in `daten`, Antragsfelder in `antrag`, Notizen) und `so_ereignisse` (Verlauf).
RLS ist aktiv ohne Policies — Zugriff nur mit dem service_role-Key vom Server.

## Umgebungsvariablen (Vercel)

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Speicher. Fehlen sie, läuft `/api/lead` im Demo-Modus (200, nichts gespeichert).
- `HQ_USERS` — `name:passwort;name2:passwort2`
- `HQ_SECRET` — lange Zufallszeichenfolge (≥ 16 Zeichen)

## Lokal testen

```bash
SO_STORE_FILE=/tmp/hq-dev.json HQ_USERS="test:test1234" HQ_SECRET="nur-lokal-0123456789abcdef" node <pfad>/devserver.js . 8742
```

`devserver.js` (im Scratchpad der Session) spielt Vercel nach: statische Dateien mit cleanUrls, `api/*.js` als Functions.
