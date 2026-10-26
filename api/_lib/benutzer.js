/* ============================================================
   HQ-Benutzer aus der Datenbank (so_benutzer) — zusätzlich zu den
   festen Zugängen aus HQ_USERS. Einladung per E-Mail: Link mit
   32 Byte Zufall (nur SHA-256-Hash gespeichert, 7 Tage gültig),
   die Person legt ihr Passwort selbst fest (scrypt-Hash).
   Anmeldung mit der E-Mail-Adresse.
   ============================================================ */
const crypto = require('crypto');
const guard = require('../../form-guard.js');
const mailLib = require('./mail');
const einstLib = require('./einstellungen');

const ROLLEN = ['admin', 'mitarbeit'];
const EINLADUNG_TAGE = 7;
const PW_MIN = 10;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function normalEmail(e) { return String(e || '').trim().toLowerCase(); }
function emailOk(e) { return e.length <= 254 && guard.check('email', e) === ''; }

/* scrypt$N$r$p$salt$hash */
function passwortHash(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return ['scrypt', 16384, 8, 1, salt.toString('base64'), h.toString('base64')].join('$');
}
function passwortPruefen(pw, gespeichert) {
  const t = String(gespeichert || '').split('$');
  if (t.length !== 6 || t[0] !== 'scrypt') { crypto.scryptSync('x', 'y', 64); return false; }
  const soll = Buffer.from(t[5], 'base64');
  const ist = crypto.scryptSync(String(pw || ''), Buffer.from(t[4], 'base64'), soll.length, { N: Number(t[1]), r: Number(t[2]), p: Number(t[3]) });
  return crypto.timingSafeEqual(soll, ist);
}
function passwortRegel(pw) {
  const s = String(pw || '');
  if (s.length < PW_MIN) return 'password_too_short';
  if (s.length > 200) return 'password_too_long';
  return '';
}

async function finden(store, email) {
  return (await store.rows('so_benutzer', { where: { email: normalEmail(email) }, limit: 1 }))[0] || null;
}

/* Öffentliche Sicht (ohne Hashes) */
function oeffentlich(b) {
  const status = !b.aktiv ? 'gesperrt' : b.passwort_hash ? 'aktiv' : 'eingeladen';
  return { id: b.id, email: b.email, name: b.name, rolle: b.rolle, status, eingeladen_am: b.eingeladen_am, eingeladen_von: b.eingeladen_von, einladung_bis: b.einladung_bis, letzter_login: b.letzter_login };
}

/* Anmeldung DB-Benutzer → { email, name, rolle } oder null */
async function anmelden(store, email, pw) {
  const b = await finden(store, email);
  if (!b || !b.aktiv || !b.passwort_hash) { passwortPruefen(pw, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64')); return null; }
  if (!passwortPruefen(pw, b.passwort_hash)) return null;
  await store.update('so_benutzer', { id: b.id }, { letzter_login: new Date().toISOString() });
  return b;
}

/* Sitzung eines DB-Benutzers noch gültig? (gesperrt/entfernt → nein) */
async function sitzungsBenutzer(store, email) {
  const b = await finden(store, email);
  return b && b.aktiv && b.passwort_hash ? b : null;
}

/* Einladung (neu oder erneut) inkl. E-Mail. Liefert { benutzer, link, mail:{ok,fehler} } */
async function einladen(store, { email, name, rolle, von, req }) {
  const e = normalEmail(email);
  const token = crypto.randomBytes(32).toString('base64url');
  const bis = new Date(Date.now() + EINLADUNG_TAGE * 864e5).toISOString();
  const jetzt = new Date().toISOString();
  let b = await finden(store, e);
  const patch = { einladung_hash: hash(token), einladung_bis: bis, eingeladen_am: jetzt, eingeladen_von: von };
  if (b) {
    if (name) patch.name = name;
    if (rolle) patch.rolle = rolle;
    patch.aktiv = true;
    [b] = await store.update('so_benutzer', { id: b.id }, patch);
  } else {
    b = await store.insert('so_benutzer', Object.assign({ email: e, name: name || '', rolle: rolle || 'mitarbeit', aktiv: true, passwort_hash: '' }, patch));
  }
  const link = mailLib.basisUrl(req) + '/hq#/einladung/' + token;
  const mail = await einladungsmail(store, b, link, von, req);
  return { benutzer: b, link, mail };
}

async function einladungsmail(store, b, link, von, req) {
  const e = await einstLib.laden(store);
  const anrede = b.name ? 'Guten Tag ' + b.name + ',' : 'Guten Tag,';
  const bloecke = [
    { art: 'absatz', text: anrede },
    { art: 'absatz', text: 'Sie wurden' + (von ? ' von ' + von : '') + ' zum Kanzlei-HQ von Scheidung-Online eingeladen. Dort werden Anfragen, Mandate und Akten bearbeitet.' },
    { art: 'absatz', text: 'Bitte legen Sie über den folgenden Button Ihr persönliches Passwort fest. Danach melden Sie sich mit Ihrer E-Mail-Adresse ' + b.email + ' an.' },
    { art: 'button', text: 'Passwort festlegen', href: link },
    { art: 'hinweis', text: 'Der Link ist persönlich und ' + EINLADUNG_TAGE + ' Tage gültig. Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie die E-Mail einfach.' }
  ];
  const r = await mailLib.zustellen({
    an: b.email, betreff: 'Einladung zum Kanzlei-HQ · Scheidung-Online',
    html: mailLib.html(bloecke, e, mailLib.basisUrl(req)), text: mailLib.text(bloecke, e),
    absender: e.mail.absender, replyTo: e.kanzlei.email
  });
  console.log('[hq] Einladung an ' + b.email.replace(/^(.).*@/, '$1…@') + ': ' + (r.ok ? 'gesendet' : r.fehler));
  return { ok: r.ok, fehler: r.ok ? '' : r.fehler };
}

/* Einladung einlösen: Token prüfen, Passwort setzen */
async function einladungPruefen(store, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { fehler: 'link_invalid' };
  const b = (await store.rows('so_benutzer', { where: { einladung_hash: hash(token) }, limit: 1 }))[0];
  if (!b || !b.aktiv) return { fehler: 'link_invalid' };
  if (!b.einladung_bis || new Date(b.einladung_bis).getTime() < Date.now()) return { fehler: 'link_expired' };
  return { benutzer: b };
}
async function einladungAnnehmen(store, token, passwort) {
  const r = await einladungPruefen(store, token);
  if (r.fehler) return r;
  const regel = passwortRegel(passwort);
  if (regel) return { fehler: regel };
  const [b] = await store.update('so_benutzer', { id: r.benutzer.id }, { passwort_hash: passwortHash(passwort), einladung_hash: null, einladung_bis: null, passwort_gesetzt_am: new Date().toISOString() });
  return { benutzer: b };
}

module.exports = { ROLLEN, PW_MIN, normalEmail, emailOk, passwortHash, passwortPruefen, passwortRegel, finden, oeffentlich, anmelden, sitzungsBenutzer, einladen, einladungPruefen, einladungAnnehmen };
