/* ============================================================
   HQ-API (Kanzlei, Cookie-Sitzung): ein Router für alle Endpunkte
   unter /api/hq/<route> — Vercel Hobby erlaubt höchstens 12 Functions.
   Handler: api/_hq/*.js · API-Vertrag: HQ-README.md
   ============================================================ */
const { getStore } = require('../_lib/store');
const { requireUser } = require('../_lib/auth');
const { noStore } = require('../_lib/http');
const login = require('../_hq/login');
const posteingang = require('../_hq/posteingang');
const akte = require('../_hq/akte');
const admin = require('../_hq/admin');

const ROUTEN = {
  anfragen: posteingang.anfragen,
  aktion: posteingang.aktion,
  ki: posteingang.ki,
  akte: akte.akte,
  fragebogen: akte.fragebogen,
  dokumente: akte.dokumente,
  datei: akte.datei,
  kosten: akte.kosten,
  antrag: akte.antrag,
  dokument: akte.dokument,
  termine: akte.termine,
  mails: akte.mails,
  'mails-erneut': akte.mailsErneut,
  vorlagen: admin.vorlagen,
  einstellungen: admin.einstellungen
};

module.exports = async (req, res) => {
  noStore(res);
  const url = new URL(req.url, 'http://x');
  const route = (req.query && req.query.route) || url.pathname.split('/').filter(Boolean).pop();
  if (route === 'login') { await login(req, res); return; }
  const handler = Object.prototype.hasOwnProperty.call(ROUTEN, route) ? ROUTEN[route] : null;
  if (!handler) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  const user = requireUser(req, res);
  if (!user) return;
  const store = getStore();
  if (!store) { res.status(503).json({ ok: false, error: 'store_not_configured' }); return; }
  try {
    await handler(req, res, { store, user, url, req });
  } catch (e) {
    console.error('[hq/' + route + ']', e.message);
    if (!res.headersSent) res.status(502).json({ ok: false, error: 'store_failed' });
  }
};
