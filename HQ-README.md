# HQ — internes Backoffice von Scheidung-Online

Alle Website-Formulare (Online-Antrag, Kosteneinschätzung, Nachricht, Checklisten-Versand) senden an `/api/lead`.
Dort wird validiert und die Anfrage in der Datenbank gespeichert. Make.com und Typeform werden nicht mehr verwendet.

## Aufbau

| Pfad | Zweck |
|---|---|
| `hq.html`, `hq.css`, `hq.js` | Oberfläche (`/hq`, noindex). Modul 1 „Anfragen“, Modul 2 „Antragsentwurf“. |
| `api/lead.js` | Eingang der Formulare: Validierung, Rate-Limit, Speichern, danach E-Mail an die Kanzlei. |
| `api/hq/login.js` | Anmeldung (POST), Abmeldung (DELETE), Sitzung prüfen (GET). |
| `api/hq/anfragen.js` | Liste/Detail/Status/Notizen/Antragsfelder/Löschen. |
| `api/hq/dokument.js` | Word-Dokument (Antragsentwurf oder Vollmacht) aus einer Anfrage. |
| `api/_lib/store.js` | Datenzugriff (Supabase per REST; lokal JSON-Datei über `SO_STORE_FILE`). |
| `api/_lib/notify.js` | E-Mail-Benachrichtigung bei neuer Anfrage über die Resend-HTTP-API (ohne npm-Paket). |
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
- `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_TO` — E-Mail-Benachrichtigung (siehe unten). Fehlt eine der drei, wird keine Mail
  verschickt; die Anfrage wird trotzdem gespeichert (nur ein Hinweis im Log).

## E-Mail-Benachrichtigung (Resend)

Nach jedem erfolgreichen Speichern schickt `/api/lead` eine E-Mail an die Kanzlei:
Betreff `Neue Anfrage SO-26-0001 · Online-Antrag · Max Mustermann`, im Text Nummer, Typ, Eingang, Quelle, Kontaktdaten,
die wichtigsten Formularangaben in lesbarer Form und der Link zum HQ. Die E-Mail-Adresse der anfragenden Person steht als
Antwortadresse (`reply_to`) drin. Im Betreff stehen keine sensiblen Daten. Ein Fehler beim Versand ändert nichts am
Ergebnis für die Website (200, Anfrage gespeichert); er wird geloggt und erscheint im Verlauf der Anfrage als
„E-Mail-Benachrichtigung fehlgeschlagen“.

Einrichtung (kostenloser Tarif reicht, 3.000 Mails/Monat, 100/Tag):

1. Konto bei [resend.com](https://resend.com) anlegen.
2. Unter **Domains** die Absenderdomain hinzufügen (z. B. `scheidung-online.de`) und die angezeigten DNS-Einträge
   (SPF/TXT, DKIM/CNAME, optional DMARC) beim Domain-Anbieter eintragen. Warten, bis der Status „Verified“ ist.
   Ohne verifizierte Domain nimmt Resend nur `onboarding@resend.dev` als Absender an, und das nur an die eigene Konto-Adresse.
3. Unter **API Keys** einen Schlüssel mit Berechtigung „Sending access“ erzeugen (beginnt mit `re_`).
4. In Vercel → Project → Settings → Environment Variables (Production) setzen:
   - `RESEND_API_KEY` — der Schlüssel aus Schritt 3
   - `MAIL_FROM` — Absender auf der verifizierten Domain, z. B. `HQ Scheidung-Online <hq@scheidung-online.de>`
   - `MAIL_TO` — Empfänger, kommagetrennt, z. B. `kontakt@jdwagner.de`
5. Neu deployen (Env-Variablen gelten erst für neue Deployments) und ein Testformular absenden.

Optional: `RESEND_API_URL` überschreibt die Resend-Adresse (`https://api.resend.com/emails`) — nur für lokale Tests
mit einem Fake-Endpunkt gedacht, in Vercel nicht setzen.

## Lokal testen

```bash
SO_STORE_FILE=/tmp/hq-dev.json HQ_USERS="test:test1234" HQ_SECRET="nur-lokal-0123456789abcdef" node <pfad>/devserver.js . 8742
```

`devserver.js` (im Scratchpad der Session) spielt Vercel nach: statische Dateien mit cleanUrls, `api/*.js` als Functions.
