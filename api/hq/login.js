/* HQ-Anmeldung: POST {name, passwort} → Sitzungs-Cookie · DELETE → Abmelden · GET → wer bin ich
   Brute-Force-Sperre: 6 Fehlversuche je IP in 10 Minuten. In Produktion persistent in
   Supabase (so_login_versuche), lokal/Datei-Store nur im Speicher der Instanz. */
const auth = require('../_lib/auth');
const { getStore } = require('../_lib/store');
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
  const store = getStore();
  const persistent = store && store.kind === 'supabase';

  const b = readBody(req) || {};
  const name = typeof b.name === 'string' ? b.name : '';

  // Sperre: In-Memory (Instanz) + persistent/atomar in Supabase. Jeder Versuch wird VOR der Passwortprüfung
  // gezählt (kein Check-then-Act); ein erfolgreicher Login setzt den Zähler der IP zurück.
  const f = fails.get(ip);
  let gesperrt = !!(f && f.count >= MAX_FAILS && Date.now() - f.last < LOCK_MS);
  if (!gesperrt && persistent) {
    try { gesperrt = (await store.loginVersuch(ip, name)) > MAX_FAILS; }
    catch (e) { console.error('[hq/login] Sperrzähler nicht erreichbar:', e.message); }
  }
  if (gesperrt) {
    await new Promise((r) => setTimeout(r, 600));
    res.status(429).json({ ok: false, error: 'locked' });
    return;
  }

  const user = auth.login(name, b.passwort);
  if (!user) {
    fails.set(ip, { count: (f && Date.now() - f.last < LOCK_MS ? f.count : 0) + 1, last: Date.now() });
    await new Promise((r) => setTimeout(r, 600));
    res.status(401).json({ ok: false, error: 'invalid_login' });
    return;
  }
  fails.delete(ip);
  if (persistent) {
    try { await store.loginErfolg(ip); } catch (e) { console.error('[hq/login] Zähler nicht zurückgesetzt:', e.message); }
  }
  auth.setSession(res, user);
  res.status(200).json({ ok: true, user });
};
