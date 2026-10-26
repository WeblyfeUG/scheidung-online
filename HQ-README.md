# HQ v2 + Mandanten-Bereich — Automatisierung Scheidung-Online

Alle Website-Formulare (Online-Antrag, Kosteneinschätzung, Nachricht, Checklisten-Versand) senden an `/api/lead`.
Von dort läuft der digitale Ablauf: Eingangsbestätigung → Prüfung im HQ (mit KI-Einordnung) → Mandat online
unterschreiben → Fragebogen → Gegenstandswert/Kosten → Scheidungsantrag (Word) → beA-Markierung → Gerichtstermin →
Abschluss — mit E-Mails an die Mandantin/den Mandanten an jeder Stufe.

## Aufbau

| Pfad | Zweck |
|---|---|
| `hq.html`, `hq.css`, `hq.js` | Kanzlei-HQ (`/hq`, noindex, strikte CSP): B1 Login mit Zwei-Faktor, B2 Posteingang/Akten (Kennzahlen, Liste, Kanban, Spam), B3 Anfrage-Detail (KI, Aktionen mit E-Mail-Vorschau, Antwortentwurf), B4 Akte mit 7 Reitern, B5 Vorlagen, B6 Einstellungen. Routing per Hash: `#/posteingang`, `#/akten`, `#/a/<id>[/<reiter>]`, `#/vorlagen`, `#/einstellungen`. |
| `mandant.html`, `mandant.css`, `mandant.js` | Mandanten-Bereich ohne Konto: `/m/<token>` Mandat erteilen (A2), `/f/<token>` Fragebogen (A3, Autosave, Uploads), `/s/<token>` Status-Seite (A4). Rewrites in `vercel.json`. |
| `api/lead.js` | Formulareingang (Validierung, Spam-Schutz, Rate-Limit), danach A1.1 Eingangsbestätigung mit Checkliste und KI-Einordnung. |
| `api/hq/[route].js` | Ein Router für alle HQ-Endpunkte (Vercel Hobby: max. 12 Functions). Handler in `api/_hq/`. |
| `api/m/[route].js` | Ein Router für den Mandanten-Bereich, Rate-Limit 30/min je IP. Handler in `api/_m/mandant.js`. |
| `api/cron/erinnerungen.js` | Täglicher Lauf (Vercel Cron, 07:00 UTC ≈ 08/09 Uhr Berlin): Erinnerungen A1.4, danach Notiz „keine Reaktion“. |
| `api/_lib/store.js` | Datenzugriff Supabase (PostgREST + Storage) bzw. lokal JSON-Datei (`SO_STORE_FILE`). Generische `rows/insert/upsert/update/remove`, Dateien `putFile/readFile/removeFiles`. |
| `api/_lib/ablauf.js` | Statusmodell, `setStatus()` (Ereignis + Zeitstempel), HQ-Aktionen inkl. E-Mail. |
| `api/_lib/mail.js`, `vorlagen.js` | Versand (Resend oder Log), HTML-Layout wie A1, Platzhalter `{{…}}`, Sonderzeilen `[button: …|…]`, `[hinweis: …]`, `[tabelle]`; Standardtexte im Code, Änderungen aus B5 in `so_vorlagen`. |
| `api/_lib/links.js` | Persönliche Links (32 Byte Zufall, nur SHA-256-Hash gespeichert, 14 Tage, Status-Link 365 Tage). |
| `api/_lib/fragebogen.js` | Felder der 7 Schritte, Vorbelegung aus der Anfrage, Prüfung je Schritt, Hinweise, fehlende Unterlagen. |
| `api/_lib/kosten.js` | Gegenstandswert und Kosten nach RVG/FamGKG (Tabellen ab 01.06.2025, KostBRÄG 2025). |
| `api/_lib/scheidungsantrag.js` | Vorschau-Segmente + Prüfhinweise (B4-5) und Werte für `api/_templates/antragsentwurf.docx`. |
| `api/_lib/pdf.js` | PDF der unterschriebenen Mandatsdokumente (`pdf-lib`, einzige npm-Abhängigkeit). |
| `api/_lib/ki.js` | KI-Einordnung über die Anthropic Messages API (JSON-Schema, pseudonymisiert, abschaltbar). |
| `api/_lib/upload.js` | Uploads in Teilen ≤ 3 MB (Vercel-Limit 4,5 MB je Request), max. 10 MB, Typprüfung per Magic Bytes. |
| `api/_lib/auth.js` | `HQ_USERS`, HMAC-Sitzung (`HQ_SECRET`, Cookie `so_hq`, 12 h), TOTP (RFC 6238) mit Vor-Cookie (5 Min), Rolle Admin (`HQ_ADMINS`). |
| `supabase/migrations/2026-10-automatisierung.sql` | Migration (idempotent). Nicht deployt (`.vercelignore`). |
| `tools/devserver.js`, `tools/tests/` | Lokaler Vercel-Nachbau und Tests. Nicht deployt. |

## Statusmodell

`neu → in_pruefung → mandat_angeboten → unterschrieben → fragebogen_vollstaendig → antrag_vorbereitung → eingereicht → termin → abgeschlossen`,
Nebenzweige `erstgespraech`, `abgesagt`, `widerrufen`. Ab `unterschrieben` gilt eine Anfrage als Akte (Modul „Akten“, Ansicht B4).

| Auslöser | E-Mail | Status |
|---|---|---|
| Formular eingegangen | A1.1 mit Checkliste (bei `checkliste_pdf` genügt das → `abgeschlossen`) | — |
| HQ „Mandat anbieten“ | A1.2 mit `/m/`-Link | `mandat_angeboten` |
| HQ „Erstgespräch vorschlagen“ / „Absagen“ | A1.3 / A1.abs | `erstgespraech` / `abgesagt` |
| HQ „Kostenübersicht senden“ | A1.5 mit Kostentabelle | — |
| Mandant unterschreibt | A1.mand mit PDF; interne Info | `unterschrieben`, Widerrufsfrist +14 Tage |
| Fragebogen abgesendet | interne Info | `fragebogen_vollstaendig` |
| Erster Word-Download des Antrags | — (Datei wird in der Akte abgelegt) | `antrag_vorbereitung` |
| HQ „Als eingereicht markieren (beA)“ mit Aktenzeichen | A1.7 mit Status-Link | `eingereicht` |
| HQ Scheidungstermin gespeichert | A1.8 | `termin` |
| HQ „Scheidung rechtskräftig“ | A1.9 | `abgeschlossen` |
| Cron: keine Unterschrift / kein Fragebogen nach 3 bzw. 7 Tagen (B6) | A1.4 | — |
| Manuell (Reiter Kommunikation) | A1.6 Vorschussrechnung (Anhang aus der Akte), A1.10 Infoschreiben Ehepartner, alle anderen | — |

Ist bei einer Vorlage „automatisch“ ausgeschaltet (B5), entsteht nur ein Entwurf (`so_mails.status = geplant`), freizugeben in „Kommunikation“.
Mailfehler blockieren nie den Statuswechsel (Status `fehler`, „Erneut senden“). Persönliche Links werden nach dem Versand im Protokoll maskiert.

„Mandat anbieten“ bleibt gesperrt, bis **Widerrufsbelehrung** (`DOK.widerruf`) und **Gebührenhinweis** (`DOK.gebuehren`) in B5 gepflegt sind.

## API-Vertrag (alle Antworten JSON `{ ok, … }` bzw. `{ ok:false, error:'snake_case' }`)

HQ (`/api/hq/*`, Cookie-Sitzung; Änderungen an Vorlagen/Einstellungen nur Admin):

| Aufruf | Zweck |
|---|---|
| `GET/POST/DELETE login` | Sitzung prüfen · Schritt 1 `{name\|email, passwort}` → `{schritt:2}` oder Sitzung · Schritt 2 `{code}` · Abmelden |
| `GET anfragen?modul=posteingang\|akten&status=&quelle=&q=&offset=&spam=1` | Liste + `kpi` + `zaehler` + `spam[]`; `status=antraege_pruefen` fasst zwei Status zusammen |
| `GET/PATCH/DELETE anfragen?id=` | Detail (inkl. `mandat_freigabe`) · `{notizen, wiedervorlage, az_kanzlei, az_gericht, gericht, status}` (Status ohne Mail, z. B. „Rückgängig“) · Löschen mit `{grund}` (inkl. Dateien) |
| `POST aktion?id=` | `{art: mandat_anbieten\|erstgespraech\|kosten\|absage\|spam\|kein_spam\|bea\|abgeschlossen\|in_pruefung\|widerrufen, text?, az_gericht?}` → `{anfrage, mail}` |
| `POST ki?id=` | KI-Einordnung neu anstoßen |
| `GET akte?id=` | alles für B4 (Angaben, Fragebogen, Dokumente, Mandat, Kosten, Termine, Mails, Verlauf, Checkliste) |
| `PATCH fragebogen?id=` | `{daten}` Kanzlei-Änderungen, protokolliert in `kanzlei_aenderungen` |
| `GET/POST/DELETE dokumente?id=` · `GET datei?dok=` | Liste · Upload in Teilen (`art, upload, teil, teile`, Roh-Body, Header `X-Dateiname`) · Löschen · Download (nur über die Sitzung) |
| `GET/PUT kosten?id=` | Berechnung (Query überschreibt) · Überschreibungen speichern (`null` = zurücksetzen), `vorschuss_bezahlt` |
| `GET antrag?id=` · `GET dokument?id=&typ=scheidungsantrag\|vollmacht` | Vorschau + Warnungen · Word (`X-Offene-Felder`) |
| `POST/DELETE termine?id=` | `{datum, uhrzeit, ort, art}` · `&termin=` |
| `GET/POST mails?id=` · `POST mails-erneut?mail=` | Liste · `{vorlage, text?, an?, anhaenge?, persoenlicher_text?, vorschau?}` · Entwurf/Fehler erneut senden |
| `GET/PUT vorlagen` · `GET/PUT einstellungen` | B5 (unbekannte Platzhalter → `400 unknown_placeholders`) · B6 |

Mandant (`/api/m/*?token=`): `GET/POST mandat` (409 `already_signed`), `GET/PATCH/POST fragebogen` (`{schritt, daten, pruefen?}`),
`POST/DELETE upload`, `GET datei?dok=`, `GET status`, `POST weiter` („Später weitermachen“), `POST link-neu` (gedrosselt 1×/10 Min.).
Link-Fehler: `404 link_invalid`, `410 link_expired`, `410 link_revoked`. Der Mandat-Link öffnet nach der Unterschrift auch Fragebogen und Status-Seite.

## Umgebungsvariablen (Vercel)

| Variable | Zweck |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Datenbank + Storage (service_role, nur serverseitig) |
| `SUPABASE_STORAGE_BUCKET` | optional, Standard `so-dokumente` |
| `HQ_USERS` | `name:passwort` oder `name:passwort:BASE32GEHEIMNIS` (Zwei-Faktor), mehrere mit `;` |
| `HQ_ADMINS` | Benutzernamen mit Admin-Rolle, kommagetrennt (leer = alle Admin) |
| `HQ_SECRET` | ≥ 16 Zeichen Zufall (Sitzung, IP-Hash im Mandat) |
| `MAIL_PROVIDER`, `MAIL_API_KEY` | `resend` + API-Key. `log` = nur protokollieren (Test). Ohne Angabe: Versuch wird als `mail_not_configured` protokolliert. |
| `MAIL_FROM`, `MAIL_INTERN` | Absender (Domain bei Resend verifizieren: SPF/DKIM/DMARC) · Empfänger interner Hinweise (beides auch in B6 änderbar) |
| `LINK_BASE_URL` | z. B. `https://www.scheidung-online.de` (Basis der persönlichen Links) |
| `ANTHROPIC_API_KEY`, `KI_MODELL` | KI-Einordnung (Standardmodell `claude-opus-5-5`) |
| `CRON_SECRET` | ≥ 16 Zeichen; Vercel sendet ihn als `Authorization: Bearer …` an den Cron |
| `SO_STORE_FILE`, `SO_MAIL_DIR`, `SO_DEMO` | nur lokal/Vorschau |

Zwei-Faktor einrichten: Geheimnis erzeugen mit
`node -e "const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';console.log(Array.from(require('crypto').randomBytes(32),b=>a[b%32]).join(''))"`,
als drittes Feld in `HQ_USERS` eintragen und in der Authenticator-App unter „Schlüssel eingeben“ (zeitbasiert) hinterlegen.

## Migration

`supabase/migrations/2026-10-automatisierung.sql` (idempotent, lokal gegen eine Kopie des Produktions-Schemas zweimal erfolgreich ausgeführt):
neue Statusliste mit Überführung der Altwerte (`in_bearbeitung/rueckfrage → in_pruefung` + Notiz, `mandat → unterschrieben`, `erledigt → abgeschlossen`,
`abgelehnt → abgesagt`), neue Spalten an `so_anfragen`, Tabellen `so_links`, `so_mandate`, `so_fragebogen`, `so_dokumente`, `so_mails`,
`so_termine`, `so_vorlagen`, `so_einstellungen` (RLS ohne Policies, nur service_role, Cascade beim Löschen), privater Storage-Bucket `so-dokumente`.
**Erst zusammen mit dem Deploy dieses Stands einspielen** — das alte HQ kennt die neuen Status nicht.

## Lokal testen

```bash
npm install
SO_STORE_FILE=/tmp/hq.json SO_MAIL_DIR=/tmp/mails MAIL_PROVIDER=log LINK_BASE_URL=http://localhost:8742 \
HQ_USERS="janine:Test-Passwort-1;assistenz:Test-Passwort-2:JBSWY3DPEHPK3PXP" HQ_ADMINS=janine HQ_SECRET=lokales-geheimnis-123456 \
CRON_SECRET=cron-geheimnis-1234567890 node tools/devserver.js 8742

# zweites Terminal
TEST_PORT=8742 TEST_MAILS=/tmp/mails TEST_STORE=/tmp/hq.json node tools/tests/api-test.js   # kompletter Ablauf über die API
node tools/tests/unit.js                                                                   # KI (simuliert) + Erinnerungen
```

`devserver.js` spielt Vercel nach (cleanUrls, Rewrites und Header inkl. CSP aus `vercel.json`, dynamische Routen `[route].js`).
Gegen Supabase lässt sich derselbe Test mit `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` am Dev-Server und `TEST_SB`/`TEST_STORAGE` fahren.

Schnellprüfungen vor einem Deploy:

```bash
node --check hq.js && node --check mandant.js
grep -n 'style=' hq.html mandant.html                          # muss leer sein (CSP ohne unsafe-inline)
awk '/^:root/,/^}/{next} /#[0-9A-Fa-f]{3,8}\b/' hq.css mandant.css   # muss leer sein (Farben nur als Tokens)
```

## Offene Punkte der Kanzlei (vor Go-live)

1. Texte Widerrufsbelehrung + Muster-Widerrufsformular und Gebührenhinweis § 49b Abs. 5 BRAO (B5 → „Texte im Mandat“), Datenschutzhinweise prüfen.
2. Formulierung bei Antragstellung vor Ablauf des Trennungsjahres (heute: Warnhinweis in B4-5, Text im Word manuell anpassen).
3. Freigabe der Unterschriftsform (einfache elektronische Signatur, PDF mit Zeitstempel, IP-Hash, Dokumentversion).
4. E-Mail-Anbieter (Empfehlung Resend) und AV-Verträge (Mail, KI, Speicher); Domain für den Absender verifizieren.
5. Optional eigene Word-Vorlage `scheidungsantrag.docx`; bis dahin wird `antragsentwurf.docx` mit den Fragebogendaten gefüllt.
