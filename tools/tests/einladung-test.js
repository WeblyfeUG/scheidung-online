/* Einladung ins HQ: einladen → Mail → Passwort festlegen → Anmelden → Rechte → Sperren → Entfernen.
   Voraussetzung: tools/devserver.js läuft (HQ_USERS mit Admin „janine:Test-Passwort-1“, MAIL_PROVIDER=log, SO_MAIL_DIR).
   Umgebung: TEST_PORT (8742), TEST_MAILS (= SO_MAIL_DIR des Servers). */
const fs = require('fs');
const path = require('path');
const B = 'http://localhost:' + (process.env.TEST_PORT || '8742');
const MAILS = process.env.TEST_MAILS;
let fehlerZahl = 0;
const ok = (bed, text) => { console.log((bed ? '  ✓ ' : '  ✗ ') + text); if (!bed) fehlerZahl++; };

function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(B + p, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(/,(?=\s*so_)/).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
    return Object.assign(await r.json().catch(() => ({})), { status: r.status });
  };
}
const letzteMail = (an) => fs.readdirSync(MAILS).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAILS, f), 'utf8'))).filter((m) => m.an === an).pop();

(async () => {
  const email = 'test.einladung.' + Date.now() + '@example.de';
  const admin = client();
  const neu = client();
  let r = await admin('POST', '/api/hq/login', { name: 'janine', passwort: 'Test-Passwort-1' });
  ok(r.ok && r.admin, 'Admin angemeldet');

  r = await admin('POST', '/api/hq/benutzer', { email: 'kein-mail', rolle: 'mitarbeit' });
  ok(r.status === 400 && r.error === 'invalid_email', 'ungültige E-Mail abgelehnt');
  r = await admin('POST', '/api/hq/benutzer', { email, name: 'Testa Einladung', rolle: 'mitarbeit' });
  ok(r.ok && r.benutzer.status === 'eingeladen' && r.mail.ok && !r.link, 'Einladung erstellt, Mail gesendet, kein Link in der Antwort');
  const id = r.benutzer.id;
  const mail = letzteMail(email);
  ok(mail && /Einladung zum Kanzlei-HQ/.test(mail.betreff), 'Einladungsmail an die Person');
  const token = /#\/einladung\/([A-Za-z0-9_-]+)/.exec(mail.text)[1];

  r = await neu('GET', '/api/hq/einladung?token=' + token);
  ok(r.ok && r.email === email && r.name === 'Testa Einladung', 'Einladung gültig, Name/E-Mail stimmen');
  r = await neu('POST', '/api/hq/einladung', { token, passwort: 'kurz' });
  ok(r.status === 400 && r.error === 'password_too_short', 'zu kurzes Passwort abgelehnt');
  r = await neu('POST', '/api/hq/einladung', { token, passwort: 'Ein-sicheres-Passwort-1' });
  ok(r.ok, 'Passwort festgelegt');
  r = await neu('POST', '/api/hq/einladung', { token, passwort: 'Noch-ein-Passwort-2' });
  ok(r.status === 404 && r.error === 'link_invalid', 'Einladungslink danach verbraucht');

  r = await neu('POST', '/api/hq/login', { name: email, passwort: 'falsches-passwort' });
  ok(r.status === 401, 'falsches Passwort → 401');
  r = await neu('POST', '/api/hq/login', { name: email.toUpperCase(), passwort: 'Ein-sicheres-Passwort-1' });
  ok(r.ok && r.user === email && r.admin === false && r.name === 'Testa Einladung', 'Anmeldung mit E-Mail (Groß/Klein egal), Rolle Mitarbeit');
  r = await neu('GET', '/api/hq/anfragen');
  ok(r.ok, 'Mitarbeit sieht den Posteingang');
  r = await neu('PUT', '/api/hq/einstellungen', { antwortzeiten: { anfrage: '24 Stunden' } });
  ok(r.status === 403, 'Mitarbeit darf Einstellungen nicht ändern');
  r = await neu('POST', '/api/hq/benutzer', { email: 'x@example.de' });
  ok(r.status === 403, 'Mitarbeit darf niemanden einladen');

  r = await admin('GET', '/api/hq/benutzer');
  ok(r.ok && r.benutzer.some((b) => b.email === email && b.status === 'aktiv'), 'Liste zeigt die Person als aktiv');
  r = await admin('POST', '/api/hq/benutzer', { email });
  ok(r.status === 409 && r.error === 'already_exists', 'doppelte Einladung einer aktiven Person abgelehnt');

  r = await admin('PATCH', '/api/hq/benutzer?id=' + id, { aktiv: false });
  ok(r.ok && r.benutzer.status === 'gesperrt', 'Zugang gesperrt');
  r = await neu('GET', '/api/hq/anfragen');
  ok(r.status === 401, 'gesperrt → laufende Sitzung sofort ungültig');
  r = await neu('POST', '/api/hq/login', { name: email, passwort: 'Ein-sicheres-Passwort-1' });
  ok(r.status === 401, 'gesperrt → Anmeldung nicht möglich');
  r = await admin('PATCH', '/api/hq/benutzer?id=' + id, { aktiv: true, rolle: 'admin' });
  ok(r.ok && r.benutzer.status === 'aktiv' && r.benutzer.rolle === 'admin', 'entsperrt und zum Admin gemacht');
  r = await neu('POST', '/api/hq/login', { name: email, passwort: 'Ein-sicheres-Passwort-1' });
  ok(r.ok && r.admin === true, 'Anmeldung als Admin');

  r = await admin('PATCH', '/api/hq/benutzer?id=' + id, { erneut_einladen: true });
  ok(r.ok && r.mail.ok, 'Passwort zurücksetzen (neue Einladung) gesendet');
  r = await admin('DELETE', '/api/hq/benutzer?id=' + id);
  ok(r.ok, 'Zugang entfernt');
  r = await neu('GET', '/api/hq/anfragen');
  ok(r.status === 401, 'entfernt → Sitzung ungültig');

  console.log(fehlerZahl ? `\n${fehlerZahl} FEHLER` : '\nEINLADUNG OK');
  process.exit(fehlerZahl ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
