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

function users() {
  const raw = process.env.HQ_USERS || '';
  const map = new Map();
  raw.split(';').forEach((pair) => {
    const i = pair.indexOf(':');
    if (i < 1) return;
    map.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1));
  });
  return map;
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

function issueToken(user) {
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ u: user, exp }), 'utf8').toString('base64url');
  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !secret()) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || !data.exp || data.exp < Date.now()) return null;
    if (!users().has(data.u)) return null;
    return { user: data.u, exp: data.exp };
  } catch (e) {
    return null;
  }
}

function login(name, password) {
  const u = String(name || '').trim().toLowerCase();
  const stored = users().get(u);
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
  res.setHeader('Set-Cookie', cookieHeader('', 0));
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

module.exports = { configured, login, setSession, clearSession, requireUser, verifyToken, COOKIE };
