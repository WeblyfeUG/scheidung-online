/* End-to-End über die API: Anfrage → Mandat → Fragebogen → Antrag → beA → Termin → Abschluss.
   Voraussetzung: tools/devserver.js läuft mit SO_STORE_FILE (siehe HQ-README.md, „Lokal testen“).
   Umgebung: TEST_PORT (8742), TEST_MAILS (= SO_MAIL_DIR des Servers), TEST_STORE (= SO_STORE_FILE).
   Gegen Supabase/PostgREST zusätzlich TEST_SB (service-Key) und TEST_STORAGE (Dateiablage des Storage-Nachbaus). */
const fs = require('fs');
const path = require('path');
const PORT = process.env.TEST_PORT || '8742';
const B = 'http://localhost:' + PORT;
const MAILS = process.env.TEST_MAILS;
const STORE = process.env.TEST_STORE;
/* Testunterschrift (PNG 300×100) erzeugen */
function sigPng() {
  const zlib = require('zlib'); const w = 300, hh = 100; const raw = Buffer.alloc((w * 4 + 1) * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = 20; raw[o + 1] = 40; raw[o + 2] = 80; raw[o + 3] = Math.abs(y - 50 - 30 * Math.sin(x / 20)) < 2 ? 255 : 0; }
  const tab = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(hh, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let cookie = '';
let fehlerZahl = 0;
const ok = (bed, text) => { console.log((bed ? '  ✓ ' : '  ✗ ') + text); if (!bed) fehlerZahl++; };

async function api(method, p, body, extra = {}) {
  const headers = Object.assign({ cookie }, extra.headers || {});
  let b = body;
  if (body && !Buffer.isBuffer(body)) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(B + p, { method, headers, body: b });
  const sc = r.headers.get('set-cookie');
  if (sc && !extra.keinCookie) cookie = sc.split(/,(?=\s*so_)/).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
}
const mails = () => (fs.existsSync(MAILS) ? fs.readdirSync(MAILS).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAILS, f), 'utf8'))) : []);
const letzteMail = (betreff) => mails().filter((m) => m.betreff.includes(betreff)).pop();
const linkAus = (m, art) => { const x = new RegExp('http://localhost:' + PORT + '/' + art + '/([A-Za-z0-9_-]+)').exec(m.text); return x && x[1]; };

(async () => {
  console.log('1. Website-Anfrage');
  const lead = await api('POST', '/api/lead', {
    meta: { quelle: 'Online-Scheidung Formular', seite: 'http://localhost/', guard: { hp: '', fill_ms: 5000 } },
    kontakt: { vorname: 'Maria', nachname: 'Beispiel', email: 'maria.beispiel@example.de', telefon: '0511 123456' },
    situation: { mindestens_ein_jahr_getrennt: 'Ja', heiratsdatum: '2014-05-17', trennung_beginn: '2025-02-01', ehewohnung_plz: '30159', ehewohnung_ort: 'Hannover' },
    ehepartner: { name: 'Thomas Beispiel', anschrift: 'Lindenallee 4, 30163 Hannover' },
    kinder: { vorhanden: 'Ja', anzahl: '1', wohnort: 'Bei mir' },
    scheidung: { einvernehmlich: 'Ja' },
    ergaenzung: { anschrift: 'Musterweg 3, 30159 Hannover', nettoeinkommen_antragsteller: '2600', nettoeinkommen_antragsgegner: '3100', kind_1: 'Lena Beispiel, geb. am 03.04.2016', staatsangehoerigkeit: 'deutsch / deutsch' },
    nachricht: 'Wir sind uns einig.', dsgvo_zugestimmt: true
  });
  ok(lead.status === 200 && lead.body.nummer, 'Anfrage gespeichert ' + lead.body.nummer);
  ok(!!letzteMail('Ihre Anfrage ist bei uns eingegangen'), 'A1.1 Eingangsbestätigung versendet');
  const a11 = letzteMail('Ihre Anfrage ist bei uns eingegangen');
  ok(a11 && a11.anhaenge.length === 1, 'A1.1 mit Checkliste im Anhang');

  console.log('2. HQ-Login + Posteingang');
  let r = await api('POST', '/api/hq/login', { name: 'janine', passwort: 'falsch' });
  ok(r.status === 401, 'falsches Passwort → 401');
  r = await api('POST', '/api/hq/login', { name: 'janine', passwort: 'Test-Passwort-1' });
  ok(r.status === 200 && r.body.admin === true, 'Login janine (Admin, ohne 2FA)');
  r = await api('GET', '/api/hq/anfragen');
  ok(r.status === 200 && r.body.anfragen.length >= 1 && r.body.kpi.neu >= 1, 'Liste + Kennzahlen (neu=' + r.body.kpi.neu + ')');
  const id = r.body.anfragen[0].id;
  // Ausgangslage unabhängig vom Datenbestand: Mandatstexte auf Standard (leer) zurücksetzen
  await api('PUT', '/api/hq/vorlagen', { id: 'DOK.widerruf', zuruecksetzen: true });
  await api('PUT', '/api/hq/vorlagen', { id: 'DOK.gebuehren', zuruecksetzen: true });
  r = await api('GET', '/api/hq/anfragen?id=' + id);
  ok(r.status === 200 && r.body.mandat_freigabe.frei === false, 'Mandat-Freigabe gesperrt (Texte fehlen)');
  r = await api('POST', '/api/hq/aktion?id=' + id, { art: 'mandat_anbieten', text: 'Test' });
  ok(r.status === 409 && r.body.error === 'mandat_texte_fehlen', 'Mandat anbieten ohne Texte → 409');

  console.log('3. Vorlagen pflegen');
  r = await api('PUT', '/api/hq/vorlagen', { id: 'DOK.widerruf', text: 'Widerrufsbelehrung {{unbekannt}}' });
  ok(r.status === 400 && r.body.error === 'unknown_placeholders', 'unbekannter Platzhalter abgelehnt');
  r = await api('PUT', '/api/hq/vorlagen', { id: 'DOK.widerruf', text: 'Widerrufsbelehrung: Sie können Ihre Vertragserklärung innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. (Testtext)' });
  ok(r.status === 200, 'DOK.widerruf gespeichert');
  r = await api('PUT', '/api/hq/vorlagen', { id: 'DOK.gebuehren', text: 'Die Gebühren richten sich nach dem Gegenstandswert (§ 49b Abs. 5 BRAO). (Testtext)' });
  ok(r.status === 200, 'DOK.gebuehren gespeichert');

  console.log('4. Aktion: Mandat anbieten');
  r = await api('POST', '/api/hq/mails?id=' + id, { vorlage: 'A1.2', persoenlicher_text: 'ich übernehme gern.', vorschau: true });
  ok(r.status === 200 && r.body.vorschau.text.includes('ich übernehme gern.') && r.body.vorschau.text.includes('{{link_mandat}}'), 'Vorschau A1.2');
  r = await api('POST', '/api/hq/aktion?id=' + id, { art: 'mandat_anbieten', text: 'ich habe mir Ihre Angaben angesehen.' });
  ok(r.status === 200 && r.body.anfrage.status === 'mandat_angeboten' && r.body.mail.status === 'gesendet', 'Status mandat_angeboten, A1.2 gesendet');
  const a12 = letzteMail('Ihr Mandat und Fragebogen');
  const token = linkAus(a12, 'm');
  ok(!!token, 'A1.2 enthält Link /m/…');

  console.log('5. Mandant: Mandat unterschreiben');
  r = await api('GET', '/api/m/mandat?token=' + token, null, { keinCookie: true, headers: { cookie: '' } });
  ok(r.status === 200 && r.body.dokumente.length === 4 && !r.body.unterschrieben, 'Mandat geladen, 4 Dokumente');
  ok(r.body.dokumente[0].text.includes('Beispiel ./. Beispiel'), 'Platzhalter im Auftrag gefüllt');
  r = await api('GET', '/api/m/mandat?token=xxx' + token.slice(3), null, { keinCookie: true });
  ok(r.status === 404, 'falscher Token → 404');
  r = await api('GET', '/api/m/fragebogen?token=' + token, null, { keinCookie: true });
  ok(r.status === 409 && r.body.error === 'not_signed', 'Fragebogen vor Unterschrift gesperrt');
  const png = sigPng().toString('base64');
  r = await api('POST', '/api/m/mandat?token=' + token, { bestaetigungen: { auftrag: true, widerruf: true, gebuehren: true }, ort: 'Hannover', unterschrift: 'data:image/png;base64,' + png }, { keinCookie: true });
  ok(r.status === 400 && r.body.error === 'confirmations_required', 'fehlende Bestätigung → 400');
  r = await api('POST', '/api/m/mandat?token=' + token, { bestaetigungen: { auftrag: true, widerruf: true, gebuehren: true, datenschutz: true }, sofort_taetig: true, ort: 'Hannover', unterschrift: 'data:image/png;base64,' + png }, { keinCookie: true });
  ok(r.status === 200 && r.body.fragebogen_url === '/f/' + token, 'unterschrieben → Weiterleitung Fragebogen');
  const pdfDok = r.body.pdf_dok;
  r = await api('POST', '/api/m/mandat?token=' + token, { bestaetigungen: { auftrag: true, widerruf: true, gebuehren: true, datenschutz: true }, ort: 'Hannover', unterschrift: 'data:image/png;base64,' + png }, { keinCookie: true });
  ok(r.status === 409 && r.body.error === 'already_signed', 'zweite Unterschrift → 409');
  r = await api('GET', '/api/m/datei?token=' + token + '&dok=' + pdfDok, null, { keinCookie: true });
  ok(r.status === 200 && r.body.slice(0, 5).toString() === '%PDF-', 'Mandats-PDF abrufbar');
  const mand = letzteMail('Ihr Mandat ist erteilt');
  ok(mand && mand.anhaenge.length === 1, 'A1.mand mit PDF-Anhang');

  console.log('6. Fragebogen');
  r = await api('GET', '/api/m/fragebogen?token=' + token, null, { keinCookie: true });
  ok(r.status === 200 && r.body.fragebogen.daten.as_vorname === 'Maria' && r.body.vorbelegt.includes('ag_nachname'), 'vorbelegt aus Anfrage');
  ok(r.body.fragebogen.daten.kinder && r.body.fragebogen.daten.kinder[0].geburtsdatum === '2016-04-03', 'Kind aus Anfrage übernommen');
  r = await api('PATCH', '/api/m/fragebogen?token=' + token, { schritt: 1, pruefen: true, daten: { as_vorname: '' } }, { keinCookie: true });
  ok(r.status === 400 && r.body.error === 'missing_fields', 'Pflichtfeld leer → missing_fields');
  r = await api('PATCH', '/api/m/fragebogen?token=' + token, { schritt: 1, daten: { as_vorname: 'Maria', as_geburtsdatum: '1988-02-30' } }, { keinCookie: true });
  ok(r.status === 400 && r.body.felder.as_geburtsdatum === 'datum', 'ungültiges Datum erkannt');
  r = await api('PATCH', '/api/m/fragebogen?token=' + token, { schritt: 6, pruefen: true, daten: {
    as_vorname: 'Maria', as_geburtsname: 'Muster', as_geburtsdatum: '1988-02-12', ag_geburtsdatum: '1986-07-01', ehe_standesamt: 'Hannover', ehe_registernr: 'E 123/2014',
    ehewhg_noch_bewohnt: 'Ja, ich', kinder_aufenthalt: 'Bei mir', zustimmung: 'Ja', fs_unterhalt: 'Ja', fs_hausrat: 'Ja', fs_sorge: 'Ja', anderweitig_anhaengig: 'Nein', ehevertrag: 'Nein',
    ek_as: '2600', ek_ag: '3100', anrechte: [{ art: 'gesetzlich', traeger: 'DRV', nummer: '', inhaber: 'ich' }, { art: 'gesetzlich', traeger: 'DRV', nummer: '', inhaber: 'ehepartner' }, { art: 'betrieb', traeger: 'Firma', nummer: '', inhaber: 'ehepartner' }], vkh: 'Nein' } }, { keinCookie: true });
  ok(r.status === 200, 'Schritte 1–6 gespeichert');
  // Upload in zwei Teilen
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4 * 1024 * 1024, 32)]);
  const up = 'test-upload-1';
  r = await api('POST', `/api/m/upload?token=${token}&art=heiratsurkunde&upload=${up}&teil=0&teile=2`, pdf.slice(0, 3 * 1024 * 1024), { keinCookie: true, headers: { 'content-type': 'application/pdf', 'x-dateiname': 'Heiratsurkunde.pdf' } });
  ok(r.status === 200 && r.body.fertig === false, 'Upload Teil 1/2');
  r = await api('POST', `/api/m/upload?token=${token}&art=heiratsurkunde&upload=${up}&teil=1&teile=2`, pdf.slice(3 * 1024 * 1024), { keinCookie: true, headers: { 'content-type': 'application/pdf', 'x-dateiname': 'Heiratsurkunde.pdf' } });
  ok(r.status === 200 && r.body.fertig && r.body.dokument.groesse === pdf.length, 'Upload Teil 2/2 zusammengesetzt (' + (r.body.dokument && r.body.dokument.groesse) + ' B)');
  r = await api('POST', `/api/m/upload?token=${token}&art=heiratsurkunde&upload=test-upload-2&teil=0&teile=1`, Buffer.from('MZ-keine-pdf-datei-xxxxxxxx'), { keinCookie: true, headers: { 'content-type': 'application/pdf', 'x-dateiname': 'boese.pdf' } });
  ok(r.status === 400 && r.body.error === 'invalid_type', 'falscher Dateiinhalt abgelehnt');
  r = await api('POST', '/api/m/fragebogen?token=' + token, {}, { keinCookie: true });
  ok(r.status === 200, 'Fragebogen abgesendet');
  r = await api('PATCH', '/api/m/fragebogen?token=' + token, { schritt: 1, daten: { as_vorname: 'X' } }, { keinCookie: true });
  ok(r.status === 409, 'nach Absenden gesperrt');

  console.log('7. HQ-Akte');
  r = await api('GET', '/api/hq/akte?id=' + id);
  ok(r.status === 200 && r.body.anfrage.status === 'fragebogen_vollstaendig', 'Status fragebogen_vollstaendig');
  ok(r.body.checkliste.filter((c) => c.ok).length >= 4, 'Checkliste: ' + r.body.checkliste.map((c) => c.label + (c.ok ? '✓' : '–')).join(', '));
  ok(r.body.kosten.wert_scheidung === 17100 && r.body.kosten.wert_va === 5130 && r.body.kosten.gesamt === 3652.63, 'Kosten 17.100 / 5.130 / 3.652,63 €');
  ok(r.body.widerruf_laeuft === true, 'Widerrufsfrist läuft');
  r = await api('PATCH', '/api/hq/fragebogen?id=' + id, { daten: { ehe_registernr: 'E 124/2014' } });
  ok(r.status === 200 && r.body.geaendert.includes('ehe_registernr'), 'Kanzlei-Änderung protokolliert');
  r = await api('PUT', '/api/hq/kosten?id=' + id, { wert_va: '6000' });
  ok(r.status === 200 && r.body.kosten.ueberschrieben.wert_va, 'Überschreibung VA-Wert');
  r = await api('PUT', '/api/hq/kosten?id=' + id, { wert_va: null });
  ok(r.status === 200 && !r.body.kosten.ueberschrieben.wert_va, 'Überschreibung zurückgesetzt');
  r = await api('GET', '/api/hq/antrag?id=' + id);
  ok(r.status === 200 && r.body.gericht === 'Amtsgericht Hannover', 'Antrag: Gericht ' + r.body.gericht);
  const fehlt = r.body.warnungen.filter((w) => w.art === 'fehlt').map((w) => w.text);
  ok(true, 'Warnungen: ' + (r.body.warnungen.map((w) => w.text).join(' | ') || 'keine'));
  ok(!fehlt.length, 'keine fehlenden Pflichtangaben im Antrag');
  r = await api('GET', '/api/hq/dokument?id=' + id + '&typ=scheidungsantrag');
  ok(r.status === 200 && r.body.slice(0, 2).toString() === 'PK', 'Word-Antrag erzeugt (offen: ' + r.headers.get('x-offene-felder') + ')');
    r = await api('GET', '/api/hq/akte?id=' + id);
  ok(r.body.anfrage.status === 'antrag_vorbereitung' && r.body.dokumente.some((d) => d.art === 'antrag_docx'), 'Status antrag_vorbereitung + Ablage');
  r = await api('POST', '/api/hq/mails?id=' + id, { vorlage: 'A1.5', persoenlicher_text: 'anbei die Kosten.' });
  ok(r.status === 200 && r.body.gesendet, 'A1.5 Kostenübersicht gesendet');
  ok(letzteMail('voraussichtlichen Kosten').html.includes('3.652,63'), 'A1.5 enthält Kostentabelle');

  console.log('8. beA, Termin, Status-Seite, Abschluss');
  r = await api('POST', '/api/hq/aktion?id=' + id, { art: 'bea' });
  ok(r.status === 409 && r.body.error === 'az_gericht_fehlt', 'beA ohne Aktenzeichen → 409');
  r = await api('POST', '/api/hq/aktion?id=' + id, { art: 'bea', az_gericht: '612 F 1234/26' });
  ok(r.status === 200 && r.body.anfrage.status === 'eingereicht', 'eingereicht, A1.7');
  const sToken = linkAus(letzteMail('eingereicht'), 's');
  ok(!!sToken, 'A1.7 enthält Status-Link');
  r = await api('POST', '/api/hq/termine?id=' + id, { datum: '2026-12-03', uhrzeit: '10:30', ort: 'Amtsgericht Hannover, Saal 112' });
  ok(r.status === 200 && r.body.anfrage.status === 'termin' && r.body.mail.status === 'gesendet', 'Termin gespeichert, A1.8');
  r = await api('GET', '/api/m/status?token=' + sToken, null, { keinCookie: true });
  ok(r.status === 200 && r.body.zeitleiste[8].zustand === 'aktuell' && r.body.termin.datum === '03.12.2026', 'Status-Seite: Termin aktuell');
  r = await api('POST', '/api/hq/aktion?id=' + id, { art: 'abgeschlossen' });
  ok(r.status === 200 && r.body.anfrage.status === 'abgeschlossen' && !!letzteMail('rechtskräftig'), 'abgeschlossen, A1.9');
  r = await api('GET', '/api/hq/mails?id=' + id);
  ok(r.body.mails.every((m) => !/\/[mfs]\/[A-Za-z0-9_-]{20,}/.test(m.text)), 'Links im Mail-Protokoll maskiert');

  console.log('9. Erinnerungen (Cron), 2FA, Rechte');
  r = await api('GET', '/api/cron/erinnerungen', null, { keinCookie: true, headers: { cookie: '', authorization: 'Bearer falsch' } });
  ok(r.status === 401, 'Cron ohne Secret → 401');
  r = await api('GET', '/api/cron/erinnerungen', null, { keinCookie: true, headers: { cookie: '', authorization: 'Bearer cron-geheimnis-1234567890' } });
  ok(r.status === 200, 'Cron-Lauf ' + JSON.stringify(r.body));
  r = await api('DELETE', '/api/hq/login');
  r = await api('POST', '/api/hq/login', { email: 'assistenz@kanzlei.de', passwort: 'Test-Passwort-2' });
  ok(r.status === 200 && r.body.schritt === 2, '2FA: Schritt 2 verlangt');
  r = await api('POST', '/api/hq/login', { code: '000000' });
  ok(r.status === 401, 'falscher Code → 401');
  const code = require('../../api/_lib/auth').totp('JBSWY3DPEHPK3PXP', Date.now());
  r = await api('POST', '/api/hq/login', { code });
  ok(r.status === 200 && r.body.user === 'assistenz' && r.body.admin === false, '2FA-Login ok (keine Admin-Rolle)');
  r = await api('PUT', '/api/hq/einstellungen', { antwortzeiten: { anfrage: '24 Stunden' } });
  ok(r.status === 403, 'Einstellungen ohne Admin → 403');
  r = await api('GET', '/api/hq/einstellungen');
  ok(r.status === 200 && r.body.benutzer.length === 2, 'Einstellungen lesbar');

  console.log('10. Löschen');
  r = await api('DELETE', '/api/hq/anfragen?id=' + id, { grund: 'Test' });
  ok(r.status === 200, 'Anfrage gelöscht');
  if (process.env.TEST_SB) {
    const H = { apikey: process.env.TEST_SB, Authorization: 'Bearer ' + process.env.TEST_SB };
    let rest = 0;
    for (const t of ['so_links', 'so_mandate', 'so_fragebogen', 'so_dokumente', 'so_mails', 'so_termine', 'so_ereignisse']) rest += (await (await fetch('http://localhost:54321/rest/v1/' + t + '?anfrage_id=eq.' + id, { headers: H })).json()).length;
    ok(rest === 0, 'Supabase: Cascade – keine Restzeilen (' + rest + ')');
    const dir = process.env.TEST_STORAGE + '/' + id;
    const dateien = fs.existsSync(dir) ? require('child_process').execSync('find ' + dir + ' -type f').toString().trim() : '';
    ok(!dateien, 'Supabase: keine Restdateien im Storage ' + dateien);
    console.log(fehlerZahl ? `\n${fehlerZahl} FEHLER` : '\nALLES OK'); process.exit(fehlerZahl ? 1 : 0);
  }
  const db = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  ok(!Object.keys(db.tabellen).some((t) => t !== 'so_loeschungen' && db.tabellen[t].some((x) => x.anfrage_id === id)), 'keine Restdaten in Tabellen');
  const rest = fs.existsSync(path.join(STORE + '.files', id)) ? fs.readdirSync(path.join(STORE + '.files', id)).filter((f) => f !== 'tmp') : [];
  ok(rest.length === 0, 'keine Restdateien (' + rest.join(',') + ')');

  console.log(fehlerZahl ? `\n${fehlerZahl} FEHLER` : '\nALLES OK');
  process.exit(fehlerZahl ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
