/* Testbetrieb: „Mandat anbieten“ ohne Widerrufsbelehrung/Gebührenhinweis (einstellungen.test.mandat_ohne_texte).
   Voraussetzung: tools/devserver.js läuft (HQ_USERS mit Admin „janine:Test-Passwort-1“, MAIL_PROVIDER=log, SO_MAIL_DIR).
   Umgebung: TEST_PORT (8742), TEST_MAILS (= SO_MAIL_DIR des Servers). */
const fs = require('fs');
const path = require('path');
const PORT = process.env.TEST_PORT || '8742';
const B = 'http://localhost:' + PORT;
const MAILS = process.env.TEST_MAILS;
let fehlerZahl = 0;
const ok = (bed, text) => { console.log((bed ? '  ✓ ' : '  ✗ ') + text); if (!bed) fehlerZahl++; };

let cookie = '';
async function api(method, p, body, ohneCookie) {
  const r = await fetch(B + p, { method, headers: { cookie: ohneCookie ? '' : cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc && !ohneCookie) cookie = sc.split(/,(?=\s*so_)/).map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
  return Object.assign(await r.json().catch(() => ({})), { status: r.status });
}
const letzteMail = (betreff) => fs.readdirSync(MAILS).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAILS, f), 'utf8'))).filter((m) => m.betreff.includes(betreff)).pop();
function sigPng() {
  const zlib = require('zlib'); const w = 300, hh = 100; const raw = Buffer.alloc((w * 4 + 1) * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = 20; raw[o + 1] = 40; raw[o + 2] = 80; raw[o + 3] = Math.abs(y - 50 - 30 * Math.sin(x / 20)) < 2 ? 255 : 0; }
  const tab = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(hh, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const anfrage = (vorname) => api('POST', '/api/lead', {
  meta: { quelle: 'Online-Scheidung Formular', seite: 'http://localhost/', guard: { hp: '', fill_ms: 5000 } },
  kontakt: { vorname, nachname: 'Testmodus', email: 'test.' + Date.now() + '@example.de', telefon: '0511 123456' },
  situation: { mindestens_ein_jahr_getrennt: 'Ja', heiratsdatum: '2014-05-17', trennung_beginn: '2024-02-01', ehewohnung_plz: '30159', ehewohnung_ort: 'Hannover' },
  ehepartner: { name: 'Thomas Testmodus', anschrift: 'Lindenallee 4, 30163 Hannover' },
  kinder: { vorhanden: 'Ja', anzahl: '1', wohnort: 'Bei mir' }, scheidung: { einvernehmlich: 'Ja' },
  ergaenzung: { anschrift: 'Musterweg 3, 30159 Hannover', nettoeinkommen_antragsteller: '2600', nettoeinkommen_antragsgegner: '3100', kind_1: 'Lena Testmodus, geb. am 03.04.2016', staatsangehoerigkeit: 'deutsch / deutsch' },
  nachricht: 'Test', dsgvo_zugestimmt: true
}).then((r) => { if (!r.nummer) throw new Error('Anfrage abgelehnt: ' + r.error); return r; });

(async () => {
  let r = await api('POST', '/api/hq/login', { name: 'janine', passwort: 'Test-Passwort-1' });
  ok(r.ok && r.admin, 'Admin angemeldet');
  await api('PUT', '/api/hq/vorlagen', { id: 'DOK.widerruf', zuruecksetzen: true });
  await api('PUT', '/api/hq/vorlagen', { id: 'DOK.gebuehren', zuruecksetzen: true });
  await api('PUT', '/api/hq/einstellungen', { test: { mandat_ohne_texte: false } });
  r = await api('GET', '/api/hq/einstellungen');
  ok(r.ok && r.einstellungen.test.mandat_ohne_texte === false, 'Testbetrieb standardmäßig aus');

  const nr1 = (await anfrage('Erste')).nummer;
  const id1 = (await api('GET', '/api/hq/anfragen')).anfragen.find((a) => a.nummer === nr1).id;
  r = await api('GET', '/api/hq/anfragen?id=' + id1);
  ok(r.mandat_freigabe.frei === false && !r.mandat_freigabe.test, 'ohne Testbetrieb gesperrt');
  r = await api('POST', '/api/hq/aktion?id=' + id1, { art: 'mandat_anbieten', text: 'Test' });
  ok(r.status === 409 && r.error === 'mandat_texte_fehlen', 'Mandat anbieten → mandat_texte_fehlen');

  r = await api('PUT', '/api/hq/einstellungen', { test: { mandat_ohne_texte: true } });
  ok(r.ok && r.einstellungen.test.mandat_ohne_texte === true, 'Testbetrieb eingeschaltet');
  r = await api('GET', '/api/hq/anfragen?id=' + id1);
  ok(r.mandat_freigabe.frei === true && r.mandat_freigabe.test === true && r.mandat_freigabe.fehlend.length === 2, 'Freigabe im Testbetrieb, fehlende Texte benannt');
  r = await api('POST', '/api/hq/aktion?id=' + id1, { art: 'mandat_anbieten', text: 'Test' });
  ok(r.ok && r.anfrage.status === 'mandat_angeboten', 'Mandat angeboten');
  const token = /\/m\/([A-Za-z0-9_-]+)/.exec(letzteMail('Ihr Mandat').text)[1];

  r = await api('GET', '/api/m/mandat?token=' + token, null, true);
  const doks = r.dokumente || [];
  ok(r.ok && doks.filter((d) => /TESTDOKUMENT/.test(d.text)).length === 2 && !doks.some((d) => d.platzhalter && d.id !== 'DOK.datenschutz'), 'Mandantenseite: fehlende Texte als TESTDOKUMENT');
  r = await api('POST', '/api/m/mandat?token=' + token, { bestaetigungen: { auftrag: true, widerruf: true, gebuehren: true, datenschutz: true }, ort: 'Hannover', unterschrift: 'data:image/png;base64,' + sigPng().toString('base64') }, true);
  ok(r.ok && r.pdf_dok, 'im Testbetrieb unterschrieben, PDF erzeugt');

  await api('PUT', '/api/hq/einstellungen', { test: { mandat_ohne_texte: false } });
  const nr2 = (await anfrage('Zweite')).nummer;
  const id2 = (await api('GET', '/api/hq/anfragen')).anfragen.find((a) => a.nummer === nr2).id;
  r = await api('POST', '/api/hq/aktion?id=' + id2, { art: 'mandat_anbieten', text: 'Test' });
  ok(r.status === 409, 'Testbetrieb aus → wieder gesperrt');

  console.log(fehlerZahl ? `\n${fehlerZahl} FEHLER` : '\nTESTMODUS OK');
  process.exit(fehlerZahl ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
