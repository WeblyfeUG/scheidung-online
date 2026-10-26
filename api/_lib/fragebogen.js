/* ============================================================
   Fragebogen (A3): Felder der sieben Schritte, Vorbelegung aus der
   Website-Anfrage, serverseitige Bereinigung/Validierung je Schritt,
   Hinweise (blockieren nie) und fehlende Unterlagen.
   Gespeichert in so_fragebogen.daten (ein Datensatz je Anfrage).
   ============================================================ */
const guard = require('../../form-guard.js');
const { saeubern } = require('./http');
const { tagBerlin } = require('./store');

const JA_NEIN = ['Ja', 'Nein'];
/* typ: text | date | email | tel | plz | check | wahl | zahl */
const FELDER = {
  as_vorname: { typ: 'text', label: 'Vorname', schritt: 1, pflicht: true },
  as_nachname: { typ: 'text', label: 'Nachname', schritt: 1, pflicht: true },
  as_geburtsname: { typ: 'text', label: 'Geburtsname', schritt: 1 },
  as_geburtsdatum: { typ: 'date', label: 'Geburtsdatum', schritt: 1 },
  as_staatsang: { typ: 'text', label: 'Staatsangehörigkeit', schritt: 1 },
  as_strasse: { typ: 'text', label: 'Straße und Hausnummer', schritt: 1 },
  as_plz: { typ: 'plz', label: 'PLZ', schritt: 1 },
  as_ort: { typ: 'text', label: 'Ort', schritt: 1 },
  as_telefon: { typ: 'tel', label: 'Telefon', schritt: 1 },
  as_email: { typ: 'email', label: 'E-Mail', schritt: 1, pflicht: true },
  ag_vorname: { typ: 'text', label: 'Vorname', schritt: 2, pflicht: true },
  ag_nachname: { typ: 'text', label: 'Nachname', schritt: 2, pflicht: true },
  ag_geburtsname: { typ: 'text', label: 'Geburtsname', schritt: 2 },
  ag_geburtsdatum: { typ: 'date', label: 'Geburtsdatum', schritt: 2 },
  ag_staatsang: { typ: 'text', label: 'Staatsangehörigkeit', schritt: 2 },
  ag_strasse: { typ: 'text', label: 'Straße und Hausnummer', schritt: 2 },
  ag_plz: { typ: 'text', label: 'PLZ', schritt: 2 },
  ag_ort: { typ: 'text', label: 'Ort', schritt: 2 },
  ag_ausland: { typ: 'check', label: 'Ehepartner lebt im Ausland', schritt: 2 },
  ehe_datum: { typ: 'date', label: 'Heiratsdatum', schritt: 3, pflicht: true },
  ehe_standesamt: { typ: 'text', label: 'Standesamt (Ort)', schritt: 3 },
  ehe_registernr: { typ: 'text', label: 'Heiratsregisternummer', schritt: 3 },
  trennung_datum: { typ: 'date', label: 'Getrennt seit', schritt: 3, pflicht: true },
  ehewhg_plz: { typ: 'plz', label: 'Ehewohnung PLZ', schritt: 3, pflicht: true },
  ehewhg_ort: { typ: 'text', label: 'Ehewohnung Ort', schritt: 3, pflicht: true },
  ehewhg_noch_bewohnt: { typ: 'wahl', label: 'Wohnt noch jemand in der Ehewohnung?', schritt: 3, optionen: ['Ja, ich', 'Ja, mein Ehepartner', 'Nein, niemand'] },
  kinder_vorhanden: { typ: 'wahl', label: 'Gemeinsame minderjährige Kinder', schritt: 4, pflicht: true, optionen: JA_NEIN },
  kinder_aufenthalt: { typ: 'wahl', label: 'Aufenthalt der Kinder', schritt: 4, optionen: ['Bei mir', 'Bei meinem Ehepartner', 'Im Wechsel bei beiden'] },
  zustimmung: { typ: 'wahl', label: 'Zustimmung Ehepartner', schritt: 5, pflicht: true, optionen: ['Ja', 'Wahrscheinlich', 'Nein', 'Unklar'] },
  fs_unterhalt: { typ: 'wahl', label: 'Unterhalt geklärt', schritt: 5, optionen: ['Ja', 'Nein', 'Nicht relevant'] },
  fs_hausrat: { typ: 'wahl', label: 'Hausrat aufgeteilt', schritt: 5, optionen: JA_NEIN },
  fs_sorge: { typ: 'wahl', label: 'Sorge/Umgang einvernehmlich', schritt: 5, optionen: ['Ja', 'Nein', 'Keine Kinder'] },
  anderweitig_anhaengig: { typ: 'wahl', label: 'Andere Familiensachen anhängig', schritt: 5, optionen: ['Nein', 'Ja'] },
  ehevertrag: { typ: 'wahl', label: 'Ehevertrag', schritt: 5, optionen: ['Nein', 'Ja'] },
  ek_as: { typ: 'zahl', label: 'Netto Antragsteller/in (€)', schritt: 6 },
  ek_ag: { typ: 'zahl', label: 'Netto Antragsgegner/in (€)', schritt: 6 },
  vkh: { typ: 'wahl', label: 'Verfahrenskostenhilfe', schritt: 6, optionen: ['Nein', 'Ja, bitte prüfen'] }
};
const ANRECHT_ARTEN = { gesetzlich: 'Gesetzliche Rentenversicherung', beamte: 'Beamtenversorgung', betrieb: 'Betriebsrente', privat: 'Private Rentenversicherung', berufsstaendisch: 'Berufsständisches Versorgungswerk' };
const SCHRITTE = ['Ihre Person', 'Ihr Ehepartner', 'Ihre Ehe', 'Kinder', 'Einigung & Folgesachen', 'Einkommen & Altersvorsorge', 'Prüfen & absenden'];
/* Gruppen für HQ B4-2 (wie FBG im Design) */
const GRUPPEN = [
  ['Antragsteller/in', ['as_vorname', 'as_nachname', 'as_geburtsname', 'as_geburtsdatum', 'as_staatsang', 'as_strasse', 'as_plz', 'as_ort', 'as_telefon', 'as_email']],
  ['Antragsgegner/in', ['ag_vorname', 'ag_nachname', 'ag_geburtsname', 'ag_geburtsdatum', 'ag_staatsang', 'ag_strasse', 'ag_plz', 'ag_ort', 'ag_ausland']],
  ['Ehe', ['ehe_datum', 'ehe_standesamt', 'ehe_registernr', 'trennung_datum', 'ehewhg_plz', 'ehewhg_ort', 'ehewhg_noch_bewohnt']],
  ['Kinder', ['kinder_vorhanden', 'kinder_aufenthalt']],
  ['Einigung & Folgesachen', ['zustimmung', 'fs_unterhalt', 'fs_hausrat', 'fs_sorge', 'anderweitig_anhaengig', 'ehevertrag']],
  ['Einkommen & Altersvorsorge', ['ek_as', 'ek_ag', 'vkh']]
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function datumGueltig(s) {
  if (!ISO.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= '2100-12-31';
}
/* "TT.MM.JJJJ" → ISO, ISO bleibt */
function isoAus(v) {
  const s = String(v || '').trim();
  if (datumGueltig(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) { const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return datumGueltig(iso) ? iso : ''; }
  return '';
}
function betrag(v) {
  const s = String(v == null ? '' : v).replace(/€|\s/g, '');
  return /^\d{1,7}([.,]\d{3})*([.,]\d{1,2})?$/.test(s) ? s : '';
}

/* "Musterstraße 1, 30159 Hannover" → { strasse, plz, ort } */
function anschriftZerlegen(s) {
  const t = String(s || '').trim();
  const m = /^(.*?)[,\s]+(\d{4,5})\s+(.+)$/.exec(t);
  if (m) return { strasse: m[1].replace(/,\s*$/, '').trim(), plz: m[2], ort: m[3].trim() };
  return { strasse: t, plz: '', ort: '' };
}
function nameZerlegen(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  const i = t.lastIndexOf(' ');
  return i > 0 ? { vorname: t.slice(0, i), nachname: t.slice(i + 1) } : { vorname: '', nachname: t };
}

/* Vorbelegung aus der Website-Anfrage (Badge „aus Ihrer Anfrage, bitte prüfen“) */
function vorbelegung(anfrage) {
  const d = anfrage.daten || {};
  const k = d.kontakt || {};
  const sit = d.situation || {};
  const p = d.ehepartner || {};
  const ki = d.kinder || {};
  const sch = d.scheidung || {};
  const erg = d.ergaenzung || {};
  const v = {};
  const setze = (key, wert) => { if (wert !== undefined && wert !== null && String(wert).trim() !== '') v[key] = typeof wert === 'string' ? wert.trim() : wert; };
  setze('as_vorname', k.vorname || anfrage.vorname);
  setze('as_nachname', k.nachname || anfrage.nachname);
  setze('as_email', k.email || anfrage.email);
  setze('as_telefon', k.telefon || anfrage.telefon);
  if (erg.anschrift) { const a = anschriftZerlegen(erg.anschrift); setze('as_strasse', a.strasse); setze('as_plz', a.plz); setze('as_ort', a.ort); }
  if (erg.staatsangehoerigkeit) {
    const teile = erg.staatsangehoerigkeit.split('/').map((x) => x.trim());
    setze('as_staatsang', teile[0]); setze('ag_staatsang', teile[1]);
  }
  if (p.name) { const n = nameZerlegen(p.name); setze('ag_vorname', n.vorname); setze('ag_nachname', n.nachname); }
  if (p.anschrift) { const a = anschriftZerlegen(p.anschrift); setze('ag_strasse', a.strasse); setze('ag_plz', a.plz); setze('ag_ort', a.ort); }
  setze('ehe_datum', isoAus(sit.heiratsdatum));
  setze('trennung_datum', isoAus(sit.trennung_beginn));
  setze('ehewhg_plz', sit.ehewohnung_plz);
  setze('ehewhg_ort', sit.ehewohnung_ort);
  if (ki.vorhanden === 'Ja' || ki.vorhanden === 'Nein') setze('kinder_vorhanden', ki.vorhanden);
  const AUF = { 'Bei mir': 'Bei mir', 'Beim anderen Elternteil': 'Bei meinem Ehepartner', 'Im Wechsel bei beiden': 'Im Wechsel bei beiden' };
  setze('kinder_aufenthalt', AUF[ki.wohnort]);
  const kinder = [erg.kind_1, erg.kind_2, erg.kind_3, erg.kind_4].filter(Boolean).map((s) => {
    const m = /^(.*?),?\s*geb\. am (\d{2}\.\d{2}\.\d{4})$/.exec(s);
    const n = nameZerlegen(m ? m[1] : s);
    return { vorname: n.vorname || n.nachname, nachname: n.vorname ? n.nachname : '', geburtsdatum: m ? isoAus(m[2]) : '' };
  });
  if (kinder.length) v.kinder = kinder;
  if (sch.einvernehmlich === 'Ja') setze('zustimmung', 'Ja');
  else if (sch.einvernehmlich === 'Nein') setze('zustimmung', 'Nein');
  else if (sch.einvernehmlich === 'Noch nicht sicher') setze('zustimmung', 'Unklar');
  if (erg.ehevertrag === 'Ja' || erg.ehevertrag === 'Nein') setze('ehevertrag', erg.ehevertrag);
  setze('ek_as', betrag(erg.nettoeinkommen_antragsteller));
  setze('ek_ag', betrag(erg.nettoeinkommen_antragsgegner));
  return v;
}

/* Eingaben bereinigen: nur bekannte Felder, Typprüfung. Ungültiges wird verworfen und gemeldet. */
function bereinigen(eingabe) {
  const daten = {};
  const fehler = {};
  if (!eingabe || typeof eingabe !== 'object' || Array.isArray(eingabe)) return { daten, fehler };
  Object.keys(FELDER).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(eingabe, key)) return;
    const f = FELDER[key];
    let v = eingabe[key];
    if (f.typ === 'check') { daten[key] = v === true; return; }
    if (v === null || v === undefined) v = '';
    if (typeof v !== 'string' && typeof v !== 'number') { fehler[key] = 'ungueltig'; return; }
    v = saeubern(String(v)).trim().slice(0, 200);
    if (v === '') { daten[key] = ''; return; }
    if (f.typ === 'date') { if (!datumGueltig(v)) { fehler[key] = 'datum'; return; } }
    else if (f.typ === 'email') { if (guard.check('email', v) !== '') { fehler[key] = 'email'; return; } }
    else if (f.typ === 'tel') { if (guard.check('phone', v) !== '') { fehler[key] = 'telefon'; return; } }
    else if (f.typ === 'plz') { if (!/^\d{5}$/.test(v)) { fehler[key] = 'plz'; return; } }
    else if (f.typ === 'zahl') { if (!betrag(v)) { fehler[key] = 'betrag'; return; } }
    else if (f.typ === 'wahl') { if (!f.optionen.includes(v)) { fehler[key] = 'auswahl'; return; } }
    daten[key] = v;
  });
  if (Object.prototype.hasOwnProperty.call(eingabe, 'kinder')) {
    const liste = Array.isArray(eingabe.kinder) ? eingabe.kinder.slice(0, 10) : [];
    daten.kinder = liste.filter((k) => k && typeof k === 'object').map((k) => ({
      vorname: saeubern(k.vorname || '').trim().slice(0, 100),
      nachname: saeubern(k.nachname || '').trim().slice(0, 100),
      geburtsdatum: datumGueltig(String(k.geburtsdatum || '')) ? k.geburtsdatum : ''
    }));
  }
  if (Object.prototype.hasOwnProperty.call(eingabe, 'anrechte')) {
    const liste = Array.isArray(eingabe.anrechte) ? eingabe.anrechte.slice(0, 15) : [];
    daten.anrechte = liste.filter((r) => r && typeof r === 'object').map((r) => ({
      art: ANRECHT_ARTEN[r.art] ? r.art : 'gesetzlich',
      traeger: saeubern(r.traeger || '').trim().slice(0, 120),
      nummer: saeubern(r.nummer || '').trim().slice(0, 60),
      inhaber: r.inhaber === 'ehepartner' ? 'ehepartner' : 'ich'
    }));
  }
  return { daten, fehler };
}

const leer = (v) => v === undefined || v === null || String(v).trim() === '';

/* Fehlende Pflichtfelder eines Schritts (1–6) */
function fehlendeFelder(daten, schritt) {
  return Object.keys(FELDER).filter((k) => FELDER[k].pflicht && FELDER[k].schritt === schritt && leer(daten[k]));
}
function fehlendeAlle(daten) {
  const out = [];
  for (let s = 1; s <= 6; s++) out.push(...fehlendeFelder(daten, s));
  return out;
}

/* Monate zwischen zwei ISO-Daten (ganzzahlig, abgerundet) */
function monateSeit(iso, heute) {
  if (!datumGueltig(iso || '')) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const [hy, hm, hd] = heute.split('-').map(Number);
  return (hy - y) * 12 + (hm - m) - (hd < d ? 1 : 0);
}

/* Hinweise je Schritt (Texte wörtlich aus dem Design) */
function hinweise(daten) {
  const out = [];
  const persoenlich = 'Wir besprechen das persönlich mit Ihnen. Sie können den Fragebogen trotzdem abschließen.';
  if (['Nein', 'Unklar'].includes(daten.zustimmung) || daten.fs_unterhalt === 'Nein' || daten.fs_hausrat === 'Nein' || daten.fs_sorge === 'Nein') {
    out.push({ schritt: 5, art: 'persoenlich', text: persoenlich });
  }
  const mon = monateSeit(daten.trennung_datum, tagBerlin(new Date()));
  if (mon !== null && mon < 10) out.push({ schritt: 3, art: 'trennung', text: 'Der Antrag kann in der Regel erst nach etwa 10 Monaten Trennung gestellt werden. Wir melden uns zum richtigen Zeitpunkt.' });
  if (daten.ag_ausland === true) out.push({ schritt: 2, art: 'ausland', text: 'Ihr Ehepartner lebt im Ausland. Hier klären wir die Zuständigkeit persönlich mit Ihnen.' });
  return out;
}

/* Unterlagen: was fehlt noch? (Status-Seite, Checkliste B4-1, Erinnerung A1.4) */
function fehlendeUnterlagen(daten, dokumente) {
  const hat = (art) => (dokumente || []).some((d) => d.art === art);
  const out = [];
  if (!hat('heiratsurkunde')) out.push({ art: 'heiratsurkunde', label: 'Heiratsurkunde' });
  if (daten && daten.kinder_vorhanden === 'Ja' && !hat('geburtsurkunde')) out.push({ art: 'geburtsurkunde', label: 'Geburtsurkunden der Kinder' });
  if (daten && daten.ehevertrag === 'Ja' && !hat('ehevertrag')) out.push({ art: 'ehevertrag', label: 'Ehevertrag' });
  return out;
}

/* Lesbarer Wert für Zusammenfassung/HQ */
function anzeige(key, v) {
  const f = FELDER[key];
  if (!f) return String(v == null ? '' : v);
  if (f.typ === 'check') return v ? 'Ja' : 'Nein';
  if (f.typ === 'date' && ISO.test(v || '')) return v.split('-').reverse().join('.');
  return String(v == null ? '' : v);
}

module.exports = { FELDER, SCHRITTE, GRUPPEN, ANRECHT_ARTEN, vorbelegung, bereinigen, fehlendeFelder, fehlendeAlle, hinweise, fehlendeUnterlagen, anzeige, monateSeit, datumGueltig, isoAus, betrag };
