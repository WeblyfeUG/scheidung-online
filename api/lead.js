/* ============================================================
   Serverseitige Same-Origin-Route für alle Website-Formulare.
   Validiert (inkl. Plausibilität + Spamschutz aus form-guard.js),
   rate-limitet und speichert die Anfrage im HQ (Supabase, Zugang
   nur über Umgebungsvariablen SUPABASE_URL + SUPABASE_SERVICE_KEY —
   nie im Frontend). Ohne Speicher: 503 (sichtbarer Fehler im
   Formular) — außer SO_DEMO=1 ist gesetzt (200, nichts gespeichert).
   ============================================================ */
const guard = require('../form-guard.js');
const { getStore } = require('./_lib/store');
const { readBody, clientIp, noStore, saeubern } = require('./_lib/http');

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map(); // best effort — pro Lambda-Instanz

function rateLimited(ip) {
  const now = Date.now();
  // Abgelaufene Schlüssel einzeln entfernen — nie alle Zähler auf einmal
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

/* Strenge E-Mail-Regel aus form-guard.js (keine ? & = # / < > " ' und keine Leerzeichen) */
function isEmail(v) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 254 && guard.check('email', v) === '';
}

function str(v, max) {
  return typeof v === 'string' && v.length <= max;
}

const nonBlank = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const clean = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* Steuerzeichen (außer Tab/LF/CR) aus allen Strings entfernen — rekursiv, begrenzt. */
function sanitize(v, depth = 0) {
  if (typeof v === 'string') return saeubern(v);
  if (Array.isArray(v)) return depth >= 4 ? [] : v.slice(0, 100).map((x) => sanitize(x, depth + 1));
  if (v && typeof v === 'object') {
    if (depth >= 4) return {};
    const out = {};
    Object.keys(v).slice(0, 200).forEach((k) => { out[saeubern(k).slice(0, 100)] = sanitize(v[k], depth + 1); });
    return out;
  }
  return v;
}

/* Nur erlaubte Schlüssel übernehmen; Strings getrimmt und gekürzt, Zahlen/Booleans unverändert. */
function pick(o, keys, max = 2000) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  keys.forEach((k) => {
    const v = o[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, max);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  });
  return out;
}

// Zusatzangaben des Wizards für den Antragsentwurf (api/_lib/antrag.js liest diese Schlüssel)
const ERGAENZUNG_KEYS = ['anschrift', 'ehevertrag', 'staatsangehoerigkeit', 'nettoeinkommen_antragsteller',
  'nettoeinkommen_antragsgegner', 'kind_1', 'kind_2', 'kind_3', 'kind_4'];

/* Lässt nur bekannte Schlüssel mit Strings ≤ 200 Zeichen durch; alles andere wird verworfen. */
function ergaenzung(b) {
  const e = b.ergaenzung;
  const out = {};
  if (!e || typeof e !== 'object' || Array.isArray(e)) return out;
  ERGAENZUNG_KEYS.forEach((k) => {
    if (str(e[k], 200)) out[k] = e[k].trim();
  });
  return out;
}

// Plausibilität (gleiche Regeln wie im Browser, form-guard.js)
function ok(type, v) {
  return typeof v === 'string' && v.trim().length > 0 && guard.check(type, v) === '';
}

// Fangfeld gefüllt oder in unter 1,5 s ausgefüllt
function looksLikeBot(g) {
  if (typeof g.hp === 'string' && g.hp.length > 0) return true;
  return typeof g.fill_ms !== 'number' || g.fill_ms < 1500;
}

/* Prüft den Payload je Formulartyp; liefert Fehlercode oder null. */
function validate(b) {
  if (b.type === 'checkliste_pdf') {
    if (b.dsgvo_zugestimmt !== true) return 'consent_required';
    if (!isEmail(b.email)) return 'invalid_email';
  } else if (b.type === 'nachricht') {
    // Kontakt-Baustein: Name + E-Mail + Nachricht, Antwort per E-Mail (kein Rückruf-Versprechen)
    if (b.dsgvo_zugestimmt !== true) return 'consent_required';
    if (!nonBlank(b.name, 160) || !isEmail(b.email) || !nonBlank(b.nachricht, 2000)) return 'missing_fields';
    if (!ok('name', b.name)) return 'invalid_fields';
  } else if (b.type === 'kostenrahmen') {
    // Stand 12.10.2026: E-Mail Pflicht (schriftliche Kostenübersicht binnen zwei Werktagen), Telefon optional
    if (b.cost_dsgvo !== true) return 'consent_required';
    if (!nonBlank(b.c_vorname, 120) || !nonBlank(b.c_nachname, 120) || !isEmail(b.c_email)) return 'missing_fields';
    if (b.c_telefon && !str(b.c_telefon, 60)) return 'invalid_phone';
    if (!ok('name', b.c_vorname) || !ok('name', b.c_nachname) || (b.c_telefon && !ok('phone', b.c_telefon))) return 'invalid_fields';
    if (b.c_nachricht && !str(b.c_nachricht, 2000)) return 'message_too_long';
  } else {
    // Antrags-Wizard: eigenes Consent-Feld + Kontaktdaten + Plausibilität der Pflichtfelder
    if (b.dsgvo_zugestimmt !== true) return 'consent_required';
    const k = b.kontakt || {};
    if (!nonBlank(k.vorname, 120) || !nonBlank(k.nachname, 120) || !isEmail(k.email)) return 'missing_fields';
    if (b.nachricht && !str(b.nachricht, 2000)) return 'message_too_long';
    const st = b.situation || {};
    const ep = b.ehepartner || {};
    const ki = b.kinder || {};
    if (!ok('name', k.vorname) || !ok('name', k.nachname) || !ok('phone', k.telefon) ||
        !ok('plz', st.ehewohnung_plz) || !ok('ort', st.ehewohnung_ort) ||
        !ok('name', ep.name) || !ok('address', ep.anschrift) ||
        (ki.vorhanden === 'Ja' && !nonBlank(ki.wohnort, 120))) {
      return 'invalid_fields';
    }
    // Optionale Zusatzangaben: Anschrift nur bei Angabe plausibilisieren
    const erg = ergaenzung(b);
    if (erg.anschrift && !ok('address', erg.anschrift)) return 'invalid_fields';
  }
  return null;
}

/* Normalisiert die vier Payload-Formen auf eine Datenbankzeile (nur bekannte Schlüssel). */
function toRow(b) {
  const meta = (b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)) ? b.meta : {};
  const row = {
    vorname: '', nachname: '', email: '', telefon: '',
    quelle: clean(meta.quelle, 120), seite: clean(meta.seite, 500),
    daten: { meta: { quelle: clean(meta.quelle, 120), seite: clean(meta.seite, 500), gesendet_am: clean(meta.gesendet_am, 40) } }
  };
  if (b.type === 'checkliste_pdf') {
    Object.assign(row, { typ: 'checkliste_pdf', email: clean(b.email) });
    Object.assign(row.daten, pick(b, ['email', 'dsgvo_zugestimmt']));
  } else if (b.type === 'nachricht') {
    const name = clean(b.name, 160);
    const i = name.lastIndexOf(' ');
    Object.assign(row, {
      typ: 'nachricht',
      vorname: i > 0 ? name.slice(0, i) : name,
      nachname: i > 0 ? name.slice(i + 1) : '',
      email: clean(b.email)
    });
    Object.assign(row.daten, pick(b, ['name', 'email', 'nachricht', 'dsgvo_zugestimmt']));
  } else if (b.type === 'kostenrahmen') {
    Object.assign(row, {
      typ: 'kostenrahmen', vorname: clean(b.c_vorname), nachname: clean(b.c_nachname),
      email: clean(b.c_email), telefon: clean(b.c_telefon, 60)
    });
    Object.assign(row.daten, pick(b, ['c_vorname', 'c_nachname', 'c_email', 'c_telefon', 'c_nachricht', 'cost_dsgvo']));
  } else {
    const k = b.kontakt || {};
    Object.assign(row, {
      typ: 'antrag', vorname: clean(k.vorname), nachname: clean(k.nachname),
      email: clean(k.email), telefon: clean(k.telefon, 60)
    });
    Object.assign(row.daten, {
      kontakt: pick(b.kontakt, ['vorname', 'nachname', 'email', 'telefon']),
      situation: pick(b.situation, ['mindestens_ein_jahr_getrennt', 'heiratsdatum', 'trennung_beginn', 'bundesland', 'ehewohnung_plz', 'ehewohnung_ort']),
      ehepartner: pick(b.ehepartner, ['name', 'anschrift']),
      kinder: pick(b.kinder, ['vorhanden', 'anzahl', 'wohnort']),
      scheidung: pick(b.scheidung, ['einvernehmlich', 'vertretung_wagner']),
      ergaenzung: ergaenzung(b)
    }, pick(b, ['nachricht', 'dsgvo_zugestimmt']));
  }
  return row;
}

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (rateLimited(clientIp(req))) {
    res.status(429).json({ ok: false, error: 'rate_limited' });
    return;
  }

  const raw = readBody(req);
  if (!raw) {
    res.status(400).json({ ok: false, error: 'invalid_body' });
    return;
  }
  // Größenlimit gegen Missbrauch
  if (JSON.stringify(raw).length > 20000) {
    res.status(413).json({ ok: false, error: 'payload_too_large' });
    return;
  }
  const b = sanitize(raw);

  // Ohne Schutz-Merkmal (direkter POST oder vor dem Update geöffnete Seite):
  // sichtbarer Fehler statt stillem Verwerfen — echte Besucher laden neu
  const g = b.meta && b.meta.guard;
  if (!g || typeof g !== 'object' || Array.isArray(g)) {
    res.status(400).json({ ok: false, error: 'reload_required' });
    return;
  }
  // Bots bekommen ein stilles OK — nichts wird gespeichert
  if (looksLikeBot(g)) {
    console.log('[lead] Verdacht auf Spam verworfen (Fangfeld/Zeit).');
    res.status(200).json({ ok: true });
    return;
  }

  const err = validate(b);
  if (err) {
    res.status(400).json({ ok: false, error: err });
    return;
  }

  const store = getStore();
  if (!store) {
    if (process.env.SO_DEMO === '1') {
      console.log('[lead] Demo-Modus (SO_DEMO=1) — Anfrage nicht gespeichert.');
      res.status(200).json({ ok: true, demo: true });
      return;
    }
    // Lieber ein sichtbarer Fehler im Formular als eine still verlorene Mandatsanfrage
    console.error('[lead] STORE NICHT KONFIGURIERT (SUPABASE_URL/SUPABASE_SERVICE_KEY) — Anfrage verloren.');
    res.status(503).json({ ok: false, error: 'store_not_configured' });
    return;
  }

  try {
    const saved = await store.insertAnfrage(toRow(b));
    await store.addEreignis({ anfrage_id: saved.id, benutzer: 'website', art: 'eingang', details: { typ: saved.typ, quelle: saved.quelle } });
    res.status(200).json({ ok: true, nummer: saved.nummer });
  } catch (e) {
    console.error('[lead] Speichern fehlgeschlagen:', e.message);
    res.status(502).json({ ok: false, error: 'store_failed' });
  }
};
