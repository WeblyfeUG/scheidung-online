/* ============================================================
   Scheidungsantrag (B4-5): Vorschau als Absätze aus Segmenten
   { text, quelle:'auto'|'fehlt'|'fest', feld } + Prüfhinweise und
   die Werte für die Word-Vorlage (api/_templates/antragsentwurf.docx,
   Platzhalter siehe antrag.js FELDER).
   Feldquelle: so_fragebogen.daten, Fallback Vorbelegung aus der
   Website-Anfrage (fragebogen.vorbelegung).
   ============================================================ */
const fbLib = require('./fragebogen');
const kostenLib = require('./kosten');
const { tagBerlin } = require('./store');

const ZAHLWORT = ['keine', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'];
/* Bekannte Familiengerichte (Vorschlag, im HQ editierbar) */
const GERICHTE = {
  hannover: { name: 'Amtsgericht Hannover', strasse: 'Hamburger Allee 26', ort: '30161 Hannover' }
};

const de = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : (iso || ''));
const heuteDE = () => de(tagBerlin(new Date()));

/* Zusammengeführte Angaben: Fragebogen vor Vorbelegung */
function angaben(anfrage, fbDaten) {
  return Object.assign({}, fbLib.vorbelegung(anfrage), fbDaten || {});
}

function name(d, p) { return [d[p + '_vorname'], d[p + '_nachname']].filter(Boolean).join(' '); }
function anschrift(d, p) {
  if (!d[p + '_strasse'] || !d[p + '_ort']) return '';
  return d[p + '_strasse'] + ', ' + [d[p + '_plz'], d[p + '_ort']].filter(Boolean).join(' ');
}
function staatsang(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^deutsch$/i.test(s) ? 'deutsche' : s;
}

/* Gerichtsvorschlag: Wohnort der Kinder (bei Ehepartner → dessen Ort), sonst Ehewohnung */
function gerichtVorschlag(d) {
  let ort = d.ehewhg_ort;
  if (d.kinder_vorhanden === 'Ja') {
    if (d.kinder_aufenthalt === 'Bei meinem Ehepartner') ort = d.ag_ort || ort;
    else if (d.kinder_aufenthalt === 'Bei mir') ort = d.as_ort || ort;
  }
  if (!ort) return null;
  const g = GERICHTE[String(ort).trim().toLowerCase()];
  return g || { name: 'Amtsgericht ' + String(ort).trim(), strasse: '', ort: '' };
}

function kinderListe(d) {
  if (d.kinder_vorhanden !== 'Ja') return [];
  return (Array.isArray(d.kinder) ? d.kinder : []).filter((k) => k.vorname || k.nachname);
}

function aufenthaltText(d, n) {
  const auf = d.kinder_aufenthalt;
  if (!n || !auf) return '';
  const kindWort = n === 1 ? 'Das Kind hat seinen' : 'Die Kinder haben ihren';
  const betreut = n === 1 ? 'wird von' : 'werden von';
  if (auf === 'Bei meinem Ehepartner') return `${kindWort} gewöhnlichen Aufenthalt bei der Antragsgegnerin / dem Antragsgegner und ${betreut} dieser / diesem betreut und versorgt.`;
  if (auf === 'Im Wechsel bei beiden') return `${n === 1 ? 'Das Kind wird' : 'Die Kinder werden'} im Wechselmodell von beiden Elternteilen betreut und versorgt.`;
  return `${kindWort} gewöhnlichen Aufenthalt bei der Antragstellerin / dem Antragsteller und ${betreut} dieser / diesem betreut und versorgt.`;
}

/* Alles, was Vorschau und Word brauchen */
function erstellen(anfrage, fbDaten) {
  const d = angaben(anfrage, fbDaten);
  const k = kostenLib.berechnen(kostenLib.grundlagen(anfrage, d));
  const vorschlag = gerichtVorschlag(d);
  const gericht = (anfrage.gericht || '').trim() || (vorschlag ? vorschlag.name : '');
  const gerichtDaten = GERICHTE[gericht.replace(/^Amtsgericht\s+/i, '').trim().toLowerCase()] || null;
  const kinder = kinderListe(d);
  const fehlt = [];

  const A = (label, wert, feld) => {
    const v = wert == null ? '' : String(wert).trim();
    if (!v) { fehlt.push(label); return { text: '________', quelle: 'fehlt', feld: feld || '', label }; }
    return { text: v, quelle: 'auto', feld: feld || '', label };
  };
  const P = (t) => ({ text: t, quelle: 'fest' });

  const kinderSatz = kinder.length === 0
    ? 'keine gemeinsamen minderjährigen Kinder'
    : (kinder.length === 1 ? 'ein gemeinsames minderjähriges Kind, ' : (ZAHLWORT[kinder.length] || kinder.length) + ' gemeinsame minderjährige Kinder, ') +
      kinder.map((x) => [x.vorname, x.nachname].filter(Boolean).join(' ') + (x.geburtsdatum ? ', geboren am ' + de(x.geburtsdatum) : '')).join(' und ');
  const aufKurz = d.kinder_aufenthalt === 'Bei meinem Ehepartner' ? 'bei der Antragsgegnerin / dem Antragsgegner'
    : d.kinder_aufenthalt === 'Im Wechsel bei beiden' ? 'im Wechselmodell bei beiden Elternteilen'
    : d.kinder_aufenthalt ? 'bei der Antragstellerin / dem Antragsteller' : '';
  const zustimmungText = d.zustimmung === 'Ja' ? 'hat der Scheidung zugestimmt' : d.zustimmung ? 'hat sich zur Scheidung noch nicht erklärt' : '';
  const ekAs = kostenLib.zahl(d.ek_as);
  const ekAg = kostenLib.zahl(d.ek_ag);
  const kinderVorhandenUnbekannt = d.kinder_vorhanden !== 'Ja' && d.kinder_vorhanden !== 'Nein';

  const absaetze = [
    { seg: [P('An das '), A('Gericht', gericht, 'gericht'), P(' – Familiengericht – · per beA · Hannover, den ' + heuteDE())] },
    { seg: [A('Nachname Antragsteller/in', d.as_nachname, 'as_nachname'), P(' ./. '), A('Nachname Antragsgegner/in', d.ag_nachname, 'ag_nachname'), P(' wegen Ehescheidung · Unser Zeichen: '), A('Aktenzeichen Kanzlei', anfrage.az_kanzlei, 'az_kanzlei')] },
    { fett: true, mitte: true, seg: [P('Antrag auf Ehescheidung')] },
    { seg: [P('der '), A('Name Antragsteller/in', name(d, 'as'), 'as_nachname'), P(', geb. '), A('Geburtsname Antragsteller/in', d.as_geburtsname || d.as_nachname, 'as_geburtsname'), P(', geboren am '), A('Geburtsdatum Antragsteller/in', de(d.as_geburtsdatum), 'as_geburtsdatum'), P(', '), A('Anschrift Antragsteller/in', anschrift(d, 'as'), 'as_strasse'), P(' – Antragsteller/in –')] },
    { seg: [P('Verfahrensbevollmächtigte: Rechtsanwältin Janine D. Wagner, Schiffgraben 17, 30159 Hannover')] },
    { seg: [P('gegen '), A('Name Antragsgegner/in', name(d, 'ag'), 'ag_nachname'), P(', geb. '), A('Geburtsname Antragsgegner/in', d.ag_geburtsname || d.ag_nachname, 'ag_geburtsname'), P(', geboren am '), A('Geburtsdatum Antragsgegner/in', de(d.ag_geburtsdatum), 'ag_geburtsdatum'), P(', '), A('Anschrift Antragsgegner/in', anschrift(d, 'ag'), 'ag_strasse'), P(' – Antragsgegner/in –')] },
    { seg: [P('Vorläufiger Gegenstandswert der Scheidung: '), A('Gegenstandswert Scheidung', kostenLib.eur0(k.wert_scheidung), 'kosten'), P(' · Versorgungsausgleich: '), A('Gegenstandswert Versorgungsausgleich', kostenLib.eur0(k.wert_va), 'kosten')] },
    { fett: true, seg: [P('Namens und in Vollmacht der Antragstellerin / des Antragstellers beantrage ich:')] },
    { seg: [P('1. Die am '), A('Heiratsdatum', de(d.ehe_datum), 'ehe_datum'), P(' vor dem Standesbeamten des Standesamtes in '), A('Standesamt', d.ehe_standesamt, 'ehe_standesamt'), P(' zur Heiratsregisternummer '), A('Heiratsregisternummer', d.ehe_registernr, 'ehe_registernr'), P(' geschlossene Ehe wird geschieden.')] },
    { seg: [P('2. Der Versorgungsausgleich wird durchgeführt.')] },
    { fett: true, seg: [P('Begründung')] },
    { seg: [P('Die Beteiligten haben am '), A('Heiratsdatum', de(d.ehe_datum), 'ehe_datum'), P(' die Ehe geschlossen (Beweis: Heiratsurkunde, Anlage 1). Aus der Ehe sind '),
      kinderVorhandenUnbekannt ? A('Kinder', '', 'kinder_vorhanden') : A('Kinder', kinderSatz, 'kinder_vorhanden'), P(' hervorgegangen'),
      ...(kinder.length ? [P(' (Beweis: Geburtsurkunden, Anlage 2). Die Kinder haben ihren gewöhnlichen Aufenthalt '), A('Aufenthalt der Kinder', aufKurz, 'kinder_aufenthalt'), P('. Die Zuständigkeit folgt aus § 122 Nr. 1 FamFG.')] : [P('. Die Zuständigkeit folgt aus § 122 FamFG.')])] },
    { seg: [P('Beide Beteiligte besitzen die '), A('Staatsangehörigkeit', staatsang(d.as_staatsang) ? staatsang(d.as_staatsang) + ' Staatsangehörigkeit' : '', 'as_staatsang'),
      P(d.anderweitig_anhaengig === 'Ja' ? '. Andere Familiensachen sind anhängig (§ 133 Abs. 1 Nr. 3 FamFG) – Angaben ergänzen.' : '. Andere Familiensachen sind nicht anhängig (§ 133 Abs. 1 Nr. 3 FamFG).')] },
    { seg: [P('Die Ehe ist gescheitert (§§ 1565 Abs. 1, 1566 Abs. 1 BGB). Die Beteiligten leben seit dem '), A('Trennungsdatum', de(d.trennung_datum), 'trennung_datum'), P(' getrennt. Die Antragsgegnerin / der Antragsgegner '), A('Zustimmung', zustimmungText, 'zustimmung'), P('. Unterhalt, Hausrat sowie Sorge- und Umgangsrecht sind geregelt.')] },
    { seg: [P('Die Antragstellerin / der Antragsteller verfügt über ein monatliches Nettoeinkommen von '), A('Netto Antragsteller/in', ekAs ? kostenLib.eur0(ekAs) : '', 'ek_as'), P(', die Antragsgegnerin / der Antragsgegner über '), A('Netto Antragsgegner/in', ekAg ? kostenLib.eur0(ekAg) : '', 'ek_ag'), P('. Hieraus ergibt sich der angegebene Gegenstandswert.')] },
    { seg: [P('J. D. Wagner, Rechtsanwältin – Fachanwältin für Familienrecht')] }
  ];

  const warnungen = [...new Set(fehlt)].map((f) => ({ art: 'fehlt', text: 'Fehlt: ' + f }));
  const mon = fbLib.monateSeit(d.trennung_datum, tagBerlin(new Date()));
  if (mon !== null && mon < 12) warnungen.push({ art: 'hinweis', text: 'Trennung unter einem Jahr – Begründung anpassen (Antragstellung vor Ablauf des Trennungsjahres).' });
  if (d.zustimmung && d.zustimmung !== 'Ja') warnungen.push({ art: 'hinweis', text: 'Zustimmung des Ehepartners nicht gesichert – Baustein „Zustimmung“ prüfen.' });
  if (d.kinder_vorhanden === 'Ja' && d.kinder_aufenthalt === 'Bei meinem Ehepartner') warnungen.push({ art: 'hinweis', text: 'Kinder leben beim Ehepartner – Zuständigkeit richtet sich nach dessen Wohnort.' });
  if (d.anderweitig_anhaengig === 'Ja') warnungen.push({ art: 'hinweis', text: 'Andere Familiensachen anhängig – Baustein § 133 FamFG anpassen.' });
  if (d.ag_ausland === true) warnungen.push({ art: 'hinweis', text: 'Ehepartner lebt im Ausland – internationale Zuständigkeit prüfen.' });

  /* Werte für die Word-Vorlage (Platzhalter aus antrag.js) */
  const werte = {
    gericht_name: gericht,
    gericht_strasse: gerichtDaten ? gerichtDaten.strasse : '',
    gericht_ort: gerichtDaten ? gerichtDaten.ort : '',
    datum: heuteDE(),
    aktenzeichen: anfrage.az_kanzlei || '',
    wegen: 'Ehescheidung',
    gegenstandswert_scheidung: Math.round(k.wert_scheidung).toLocaleString('de-DE'),
    gegenstandswert_versorgungsausgleich: Math.round(k.wert_va).toLocaleString('de-DE'),
    antragsteller_name: name(d, 'as'),
    antragsteller_geburtsname: d.as_geburtsname || d.as_nachname || '',
    antragsteller_geburtsdatum: de(d.as_geburtsdatum),
    antragsteller_anschrift: anschrift(d, 'as'),
    nettoeinkommen_antragsteller: ekAs ? ekAs.toLocaleString('de-DE') : '',
    antragsgegner_name: name(d, 'ag'),
    antragsgegner_geburtsname: d.ag_geburtsname || d.ag_nachname || '',
    antragsgegner_geburtsdatum: de(d.ag_geburtsdatum),
    antragsgegner_anschrift: anschrift(d, 'ag'),
    nettoeinkommen_antragsgegner: ekAg ? ekAg.toLocaleString('de-DE') : '',
    heiratsdatum: de(d.ehe_datum),
    standesamt_ort: d.ehe_standesamt || '',
    heiratsregisternummer: d.ehe_registernr || '',
    staatsangehoerigkeit: staatsang(d.as_staatsang),
    trennungsdatum: de(d.trennung_datum),
    gemeinsame_kinder_text: kinderVorhandenUnbekannt ? '' : kinder.length === 0 ? 'keine gemeinsamen Kinder' : kinder.length === 1 ? 'ein gemeinsames Kind' : (ZAHLWORT[kinder.length] || kinder.length) + ' gemeinsame Kinder',
    kinder_liste: kinder.map((x) => [x.vorname, x.nachname].filter(Boolean).join(' ') + (x.geburtsdatum ? ', geb. am ' + de(x.geburtsdatum) : '')).join('\n'),
    aufenthalt_kinder: aufenthaltText(d, kinder.length),
    kinder_beweis: kinder.length ? 'Beweis: Geburtsurkunden der Kinder, Anlage 2' : ''
  };
  const leer = kinder.length || kinderVorhandenUnbekannt ? ['kinder_beweis'] : ['kinder_liste', 'aufenthalt_kinder', 'kinder_beweis'];

  return { absaetze, warnungen, fehlt: [...new Set(fehlt)], werte, leer, gericht, gerichtVorschlag: vorschlag ? vorschlag.name : '', kosten: k, angaben: d };
}

module.exports = { erstellen, angaben, gerichtVorschlag };
