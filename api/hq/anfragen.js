/* ============================================================
   HQ-Modul 1 — Anfragen.
   GET  /api/hq/anfragen?status=&typ=&q=        Liste + Zähler
   GET  /api/hq/anfragen?id=…                   Detail (+ Verlauf + Antragsfelder)
   PATCH /api/hq/anfragen?id=…  {status|notizen|antrag}
   DELETE /api/hq/anfragen?id=…                 endgültig löschen (DSGVO)
   ============================================================ */
const { getStore, STATUS, TYPEN } = require('../_lib/store');
const { requireUser } = require('../_lib/auth');
const { readBody, noStore } = require('../_lib/http');
const antrag = require('../_lib/antrag');

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
    if (req.method === 'GET' && !id) {
      const status = url.searchParams.get('status') || '';
      const typ = url.searchParams.get('typ') || '';
      const q = (url.searchParams.get('q') || '').slice(0, 80);
      const [liste, zaehler] = await Promise.all([
        store.listAnfragen({
          status: STATUS.includes(status) ? status : '',
          typ: TYPEN.includes(typ) ? typ : '',
          q
        }),
        store.counts()
      ]);
      res.status(200).json({ ok: true, anfragen: liste, zaehler });
      return;
    }

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    if (req.method === 'GET') {
      const a = await store.getAnfrage(id);
      if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      const verlauf = await store.listEreignisse(id);
      res.status(200).json({
        ok: true, anfrage: a, verlauf,
        antragsfelder: antrag.FELDER,
        antragswerte: antrag.effektiv(a)
      });
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
        if (b.notizen !== a.notizen) { patch.notizen = b.notizen; events.push({ art: 'notiz', details: {} }); }
      }
      if (b.antrag && typeof b.antrag === 'object') {
        const werte = antrag.bereinigen(b.antrag);
        patch.antrag = { ...(a.antrag || {}), ...werte };
        events.push({ art: 'antrag', details: { felder: Object.keys(werte).length } });
      }
      if (!Object.keys(patch).length) { res.status(200).json({ ok: true, anfrage: a, unveraendert: true }); return; }
      const updated = await store.updateAnfrage(id, patch);
      for (const e of events) await store.addEreignis({ anfrage_id: id, benutzer: user, ...e });
      res.status(200).json({ ok: true, anfrage: updated, antragswerte: antrag.effektiv(updated) });
      return;
    }

    if (req.method === 'DELETE') {
      const a = await store.getAnfrage(id);
      if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
      await store.deleteAnfrage(id);
      console.log(`[hq] ${user} hat Anfrage ${a.nummer} gelöscht`);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[hq/anfragen]', e.message);
    res.status(502).json({ ok: false, error: 'store_failed' });
  }
};
