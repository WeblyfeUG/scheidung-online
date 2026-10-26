/* HQ-Anmeldung in zwei Schritten (B1):
   POST {name|email, passwort}  → bei Zwei-Faktor { ok, schritt:2 } + Vor-Cookie (5 Min), sonst Sitzung
   POST {code}                  → mit Vor-Cookie: TOTP prüfen → Sitzung
   GET → wer bin ich · DELETE → Abmelden
   Brute-Force-Sperre: 6 Fehlversuche je IP in 10 Minuten (Passwort und Code zählen gleich).
   In Produktion persistent in Supabase (so_login_versuche), lokal nur im Speicher der Instanz. */
const auth = require('../_lib/auth');
const { getStore } = require('../_lib/store');
const { readBody, clientIp } = require('../_lib/http');
const benutzerLib = require('../_lib/benutzer');

const fails = new Map();
const MAX_FAILS = 6;
const LOCK_MS = 10 * 60 * 1000;

module.exports = async (req, res) => {
  if (!auth.configured()) { res.status(503).json({ ok: false, error: 'hq_not_configured' }); return; }

  if (req.method === 'GET') {
    let s = null;
    try { s = await auth.sitzung(req, getStore()); } catch (e) { console.error('[hq/login] Sitzung:', e.message); }
    res.status(s ? 200 : 401).json(s ? { ok: true, user: s.user, name: s.name || '', exp: s.exp, admin: s.admin } : { ok: false, error: 'unauthorized' });
    return;
  }
  if (req.method === 'DELETE') { auth.clearSession(res); res.status(200).json({ ok: true }); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return; }

  const ip = clientIp(req);
  const store = getStore();
  const persistent = store && store.kind === 'supabase';
  const b = readBody(req) || {};
  const codeSchritt = typeof b.code === 'string';
  const pre = codeSchritt ? auth.preUser(req) : null;
  const name = codeSchritt ? (pre || '') : (typeof b.name === 'string' ? b.name : typeof b.email === 'string' ? b.email : '');

  // Jeder Versuch wird VOR der Prüfung gezählt; Erfolg setzt den Zähler der IP zurück.
  const f = fails.get(ip);
  let gesperrt = !!(f && f.count >= MAX_FAILS && Date.now() - f.last < LOCK_MS);
  if (!gesperrt && persistent) {
    try { gesperrt = (await store.loginVersuch(ip, name)) > MAX_FAILS; }
    catch (e) { console.error('[hq/login] Sperrzähler nicht erreichbar:', e.message); }
  }
  if (gesperrt) { await new Promise((r) => setTimeout(r, 600)); res.status(429).json({ ok: false, error: 'locked' }); return; }

  const fehlschlag = async (error, status = 401) => {
    fails.set(ip, { count: (f && Date.now() - f.last < LOCK_MS ? f.count : 0) + 1, last: Date.now() });
    await new Promise((r) => setTimeout(r, 600));
    res.status(status).json({ ok: false, error });
  };
  const erfolg = async (user, admin, anzeigename) => {
    fails.delete(ip);
    if (persistent) { try { await store.loginErfolg(ip); } catch (e) { console.error('[hq/login] Zähler nicht zurückgesetzt:', e.message); } }
    auth.setSessionOhnePre(res, user);
    res.status(200).json({ ok: true, user, name: anzeigename || '', admin: admin === undefined ? auth.istAdmin(user) : admin });
  };

  if (codeSchritt) {
    if (!pre) { await fehlschlag('code_expired'); return; }
    if (!auth.totpPruefen(pre, b.code)) { await fehlschlag('invalid_code'); return; }
    await erfolg(pre);
    return;
  }

  // Eingeladene Benutzer (so_benutzer) melden sich mit ihrer E-Mail-Adresse an
  if (name.includes('@') && store) {
    let db = null;
    try { db = await benutzerLib.anmelden(store, name, b.passwort); } catch (e) { console.error('[hq/login] Benutzer:', e.message); }
    if (db) { await erfolg(db.email, db.rolle === 'admin', db.name); return; }
  }
  // Feste Zugänge (HQ_USERS): Benutzername oder E-Mail-Adresse (Teil vor dem @ als Name)
  let user = auth.login(name, b.passwort);
  if (!user && name.includes('@')) user = auth.login(name.split('@')[0], b.passwort);
  if (!user) { await fehlschlag('invalid_login'); return; }
  if (auth.braucht2fa(user)) {
    fails.delete(ip);
    auth.setPre(res, user);
    res.status(200).json({ ok: true, schritt: 2 });
    return;
  }
  await erfolg(user);
};
