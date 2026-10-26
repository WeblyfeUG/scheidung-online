/* ============================================================
   HQ — Vorlagen (B5) und Einstellungen (B6).
   GET /api/hq/vorlagen        Liste + Platzhalter + Dokumentvorlagen
   PUT /api/hq/vorlagen        {id, betreff?, text?, automatisch?} | {id, zuruecksetzen:true}   (nur Admin)
   GET /api/hq/einstellungen   Werte + Nutzerliste + Integrationsstatus
   PUT /api/hq/einstellungen   {oeffnungszeiten?, antwortzeiten?, mail?, ki?, erinnerungen?, kanzlei?}  (nur Admin)
   ============================================================ */
const { readBody, saeubern } = require('../_lib/http');
const auth = require('../_lib/auth');
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
  const { store, user } = ctx;
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, vorlagen: await vorlagenLib.laden(store), platzhalter: vorlagenLib.PLATZHALTER, dokumentvorlagen: dokumentvorlagen(), admin: auth.istAdmin(user) });
    return;
  }
  if (req.method !== 'PUT') { fehler(res, 405, 'method_not_allowed'); return; }
  if (!auth.istAdmin(user)) { fehler(res, 403, 'forbidden'); return; }
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

function benutzerListe() {
  return String(process.env.HQ_USERS || '').split(';').map((p) => p.split(':')[0].trim().toLowerCase()).filter(Boolean)
    .map((name) => ({ name, rolle: auth.istAdmin(name) ? 'Admin' : 'Mitarbeit', zwei_faktor: auth.braucht2fa(name) }));
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
  const { store, user } = ctx;
  if (req.method === 'GET') {
    const rows = await store.rows('so_einstellungen', { limit: 50 }).catch(() => []);
    const stand = rows.map((r) => r.aktualisiert_am).filter(Boolean).sort().pop() || null;
    res.status(200).json({ ok: true, einstellungen: einstLib.zusammenfuehren(rows), stand, benutzer: benutzerListe(), integration: integration(), admin: auth.istAdmin(user) });
    return;
  }
  if (req.method !== 'PUT') { fehler(res, 405, 'method_not_allowed'); return; }
  if (!auth.istAdmin(user)) { fehler(res, 403, 'forbidden'); return; }
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

module.exports = { vorlagen, einstellungen };
