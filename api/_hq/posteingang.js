/* ============================================================
   HQ — Posteingang/Akten (B2), Anfrage-Detail (B3), Aktionen, KI.
   GET    /api/hq/anfragen?modul=posteingang|akten&status=&quelle=&q=&offset=&spam=1
   GET    /api/hq/anfragen?id=…        Detail (Anfrage, Verlauf, Mails, Mandat-Freigabe)
   PATCH  /api/hq/anfragen?id=…        {status|notizen|wiedervorlage|az_kanzlei|az_gericht|gericht}
   DELETE /api/hq/anfragen?id=…        {grund}  endgültig löschen + Löschnachweis
   POST   /api/hq/aktion?id=…          {art, text?, az_gericht?}
   POST   /api/hq/ki?id=…              KI-Einordnung neu anstoßen
   ============================================================ */
const { STATUS, TYPEN, LISTE_LIMIT, tagBerlin, wochentagBerlin, plusTage } = require('../_lib/store');
const { readBody, saeubern } = require('../_lib/http');
const ablauf = require('../_lib/ablauf');
const vorlagenLib = require('../_lib/vorlagen');
const kiLib = require('../_lib/ki');
const uploadLib = require('../_lib/upload');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function datumGueltig(s) {
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/* Mandat darf erst angeboten werden, wenn Widerrufsbelehrung und Gebührenhinweis gepflegt sind */
async function mandatFreigegeben(store) {
  const v = await vorlagenLib.laden(store);
  const fehlend = vorlagenLib.MANDAT_DOKUMENTE.filter((id) => !String((v.find((x) => x.id === id) || {}).text || '').trim());
  return { frei: !fehlend.length, fehlend: fehlend.map((id) => (v.find((x) => x.id === id) || {}).name || id) };
}

function zeile(a) {
  return Object.assign({}, a, {
    status_label: ablauf.LABEL[a.status] || a.status,
    naechste_aktion: ablauf.AKTION[a.status] || '',
    quelle_label: ablauf.QUELLE[a.typ] || a.typ,
    ki_ampel: a.ki && a.ki.ampel ? a.ki.ampel : '',
    ki_zusammenfassung: a.ki && a.ki.zusammenfassung ? a.ki.zusammenfassung : ''
  });
}

/* Termine in der laufenden Kalenderwoche (Mo–So, Berlin) */
async function termineWoche(store) {
  const heute = tagBerlin(new Date());
  const wd = wochentagBerlin(new Date());
  const montag = plusTage(heute, -((wd + 6) % 7));
  const sonntag = plusTage(montag, 6);
  const rows = await store.rows('so_termine', { where: { datum: { gte: montag } }, limit: 500 });
  return rows.filter((t) => t.datum <= sonntag).length;
}

async function liste(store, url) {
  const modul = url.searchParams.get('modul') === 'akten' ? 'akten' : 'posteingang';
  const status = url.searchParams.get('status') || '';
  const quelle = url.searchParams.get('quelle') || '';
  const q = (url.searchParams.get('q') || '').slice(0, 80);
  const spam = url.searchParams.get('spam') === '1';
  const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(offsetRaw, 0), 10000) : 0;
  const typ = TYPEN.includes(quelle) ? quelle : '';
  let statusIn = null;
  let st = '';
  if (status === 'antraege_pruefen') statusIn = ['fragebogen_vollstaendig', 'antrag_vorbereitung'];
  else if (STATUS.includes(status)) st = status;
  if (!st && !statusIn && modul === 'akten') statusIn = ablauf.AKTE;
  const [l, zaehler, spamListe, tw] = await Promise.all([
    store.listAnfragen({ status: st, statusIn, typ, q, spam, limit: LISTE_LIMIT, offset }),
    store.counts({}),
    spam ? Promise.resolve(null) : store.listAnfragen({ spam: true, limit: 50 }),
    termineWoche(store).catch(() => 0)
  ]);
  const s = zaehler.status;
  return {
    ok: true, modul, anfragen: l.rows.map(zeile), treffer: l.treffer, offset, limit: LISTE_LIMIT, zaehler,
    kpi: { neu: s.neu || 0, warten_unterschrift: s.mandat_angeboten || 0, warten_fragebogen: s.unterschrieben || 0, antraege_pruefen: (s.fragebogen_vollstaendig || 0) + (s.antrag_vorbereitung || 0), termine_woche: tw },
    spam: spamListe ? spamListe.rows.map((a) => ({ id: a.id, nummer: a.nummer, name: [a.vorname, a.nachname].filter(Boolean).join(' ') || a.email, email: a.email, grund: a.spam_grund, created_at: a.created_at })) : [],
    status_labels: ablauf.LABEL, stand: new Date().toISOString()
  };
}

async function detail(store, a) {
  const [verlauf, mails, freigabe] = await Promise.all([
    store.listEreignisse(a.id),
    store.rows('so_mails', { where: { anfrage_id: a.id }, order: 'created_at.desc', limit: 100 }),
    mandatFreigegeben(store)
  ]);
  return { ok: true, anfrage: zeile(a), verlauf, mails, mandat_freigabe: freigabe, akte: ablauf.AKTE.includes(a.status), status_labels: ablauf.LABEL };
}

async function anfragen(req, res, ctx) {
  const { store, user, url } = ctx;
  const id = url.searchParams.get('id');
  if (req.method === 'GET' && !id) { res.status(200).json(await liste(store, url)); return; }
  if (!id || !UUID.test(id)) { res.status(400).json({ ok: false, error: 'invalid_id' }); return; }
  const a = await store.getAnfrage(id);
  if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }

  if (req.method === 'GET') { res.status(200).json(await detail(store, a)); return; }

  if (req.method === 'PATCH') {
    const b = readBody(req);
    if (!b) { res.status(400).json({ ok: false, error: 'invalid_body' }); return; }
    const patch = {};
    const events = [];
    if (typeof b.notizen === 'string') {
      if (b.notizen.length > 10000) { res.status(400).json({ ok: false, error: 'notes_too_long' }); return; }
      const notizen = saeubern(b.notizen);
      if (notizen !== (a.notizen || '')) { patch.notizen = notizen; events.push({ art: 'notiz', details: {} }); }
    }
    if (Object.prototype.hasOwnProperty.call(b, 'wiedervorlage')) {
      const wv = b.wiedervorlage;
      if (wv !== null && wv !== '' && !(typeof wv === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wv) && datumGueltig(wv))) {
        res.status(400).json({ ok: false, error: 'invalid_wiedervorlage' }); return;
      }
      const neu = wv || null;
      if (neu !== (a.wiedervorlage || null)) { patch.wiedervorlage = neu; events.push({ art: 'wiedervorlage', details: { von: a.wiedervorlage || null, nach: neu } }); }
    }
    ['az_kanzlei', 'az_gericht', 'gericht'].forEach((k) => {
      if (typeof b[k] !== 'string') return;
      const v = saeubern(b[k]).trim().slice(0, 120);
      if (v !== (a[k] || '')) { patch[k] = v; events.push({ art: 'akte', details: { feld: k, nach: v } }); }
    });
    let aktuell = a;
    if (Object.keys(patch).length) aktuell = await store.updateAnfrage(id, patch);
    for (const e of events) await store.addEreignis({ anfrage_id: id, benutzer: user, ...e });
    // Status ohne E-Mail (z. B. „Rückgängig“); E-Mail-Aktionen laufen über /api/hq/aktion
    if (typeof b.status === 'string' && b.status !== aktuell.status) {
      if (!STATUS.includes(b.status)) { res.status(400).json({ ok: false, error: 'invalid_status' }); return; }
      aktuell = await ablauf.setStatus(store, aktuell, b.status, user, { info: { manuell: true } });
    }
    res.status(200).json({ ok: true, anfrage: zeile(aktuell) });
    return;
  }

  if (req.method === 'DELETE') {
    const g = (readBody(req) || {}).grund;
    const grund = typeof g === 'string' ? saeubern(g).slice(0, 300) : '';
    const pfade = await uploadLib.allePfade(store, id);
    // Erst der Nachweis (ohne Personendaten), dann das Löschen — scheitert der Nachweis, bleibt alles erhalten
    await store.addLoeschung({ nummer: a.nummer, typ: a.typ, benutzer: user, grund });
    try { await store.removeFiles(pfade); } catch (e) { console.error('[hq] Dateien nicht gelöscht:', e.message); }
    await store.deleteAnfrage(id);
    console.log(`[hq] ${user} hat Anfrage ${a.nummer} gelöscht (${pfade.length} Dateien)`);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ ok: false, error: 'method_not_allowed' });
}

async function aktion(req, res, ctx) {
  const { store, user, url } = ctx;
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return; }
  const id = url.searchParams.get('id');
  if (!id || !UUID.test(id)) { res.status(400).json({ ok: false, error: 'invalid_id' }); return; }
  const b = readBody(req) || {};
  if (!ablauf.AKTIONEN.includes(b.art)) { res.status(400).json({ ok: false, error: 'invalid_action' }); return; }
  const a = await store.getAnfrage(id);
  if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  const freigabe = b.art === 'mandat_anbieten' ? (await mandatFreigegeben(store)).frei : false;
  try {
    const r = await ablauf.aktion(store, a, b.art, { text: typeof b.text === 'string' ? saeubern(b.text) : '', az_gericht: b.az_gericht, benutzer: user, req, mandatFreigegeben: freigabe });
    res.status(200).json({ ok: true, anfrage: zeile(r.anfrage), mail: r.mail ? { id: r.mail.id, status: r.mail.status, fehler: r.mail.fehler } : null });
  } catch (e) {
    if (e.code) { res.status(409).json({ ok: false, error: e.code }); return; }
    throw e;
  }
}

async function ki(req, res, ctx) {
  const { store, url } = ctx;
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return; }
  const id = url.searchParams.get('id');
  if (!id || !UUID.test(id)) { res.status(400).json({ ok: false, error: 'invalid_id' }); return; }
  const a = await store.getAnfrage(id);
  if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  const r = await kiLib.einordnen(store, a, { erzwingen: true });
  if (r.fehler) { res.status(r.fehler === 'ki_not_configured' ? 503 : 502).json({ ok: false, error: r.fehler }); return; }
  res.status(200).json({ ok: true, ki: r.ki });
}

module.exports = { anfragen, aktion, ki, mandatFreigegeben, zeile };
