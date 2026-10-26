/* ============================================================
   Mandanten-Bereich (ohne Konto, persönlicher Link ?token=).
   GET/POST  /api/m/mandat          Mandat lesen / unterschreiben (A2)
   GET/PATCH/POST /api/m/fragebogen Fragebogen laden / zwischenspeichern / absenden (A3)
   POST/DELETE /api/m/upload        Unterlagen hochladen (in Teilen) / entfernen
   GET       /api/m/datei?dok=      eigene Unterlagen + Mandats-PDF
   GET       /api/m/status          Status-Seite (A4)
   POST      /api/m/weiter          „Später weitermachen“ → Link per E-Mail
   POST      /api/m/link-neu        abgelaufener/ersetzter Link → neuer Link per E-Mail
   Der Mandat-Link öffnet nach der Unterschrift auch den Fragebogen.
   ============================================================ */
const crypto = require('crypto');
const { readBody, clientIp, saeubern } = require('../_lib/http');
const links = require('../_lib/links');
const ablauf = require('../_lib/ablauf');
const mailLib = require('../_lib/mail');
const vorlagenLib = require('../_lib/vorlagen');
const einstLib = require('../_lib/einstellungen');
const fbLib = require('../_lib/fragebogen');
const uploadLib = require('../_lib/upload');
const pdfLib = require('../_lib/pdf');
const { tagBerlin } = require('../_lib/store');

const fehler = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra));
const ID = /^\d{1,15}$/;
const DE = (iso) => (iso || '').split('-').reverse().join('.');

/* Token prüfen → { link, anfrage } oder beantwortet die Anfrage mit Fehler */
async function zugang(ctx, res, zwecke) {
  const token = ctx.url.searchParams.get('token') || '';
  const r = await links.pruefen(ctx.store, token, zwecke);
  if (r.fehler) {
    fehler(res, r.fehler === 'link_invalid' ? 404 : 410, r.fehler, r.anfrage && r.anfrage.email ? { neuer_link_moeglich: true } : {});
    return null;
  }
  return Object.assign(r, { token });
}

async function mandatVon(store, anfrageId) {
  return (await store.rows('so_mandate', { where: { anfrage_id: anfrageId }, limit: 1 }))[0] || null;
}

function personen(a, daten) {
  const d = Object.assign({}, fbLib.vorbelegung(a), daten || {});
  return { vorname: d.as_vorname || a.vorname || '', nachname: d.as_nachname || a.nachname || '', ag_nachname: d.ag_nachname || '', ort: d.as_ort || d.ehewhg_ort || '' };
}

async function mandatsTexte(store, a, req) {
  const [vorlagen, e] = await Promise.all([vorlagenLib.laden(store), einstLib.laden(store)]);
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const werte = mailLib.werteFuer(a, e, { fragebogen: Object.assign({}, fbLib.vorbelegung(a), fb && fb.daten), werte: {} });
  const dokumente = vorlagenLib.MANDAT_DOKUMENTE.map((id) => {
    const v = vorlagen.find((x) => x.id === id) || {};
    const text = vorlagenLib.fuellen(v.text || '', werte).trim();
    if (!text && e.test.mandat_ohne_texte === true) return { id, titel: v.name, text: vorlagenLib.TESTTEXT, platzhalter: false, test: true };
    return { id, titel: v.name, text, platzhalter: !text };
  });
  const version = crypto.createHash('sha256').update(dokumente.map((d) => d.id + '\n' + d.text).join('\n\n')).digest('hex').slice(0, 12);
  return { dokumente, version, kanzlei: e.kanzlei };
}

const ABSCHLUSS = ['abgesagt', 'widerrufen', 'abgeschlossen'];

async function mandat(req, res, ctx) {
  const z = await zugang(ctx, res, ['mandat']);
  if (!z) return;
  const { store } = ctx;
  const a = z.anfrage;
  const m = await mandatVon(store, a.id);
  const fb = await ablauf.fragebogenDaten(store, a.id);
  if (req.method === 'GET') {
    const t = await mandatsTexte(store, a, req);
    const pdf = m ? (await store.rows('so_dokumente', { where: { anfrage_id: a.id, art: 'vollmacht_pdf' }, limit: 1 }))[0] : null;
    res.status(200).json({
      ok: true, person: personen(a, fb && fb.daten), dokumente: t.dokumente, version: t.version, kanzlei: t.kanzlei,
      heute: DE(tagBerlin(new Date())), unterschrieben: !!m, unterschrieben_am: m ? m.created_at : null,
      pdf_dok: pdf ? pdf.id : null, verfuegbar: !ABSCHLUSS.includes(a.status) || !!m,
      fragebogen_vollstaendig: !!(fb && fb.vollstaendig_am)
    });
    return;
  }
  if (req.method !== 'POST') { fehler(res, 405, 'method_not_allowed'); return; }
  if (m) { fehler(res, 409, 'already_signed'); return; }
  if (ABSCHLUSS.includes(a.status)) { fehler(res, 409, 'not_available'); return; }
  const b = readBody(req);
  if (!b) { fehler(res, 400, 'invalid_body'); return; }
  const best = b.bestaetigungen || {};
  if (!['auftrag', 'widerruf', 'gebuehren', 'datenschutz'].every((k) => best[k] === true)) { fehler(res, 400, 'confirmations_required'); return; }
  const ort = saeubern(b.ort || '').trim().slice(0, 80);
  if (!ort) { fehler(res, 400, 'missing_fields', { felder: ['ort'] }); return; }
  const sig = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.unterschrift || ''));
  const png = sig ? Buffer.from(sig[1], 'base64') : null;
  if (!png || png.length < 400 || png.length > 200 * 1024 || uploadLib.typErkannt(png) !== 'image/png') { fehler(res, 400, 'invalid_signature'); return; }
  const t = await mandatsTexte(store, a, req);
  if (t.dokumente.some((d) => d.platzhalter && d.id !== 'DOK.datenschutz')) { fehler(res, 409, 'mandat_texte_fehlen'); return; }

  const zeitpunkt = new Date();
  const datum = tagBerlin(zeitpunkt);
  const ipHash = crypto.createHash('sha256').update(clientIp(req) + '|' + (process.env.HQ_SECRET || '')).digest('hex').slice(0, 16);
  const p = personen(a, fb && fb.daten);
  const mandantName = [p.vorname, p.nachname].filter(Boolean).join(' ');
  const pdf = await pdfLib.mandatPdf({
    kanzlei: t.kanzlei.name + ' · ' + t.kanzlei.anschrift, mandant: mandantName,
    dokumente: t.dokumente.map((d) => ({ titel: d.titel, text: d.text })), bestaetigungen: best, sofortTaetig: b.sofort_taetig === true,
    ort, datum: DE(datum), zeit: zeitpunkt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) + ' (Europe/Berlin)', ipHash, version: t.version, unterschriftPng: png
  });
  const sigPfad = `${a.id}/${crypto.randomUUID()}-unterschrift.png`;
  const pdfName = `Mandat_${(a.az_kanzlei || a.nummer || '').replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
  const pdfPfad = `${a.id}/${crypto.randomUUID()}-${pdfName}`;
  await store.putFile(sigPfad, png, 'image/png');
  await store.putFile(pdfPfad, pdf, 'application/pdf');
  try {
    await store.insert('so_mandate', {
      anfrage_id: a.id, ort, datum, sofort_taetig: b.sofort_taetig === true, dokumente_version: t.version,
      unterschrift_pfad: sigPfad, pdf_pfad: pdfPfad, ip: ipHash, user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      bestaetigungen: { auftrag: true, widerruf: true, gebuehren: true, datenschutz: true }
    });
  } catch (e) {
    // Doppelte Unterschrift (zweiter Tab): unique(anfrage_id)
    await store.removeFiles([sigPfad, pdfPfad]).catch(() => {});
    if (await mandatVon(store, a.id)) { fehler(res, 409, 'already_signed'); return; }
    throw e;
  }
  const dok = await store.insert('so_dokumente', { anfrage_id: a.id, name: pdfName, art: 'vollmacht_pdf', quelle: 'system', pfad: pdfPfad, mime: 'application/pdf', groesse: pdf.length, hochgeladen_von: 'mandant' });
  const neu = await ablauf.setStatus(store, a, 'unterschrieben', 'mandant', { info: { version: t.version } });
  if (!fb) await store.upsert('so_fragebogen', { anfrage_id: a.id, daten: {}, schritt: 0, kanzlei_aenderungen: {} }, 'anfrage_id');
  const basis = mailLib.basisUrl(req);
  await mailLib.senden(store, { anfrage: neu, vorlageId: 'A1.mand', werte: { link_fragebogen: basis + '/f/' + z.token }, anhaenge: [{ name: pdfName, inhalt: pdf }], benutzer: 'system', req });
  await mailLib.intern(store, 'Mandat unterschrieben · ' + (neu.az_kanzlei || neu.nummer), ['Das Mandat ' + (neu.az_kanzlei || neu.nummer) + ' wurde online unterschrieben. Die Widerrufsfrist läuft bis ' + DE(neu.widerruf_bis) + '.'], req);
  res.status(200).json({ ok: true, fragebogen_url: '/f/' + z.token, pdf_dok: dok.id });
}

/* Fragebogen: Mandat- oder Fragebogen-Link, nur nach Unterschrift */
async function fragebogenZugang(ctx, res) {
  const z = await zugang(ctx, res, ['fragebogen', 'mandat']);
  if (!z) return null;
  if (!(await mandatVon(ctx.store, z.anfrage.id))) { fehler(res, 409, 'not_signed', { mandat_url: z.link.zweck === 'mandat' ? '/m/' + z.token : '' }); return null; }
  if (z.anfrage.status === 'widerrufen') { fehler(res, 409, 'not_available'); return null; }
  return z;
}

async function fragebogen(req, res, ctx) {
  const z = await fragebogenZugang(ctx, res);
  if (!z) return;
  const { store } = ctx;
  const a = z.anfrage;
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const gespeichert = fb ? fb.daten || {} : {};
  if (req.method === 'GET') {
    const vor = fbLib.vorbelegung(a);
    const daten = Object.assign({}, vor, gespeichert);
    const doks = await store.rows('so_dokumente', { where: { anfrage_id: a.id, quelle: 'mandant' }, order: 'created_at.asc', limit: 100 });
    res.status(200).json({
      ok: true, person: personen(a, gespeichert),
      fragebogen: { daten, schritt: fb ? fb.schritt || 0 : 0, vollstaendig: !!(fb && fb.vollstaendig_am), updated_at: fb ? fb.updated_at : null },
      vorbelegt: Object.keys(vor).filter((k) => !Object.prototype.hasOwnProperty.call(gespeichert, k)),
      hinweise: fbLib.hinweise(daten), dokumente: doks.map(uploadLib.dokumentOeffentlich)
    });
    return;
  }
  if (fb && fb.vollstaendig_am) { fehler(res, 409, 'already_submitted'); return; }
  if (req.method === 'PATCH') {
    const b = readBody(req);
    if (!b) { fehler(res, 400, 'invalid_body'); return; }
    const { daten, fehler: f } = fbLib.bereinigen(b.daten);
    const neu = Object.assign({}, gespeichert, daten);
    const schrittRaw = parseInt(b.schritt, 10);
    const schritt = Math.max(fb ? fb.schritt || 0 : 0, Number.isFinite(schrittRaw) ? Math.min(Math.max(schrittRaw, 0), 7) : 0);
    // Gültige Felder immer speichern (Autosave), ungültige zurückmelden
    const zeit = new Date().toISOString();
    await store.upsert('so_fragebogen', { anfrage_id: a.id, daten: neu, schritt: b.pruefen ? schritt : (fb ? fb.schritt || 0 : 0), updated_at: zeit, kanzlei_aenderungen: fb ? fb.kanzlei_aenderungen || {} : {} }, 'anfrage_id');
    const komplett = Object.assign({}, fbLib.vorbelegung(a), neu);
    if (Object.keys(f).length) { fehler(res, 400, 'invalid_fields', { felder: f, updated_at: zeit }); return; }
    if (b.pruefen) {
      const fehlend = fbLib.fehlendeFelder(komplett, schrittRaw);
      if (fehlend.length) { fehler(res, 400, 'missing_fields', { felder: fehlend, updated_at: zeit }); return; }
    }
    res.status(200).json({ ok: true, updated_at: zeit, hinweise: fbLib.hinweise(komplett) });
    return;
  }
  if (req.method === 'POST') {
    const komplett = Object.assign({}, fbLib.vorbelegung(a), gespeichert);
    const fehlend = fbLib.fehlendeAlle(komplett);
    if (fehlend.length) { fehler(res, 400, 'missing_fields', { felder: fehlend }); return; }
    const zeit = new Date().toISOString();
    await store.upsert('so_fragebogen', { anfrage_id: a.id, daten: komplett, schritt: 7, vollstaendig_am: zeit, updated_at: zeit, kanzlei_aenderungen: fb ? fb.kanzlei_aenderungen || {} : {} }, 'anfrage_id');
    let neu = a;
    if (a.status === 'unterschrieben') neu = await ablauf.setStatus(store, a, 'fragebogen_vollstaendig', 'mandant');
    else await store.addEreignis({ anfrage_id: a.id, benutzer: 'mandant', art: 'fragebogen_vollstaendig', details: {} });
    await mailLib.intern(store, 'Fragebogen vollständig · ' + (neu.az_kanzlei || neu.nummer), ['Der Fragebogen zu ' + (neu.az_kanzlei || neu.nummer) + ' ist vollständig. Der Antrag kann geprüft und erstellt werden.'], req);
    res.status(200).json({ ok: true });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

async function upload(req, res, ctx) {
  const z = await zugang(ctx, res, ['fragebogen', 'mandat', 'status']);
  if (!z) return;
  const { store, url } = ctx;
  if (!(await mandatVon(store, z.anfrage.id))) { fehler(res, 409, 'not_signed'); return; }
  if (req.method === 'POST') {
    try {
      const r = await uploadLib.teilAnnehmen(store, req, { anfrageId: z.anfrage.id, art: url.searchParams.get('art') || 'sonstiges', quelle: 'mandant', von: 'mandant', mimeErlaubt: uploadLib.MIME_MANDANT, artenErlaubt: uploadLib.ARTEN_MANDANT });
      res.status(200).json({ ok: true, fertig: r.fertig, dokument: r.dokument ? uploadLib.dokumentOeffentlich(r.dokument) : null });
    } catch (e) {
      if (e.code) { fehler(res, e.code === 'file_too_large' ? 413 : 400, e.code); return; }
      throw e;
    }
    return;
  }
  if (req.method === 'DELETE') {
    const dok = url.searchParams.get('dok') || '';
    if (!ID.test(dok)) { fehler(res, 400, 'invalid_id'); return; }
    const [d] = await store.rows('so_dokumente', { where: { id: Number(dok), anfrage_id: z.anfrage.id, quelle: 'mandant' }, limit: 1 });
    if (!d) { fehler(res, 404, 'not_found'); return; }
    await store.remove('so_dokumente', { id: d.id });
    await store.removeFiles([d.pfad]).catch(() => {});
    await store.addEreignis({ anfrage_id: z.anfrage.id, benutzer: 'mandant', art: 'dokument_geloescht', details: { name: d.name } });
    res.status(200).json({ ok: true });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

async function datei(req, res, ctx) {
  const z = await zugang(ctx, res, ['fragebogen', 'mandat', 'status']);
  if (!z) return;
  const dok = ctx.url.searchParams.get('dok') || '';
  if (!ID.test(dok)) { fehler(res, 400, 'invalid_id'); return; }
  const [d] = await ctx.store.rows('so_dokumente', { where: { id: Number(dok), anfrage_id: z.anfrage.id }, limit: 1 });
  if (!d || !(d.quelle === 'mandant' || d.art === 'vollmacht_pdf')) { fehler(res, 404, 'not_found'); return; }
  await require('../_hq/akte').dateiSenden(res, ctx.store, d);
}

/* A4: Zeitleiste und „Was Sie jetzt tun können“ (Texte aus dem Design) */
const Z = [['Anfrage eingegangen', 'Ihr Online-Antrag ist bei uns angekommen.'], ['Eingangsbestätigung und Checkliste gesendet', ''], ['Prüfung durch die Kanzlei', 'Frau Wagner sieht sich Ihre Angaben persönlich an.'], ['Mandat angeboten', 'Sie haben den Link zu Mandat und Fragebogen erhalten.'], ['Mandat unterschrieben', ''], ['Fragebogen ausgefüllt', 'Ihre Angaben für den Antrag sind vollständig.'], ['Scheidungsantrag in Vorbereitung', 'Wir berechnen die Gegenstandswerte und erstellen den Antrag.'], ['Antrag beim Gericht eingereicht', 'Das Gericht fordert den Kostenvorschuss an und versendet die Fragebögen zum Versorgungsausgleich.'], ['Gerichtstermin steht', 'Wir bereiten Sie auf den Termin vor und begleiten Sie.'], ['Scheidung rechtskräftig', 'Ihr Verfahren ist abgeschlossen.']];
const STUFE = { neu: 3, in_pruefung: 3, erstgespraech: 3, mandat_angeboten: 4, unterschrieben: 5, fragebogen_vollstaendig: 6, antrag_vorbereitung: 7, eingereicht: 8, termin: 9, abgeschlossen: 10 };
const JETZT = { 1: ['Nichts – wir melden uns innerhalb von 48 Stunden bei Ihnen.', ''], 2: ['Schauen Sie gern schon in die Checkliste. Wir prüfen Ihre Angaben.', ''], 3: ['Nichts – Frau Wagner prüft Ihre Angaben gerade persönlich.', ''], 4: ['Bitte unterschreiben Sie das Mandat über Ihren persönlichen Link.', 'Mandat öffnen'], 5: ['Bitte füllen Sie den Fragebogen aus. Vieles ist bereits vorausgefüllt.', 'Fragebogen öffnen'], 6: ['Nichts – wir bereiten den Scheidungsantrag vor. Falls noch Unterlagen fehlen, finden Sie sie unten.', ''], 7: ['Bitte begleichen Sie die Vorschussrechnung. Danach reichen wir den Antrag ein.', ''], 8: ['Bitte füllen Sie den Fragebogen zum Versorgungsausgleich aus, den Sie vom Gericht erhalten.', ''], 9: ['Bitte bringen Sie Ihren Personalausweis zum Termin mit. Wir melden uns zur Vorbereitung.', ''], 10: ['Nichts mehr – bewahren Sie den Beschluss gut auf.', ''] };

async function status(req, res, ctx) {
  if (req.method !== 'GET') { fehler(res, 405, 'method_not_allowed'); return; }
  const z = await zugang(ctx, res, ['status', 'mandat', 'fragebogen']);
  if (!z) return;
  const { store } = ctx;
  const a = z.anfrage;
  const [fb, doks, termine, e, m] = await Promise.all([
    ablauf.fragebogenDaten(store, a.id),
    store.rows('so_dokumente', { where: { anfrage_id: a.id }, limit: 200 }),
    store.rows('so_termine', { where: { anfrage_id: a.id, art: 'scheidung' }, order: 'datum.desc', limit: 1 }),
    einstLib.laden(store),
    mandatVon(store, a.id)
  ]);
  const daten = Object.assign({}, fbLib.vorbelegung(a), fb && fb.daten);
  const ende = ['abgesagt', 'widerrufen'].includes(a.status);
  const stufe = STUFE[a.status] || 3;
  const zeitleiste = Z.map(([titel, text], i) => ({ titel, text, zustand: a.status === 'abgeschlossen' || i + 1 < stufe ? 'erledigt' : i + 1 === stufe ? 'aktuell' : 'offen' }));
  const j = JETZT[stufe];
  res.status(200).json({
    ok: true, status: a.status, beendet: ende,
    kopf: { as_nachname: daten.as_nachname || a.nachname, ag_nachname: daten.ag_nachname || '', az_kanzlei: a.az_kanzlei || '' },
    jetzt: ende ? { text: 'Ihr Verfahren wird von uns nicht weitergeführt. Bei Fragen rufen Sie uns gern an.' } : { text: j[0], aktion: j[1] ? { text: j[1] } : null },
    zeitleiste: ende ? [] : zeitleiste,
    fehlende_unterlagen: m && !ende ? fbLib.fehlendeUnterlagen(daten, doks) : [],
    darf_hochladen: !!m && !ende,
    termin: termine[0] ? { datum: DE(termine[0].datum), uhrzeit: termine[0].uhrzeit, ort: termine[0].ort } : null,
    kontakt: { telefon: e.kanzlei.telefon, email: e.kanzlei.email, oeffnungszeiten: einstLib.oeffnungszeitenText(e) }
  });
}

/* Gedrosselt: höchstens eine solche E-Mail je Anfrage in 10 Minuten */
async function gedrosselt(store, anfrageId) {
  const seit = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await store.rows('so_mails', { where: { anfrage_id: anfrageId, vorlage: { in: ['A1.weiter', 'A1.4'] }, created_at: { gte: seit } }, limit: 1 });
  return rows.length > 0;
}

async function weiter(req, res, ctx) {
  if (req.method !== 'POST') { fehler(res, 405, 'method_not_allowed'); return; }
  const z = await fragebogenZugang(ctx, res);
  if (!z) return;
  if (await gedrosselt(ctx.store, z.anfrage.id)) { res.status(200).json({ ok: true, gedrosselt: true }); return; }
  const token = await links.erzeugen(ctx.store, z.anfrage.id, 'fragebogen');
  const fb = await ablauf.fragebogenDaten(ctx.store, z.anfrage.id);
  await mailLib.senden(ctx.store, { anfrage: z.anfrage, vorlageId: 'A1.weiter', fragebogen: fb && fb.daten, werte: { link_fragebogen: links.url(mailLib.basisUrl(req), 'fragebogen', token) }, benutzer: 'mandant', req, erzwingen: true });
  res.status(200).json({ ok: true });
}

async function linkNeu(req, res, ctx) {
  if (req.method !== 'POST') { fehler(res, 405, 'method_not_allowed'); return; }
  const r = await links.pruefen(ctx.store, ctx.url.searchParams.get('token') || '', ['mandat', 'fragebogen', 'status']);
  // Antwort immer gleich — keine Rückschlüsse auf gültige Links
  if (!r.anfrage || !r.anfrage.email || ABSCHLUSS.includes(r.anfrage.status) && r.anfrage.status !== 'abgeschlossen') { res.status(200).json({ ok: true }); return; }
  const a = r.anfrage;
  const { store } = ctx;
  if (await gedrosselt(store, a.id)) { res.status(200).json({ ok: true }); return; }
  const basis = mailLib.basisUrl(req);
  const fb = await ablauf.fragebogenDaten(store, a.id);
  if (r.link.zweck === 'status') {
    const token = await links.erzeugen(store, a.id, 'status', 365);
    await mailLib.senden(store, { anfrage: a, vorlageId: 'A1.weiter', fragebogen: fb && fb.daten, werte: { link_fragebogen: links.url(basis, 'status', token) }, benutzer: 'mandant', req, erzwingen: true });
  } else if (await mandatVon(store, a.id)) {
    const token = await links.erzeugen(store, a.id, 'fragebogen');
    await mailLib.senden(store, { anfrage: a, vorlageId: 'A1.weiter', fragebogen: fb && fb.daten, werte: { link_fragebogen: links.url(basis, 'fragebogen', token) }, benutzer: 'mandant', req, erzwingen: true });
  } else if (a.status === 'mandat_angeboten') {
    const token = await links.erzeugen(store, a.id, 'mandat');
    await mailLib.senden(store, { anfrage: a, vorlageId: 'A1.4', fragebogen: fb && fb.daten, werte: { fehlend: '• Ihre Unterschrift unter das Mandat', link_mandat: links.url(basis, 'mandat', token) }, benutzer: 'mandant', req, erzwingen: true });
  }
  await store.addEreignis({ anfrage_id: a.id, benutzer: 'mandant', art: 'link_neu', details: { zweck: r.link.zweck } });
  res.status(200).json({ ok: true });
}

module.exports = { mandat, fragebogen, upload, datei, status, weiter, linkNeu };
