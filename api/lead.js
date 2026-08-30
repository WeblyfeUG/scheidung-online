/* ============================================================
   Serverseitige Same-Origin-Route für beide Formulare (v2).
   Validiert, rate-limitet und leitet an den Make.com-Webhook
   weiter. Der Webhook liegt NUR in der Umgebungsvariable
   MAKE_WEBHOOK_URL (Vercel-Projekt-Settings), nie im Frontend.
   Ohne gesetzte Variable: Demo-Modus (200, nichts weitergeleitet).
   ============================================================ */

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
  const RUECKRUF_ZEITEN = ['', 'Vormittag', 'Nachmittag', 'Abend'];
  const validZeit = (v) => v === undefined || (typeof v === 'string' && RUECKRUF_ZEITEN.includes(v));

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
  } else if (b.type === 'rueckruf') {
    // Rückruf-Baustein: Name + Telefon + Wunschzeit
    if (b.dsgvo_zugestimmt !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    if (!nonBlank(b.name, 160) || !nonBlank(b.telefon, 60)) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    if (!validZeit(b.rueckruf_zeit)) {
      res.status(400).json({ ok: false, error: 'invalid_rueckruf_zeit' });
      return;
    }
  } else if (b.type === 'kostenrahmen') {
    if (b.cost_dsgvo !== true) {
      res.status(400).json({ ok: false, error: 'consent_required' });
      return;
    }
    if (!nonBlank(b.c_vorname, 120) || !nonBlank(b.c_nachname, 120) || !nonBlank(b.c_telefon, 60)) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    if (b.c_email && !isEmail(b.c_email)) {
      res.status(400).json({ ok: false, error: 'invalid_email' });
      return;
    }
    if (b.c_nachricht && !str(b.c_nachricht, 2000)) {
      res.status(400).json({ ok: false, error: 'message_too_long' });
      return;
    }
    if (!validZeit(b.rueckruf_zeit)) {
      res.status(400).json({ ok: false, error: 'invalid_rueckruf_zeit' });
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
