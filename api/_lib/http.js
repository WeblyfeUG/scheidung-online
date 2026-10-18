/* Kleine Helfer für die Vercel-Node-Functions (Body lesen, Cookies, Client-IP). */

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { b = null; }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  return b;
}

function cookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) return;
    try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  });
  return out;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

/* Unsichtbare/steuernde Zeichen entfernen: C0/DEL/C1, Zero-Width, Bidi-Overrides, Zeilen-/Absatztrenner,
   BOM, Nicht-Zeichen und einsame Surrogate. Tab/LF/CR bleiben. Für alle Nutzereingaben. */
const UNSICHTBAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFFE\uFFFF]/g;
const EINSAME_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function saeubern(s) {
  return String(s == null ? '' : s).replace(EINSAME_SURROGATE, '').replace(UNSICHTBAR, '');
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = { readBody, cookies, clientIp, noStore, saeubern };
