/* ============================================================
   HQ-Zugang: Benutzer + Passwörter kommen aus der Umgebungs-
   variable HQ_USERS ("name:passwort;name2:passwort2"), die
   Sitzung ist ein HMAC-signiertes Token (HQ_SECRET) in einem
   HttpOnly-Cookie. Keine Nutzerdaten im Frontend, kein
   Passwort in der Datenbank.
   ============================================================ */
const crypto = require('crypto');
const { cookies } = require('./http');

const COOKIE = 'so_hq';
const SESSION_MS = 12 * 60 * 60 * 1000;

/* "name:passwort" oder "name:passwort:BASE32GEHEIMNIS" (Zwei-Faktor per TOTP-App) */
function eintraege() {
  const raw = process.env.HQ_USERS || '';
  const map = new Map();
  raw.split(';').forEach((pair) => {
    const i = pair.indexOf(':');
    if (i < 1) return;
    const rest = pair.slice(i + 1);
    const m = /^(.*):([A-Z2-7]{16,}=*)$/.exec(rest);
    map.set(pair.slice(0, i).trim().toLowerCase(), m ? { pw: m[1], totp: m[2].replace(/=+$/, '') } : { pw: rest, totp: '' });
  });
  return map;
}
function users() {
  const map = new Map();
  eintraege().forEach((v, k) => map.set(k, v.pw));
  return map;
}
/* Rolle: HQ_ADMINS="name1,name2"; ohne Angabe sind alle Benutzer Admin */
function istAdmin(user) {
  const raw = (process.env.HQ_ADMINS || '').trim();
  if (!raw) return true;
  return raw.split(',').map((x) => x.trim().toLowerCase()).includes(String(user || '').toLowerCase());
}

/* ---------- TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 Stellen) ---------- */
function base32(s) {
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += ABC.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretB32, zeit, schritt = 0) {
  const zaehler = Math.floor((zeit || Date.now()) / 30000) + schritt;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(zaehler / 0x100000000), 0);
  buf.writeUInt32BE(zaehler >>> 0, 4);
  const h = crypto.createHmac('sha1', base32(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
/* ±1 Zeitfenster Toleranz */
function totpPruefen(user, code) {
  const e = eintraege().get(String(user || '').toLowerCase());
  if (!e || !e.totp || !/^\d{6}$/.test(String(code || ''))) return false;
  return [-1, 0, 1].some((s) => safeEqual(totp(e.totp, Date.now(), s), String(code)));
}
function braucht2fa(user) {
  const e = eintraege().get(String(user || '').toLowerCase());
  return !!(e && e.totp);
}

function secret() {
  const s = process.env.HQ_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

function configured() {
  return users().size > 0 && !!secret();
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    // Länge angleichen, damit der Vergleich zeitkonstant bleibt
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function issueToken(user, art = 's', dauer = SESSION_MS) {
  const exp = Date.now() + dauer;
  const payload = Buffer.from(JSON.stringify({ u: user, exp, t: art }), 'utf8').toString('base64url');
  return payload + '.' + sign(payload);
}

function verifyToken(token, art = 's') {
  if (!token || typeof token !== 'string' || !secret()) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || !data.exp || data.exp < Date.now() || (data.t || 's') !== art) return null;
    if (!users().has(data.u)) return null;
    return { user: data.u, exp: data.exp };
  } catch (e) {
    return null;
  }
}

function login(name, password) {
  const u = String(name || '').trim().toLowerCase();
  const stored = users().get(u);
  if (stored === '') return null;
  if (!stored) { safeEqual(password || '', 'x'.repeat(24)); return null; }
  if (!safeEqual(password || '', stored)) return null;
  return u;
}

function cookieHeader(token, maxAgeSec) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

function setSession(res, user) {
  res.setHeader('Set-Cookie', cookieHeader(issueToken(user), Math.floor(SESSION_MS / 1000)));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', [cookieHeader('', 0), preCookieHeader('', 0)]);
}

/* Vor-Cookie nach Schritt 1 (Passwort richtig, Code fehlt), 5 Minuten */
const PRE_COOKIE = 'so_hq_pre';
const PRE_MS = 5 * 60 * 1000;
function preCookieHeader(token, maxAgeSec) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${PRE_COOKIE}=${token}; Path=/api/hq; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}
function setPre(res, user) {
  res.setHeader('Set-Cookie', preCookieHeader(issueToken(user, 'p', PRE_MS), Math.floor(PRE_MS / 1000)));
}
function preUser(req) {
  const s = verifyToken(cookies(req)[PRE_COOKIE], 'p');
  return s ? s.user : null;
}
function setSessionOhnePre(res, user) {
  res.setHeader('Set-Cookie', [cookieHeader(issueToken(user), Math.floor(SESSION_MS / 1000)), preCookieHeader('', 0)]);
}

/* Liefert den eingeloggten Benutzer oder beantwortet die Anfrage mit 401. */
function requireUser(req, res) {
  if (!configured()) {
    res.status(503).json({ ok: false, error: 'hq_not_configured' });
    return null;
  }
  const session = verifyToken(cookies(req)[COOKIE]);
  if (!session) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return null;
  }
  return session.user;
}

module.exports = { configured, login, setSession, setSessionOhnePre, clearSession, requireUser, verifyToken, COOKIE, istAdmin, braucht2fa, totpPruefen, totp, setPre, preUser };
