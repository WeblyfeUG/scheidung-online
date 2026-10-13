/* ============================================================
   Serverseitige Same-Origin-Route für beide Formulare (v2).
   Validiert, rate-limitet und leitet an den Make.com-Webhook
   weiter. Der Webhook liegt NUR in der Umgebungsvariable
   MAKE_WEBHOOK_URL (Vercel-Projekt-Settings), nie im Frontend.
   Ohne gesetzte Variable: Demo-Modus (200, nichts weitergeleitet).
   ============================================================ */

const guard = require('../form-guard.js');

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

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function str(v, max) {
  return typeof v === 'string' && v.length <= max;
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ ok: false, error: 'rate_limited' });
    return;
  }

  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { b = null; }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    res.status(400).json({ ok: false, error: 'invalid_body' });
    return;
  }

  const nonBlank = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const invalid = () => res.status(400).json({ ok: false, error: 'invalid_fields' });

  // Ohne Schutz-Merkmal (direkter POST oder vor dem Update geöffnete Seite):
  // sichtbarer Fehler statt stillem Verwerfen — echte Besucher laden neu
  const g = b.meta && b.meta.guard;
  if (!g || typeof g !== 'object' || Array.isArray(g)) {
    res.status(400).json({ ok: false, error: 'reload_required' });
    return;
  }
  // Bots bekommen ein stilles OK — nichts wird weitergeleitet
  if (looksLikeBot(g)) {
    console.log('[lead] Verdacht auf Spam verworfen (Fangfeld/Zeit).');
    res.status(200).json({ ok: true });
    return;
  }

  // Grundvalidierung + DSGVO-Einwilligung je Formulartyp (Consent-Flag muss
  // zum tatsächlich angehakten Feld des jeweiligen Formulars gehören)
  if (b.type === 'checkliste_pdf') {
    // Checklisten-Versand: E-Mail + Einwilligung
    if (b.dsgvo_zugestimmt !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    if (!isEmail(b.email)) {
      res.status(400).json({ ok: false, error: 'invalid_email' });
      return;
    }
  } else if (b.type === 'nachricht') {
    // Kontakt-Baustein: Name + E-Mail + Nachricht, Antwort per E-Mail (kein Rückruf-Versprechen)
    if (b.dsgvo_zugestimmt !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    if (!nonBlank(b.name, 160) || !isEmail(b.email) || !nonBlank(b.nachricht, 2000)) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    if (!ok('name', b.name)) { invalid(); return; }
  } else if (b.type === 'kostenrahmen') {
    // Stand 12.10.2026: E-Mail Pflicht (schriftliche Kostenübersicht binnen zwei Werktagen),
    // Telefon optional, keine Rückruf-Zeiten mehr
    if (b.cost_dsgvo !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    if (!nonBlank(b.c_vorname, 120) || !nonBlank(b.c_nachname, 120) || !isEmail(b.c_email)) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    if (b.c_telefon && !str(b.c_telefon, 60)) {
      res.status(400).json({ ok: false, error: 'invalid_phone' });
      return;
    }
    if (!ok('name', b.c_vorname) || !ok('name', b.c_nachname) || (b.c_telefon && !ok('phone', b.c_telefon))) {
      invalid();
      return;
    }
    if (b.c_nachricht && !str(b.c_nachricht, 2000)) {
      res.status(400).json({ ok: false, error: 'message_too_long' });
      return;
    }
  } else {
    // Antrags-Wizard: eigenes Consent-Feld + Kontaktdaten
    if (b.dsgvo_zugestimmt !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    const k = b.kontakt || {};
    if (!nonBlank(k.vorname, 120) || !nonBlank(k.nachname, 120) || !isEmail(k.email)) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    if (b.nachricht && !str(b.nachricht, 2000)) {
      res.status(400).json({ ok: false, error: 'message_too_long' });
      return;
    }
    const st = b.situation || {};
    const ep = b.ehepartner || {};
    const ki = b.kinder || {};
    if (!ok('name', k.vorname) || !ok('name', k.nachname) || !ok('phone', k.telefon) ||
        !ok('plz', st.ehewohnung_plz) || !ok('ort', st.ehewohnung_ort) ||
        !ok('name', ep.name) || !ok('address', ep.anschrift) ||
        (ki.vorhanden === 'Ja' && !nonBlank(ki.wohnort, 120))) {
      invalid();
      return;
    }
  }

  // Größenlimit gegen Missbrauch
  if (JSON.stringify(b).length > 20000) {
    res.status(413).json({ ok: false, error: 'payload_too_large' });
    return;
  }

  const target = process.env.MAKE_WEBHOOK_URL;
  if (!target) {
    console.log('[lead] MAKE_WEBHOOK_URL nicht gesetzt — Demo-Modus, Lead nicht weitergeleitet.');
    res.status(200).json({ ok: true, demo: true });
    return;
  }

  try {
    const meta = (b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)) ? b.meta : {};
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...b, meta })
    });
    if (!upstream.ok) throw new Error('upstream HTTP ' + upstream.status);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[lead] Weiterleitung fehlgeschlagen:', err.message);
    res.status(502).json({ ok: false, error: 'upstream_failed' });
  }
};
