/* ============================================================
   Täglicher Erinnerungslauf (Vercel Cron, morgens Berlin).
   Absicherung: Authorization: Bearer $CRON_SECRET (setzt Vercel
   automatisch, wenn CRON_SECRET hinterlegt ist).
   - mandat_angeboten ohne Unterschrift → A1.4 (fehlend: Unterschrift)
   - unterschrieben ohne fertigen Fragebogen → A1.4 (Fragebogen, ggf. Heiratsurkunde)
   Erste Erinnerung nach einstellungen.erinnerungen.erste_tage, zweite nach
   zweite_tage; danach einmalig interne Notiz „keine Reaktion“.
   ============================================================ */
const crypto = require('crypto');
const { getStore, tagBerlin } = require('../_lib/store');
const { noStore } = require('../_lib/http');
const einstLib = require('../_lib/einstellungen');
const mailLib = require('../_lib/mail');
const links = require('../_lib/links');
const ablauf = require('../_lib/ablauf');
const fbLib = require('../_lib/fragebogen');

function tageSeit(iso, heute) {
  if (!iso) return 0;
  const a = new Date(tagBerlin(new Date(iso)) + 'T00:00:00Z');
  const b = new Date(heute + 'T00:00:00Z');
  return Math.round((b - a) / 864e5);
}

async function bezug(store, a) {
  if (a.status === 'unterschrieben') return a.unterschrieben_am;
  const ev = await store.rows('so_ereignisse', { where: { anfrage_id: a.id, art: 'status' }, order: 'zeit.desc', limit: 20 });
  const e = ev.find((x) => x.details && x.details.nach === 'mandat_angeboten');
  return e ? e.zeit : a.updated_at;
}

async function lauf(store, req) {
  const e = await einstLib.laden(store);
  const heute = tagBerlin(new Date());
  const ergebnis = { geprueft: 0, erinnert: 0, keine_reaktion: 0 };
  const { rows } = await store.listAnfragen({ statusIn: ['mandat_angeboten', 'unterschrieben'], limit: 500 });
  for (const kurz of rows) {
    const a = await store.getAnfrage(kurz.id);
    if (!a || !a.email) continue;
    ergebnis.geprueft++;
    const fb = await ablauf.fragebogenDaten(store, a.id);
    if (a.status === 'unterschrieben' && fb && fb.vollstaendig_am) continue;
    const seit = await bezug(store, a);
    const tage = tageSeit(seit, heute);
    const gesendet = (await store.rows('so_mails', { where: { anfrage_id: a.id, vorlage: 'A1.4', created_at: { gte: seit } }, limit: 10 })).length;
    const faellig = (gesendet === 0 && tage >= e.erinnerungen.erste_tage) || (gesendet === 1 && tage >= e.erinnerungen.zweite_tage);
    if (faellig) {
      const daten = Object.assign({}, fbLib.vorbelegung(a), fb && fb.daten);
      const doks = await store.rows('so_dokumente', { where: { anfrage_id: a.id }, limit: 100 });
      const fehlend = a.status === 'mandat_angeboten'
        ? ['Ihre Unterschrift unter das Mandat', 'der Fragebogen']
        : ['der Fragebogen'].concat(fbLib.fehlendeUnterlagen(daten, doks).filter((u) => u.art === 'heiratsurkunde').map((u) => 'die ' + u.label));
      const zweck = a.status === 'mandat_angeboten' ? 'mandat' : 'fragebogen';
      const token = await links.erzeugen(store, a.id, zweck);
      await mailLib.senden(store, { anfrage: a, vorlageId: 'A1.4', fragebogen: fb && fb.daten, werte: { fehlend: fehlend.map((f) => '• ' + f).join('\n'), link_mandat: links.url(mailLib.basisUrl(req), zweck, token) }, benutzer: 'system', req });
      ergebnis.erinnert++;
    } else if (gesendet >= 2 && tage >= e.erinnerungen.zweite_tage + e.erinnerungen.erste_tage) {
      const notiert = (await store.rows('so_ereignisse', { where: { anfrage_id: a.id, art: 'keine_reaktion' }, limit: 1 })).length;
      if (!notiert) {
        await store.addEreignis({ anfrage_id: a.id, benutzer: 'system', art: 'keine_reaktion', details: { status: a.status } });
        await mailLib.intern(store, 'Keine Reaktion · ' + (a.az_kanzlei || a.nummer), [`Zu ${a.az_kanzlei || a.nummer} kam nach zwei Erinnerungen keine Reaktion (${ablauf.LABEL[a.status]}).`], req);
        ergebnis.keine_reaktion++;
      }
    }
  }
  return ergebnis;
}

module.exports = async (req, res) => {
  noStore(res);
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const ok = secret.length >= 16 && auth.length === secret.length + 7 && crypto.timingSafeEqual(Buffer.from(auth), Buffer.from('Bearer ' + secret));
  if (!ok) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
  const store = getStore();
  if (!store) { res.status(503).json({ ok: false, error: 'store_not_configured' }); return; }
  try {
    const r = await lauf(store, req);
    console.log('[cron] Erinnerungen:', JSON.stringify(r));
    res.status(200).json(Object.assign({ ok: true }, r));
  } catch (e) {
    console.error('[cron]', e.message);
    res.status(502).json({ ok: false, error: 'store_failed' });
  }
};

module.exports.lauf = lauf;
