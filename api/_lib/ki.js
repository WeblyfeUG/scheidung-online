/* ============================================================
   KI-Einordnung einer Anfrage (B3) über die Anthropic Messages API
   per fetch (ANTHROPIC_API_KEY, Modell per KI_MODELL).
   Eingabe pseudonymisiert (Namen, E-Mail, Telefon, Straße entfernt;
   Freitext nach E-Mail-/Telefonmustern gesäubert), solange
   einstellungen.ki.pseudonymisiert = true. Ausgabe über JSON-Schema;
   ungültige Antworten → kein Eintrag. Fehler werden nur geloggt.
   ============================================================ */
const einstLib = require('./einstellungen');

const MODELL = () => process.env.KI_MODELL || 'claude-opus-5-5';
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ampel', 'zusammenfassung', 'begruendung', 'punkte', 'vorschlag'],
  properties: {
    ampel: { type: 'string', enum: ['gruen', 'gelb', 'rot'] },
    zusammenfassung: { type: 'string' },
    begruendung: { type: 'string' },
    punkte: { type: 'array', items: { type: 'string' } },
    vorschlag: { type: 'string', enum: ['mandat', 'erstgespraech', 'absage'] }
  }
};
const SYSTEM = `Du ordnest Anfragen an eine Kanzlei für Familienrecht in Hannover (Online-Scheidung, Niedersachsen) ein. Du sprichst keine Rechtsberatung aus; die Anwältin entscheidet.
Ampel-Regeln:
- gruen: Trennungsjahr erreicht, Einvernehmen, Zuständigkeit Niedersachsen, keine strittigen Folgesachen.
- gelb: Gesprächsbedarf, z. B. Immobilie, Auslandsbezug, unklare Zustimmung, Trennung innerhalb der Wohnung, Ehevertrag.
- rot: kein Familienrecht, Trennung kürzer als 10 Monate ohne Härtefall, aktiver Konflikt.
vorschlag: mandat (gruen), erstgespraech (gelb oder rot mit Familienrecht), absage (kein Familienrecht).
zusammenfassung: höchstens 400 Zeichen, sachlich, deutsch. punkte: höchstens 5 kurze Stichpunkte. Die Daten sind pseudonymisiert; erfinde keine Namen.`;

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi;
const TELEFON = /(\+?\d[\d\s/().-]{6,}\d)/g;
function saeubern(s) { return String(s || '').replace(EMAIL, '[E-Mail]').replace(TELEFON, '[Telefon]').slice(0, 2000); }

/* Nur fachlich nötige Angaben, ohne Namen/Kontakt/Straße */
function eingabe(a, pseudonym) {
  const d = a.daten || {};
  const sit = d.situation || {};
  const ki = d.kinder || {};
  const erg = d.ergaenzung || {};
  const nachricht = d.nachricht || d.c_nachricht || '';
  const out = {
    formular: a.typ,
    eingang: a.created_at,
    situation: { mindestens_ein_jahr_getrennt: sit.mindestens_ein_jahr_getrennt, heiratsdatum: sit.heiratsdatum, trennung_beginn: sit.trennung_beginn, ehewohnung_ort: sit.ehewohnung_ort, ehewohnung_plz: sit.ehewohnung_plz },
    ehepartner_ort: d.ehepartner && d.ehepartner.anschrift ? String(d.ehepartner.anschrift).replace(/^.*?(\d{5}\s+.+)$/, '$1') : '',
    kinder: { vorhanden: ki.vorhanden, anzahl: ki.anzahl, wohnort: ki.wohnort },
    einvernehmlich: d.scheidung && d.scheidung.einvernehmlich,
    ehevertrag: erg.ehevertrag, staatsangehoerigkeit: erg.staatsangehoerigkeit,
    nettoeinkommen: [erg.nettoeinkommen_antragsteller, erg.nettoeinkommen_antragsgegner].filter(Boolean),
    nachricht: pseudonym ? saeubern(nachricht) : nachricht
  };
  if (!pseudonym) Object.assign(out, { name: [a.vorname, a.nachname].join(' '), email: a.email, telefon: a.telefon });
  return out;
}

function gueltig(o) {
  if (!o || typeof o !== 'object') return null;
  if (!['gruen', 'gelb', 'rot'].includes(o.ampel)) return null;
  if (!['mandat', 'erstgespraech', 'absage'].includes(o.vorschlag)) return null;
  if (typeof o.zusammenfassung !== 'string' || typeof o.begruendung !== 'string' || !Array.isArray(o.punkte)) return null;
  return {
    ampel: o.ampel, vorschlag: o.vorschlag,
    zusammenfassung: o.zusammenfassung.trim().slice(0, 400),
    begruendung: o.begruendung.trim().slice(0, 1200),
    punkte: o.punkte.filter((p) => typeof p === 'string').map((p) => p.trim().slice(0, 200)).slice(0, 5)
  };
}

/* Liefert { ki } oder { fehler } — speichert bei Erfolg in so_anfragen.ki */
async function einordnen(store, a, { erzwingen } = {}) {
  const e = await einstLib.laden(store);
  if (!e.ki.aktiv && !erzwingen) return { fehler: 'ki_inaktiv' };
  if (!process.env.ANTHROPIC_API_KEY) return { fehler: 'ki_not_configured' };
  if (a.typ === 'checkliste_pdf') return { fehler: 'ki_nicht_noetig' };
  const pseudonym = e.ki.pseudonymisiert !== false;
  let body;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: MODELL(),
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        fallbacks: 'default',
        messages: [{ role: 'user', content: 'Anfrage (JSON):\n' + JSON.stringify(eingabe(a, pseudonym)) }]
      }),
      signal: AbortSignal.timeout(45000)
    });
    body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('[ki] API-Fehler', res.status, body.error && body.error.type); return { fehler: 'ki_api_' + res.status }; }
  } catch (err) {
    console.error('[ki] nicht erreichbar:', err.name);
    return { fehler: 'ki_unreachable' };
  }
  if (body.stop_reason === 'refusal') return { fehler: 'ki_refusal' };
  const block = (body.content || []).find((c) => c.type === 'text');
  let parsed = null;
  try { parsed = gueltig(JSON.parse(block ? block.text : '')); } catch (err) { parsed = null; }
  if (!parsed) { console.error('[ki] ungültige Antwort verworfen'); return { fehler: 'ki_invalid' }; }
  const ki = Object.assign(parsed, { modell: body.model || MODELL(), pseudonymisiert: pseudonym, erstellt_am: new Date().toISOString() });
  await store.updateAnfrage(a.id, { ki });
  await store.addEreignis({ anfrage_id: a.id, benutzer: 'system', art: 'ki', details: { ampel: ki.ampel } });
  return { ki };
}

module.exports = { einordnen, eingabe, gueltig, SCHEMA };
