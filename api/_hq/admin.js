/* ============================================================
   HQ — Vorlagen (B5) und Einstellungen (B6).
   GET /api/hq/vorlagen        Liste + Platzhalter + Dokumentvorlagen
   PUT /api/hq/vorlagen        {id, betreff?, text?, automatisch?} | {id, zuruecksetzen:true}   (nur Admin)
   GET /api/hq/einstellungen   Werte + Nutzerliste + Integrationsstatus
   PUT /api/hq/einstellungen   {oeffnungszeiten?, antwortzeiten?, mail?, ki?, erinnerungen?, kanzlei?}  (nur Admin)
   ============================================================ */
const { readBody, saeubern } = require('../_lib/http');
const auth = require('../_lib/auth');
const benutzerLib = require('../_lib/benutzer');
const vorlagenLib = require('../_lib/vorlagen');
const einstLib = require('../_lib/einstellungen');
const fs = require('fs');
const path = require('path');
const { fillTemplate } = require('../_lib/docx');

const fehler = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra));

/* Word-Vorlagen mit ihren Platzhaltern (Anzeige in B5) — direkt aus den .docx gelesen */
let dokumentvorlagenCache = null;
function dokumentvorlagen() {
  if (dokumentvorlagenCache) return dokumentvorlagenCache;
  dokumentvorlagenCache = [['Scheidungsantrag', 'antragsentwurf.docx'], ['Vollmacht', 'vollmacht.docx']].map(([name, datei]) => {
    let platzhalter = [];
    try { platzhalter = fillTemplate(fs.readFileSync(path.join(__dirname, '..', '_templates', datei)), {}, {}).unresolved; } catch (e) { console.error('[vorlagen] ' + datei + ':', e.message); }
    return { name, datei, platzhalter };
  });
  return dokumentvorlagenCache;
}

async function vorlagen(req, res, ctx) {
  const { store, user, admin } = ctx;
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, vorlagen: await vorlagenLib.laden(store), platzhalter: vorlagenLib.PLATZHALTER, dokumentvorlagen: dokumentvorlagen(), admin });
    return;
  }
  if (req.method !== 'PUT') { fehler(res, 405, 'method_not_allowed'); return; }
  if (!admin) { fehler(res, 403, 'forbidden'); return; }
  const b = readBody(req);
  const std = b && vorlagenLib.STANDARD.find((v) => v.id === b.id);
  if (!std) { fehler(res, 400, 'invalid_template'); return; }
  if (b.zuruecksetzen === true) {
    await store.remove('so_vorlagen', { id: std.id });
  } else {
    const alt = (await store.rows('so_vorlagen', { where: { id: std.id }, limit: 1 }))[0] || {};
    const row = { id: std.id, name: std.name, betreff: typeof alt.betreff === 'string' ? alt.betreff : std.betreff, text: typeof alt.text === 'string' ? alt.text : std.text, automatisch: typeof alt.automatisch === 'boolean' ? alt.automatisch : !!std.automatisch };
    if (typeof b.betreff === 'string' && !std.dokument) row.betreff = saeubern(b.betreff).replace(/\s+/g, ' ').trim().slice(0, 200);
    if (typeof b.text === 'string') row.text = saeubern(b.text).replace(/\r\n/g, '\n').slice(0, 20000);
    if (typeof b.automatisch === 'boolean' && !std.dokument) row.automatisch = b.automatisch;
    const unbekannt = vorlagenLib.unbekanntePlatzhalter(row.betreff + '\n' + row.text);
    if (unbekannt.length) { fehler(res, 400, 'unknown_placeholders', { platzhalter: unbekannt }); return; }
    if (!std.dokument && !row.text.trim()) { fehler(res, 400, 'empty_text'); return; }
    row.aktualisiert_am = new Date().toISOString();
    row.aktualisiert_von = user;
    await store.upsert('so_vorlagen', row, 'id');
  }
  console.log(`[hq] ${user} hat Vorlage ${std.id} ${b.zuruecksetzen ? 'zurückgesetzt' : 'gespeichert'}`);
  res.status(200).json({ ok: true, vorlagen: await vorlagenLib.laden(store) });
}

/* Feste Zugänge (HQ_USERS) + eingeladene Benutzer (so_benutzer) */
async function benutzerListe(store) {
  const fest = String(process.env.HQ_USERS || '').split(';').map((p) => p.split(':')[0].trim().toLowerCase()).filter(Boolean)
    .map((name) => ({ name, rolle: auth.istAdmin(name) ? 'Admin' : 'Mitarbeit', zwei_faktor: auth.braucht2fa(name), quelle: 'fest', status: 'aktiv' }));
  let db = [];
  try { db = await store.rows('so_benutzer', { order: 'created_at.asc', limit: 200 }); } catch (e) { console.error('[hq] Benutzerliste:', e.message); }
  return fest.concat(db.map((b) => Object.assign(benutzerLib.oeffentlich(b), { name: b.name || b.email, quelle: 'einladung', zwei_faktor: false, rolle: b.rolle === 'admin' ? 'Admin' : 'Mitarbeit' })));
}

function integration() {
  const mp = (process.env.MAIL_PROVIDER || '').toLowerCase();
  return {
    mail: mp === 'resend' && process.env.MAIL_API_KEY ? 'aktiv' : mp === 'log' ? 'testmodus' : 'nicht_eingerichtet',
    ki: process.env.ANTHROPIC_API_KEY ? 'aktiv' : 'nicht_eingerichtet',
    cron: process.env.CRON_SECRET ? 'aktiv' : 'nicht_eingerichtet',
    speicher: process.env.SO_STORE_FILE ? 'lokal' : 'supabase'
  };
}

async function einstellungen(req, res, ctx) {
  const { store, user, admin } = ctx;
  if (req.method === 'GET') {
    const rows = await store.rows('so_einstellungen', { limit: 50 }).catch(() => []);
    const stand = rows.map((r) => r.aktualisiert_am).filter(Boolean).sort().pop() || null;
    res.status(200).json({ ok: true, einstellungen: einstLib.zusammenfuehren(rows), stand, benutzer: await benutzerListe(store), integration: integration(), admin });
    return;
  }
  if (req.method !== 'PUT') { fehler(res, 405, 'method_not_allowed'); return; }
  if (!admin) { fehler(res, 403, 'forbidden'); return; }
  const neu = einstLib.bereinigen(readBody(req));
  if (!Object.keys(neu).length) { fehler(res, 400, 'invalid_body'); return; }
  const zeit = new Date().toISOString();
  const alt = await store.rows('so_einstellungen', { limit: 50 });
  for (const key of Object.keys(neu)) {
    const vorher = (alt.find((r) => r.key === key) || {}).wert || {};
    await store.upsert('so_einstellungen', { key, wert: Object.assign({}, vorher, neu[key]), aktualisiert_am: zeit, aktualisiert_von: user }, 'key');
  }
  console.log(`[hq] ${user} hat Einstellungen gespeichert: ${Object.keys(neu).join(', ')}`);
  const rows = await store.rows('so_einstellungen', { limit: 50 });
  res.status(200).json({ ok: true, einstellungen: einstLib.zusammenfuehren(rows), stand: zeit });
}

/* ---------- Benutzer einladen und verwalten (nur Admin) ----------
   GET    /api/hq/benutzer                 Liste
   POST   /api/hq/benutzer                 {email, name, rolle}  → Einladung (Mail) · liefert link, falls Versand scheitert
   PATCH  /api/hq/benutzer?id=             {aktiv?, rolle?, erneut_einladen?}
   DELETE /api/hq/benutzer?id=             Zugang entfernen */
async function benutzer(req, res, ctx) {
  const { store, user, admin, url } = ctx;
  if (req.method === 'GET') { res.status(200).json({ ok: true, benutzer: await benutzerListe(store), admin }); return; }
  if (!admin) { fehler(res, 403, 'forbidden'); return; }
  if (req.method === 'POST') {
    const b = readBody(req) || {};
    const email = benutzerLib.normalEmail(b.email);
    if (!benutzerLib.emailOk(email)) { fehler(res, 400, 'invalid_email'); return; }
    const rolle = benutzerLib.ROLLEN.includes(b.rolle) ? b.rolle : 'mitarbeit';
    const name = saeubern(b.name || '').trim().slice(0, 80);
    const vorhanden = await benutzerLib.finden(store, email);
    if (vorhanden && vorhanden.passwort_hash && vorhanden.aktiv) { fehler(res, 409, 'already_exists'); return; }
    const r = await benutzerLib.einladen(store, { email, name, rolle, von: user, req });
    console.log(`[hq] ${user} hat ${email.replace(/^(.).*@/, '$1…@')} eingeladen (${rolle})`);
    // Link nur zurückgeben, wenn die Mail nicht zugestellt werden konnte (zum manuellen Weitergeben)
    res.status(200).json({ ok: true, benutzer: benutzerLib.oeffentlich(r.benutzer), mail: r.mail, link: r.mail.ok ? undefined : r.link });
    return;
  }
  const id = url.searchParams.get('id') || '';
  if (!/^\d{1,15}$/.test(id)) { fehler(res, 400, 'invalid_id'); return; }
  const [b] = await store.rows('so_benutzer', { where: { id: Number(id) }, limit: 1 });
  if (!b) { fehler(res, 404, 'not_found'); return; }
  if (b.email === user && req.method !== 'PATCH') { fehler(res, 409, 'not_yourself'); return; }
  if (req.method === 'PATCH') {
    const body = readBody(req) || {};
    if (body.erneut_einladen) {
      const r = await benutzerLib.einladen(store, { email: b.email, von: user, req });
      res.status(200).json({ ok: true, benutzer: benutzerLib.oeffentlich(r.benutzer), mail: r.mail, link: r.mail.ok ? undefined : r.link });
      return;
    }
    if (b.email === user) { fehler(res, 409, 'not_yourself'); return; }
    const patch = {};
    if (typeof body.aktiv === 'boolean') patch.aktiv = body.aktiv;
    if (benutzerLib.ROLLEN.includes(body.rolle)) patch.rolle = body.rolle;
    if (!Object.keys(patch).length) { fehler(res, 400, 'invalid_body'); return; }
    const [neu] = await store.update('so_benutzer', { id: b.id }, patch);
    console.log(`[hq] ${user} hat Benutzer ${b.id} geändert: ${Object.keys(patch).join(', ')}`);
    res.status(200).json({ ok: true, benutzer: benutzerLib.oeffentlich(neu) });
    return;
  }
  if (req.method === 'DELETE') {
    await store.remove('so_benutzer', { id: b.id });
    console.log(`[hq] ${user} hat Benutzer ${b.id} entfernt`);
    res.status(200).json({ ok: true });
    return;
  }
  fehler(res, 405, 'method_not_allowed');
}

/* Öffentlich (ohne Sitzung): Einladung prüfen / Passwort festlegen
   GET  /api/hq/einladung?token=   → {email, name}
   POST /api/hq/einladung          {token, passwort} */
const einladungVersuche = new Map();
async function einladung(req, res, ctx) {
  const { store } = ctx;
  if (!store) { fehler(res, 503, 'store_not_configured'); return; }
  const ip = require('../_lib/http').clientIp(req);
  const jetzt = Date.now();
  const v = (einladungVersuche.get(ip) || []).filter((t) => jetzt - t < 60000);
  v.push(jetzt); einladungVersuche.set(ip, v);
  if (v.length > 20) { fehler(res, 429, 'rate_limited'); return; }
  try {
    if (req.method === 'GET') {
      const r = await benutzerLib.einladungPruefen(store, ctx.url.searchParams.get('token') || '');
      if (r.fehler) { fehler(res, r.fehler === 'link_expired' ? 410 : 404, r.fehler); return; }
      res.status(200).json({ ok: true, email: r.benutzer.email, name: r.benutzer.name, passwort_min: benutzerLib.PW_MIN });
      return;
    }
    if (req.method === 'POST') {
      const b = readBody(req) || {};
      const r = await benutzerLib.einladungAnnehmen(store, b.token, b.passwort);
      if (r.fehler) { fehler(res, /^link_/.test(r.fehler) ? (r.fehler === 'link_expired' ? 410 : 404) : 400, r.fehler); return; }
      console.log('[hq] Einladung angenommen: ' + r.benutzer.email.replace(/^(.).*@/, '$1…@'));
      res.status(200).json({ ok: true, email: r.benutzer.email });
      return;
    }
    fehler(res, 405, 'method_not_allowed');
  } catch (e) {
    console.error('[hq/einladung]', e.message);
    fehler(res, 502, 'store_failed');
  }
}

module.exports = { vorlagen, einstellungen, benutzer, einladung };
