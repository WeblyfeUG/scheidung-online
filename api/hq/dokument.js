/* ============================================================
   HQ-Modul 2 — Word-Dokument aus einer Anfrage erzeugen.
   GET /api/hq/dokument?id=…&typ=antragsentwurf|vollmacht  → .docx
   Nutzt die gespeicherten/vorbelegten Antragsfelder; offene
   Felder erscheinen im Dokument als sichtbare Lücke "________",
   nicht zutreffende Felder (z. B. Kinder bei kinderloser Ehe) bleiben leer.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { getStore } = require('../_lib/store');
const { requireUser } = require('../_lib/auth');
const { noStore } = require('../_lib/http');
const { fillTemplate } = require('../_lib/docx');
const antrag = require('../_lib/antrag');

const VORLAGEN = {
  antragsentwurf: { datei: 'antragsentwurf.docx', name: 'Antragsentwurf' },
  vollmacht: { datei: 'vollmacht.docx', name: 'Vollmacht' }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeName(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

module.exports = async (req, res) => {
  noStore(res);
  const user = requireUser(req, res);
  if (!user) return;
  if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return; }

  const store = getStore();
  if (!store) { res.status(503).json({ ok: false, error: 'store_not_configured' }); return; }

  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('id') || '';
  const typ = url.searchParams.get('typ') || 'antragsentwurf';
  const vorlage = VORLAGEN[typ];
  if (!vorlage || !UUID.test(id)) { res.status(400).json({ ok: false, error: 'invalid_request' }); return; }

  try {
    const a = await store.getAnfrage(id);
    if (!a) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
    const e = antrag.effektiv(a);
    const tpl = fs.readFileSync(path.join(__dirname, '..', '_templates', vorlage.datei));
    const { buffer, unresolved } = fillTemplate(tpl, { ...e.werte, kinder_beweis: e.kinder_beweis }, { leer: [...e.nichtZutreffend, 'kinder_beweis'] });
    try {
      await store.addEreignis({ anfrage_id: id, benutzer: user, art: 'dokument', details: { typ, offen: unresolved } });
    } catch (err) {
      console.error('[hq/dokument] Verlaufseintrag fehlgeschlagen:', err.message);
    }

    const fname = `${vorlage.name}_${a.nummer}_${safeName(e.werte.antragsteller_name || a.nachname)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('X-Offene-Felder', unresolved.join(','));
    res.status(200).send(buffer);
  } catch (e) {
    console.error('[hq/dokument]', e.message);
    res.status(500).json({ ok: false, error: 'document_failed' });
  }
};
