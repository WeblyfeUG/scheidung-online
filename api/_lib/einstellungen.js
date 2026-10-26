/* ============================================================
   Einstellungen (so_einstellungen): Standardwerte im Code,
   Änderungen aus dem HQ (B6) überschreiben sie je Schlüssel.
   ============================================================ */
const STANDARD = {
  oeffnungszeiten: { mo_do: '8–17 Uhr', fr: '8–14 Uhr' },
  antwortzeiten: { anfrage: '48 Stunden', kosten: '2 Werktage' },
  mail: { absender: process.env.MAIL_FROM || 'Kanzlei Janine D. Wagner <kanzlei@scheidung-online.de>', empfaenger_intern: process.env.MAIL_INTERN || '', termin_link: '' },
  ki: { aktiv: true, pseudonymisiert: true },
  erinnerungen: { erste_tage: 3, zweite_tage: 7 },
  // Testbetrieb: Mandat ohne Widerrufsbelehrung/Gebührenhinweis anbieten (fehlende Texte werden als TESTDOKUMENT markiert)
  test: { mandat_ohne_texte: false },
  kanzlei: {
    name: 'Rechtsanwältin Janine D. Wagner',
    anschrift: 'Schiffgraben 17 · 30159 Hannover',
    telefon: '0511 54 36 83 83',
    email: 'kanzlei@scheidung-online.de',
    ort: 'Hannover'
  }
};
const SCHLUESSEL = Object.keys(STANDARD);

function zusammenfuehren(zeilen) {
  const out = JSON.parse(JSON.stringify(STANDARD));
  (zeilen || []).forEach((z) => {
    if (out[z.key] && z.wert && typeof z.wert === 'object') Object.assign(out[z.key], z.wert);
  });
  return out;
}

async function laden(store) {
  try { return zusammenfuehren(await store.rows('so_einstellungen', { limit: 50 })); }
  catch (e) { console.error('[einstellungen] Laden fehlgeschlagen, Standardwerte:', e.message); return zusammenfuehren([]); }
}

/* Nur bekannte Schlüssel/Felder mit passendem Typ übernehmen */
function bereinigen(eingabe) {
  const out = {};
  if (!eingabe || typeof eingabe !== 'object') return out;
  SCHLUESSEL.forEach((k) => {
    const e = eingabe[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return;
    const w = {};
    Object.keys(STANDARD[k]).forEach((f) => {
      const typ = typeof STANDARD[k][f];
      if (typ === 'boolean' && typeof e[f] === 'boolean') w[f] = e[f];
      else if (typ === 'number' && Number.isFinite(Number(e[f])) && e[f] !== '') w[f] = Math.max(0, Math.min(60, Math.round(Number(e[f]))));
      else if (typ === 'string' && typeof e[f] === 'string') w[f] = e[f].trim().slice(0, 200);
    });
    if (Object.keys(w).length) out[k] = w;
  });
  return out;
}

function oeffnungszeitenText(e) {
  return 'Mo–Do ' + e.oeffnungszeiten.mo_do + ', Fr ' + e.oeffnungszeiten.fr;
}

module.exports = { STANDARD, SCHLUESSEL, laden, bereinigen, zusammenfuehren, oeffnungszeitenText };
