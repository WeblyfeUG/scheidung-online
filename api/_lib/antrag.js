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
  { gruppe: 'Verfahren', key: 'datum', label: 'Datum des Schreibens', hint: 'TT.MM.JJJJ' },
  { gruppe: 'Verfahren', key: 'aktenzeichen', label: 'Unser Zeichen' },
  { gruppe: 'Verfahren', key: 'wegen', label: 'wegen (Vollmacht)' },
  { gruppe: 'Verfahren', key: 'gegenstandswert_scheidung', label: 'Vorl. Gegenstandswert Scheidung (€)', numerisch: true },
  { gruppe: 'Verfahren', key: 'gegenstandswert_versorgungsausgleich', label: 'Vorl. Gegenstandswert Versorgungsausgleich (€)', numerisch: true },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_name', label: 'Name' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_geburtsname', label: 'Geburtsname' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_geburtsdatum', label: 'Geburtsdatum', hint: 'TT.MM.JJJJ' },
  { gruppe: 'Antragsteller/in', key: 'antragsteller_anschrift', label: 'Anschrift' },
  { gruppe: 'Antragsteller/in', key: 'nettoeinkommen_antragsteller', label: 'Mtl. Nettoeinkommen (€)', numerisch: true },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_name', label: 'Name' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_geburtsname', label: 'Geburtsname' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_geburtsdatum', label: 'Geburtsdatum', hint: 'TT.MM.JJJJ' },
  { gruppe: 'Antragsgegner/in', key: 'antragsgegner_anschrift', label: 'Anschrift' },
  { gruppe: 'Antragsgegner/in', key: 'nettoeinkommen_antragsgegner', label: 'Mtl. Nettoeinkommen (€)', numerisch: true },
  { gruppe: 'Ehe', key: 'heiratsdatum', label: 'Tag der Eheschließung', hint: 'TT.MM.JJJJ' },
  { gruppe: 'Ehe', key: 'standesamt_ort', label: 'Standesamt (Ort)' },
  { gruppe: 'Ehe', key: 'heiratsregisternummer', label: 'Heiratsregisternummer' },
  { gruppe: 'Ehe', key: 'staatsangehoerigkeit', label: 'Staatsangehörigkeit (Adjektiv, z. B. „deutsche“)' },
  { gruppe: 'Ehe', key: 'trennungsdatum', label: 'Getrennt lebend seit', hint: 'TT.MM.JJJJ' },
  { gruppe: 'Kinder', key: 'gemeinsame_kinder_text', label: 'Gemeinsame Kinder (Satzteil)' },
  { gruppe: 'Kinder', key: 'kinder_liste', label: 'Kinder (je Zeile: Name, geb. am TT.MM.JJJJ)', multiline: true },
  { gruppe: 'Kinder', key: 'aufenthalt_kinder', label: 'Aufenthalt der Kinder (Satz)', multiline: true }
];
const KEYS = new Set(FELDER.map((f) => f.key));

const ZAHLWORT = ['keine', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'];

/* Datum des Schreibens in Berliner Zeit (Vercel läuft in UTC). */
function heute() {
  return new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ISO-Datum (aus <input type=date>) → TT.MM.JJJJ; alles andere unverändert. */
function datumDE(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (v || '');
}

function join(...parts) {
  return parts.map((p) => (p || '').toString().trim()).filter(Boolean).join(' ');
}

/* Nettoeinkommen nur übernehmen, wenn es eine Zahl ist (Spannen aus dem Wizard bleiben Hinweis). */
function betrag(v) {
  const s = String(v || '').replace(/€/g, '').trim();
  return s && /^[\d.,\s]+$/.test(s) ? s : '';
}

/* Vorbelegung aus dem gespeicherten Formular-Payload (nur Typ "antrag" liefert viel). */
function vorbelegung(anfrage) {
  const d = anfrage.daten || {};
  const k = d.kontakt || {};
  const sit = d.situation || {};
  const p = d.ehepartner || {};
  const kinder = d.kinder || {};
  const erg = d.ergaenzung || {};   // Zusatzfragen des Wizards (Anschrift, Einkommen, Kinder …)

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

  const hinweise = {};
  ['nettoeinkommen_antragsteller', 'nettoeinkommen_antragsgegner'].forEach((key) => {
    if (erg[key] && !betrag(erg[key])) hinweise[key] = 'Wizard: ' + erg[key];
  });
  if (erg.staatsangehoerigkeit && !/^deutsch\s*\/\s*deutsch$/i.test(erg.staatsangehoerigkeit)) {
    hinweise.staatsangehoerigkeit = 'Wizard: ' + erg.staatsangehoerigkeit;
  }

  const werte = {
    datum: heute(),
    wegen: 'Ehescheidung',
    antragsteller_name: join(k.vorname || anfrage.vorname, k.nachname || anfrage.nachname),
    antragsteller_anschrift: erg.anschrift || '',
    nettoeinkommen_antragsteller: betrag(erg.nettoeinkommen_antragsteller),
    antragsgegner_name: p.name || '',
    antragsgegner_anschrift: p.anschrift || '',
    nettoeinkommen_antragsgegner: betrag(erg.nettoeinkommen_antragsgegner),
    heiratsdatum: datumDE(sit.heiratsdatum),
    trennungsdatum: datumDE(sit.trennung_beginn),
    staatsangehoerigkeit: /^deutsch\s*\/\s*deutsch$/i.test(erg.staatsangehoerigkeit || '') ? 'deutsche' : '',
    gemeinsame_kinder_text: kinderText,
    kinder_liste: [erg.kind_1, erg.kind_2, erg.kind_3, erg.kind_4].filter(Boolean).join('\n'),
    aufenthalt_kinder: anzahl > 0 ? (AUFENTHALT[kinder.wohnort] || AUFENTHALT['Bei mir']) : ''
  };
  // Ausdrücklich kinderlos (Wizard-Antwort „Nein“): Kinderfelder sind nicht zutreffend
  const nichtZutreffend = kinder.vorhanden === 'Nein' ? ['kinder_liste', 'aufenthalt_kinder'] : [];
  return { werte, hinweise, nichtZutreffend };
}

/* Effektive Werte = Vorbelegung, überschrieben durch das, was im HQ gespeichert wurde. */
function effektiv(anfrage) {
  const base = vorbelegung(anfrage);
  const saved = anfrage.antrag || {};
  const werte = {};
  FELDER.forEach((f) => {
    const hat = Object.prototype.hasOwnProperty.call(saved, f.key);
    // Datum des Schreibens: ein leerer gespeicherter Wert friert es nicht ein
    if (f.key === 'datum') werte[f.key] = hat && String(saved[f.key]).trim() ? saved[f.key] : base.werte.datum;
    else werte[f.key] = hat ? saved[f.key] : (base.werte[f.key] || '');
  });
  const kinder_beweis = String(werte.kinder_liste || '').trim() ? 'Beweis: Geburtsurkunden der Kinder, Anlage 2' : '';
  return { werte, hinweise: base.hinweise, nichtZutreffend: base.nichtZutreffend, vorbelegt: base.werte, kinder_beweis };
}

/* Nimmt nur bekannte Felder an, kürzt, entfernt Steuerzeichen. */
function bereinigen(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.keys(input).forEach((key) => {
    if (!KEYS.has(key)) return;
    let v = input[key];
    if (v === null || v === undefined) v = '';
    v = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 600);
    out[key] = v;
  });
  return out;
}

module.exports = { FELDER, vorbelegung, effektiv, bereinigen };
