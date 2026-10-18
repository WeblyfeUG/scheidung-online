/* ============================================================
   HQ-Modul 1 — Anfragen.
   GET  /api/hq/anfragen?uebersicht=1                 Dashboard-Daten
   GET  /api/hq/anfragen?status=&typ=&q=&offset=      Liste + Treffer + Zähler
   GET  /api/hq/anfragen?id=…                         Detail (+ Verlauf + Antragsfelder)
   PATCH /api/hq/anfragen?id=…  {status|notizen|antrag|wiedervorlage|ereignis}
   DELETE /api/hq/anfragen?id=…  {grund}              endgültig löschen (DSGVO) + Löschnachweis
   ============================================================ */
const { getStore, STATUS, TYPEN, LISTE_LIMIT } = require('../_lib/store');
const { requireUser } = require('../_lib/auth');
const { readBody, noStore } = require('../_lib/http');
const antrag = require('../_lib/antrag');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* "JJJJ-MM-TT" muss ein echtes Kalenderdatum sein (V8 würde 2026-02-30 still zu 2026-03-02 machen). */
function datumGueltig(s) {
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function detailAntwort(a, verlauf) {
  const e = antrag.effektiv(a);
  return { ok: true, anfrage: a, verlauf, antragsfelder: antrag.FELDER, antragswerte: e.werte, vorbelegt: e.vorbelegt, nichtZutreffend: e.nichtZutreffend, hinweise: e.hinweise };
}

module.exports = async (req, res) => {
  noStore(res);
  const user = requireUser(req, res);
  if (!user) return;
  const store = getStore();
  if (!store) {
    res.status(503).json({ ok: false, error: 'store_not_configured' });
    return;
  }

  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('id');

  try {
    if (req.method === 'GET' && !id && url.searchParams.get('uebersicht') === '1') {
      const u = await store.uebersicht();
      res.status(200).json({ ok: true, stand: new Date().toISOString(), ...u });
      return;
    }

    if (req.method === 'GET' && !id) {
      const status = url.searchParams.get('status') || '';
      const typ = url.searchParams.get('typ') || '';
      const q = (url.searchParams.get('q') || '').slice(0, 80);
      const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
      const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(offsetRaw, 0), 10000) : 0;
      const typOk = TYPEN.includes(typ) ? typ : '';
      const [liste, zaehler] = await Promise.all([
        store.listAnfragen({ status: STATUS.includes(status) ? status : '', typ: typOk, q, limit: LISTE_LIMIT, offset }),
        store.counts({ typ: typOk })
      ]);
      res.status(200).json({ ok: true, anfragen: liste.rows, treffer: liste.treffer, offset, limit: LISTE_LIMIT, zaehler, stand: new Date().toISOString() });
      return;
    }

    if (!id || !UUID.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    if (req.method === 'GET') {
      const a = await store.getAnfrage(id);
      if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const verlauf = await store.listEreignisse(id);
      res.status(200).json(detailAntwort(a, verlauf));
      return;
    }

    if (req.method === 'PATCH') {
      const b = readBody(req);
      if (!b) { res.status(400).json({ ok: false, error: 'invalid_body' }); return; }
      const a = await store.getAnfrage(id);
      if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const patch = {};
      const events = [];
      if (typeof b.status === 'string') {
        if (!STATUS.includes(b.status)) { res.status(400).json({ ok: false, error: 'invalid_status' }); return; }
        if (b.status !== a.status) { patch.status = b.status; events.push({ art: 'status', details: { von: a.status, nach: b.status } }); }
      }
      if (typeof b.notizen === 'string') {
        if (b.notizen.length > 10000) { res.status(400).json({ ok: false, error: 'notes_too_long' }); return; }
        if (b.notizen !== (a.notizen || '')) { patch.notizen = b.notizen; events.push({ art: 'notiz', details: {} }); }
      }
      if (Object.prototype.hasOwnProperty.call(b, 'wiedervorlage')) {
        const wv = b.wiedervorlage;
        if (wv !== null && wv !== '' && !(typeof wv === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wv) && datumGueltig(wv))) {
          res.status(400).json({ ok: false, error: 'invalid_wiedervorlage' }); return;
        }
        const neu = wv || null;
        if (neu !== (a.wiedervorlage || null)) { patch.wiedervorlage = neu; events.push({ art: 'wiedervorlage', details: { von: a.wiedervorlage || null, nach: neu } }); }
      }
      if (b.antrag && typeof b.antrag === 'object' && !Array.isArray(b.antrag)) {
        const werte = antrag.bereinigen(b.antrag);
        const alt = a.antrag || {};
        const neu = { ...alt, ...werte };
        if (JSON.stringify(neu) !== JSON.stringify(alt)) {
          patch.antrag = neu;
          events.push({ art: 'antrag', details: { felder: Object.keys(werte).filter((k) => alt[k] !== werte[k]) } });
        }
      }
      if (b.ereignis !== undefined) {
        if (b.ereignis !== 'checkliste_gesendet' || a.typ !== 'checkliste_pdf') { res.status(400).json({ ok: false, error: 'invalid_event' }); return; }
        events.push({ art: 'checkliste_gesendet', details: { email: a.email } });
      }
      if (!Object.keys(patch).length && !events.length) { res.status(200).json({ ok: true, anfrage: a, unveraendert: true }); return; }
      const updated = Object.keys(patch).length ? await store.updateAnfrage(id, patch) : a;
      for (const e of events) await store.addEreignis({ anfrage_id: id, benutzer: user, ...e });
      const e = antrag.effektiv(updated);
      res.status(200).json({ ok: true, anfrage: updated, antragswerte: e.werte, vorbelegt: e.vorbelegt, nichtZutreffend: e.nichtZutreffend, hinweise: e.hinweise });
      return;
    }

    if (req.method === 'DELETE') {
      const a = await store.getAnfrage(id);
      if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      await store.deleteAnfrage(id);
      console.log(`[hq] ${user} hat Anfrage ${a.nummer} gelöscht`);
      try {
        const g = (readBody(req) || {}).grund;
        const grund = typeof g === 'string' ? g.slice(0, 300) : '';
        await store.addLoeschung({ nummer: a.nummer, typ: a.typ, benutzer: user, grund });
      } catch (e) {
        console.error('[hq/anfragen] Löschnachweis fehlgeschlagen:', e.message);
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[hq/anfragen]', e.message);
    res.status(502).json({ ok: false, error: 'store_failed' });
  }
};
