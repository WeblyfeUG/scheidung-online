/* HQ-Anmeldung: POST {name, passwort} → Sitzungs-Cookie · DELETE → Abmelden · GET → wer bin ich */
const auth = require('../_lib/auth');
const { readBody, clientIp, noStore, cookies } = require('../_lib/http');

const fails = new Map(); // Fehlversuche je IP (best effort, pro Instanz)
const MAX_FAILS = 6;
const LOCK_MS = 10 * 60 * 1000;

module.exports = async (req, res) => {
  noStore(res);
  if (!auth.configured()) {
    res.status(503).json({ ok: false, error: 'hq_not_configured' });
    return;
  }

  if (req.method === 'GET') {
    const s = auth.verifyToken(cookies(req)[auth.COOKIE]);
    res.status(s ? 200 : 401).json(s ? { ok: true, user: s.user, exp: s.exp } : { ok: false, error: 'unauthorized' });
    return;
  }
  if (req.method === 'DELETE') {
    auth.clearSession(res);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const ip = clientIp(req);
  const f = fails.get(ip);
  if (f && f.count >= MAX_FAILS && Date.now() - f.last < LOCK_MS) {
    res.status(429).json({ ok: false, error: 'locked' });
    return;
  }

  const b = readBody(req) || {};
  const user = auth.login(b.name, b.passwort);
  if (!user) {
    fails.set(ip, { count: (f && Date.now() - f.last < LOCK_MS ? f.count : 0) + 1, last: Date.now() });
    await new Promise((r) => setTimeout(r, 600));
    res.status(401).json({ ok: false, error: 'invalid_login' });
    return;
  }
  fails.delete(ip);
  auth.setSession(res, user);
  res.status(200).json({ ok: true, user });
};
