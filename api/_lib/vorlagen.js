/* ============================================================
   Vorlagen (so_vorlagen): E-Mails A1.1–A1.10 + Absage und die
   Dokumenttexte für das Mandat (DOK.*). Standardtexte im Code
   (wörtlich aus dem Design „Mandant“), Änderungen aus dem HQ (B5)
   überschreiben sie. Platzhalter {{feld}}, Sonderzeilen:
     [button: Beschriftung | {{link_…}}]   Button (entfällt ohne Link)
     [hinweis: Text]                       kleiner grauer Hinweis
     [tabelle]                             Kostentabelle (A1.5)
   ============================================================ */

const PLATZHALTER = ['as_anrede', 'as_name', 'as_vorname', 'as_nachname', 'ag_name', 'ag_nachname', 'antwortzeit', 'persoenlicher_text',
  'link_mandat', 'link_fragebogen', 'link_status', 'link_termin', 'fehlend', 'wert_scheidung', 'wert_va', 'gerichtskosten',
  'anwaltskosten', 'gesamtkosten', 'vorschuss', 'gericht', 'az_gericht', 'az_kanzlei', 'termin_datum', 'termin_uhrzeit',
  'termin_ort', 'oeffnungszeiten', 'kanzlei_telefon', 'kanzlei_email', 'ort', 'datum', 'as_anschrift', 'antwortzeit_kosten'];

const STANDARD = [
  { id: 'A1.1', name: 'Eingangsbestätigung', automatisch: true, anhang: 'checkliste',
    betreff: 'Ihre Anfrage ist bei uns eingegangen',
    text: 'Guten Tag {{as_anrede}},\n\nvielen Dank für Ihre Anfrage über scheidung-online.de. Wir prüfen Ihre Angaben persönlich und melden uns in der Regel innerhalb von {{antwortzeit}} bei Ihnen.\n\nDamit Sie schon jetzt wissen, welche Unterlagen für eine Scheidung üblicherweise gebraucht werden, finden Sie unsere Checkliste im Anhang. Sie müssen jetzt noch nichts tun.' },
  { id: 'A1.2', name: 'Mandat anbieten', automatisch: true,
    betreff: 'Ihr Mandat und Fragebogen – persönlicher Link',
    text: 'Guten Tag {{as_anrede}},\n\n{{persoenlicher_text}}\n\nÜber den folgenden Link können Sie das Mandat unterschreiben und anschließend den Fragebogen ausfüllen. Vieles ist bereits aus Ihrer Anfrage vorausgefüllt, Sie brauchen dafür etwa 15 Minuten.\n\n[button: Mandat & Fragebogen öffnen | {{link_mandat}}]\n\n[hinweis: Dieser Link ist persönlich für Sie bestimmt und 14 Tage gültig. Bitte geben Sie ihn nicht weiter.]' },
  { id: 'A1.3', name: 'Erstgespräch vorschlagen', automatisch: true,
    betreff: 'Lassen Sie uns kurz sprechen',
    text: 'Guten Tag {{as_anrede}},\n\n{{persoenlicher_text}}\n\nWählen Sie einfach einen Termin für ein Telefonat von etwa 20 Minuten. Alternativ rufen wir Sie gern zurück: Antworten Sie dazu kurz auf diese E-Mail mit Ihrer Telefonnummer und einer passenden Zeit. Sie erreichen uns auch telefonisch unter {{kanzlei_telefon}} ({{oeffnungszeiten}}).\n\n[button: Termin wählen | {{link_termin}}]' },
  { id: 'A1.4', name: 'Erinnerung', automatisch: true,
    betreff: 'Es fehlt noch etwas für Ihren Scheidungsantrag',
    text: 'Guten Tag {{as_anrede}},\n\nvor einigen Tagen haben wir Ihnen den Link zu Mandat und Fragebogen gesendet. Damit wir Ihren Antrag vorbereiten können, fehlt noch:\n\n{{fehlend}}\n\nSie können jederzeit genau dort weitermachen, wo Sie aufgehört haben.\n\n[button: Weitermachen | {{link_mandat}}]' },
  { id: 'A1.5', name: 'Kostenübersicht', automatisch: false,
    betreff: 'Ihre voraussichtlichen Kosten – eine Orientierung',
    text: 'Guten Tag {{as_anrede}},\n\n{{persoenlicher_text}}\n\nGrundlage ist der Gegenstandswert, der sich aus dem dreifachen gemeinsamen Nettoeinkommen und den Rentenanrechten ergibt.\n\n[tabelle]\n\n[hinweis: Unverbindliche Orientierung nach RVG und FamGKG. Die endgültige Festsetzung nimmt das Gericht vor. Bei geringem Einkommen kann Verfahrenskostenhilfe in Betracht kommen – sprechen Sie uns gern an.]' },
  { id: 'A1.6', name: 'Vorschussrechnung', automatisch: false,
    betreff: 'Ihre Vorschussrechnung',
    text: 'Guten Tag {{as_anrede}},\n\nanbei erhalten Sie unsere Vorschussrechnung für Ihr Scheidungsverfahren. Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das angegebene Konto.\n\nSobald der Vorschuss eingegangen ist, reichen wir den Scheidungsantrag beim Familiengericht ein.' },
  { id: 'A1.7', name: 'Antrag eingereicht', automatisch: true,
    betreff: 'Ihr Scheidungsantrag ist eingereicht',
    text: 'Guten Tag {{as_anrede}},\n\nheute habe ich Ihren Scheidungsantrag beim {{gericht}} – Familiengericht – eingereicht. Das Aktenzeichen des Gerichts lautet {{az_gericht}}.\n\nSo geht es weiter: Das Gericht fordert zunächst den Gerichtskostenvorschuss an. Außerdem erhalten Sie und Ihr Ehepartner vom Gericht den Fragebogen zum Versorgungsausgleich. Bitte füllen Sie ihn zügig aus – bei Fragen helfen wir gern.\n\n[button: Stand Ihres Verfahrens | {{link_status}}]' },
  { id: 'A1.8', name: 'Vorbereitung Gerichtstermin', automatisch: true,
    betreff: 'Ihr Gerichtstermin am {{termin_datum}}',
    text: 'Guten Tag {{as_anrede}},\n\ndas Familiengericht hat den Termin zur Scheidung festgesetzt:\n\n{{termin_datum}}, {{termin_uhrzeit}} Uhr\n{{termin_ort}}\n\nBitte bringen Sie Ihren Personalausweis mit. Wenn Sie im Ausland geheiratet haben, bitte auch die Original-Heiratsurkunde. Der Termin dauert meist nur 10 bis 15 Minuten, und ich bin an Ihrer Seite.\n\n[hinweis: Ein kurzes Telefonat zur Vorbereitung bieten wir Ihnen in der Woche vor dem Termin an.]\n\n[button: Stand Ihres Verfahrens | {{link_status}}]' },
  { id: 'A1.9', name: 'Scheidung rechtskräftig', automatisch: true,
    betreff: 'Ihre Scheidung ist rechtskräftig',
    text: 'Guten Tag {{as_anrede}},\n\nder Scheidungsbeschluss ist seit heute rechtskräftig. Damit ist Ihr Verfahren abgeschlossen.\n\nDen Beschluss mit Rechtskraftvermerk erhalten Sie in den nächsten Tagen per Post. Bewahren Sie ihn gut auf – Sie brauchen ihn zum Beispiel beim Standesamt oder bei der Rentenversicherung.\n\nIch wünsche Ihnen für den neuen Abschnitt alles Gute.' },
  { id: 'A1.10', name: 'Infoschreiben Ehepartner', automatisch: false,
    betreff: 'Information zum Scheidungsverfahren',
    text: 'Guten Tag,\n\nIhr Ehepartner hat mich mit der Durchführung der Ehescheidung beauftragt. Mit dieser Nachricht möchte ich Ihnen kurz erklären, was das für Sie bedeutet.\n\nBei einer einvernehmlichen Scheidung brauchen Sie keinen eigenen Anwalt. Sie können der Scheidung im Gerichtstermin selbst zustimmen; nur wer eigene Anträge stellen möchte, benötigt eine anwaltliche Vertretung.\n\nBitte beachten Sie: Ich vertrete ausschließlich die antragstellende Person und kann Sie nicht beraten. Bei Fragen zu Ihren Rechten wenden Sie sich bitte an eine Anwältin oder einen Anwalt Ihres Vertrauens.' },
  { id: 'A1.abs', name: 'Absage', automatisch: true,
    betreff: 'Ihre Anfrage bei Scheidung-Online',
    text: 'Guten Tag {{as_anrede}},\n\n{{persoenlicher_text}}' },
  { id: 'A1.mand', name: 'Bestätigung Mandat (intern ausgelöst)', automatisch: true, anhang: 'mandat_pdf',
    betreff: 'Ihr Mandat ist erteilt – Ihre Dokumente',
    text: 'Guten Tag {{as_anrede}},\n\nvielen Dank für Ihr Vertrauen. Ihr Mandat ist erteilt; die unterschriebenen Dokumente finden Sie im Anhang.\n\nIm nächsten Schritt füllen Sie bitte den Fragebogen aus. Vieles ist bereits vorausgefüllt.\n\n[button: Fragebogen öffnen | {{link_fragebogen}}]\n\n[hinweis: Sie können Ihr Mandat innerhalb von 14 Tagen widerrufen. Einzelheiten stehen in der Widerrufsbelehrung im Anhang.]' },
  { id: 'A1.weiter', name: 'Link zum Weitermachen', automatisch: true,
    betreff: 'Ihr Link zum Weitermachen',
    text: 'Guten Tag {{as_anrede}},\n\nwie gewünscht erhalten Sie Ihren persönlichen Link. Damit können Sie jederzeit genau dort weitermachen, wo Sie aufgehört haben.\n\n[button: Weitermachen | {{link_fragebogen}}]\n\n[hinweis: Dieser Link ist persönlich für Sie bestimmt und 14 Tage gültig.]' },

  /* Dokumenttexte für „Mandat erteilen“ (A2). Leerer Text = Platzhalter „Text folgt von der Kanzlei“. */
  { id: 'DOK.auftrag', name: 'Auftrag zur Durchführung der Ehescheidung und Vollmacht', dokument: true,
    betreff: '', text: 'Hiermit beauftrage ich Frau Rechtsanwältin Janine D. Wagner, Schiffgraben 17, 30159 Hannover, in Sachen {{as_nachname}} ./. {{ag_nachname}} mit der Durchführung meiner Ehescheidung und erteile ihr Vollmacht zu meiner außergerichtlichen und gerichtlichen Vertretung. Diese Vollmacht erstreckt sich insbesondere auf die Antragstellung in Scheidungs- und Scheidungsfolgesachen, auf den Abschluss von Vereinbarungen über die Scheidungsfolgen, sowie auf die Stellung von Anträgen auf Erteilung von Renten- und sonstigen Versorgungsauskünften.\n\nDie beiliegende Widerrufsbelehrung habe ich zur Kenntnis genommen.\n\nIch kann den Scheidungsantrag auch nach Ablauf der Widerrufsfrist jederzeit zurückziehen und den Auftrag zur Durchführung der Ehescheidung kündigen.' },
  { id: 'DOK.widerruf', name: 'Widerrufsbelehrung und Muster-Widerrufsformular', dokument: true, betreff: '', text: '' },
  { id: 'DOK.gebuehren', name: 'Hinweis zur Abrechnung nach Gegenstandswert (§ 49b Abs. 5 BRAO)', dokument: true, betreff: '', text: '' },
  { id: 'DOK.datenschutz', name: 'Datenschutzhinweise', dokument: true, betreff: '',
    text: 'Wir verarbeiten Ihre Daten ausschließlich zur Bearbeitung Ihres Mandats. Die vollständigen Datenschutzhinweise finden Sie unter scheidung-online.de/datenschutz.' }
];
const MANDAT_DOKUMENTE = ['DOK.auftrag', 'DOK.widerruf', 'DOK.gebuehren', 'DOK.datenschutz'];

/* Standard + gespeicherte Änderungen */
function zusammenfuehren(zeilen) {
  const map = new Map((zeilen || []).map((z) => [z.id, z]));
  return STANDARD.map((s) => {
    const z = map.get(s.id);
    if (!z) return Object.assign({}, s, { geaendert: false });
    return Object.assign({}, s, {
      betreff: typeof z.betreff === 'string' && !s.dokument ? z.betreff : s.betreff,
      text: typeof z.text === 'string' ? z.text : s.text,
      automatisch: typeof z.automatisch === 'boolean' ? z.automatisch : s.automatisch,
      geaendert: true, aktualisiert_am: z.aktualisiert_am, aktualisiert_von: z.aktualisiert_von
    });
  });
}

async function laden(store) {
  try { return zusammenfuehren(await store.rows('so_vorlagen', { limit: 100 })); }
  catch (e) { console.error('[vorlagen] Laden fehlgeschlagen, Standardtexte:', e.message); return zusammenfuehren([]); }
}

/* Unbekannte Platzhalter finden (Speichern in B5 verhindert sie) */
function unbekanntePlatzhalter(text) {
  const out = [];
  String(text || '').replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, k) => { if (!PLATZHALTER.includes(k)) out.push(k); return m; });
  return [...new Set(out)];
}

function fuellen(text, werte) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (werte[k] != null ? String(werte[k]) : ''));
}

/* Text → Blöcke {art:'absatz'|'button'|'hinweis'|'tabelle', …}. Buttons ohne Link entfallen. */
function bloecke(text, werte) {
  const out = [];
  String(text || '').split(/\n\s*\n/).forEach((roh) => {
    const p = roh.replace(/^\n+|\n+$/g, '');
    if (!p.trim()) return;
    let m = /^\[button:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]$/.exec(p.trim());
    if (m) {
      const href = fuellen(m[2], werte).trim();
      if (href) out.push({ art: 'button', text: fuellen(m[1], werte), href });
      return;
    }
    m = /^\[hinweis:\s*([\s\S]+?)\s*\]$/.exec(p.trim());
    if (m) { out.push({ art: 'hinweis', text: fuellen(m[1], werte) }); return; }
    if (p.trim() === '[tabelle]') { out.push({ art: 'tabelle' }); return; }
    const t = fuellen(p, werte);
    if (t.trim()) out.push({ art: 'absatz', text: t });
  });
  return out;
}

module.exports = { STANDARD, PLATZHALTER, MANDAT_DOKUMENTE, laden, zusammenfuehren, unbekanntePlatzhalter, fuellen, bloecke };
