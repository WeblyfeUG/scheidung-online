/* ============================================================
   HQ — Akte (B4) mit sieben Reitern.
   GET    /api/hq/akte?id=                 alles für B4
   PATCH  /api/hq/fragebogen?id=           {daten}  Kanzlei-Änderungen (protokolliert)
   GET    /api/hq/dokumente?id=            Liste
   POST   /api/hq/dokumente?id=&art=&upload=&teil=&teile=   Upload in Teilen (Roh-Body)
   DELETE /api/hq/dokumente?id=&dok=
   GET    /api/hq/datei?dok=               Download (nur über die Sitzung)
   GET    /api/hq/kosten?id=&ek_as=&ek_ag=&anrechte=&wert_scheidung=&wert_va=
   PUT    /api/hq/kosten?id=               {ek_as?, ek_ag?, anrechte?, wert_scheidung?, wert_va?, vorschuss_bezahlt?}
   GET    /api/hq/antrag?id=               Vorschau-Segmente + Warnungen
   GET    /api/hq/dokument?id=&typ=scheidungsantrag|vollmacht   Word
   POST   /api/hq/termine?id=              {datum, uhrzeit, ort, art?, hinweis?}
   DELETE /api/hq/termine?id=&termin=
   GET    /api/hq/mails?id=
   POST   /api/hq/mails?id=                {vorlage, text?, an?, anhaenge?[dok-ids], vorschau?}
   POST   /api/hq/mails-erneut?mail=
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { readBody, saeubern } = require('../_lib/http');
const ablauf = require('../_lib/ablauf');
const fbLib = require('../_lib/fragebogen');
const kostenLib = require('../_lib/kosten');
const antragLib = require('../_lib/scheidungsantrag');
const mailLib = require('../_lib/mail');
const links = require('../_lib/links');
const uploadLib = require('../_lib/upload');
const { fillTemplate } = require('../_lib/docx');
const { tagBerlin } = require('../_lib/store');
const guard = require('../../form-guard.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^\d{1,15}$/;
const fehler = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra));

async function anfrageAus(ctx, res) {
  const id = ctx.url.searchParams.get('id');
  if (!id || !UUID.test(id)) { fehler(res, 400, 'invalid_id'); return null; }
  const a = await ctx.store.getAnfrage(id);
  if (!a) { fehler(res, 404, 'not_found'); return null; }
  return a;
}

function safeName(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

/* Checkliste B4-1 */
function checkliste(a, mandat, fb, doks, daten) {
  const hat = (art) => doks.some((d) => d.art === art);
  const keineKinder = daten.kinder_vorhanden === 'Nein';
  return [
    { key: 'vollmacht', label: 'Vollmacht', ok: !!mandat },
    { key: 'widerruf', label: 'Widerrufsbelehrung', ok: !!(mandat && mandat.bestaetigungen && mandat.bestaetigungen.widerruf) },
    { key: 'fragebogen', label: 'Fragebogen', ok: !!(fb && fb.vollstaendig_am) },
    { key: 'heiratsurkunde', label: 'Heiratsurkunde', ok: hat('heiratsurkunde') },
    { key: 'geburtsurkunden', label: 'Geburtsurkunden', ok: keineKinder || hat('geburtsurkunde'), entfaellt: keineKinder },
    { key: 'vorschuss', label: 'Vorschuss bezahlt', ok: !!(a.kosten && a.kosten.vorschuss_bezahlt) }
  ];
}

async function akte(req, res, ctx) {
  if (req.method !== 'GET') { fehler(res, 405, 'method_not_allowed'); return; }
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store } = ctx;
  const [fb, doks, mandate, termine, mails, verlauf] = await Promise.all([
    ablauf.fragebogenDaten(store, a.id),
    store.rows('so_dokumente', { where: { anfrage_id: a.id }, order: 'created_at.desc', limit: 200 }),
    store.rows('so_mandate', { where: { anfrage_id: a.id }, limit: 1 }),
    store.rows('so_termine', { where: { anfrage_id: a.id }, order: 'datum.asc', limit: 50 }),
    store.rows('so_mails', { where: { anfrage_id: a.id }, order: 'created_at.desc', limit: 100 }),
    store.listEreignisse(a.id)
  ]);
  const mandat = mandate[0] || null;
  const vorbelegt = fbLib.vorbelegung(a);
  const daten = Object.assign({}, vorbelegt, fb ? fb.daten : {});
  const grundlagen = kostenLib.grundlagen(a, daten);
  const heute = tagBerlin(new Date());
  res.status(200).json({
    ok: true,
    anfrage: require('./posteingang').zeile(a),
    fragebogen: fb ? { daten: fb.daten, schritt: fb.schritt, vollstaendig_am: fb.vollstaendig_am, kanzlei_aenderungen: fb.kanzlei_aenderungen || {} } : null,
    angaben: daten,
    felder: Object.keys(fbLib.FELDER).map((k) => Object.assign({ key: k }, fbLib.FELDER[k])),
    gruppen: fbLib.GRUPPEN,
    anrecht_arten: fbLib.ANRECHT_ARTEN,
    dokumente: doks.map(uploadLib.dokumentOeffentlich),
    mandat: mandat ? { ort: mandat.ort, datum: mandat.datum, sofort_taetig: mandat.sofort_taetig, dokumente_version: mandat.dokumente_version, created_at: mandat.created_at } : null,
    kosten: kostenLib.berechnen(grundlagen),
    kosten_grundlagen: grundlagen,
    kosten_tabelle: null,
    termine, mails, verlauf,
    checkliste: checkliste(a, mandat, fb, doks, daten),
    widerruf_laeuft: !!(a.widerruf_bis && a.widerruf_bis >= heute),
    gericht_vorschlag: (antragLib.gerichtVorschlag(daten) || {}).name || '',
    kette: ablauf.KETTE, status_labels: ablauf.LABEL
  });
}

async function fragebogen(req, res, ctx) {
  if (req.method !== 'PATCH') { fehler(res, 405, 'method_not_allowed'); return; }
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const b = readBody(req);
  if (!b || !b.daten) { fehler(res, 400, 'invalid_body'); return; }
  const { daten, fehler: f } = fbLib.bereinigen(b.daten);
  if (Object.keys(f).length) { fehler(res, 400, 'invalid_fields', { felder: f }); return; }
  const { store, user } = ctx;
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const vorher = Object.assign({}, fbLib.vorbelegung(a), fb ? fb.daten : {});
  const aenderungen = Object.assign({}, fb ? fb.kanzlei_aenderungen : {});
  const zeit = new Date().toISOString();
  const geaendert = [];
  Object.keys(daten).forEach((k) => {
    const alt = vorher[k] === undefined ? '' : vorher[k];
    if (JSON.stringify(alt) === JSON.stringify(daten[k])) return;
    geaendert.push(k);
    aenderungen[k] = { alt: aenderungen[k] ? aenderungen[k].alt : alt, neu: daten[k], benutzer: user, zeit };
  });
  if (!geaendert.length) { res.status(200).json({ ok: true, unveraendert: true }); return; }
  const neu = Object.assign({}, fb ? fb.daten : {}, daten);
  const row = await store.upsert('so_fragebogen', { anfrage_id: a.id, daten: neu, kanzlei_aenderungen: aenderungen, updated_at: zeit, schritt: fb ? fb.schritt : 0 }, 'anfrage_id');
  await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'angaben_geaendert', details: { felder: geaendert } });
  res.status(200).json({ ok: true, fragebogen: { daten: row.daten, kanzlei_aenderungen: row.kanzlei_aenderungen }, geaendert });
}

async function dokumente(req, res, ctx) {
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store, user, url } = ctx;
  if (req.method === 'GET') {
    const doks = await store.rows('so_dokumente', { where: { anfrage_id: a.id }, order: 'created_at.desc', limit: 200 });
    res.status(200).json({ ok: true, dokumente: doks.map(uploadLib.dokumentOeffentlich) });
    return;
  }
  if (req.method === 'POST') {
    try {
      const r = await uploadLib.teilAnnehmen(store, req, { anfrageId: a.id, art: url.searchParams.get('art') || 'sonstiges', quelle: 'kanzlei', von: user, mimeErlaubt: uploadLib.MIME_KANZLEI, artenErlaubt: uploadLib.ARTEN });
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
    const [d] = await store.rows('so_dokumente', { where: { id: Number(dok), anfrage_id: a.id }, limit: 1 });
    if (!d) { fehler(res, 404, 'not_found'); return; }
    await store.remove('so_dokumente', { id: d.id });
    try { await store.removeFiles([d.pfad]); } catch (e) { console.error('[hq] Datei nicht gelöscht:', e.message); }
    await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'dokument_geloescht', details: { name: d.name } });
    res.status(200).json({ ok: true });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

/* Download über die API (kein öffentlicher Speicherlink) */
async function dateiSenden(res, store, d) {
  const buf = await store.readFile(d.pfad);
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${/^image\/|pdf/.test(d.mime) ? 'inline' : 'attachment'}; filename="${safeName(d.name) || 'datei'}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.status(200).send(buf);
}
async function datei(req, res, ctx) {
  if (req.method !== 'GET') { fehler(res, 405, 'method_not_allowed'); return; }
  const dok = ctx.url.searchParams.get('dok') || '';
  if (!ID.test(dok)) { fehler(res, 400, 'invalid_id'); return; }
  const [d] = await ctx.store.rows('so_dokumente', { where: { id: Number(dok) }, limit: 1 });
  if (!d) { fehler(res, 404, 'not_found'); return; }
  await dateiSenden(res, ctx.store, d);
}

async function kosten(req, res, ctx) {
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store, user, url } = ctx;
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const daten = Object.assign({}, fbLib.vorbelegung(a), fb ? fb.daten : {});
  const FELDER = ['ek_as', 'ek_ag', 'anrechte', 'wert_scheidung', 'wert_va'];
  if (req.method === 'GET') {
    const g = kostenLib.grundlagen(a, daten);
    FELDER.forEach((k) => { if (url.searchParams.has(k)) g[k] = url.searchParams.get(k); });
    const k = kostenLib.berechnen(g);
    res.status(200).json({ ok: true, kosten: k, tabelle: kostenLib.tabelle(k), grundlagen: g });
    return;
  }
  if (req.method === 'PUT') {
    const b = readBody(req);
    if (!b) { fehler(res, 400, 'invalid_body'); return; }
    const neu = Object.assign({}, a.kosten || {});
    FELDER.forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return;
      const v = b[k];
      if (v === null || v === '') delete neu[k];
      else if (kostenLib.zahl(v) >= 0 && String(v).length <= 20) neu[k] = String(v);
    });
    if (typeof b.vorschuss_bezahlt === 'boolean') neu.vorschuss_bezahlt = b.vorschuss_bezahlt;
    const aktuell = await store.updateAnfrage(a.id, { kosten: neu });
    await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'kosten', details: { felder: Object.keys(b) } });
    const g = kostenLib.grundlagen(aktuell, daten);
    const k = kostenLib.berechnen(g);
    res.status(200).json({ ok: true, kosten: k, tabelle: kostenLib.tabelle(k), grundlagen: g });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

async function antrag(req, res, ctx) {
  if (req.method !== 'GET') { fehler(res, 405, 'method_not_allowed'); return; }
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const fb = await ablauf.fragebogenDaten(ctx.store, a.id);
  const r = antragLib.erstellen(a, fb && fb.daten);
  res.status(200).json({ ok: true, absaetze: r.absaetze, warnungen: r.warnungen, gericht: r.gericht, gericht_vorschlag: r.gerichtVorschlag });
}

const WORD = {
  scheidungsantrag: { datei: 'antragsentwurf.docx', name: 'Scheidungsantrag' },
  vollmacht: { datei: 'vollmacht.docx', name: 'Vollmacht' }
};
async function dokument(req, res, ctx) {
  if (req.method !== 'GET') { fehler(res, 405, 'method_not_allowed'); return; }
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store, user, url } = ctx;
  let typ = url.searchParams.get('typ') || 'scheidungsantrag';
  if (typ === 'antragsentwurf') typ = 'scheidungsantrag';
  const v = Object.prototype.hasOwnProperty.call(WORD, typ) ? WORD[typ] : null;
  if (!v) { fehler(res, 400, 'invalid_request'); return; }
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const r = antragLib.erstellen(a, fb && fb.daten);
  const tpl = fs.readFileSync(path.join(__dirname, '..', '_templates', v.datei));
  const { buffer, unresolved } = fillTemplate(tpl, r.werte, { leer: r.leer });
  const fname = `${v.name}_${a.az_kanzlei || a.nummer}_${safeName(r.werte.antragsteller_name || a.nachname)}.docx`;
  await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'dokument', details: { typ, offen: unresolved } });
  // Erstes Erzeugen des Antrags: Status „Antrag in Vorbereitung“ und Ablage in den Dokumenten
  if (typ === 'scheidungsantrag' && ['unterschrieben', 'fragebogen_vollstaendig'].includes(a.status)) {
    try {
      const pfad = `${a.id}/${require('crypto').randomUUID()}-${safeName(fname)}`;
      await store.putFile(pfad, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      await store.insert('so_dokumente', { anfrage_id: a.id, name: fname, art: 'antrag_docx', quelle: 'system', pfad, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', groesse: buffer.length, hochgeladen_von: user });
    } catch (e) { console.error('[hq/dokument] Ablage fehlgeschlagen:', e.message); }
    await ablauf.setStatus(store, a, 'antrag_vorbereitung', user);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('X-Offene-Felder', unresolved.join(','));
  res.status(200).send(buffer);
}

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
async function termine(req, res, ctx) {
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store, user, url, req: rq } = ctx;
  if (req.method === 'POST') {
    const b = readBody(req) || {};
    const datum = String(b.datum || '');
    const uhrzeit = String(b.uhrzeit || '');
    const ort = saeubern(b.ort || '').trim().slice(0, 200);
    const art = ['scheidung', 'erstgespraech', 'sonstiges'].includes(b.art) ? b.art : 'scheidung';
    if (!fbLib.datumGueltig(datum) || !ZEIT.test(uhrzeit) || !ort) { fehler(res, 400, 'invalid_fields'); return; }
    const t = await store.insert('so_termine', { anfrage_id: a.id, art, datum, uhrzeit, ort, hinweis: saeubern(b.hinweis || '').slice(0, 500) });
    await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'termin', details: { datum, uhrzeit, art } });
    let aktuell = a;
    let m = null;
    if (art === 'scheidung') {
      if (['eingereicht', 'antrag_vorbereitung', 'fragebogen_vollstaendig', 'unterschrieben'].includes(a.status)) aktuell = await ablauf.setStatus(store, a, 'termin', user);
      const token = await links.erzeugen(store, a.id, 'status', 365);
      const fb = await ablauf.fragebogenDaten(store, a.id);
      const r = await mailLib.senden(store, { anfrage: aktuell, vorlageId: 'A1.8', fragebogen: fb && fb.daten, werte: { termin_datum: datum.split('-').reverse().join('.'), termin_uhrzeit: uhrzeit, termin_ort: ort, link_status: links.url(mailLib.basisUrl(rq), 'status', token) }, benutzer: user, req: rq });
      m = r.mail;
    }
    res.status(200).json({ ok: true, termin: t, anfrage: require('./posteingang').zeile(aktuell), mail: m ? { status: m.status, fehler: m.fehler } : null });
    return;
  }
  if (req.method === 'DELETE') {
    const tid = url.searchParams.get('termin') || '';
    if (!ID.test(tid)) { fehler(res, 400, 'invalid_id'); return; }
    await store.remove('so_termine', { id: Number(tid), anfrage_id: a.id });
    await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'termin_geloescht', details: {} });
    res.status(200).json({ ok: true });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

async function mails(req, res, ctx) {
  const a = await anfrageAus(ctx, res);
  if (!a) return;
  const { store, user, req: rq } = ctx;
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, mails: await store.rows('so_mails', { where: { anfrage_id: a.id }, order: 'created_at.desc', limit: 100 }) });
    return;
  }
  if (req.method !== 'POST') { fehler(res, 405, 'method_not_allowed'); return; }
  const b = readBody(req) || {};
  const vorlageId = typeof b.vorlage === 'string' ? b.vorlage : '';
  const fb = await ablauf.fragebogenDaten(store, a.id);
  const fbDaten = Object.assign({}, fbLib.vorbelegung(a), fb ? fb.daten : {});
  const k = kostenLib.berechnen(kostenLib.grundlagen(a, fbDaten));
  const extra = Object.assign(ablauf.kostenWerte(k), {
    persoenlicher_text: typeof b.persoenlicher_text === 'string' ? saeubern(b.persoenlicher_text).slice(0, 4000) : '',
    gericht: a.gericht || 'zuständigen Amtsgericht',
    fehlend: fbLib.fehlendeUnterlagen(fbDaten, await store.rows('so_dokumente', { where: { anfrage_id: a.id }, limit: 200 })).map((u) => '• ' + u.label).join('\n') || '• nichts'
  });
  const text = typeof b.text === 'string' ? saeubern(b.text).slice(0, 12000) : undefined;
  const v = await mailLib.vorschau(store, { anfrage: a, vorlageId, werte: extra, fragebogen: fbDaten, eigenerText: text });
  if (!v) { fehler(res, 400, 'invalid_template'); return; }
  let an = a.email || '';
  if (typeof b.an === 'string' && b.an.trim()) {
    if (guard.check('email', b.an.trim()) !== '') { fehler(res, 400, 'invalid_email'); return; }
    an = b.an.trim();
  }
  v.an = an;
  if (b.vorschau) { res.status(200).json({ ok: true, vorschau: v }); return; }
  const anhaenge = [];
  for (const id of (Array.isArray(b.anhaenge) ? b.anhaenge.slice(0, 5) : [])) {
    if (!ID.test(String(id))) continue;
    const [d] = await store.rows('so_dokumente', { where: { id: Number(id), anfrage_id: a.id }, limit: 1 });
    if (d) anhaenge.push({ name: d.name, inhalt: await store.readFile(d.pfad) });
  }
  const quelle = text !== undefined ? text : v.text;
  const linkW = await ablauf.linkWerte(store, a, quelle, rq);
  const r = await mailLib.senden(store, { anfrage: a, vorlageId, an, werte: Object.assign(extra, linkW), fragebogen: fbDaten, tabelle: kostenLib.tabelle(k), anhaenge, benutzer: user, req: rq, erzwingen: true, eigenerText: quelle });
  if (vorlageId === 'A1.5') await store.addEreignis({ anfrage_id: a.id, benutzer: user, art: 'kosten_gesendet', details: { gesamt: k.gesamt } });
  res.status(200).json({ ok: true, mail: r.mail, gesendet: r.gesendet });
}

async function mailsErneut(req, res, ctx) {
  if (req.method !== 'POST') { fehler(res, 405, 'method_not_allowed'); return; }
  const mid = ctx.url.searchParams.get('mail') || '';
  if (!ID.test(mid)) { fehler(res, 400, 'invalid_id'); return; }
  const [m] = await ctx.store.rows('so_mails', { where: { id: Number(mid) }, limit: 1 });
  if (!m) { fehler(res, 404, 'not_found'); return; }
  if (m.status === 'gesendet') { fehler(res, 409, 'already_sent'); return; }
  const a = await ctx.store.getAnfrage(m.anfrage_id);
  if (!a) { fehler(res, 404, 'not_found'); return; }
  const r = await mailLib.erneut(ctx.store, m, a, ctx.user, ctx.req);
  res.status(200).json({ ok: true, mail: r.mail, gesendet: r.gesendet });
}

module.exports = { akte, fragebogen, dokumente, datei, dateiSenden, kosten, antrag, dokument, termine, mails, mailsErneut };
