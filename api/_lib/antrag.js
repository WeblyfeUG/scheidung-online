/* ============================================================
   Modul 2 — Antragsentwurf: Felder der Word-Vorlagen, Vorbelegung
   aus der Website-Anfrage und Validierung der im HQ bearbeiteten Werte.
   Alles, was aus Urkunden stammt (Standesamt, Registernummer, Geburts-
   daten, Gegenstandswerte), bleibt bewusst leer und wird in der
   Kanzlei ergänzt.
   ============================================================ */

/* Reihenfolge = Darstellung im HQ. */
const FELDER = [
  { gruppe: 'Gericht', key: 'gericht_name', label: 'Amtsgericht (Familiengericht)' },
  { gruppe: 'Gericht', key: 'gericht_strasse', label: 'Straße' },
  { gruppe: 'Gericht', key: 'gericht_ort', label: 'PLZ / Ort' },
  { gruppe: 'Verfahren', key: 'datum', label: 'Datum des Schreibens' },
  { gruppe: 'Verfahren', key: 'aktenzeichen', label: 'Unser Zeichen' },
  { gruppe: 'Verfahren', key: 'wegen', label: 'wegen (Vollmacht)' },
  { gruppe: 'Verfahren', key: 'gegenstandswert_scheidung', label: 'Vorl. Gegenstandswert Scheidung (€)' },
  { gruppe: 'Verfahren', key: 'gegenstandswert_versorgungsausgleich', label: 'Vorl. Gegenstandswert Versorgungsausgleich (€)' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_name', label: 'Name' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_geburtsname', label: 'Geburtsname' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_geburtsdatum', label: 'Geburtsdatum' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_anschrift', label: 'Anschrift' },
  { gruppe: 'Antragsteller/in', key: 'nettoeinkommen_antragsteller', label: 'Mtl. Nettoeinkommen (€)' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_name', label: 'Name' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_geburtsname', label: 'Geburtsname' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_geburtsdatum', label: 'Geburtsdatum' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_anschrift', label: 'Anschrift' },
  { gruppe: 'Antragsgegner/in', key: 'nettoeinkommen_antragsgegner', label: 'Mtl. Nettoeinkommen (€)' },
  { gruppe: 'Ehe', key: 'heiratsdatum', label: 'Tag der Eheschließung' },
  { gruppe: 'Ehe', key: 'standesamt_ort', label: 'Standesamt (Ort)' },
  { gruppe: 'Ehe', key: 'heiratsregisternummer', label: 'Heiratsregisternummer' },
  { gruppe: 'Ehe', key: 'staatsangehoerigkeit', label: 'Staatsangehörigkeit (beide)' },
  { gruppe: 'Ehe', key: 'trennungsdatum', label: 'Getrennt lebend seit' },
  { gruppe: 'Kinder', key: 'gemeinsame_kinder_text', label: 'Gemeinsame Kinder (Satzteil)' },
  { gruppe: 'Kinder', key: 'kind_1', label: 'Kind 1 (Name, geb. am)' },
  { gruppe: 'Kinder', key: 'kind_2', label: 'Kind 2 (Name, geb. am)' },
  { gruppe: 'Kinder', key: 'aufenthalt_kinder', label: 'Aufenthalt der Kinder (Satz)', multiline: true }
];
const KEYS = new Set(FELDER.map((f) => f.key));

const ZAHLWORT = ['keine', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'];

function heute() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}

/* ISO-Datum (aus <input type=date>) → TT.MM.JJJJ; alles andere unverändert. */
function datumDE(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (v || '');
}

function join(...parts) {
  return parts.map((p) => (p || '').toString().trim()).filter(Boolean).join(' ');
}

/* Vorbelegung aus dem gespeicherten Formular-Payload (nur Typ "antrag" liefert viel). */
function vorbelegung(anfrage) {
  const d = anfrage.daten || {};
  const k = d.kontakt || {};
  const sit = d.situation || {};
  const p = d.ehepartner || {};
  const kinder = d.kinder || {};
  const erg = d.ergaenzung || {};   // spätere Zusatzfragen des Wizards (Anschrift, Einkommen …)

  const anzahl = kinder.vorhanden === 'Ja' ? parseInt(kinder.anzahl, 10) || 0 : 0;
  let kinderText = '';
  if (kinder.vorhanden) {
    kinderText = anzahl === 0 ? 'keine gemeinsamen Kinder'
      : anzahl === 1 ? 'ein gemeinsames Kind'
      : (ZAHLWORT[anzahl] || String(anzahl)) + ' gemeinsame Kinder';
  }
  // Wizard-Frage „Bei wem leben die Kinder überwiegend?" → Satz für den Antrag (im HQ anpassbar)
  const kindWort = anzahl === 1 ? 'Das Kind hat seinen' : 'Die Kinder haben ihren';
  const betreut = anzahl === 1 ? 'wird von' : 'werden von';
  const AUFENTHALT = {
    'Bei mir': `${kindWort} gewöhnlichen Aufenthalt bei der Antragstellerin / dem Antragsteller und ${betreut} dieser / diesem betreut und versorgt.`,
    'Beim anderen Elternteil': `${kindWort} gewöhnlichen Aufenthalt bei der Antragsgegnerin / dem Antragsgegner und ${betreut} dieser / diesem betreut und versorgt.`,
    'Im Wechsel bei beiden': `${anzahl === 1 ? 'Das Kind wird' : 'Die Kinder werden'} im Wechselmodell von beiden Elternteilen betreut und versorgt.`,
    'Unterschiedlich (Geschwister leben getrennt)': 'Die Kinder leben getrennt voneinander bei jeweils einem Elternteil; Einzelheiten werden gesondert vorgetragen.'
  };

  return {
    datum: heute(),
    wegen: 'Ehescheidung',
    antragsteller_name: join(k.vorname || anfrage.vorname, k.nachname || anfrage.nachname),
    antragsteller_anschrift: erg.anschrift || '',
    nettoeinkommen_antragsteller: erg.nettoeinkommen_antragsteller || '',
    antragsgegner_name: p.name || '',
    antragsgegner_anschrift: p.anschrift || '',
    nettoeinkommen_antragsgegner: erg.nettoeinkommen_antragsgegner || '',
    heiratsdatum: datumDE(sit.heiratsdatum),
    trennungsdatum: datumDE(sit.trennung_beginn),
    staatsangehoerigkeit: erg.staatsangehoerigkeit || '',
    gemeinsame_kinder_text: kinderText,
    kind_1: erg.kind_1 || '',
    kind_2: erg.kind_2 || '',
    aufenthalt_kinder: anzahl > 0 ? (AUFENTHALT[kinder.wohnort] || AUFENTHALT['Bei mir']) : ''
  };
}

/* Effektive Werte = Vorbelegung, überschrieben durch das, was im HQ gespeichert wurde. */
function effektiv(anfrage) {
  const base = vorbelegung(anfrage);
  const saved = anfrage.antrag || {};
  const out = {};
  FELDER.forEach((f) => {
    out[f.key] = Object.prototype.hasOwnProperty.call(saved, f.key) ? saved[f.key] : (base[f.key] || '');
  });
  return out;
}

/* Nimmt nur bekannte Felder an, kürzt, entfernt Steuerzeichen. */
function bereinigen(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.keys(input).forEach((key) => {
    if (!KEYS.has(key)) return;
    let v = input[key];
    if (v === null || v === undefined) v = '';
    v = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 600);
    out[key] = v;
  });
  return out;
}

module.exports = { FELDER, vorbelegung, effektiv, bereinigen };
