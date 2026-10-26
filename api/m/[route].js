/* ============================================================
   Mandanten-API (/api/m/<route>?token=…): ein Router, Rate-Limit
   30 Aufrufe/Minute je IP (best effort je Instanz). Uploads zählen
   je Teil. Handler: api/_m/mandant.js
   ============================================================ */
const { getStore } = require('../_lib/store');
const { noStore, clientIp } = require('../_lib/http');
const h = require('../_m/mandant');

const ROUTEN = { mandat: h.mandat, fragebogen: h.fragebogen, upload: h.upload, datei: h.datei, status: h.status, weiter: h.weiter, 'link-neu': h.linkNeu };
const WINDOW_MS = 60 * 1000;
const MAX = 30;
const hits = new Map();

function limitiert(ip) {
  const now = Date.now();
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX;
}

module.exports = async (req, res) => {
  noStore(res);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://x');
  const route = (req.query && req.query.route) || url.pathname.split('/').filter(Boolean).pop();
  const handler = Object.prototype.hasOwnProperty.call(ROUTEN, route) ? ROUTEN[route] : null;
  if (!handler) { res.status(404).json({ ok: false, error: 'not_found' }); return; }
  if (limitiert(clientIp(req))) { res.status(429).json({ ok: false, error: 'rate_limited' }); return; }
  const store = getStore();
  if (!store) { res.status(503).json({ ok: false, error: 'store_not_configured' }); return; }
  try {
    await handler(req, res, { store, url, req });
  } catch (e) {
    console.error('[m/' + route + ']', e.message);
    if (!res.headersSent) res.status(502).json({ ok: false, error: 'store_failed' });
  }
};
